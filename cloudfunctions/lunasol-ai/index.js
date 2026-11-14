/* LunaSol AI 后台代理（CloudBase HTTP 云函数 / Node.js 18）
 * ------------------------------------------------------------
 * 职责：把前端的 AI 请求转发到对应的上游厂商。
 *   文本对话  → 火山方舟（ARK_API_KEY，7 款模型，见下方 CHAT_MODELS）
 *   图像生成  → 方舟 Seedream（SEEDREAM_API_KEY）/ B.AI GPT Image 2（BAI_API_KEY）
 *   3D 生成   → 方舟 Hyper3D-Gen2（SEEDREAM_API_KEY，异步任务接口，暂未开放）
 * 所有厂商密钥只保存在云函数环境变量，绝不进入前端源码、Git 仓库、日志或响应体。
 *
 * 安全约束：
 *  - 不回显 req.headers / process.env / x-cloudbase-context；
 *  - 上游错误只透传精简后的 error.message；
 *  - 模型名由后台白名单决定，前端只能传「档位名」，真实模型 ID 只在这里映射；
 *  - 需要 X-LunaSol-Token 与后台 LUNASOL_PROXY_TOKEN 一致。
 *
 * 档位 → 上游模型 的映射是唯一权威：前端不传厂商模型名，避免扣错积分或走错厂商。
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

/* ---------- 滥用防护 ----------
 * 代理令牌随前端 JS 公开，任何人都能提取后直连本函数，所以令牌不是唯一门槛：
 *  1) 来源校验：只接受 Origin 落在白名单内的浏览器请求（LUNASOL_REQUIRE_ORIGIN=0 可关）；
 *  2) 单 IP 频率限制：LUNASOL_RATE_PER_MINUTE，默认 30 次/分钟；
 *  3) 每日全局上限：LUNASOL_DAILY_LIMIT，默认 2000 次/日，作为成本熔断；
 *  4) 每人每日对话轮数：LUNASOL_CHAT_TURNS_PER_DAY，默认 200。
 *
 * 纯积分制（2026-11-14）：对话免费、不扣积分，界面也不再展示任何额度或轮数，
 * 但免费对话仍需防刷。第 4 项只作用于对话请求（生图本来就扣积分，不再叠加限制），
 * 且只在服务端静默计数，用户看到的只是一句「今天先到这儿」。
 * 计数在进程内存里，多实例下是近似值，作为兜底足够；精确计费仍是积分账本。
 */
const RATE_PER_MINUTE = Math.max(1, Number(process.env.LUNASOL_RATE_PER_MINUTE || 30));
const DAILY_LIMIT = Math.max(1, Number(process.env.LUNASOL_DAILY_LIMIT || 2000));
const CHAT_TURNS_PER_DAY = Math.max(1, Number(process.env.LUNASOL_CHAT_TURNS_PER_DAY || 200));
const REQUIRE_ORIGIN = String(process.env.LUNASOL_REQUIRE_ORIGIN ?? '1') !== '0';

const rateBuckets = new Map();
const chatTurnBuckets = new Map();
let dayStamp = new Date().toISOString().slice(0, 10);
let dayUsed = 0;

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String(req.headers['x-real-ip'] || '').trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function rollDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayStamp) {
    dayStamp = today; dayUsed = 0;
    chatTurnBuckets.clear();
    if (chatTurnBuckets.size > 20000) chatTurnBuckets.clear();
  }
}

