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

/* ---------- 对话模型白名单（2026-11 扩到 7 款） ----------
 * 前端只传「档位名」（如 kimi-k3.1-pro），真实模型 ID 与单价只存在于这张表：
 *  - 传表外的名字一律回落到默认档，绝不按前端给的厂商模型名直连（防绕过白名单）；
 *  - price/peak 用于把上游 usage 折算成人民币回传前端，前端拿它累加「今日额度」。
 *    价格 = 火山方舟「在线推理（常规）」刊例价，单位 元/百万 token，
 *    分时定价只对 DeepSeek 两档有效：高峰 = 周一至周五 09:00–12:00、14:00–18:00（北京时间）。
 * 改这里必须同步 src/cloud/chatModels.ts（前端目录与展示口径）。
 */
const DEFAULT_CHAT_MODEL = 'ds-v41-flash';
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
  'ds-v4-pro': {
    model: 'deepseek-v4-pro-ga-260813',
    price: { input: 9, cache: 0.3, output: 27 },
  },
  'kimi-k3.1-pro': {
    model: 'kimi-k3-1-pro-261024',
    price: { input: 13, cache: 1.3, output: 68 },
    // Kimi-K3.1-Pro 只接受 temperature=1，传其他值直接 400
    temperature: 1,
  },
  'doubao-2.1-lite': {
    model: 'doubao-seed-2-1-lite-260915',
    price: { input: 0.8, cache: 0.16, output: 2.7 },
  },
  'doubao-2.1-turbo': {
    model: 'doubao-seed-2-1-turbo-260628',
    price: { input: 3, cache: 0.6, output: 15 },
  },
  'glm-5.3-flash': {
    model: 'glm-5-3-flash-260828',
    price: { input: 0.8, cache: 0.23, output: 2.8 },
  },
};

/** 旧构建 / 老用户本地缓存里的档位名 → 新档位。
 *  不做这一步，用户带着 'deepseek-chat' 进来会收到「未知模型」而不是默认档。 */
