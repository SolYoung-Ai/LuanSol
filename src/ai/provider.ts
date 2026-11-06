/* ============================================================
 * 统一执行入口 / 传输层
 * ------------------------------------------------------------
 * 这是「后台接入点」：所有 AI 能力都经过 runAITask → transport。
 * 后台接好 GPT 后有两种即插即用方式：
 *   1) 设置页切到「后台代理」，填代理地址即可（密钥留在服务端）；
 *   2) 调用 registerAITransport(fn) 换成你自己的请求实现（一行代码）。
 * 任务定义、合规校验、本地回退、采纳动作都不需要改动。
 * ============================================================ */
import { llmJson, aiEnabled, aiMode, aiStatusLabel } from '../engine/llm';
import { AI_TASKS, TASK_LIST } from './tasks';
import { getAIGate, reportAIUsage } from './gate';
import type { AISettings } from '../types';
import type {
  AIContext, AIRequest, AISource, AITaskId, AITaskResult, AITransport, AIRunRecord,
} from './types';

const LOG_KEY = 'lunasol.ai.runs.v1';
let runLog: AIRunRecord[] = (() => {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]') as AIRunRecord[]; } catch { return []; }
})();

export function getAIRunLog(): AIRunRecord[] { return [...runLog].reverse(); }
export function clearAIRunLog() { runLog = []; try { localStorage.removeItem(LOG_KEY); } catch { /* ignore */ } }
function appendLog(r: AIRunRecord) {
  runLog = [...runLog.slice(-49), r];
  try { localStorage.setItem(LOG_KEY, JSON.stringify(runLog)); } catch { /* ignore */ }
}

/** 默认传输：OpenAI 兼容 chat/completions + JSON 输出。
 *  后台代理模式下不带厂商密钥，模型名可留空由后台决定。 */
const defaultTransport: AITransport = async (req: AIRequest, settings: AISettings) =>
  llmJson<unknown>([
    { role: 'system', content: `${req.system}\n\n【输出结构】${req.schema}\n只输出一个 JSON 对象。` },
    { role: 'user', content: req.user },
  ], settings);

let transport: AITransport = defaultTransport;

/** 后台接入钩子：替换成你自己的请求实现即可，全站 AI 能力立即切换 */
export function registerAITransport(fn: AITransport) { transport = fn; }
export function resetAITransport() { transport = defaultTransport; }
export const getAITransport = () => transport;

function result(taskId: AITaskId, source: AISource, note: string, suggestions: AITaskResult['suggestions'], started: number, ai: AISettings, model?: string): AITaskResult {
  const durationMs = Date.now() - started;
  appendLog({ taskId, source, at: Date.now(), durationMs, note, mode: aiMode(ai) });
  return { taskId, source, note, suggestions, at: Date.now(), durationMs, model };
}

export async function runAITask(id: AITaskId, ctx: AIContext, ai: AISettings): Promise<AITaskResult> {
  const def = AI_TASKS[id];
  const started = Date.now();

  // 1) 未启用 AI：明确标注本地建议，绝不冒充 AI 生成
  if (!aiEnabled(ai)) {
    return result(id, 'local',
      '当前为内置设计引擎的本地建议（未调用 AI）。在「AI 模型配置」里启用接入后，这里会直接使用你后台的模型，流程不变。',
      def.local(ctx), started, ai);
  }

  // 1.5) 订阅 / 登录闸门：AI 真正调用前校验额度（由 SubscriptionProvider 注入）
  const gate = getAIGate();
  if (gate) {
    const g = await gate(id);
    if (!g.ok) {
      return result(id, 'paywall',
        g.reason || '需要订阅后使用 AI 功能。',
        def.local(ctx), started, ai);
    }
  }

  // 2) 调用统一传输层
  try {
    const raw = await transport({
      taskId: id,
      system: def.system,
      user: def.buildUser(ctx),
      schema: def.schema,
      temperature: ai.temperature,
    }, ai);

    // 3) 合规与结构校验：模型不能绕过产品规则
    if (!def.validate(raw, ctx)) {
      return result(id, 'fallback',
        '模型返回未通过本节点的合规或结构校验（例如编造法定信息、生成条码数字、发明不存在的风格），已回退为本地建议，不会当作 AI 结果展示。',
        def.local(ctx), started, ai);
    }
    const suggestions = def.parse(raw, ctx);
    if (!suggestions.length) {
      return result(id, 'fallback', '模型没有给出可用建议，已回退本地建议。', def.local(ctx), started, ai);
    }
    const r = result(id, 'ai',
      `${aiStatusLabel(ai)} 已给出建议。采纳后才会写入项目，你已确认的内容不会被自动改写。`,
      suggestions, started, ai, aiMode(ai) === 'proxy' ? '后台代理' : ai.textModel);
    reportAIUsage(id);
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 90) : String(e).slice(0, 90);
    return result(id, 'fallback',
      `AI 调用失败（${msg}），已如实回退到内置设计引擎的建议，未伪装为 AI 生成结果。`,
      def.local(ctx), started, ai);
  }
}

/** 统一的 AI 结果提示语。
 *  必须区分三种情况：真的调用了 AI / 回退到本地引擎 / 被订阅规则拦截。
 *  把「被额度拦下」说成「本地生成」是误导——用户会以为模型坏了。
 *  被拦截时直接用闸门给出的真实原因（未登录 / 额度用完 / 会员过期），不做二次臆测。 */
export function aiResultToast(r: { source: AISource; note?: string }, aiMsg: string, localMsg: string): string {
  if (r.source === 'ai') return aiMsg;
  if (r.source === 'paywall') return r.note || '需要订阅后才能使用 AI 功能';
  return localMsg;
}

/** 给设置页展示：接好后台之后到底有哪些能力会生效 */export const aiCapabilitySummary = () => ({
  total: TASK_LIST.length,
  steps: TASK_LIST.filter((t) => typeof t.step === 'number').length,
  global: TASK_LIST.filter((t) => typeof t.step !== 'number').length,
  list: TASK_LIST.map((t) => ({
    id: t.id, title: t.title, step: t.step,
    constraints: t.constraints.length,
  })),
});