function guard(req, isChat = false) {
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
  if (isChat) {
    const key = uid + '|' + dayStamp;
    const used = chatTurnBuckets.get(key) || 0;
    if (used >= CHAT_TURNS_PER_DAY) {
      return { status: 429, message: '今天聊得挺多了，明天再继续吧' };
    }
    chatTurnBuckets.set(key, used + 1);
    if (chatTurnBuckets.size > 20000) chatTurnBuckets.clear();
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

/* ---------- 对话模型白名单（纯积分制，2026-11-14） ----------
 * 界面不再提供模型选择，用户只看到「Luna AI」。这里保留两档：
 *   - ds-v41-flash       主档，所有对话走它
 *   - ds-v41-flash-eco   主档上游故障时自动兜底（见 handleChat）
 * 前端只传「档位名」，真实模型 ID 与单价只存在于这张表；表外的名字一律回落默认档。
 * price/peak 只用于回传 cost 给后台做成本观测，界面不再展示金额、额度或轮数。
 * 改这里必须同步 src/cloud/chatModels.ts。
 */
const DEFAULT_CHAT_MODEL = 'ds-v41-flash';
const FALLBACK_CHAT_MODEL = 'ds-v41-flash-eco';
const ARK_CHAT_BASE = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');

const CHAT_MODELS = {
  'ds-v41-flash': {
    model: 'deepseek-v4-1-flash-261017',
    price: { input: 1, cache: 0.02, output: 4 },
    peak: { input: 2, cache: 0.04, output: 8 },
  },
  'ds-v41-flash-eco': {
    model: 'deepseek-v4-1-flash-economy-261017',
    price: { input: 0.8, cache: 0.016, output: 3.2 },
    peak: { input: 1.6, cache: 0.032, output: 6.4 },
  },
};

/** 旧构建 / 老用户本地缓存里的档位名一律归一到默认档。
 *  已下线的 5 款（Kimi / Doubao ×2 / GLM / DeepSeek-V4-pro）不能再被路由到上游。 */
const LEGACY_CHAT_MODELS = {
  'deepseek-chat': 'ds-v41-flash',
  'deepseek-reasoner': 'ds-v41-flash',
  'deepseek-flash': 'ds-v41-flash',
  'ds-v4-pro': 'ds-v41-flash',
  'kimi-k3.1': 'ds-v41-flash',
  'kimi-k3.1-pro': 'ds-v41-flash',
  'doubao-seed-pro': 'ds-v41-flash',
  'doubao-seed-lite': 'ds-v41-flash',
  'doubao-seed-turbo': 'ds-v41-flash',
  'doubao-2.1-lite': 'ds-v41-flash',
  'doubao-2.1-turbo': 'ds-v41-flash',
  'glm-5.3': 'ds-v41-flash',
  'glm-5.3-flash': 'ds-v41-flash',
};

function resolveChatModel(name) {
  const raw = typeof name === 'string' ? name.trim() : '';
  const id = LEGACY_CHAT_MODELS[raw] || raw;
  return CHAT_MODELS[id] ? id : DEFAULT_CHAT_MODEL;
}

/** 北京时间是否处于高峰时段（周一至周五 09:00–12:00、14:00–18:00） */
function isPeakHour(now = new Date()) {
  const bj = new Date(now.getTime() + 8 * 3600 * 1000);
  const wd = bj.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  const h = bj.getUTCHours() + bj.getUTCMinutes() / 60;
  return (h >= 9 && h < 12) || (h >= 14 && h < 18);
}

function priceAt(route, now = new Date()) {
  return route.peak && isPeakHour(now) ? route.peak : route.price;
}

/** 把上游 usage 折算成人民币（元）。缓存命中部分按 cache 价算：
 *  DeepSeek/Kimi 的缓存价与输入价差 10 倍以上，全按输入价算会明显高估成本。 */
function costOfUsage(route, usage, now = new Date()) {
  const input = Math.max(0, Number(usage && usage.prompt_tokens) || 0);
  const cached = Math.min(input, Math.max(0, Number(usage && usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens) || 0));
  const output = Math.max(0, Number(usage && usage.completion_tokens) || 0);
  const p = priceAt(route, now);
  const rmb = ((input - cached) * p.input + cached * p.cache + output * p.output) / 1e6;
  return Math.round(rmb * 1e6) / 1e6;
}

/** 方舟文本密钥：优先 ARK_API_KEY（对话专用），未配置时回落到生图那把同账号密钥 */
function arkKey() {
  return process.env.ARK_API_KEY || process.env.SEEDREAM_API_KEY || '';
}

/* ---------- B.AI 图像模型（2026-11 接入） ----------
 * B.AI 提供 OpenAI 兼容网关，Base URL 固定 https://api.b.ai/v1。
 * GPT Image 2 按「输入 token 档位」计费：纯文字输入 5，带参考图输入 8，
 * 因此前端分两个档位（gpt2-text / gpt2-ref），由这里映射到同一个真实模型 ID，
 * 但前端扣分不同（改图档更贵）——映射写错就会扣错积分，改动前先核对这张表；
 * 具体积分以 src/cloud/models.ts 为准，这里不写死数字，避免改价后注释变成错的。
 */
const BAI_BASE_URL = (process.env.BAI_BASE_URL || 'https://api.b.ai/v1').replace(/\/+$/, '');
const BAI_IMAGE_MODEL = process.env.BAI_IMAGE_MODEL || 'gpt-image-2';

/**
 * 前端档位 → 上游厂商与真实模型 ID。这是全站唯一的映射表：
 *   provider=bai  → B.AI（Authorization: Bearer BAI_API_KEY）
 *   provider=ark  → 火山方舟（Authorization: Bearer SEEDREAM_API_KEY）
 * 前端只允许传 key，传表外的值直接 400，绝不回落到默认档位偷偷扣费。
 */
function imageRoute(tier) {
  const seedreamBase = (process.env.SEEDREAM_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
  const routes = {
    flash: { provider: 'ark', base: seedreamBase, model: 'doubao-seedream-5-0-flash-260915', key: process.env.SEEDREAM_API_KEY },
    pro: { provider: 'ark', base: seedreamBase, model: 'doubao-seedream-5-0-pro-260628', key: process.env.SEEDREAM_API_KEY },
    'gpt2-text': { provider: 'bai', base: BAI_BASE_URL, model: BAI_IMAGE_MODEL, key: process.env.BAI_API_KEY },
    'gpt2-ref': { provider: 'bai', base: BAI_BASE_URL, model: BAI_IMAGE_MODEL, key: process.env.BAI_API_KEY },
  };
  return routes[tier] || null;
}

/** 硬超时：DNS 卡住时 socket timeout 不会触发（连接还没建立），必须用独立计时器兜底，
 *  否则函数会一直挂到网关把请求掐掉（表现为客户端 90 秒白屏）。 */
function withDeadline(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** B.AI 图生图（带参考图）：OpenAI 兼容 /images/edits，multipart 上传参考图。
 *  GPT Image 2 的「输入 8」档位只在这条路径上生效——generations 不认 image 参数。 */
function callBaiImageEdit(route, opts) {
  return withDeadline(new Promise((resolve, reject) => {
    const list = (Array.isArray(opts.dataUrls) && opts.dataUrls.length ? opts.dataUrls : [opts.dataUrl]).slice(0, 4);
    const parts = [];
    for (const url of list) {
      const m = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(url || '');
      if (!m) { reject(new Error('参考图格式不正确')); return; }
      const mime = m[1];
      parts.push({ mime, buf: Buffer.from(m[2], 'base64'), ext: (mime.split('/')[1] || 'png').replace('jpeg', 'jpg') });
    }
    const boundary = `----lunasol${Date.now().toString(16)}`;
    const chunks = [];
    const pushText = (s) => chunks.push(Buffer.from(s, 'utf8'));
    pushText(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${route.model}\r\n`);
    pushText(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${opts.prompt}\r\n`);
    pushText(`--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n${opts.size || '1024x1024'}\r\n`);
    // 单图沿用 OpenAI 兼容的 image 字段；多图用 image[] 重复 part。
    // 上游若只认单图，handleImage 会拿拼接参考板降级重试一次。
    const field = parts.length > 1 ? 'image[]' : 'image';
    parts.forEach((p, i) => {
      pushText(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="ref-${i}.${p.ext}"\r\nContent-Type: ${p.mime}\r\n\r\n`);
      chunks.push(p.buf);
      pushText('\r\n');
    });
    pushText(`--${boundary}--\r\n`);
    const data = Buffer.concat(chunks);
    const req = https.request(new URL(route.base + '/images/edits'), {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Accept': 'application/json',
        'Authorization': `Bearer ${route.key || ''}`,
        'Content-Length': data.length,
      },
    }, (upstream) => {
      let raw = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (c) => { raw += c; });
      upstream.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { /* */ }
        resolve({ status: upstream.statusCode || 502, json: parsed, raw: raw.slice(0, 1200) });
      });
    });
    req.setTimeout(175000, () => req.destroy(new Error('图像生成超时')));
    req.on('error', reject);
    req.write(data);
    req.end();
  }), 180000, 'B.AI 上游无响应（DNS 解析或网络不可达）');
}

/** B.AI 图像生成：OpenAI 兼容 /images/generations，强制要 b64 以便前端直接落库 */
function callBaiImage(route, payload) {
  return withDeadline(new Promise((resolve, reject) => {
    const target = new URL(route.base + '/images/generations');
    const data = JSON.stringify(payload);
    const req = https.request(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${route.key || ''}`,
        'Content-Length': Buffer.byteLength(data),
      },
    }, (upstream) => {
      let raw = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (c) => { raw += c; });
      upstream.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { /* 交给调用方兜底 */ }
        resolve({ status: upstream.statusCode || 502, json: parsed, raw: raw.slice(0, 1200) });
      });
    });
    req.setTimeout(175000, () => req.destroy(new Error('图像生成超时')));
    req.on('error', reject);
    req.write(data);
    req.end();
  }), 180000, 'B.AI 上游无响应（DNS 解析或网络不可达）');
}


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

/** 只把允许字段透传给上游，避免前端注入任意参数。
 *  返回 { payload, frontModel, route }：payload.model 已是真实模型 ID，
 *  frontModel 是档位名（回传前端用），route 里带单价（算成本用）。 */
function buildUpstreamPayload(body, withJsonFormat) {
  const messages = Array.isArray(body.messages)
    ? body.messages
      .filter((m) => m && (m.role === 'system' || m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 24000) }))
      .slice(-20)
    : [];
  const frontModel = resolveChatModel(body.model);
  const route = CHAT_MODELS[frontModel];
  const payload = {
    model: route.model,
    messages,
    // 思考型模型（Kimi / Doubao / DeepSeek V4）会先花 token 推理再写正文，
    // 上限给 2048 时正文常被截断成空串；默认 4096、上限 8192。
    max_tokens: Math.round(clampNumber(body.max_tokens, 4096, 1, 8192)),
    stream: false,
  };
  payload.temperature = typeof route.temperature === 'number'
    ? route.temperature
    : clampNumber(body.temperature, 0.7, 0, 2);
  if (withJsonFormat) payload.response_format = { type: 'json_object' };
  return { payload, frontModel, route };
}

