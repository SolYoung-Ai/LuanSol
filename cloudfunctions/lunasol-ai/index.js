/* LunaSol AI 后台代理（CloudBase HTTP 云函数 / Node.js 18）
 * ------------------------------------------------------------
 * 职责：把前端 OpenAI 兼容的 chat/completions 请求转发给 DeepSeek。
 * 厂商密钥 DEEPSEEK_API_KEY 只保存在云函数环境变量，绝不进入前端源码、
 * Git 仓库、日志或响应体。前端只持有公开的网关地址与代理令牌。
 *
 * 安全约束：
 *  - 不回显 req.headers / process.env / x-cloudbase-context；
 *  - 上游错误只透传精简后的 error.message；
 *  - 模型名由后台白名单决定，前端不能随意指定；
 *  - 需要 X-LunaSol-Token 与后台 LUNASOL_PROXY_TOKEN 一致；
 *  - 不支持图像生成，明确返回 501，前端如实回退，不伪造 AI 结果。
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

// 积分校验暂时用前端兜底，云函数端用频率限制和全局上限兜底
// 后续再接入云函数端积分校验

// 体验版环境无法通过管理 API 追加环境安全域名，所以这里用后台环境变量维护
// 一份独立的 CORS 来源白名单（只放可信站点 origin，不回显任意 Origin）。
// 本路由的网关不注入 Access-Control-Allow-Origin，因此不会出现双重值。
const MAX_BODY_BYTES = 256 * 1024;
// 图像路由要装下参考图 base64，单独放宽
const MAX_IMAGE_BODY_BYTES = 6 * 1024 * 1024;

function allowedOrigins() {
  return String(process.env.LUNASOL_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function corsHeaders(req) {
  const origin = String(req.headers.origin || '').trim().replace(/\/+$/, '');
  if (origin && allowedOrigins().includes(origin)) {
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  }
  return {};
}

/* ---------- 滥用防护（2026-11-06 追加） ----------
 * 代理令牌随前端 JS 公开，任何人都能提取后直连本函数，所以令牌不是唯一门槛：
 *  1) 来源校验：只接受 Origin 落在白名单内的浏览器请求（LUNASOL_REQUIRE_ORIGIN=0 可关）；
 *  2) 单 IP 频率限制：LUNASOL_RATE_PER_MINUTE，默认 30 次/分钟；
 *  3) 每日全局上限：LUNASOL_DAILY_LIMIT，默认 2000 次/日，作为成本熔断。
 * 计数只存在于进程内存，用于挡滥用与兜底；精确的会员额度仍由前端订阅表在服务端扣减。
 */
const RATE_PER_MINUTE = Math.max(1, Number(process.env.LUNASOL_RATE_PER_MINUTE || 30));
const DAILY_LIMIT = Math.max(1, Number(process.env.LUNASOL_DAILY_LIMIT || 2000));
const REQUIRE_ORIGIN = String(process.env.LUNASOL_REQUIRE_ORIGIN ?? '1') !== '0';

const rateBuckets = new Map();
let dayStamp = new Date().toISOString().slice(0, 10);
let dayUsed = 0;

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String(req.headers['x-real-ip'] || '').trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function rollDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayStamp) { dayStamp = today; dayUsed = 0; }
}

function guard(req) {
  const origin = String(req.headers.origin || '').trim().replace(/\/+$/, '');
  if (REQUIRE_ORIGIN && !allowedOrigins().includes(origin)) {
    return { status: 403, message: '来源不受信任：只能从站点页面调用' };
  }
  // 登录态校验：必须有 CloudBase 注入的 uid，未登录直接拒绝
  const uid = String(req.headers['x-cloudbase-uid'] || '').trim();
  if (!uid) {
    return { status: 401, message: '请先登录后再使用 AI 功能' };
  }
  rollDay();
  if (dayUsed >= DAILY_LIMIT) {
    return { status: 429, message: '今日 AI 调用已达上限，请明天再试' };
  }
  const ip = clientIp(req);
  const now = Date.now();
  const b = rateBuckets.get(ip) || { start: now, count: 0 };
  if (now - b.start >= 60000) { b.start = now; b.count = 0; }
  if (b.count >= RATE_PER_MINUTE) {
    rateBuckets.set(ip, b);
    return { status: 429, message: '请求太频繁，请稍后再试' };
  }
  b.count += 1;
  rateBuckets.set(ip, b);
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) { if (now - v.start >= 120000) rateBuckets.delete(k); }
  }
  return { ok: true };
}

