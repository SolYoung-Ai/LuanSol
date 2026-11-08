/* ============================================================
 * 设计任务拆分（任务书第五部分 5.2）
 * ------------------------------------------------------------
 * 基于已确认的结构化分析报告 + 选定的设计方向，把完整包装
 * 拆成可独立运行的视觉生产任务。真实调用文本模型生成任务清单。
 *
 * 诚实边界：
 *  - 只生成需要「生图」的任务（background/illustration/pattern/texture/decoration）；
 *    文字、Logo、条码、包装结构等后续用真实文字对象/矢量，不伪造生图。
 *  - 每个任务给出可编辑的英文生图提示词草稿，用户可改后再运行。
 *  - 任务数量克制（3~6 个），不堆无关任务浪费额度。
 * ============================================================ */
import type {
  AnalysisReport,
  DesignConcept,
  DesignTask,
  DesignTaskType,
  ProductInfo,
} from '../types';
import { llmJson, type LLMMessage } from '../engine/llm';
import type { AISettings } from '../types';
import { getAIGate, reportAIUsage } from '../ai/gate';
import { uid } from '../engine/utils';

const GENERATIVE_TYPES: DesignTaskType[] = [
  'background', 'illustration', 'pattern', 'texture', 'decoration',
];

const FACE_LABEL: Record<string, string> = {
  front: '正面', back: '背面', left: '左侧面', right: '右侧面', top: '顶面', all: '通用',
};

/** 过统一积分闸门；失败抛错由组件展示 */
async function ensureCredit() {
  const gate = getAIGate();
  if (!gate) return;
  const g = await gate('chat');
  if (!g.ok) throw new Error(g.reason || '需要登录或订阅后使用 AI 功能');
}

const PLANNER_SYSTEM = `你是 LunaSol 的包装设计总监。基于已确认的设计分析报告与选定的设计方向，把包装拆成可独立生成的视觉素材任务。
要求：
- 只输出需要「AI 生图」的素材任务，类型限定在：background / illustration / pattern / texture / decoration。
- 不要把产品名称、Logo、条码、文字排版拆成生图任务——这些后续用真实文字对象，不用生图伪造。
- 任务数量克制：3~6 个最关键的素材，不堆无关任务。
- 每个任务的生图提示词用英文撰写，专业、具体、可执行：结合设计方向的视觉关键词、色彩（HEX）、材质、风格；明确用途与所在包装面；要求干净、可独立使用、无文字、无 Logo、无水印。
- face 从 front / back / left / right / top / all 里选。
只输出一个 JSON 对象：{ "tasks": [ { "type": "...", "name": "...", "face": "...", "description": "...", "prompt": "英文生图提示词" } ] }`;

interface RawTask {
  type?: string;
  name?: string;
  face?: string;
  description?: string;
  prompt?: string;
}

/** 基于分析报告与选定方案生成设计任务清单 */
export async function planTasks(
  analysis: AnalysisReport,
  concept: DesignConcept,
  productInfo: ProductInfo,
  ai: AISettings,
): Promise<DesignTask[]> {
  await ensureCredit();
  const userContent = [
    `产品：${productInfo.description || '（未填写）'}`,
    `产品类型：${productInfo.productType || '—'}`,
    `包装类型：${productInfo.packagingType || '—'}`,
    '',
    `选定设计方向：${concept.name}（${concept.key}）`,
    `设计概念：${concept.concept}`,
    `视觉关键词：${concept.visualKeywords.join('、')}`,
    `配色：${concept.colors.join('、')}`,
    `材质方向：${concept.materialDirection}`,
    `字体方向：${concept.typographyDirection}`,
    `插画方向：${concept.illustrationDirection}`,
    `构图方式：${concept.composition}`,
    '',
    '已确认分析报告（JSON）：',
    JSON.stringify({
      palette: analysis.palette,
      structure: analysis.structure,
      graphics: analysis.graphics,
      layout: analysis.layout,
      brandPositioning: analysis.brandPositioning,
    }),
  ].join('\n');

  const messages: LLMMessage[] = [
    { role: 'system', content: PLANNER_SYSTEM },
    { role: 'user', content: userContent },
  ];
  const raw = await llmJson<{ tasks?: RawTask[] }>(messages, ai);
  reportAIUsage('chat');

  const tasks: DesignTask[] = [];
  (raw.tasks || []).forEach((t) => {
    const type = GENERATIVE_TYPES.includes(t.type as DesignTaskType)
      ? (t.type as DesignTaskType) : null;
    if (!type || !t.prompt?.trim()) return;
    const face = FACE_LABEL[t.face || ''] ? (t.face as DesignTask['face']) : 'front';
    tasks.push({
      id: uid('task'),
      type,
      name: t.name?.trim() || '未命名素材',
      face,
      description: t.description?.trim() || '',
      prompt: t.prompt.trim(),
      model: 'seedream',
      status: 'pending',
      variants: [],
      selectedVariant: 0,
    });
  });
  // 兜底：模型一个任务都没返回时，给一个最基础的背景任务，避免空流程
  if (tasks.length === 0) {
    tasks.push({
      id: uid('task'),
      type: 'background',
      name: '包装背景底图',
      face: 'front',
      description: '主视觉背景',
      prompt: 'Minimal premium packaging background, soft paper texture, generous negative space, warm off-white and deep tea green, elegant oriental style, no text, no logo.',
      model: 'seedream',
      status: 'pending',
      variants: [],
      selectedVariant: 0,
    });
  }
  return tasks;
}
