/* OpenAI 兼容接口客户端。
 * 安全说明：LunaSol 是纯静态站点，API Key 只保存在用户本机浏览器 localStorage，
 * 请求由浏览器直连用户自己配置的 Base URL。源码中不含任何密钥。
 * 若需要团队共用密钥，请自行部署服务端代理并把 Base URL 指向代理。 */
import type { AISettings } from '../types';

export const DEFAULT_AI: AISettings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
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
    return raw ? { ...DEFAULT_AI, ...JSON.parse(raw) } : { ...DEFAULT_AI };
  } catch { return { ...DEFAULT_AI }; }
}
export function saveAI(s: AISettings) { localStorage.setItem(KEY, JSON.stringify(s)); }
export const aiConfigured = (s: AISettings) => Boolean(s.apiKey.trim() && s.baseUrl.trim() && s.textModel.trim());

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
  if (!aiConfigured(s)) throw new Error('尚未配置 AI 模型');
  return withRetry(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(endpoint(s.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey.trim()}` },
        body: JSON.stringify({
          model: s.textModel.trim(),
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
  if (!s.apiKey.trim()) throw new Error('尚未配置 API Key');
  return withRetry(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
      const res = await fetch(endpoint(s.baseUrl, '/images/generations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey.trim()}` },
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