const ALLOWED_MODELS = new Set([
  'deepseek-chat',
  'deepseek-reasoner',
  'deepseek-flash',
  // 方舟文本模型（前端选 tier 名，后台映射到真实模型 ID）
  'kimi-k3.1',
  'doubao-seed-pro',
  'doubao-seed-lite',
  'doubao-seed-turbo',
  'glm-5.3',
]);

/** 前端 tier 名 → 方舟真实模型 ID */
const ARK_MODEL_MAP = {
  'kimi-k3.1': 'kimi-k3-1-pro-261024',
  'doubao-seed-pro': 'doubao-seed-2-1-pro-260915',
  'doubao-seed-lite': 'doubao-seed-2-1-lite-260915',
  'doubao-seed-turbo': 'doubao-seed-2-1-turbo-260915',
  'glm-5.3': 'glm-5-3-flash-20250821',
};

// res 是每次请求独立的对象，把该请求的 CORS 头挂在它上面，避免并发串扰
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(res.cors || {}),
  });
  res.end(JSON.stringify(data));
}

function sendOptions(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-LunaSol-Token, X-CloudBase-Uid',
    'Access-Control-Max-Age': '600',
    ...(res.cors || {}),
  });
  res.end();
}

function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function clampNumber(v, fallback, min, max) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

/** 只把允许字段透传给 DeepSeek，避免前端注入任意上游参数。 */
function buildUpstreamPayload(body, withJsonFormat) {
  const messages = Array.isArray(body.messages)
    ? body.messages
      .filter((m) => m && (m.role === 'system' || m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 24000) }))
      .slice(-20)
    : [];
  const wanted = typeof body.model === 'string' ? body.model.trim() : '';
  const model = ALLOWED_MODELS.has(wanted)
    ? wanted
    : (process.env.DEEPSEEK_MODEL || 'deepseek-chat');
  const payload = {
    model,
    messages,
    max_tokens: Math.round(clampNumber(body.max_tokens, 2048, 1, 4096)),
    stream: false,
  };
  // deepseek-reasoner 不支持 temperature / response_format 等采样参数，强行传会 400
  if (model !== 'deepseek-reasoner') {
    payload.temperature = clampNumber(body.temperature, 0.7, 0, 2);
    if (withJsonFormat) payload.response_format = { type: 'json_object' };
  }
  return payload;
}

