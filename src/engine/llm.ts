/* OpenAI 兼容接口客户端。
 * 安全说明：LunaSol 是纯静态站点，API Key 只保存在用户本机浏览器 localStorage，
 * 请求由浏览器直连用户自己配置的 Base URL。源码中不含任何密钥。
 * 若需要团队共用密钥，请自行部署服务端代理并把 Base URL 指向代理。 */
import type { AISettings } from '../types';

export const DEFAULT_AI: AISettings = {
  mode: 'off',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  proxyToken: '',
  textModel: 'gpt-4o-mini',
  imageModel: 'gpt-image-1',
  imageEnabled: false,
  temperature: 0.7,
  retries: 1,
  lastTest: null,
};

const KEY = 'lunasol.ai.v1';

export function loadAI(): AISettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_AI };
    const parsed = JSON.parse(raw) as Partial<AISettings>;
    const merged = { ...DEFAULT_AI, ...parsed };
    // 兼容旧版本配置：以前没有 mode 字段，按是否填过 Key 推断
    if (!parsed.mode) merged.mode = merged.apiKey.trim() ? 'browser' : 'off';
    return merged;
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
  return m === 'proxy' ? 'AI 已接入 · 后台代理' : `AI 已接入 · ${s.textModel.trim() || '自定义模型'}`;
};

/** 构造鉴权头：代理模式不发厂商 Key，可选发一个自有令牌 */
function authHeaders(s: AISettings): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const m = aiMode(s);
  if (m === 'browser') h.Authorization = `Bearer ${s.apiKey.trim()}`;
  if (m === 'proxy' && s.proxyToken?.trim()) h['X-LunaSol-Token'] = s.proxyToken.trim();
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
    const timer = setTimeout(() => ctrl.abort(), 60000);
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
        throw new Error(`接口返回 ${res.status}：${t.slice(0, 180)}`);
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('接口未返回文本内容');
      return content;
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
