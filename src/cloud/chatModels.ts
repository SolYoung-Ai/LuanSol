/* ============================================================
 * 对话模型目录（全站唯一权威）
 * ------------------------------------------------------------
 * 为什么要有这个文件：
 *   模型名、是否会员专属、单价、每日额度、界面文案以前散在
 *   useChatStore / luna.tsx / 云函数三处，改一处忘一处就会出现
 *   「界面说便宜、实际扣最贵的那档」。现在界面与额度计算都从这里取。
 *
 * 价格口径：火山方舟「在线推理（常规）」刊例价，单位 元/百万 token。
 *   https://www.volcengine.com/docs/82379/1099320 （2026-11 核对）
 *   DeepSeek 系列分时定价：高峰 = 周一至周五 09:00–12:00、14:00–18:00（北京时间），
 *   其余为空闲时段，高峰单价是空闲的两倍。deepseek-v4-1-flash 的两个档位都有分时价，
 *   所以这里额外存一份 peak，估算与结算都按请求完成时的时段取价。
 *
 * 真实模型 ID 只写在云函数 cloudfunctions/lunasol-ai/index.js 里，
 * 前端只认这里的 id（档位名），避免前端指定厂商模型名而绕过白名单。
 * 改 id 必须同时改云函数 CHAT_MODELS。
 * ============================================================ */

export type ChatModelTier = 'free' | 'pro';

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
  /** 胶囊上的短名（「对话」旁边显示当前生效的模型） */
  short: string;
  /** 英文界面的短名；缺省时退回 short */
  shortEn?: string;
  /** free = 人人可用；pro = 会员专属（计入每日额度） */
  tier: ChatModelTier;
  note: string;
  /** note 的英文版（界面文案，随语言切换） */
  noteEn: string;
  price: ChatPrice;
  /** 分时定价的高峰价（仅 DeepSeek 系列有） */
  peak?: ChatPrice;
  /** true = 已定价但平台账号尚未开通，界面上灰显「待开通」，不可选 */
  soon?: boolean;
}

/** 每人每天的语言模型预算（元），只对会员专属模型（tier='pro'）计费。
 *  默认的 DeepSeek-V4.1-Flash 不占额度：它是「常用档」，单轮约 ¥0.01，
 *  如果连它也卡住，用户会在聊天中途被硬停——体验上不可接受，成本上也毫无必要。 */
export const CHAT_DAILY_BUDGET_RMB = 1;

/** 估算「一轮对话」的 token 量，只用于「约还能聊几轮」这种提示。
 *  实测口径（2026-11 实测 7 款模型）：人设 + 最近几轮上下文约 1500 输入；
 *  输出要算上思考 token——这些模型先推理再写正文，一句简单提问也会花掉 300–1000
 *  思考 token，只按回答长度估会把「还能聊几轮」高估一倍以上。 */
export const EST_INPUT_TOKENS = 1500;
export const EST_OUTPUT_TOKENS = 1200;

