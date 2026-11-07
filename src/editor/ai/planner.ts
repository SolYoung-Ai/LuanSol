/* AI 规划器：把用户自然语言 + 当前工程上下文，通过 LLM 转成结构化工具计划。
 * 只产出 AIPlan（thought + actions），不直接执行；执行由 executor 负责。 */
import type { AISettings, ChatMessage } from '../../types';
import { llmJson } from '../../engine/llm';
import { LUNA_PERSONA_PROMPT } from '../../engine/persona';
import { toolsReferenceText } from './tools';
import type { AIAction, AIPlan } from './types';

export interface PlannerContext {
  currentFace: string;
  faceSize: { w: number; h: number };
  bg: string;
  layers: { id: string; name: string; type: string; hidden?: boolean; locked: boolean }[];
  palette: unknown;
  structure: string;
}

/** 给 AI 的当前工程快照（纯文本，避免它凭空猜测图层 ID） */
function contextText(ctx: PlannerContext): string {
  const layerLines = ctx.layers.length
    ? ctx.layers.map((l) => `  - ${l.id} | ${l.type} | ${l.name}${l.hidden ? ' | 已隐藏' : ''}${l.locked ? ' | 已锁定' : ''}`).join('\n')
    : '  （当前面暂无图层）';
  return [
    `当前包装结构：${ctx.structure}`,
    `当前编辑面：${ctx.currentFace}（面尺寸 ${ctx.faceSize.w} × ${ctx.faceSize.h} mm，背景 ${ctx.bg}）`,
    `配色：${JSON.stringify(ctx.palette)}`,
    `当前面图层：`,
    layerLines,
  ].join('\n');
}

const OUTPUT_RULE = `你必须只输出一个 JSON 对象，格式如下：
{
  "thought": "用一句话说明你的设计思路和打算做的修改（会展示给用户）",
  "actions": [
    { "name": "工具名", "params": { "参数名": "参数值" } }
  ]
}
规则：
1. 只能使用上面列出的工具，参数必须符合工具定义，图层 ID 必须来自当前工程上下文，不能编造。
2. 一次可以给出多个 actions，它们会按顺序执行；没有必要的操作不要做。
3. 纯聊天、解释或无法用工具完成的内容，actions 给空数组，把话放在 thought 里。
4. 不要输出 JSON 以外的任何文字、Markdown 代码块或解释。`;

function normalizePlan(raw: Partial<AIPlan>): AIPlan {
  const thought = typeof raw.thought === 'string' ? raw.thought : '';
  const actions: AIAction[] = [];
  if (Array.isArray(raw.actions)) {
    for (const a of raw.actions) {
      if (a && typeof a.name === 'string' && (a.params === undefined || typeof a.params === 'object')) {
        actions.push({ name: a.name, params: a.params || {} });
      }
    }
  }
  return { thought, actions };
}

export async function planFromUser(
  userInstruction: string,
  history: ChatMessage[],
  ctx: PlannerContext,
  ai: AISettings,
): Promise<AIPlan> {
  const system = [
    LUNA_PERSONA_PROMPT,
    '',
    '现在你在工作台里通过工具调用直接操作当前设计工程，你理解品牌定位、排版、色彩、包装结构、印刷工艺和消费心理。',
    '你可以使用以下工具：',
    toolsReferenceText(),
    '',
    contextText(ctx),
    '',
    OUTPUT_RULE,
  ].join('\n');

  const messages = [
    { role: 'system' as const, content: system },
    ...history.slice(-12).map((m) => ({ role: m.role === 'ai' ? 'assistant' as const : 'user' as const, content: m.text })),
    { role: 'user' as const, content: userInstruction },
  ];

  const raw = await llmJson<AIPlan>(messages, ai);
  return normalizePlan(raw);
}
