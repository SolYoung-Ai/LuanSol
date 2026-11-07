/* OpenAI 兼容接口客户端。
 * 正式接入：CloudBase 国内站云函数代理 DeepSeek，厂商密钥保存在云函数环境变量。
 * 前端只持有公开的网关地址与代理令牌；源码、Git、浏览器存储里都没有厂商 API Key。
 * 「浏览器直连」模式仅用于个人本机：Key 存在用户自己浏览器的 localStorage。 */
import type { AISettings } from '../types';
import { CLOUD, deepSeekPreset, deepSeekReady } from '../cloud/config';
import { getAIGate, reportAIUsage } from '../ai/gate';

const preset = deepSeekReady ? deepSeekPreset() : null;

export const DEFAULT_AI: AISettings = {
  mode: preset ? 'proxy' : 'off',
  baseUrl: preset ? preset.baseUrl : 'https://api.openai.com/v1',
  apiKey: '',
  proxyToken: preset ? preset.proxyToken : '',
  // 代理模式留空由后台决定模型；浏览器直连使用默认 OpenAI 兼容模型名
  textModel: preset ? '' : 'gpt-4o-mini',
  imageModel: 'gpt-image-1',
  // DeepSeek 只提供文本模型，不伪造图像生成能力
  imageEnabled: false,
  temperature: 0.7,
  retries: 2,
  lastTest: null,
};

/** 一键切回已部署的 DeepSeek 后台代理；设置页与首次引导复用。 */
export function applyDeepSeekProxy(s: AISettings): AISettings {
  if (!deepSeekReady) return s;
  return {
    ...s,
    mode: 'proxy',
    baseUrl: CLOUD.aiBaseUrl,
    proxyToken: CLOUD.aiToken,
    apiKey: '',
    textModel: '',
    imageEnabled: false,
    lastTest: null,
  };
}

export const isDeepSeekProxy = (s: AISettings) =>
  deepSeekReady && aiMode(s) === 'proxy' && s.baseUrl.trim().replace(/\/+$/, '') === CLOUD.aiBaseUrl;

/** 配置版本：V3.2 起默认接入已部署的 DeepSeek 后台代理。
 *  老用户浏览器里存着 V3.1 的 mode:'off'，需要一次性升级，
 *  但用户之后主动关掉 AI 时（rev 已是新值）必须被尊重。 */
export const AI_REV = 3;

export function migrateAI(s: AISettings): AISettings {
  const rev = s.rev ?? 1;
  if (rev >= AI_REV) return s;
  const next: AISettings = { ...s, rev: AI_REV };
  // 强制更新代理令牌：安全加固后轮换了令牌，所有老用户都要重新同步
  if (deepSeekReady && s.mode === 'proxy') {
    return { ...applyDeepSeekProxy(next), rev: AI_REV };
  }
  const neverConfigured = !s.apiKey.trim() && (!s.mode || s.mode === 'off');
  if (neverConfigured && deepSeekReady) return { ...applyDeepSeekProxy(next), rev: AI_REV };
  return next;
}

const KEY = 'lunasol.ai.v1';

export function loadAI(): AISettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_AI };
    const parsed = JSON.parse(raw) as Partial<AISettings>;
    const merged = { ...DEFAULT_AI, ...parsed };
    // 兼容旧版本配置：以前没有 mode 字段，按是否填过 Key 推断
    if (!parsed.mode) merged.mode = merged.apiKey.trim() ? 'browser' : 'off';
    return migrateAI(merged);
  } catch { return { ...DEFAULT_AI }; }
}
export function saveAI(s: AISettings) { localStorage.setItem(KEY, JSON.stringify(s)); }

/** 当前接入模式。后台代理模式不需要前端保存模型厂商密钥。 */
export const aiMode = (s: AISettings): AISettings['mode'] =>
  s.mode || (s.apiKey.trim() ? 'browser' : 'off');

/** 全站唯一的「AI 是否已启用」判定。所有 AI 能力都走这里，
 *  后台代理接好后只需在设置页切到 proxy 并填地址，全站立即生效。 */
export function aiEnabled(s: AISettings): boolean {
  const m = aiMode(s);
  if (m === 'off' || !s.baseUrl.trim()) return false;
  if (m === 'proxy') return true;                 // 密钥与模型都在后台
  return Boolean(s.apiKey.trim());               // 浏览器直连
}
/** 保持原有导出名，让旧调用点自动获得代理模式支持 */
export const aiConfigured = aiEnabled;