const LEGACY_CHAT_MODELS = {
  'deepseek-chat': 'ds-v41-flash',
  'deepseek-reasoner': 'ds-v41-flash',
  'deepseek-flash': 'ds-v41-flash',
  'kimi-k3.1': 'kimi-k3.1-pro',
  'doubao-seed-pro': 'doubao-2.1-turbo',
  'doubao-seed-lite': 'doubao-2.1-lite',
  'doubao-seed-turbo': 'doubao-2.1-turbo',
  'glm-5.3': 'glm-5.3-flash',
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
 * 但前端扣分不同（86 / 93）——映射写错就会扣错积分，改动前先核对这张表。
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
    const m = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(opts.dataUrl || '');
    if (!m) { reject(new Error('参考图格式不正确')); return; }
    const mime = m[1];
    const buf = Buffer.from(m[2], 'base64');
    const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const boundary = `----lunasol${Date.now().toString(16)}`;
    const chunks = [];
    const pushText = (s) => chunks.push(Buffer.from(s, 'utf8'));
    pushText(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${route.model}\r\n`);
    pushText(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${opts.prompt}\r\n`);
    pushText(`--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n${opts.size || '1024x1024'}\r\n`);
    pushText(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="ref.${ext}"\r\nContent-Type: ${mime}\r\n\r\n`);
    chunks.push(buf);
    pushText(`\r\n--${boundary}--\r\n`);
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

  const hasRef = typeof body.image === 'string' && body.image.startsWith('data:image/');
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
      ...(hasRef ? { image: body.image } : {}),
    };

  try {
    dayUsed += 1;
    let r;
    if (route.provider === 'bai') {
      r = tier === 'gpt2-ref'
        ? await callBaiImageEdit(route, { prompt, dataUrl: body.image, size })
        : await callBaiImage(route, payload);
    } else {
      r = await callSeedream(payload);
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
  const verdict = guard(req);
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
    // cost 由服务端按 usage × 单价算好：前端拿它记「今日额度」，不再自己估
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
 * 环境变量（全部只存云函数，绝不进前端）：
 *   CREEM_API_KEY              Creem 后台 Developers 页
 *   CREEM_WEBHOOK_SECRET       Webhooks 端点详情页
 *   CREEM_PRODUCT_ID           会员（订阅）产品 prod_xxx
 *   CREEM_CREDITS_PRODUCT_ID   积分包（一次性）产品 prod_xxx
 *   CREEM_CREDITS_PER_PACK     每份积分包含多少积分（默认 1000）
 *   PAY_APPLY_SECRET           本函数与数据库函数共享的落库口令
 *   CREEM_TEST_MODE=1          走 test-api.creem.io
 *   PAY_SUCCESS_URL            支付成功后跳回的前端地址（默认正式站点订阅页）
 *
 * 两个产品怎么区分：**只认产品 ID 白名单**，不认前端传来的任何金额或名称。
 * 前端只能传 kind='pro' | 'credits'，具体对应哪个 prod_ 由这里决定——
 * 否则用户改一个请求体就能用积分包的价格买到会员。
 */
const crypto = require('crypto');
const PAY_ENV_ID = 'solyoung-d4gpp1f7s4e075f6d';
// publishable key 是公开值（前端 .env 里本来就有），这里只用于调本环境的数据库函数。
// 真正兜底的权限在数据库函数里：没有 PAY_APPLY_SECRET 无法开通任何人。
// publishable key 是公开值（前端 .env 里本来就有），作为兜底内置，用户不必再配一项。
const PAY_PUBLISHABLE_KEY_DEFAULT = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjdhMWU4NzFjLTJjNzMtNDY4Yy04OTQ5LTVlMjMyNDFjM2MxNyJ9.eyJpc3MiOiJodHRwczovL3NvbHlvdW5nLWQ0Z3BwMWY3czRlMDc1ZjZkLmFwLXNoYW5naGFpLnRjYi1hcGkudGVuY2VudGNsb3VkYXBpLmNvbSIsInN1YiI6ImFub24iLCJhdWQiOiJzb2x5b3VuZy1kNGdwcDFmN3M0ZTA3NWY2ZCIsImV4cCI6NDA5NTgyMjQ2MywiaWF0IjoxNzkyMTM5MjYzLCJub25jZSI6IjNKMmNFOXJKUkZXMllOSF9MbkIyMUEiLCJhdF9oYXNoIjoiM0oyY0U5ckpSRlcyWU5IX0xuQjIxQSIsIm5hbWUiOiJBbm9ueW1vdXMiLCJzY29wZSI6ImFub255bW91cyIsInByb2plY3RfaWQiOiJzb2x5b3VuZy1kNGdwcDFmN3M0ZTA3NWY2ZCIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJyb2xlIjoiYW5vbiIsImlzX2Fub255bW91cyI6dHJ1ZSwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiYW5vbnltb3VzIiwicHJvdmlkZXJzIjpbImFub255bW91cyJdfSwidXNlcl9tZXRhZGF0YSI6eyJuYW1lIjoiQW5vbnltb3VzIn0sInVzZXJfdHlwZSI6IiIsImNsaWVudF90eXBlIjoiY2xpZW50X3VzZXIiLCJpc19zeXN0ZW1fYWRtaW4iOmZhbHNlfQ.Xeks40kq-23Qryw8_XNQbtQOIIP-NmirzVl3ynZ9VhorEdoXL_BjHZpBxXwYsSA7MufdoM14XH9zAxMF031471IbMcyAp5SxYpZ6V0Q3pbvVovyK0ndirDV2C4PFdrhNNHaAKiIFSsKuV-uwcm9FJKRR-KoMK8GSuTImUN7GALieYx3AtBv84hhM-ODw9raRp5oLgcqe5CSLqw6fj2BcEhk78i5EJ5nqdF_i4ESk3ff5t-k4klpalyYVIaK9GUwXWhg6H8r4JYnku8N2AjYzVUq4_pLz9s3EtHMTYn7lYu4H8jK-SqkC86EQKlbGSPYmKqjqkISdqWpkuNUC--BWNA';
const PAY_PUBLISHABLE_KEY = process.env.LUNASOL_PG_ANON_KEY || PAY_PUBLISHABLE_KEY_DEFAULT;

function payCfg() {
  const test = String(process.env.CREEM_TEST_MODE || '') === '1';
  const creditsPerPack = Number(process.env.CREEM_CREDITS_PER_PACK || '') || 1000;
  return {
    apiKey: String(process.env.CREEM_API_KEY || '').trim(),
    webhookSecret: String(process.env.CREEM_WEBHOOK_SECRET || '').trim(),
    applySecret: String(process.env.PAY_APPLY_SECRET || '').trim(),
    productId: String(process.env.CREEM_PRODUCT_ID || '').trim(),
    creditsProductId: String(process.env.CREEM_CREDITS_PRODUCT_ID || '').trim(),
    creditsPerPack: Math.max(1, Math.min(1000000, Math.round(creditsPerPack))),
    test,
    base: test ? 'https://test-api.creem.io' : 'https://api.creem.io',
    successUrl: String(process.env.PAY_SUCCESS_URL || 'https://luna.solyoung.top/#/subscribe?paid=1').trim(),
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

  // 产品只认服务端白名单：前端传什么 kind 决定买哪个 prod_，传金额一律无效
  const kind = String(body.kind || 'pro') === 'credits' ? 'credits' : 'pro';
  const productId = kind === 'credits' ? c.creditsProductId : c.productId;
  if (!productId) {
    return sendJson(res, 503, {
      error: { message: kind === 'credits' ? '积分包还没配置产品 ID，请先联系客服' : '会员产品还没配置完整' },
    });
  }

  const payload = {
    product_id: productId,
    success_url: c.successUrl,
    metadata: { uid, kind },
  };
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) payload.customer = { email };

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
    return sendJson(res, 200, { ok: true, url: data.checkout_url, id: data.id || '', kind });
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
  const out = { base: c.base, hasKey: Boolean(c.apiKey), dns: null, http: null };
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

  // 拿不到 uid 说明会话不是本函数创建的（例如后台手工开单）。落一条待人工处理的记录，
  // 仍然返回 200 —— 返回 5xx 只会让 Creem 反复重投同一件处理不了的事。
  const owner = e.uid || `unresolved:${e.email || e.subscriptionId || 'unknown'}`;

  // 积分包与会员走不同落库函数：积分包加 bonus_credits，会员改 period_end。
  // 判定只认产品 ID，metadata.kind 仅作参考（metadata 是前端声明，可被伪造）。
  const isCredits = (Boolean(c.creditsProductId) && e.productId === c.creditsProductId)
    || (!e.productId && e.metaKind === 'credits');

  if (isCredits) {
    // 没有 uid 就不知道该给谁加积分。绝不能落到 unresolved:xxx 这种假账号上，
    // 那会凭空建出一行订阅；记日志留痕，返回 200 避免 Creem 反复重投。
    if (!e.uid) {
      console.error('[pay] 积分包事件缺少 uid，需人工补积分：order=' + e.orderId, 'email=' + e.email);
      return sendJson(res, 200, { ok: true, needsManual: true });
    }
    const sign = e.kind === 'revoke' ? -1 : 1;
    const credits = sign * c.creditsPerPack * (sign > 0 ? e.quantity : 1);
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

  // 退款事件最容易搞错：Creem 的 refund 对象不一定带 product。若无法判断退的是
  // 会员还是积分包，绝不能按「会员退款」处理——那会把还在有效期内的会员直接掐掉。
  // 这类事件只记录日志，留给人工核对。
  if (e.type === 'refund.created' && !e.productId) {
    console.error('[pay] 退款事件无法判断产品，需人工处理：order=' + e.orderId, ' sub=' + e.subscriptionId + ' uid=' + (e.uid ? e.uid.slice(0, 8) + '…' : 'none'));
    return sendJson(res, 200, { ok: true, needsManual: true });
  }

  // 已知产品 ID 但不属于本站任何产品：不是本函数开的单，不动数据库
  if (e.productId && c.productId && e.productId !== c.productId) {
    console.log('[pay] 未知产品，忽略：', e.productId);
    return sendJson(res, 200, { ok: true, ignored: true });
  }

  try {
    const out = await payApply({
      p_secret: c.applySecret,
      p_owner_id: owner,
      p_event_id: eventId,
      p_status: e.status,
      p_kind: e.kind,
      p_period_end: e.periodEnd,
      p_amount: e.amount,
      p_currency: e.currency,
      p_order_id: e.orderId,
      p_subscription_id: e.subscriptionId,
      p_raw: evt,
    });
    if (!out || out.ok !== true) {
      console.error('[pay] 落库被拒：', JSON.stringify(out).slice(0, 200));
      return sendJson(res, 500, { error: { message: 'apply rejected' } });
    }
    console.log('[pay] 已处理', e.type, 'kind=' + e.kind, 'uid=' + (e.uid ? e.uid.slice(0, 8) + '…' : 'none'), out.duplicate ? '(重复事件)' : '');
    return sendJson(res, 200, { ok: true, kind: e.kind, duplicate: Boolean(out.duplicate) });
  } catch (err) {
    // 落库失败必须让 Creem 重试，否则用户付了钱没开通
    console.error('[pay] 落库失败：', (err && err.message) || err);
    return sendJson(res, 500, { error: { message: 'apply failed' } });
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
      limits: { ratePerMinute: RATE_PER_MINUTE, dailyLimit: DAILY_LIMIT, dailyUsed: dayUsed, requireOrigin: REQUIRE_ORIGIN },
      pay: {
        configured: Boolean(payCfg().apiKey && payCfg().productId),
        webhookReady: Boolean(payCfg().webhookSecret && payCfg().applySecret),
        testMode: payCfg().test,
        productId: payCfg().productId || '',
        creditsConfigured: Boolean(payCfg().apiKey && payCfg().creditsProductId),
        creditsProductId: payCfg().creditsProductId || '',
        creditsPerPack: payCfg().creditsPerPack,
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
