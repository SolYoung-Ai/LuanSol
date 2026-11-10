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
  /** 每张扣多少积分（唯一来源：PRICING.costs） */
  cost: number;
  provider: 'ark' | 'bai';
  /** 必须带参考图才能用 */
  needsRef?: boolean;
  /** 一句话说明，写在下拉选项下面 */
  note: string;
  /** false = 已定价但暂未开放（灰显，不可选） */
  open: boolean;
}

export const IMAGE_MODELS: readonly ImageModel[] = [
  {
    id: 'flash',
    label: 'Seedream 5.0 Flash',
    short: 'Flash',
    cost: PRICING.costs.imageFlash,
    provider: 'ark',
    note: '快速出图，方案页批量首选',
    open: true,
  },
  {
    id: 'pro',
    label: 'Seedream 5.0 Pro',
    short: 'Pro',
    cost: PRICING.costs.imagePro,
    provider: 'ark',
    note: '细节更足，仅比 Flash 多 4 积分',
    open: true,
  },
  {
    id: 'gpt2-text',
    label: 'GPT Image 2 · 文字输入',
    short: 'GPT Image 2',
    cost: PRICING.costs.imageGpt2Text,
    provider: 'bai',
    note: '出图质量最高，只用文字描述',
    open: true,
  },
  {
    id: 'gpt2-ref',
    label: 'GPT Image 2 · 输入图',
    short: 'GPT Image 2 图',
    cost: PRICING.costs.imageGpt2Ref,
    provider: 'bai',
    needsRef: true,
    note: '带参考图改图，按图生图计费',
    open: true,
  },
];

/** 目前可选（用于模型下拉，未开放的档位不出现） */
export const OPEN_IMAGE_MODELS = IMAGE_MODELS.filter((m) => m.open);

/** 取档位。取不到时退回第一档而不是抛错：展示与扣费都从这里读同一个对象，
 *  所以「显示 A 档、扣 B 档的钱」在结构上不可能发生。 */
export function imageModel(id: ImageTier | undefined | null): ImageModel {
  return IMAGE_MODELS.find((m) => m.id === id) || IMAGE_MODELS[0];
}

/** 该档位每张扣多少积分 */
export function imageCost(id: ImageTier | undefined | null): number {
  return imageModel(id).cost;
}

/** 下拉 / 气泡用的名称 */
export function imageLabel(id: ImageTier | undefined | null): string {
  return imageModel(id).label;
}

export function imageShort(id: ImageTier | undefined | null): string {
  return imageModel(id).short;
}

/** 3D 生成（Hyper3D-Gen2）目前只定价、未接入界面，价格单独放这里方便后面接 */
export const HYPER3D_COST = PRICING.costs.hyper3d;