export const CHAT_MODELS: readonly ChatModel[] = [
  {
    id: 'ds-v41-flash',
    short: 'V4.1-Flash',
    label: 'DeepSeek-V4.1-Flash',
    tier: 'free',
    note: '默认常用，日常对话首选',
    noteEn: 'Default model — best for everyday chat',
    price: { input: 1.0, cache: 0.02, output: 4.0 },
    peak: { input: 2.0, cache: 0.04, output: 8.0 },
  },
  {
    id: 'ds-v41-flash-eco',
    short: 'V4.1-Flash 经济',
    shortEn: 'V4.1-Flash Eco',
    label: 'DeepSeek-V4.1-Flash 经济版',
    tier: 'pro',
    note: '同款能力的经济档，更省额度',
    noteEn: 'Same capability, lighter on your daily quota',
    price: { input: 0.8, cache: 0.016, output: 3.2 },
    peak: { input: 1.6, cache: 0.032, output: 6.4 },
  },
  {
    id: 'ds-v4-pro',
    short: 'V4-pro',
    label: 'DeepSeek-V4-pro',
    tier: 'pro',
    note: '正式版，长链条推理更稳',
    noteEn: 'Full version — steadier on long reasoning chains',
    price: { input: 9.0, cache: 0.3, output: 27.0 },
    soon: true,
  },
  {
    id: 'kimi-k3.1-pro',
    short: 'Kimi-K3.1',
    label: 'Kimi-K3.1-Pro',
    tier: 'pro',
    note: '长文与创意更细腻，单价最高',
    noteEn: 'Most nuanced on long copy and creative work',
    price: { input: 13.0, cache: 1.3, output: 68.0 },
  },
  {
    id: 'doubao-2.1-lite',
    short: 'Seed-2.1-lite',
    label: 'Doubao-Seed-2.1-lite',
    tier: 'pro',
    note: '轻快，日常问答性价比高',
    noteEn: 'Fast and cheap for everyday Q&A',
    price: { input: 0.8, cache: 0.16, output: 2.7 },
  },
  {
    id: 'doubao-2.1-turbo',
    short: 'Seed-2.1-turbo',
    label: 'Doubao-Seed-2.1-turbo',
    tier: 'pro',
    note: '响应快，多模态理解更强',
    noteEn: 'Quick responses, stronger multimodal reading',
    price: { input: 3.0, cache: 0.6, output: 15.0 },
  },
  {
    id: 'glm-5.3-flash',
    short: 'GLM-5.3',
    label: 'GLM-5.3-Flash',
    tier: 'pro',
    note: '中文表达自然，排版建议细',
    noteEn: 'Natural Chinese phrasing, detailed layout advice',
    price: { input: 0.8, cache: 0.23, output: 2.8 },
  },
];

/** 免费用户唯一可用的对话模型（也是默认「常用」） */
export const FREE_CHAT_MODEL = 'ds-v41-flash';

/** 旧版本存在 localStorage 里的档位名 → 新档位名。
 *  不迁移的话老用户会带着 'deepseek-chat' 之类的值进来，界面上找不到对应项。 */
const LEGACY_IDS: Record<string, string> = {
  'deepseek-chat': 'ds-v41-flash',
  'deepseek-reasoner': 'ds-v41-flash',
  'deepseek-flash': 'ds-v41-flash',
  'kimi-k3.1': 'kimi-k3.1-pro',
  'doubao-seed-pro': 'doubao-2.1-turbo',
  'doubao-seed-lite': 'doubao-2.1-lite',
  'doubao-seed-turbo': 'doubao-2.1-turbo',
  'glm-5.3': 'glm-5.3-flash',
};

/** 取档位。取不到时退回默认档，而不是抛错——展示与额度计算必须同源同值。 */
export function chatModel(id: string | undefined | null): ChatModel {
  const key = id ? (LEGACY_IDS[id] || id) : '';
  return CHAT_MODELS.find((m) => m.id === key) || CHAT_MODELS[0];
}

/** 该档位现在是否可选（会员 + 未耗尽额度 + 平台已开通） */
export function chatModelUsable(m: ChatModel): boolean {
  return !m.soon;
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

/** 一轮对话的估算成本（元） */
export function estimateTurnCost(m: ChatModel, d: Date = new Date()): number {
  const p = priceNow(m, d);
  return (EST_INPUT_TOKENS * p.input + EST_OUTPUT_TOKENS * p.output) / 1e6;
}

/** 按剩余额度还能聊几轮（向下取整，至少 0） */
export function turnsForBudget(m: ChatModel, rmb: number, d: Date = new Date()): number {
  const c = estimateTurnCost(m, d);
  return c > 0 ? Math.max(0, Math.floor(rmb / c)) : 0;
}

/** 按上游返回的 usage 算这次调用真实花了多少钱（元）。
 *  缓存命中部分按 cache 价算，其余按 input 价——DeepSeek/Kimi 的缓存命中价差 10 倍以上，
 *  全部按 input 价算会把成本高估。 */
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

/** 金额文案：小于 0.1 元时保留三位，避免「已用 ¥0.00」看起来像没花钱 */
export function fmtRMB(n: number): string {
  const v = Math.max(0, Number(n) || 0);
  if (v === 0) return '¥0';
  return v < 0.1 ? `¥${v.toFixed(3)}` : `¥${v.toFixed(2)}`;
}
