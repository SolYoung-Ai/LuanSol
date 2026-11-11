/* ============================================================
 * 图像模型档位表（全站唯一权威）
 * ------------------------------------------------------------
 * 为什么要有这个文件：档位名、界面文案、扣费金额、后端映射四处
 * 以前各写一份，改一处忘一处就会「界面显示 6 分、实际扣 10 分」。
 * 现在所有地方都从这里取，价格只来自 PRICING.costs 一处。
 *
 * 注意：这里的 id 会原样发给云函数，云函数用同一套 key 决定走哪个厂商：
 *   flash / pro          → 火山方舟 Seedream（SEEDREAM_API_KEY）
 *   gpt2-text / gpt2-ref → B.AI GPT Image 2（BAI_API_KEY，境外中转）
 * 改 id 必须同时改 cloudfunctions/lunasol-ai/index.js 的 imageRoute()。
 * ============================================================ */
import { PRICING } from './plans';
import type { ImageTier } from '../types';

export interface ImageModel {
  id: ImageTier;
  /** 下拉里显示的完整名称 */
  label: string;
  /** 气泡角标 / toast 里的短名 */
  short: string;
  /** 原价：每张扣多少积分（唯一来源：PRICING.costs） */
  listCost: number;
  /** 促销折扣（0.7 = 七折）。只有参加上线活动的档位才有，不填等于不打折。 */
  promoRate?: number;
  /** 实付：每张真正扣多少积分。扣费与界面显示都只用这个值。 */
  cost: number;
  provider: 'ark' | 'bai';
  /** 必须带参考图才能用 */
  needsRef?: boolean;
  /** 一句话说明，写在下拉选项下面 */
  note: string;
  /** 英文说明：界面按语言取，别只留中文 */
  noteEn: string;
  /** false = 已定价但暂未开放（灰显，不可选） */
  open: boolean;
  /** true = 会员专属：免费版看不到也选不了（点它走订阅引导） */
  pro?: boolean;
}

/** 原价 × 折扣 → 实付积分。四舍五入，最少 1 分。
 *  为什么要有这一层：促销随时开始结束，如果直接把折后价写进表里，
 *  活动一停就得手改每一档，改漏一档就是「界面显示 A、实际扣 B」。 */
function payCost(listCost: number, promoRate?: number): number {
  const r = promoRate && promoRate > 0 ? promoRate : 1;
  return Math.max(1, Math.round(listCost * r));
}

export const IMAGE_MODELS: readonly ImageModel[] = [
  {
    id: 'flash',
    label: 'Seedream 5.0 Flash',
    short: 'Flash',
    listCost: PRICING.costs.imageFlash,
    cost: payCost(PRICING.costs.imageFlash),
    provider: 'ark',
    note: '快速出图，方案页批量首选',
    noteEn: 'Fast renders — the batch default on the options page',
    open: true,
  },
  {
    id: 'pro',
    label: 'Seedream 5.0 Pro',
    short: 'Pro',
    listCost: PRICING.costs.imagePro,
    cost: payCost(PRICING.costs.imagePro),
    provider: 'ark',
    note: '细节更足',
    noteEn: 'More detail',
    open: true,
  },
  {
    id: 'gpt2-text',
    label: 'GPT Image 2（文字输入）',
    short: 'GPT Image 2 文字',
    listCost: PRICING.costs.imageGpt2Text,
    promoRate: PRICING.gptImagePromoRate,
    cost: payCost(PRICING.costs.imageGpt2Text, PRICING.gptImagePromoRate),
    provider: 'bai',
    note: '出图质量最高，只用文字描述',
    noteEn: 'Highest quality — text prompt only',
    open: true,
    pro: true,
  },
  {
    id: 'gpt2-ref',
    label: 'GPT Image 2（输入图）',
    short: 'GPT Image 2 改图',
    listCost: PRICING.costs.imageGpt2Ref,
    promoRate: PRICING.gptImagePromoRate,
    cost: payCost(PRICING.costs.imageGpt2Ref, PRICING.gptImagePromoRate),
    provider: 'bai',
    needsRef: true,
    note: '带参考图改图，按图生图计费',
    noteEn: 'Edits from a reference image — billed as image-to-image',
    open: true,
    pro: true,
  },
];

/** 目前可选（用于模型下拉，未开放的档位不出现） */
export const OPEN_IMAGE_MODELS = IMAGE_MODELS.filter((m) => m.open);

/** 取档位。取不到时退回第一档而不是抛错：展示与扣费都从这里读同一个对象，
 *  所以「显示 A 档、扣 B 档的钱」在结构上不可能发生。 */
export function imageModel(id: ImageTier | undefined | null): ImageModel {
  return IMAGE_MODELS.find((m) => m.id === id) || IMAGE_MODELS[0];
}

/** 该档位每张扣多少积分（实付价） */
export function imageCost(id: ImageTier | undefined | null): number {
  return imageModel(id).cost;
}

/** 该档位的原价。没参加促销时等于实付。 */
export function imageListCost(id: ImageTier | undefined | null): number {
  return imageModel(id).listCost;
}

/** 是否在促销中（实付低于原价） */
export function isPromoTier(id: ImageTier | undefined | null): boolean {
  const m = imageModel(id);
  return m.cost < m.listCost;
}

/** 促销标签，如「7 折」。非促销档返回空串。
 *  界面统一用它，避免「86 一度显示五折、一度显示原价」这种自相矛盾的文案。 */
export function imagePromoLabel(id: ImageTier | undefined | null): string {
  const m = imageModel(id);
  if (!m.promoRate || m.cost >= m.listCost) return '';
  // 用折扣率而不是 cost/listCost 反算：四舍五入会让 46/65 变成「7.1 折」，看着像算错了
  const zhe = +((m.promoRate * 10).toFixed(1));
  return `${zhe} 折`;
}

/** 下拉 / 气泡用的名称 */
export function imageLabel(id: ImageTier | undefined | null): string {
  return imageModel(id).label;
}

export function imageShort(id: ImageTier | undefined | null): string {
  return imageModel(id).short;
}

/** 这一档是否会员专属（免费版选不了） */
export function isProOnlyTier(id: ImageTier | undefined | null): boolean {
  return imageModel(id).pro === true;
}

/** 当前身份下真正可用的生图档位：
 *  免费版若还存着会员档（比如会员到期后继续用老会话），一律退回默认 Flash，
 *  绝不拿会员档偷偷下单——那会按会员档的价格扣一个本来不该卖的档位。 */
export function resolveTier(id: ImageTier | undefined | null, isPro: boolean): ImageTier {
  const m = imageModel(id);
  if (m.pro && !isPro) return 'flash';
  return m.id;
}

/** 3D 生成（Hyper3D-Gen2）目前只定价、未接入界面，价格单独放这里方便后面接 */
export const HYPER3D_COST = PRICING.costs.hyper3d;

/** 按语言取说明文字 */
export const imageModelNote = (m: ImageModel, lang: string) => (lang === 'en' ? m.noteEn : m.note);