function callDeepSeek(payload) {
  return new Promise((resolve, reject) => {
    const base = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
    const target = new URL(base + '/chat/completions');
    const data = JSON.stringify(payload);
    const req = https.request(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY || ''}`,
        'Content-Length': Buffer.byteLength(data),
      },
    }, (upstream) => {
      let raw = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (c) => { raw += c; });
      upstream.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { /* 交给下面统一处理 */ }
        resolve({ status: upstream.statusCode || 502, json: parsed, raw: raw.slice(0, 1000) });
      });
    });
    req.setTimeout(55000, () => req.destroy(new Error('模型服务超时')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/** 转发文本对话到火山引擎方舟（Kimi / Doubao / GLM） */
function callArkChat(payload) {
  return new Promise((resolve, reject) => {
    const base = 'https://ark.cn-beijing.volces.com/api/v3';
    const target = new URL(base + '/chat/completions');
    const data = JSON.stringify(payload);
    const req = https.request(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.SEEDREAM_API_KEY || ''}`,
        'Content-Length': Buffer.byteLength(data),
      },
    }, (upstream) => {
      let raw = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (c) => { raw += c; });
      upstream.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { /* */ }
        resolve({ status: upstream.statusCode || 502, json: parsed, raw: raw.slice(0, 1000) });
      });
    });
    req.setTimeout(55000, () => req.destroy(new Error('模型服务超时')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function safeUpstreamError(r) {
  const msg = r.json && r.json.error && typeof r.json.error.message === 'string'
    ? r.json.error.message
    : `模型服务返回 ${r.status}`;
  return msg.slice(0, 200);
}

/** 转发图像生成请求到火山引擎方舟 Seedream */
function callSeedream(payload) {
  return new Promise((resolve, reject) => {
    const base = (process.env.SEEDREAM_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
    const target = new URL(base + '/images/generations');
    const data = JSON.stringify(payload);
    const req = https.request(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SEEDREAM_API_KEY || ''}`,
        'Content-Length': Buffer.byteLength(data),
      },
    }, (upstream) => {
      let raw = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (c) => { raw += c; });
      upstream.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { /* */ }
        resolve({ status: upstream.statusCode || 502, json: parsed, raw: raw.slice(0, 1500) });
      });
    });
    req.setTimeout(120000, () => req.destroy(new Error('图像生成超时')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/** 服务端下载图片并转 base64（Node 端无浏览器 CORS 限制）。
 *  上游 Seedream 返回的是 TOS 签名 URL，存储桶未对前端开放 CORS，
 *  所以由云函数在服务端取回，统一以 b64_json 返回，保证前端能持久化素材。 */
function downloadToBase64(fileUrl) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL(fileUrl); } catch { return reject(new Error('图片地址不合法')); }
    const lib = target.protocol === 'http:' ? http : https;
    const req = lib.get(target, (up) => {
      // 跟随重定向
      if (up.statusCode >= 300 && up.statusCode < 400 && up.headers.location) {
        up.resume();
        return resolve(downloadToBase64(new URL(up.headers.location, target).toString()));
      }
      if (up.statusCode !== 200) {
        up.resume();
        return reject(new Error(`图片下载失败 ${up.statusCode}`));
      }
      const chunks = [];
      up.on('data', (c) => chunks.push(c));
      up.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ b64: buf.toString('base64'), mime: String(up.headers['content-type'] || 'image/jpeg') });
      });
    });
    req.setTimeout(60000, () => req.destroy(new Error('图片下载超时')));
    req.on('error', reject);
  });
}

async function handleImage(req, res, body) {
  if (!process.env.SEEDREAM_API_KEY) {
    return sendJson(res, 503, { error: { message: '后台尚未配置 SEEDREAM_API_KEY' } });
  }
  const token = process.env.LUNASOL_PROXY_TOKEN || '';
  if (!token || String(req.headers['x-lunasol-token'] || '') !== token) {
    return sendJson(res, 401, { error: { message: '代理令牌无效' } });
  }
  const verdict = guard(req);
  if (!verdict.ok) return sendJson(res, verdict.status, { error: { message: verdict.message } });

  const uid = String(req.headers['x-cloudbase-uid'] || '').trim();
  const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 2000) : '';
  if (!prompt) return sendJson(res, 400, { error: { message: '缺少 prompt' } });

  // 前端传 flash/lite/pro，映射到方舟具体模型 ID；缺省走环境变量
  const TIER_MODEL = {
    flash: 'doubao-seedream-5-0-flash-260915',
    lite: 'doubao-seedream-5-0-lite-260128',
    pro: 'doubao-seedream-5-0-pro-260628',
  };
  const tier = typeof body.model === 'string' && TIER_MODEL[body.model] ? body.model : 'flash';

  const payload = {
    model: TIER_MODEL[tier] || TIER_MODEL.flash,
    prompt,
    size: typeof body.size === 'string' ? body.size : '1024x1024',
    response_format: 'url',
    ...(typeof body.image === 'string' && body.image.startsWith('data:image/') ? { image: body.image } : {}),
  };

  try {
    dayUsed += 1;
    const r = await callSeedream(payload);
    if (r.status < 200 || r.status >= 300) {
      return sendJson(res, r.status >= 400 && r.status < 500 ? r.status : 502, {
        error: { message: safeUpstreamError(r) },
      });
    }
    // 统一把上游结果转成 b64_json 返回：服务端下载 TOS URL，规避前端 CORS
    const out = [];
    for (const d of (r.json.data || [])) {
      if (d.b64_json) {
        out.push({ b64_json: d.b64_json, url: '' });
      } else if (d.url) {
        const dl = await downloadToBase64(d.url);
        out.push({ b64_json: dl.b64, url: '' });
      }
    }
    if (!out.length) {
      return sendJson(res, 502, { error: { message: '图像接口未返回可用图片' } });
    }
    return sendJson(res, 200, {
      created: r.json.created || Date.now(),
      data: out,
    });
  } catch (e) {
    return sendJson(res, 502, { error: { message: `图像生成失败：${(e && e.message ? e.message : String(e)).slice(0, 160)}` } });
  }
}

async function handleChat(req, res, body) {
  if (!process.env.DEEPSEEK_API_KEY) {
    return sendJson(res, 503, { error: { message: '后台尚未配置 DEEPSEEK_API_KEY，请在云函数环境变量中设置' } });
  }
  const token = process.env.LUNASOL_PROXY_TOKEN || '';
  if (!token) {
    return sendJson(res, 503, { error: { message: '后台尚未配置 LUNASOL_PROXY_TOKEN，代理已停用' } });
  }
  const given = String(req.headers['x-lunasol-token'] || '');
  if (given !== token) {
    return sendJson(res, 401, { error: { message: '代理令牌无效' } });
  }
  const verdict = guard(req);
  if (!verdict.ok) return sendJson(res, verdict.status, { error: { message: verdict.message } });

  const withJsonFormat = !!(body.response_format && body.response_format.type === 'json_object');
  let payload = buildUpstreamPayload(body, withJsonFormat);
  if (!payload.messages.length) {
    return sendJson(res, 400, { error: { message: '缺少 messages' } });
  }

  try {
    dayUsed += 1;
    // 根据模型名路由：方舟模型走 ARK，其他走 DeepSeek
    const isArkModel = ARK_MODEL_MAP[payload.model];
    let r;
    if (isArkModel) {
      // 方舟模型需要映射到真实模型 ID
      const arkPayload = { ...payload, model: ARK_MODEL_MAP[payload.model] };
      r = await callArkChat(arkPayload);
    } else {
      r = await callDeepSeek(payload);
    }
    // 部分模型不接受 response_format：去掉该字段重试一次，不做结果伪装
    if (r.status === 400 && withJsonFormat && /response_format/i.test(r.raw)) {
      payload = buildUpstreamPayload(body, false);
      if (ARK_MODEL_MAP[payload.model]) {
        r = await callArkChat({ ...payload, model: ARK_MODEL_MAP[payload.model] });
      } else {
        r = await callDeepSeek(payload);
      }
    }
    if (r.status < 200 || r.status >= 300 || !r.json) {
      return sendJson(res, r.status >= 400 && r.status < 500 ? r.status : 502, {
        error: { message: safeUpstreamError(r) },
      });
    }
    const message0 = r.json.choices && r.json.choices[0] && r.json.choices[0].message;
    const content = message0 && message0.content;
    if (typeof content !== 'string') {
      return sendJson(res, 502, { error: { message: '模型未返回文本内容' } });
    }
    // 透传 Reasoner 的思考过程；非思考模型没有该字段，留空后序列化时自动省略
    const outMessage = { role: 'assistant', content };
    if (message0 && typeof message0.reasoning_content === 'string' && message0.reasoning_content.length) {
      outMessage.reasoning_content = message0.reasoning_content;
    }
    // 只返回前端需要的最小 OpenAI 兼容结构，不透传上游原始响应头
    return sendJson(res, 200, {
      id: r.json.id,
      object: 'chat.completion',
      model: r.json.model || payload.model,
      choices: [{ index: 0, message: outMessage, finish_reason: r.json.choices[0].finish_reason || 'stop' }],
      usage: r.json.usage || undefined,
    });
  } catch (e) {
    return sendJson(res, 502, {
      error: { message: `模型调用失败：${(e && e.message ? e.message : String(e)).slice(0, 160)}` },
    });
  }
}

const server = http.createServer(async (req, res) => {
  res.cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return sendOptions(res);

  let pathname = '/';
  try { pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname; } catch { /* 用默认根路径 */ }

  if (req.method === 'GET' && (pathname === '/' || pathname.endsWith('/health'))) {
    // 健康检查只返回非敏感的布尔与名称，不返回任何密钥或环境变量
    return sendJson(res, 200, {
      ok: true,
      service: 'lunasol-ai',
      provider: 'deepseek',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      keyConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
      tokenRequired: Boolean(process.env.LUNASOL_PROXY_TOKEN),
      imageGeneration: Boolean(process.env.SEEDREAM_API_KEY),
      imageProvider: process.env.SEEDREAM_API_KEY ? 'seedream' : 'none',
      limits: { ratePerMinute: RATE_PER_MINUTE, dailyLimit: DAILY_LIMIT, dailyUsed: dayUsed, requireOrigin: REQUIRE_ORIGIN },
    });
  }

  const isChat = pathname.endsWith('/chat/completions') || pathname === '/' || pathname.endsWith('/lunasol-ai');
  if (req.method === 'POST' && isChat) {
    let body;
    try { body = await readJsonBody(req); } catch (e) {
      return sendJson(res, 400, { error: { message: (e && e.message) || '请求体错误' } });
    }
    return handleChat(req, res, body);
  }

  if (req.method === 'POST' && pathname.endsWith('/images/generations')) {
    let body;
    try { body = await readJsonBody(req, MAX_IMAGE_BODY_BYTES); } catch (e) {
      return sendJson(res, 400, { error: { message: (e && e.message) || '请求体错误' } });
    }
    return handleImage(req, res, body);
  }

  if (isChat || pathname.endsWith('/images/generations')) {
    return sendJson(res, 405, { error: { message: 'Method Not Allowed' } });
  }
  return sendJson(res, 404, { error: { message: 'Not Found' } });
});

server.listen(9000, '0.0.0.0');
