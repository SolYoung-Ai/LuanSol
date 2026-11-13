/* ============================================================
 * 对话模型目录（全站唯一权威）
 * ------------------------------------------------------------
 * 纯积分制（2026-11-14）：界面不再提供语言模型选择，用户只看到「Luna AI」。
 * 这里只保留两档，都由平台在服务端接入，用户不能自行配置：
 *   - ds-v41-flash       日常对话主档
 *   - ds-v41-flash-eco   上游故障时的自动兜底（云函数 resolveChatModel 内部切换）
 *
 * 已下线的 5 款（Kimi / Doubao ×2 / GLM / DeepSeek-V4-pro）曾让用户在
 * 「约还能聊 8 轮 / 219 轮」之间做选择，把内部 token 成本摊到界面上，
 * 与「对外只卖积分、不卖 token」的口径冲突，也和零设计经验用户的任务无关。
 * 旧 localStorage / 旧构建里残留的档位名由 LEGACY_IDS 归一到默认档。
 *
 * 真实模型 ID 只写在云函数 cloudfunctions/lunasol-ai/index.js，
 * 前端只认这里的 id（档位名），避免前端指定厂商模型名绕过白名单。
 *
 * 单价（元/百万 token）仍保留，供云函数回传 cost 与后台成本测算使用；
 * 界面不再展示任何价格、额度或轮数估算。
 * ============================================================ */

/** 单价（元/百万 token）。cache = 前缀缓存命中价。 */
export interface ChatPrice {
  input: number;
  cache: number;
  output: number;
}

export interface ChatModel {
  /** 档位名，随请求发给云函数，云函数映射到真实模型 ID */
  id: string;
  label: string;
  /** 胶囊上的短名 */
  short: string;
  shortEn?: string;
  note: string;
  noteEn: string;
  price: ChatPrice;
  /** 分时定价的高峰价（仅 DeepSeek 系列有） */
  peak?: ChatPrice;
}

export const CHAT_MODELS: readonly ChatModel[] = [
  {
    id: 'ds-v41-flash',
    short: 'V4.1-Flash',
    label: 'DeepSeek-V4.1-Flash',
    note: '日常对话主档',
    noteEn: 'Default model for everyday chat',
    price: { input: 1.0, cache: 0.02, output: 4.0 },
    peak: { input: 2.0, cache: 0.04, output: 8.0 },
  },
  {
    id: 'ds-v41-flash-eco',
    short: 'V4.1-Flash Eco',
    label: 'DeepSeek-V4.1-Flash 经济版',
    note: '主档不可用时的自动兜底',
    noteEn: 'Automatic fallback when the primary model is unavailable',
    price: { input: 0.8, cache: 0.016, output: 3.2 },
    peak: { input: 1.6, cache: 0.032, output: 6.4 },
  },
];

/** 界面与请求统一使用的默认档 */
export const FREE_CHAT_MODEL = 'ds-v41-flash';
/** 上游故障时的兜底档（仅云函数内部使用） */
export const FALLBACK_CHAT_MODEL = 'ds-v41-flash-eco';

/** 旧版本存在 localStorage / 老构建里的档位名 → 现在的档位名。
 *  已下线的档位一律归一到默认档，避免「看起来选了但实际没生效」。 */
const LEGACY_IDS: Record<string, string> = {
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

/** 取档位。取不到时退回默认档，而不是抛错。 */
export function chatModel(id: string | undefined | null): ChatModel {
  const key = id ? (LEGACY_IDS[id] || id) : '';
  return CHAT_MODELS.find((m) => m.id === key) || CHAT_MODELS[0];
}

/** 北京时间是否处于高峰时段（周一至周五 09:00–12:00、14:00–18:00） */
export function isPeakNow(d: Date = new Date()): boolean {
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  const wd = bj.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  const h = bj.getUTCHours() + bj.getUTCMinutes() / 60;
  return (h >= 9 && h < 12) || (h >= 14 && h < 18);
}

/** 当前时段生效的单价 */
export function priceNow(m: ChatModel, d: Date = new Date()): ChatPrice {
  return m.peak && isPeakNow(d) ? m.peak : m.price;
}

/** 按上游返回的 usage 算这次调用真实花了多少钱（元）。
 *  只用于后台成本测算与回归测试，界面不展示。 */
export function costOfUsage(m: ChatModel, usage: ChatUsage | undefined, d: Date = new Date()): number {
  const input = Math.max(0, Number(usage?.prompt_tokens) || 0);
  const cached = Math.min(input, Math.max(0, Number(usage?.prompt_tokens_details?.cached_tokens) || 0));
  const output = Math.max(0, Number(usage?.completion_tokens) || 0);
  const p = priceNow(m, d);
  return ((input - cached) * p.input + cached * p.cache + output * p.output) / 1e6;
}

export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}