export const aiStatusLabel = (s: AISettings): string => {
  if (!aiEnabled(s)) return '本地建议 · 未调用 AI';
  const m = aiMode(s);
  if (m === 'proxy') return 'AI 已接入 · 多模型（DeepSeek / Kimi / Doubao-Seed）';
  return `AI 已接入 · ${s.textModel.trim() || '自定义模型'}`;
};

/** 构造鉴权头：代理模式不发厂商 Key，可选发一个自有令牌 */
function authHeaders(s: AISettings): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const m = aiMode(s);
  if (m === 'browser') h.Authorization = `Bearer ${s.apiKey.trim()}`;
  if (m === 'proxy' && s.proxyToken?.trim()) h['X-LunaSol-Token'] = s.proxyToken.trim();
  // CloudBase 登录态：云函数 guard 校验用
  if (s.cloudbaseUid?.trim()) h['X-CloudBase-Uid'] = s.cloudbaseUid.trim();
  return h;
}

function endpoint(base: string, path: string) {
  const b = base.trim().replace(/\/+$/, '');
  return b.endsWith('/chat/completions') ? b.replace(/\/chat\/completions$/, path) : b + path;
}

async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= Math.max(0, retries); i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw last;
}

export type LLMMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function llmChat(messages: LLMMessage[], s: AISettings, json = false): Promise<string> {
  if (!aiEnabled(s)) throw new Error('尚未启用 AI 接入');
  const model = s.textModel.trim();
  return withRetry(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
      const res = await fetch(endpoint(s.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: authHeaders(s),
        body: JSON.stringify({
          // 代理模式下留空则由后台决定模型，前端不假设具体模型名
          ...(model ? { model } : {}),
          messages,
          temperature: s.temperature,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        // 优化错误提示，让用户更容易理解
        if (res.status === 401) throw new Error('登录已过期，请重新登录');
        if (res.status === 402) throw new Error(`积分不足：${t.slice(0, 100)}`);
        if (res.status === 429) throw new Error('请求太频繁，请稍后再试');
        if (res.status >= 500) throw new Error('AI 服务暂时不可用，请稍后再试');
        throw new Error(`接口返回 ${res.status}：${t.slice(0, 120)}`);
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('AI 没有返回内容，请换个说法试试');
      return content;
    } catch (e) {
      // 网络错误（Failed to fetch）优化提示
      if (e instanceof TypeError && e.message.includes('Failed to fetch')) {
        throw new Error('网络连接失败，请检查网络后重试');
      }
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw new Error('请求超时，AI 响应太慢，请稍后再试');
      }
      throw e;
    } finally { clearTimeout(timer); }
  }, s.retries);
}

export async function llmJson<T>(messages: LLMMessage[], s: AISettings): Promise<T> {
  const raw = await llmChat(messages, s, true);
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('模型未返回 JSON');
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

export async function llmImage(prompt: string, s: AISettings): Promise<{ src: string; naturalW: number; naturalH: number }> {
  if (!aiEnabled(s)) throw new Error('尚未启用 AI 接入');
  // 订阅 / 登录闸门：图像生成同样消耗额度
  const gate = getAIGate();
  if (gate) {
    const g = await gate('image');
    if (!g.ok) throw new Error(g.reason || '需要订阅后使用 AI 功能');
  }
  return withRetry(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
      const res = await fetch(endpoint(s.baseUrl, '/images/generations'), {
        method: 'POST',
        headers: authHeaders(s),
        body: JSON.stringify({ model: s.imageModel.trim() || 'gpt-image-1', prompt, n: 1, size: '1024x1024', response_format: 'b64_json' }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`图像接口返回 ${res.status}：${(await res.text()).slice(0, 180)}`);
      const data = await res.json();
      const item = data?.data?.[0];
      let src: string | undefined;
      if (item?.b64_json) src = `data:image/png;base64,${item.b64_json}`;
      else if (item?.url) {
        const imgRes = await fetch(item.url);
        const blob = await imgRes.blob();
        src = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = reject; fr.readAsDataURL(blob);
        });
      }
      if (!src) throw new Error('图像接口未返回图片');
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = src!; });
      reportAIUsage('image');
      return { src, naturalW: img.naturalWidth, naturalH: img.naturalHeight };
    } finally { clearTimeout(timer); }
  }, s.retries);
}

export async function testConnection(s: AISettings) {
  try {
    const t = await llmChat([{ role: 'user', content: '只回复两个字：正常' }], { ...s, retries: 0 });
    return { ok: true, at: Date.now(), message: `连接正常 · 模型回复：${t.trim().slice(0, 30)}` };
  } catch (e) {
    return { ok: false, at: Date.now(), message: e instanceof Error ? e.message : String(e) };
  }
}
