/* ============================================================
   Studio 2.0 阶段四 — DeepSeek 规划器
   ------------------------------------------------------------
   只生成受约束的动作计划，不执行：
     用户输入 + 当前设计上下文
       → DeepSeek（平台代理，DeepSeek-V4.1-Flash）
       → JSON（mode / summary / clarification / actions）
       → normalize → Schema / 业务权限校验（在 executor 中）
   普通咨询与修改意图在这里分流：mode=advice 就是只回答，不碰画布。
   ============================================================ */
import type { AISettings } from '../../types';
import { llmJson } from '../../engine/llm';
import { LUNA_PERSONA_PROMPT } from '../../engine/persona';
import type { StudioChatMsg } from '../types';
import type { AIContext } from './context';
import { contextJson } from './context';
import type { StudioAIAction, StudioAIPlan, StudioPlanMode, StudioToolName } from './types';
import { studioToolsReference } from './tools';

const ACTION_ALIASES: Record<string, StudioToolName> = {
  get_design_context: 'inspect_design',
  change_color: 'change_object_color',
  update_color: 'change_object_color',
  move_layer: 'update_layer_position',
  move_design_object: 'update_layer_position',
  resize_layer: 'resize_design_object',
  rotate_layer: 'rotate_design_object',
  replace_image: 'replace_image_layer',
  delete_object: 'delete_layer',
  duplicate_object: 'duplicate_layer',
  align_layers: 'align_objects',
  distribute_layers: 'distribute_objects',
  set_background: 'change_background',
  change_face_background: 'change_background',
};

const PARAM_ALIASES: Record<string, string> = {
  object_id: 'layerId',
  target_id: 'layerId',
  targetId: 'layerId',
  layer_id: 'layerId',
  color_hex: 'color',
  hex: 'color',
  delta_x_mm: 'dx_mm',
  delta_y_mm: 'dy_mm',
  scale_factor: 'scale',
  keep_aspect_ratio: 'keepAspectRatio',
  new_x_mm: 'x_mm',
  new_y_mm: 'y_mm',
  from_layer_id: 'sourceLayerId',
  source_layer_id: 'sourceLayerId',
  opacity_pct: 'opacity',
};

function cleanParams(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) out[PARAM_ALIASES[k] || k] = v;
  return out;
}

/** 容错归一：仍保持严格白名单，未知工具留给校验层明确拒绝。 */
export function normalizeStudioPlan(raw: unknown): StudioAIPlan {
  const obj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const rawActions = Array.isArray(obj.actions) ? obj.actions : [];
  const actions: StudioAIAction[] = [];
  for (const item of rawActions) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    const rawName = typeof a.name === 'string' ? a.name.trim() : '';
    if (!rawName) continue;
    actions.push({
      name: (ACTION_ALIASES[rawName] || rawName) as StudioToolName,
      params: cleanParams(a.params && typeof a.params === 'object' ? a.params as Record<string, unknown> : {}),
    });
  }

  const rawMode = typeof obj.mode === 'string' ? obj.mode : '';
  let mode: StudioPlanMode = rawMode === 'advice' || rawMode === 'edit' || rawMode === 'clarify'
    ? rawMode
    : (actions.length ? 'edit' : 'advice');
  if (mode === 'advice' && actions.length) mode = 'edit';
  if (mode === 'clarify') actions.splice(0, actions.length);

  const summary = typeof obj.summary === 'string' && obj.summary.trim()
    ? obj.summary.trim()
    : (typeof obj.thought === 'string' ? obj.thought.trim() : '');
  const clarification = typeof obj.clarification === 'string' ? obj.clarification.trim() : '';

  return {
    mode,
    summary: summary || (mode === 'clarify' ? '需要先确认要改哪个对象。' : (actions.length ? '按你的要求调整这几个对象。' : '')),
    ...(clarification ? { clarification } : {}),
    actions,
  };
}

/** 对外暴露，便于测试 prompt 与行为约束不漂移。 */
export function buildPlannerMessages(
  instruction: string,
  history: StudioChatMsg[],
  ctx: AIContext,
): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const selectedText = ctx.selected.length
    ? ctx.selected.map((e) => `${e.name}（id=${e.id}，${e.type}）`).join('；')
    : '无';
  const system = `${LUNA_PERSONA_PROMPT}

【你现在的位置】
你在 LunaSol 包装工作台的画布编辑器里，身份是 AI 设计师。你不仅能给建议，还能通过受控工具真正修改当前设计。

【当前设计上下文（唯一事实来源）】
${contextJson(ctx)}

【当前选中对象】
${selectedText}

【受控工具】
${studioToolsReference()}

【只能输出这个 JSON 结构】
{
  "mode": "advice" | "edit" | "clarify",
  "summary": "一句话说清楚你要做什么，会显示给用户",
  "clarification": "仅 mode=clarify 时填写，问清楚缺的信息",
  "actions": [
    { "name": "工具名", "params": { "字段": "值" } }
  ]
}

【硬规则】
1. mode=advice：用户在问咨询、要建议、问原因、让你解释时使用，actions 必须为空，summary 里直接回答。
2. mode=edit：用户明确要求修改画布时使用，actions 至少 1 条；字段名必须严格使用工具定义里的字段名。
3. mode=clarify：目标不明确时使用，actions 必须为空，clarification 写清楚你缺什么。
4. 所有对象 ID 必须逐字来自上面的 elements，不能猜、不能编号、不能把名字当 ID。
5. 用户说「它 / 这个 / 选中的 / 当前选中」时：如果 selected 恰好 1 个，就用它的 id；如果 selected 为 0 或超过 1 个，必须 mode=clarify，问清是哪一个，绝不擅自选。
6. 默认只改 currentFace；context 里 otherFaces 的对象不允许操作。跨面板背景只有用户明确点名 face 时才可做。
7. 毫米是唯一单位：移动用 dx_mm / dy_mm（向上是负值），缩放用 scale（0.85 = 缩小 15%），字号用 size_mm。
8. 文字颜色用 change_object_color；文字内容/字号/字重用 update_text_layer；不要把一个修改拆成多个重复动作。
9. 图片替换只能用 context 里 imageSources 的 layerId 作为 sourceLayerId，不能编造 URL 或 data URL。
10. 用户明确要求改变包装尺寸时才可用 update_dimensions。结构变更不能用 update_structure 执行，必须 mode=clarify，说明需要回到需求步骤确认结构。
11. 不允许输出 SVG、HTML、JS、SQL；不允许 eval；不调用图像生成；不自行决定积分。
12. 一次最多 12 个动作。不要顺手改用户没提到的对象；用户说「其它不要动」时必须严格遵守。
13. 不要输出 JSON 以外的任何文字、Markdown 代码块或解释。`;

  const historyMsgs = history
    .filter((m) => m.kind !== 'plan' && m.kind !== 'result' && m.kind !== 'error' && m.content.trim())
    .slice(-10)
    .map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.content,
    }));

  return [
    { role: 'system', content: system },
    ...historyMsgs,
    { role: 'user', content: instruction },
  ];
}

export async function planStudioAction(
  instruction: string,
  history: StudioChatMsg[],
  ctx: AIContext,
  ai: AISettings,
): Promise<StudioAIPlan> {
  const messages = buildPlannerMessages(instruction, history, ctx);
  const raw = await llmJson<unknown>(messages, ai);
  const plan = normalizeStudioPlan(raw);
  if (plan.mode === 'edit' && !plan.actions.length && !plan.clarification) {
    return {
      ...plan,
      mode: 'clarify',
      clarification: '我还没拿到可执行的对象或参数，能再说具体一点吗？',
    };
  }
  return plan;
}
