/* ============================================================
 * LunaSol 套餐 / 额度 / 成本测算（2026-11 官方价）
 * ------------------------------------------------------------
 * 这是「包月 399 对应多少次 AI」的唯一权威来源。
 * 价格、token 估算、汇率都集中在这里，调价或换模型只改本文件即可，
 * 界面（套餐页、个人主页额度条、后台监控）都从这里读。
 *
 * 计量口径（已与产品确认）：
 *   - 计费单元 = 单次 AI 建议调用（九步向导里某一步点一次「获取建议」= 1 次）
 *   - 包月 ¥399；新注册用户免费体验 2 次；会员每月 600 次统一 AI 调用配额
 *   - 平台统一接入 DeepSeek（deepseek-chat 系列），用户看不到密钥、也不能自选模型
 * ============================================================ */

/** 价格来源：OpenAI 官方（2026-11-05 核实）与 DeepSeek 官方 API 文档（2026-11 核实）。
 *  单位：美元 / 百万 token。DeepSeek 输入区分缓存命中（前缀复用）与未命中。 */
export const PRICING = {
  /** 包月定价（人民币） */
  proMonthlyPriceRMB: 399,
  /** 新注册用户免费体验次数 */
  freeTrialUses: 2,
  /** 会员每月统一 AI 调用配额（次） */
  proMonthlyQuota: 600,

  /** 单次 AI 调用平均 token 估算（仅用于成本测算，不是前端计量值）。
   *  依据 src/ai/context.ts 的 contextText + src/ai/tasks.ts 的 system/user 拼接实测量级得出。 */
  estTokensPerCall: { input: 1800, output: 900 },
  /** USD → RMB 近似汇率（测算用，可按实际结算汇率调整） */
  usdToRmb: 7.1,

  models: {
    /** 价格对照行：未接入调度，仅用于评估「如果换成 GPT-4o 成本会怎样」。线上通道见 deepseekV3。 */
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
