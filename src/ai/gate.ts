/* ============================================================
 * AI 用量闸门注册表（极简，无外部依赖，避免循环引用）
 * ------------------------------------------------------------
 * 为什么独立成文件：
 *  - runAITask（ai/provider）与 llmImage（engine/llm）都要过闸；
 *  - 闸门的实际逻辑在 cloud/subscription（需要 auth + DB），不能让
 *    engine/llm 反向依赖 cloud，否则会成环。
 * 这里只放「注册 / 读取 / 上报」两个钩子，由 SubscriptionProvider 注入实现。
 * ============================================================ */

export interface GateResult {
  ok: boolean;
  reason?: string;
  /** 需要用户做什么：登录（匿名用 AI）或订阅（额度耗尽） */
  need?: 'login' | 'subscribe';
}

export type AIGate = (taskId: string) => GateResult | Promise<GateResult>;

let gate: AIGate | null = null;
let reporter: ((taskId: string) => void) | null = null;

/** 由 SubscriptionProvider 注入真实闸门（登录态 + 订阅额度判定）。传 null 关闭闸门。 */
export function registerAIGate(fn: AIGate | null) { gate = fn; }
export function getAIGate(): AIGate | null { return gate; }

/** 由 SubscriptionProvider 注入用量上报（成功后自增额度计数）。 */
export function registerAIReporter(fn: ((taskId: string) => void) | null) { reporter = fn; }
export function reportAIUsage(taskId: string) { reporter?.(taskId); }
