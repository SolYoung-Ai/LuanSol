/* ============================================================
 * LunaSol 积分定价（2026-11 改版）
 * ------------------------------------------------------------
 * 计量口径：积分（不是"次"）。
 *   - 新注册送 100 积分
 *   - 包月 ¥29.9（内测推广价）= 会员月度额度 3000 + 签到双倍
 *   - 充值包：¥99=1000 / ¥199=2100 / ¥299=3500
 *   - 消费单价：聊天 0 积分/轮（免费）；Seedream Flash 6 积分/张、Pro 10
 *   - 注意：¥29.9 是内测推广价，按 Flash 的实际单价算，会员额度用满会亏损，
 *     正式定价前请用 buildPlanCalc() 复核毛利，不要在界面里写死价格。
 * ============================================================ */

export const PRICING = {
  proMonthlyPriceRMB: 29.9,
  /** 新注册用户赠送积分 */
  freeTrialUses: 100,
  /** 会员权益：签到双倍（每天 20 积分），不是固定月度积分包 */
  proMonthlyQuota: 3000, // 保留字段兼容，文案改为"签到双倍 + 全部功能解锁"

  /** 充值包 */
  recharge: [
    { price: 99, points: 1000, tag: '入门' },
    { price: 199, points: 2100, tag: '热门' },
    { price: 299, points: 3500, tag: '超值' },
  ] as const,

  /** 每次消费扣减（积分） */
  costs: {
    chat: 0,             // 对话免费（吸引用户聊，靠生图变现）
    imageFlash: 6,       // Seedream 5.0 Flash（成本约 ¥0.12，毛利约 80%）
    imagePro: 10,        // Seedream 5.0 Pro（成本约 ¥0.30，名义毛利约 70%，与 Flash 仅差 4 积分）
  } as const,

  /** 内部管理员邮箱（仅此邮箱可见开发者管理入口） */
  adminEmail: 'solyoungwork@gmail.com',

  estTokensPerCall: { input: 1800, output: 900 },
  usdToRmb: 7.1,

  models: {
    gpt4o: { id: 'gpt-4o', label: 'GPT-4o', inputPer1M: 2.5, cachedInputPer1M: 1.25, outputPer1M: 10 },
    deepseekV3: { id: 'deepseek-chat', label: 'DeepSeek-V3', inputPer1M: 0.28, cachedInputPer1M: 0.028, outputPer1M: 0.42 },
  },
} as const;

export type ModelKey = keyof typeof PRICING.models;

/** 单次 AI 调用的成本（人民币，元）。cacheHitInput=true 时输入按缓存命中价计（DeepSeek 前缀复用）。 */
export function costPerCallRMB(model: ModelKey, opts?: { cacheHitInput?: boolean }): number {
  const m = PRICING.models[model];
  const t = PRICING.estTokensPerCall;
  const inputRate = (opts?.cacheHitInput ? m.cachedInputPer1M : m.inputPer1M) / 1e6;
  const outputRate = m.outputPer1M / 1e6;
  const usd = t.input * inputRate + t.output * outputRate;
  return usd * PRICING.usdToRmb;
}

/** 若把整月 ¥399 全部用于某一个模型的推理，理论上限次数（不计其他成本）。 */
export function maxCallsPerRevenue(model: ModelKey, opts?: { cacheHitInput?: boolean }, revenueRMB = PRICING.proMonthlyPriceRMB): number {
  const c = costPerCallRMB(model, opts);
  return c > 0 ? Math.floor(revenueRMB / c) : 0;
}

/** 推荐月度配额下，对应模型的实际推理成本（元）。用于后台监控毛利。 */
export function quotaCostRMB(model: ModelKey, quota = PRICING.proMonthlyQuota, opts?: { cacheHitInput?: boolean }): number {
  return +(costPerCallRMB(model, opts) * quota).toFixed(2);
}

export interface PlanCalcRow {
  model: string;
  label: string;
  costPerCall: number;
  /** 399 全用于该模型的理论次数上限 */
  maxCalls: number;
  /** 推荐配额（600 次）下的月度推理成本 */
  quotaCost: number;
  /** 推荐配额成本占 399 的比例 */
  quotaRatio: number;
}

/** 生成套餐页 / 后台需要的完整测算表。 */
export function buildPlanCalc(): { price: number; freeTrial: number; quota: number; rows: PlanCalcRow[] } {
  const rows: PlanCalcRow[] = (Object.keys(PRICING.models) as ModelKey[]).map((k) => {
    const m = PRICING.models[k];
    const cost = +costPerCallRMB(k).toFixed(4);
    const quotaCost = quotaCostRMB(k);
    return {
      model: m.id,
      label: m.label,
      costPerCall: cost,
      maxCalls: maxCallsPerRevenue(k),
      quotaCost,
      quotaRatio: +(quotaCost / PRICING.proMonthlyPriceRMB).toFixed(3),
    };
  });
  return { price: PRICING.proMonthlyPriceRMB, freeTrial: PRICING.freeTrialUses, quota: PRICING.proMonthlyQuota, rows };
}

/** 设计/后台提示文案：把「399 包月对应多少次」算清楚给用户看。
 *  返回人类可读的结论，避免界面里写死数字。 */
export function planSummaryText(): string {
  const c = buildPlanCalc();
  const d = c.rows.find((r) => r.model === 'deepseek-chat');
  if (!d) return `包月 ¥${c.price}：会员每月 ${c.quota} 次 AI 调用。`;
  return [
    `包月 ¥${c.price}：会员每月 ${c.quota} 次 AI 调用（统一额度，全部走 DeepSeek）。`,
    `按 DeepSeek 官方价测算：单次调用成本约 ¥${d.costPerCall.toFixed(3)}，${c.quota} 次合计约 ¥${d.quotaCost.toFixed(0)}，约占 ¥${c.price} 的 ${Math.round(d.quotaRatio * 100)}%。`,
    `新注册用户可免费体验 ${c.freeTrial} 次，之后需订阅会员。`,
  ].join('\n');
}
