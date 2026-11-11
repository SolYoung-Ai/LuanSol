/* ============================================================
 * LunaSol 积分定价（2026-11 改版）
 * ------------------------------------------------------------
 * 计量口径：积分（不是"次"）。
 *   - 新注册送 100 积分
 *   - 会员 US$4/月（Creem 结算，海外卡 / PayPal）：
 *     解锁全部模型 + 云端同步 + 印刷级导出 + 签到双倍，
 *     **不含固定积分包**（积分只来自签到 / 充值 / 兑换码）
 *   - 充值包：¥99=1000 / ¥199=2100 / ¥299=3500（人工/兑换码通道）
 *   - 消费单价：聊天 0 积分/轮（免费）；Seedream Flash 6 积分/张、Pro 10
 *   - 价格只有一处权威：proMonthlyPriceUSD 是界面展示与 Creem 产品价，
 *     proMonthlyPriceRMB 只是按汇率折算的测算值，不要拿去当售价展示。
 *     改价请同步改 Creem 后台的产品价格。
 * ============================================================ */

export const PRICING = {
  /** 会员月费（美元）。Creem 收银台按这个金额扣款，界面也必须显示同一个数字。 */
  proMonthlyPriceUSD: 4,
  /** 会员月费折算人民币，仅用于后台毛利测算（4 × 7.1），不在界面展示 */
  proMonthlyPriceRMB: 28.4,
  /** 新注册用户赠送积分 */
  freeTrialUses: 100,
  /** 会员权益：签到双倍（每天 20 积分），不是固定月度积分包。
   *  这个数字只用于后台的毛利测算（buildPlanCalc / quotaCostRMB），
   *  **不要**在界面上当作「开通即送」的积分展示——会员不含积分包。 */
  proMonthlyQuota: 3000,

  /** 用量进度条的分母（100% 对应多少积分）。
   *  免费版按 100（新注册赠送量），会员按 600，用户近期充过积分则改用该次充值量，
   *  让「已使用 x%」始终表示「这一桶用掉了多少」。
   *  侧栏与「积分与充值」页都从这里取，保证两处百分比一致。 */
  creditBucket: 100,
  /** 会员的默认桶：签到双倍后一个月的常规量级（600），比免费版更能反映使用节奏 */
  proCreditBucket: 600,

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
    /** GPT Image 2 · 文字输入（B.AI，按输入 token 5 档计费，约 ¥0.9/张） */
    imageGpt2Text: 86,
    /** GPT Image 2 · 输入图（B.AI，带参考图按输入 token 8 档计费，约 ¥1.1/张） */
    imageGpt2Ref: 93,
    /** Hyper3D-Gen2 文/图生 3D（方舟，官方 ¥1.8/次） */
    hyper3d: 21,
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