function callArkChat(payload) {
  return new Promise((resolve, reject) => {
    const target = new URL(ARK_CHAT_BASE + '/chat/completions');
    const data = JSON.stringify(payload);
    const req = https.request(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${arkKey()}`,
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

/* 上游报错翻译：厂商返回的是英文技术描述，直接丢给用户等于没说。
 * 这里按 code / 关键字归类，给出「为什么 + 下一步怎么做」。
 * 认不出来的仍然原样透传（附状态码），方便我们排查。 */
const UPSTREAM_HINTS = [
  {
    re: /copyright|trademark|infring/i,
    zh: '画出来的画面可能涉及版权或商标（例如像某个品牌或平台的标志），被厂商的内容审核拦下了。常见触发词：小红书 / 抖音 / 微信这类平台名，或真实品牌名。去掉它们换成中性说法（如「社交平台封面」）再试。',
  },
  {
    re: /sensitive|moderation|safety|policy|risk|prohibit|illegal|violat/i,
    zh: '描述触发了厂商的内容安全审核。去掉人物特征、医疗功效、仿冒品牌这类说法，写得更中性一些再试。',
  },
  {
    re: /AccessDenied|access denied|Forbidden|do not have access/i,
    zh: '这个模型还没有在你的火山方舟账号里开通（接口返回 403）。到方舟控制台「模型广场」找到对应模型点「开通」，或用同一账号下的可用模型继续。',
  },
  {
    re: /rate.?limit|too many requests|\b429\b/i,
    zh: '上游限流了，等几秒再试。',
  },
  {
    re: /quota|insufficient|balance|欠费|余额/i,
    zh: '上游额度不足或账户受限，请联系管理员处理。',
  },
  {
    re: /timeout|timed out|ETIMEDOUT|ENOTFOUND|ECONNREFUSED/i,
    zh: '上游响应超时或网络不可达，稍后重试。',
  },
];

function safeUpstreamError(r) {
  const err = (r.json && r.json.error) || {};
  const code = typeof err.code === 'string' ? err.code : '';
  const raw = typeof err.message === 'string' ? err.message : '';
  const hit = UPSTREAM_HINTS.find((m) => m.re.test(`${code} ${raw}`));
  if (hit) return hit.zh;
  if (raw) return raw.slice(0, 200);
  return `模型服务返回 ${r.status}${code ? `（${code}）` : ''}`;
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

/** Creem 内容审核（平台硬性要求）：任何出图请求都必须先筛提示词。
 *  - allow          → 放行
 *  - deny / flag    → 阻止，绝不发给模型
 *  - 超时 / 5xx     → 默认也阻止（fail-closed），只有 MODERATION_STRICT=0 才应急放行
 *  只筛用户自己写的文本，不拼模板，避免为固定文案重复计费（$0.30/1000 字符单位）。 */
async function moderatePrompt(prompt) {
  const c = payCfg();
  if (String(process.env.MODERATION_ENFORCE || '1') === '0') return { ok: true, skipped: 'disabled' };
  if (!c.apiKey) return { ok: true, skipped: 'no-key' };
  const strict = String(process.env.MODERATION_STRICT || '1') !== '0';

  const attempt = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(`${c.base}/v1/moderation/prompt`, {
        method: 'POST',
        headers: { 'x-api-key': c.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.slice(0, 4000), external_id: `lunasol-${Date.now()}` }),
        signal: ctrl.signal,
      });
      const text = await r.text();
      let data = null;
      try { data = JSON.parse(text); } catch { /* 保留原文 */ }
      if (!r.ok) throw new Error(`${r.status}: ${String((data && (data.message || data.error)) || text).slice(0, 120)}`);
      return { decision: String((data && data.decision) || '').toLowerCase() };
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let out;
    try { out = await attempt(); }
    catch { out = await attempt(); }   // 国际链路偶发握手失败，重试一次
    if (out.decision === 'allow') return { ok: true };
    return { ok: false, blocked: true, decision: out.decision || 'unknown' };
  } catch (e) {
    console.error('[moderation] 审核调用失败', (e && e.message) || e);
    if (!strict) return { ok: true, skipped: 'error' };
    return { ok: false, blocked: false, error: true };
  }
}

async function handleImage(req, res, body) {
  const token = process.env.LUNASOL_PROXY_TOKEN || '';
  if (!token || String(req.headers['x-lunasol-token'] || '') !== token) {
    return sendJson(res, 401, { error: { message: '代理令牌无效' } });
  }
  const verdict = guard(req);
  if (!verdict.ok) return sendJson(res, verdict.status, { error: { message: verdict.message } });

  const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 2000) : '';
  if (!prompt) return sendJson(res, 400, { error: { message: '缺少 prompt' } });

  // 审核放在档位校验之前：违规提示词无论选哪个档位都直接拒绝，不消耗任何上游额度
  const mod = await moderatePrompt(prompt);
  if (!mod.ok) {
    return sendJson(res, mod.blocked ? 403 : 503, {
      error: {
        code: mod.blocked ? 'moderation_blocked' : 'moderation_unavailable',
        message: mod.blocked
          ? '这段描述未通过内容审核，无法生成图片。请去掉涉及色情、暴力、他人肖像或侵权的内容后重试。'
          : '内容审核服务暂时不可用，请稍后重试。',
      },
    });
  }

  // 档位必须命中映射表。传表外的值直接拒绝，绝不做「回落到 Flash」这种悄悄换模型的事：
  // 前端按档位扣积分，一旦静默回落，用户付了 GPT Image 2 的钱却拿到 Seedream 的图。
  const tier = typeof body.model === 'string' ? body.model : '';
  const route = imageRoute(tier);
  if (!route) {
    return sendJson(res, 400, { error: { message: `未知的图像模型档位：${tier || '(空)'}` } });
  }
  if (!route.key) {
    return sendJson(res, 503, { error: { message: `${route.provider === 'bai' ? 'B.AI' : '方舟'} 密钥未配置，该档位暂不可用` } });
  }

  // 参考图支持两种写法：
  //   body.image   —— 单张（旧客户端），多图客户端传的是「拼接参考板」，用于降级；
  //   body.images  —— 真·多图数组，按 [风格参考, 产品图] 顺序。
  // 两个字段都发，服务端新旧版本都能工作：新版用 images，旧版用 image。
  const legacyRef = typeof body.image === 'string' && body.image.startsWith('data:image/') ? body.image : '';
  const refList = (Array.isArray(body.images)
    ? body.images.filter((s) => typeof s === 'string' && s.startsWith('data:image/')).slice(0, 4)
    : []);
  const allRefs = refList.length ? refList : (legacyRef ? [legacyRef] : []);
  const fallbackRef = legacyRef || allRefs[0] || '';
  const hasRef = allRefs.length > 0;
  const multiRef = allRefs.length > 1;
  // GPT Image 2 的两个价格档位对应两种输入，走错接口就白扣分：
  //   文字输入(5) → /images/generations（无参考图）
  //   图片输入(8) → /images/edits（带参考图，multipart）
  if (tier === 'gpt2-ref' && !hasRef) {
    return sendJson(res, 400, { error: { message: '该档位需要先上传参考图' } });
  }
  if (tier === 'gpt2-text' && hasRef) {
    return sendJson(res, 400, { error: { message: '已上传参考图，请切换到「GPT Image 2（输入图）」档位，否则会按文字档计费' } });
  }
  const size = typeof body.size === 'string' ? body.size : '1024x1024';
  const payload = route.provider === 'bai'
    ? {
      model: route.model,
      prompt,
      n: 1,
      size,
    }
    : {
      model: route.model,
      prompt,
      size,
      response_format: 'url',
      // 方舟 Seedream 的 image 既收字符串也收数组；数组就是多图参考
      ...(hasRef ? { image: multiRef ? allRefs : fallbackRef } : {}),
    };

  try {
    dayUsed += 1;
    let r;
    if (route.provider === 'bai') {
      if (tier === 'gpt2-ref') {
        r = await callBaiImageEdit(route, { prompt, dataUrls: allRefs, size });
        // 上游不认 image[] 时退回单张拼接板，不让「双图复刻」整体失败
        if (r.status >= 400 && r.status < 500 && multiRef) {
          r = await callBaiImageEdit(route, { prompt, dataUrls: [fallbackRef], size });
        }
      } else {
        r = await callBaiImage(route, payload);
      }
    } else {
      r = await callSeedream(payload);
      // 模型版本不认 image 数组时（4xx）自动降级到拼接参考板重试一次
      if (r.status >= 400 && r.status < 500 && multiRef) {
        r = await callSeedream({ ...payload, image: fallbackRef });
      }
    }
    if (r.status < 200 || r.status >= 300) {
      return sendJson(res, r.status >= 400 && r.status < 500 ? r.status : 502, {
        error: { message: safeUpstreamError(r) },
      });
    }
    // 统一把上游结果转成 b64_json 返回：服务端下载 TOS / CDN 图片，规避前端 CORS
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
      model: route.model,
      provider: route.provider,
      data: out,
    });
  } catch (e) {
    return sendJson(res, 502, { error: { message: `图像生成失败：${(e && e.message ? e.message : String(e)).slice(0, 160)}` } });
  }
}

async function handleChat(req, res, body) {
  const token = process.env.LUNASOL_PROXY_TOKEN || '';
  if (!token) {
    return sendJson(res, 503, { error: { message: '后台尚未配置 LUNASOL_PROXY_TOKEN，代理已停用' } });
  }
  const given = String(req.headers['x-lunasol-token'] || '');
  if (given !== token) {
    return sendJson(res, 401, { error: { message: '代理令牌无效' } });
  }
  const verdict = guard(req, true);
  if (!verdict.ok) return sendJson(res, verdict.status, { error: { message: verdict.message } });

  if (!arkKey()) {
    return sendJson(res, 503, { error: { message: '后台尚未配置 ARK_API_KEY（火山方舟），对话模型暂不可用' } });
  }

  const withJsonFormat = !!(body.response_format && body.response_format.type === 'json_object');
  let { payload, frontModel, route } = buildUpstreamPayload(body, withJsonFormat);
  if (!payload.messages.length) {
    return sendJson(res, 400, { error: { message: '缺少 messages' } });
  }

  try {
    dayUsed += 1;
    let r = await callArkChat(payload);
    // 主档上游故障（5xx / 限流）：自动切到经济兜底档重试一次，用户无感。
    // 只有两档，且都不对外暴露，不需要用户做任何选择。
    if ((r.status >= 500 || r.status === 429) && frontModel === DEFAULT_CHAT_MODEL) {
      const fb = buildUpstreamPayload({ ...body, model: FALLBACK_CHAT_MODEL }, withJsonFormat);
      const r2 = await callArkChat(fb.payload);
      if (r2.status >= 200 && r2.status < 300 && r2.json) {
        r = r2; payload = fb.payload; frontModel = fb.frontModel; route = fb.route;
      }
    }
    // 部分模型不接受 response_format：去掉该字段重试一次，不做结果伪装
    if (r.status === 400 && withJsonFormat && /response_format/i.test(r.raw)) {
      ({ payload } = buildUpstreamPayload(body, false));
      r = await callArkChat(payload);
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
    // 透传思考过程；非思考模型没有该字段，留空后序列化时自动省略
    const outMessage = { role: 'assistant', content };
    if (message0 && typeof message0.reasoning_content === 'string' && message0.reasoning_content.length) {
      outMessage.reasoning_content = message0.reasoning_content;
    }
    // cost 由服务端按 usage × 单价算好，仅用于后台成本观测，界面不展示
    const usage = r.json.usage || undefined;
    return sendJson(res, 200, {
      id: r.json.id,
      object: 'chat.completion',
      model: r.json.model || route.model,
      chatModel: frontModel,
      choices: [{ index: 0, message: outMessage, finish_reason: r.json.choices[0].finish_reason || 'stop' }],
      usage: usage || undefined,
      cost: usage ? costOfUsage(route, usage) : 0,
      priceTier: route.peak && isPeakHour() ? 'peak' : 'normal',
    });
  } catch (e) {
    return sendJson(res, 502, {
      error: { message: `模型调用失败：${(e && e.message ? e.message : String(e)).slice(0, 160)}` },
    });
  }
}

/* ---------- 支付：Creem 接入（2026-11-11） ----------
 * 两个路由：
 *   POST /pay/checkout        前端建结账会话。必须登录 + 来源白名单 + 代理令牌，
 *                             把 uid 写进 metadata，付款后才知道该给谁开通。
 *   POST /pay/creem/webhook   Creem 服务端回调。HMAC-SHA256 验签通过才解析，
 *                             落库走数据库函数 lunasol_pay_apply（幂等 + 二次 secret 校验）。
 *
 * 为什么不用静态 checkout link：静态链接带不了用户身份，付款成功后无法对应到账号。
 *
 * 纯积分制（2026-11-14）：前端只卖积分包，会员订阅产品已停售。
 * 但 Creem 后台可能还有未取消的旧订阅推续费事件，这些事件一律折算成积分入账，
 * 既不返回 5xx 让 Creem 无限重投，也不再写任何会员身份 / 有效期。
 *
 * 环境变量（全部只存云函数，绝不进前端）：
 *   CREEM_API_KEY              Creem 后台 Developers 页
 *   CREEM_WEBHOOK_SECRET       Webhooks 端点详情页
 *   CREEM_PRODUCT_ID           历史会员订阅产品 prod_xxx（仅用于识别老续费事件）
 *   CREEM_CREDIT_PRODUCTS      积分包白名单 JSON：{"prod_xxx":1000,"prod_yyy":2100}。
 *                              不配则用代码里内置的四档（100 / 1000 / 2100 / 3500）。
 *                              加档位优先配这一项，不用改代码、不用重新部署。
 *   CREEM_CREDITS_PER_PACK     仅在事件里拿不到产品 ID 时使用的兜底积分量（默认 1000）
 *   PAY_APPLY_SECRET           本函数与数据库函数共享的落库口令
 *   CREEM_TEST_MODE=1          走 test-api.creem.io
 *   PAY_SUCCESS_URL            支付成功后跳回的前端地址（默认正式站点订阅页）
 *
 * 产品归属只认服务端白名单，不认前端传来的任何金额或产品 ID——
 * 否则用户改一个请求体就能用低价档买到高额积分。
 */
const crypto = require('crypto');
const PAY_ENV_ID = 'solyoung-d4gpp1f7s4e075f6d';
// publishable key 是公开值（前端 .env 里本来就有），这里只用于调本环境的数据库函数。
// 真正兜底的权限在数据库函数里：没有 PAY_APPLY_SECRET 无法开通任何人。
// publishable key 是公开值（前端 .env 里本来就有），作为兜底内置，用户不必再配一项。
const PAY_PUBLISHABLE_KEY_DEFAULT = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjdhMWU4NzFjLTJjNzMtNDY4Yy04OTQ5LTVlMjMyNDFjM2MxNyJ9.eyJpc3MiOiJodHRwczovL3NvbHlvdW5nLWQ0Z3BwMWY3czRlMDc1ZjZkLmFwLXNoYW5naGFpLnRjYi1hcGkudGVuY2VudGNsb3VkYXBpLmNvbSIsInN1YiI6ImFub24iLCJhdWQiOiJzb2x5b3VuZy1kNGdwcDFmN3M0ZTA3NWY2ZCIsImV4cCI6NDA5NTgyMjQ2MywiaWF0IjoxNzkyMTM5MjYzLCJub25jZSI6IjNKMmNFOXJKUkZXMllOSF9MbkIyMUEiLCJhdF9oYXNoIjoiM0oyY0U5ckpSRlcyWU5IX0xuQjIxQSIsIm5hbWUiOiJBbm9ueW1vdXMiLCJzY29wZSI6ImFub255bW91cyIsInByb2plY3RfaWQiOiJzb2x5b3VuZy1kNGdwcDFmN3M0ZTA3NWY2ZCIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJyb2xlIjoiYW5vbiIsImlzX2Fub255bW91cyI6dHJ1ZSwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiYW5vbnltb3VzIiwicHJvdmlkZXJzIjpbImFub255bW91cyJdfSwidXNlcl9tZXRhZGF0YSI6eyJuYW1lIjoiQW5vbnltb3VzIn0sInVzZXJfdHlwZSI6IiIsImNsaWVudF90eXBlIjoiY2xpZW50X3VzZXIiLCJpc19zeXN0ZW1fYWRtaW4iOmZhbHNlfQ.Xeks40kq-23Qryw8_XNQbtQOIIP-NmirzVl3ynZ9VhorEdoXL_BjHZpBxXwYsSA7MufdoM14XH9zAxMF031471IbMcyAp5SxYpZ6V0Q3pbvVovyK0ndirDV2C4PFdrhNNHaAKiIFSsKuV-uwcm9FJKRR-KoMK8GSuTImUN7GALieYx3AtBv84hhM-ODw9raRp5oLgcqe5CSLqw6fj2BcEhk78i5EJ5nqdF_i4ESk3ff5t-k4klpalyYVIaK9GUwXWhg6H8r4JYnku8N2AjYzVUq4_pLz9s3EtHMTYn7lYu4H8jK-SqkC86EQKlbGSPYmKqjqkISdqWpkuNUC--BWNA';
const PAY_PUBLISHABLE_KEY = process.env.LUNASOL_PG_ANON_KEY || PAY_PUBLISHABLE_KEY_DEFAULT;

/** 积分包产品白名单：Creem 产品 ID → 该产品发多少积分。
 *
 *  为什么是一张表而不是一个 id：100 / 1000 / 2100 / 3500 各档同价不同量，
 *  用户点哪一档由**产品 ID**决定，绝不接受前端传来的「给我 3500 积分」——
 *  否则谁都能用 1000 积分那一档的价格买到 3500 积分。
 *
 *  内置一份当前上架的四档（产品 ID 不是密钥，它本来就会出现在结账请求里），
 *  其中 prod_5nK… 是 US$1 / 100 积分的临时体验档，下架只需从这张表删掉它，
 *  需要增删档位时优先改云函数环境变量 CREEM_CREDIT_PRODUCTS（JSON），不必改代码：
 *    CREEM_CREDIT_PRODUCTS={"prod_xxx":1000,"prod_yyy":2100}
 */
const CREDIT_PACKS_DEFAULT = {
  prod_5nKbilayRd9BPYuyE2jV5Y: 100,    // US$1.00  临时体验档（测试支付链路用）
  prod_7NiVzlPdBAHijnv06eQ0uw: 1000,   // US$14.00
  prod_1Pu40n8LlNNn3bTOLIY0wR: 2100,   // US$28.00
  prod_TiM2kUweFHmfqUIukrEUu: 3500,    // US$43.00
};

function creditPacks() {
  const raw = String(process.env.CREEM_CREDIT_PRODUCTS || '').trim();
  if (raw) {
    try {
      const src = JSON.parse(raw);
      const out = {};
      for (const k of Object.keys(src || {})) {
        const id = String(k).trim();
        const n = Math.round(Number(src[k]) || 0);
        if (id && n > 0) out[id] = Math.min(1000000, n);
      }
      if (Object.keys(out).length) return out;
      console.error('[pay] CREEM_CREDIT_PRODUCTS 为空，回退内置四档');
    } catch (e) {
      console.error('[pay] CREEM_CREDIT_PRODUCTS 不是合法 JSON，回退内置四档：', (e && e.message) || e);
    }
  }
  return CREDIT_PACKS_DEFAULT;
}

/** 按积分数量找产品 ID；points 省略时取最小档（1000），保持旧调用方式可用。 */
function creditProductFor(points) {
  const packs = creditPacks();
  const ids = Object.keys(packs);
  if (!ids.length) return { productId: '', points: 0 };
  if (points) {
    const hit = ids.find((id) => packs[id] === points);
    if (hit) return { productId: hit, points };
    return { productId: '', points: 0 };
  }
  const smallest = ids.reduce((a, b) => (packs[a] <= packs[b] ? a : b));
  return { productId: smallest, points: packs[smallest] };
}

function payCfg() {
  const test = String(process.env.CREEM_TEST_MODE || '') === '1';
  const creditsPerPack = Number(process.env.CREEM_CREDITS_PER_PACK || '') || 1000;
  const packs = creditPacks();
  return {
    packs,
    apiKey: String(process.env.CREEM_API_KEY || '').trim(),
    webhookSecret: String(process.env.CREEM_WEBHOOK_SECRET || '').trim(),
    applySecret: String(process.env.PAY_APPLY_SECRET || '').trim(),
    productId: String(process.env.CREEM_PRODUCT_ID || '').trim(),
    creditsPerPack: Math.max(1, Math.min(1000000, Math.round(creditsPerPack))),
    test,
    base: test ? 'https://test-api.creem.io' : 'https://api.creem.io',
    successUrl: String(process.env.PAY_SUCCESS_URL || 'https://luna.solyoung.top/#/credits?paid=1').trim(),
  };
}

/** 读原始字节：验签必须对 Creem 发来的原始 body 做 HMAC，不能先 JSON.parse 再序列化 */
function readRawBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function creemSignatureValid(rawBuf, header) {
  const secret = payCfg().webhookSecret;
  if (!secret) return { ok: false, reason: 'webhook secret not configured' };
  const sig = String(header || '').trim();
  if (!sig) return { ok: false, reason: 'missing signature' };
  const expect = crypto.createHmac('sha256', secret).update(rawBuf).digest('hex');
  const a = Buffer.from(expect, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length) return { ok: false, reason: 'signature mismatch' };
  const ok = crypto.timingSafeEqual(a, b);
  return ok ? { ok: true, reason: '' } : { ok: false, reason: 'signature mismatch' };
}

/** 落库：调数据库函数，开通/回收/幂等都在一个事务里 */
async function payApply(payload, fn = 'lunasol_pay_apply') {
  const key = PAY_PUBLISHABLE_KEY;
  if (!key) throw new Error('LUNASOL_PG_ANON_KEY 未配置');
  const r = await fetch(`https://${PAY_ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`db ${r.status}: ${text.slice(0, 160)}`);
  try { return JSON.parse(text); } catch { return null; }
}

/** 调 Creem 的兜底：国际链路偶发握手超时（实测冷启动实例上出现过一次
 *  「fetch failed」在 10s 处），失败一次立刻重试，仍然失败才报错。 */
async function creemFetch(url, init, tries = 2) {
  let lastErr = null;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
    } catch (e) {
      lastErr = e;
      const cause = e && e.cause ? ` (${e.cause.code || e.cause.message || String(e.cause)})` : '';
      console.error(`[pay] creem 请求失败 第${i + 1}次：${(e && e.message) || e}${cause}`);
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastErr;
}

async function handlePayCheckout(req, res) {
  const c = payCfg();
  if (!c.apiKey) {
    return sendJson(res, 503, { error: { message: '支付通道还没配置完成（缺少 Creem 密钥）' } });
  }
  const origin = String(req.headers.origin || '').trim().replace(/\/+$/, '');
  if (!allowedOrigins().includes(origin)) {
    return sendJson(res, 403, { error: { message: '来源不受信任：只能从站点页面调用' } });
  }
  if (process.env.LUNASOL_PROXY_TOKEN && String(req.headers['x-lunasol-token'] || '').trim() !== process.env.LUNASOL_PROXY_TOKEN) {
    return sendJson(res, 401, { error: { message: '访问令牌无效' } });
  }
  const uid = String(req.headers['x-cloudbase-uid'] || '').trim();
  if (!uid) return sendJson(res, 401, { error: { message: '请先登录再购买' } });

  let body = {};
  try { body = await readJsonBody(req, 8 * 1024); } catch { body = {}; }
  const email = String(body.email || '').trim();
  // 名字只用于预填收银台，并给风控多一点信号；不参与开通判断
  const name = String(body.name || '').trim().slice(0, 60);

  // 纯积分制：只卖积分包。老构建（浏览器缓存）可能还传 kind='pro'，
  // 明确提示刷新页面，绝不悄悄把会员订阅单开出去。
  if (String(body.kind || 'credits') !== 'credits') {
    return sendJson(res, 400, {
      error: { message: '会员已下线，请刷新页面后在「积分」页购买积分包' },
    });
  }
  // 产品只认服务端白名单：前端只能声明「买哪一档」，具体 prod_ 与发放量由这里决定。
  const wantPoints = Math.round(Number(body.pack || body.points || 0) || 0);
  const picked = creditProductFor(wantPoints);
  const productId = picked.productId;
  if (!productId) {
    return sendJson(res, 503, {
      error: {
        message: wantPoints ? `没有 ${wantPoints} 积分这一档，请刷新页面后重试` : '积分包还没配置产品 ID，请先联系客服',
      },
    });
  }

  const payload = {
    product_id: productId,
    success_url: c.successUrl,
    metadata: { uid, kind: 'credits', points: picked.points },
  };
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) payload.customer = { email, ...(name ? { name } : {}) };

  try {
    const r = await creemFetch(`${c.base}/v1/checkouts`, {
      method: 'POST',
      headers: { 'x-api-key': c.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* 保留原文用于报错 */ }
    if (!r.ok || !data || !data.checkout_url) {
      const upstream = (data && (data.message || data.error)) || text.slice(0, 160) || '未知错误';
      console.error('[pay] checkout 创建失败', r.status, String(upstream).slice(0, 200));
      return sendJson(res, 502, { error: { message: `结账会话创建失败：${String(upstream).slice(0, 120)}` } });
    }
    // 只回传跳转地址，不回传 API Key / 客户信息
    return sendJson(res, 200, { ok: true, url: data.checkout_url, id: data.id || '', kind: 'credits' });
  } catch (e) {
    // fetch 的根因在 e.cause 里（ENOTFOUND / ETIMEDOUT / ECONNRESET），
    // 只打 "fetch failed" 排查不了问题。
    const cause = e && e.cause ? ` cause=${e.cause.code || e.cause.message || String(e.cause)}` : '';
    console.error('[pay] checkout 异常', (e && e.message) || e, cause);
    return sendJson(res, 502, { error: { message: '结账服务暂时不可用，请稍后再试' } });
  }
}

/** 诊断：云函数能不能连上 Creem。只在配了代理令牌时可调，返回不含密钥。
 *  用途：结账 502 时区分「密钥错」「网络不通」「Creem 拒绝」三种原因。 */
async function handlePayDiag(req, res) {
  const c = payCfg();
  if (process.env.LUNASOL_PROXY_TOKEN && String(req.headers['x-lunasol-token'] || '').trim() !== process.env.LUNASOL_PROXY_TOKEN) {
    return sendJson(res, 401, { error: { message: '访问令牌无效' } });
  }
  const out = { base: c.base, hasKey: Boolean(c.apiKey), dns: null, http: null, products: [] };
  try {
    const dns = require('dns').promises;
    out.dns = await dns.lookup(new URL(c.base).hostname, { all: true }).then((r) => r.map((x) => `${x.address}/${x.family}`)).catch((e) => `ERR ${e.code || e.message}`);
  } catch (e) { out.dns = `ERR ${e.message}`; }
  const t0 = Date.now();
  try {
    const r = await fetch(`${c.base}/v1/products?product_id=${encodeURIComponent(c.productId || '')}`, {
      method: 'GET',
      headers: { 'x-api-key': c.apiKey },
    });
    const text = await r.text();
    out.http = { status: r.status, ms: Date.now() - t0, body: text.slice(0, 300) };
  } catch (e) {
    out.http = { ms: Date.now() - t0, error: (e && e.message) || String(e), cause: String((e && e.cause && (e.cause.code || e.cause.message)) || '') };
  }
  /* 逐个核对配置的产品在 Creem 上的真实标价。这是「界面写 US$5、收银台却收 US$4」
   * 这类事故的唯一可靠防线：两边数字只有 Creem 说了算。失败不影响上面的连通性结论。 */
  const ids = [['pro', c.productId]].concat(Object.keys(c.packs).map((id) => [`credits_${c.packs[id]}`, id]));
  for (const [label, id] of ids) {
    if (!id) continue;
    try {
      const r = await fetch(`${c.base}/v1/products?product_id=${encodeURIComponent(id)}`, { headers: { 'x-api-key': c.apiKey } });
      const j = await r.json().catch(() => null);
      out.products.push({
        label,
        productId: id,
        http: r.status,
        priceCents: j && typeof j.price === 'number' ? j.price : null,
        currency: (j && j.currency) || null,
        name: (j && j.name) || null,
        error: r.ok ? null : String((j && (j.message || j.error)) || '').slice(0, 120) || 'not found',
      });
    } catch (e) {
      out.products.push({ label, productId: id, http: 0, error: (e && e.message) || String(e) });
    }
  }
  return sendJson(res, 200, out);
}

/** Creem 的 product 字段在不同事件里可能是字符串 id，也可能是对象。统一取 id。 */
function productIdOf(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') return String(v.id || '').trim();
  return '';
}

/** 把 Creem 事件翻译成「开通」或「回收」两种动作。
 *  取消分两种：scheduled_cancel 是「到期不续」，当期仍可用 → 不动有效期；
 *  canceled / expired / refund.created 才立即回收。past_due 只是扣款失败待重试，先不动。 */
function readCreemEvent(evt) {
  const type = String((evt && evt.eventType) || '');
  const obj = (evt && evt.object) || {};
  const sub = obj.subscription && typeof obj.subscription === 'object' ? obj.subscription : null;
  const md = obj.metadata || (sub && sub.metadata) || {};
  const uid = String(md.uid || md.userId || '').trim();
  const customerEmail = String((obj.customer && obj.customer.email) || (sub && sub.customer && sub.customer.email) || '').trim();
  const periodEnd = String(
    (sub && sub.current_period_end_date) || obj.current_period_end_date || ''
  ).trim();
  const order = obj.order && typeof obj.order === 'object' ? obj.order : null;
  const amount = Number((order && order.amount_paid) || (order && order.amount) || (obj.last_transaction && obj.last_transaction.amount) || 0);
  // 产品归属：order.product / subscription.product / object.product 逐级回退
  const productId = productIdOf(order && order.product)
    || productIdOf(sub && sub.product)
    || productIdOf(obj.product)
    || productIdOf(evt && evt.product);

  const base = {
    type,
    uid,
    email: customerEmail,
    productId,
    metaKind: String(md.kind || '').trim(),
    /** 结账时由本函数写入的积分量（metadata 是服务端填的，不是前端直传）；
     *  只在事件里拿不到产品 ID 时用于兜底，且必须命中白名单里的某一档。 */
    metaPoints: Math.round(Number(md.points || 0) || 0),
    quantity: Math.max(1, Math.round(Number((order && order.quantity) || 1) || 1)),
    amount: Number.isFinite(amount) ? Math.round(amount) : null,
    currency: String((order && order.currency) || (obj.last_transaction && obj.last_transaction.currency) || '').trim() || null,
    orderId: String((order && order.id) || (obj.last_transaction && obj.last_transaction.order) || obj.id || '').trim() || null,
    // subscription.* 事件的 object 本身就是订阅，此时 id 才是订阅 ID
    subscriptionId: String(
      (sub && sub.id)
      || (typeof obj.subscription === 'string' ? obj.subscription : '')
      || (type.startsWith('subscription.') ? obj.id : '')
      || ''
    ).trim() || null,
    periodEnd: periodEnd || null,
  };

  if (type === 'checkout.completed') return { ...base, kind: 'grant', status: 'paid' };
  if (type === 'subscription.paid' || type === 'subscription.active' || type === 'subscription.trialing') {
    return { ...base, kind: 'grant', status: 'paid' };
  }
  if (type === 'subscription.canceled') return { ...base, kind: 'revoke', status: 'canceled' };
  if (type === 'subscription.expired' || type === 'subscription.unpaid') return { ...base, kind: 'revoke', status: 'expired' };
  if (type === 'refund.created') return { ...base, kind: 'revoke', status: 'refunded' };
  // scheduled_cancel / past_due / update / dispute.created：只记录，不改有效期
  return { ...base, kind: null, status: null };
}

async function handleCreemWebhook(req, res) {
  const c = payCfg();
  if (!c.webhookSecret || !c.applySecret) {
    console.error('[pay] webhook 未配置 secret，拒绝处理');
    return sendJson(res, 500, { error: { message: 'webhook secret not configured' } });
  }

  let raw;
  try { raw = await readRawBody(req); } catch (e) {
    return sendJson(res, 413, { error: { message: (e && e.message) || 'body too large' } });
  }

  const v = creemSignatureValid(raw, req.headers['creem-signature']);
  if (!v.ok) {
    console.error('[pay] webhook 验签失败：', v.reason);
    return sendJson(res, 401, { error: { message: v.reason } });
  }

  let evt;
  try { evt = JSON.parse(raw.toString('utf8')); } catch {
    return sendJson(res, 400, { error: { message: 'invalid json' } });
  }

  const e = readCreemEvent(evt);
  const eventId = String(evt.id || '').trim();
  if (!eventId) return sendJson(res, 400, { error: { message: 'missing event id' } });

  if (!e.kind) {
    console.log('[pay] 事件忽略（不改有效期）：', e.type);
    return sendJson(res, 200, { ok: true, ignored: true });
  }

  // 拿不到 uid 说明会话不是本函数创建的（例如后台手工开单）。
  // 过去这里会落到 unresolved:xxx 造一行假账号，纯积分制下改成「记日志 + 返回 200」：
  // 返回 5xx 只会让 Creem 反复重投同一件处理不了的事，记账更不能记到不存在的账号上。

  // 纯积分制：所有付款事件最终都只落「积分」，不再写会员身份 / 有效期。
  // 判定只认产品 ID → 白名单里查这一档发多少积分；metadata.kind 仅在拿不到产品 ID 时兜底
  // （metadata 是前端声明，可被伪造；产品 ID 是付款时 Creem 认定的，改不了）。
  const packPoints = (e.productId && c.packs[e.productId]) || 0;
  const isCredits = packPoints > 0 || (!e.productId && e.metaKind === 'credits');

  // 历史会员订阅（老订单 / 尚未取消的自动续费）仍会推事件过来。
  // 不能返回 5xx（Creem 会无限重投），也不能改 period_end（纯积分制没有会员），
  // 统一折算成积分入账：$5/月 ≈ 350 积分，与积分包 US$14/1000 的单价接近。
  const isLegacyPro = (!!c.productId && !!e.productId && e.productId === c.productId)
    || (!e.productId && (e.metaKind === 'pro' || !!e.subscriptionId));
  const LEGACY_PRO_CREDITS = 350;

  if (!isCredits && isLegacyPro) {
    // 取消 / 过期 / 退款不扣回已发积分：积分可能已被用掉，扣回会产生负余额和说不清的账。
    // 只记 payments 留痕，返回 200，交由运营人工核对。
    if (e.kind !== 'grant') {
      console.log('[pay] 历史会员事件（不扣积分）：', e.type, 'order=' + e.orderId);
      return sendJson(res, 200, { ok: true, ignored: true, legacyPro: true });
    }
    if (!e.uid) {
      console.error('[pay] 历史会员付款缺少 uid，需人工补积分：order=' + e.orderId, 'email=' + e.email);
      return sendJson(res, 200, { ok: true, needsManual: true });
    }
    try {
      const out = await payApply({
        p_secret: c.applySecret,
        p_owner_id: e.uid,
        p_event_id: eventId,
        p_credits: LEGACY_PRO_CREDITS,
        p_amount: e.amount,
        p_currency: e.currency,
        p_order_id: e.orderId,
        p_raw: evt,
      }, 'lunasol_credits_apply');
      if (!out || out.ok !== true) {
        console.error('[pay] 历史会员折算积分被拒：', JSON.stringify(out).slice(0, 200));
        return sendJson(res, 500, { error: { message: 'legacy credits apply rejected' } });
      }
      console.log('[pay] 历史会员订阅已折算积分', 'credits=' + LEGACY_PRO_CREDITS, out.duplicate ? '(重复)' : '');
      return sendJson(res, 200, { ok: true, kind: 'credits', credits: LEGACY_PRO_CREDITS, duplicate: Boolean(out.duplicate) });
    } catch (err) {
      console.error('[pay] 历史会员折算积分失败：', (err && err.message) || err);
      return sendJson(res, 500, { error: { message: 'legacy credits apply failed' } });
    }
  }

  if (isCredits) {
    // 没有 uid 就不知道该给谁加积分。绝不能落到 unresolved:xxx 这种假账号上，
    // 那会凭空建出一行积分账；记日志留痕，返回 200 避免 Creem 反复重投。
    if (!e.uid) {
      console.error('[pay] 积分包事件缺少 uid，需人工补积分：order=' + e.orderId, 'email=' + e.email);
      return sendJson(res, 200, { ok: true, needsManual: true });
    }
    const sign = e.kind === 'revoke' ? -1 : 1;
    // 发放量优先级：产品 ID 查白名单（权威）→ metadata.points（服务端结账时写入，
    // 且必须正好等于白名单里的某一档）→ CREEM_CREDITS_PER_PACK 固定兜底。
    // 加这一层是因为部分事件不保证带 product；若直接落到固定兜底，
    // US$1/100 的体验档会被当成 1000 积分发放。
    const metaCredits = Object.keys(c.packs).some((id) => c.packs[id] === e.metaPoints) ? e.metaPoints : 0;
    const perPack = packPoints || metaCredits || c.creditsPerPack;
    const credits = sign * perPack * (sign > 0 ? e.quantity : 1);
    try {
      const out = await payApply({
        p_secret: c.applySecret,
        p_owner_id: e.uid,
        p_event_id: eventId,
        p_credits: credits,
        p_amount: e.amount,
        p_currency: e.currency,
        p_order_id: e.orderId,
        p_raw: evt,
      }, 'lunasol_credits_apply');
      if (!out || out.ok !== true) {
        console.error('[pay] 积分落库被拒：', JSON.stringify(out).slice(0, 200));
        return sendJson(res, 500, { error: { message: 'credits apply rejected' } });
      }
      console.log('[pay] 积分已处理', e.type, 'credits=' + credits, 'uid=' + (e.uid ? e.uid.slice(0, 8) + '…' : 'none'), out.duplicate ? '(重复)' : '');
      return sendJson(res, 200, { ok: true, kind: 'credits', credits, duplicate: Boolean(out.duplicate) });
    } catch (err) {
      console.error('[pay] 积分落库失败：', (err && err.message) || err);
      return sendJson(res, 500, { error: { message: 'credits apply failed' } });
    }
  }

  // 退款事件最容易搞错：Creem 的 refund 对象不一定带 product。若无法判断产品，
  // 绝不能按「会员退款」处理，只记录日志留给人工核对。
  if (e.type === 'refund.created' && !e.productId) {
    console.error('[pay] 退款事件无法判断产品，需人工处理：order=' + e.orderId, ' sub=' + e.subscriptionId + ' uid=' + (e.uid ? e.uid.slice(0, 8) + '…' : 'none'));
    return sendJson(res, 200, { ok: true, needsManual: true });
  }

  // 已知产品 ID 但不属于本站任何产品：不是本函数开的单，不动数据库
  console.log('[pay] 未知产品，忽略：', e.productId || '(none)');
  return sendJson(res, 200, { ok: true, ignored: true });
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
      provider: 'ark',
      model: DEFAULT_CHAT_MODEL,
      keyConfigured: Boolean(arkKey()),
      chatModels: Object.keys(CHAT_MODELS),
      defaultChatModel: DEFAULT_CHAT_MODEL,
      chatPeakHour: isPeakHour(),
      tokenRequired: Boolean(process.env.LUNASOL_PROXY_TOKEN),
      imageGeneration: Boolean(process.env.SEEDREAM_API_KEY),
      imageProvider: process.env.SEEDREAM_API_KEY ? 'seedream' : 'none',
      gptImageEnabled: Boolean(process.env.BAI_API_KEY),
      hyper3dEnabled: Boolean(process.env.SEEDREAM_API_KEY),
      limits: { ratePerMinute: RATE_PER_MINUTE, dailyLimit: DAILY_LIMIT, dailyUsed: dayUsed, chatTurnsPerDay: CHAT_TURNS_PER_DAY, requireOrigin: REQUIRE_ORIGIN },
      pay: {
        configured: Boolean(payCfg().apiKey && payCfg().productId),
        webhookReady: Boolean(payCfg().webhookSecret && payCfg().applySecret),
        testMode: payCfg().test,
        productId: payCfg().productId || '',
        creditsConfigured: Boolean(payCfg().apiKey && Object.keys(payCfg().packs).length),
        creditPacks: Object.keys(payCfg().packs).map((id) => ({ productId: id, points: payCfg().packs[id] })),
        creditsPerPack: payCfg().creditsPerPack,
      },
      // 出图前的内容审核状态：支付通道审核会核对这一项是否真的在跑
      moderation: {
        provider: 'creem',
        configured: Boolean(payCfg().apiKey),
        enforced: String(process.env.MODERATION_ENFORCE || '1') !== '0',
        failClosed: String(process.env.MODERATION_STRICT || '1') !== '0',
      },
    });
  }

  if (req.method === 'POST' && pathname.endsWith('/pay/checkout')) {
    return handlePayCheckout(req, res);
  }
  if (req.method === 'POST' && pathname.endsWith('/pay/creem/webhook')) {
    return handleCreemWebhook(req, res);
  }
  if (pathname.endsWith('/pay/diag')) {
    return handlePayDiag(req, res);
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
