/* ============================================================
 * 统一 AI 能力层的公共契约
 * ------------------------------------------------------------
 * 设计目标：AI 不是「一个 API 接口」，而是贯穿九步流程的决策能力。
 * 每个流程节点都有明确的任务定义（输入上下文 / 输出结构 / 合规约束 /
 * 本地回退 / 采纳动作）。后台接入 GPT 后，只需替换「传输层」或切到
 * 后台代理模式，流程与 UI 一行都不用改。
 * ============================================================ */
import type { AISettings, AIProviderMode } from '../types';
import type { ProjectDraft } from '../v3/draft';

export type AISource = 'ai' | 'local' | 'fallback' | 'paywall';

/** 全部 AI 能力点。step 为向导步骤索引（0–9），其余为全局节点。 */
export type AITaskId =
  | 'size.structure'
  | 'logo.directions'
  | 'audience.profile'
  | 'product.category'
  | 'style.recommend'
  | 'color.primary'
  | 'palette.schemes'
  | 'illustration.motif'
  | 'copy.suggestion'
  | 'barcode.advice'
  | 'review.directions'
  | 'editor.modify';

/** 传给每个 AI 任务的统一项目上下文（来自同一份 ProjectDraft） */
export interface AIContext {
  step: number;
  completed: number;
  form: string;
  formLabel: string;
  sizeText: string;
  structureId: string;
  category: string;
  categoryGroup: string;
  customCategory: string;
  ages: string[];
  groups: string[];
  tiers: string[];
  audienceText: string;
  styleId: string;
  styleName: string;
  styleEra: string;
  styleFeatures: string[];
  stylePatterns: string[];
  styleColors: string[];
  stylePrompt: string;
  primary: string;
  paletteName: string;
  paletteColors: string[];
  illustrationType: string;
  illustrationDescription: string;
  brand: string;
  product: string;
  tagline: string;
  subtitle: string;
  spec: string;
  description: string;
  logoMode: string;
  logoBrandName: string;
  barcodeNeeded: boolean | null;
  barcodeType: string;
  barcodePreviewOnly: boolean;
  /** 用户在 AI 助手里补充的一句话，可选 */
  userNote: string;
}

export interface AISuggestion {
  id: string;
  title: string;
  detail: string;
  /** 采纳时写回 draft 的结构化值；由各任务自行解释 */
  value?: unknown;
}

export interface AITaskResult {
  taskId: AITaskId;
  source: AISource;
  note: string;
  suggestions: AISuggestion[];
  at: number;
  model?: string;
  durationMs?: number;
}

/** 传输层请求：未来后台接入点只需实现这个形状 */
export interface AIRequest {
  taskId: AITaskId;
  system: string;
  user: string;
  schema: string;
  temperature: number;
}

export type AITransport = (req: AIRequest, settings: AISettings) => Promise<unknown>;

export type DraftPatch = (p: Partial<ProjectDraft> | ((d: ProjectDraft) => Partial<ProjectDraft>)) => void;

export interface AITaskDef {
  id: AITaskId;
  step: number | 'review' | 'editor';
  title: string;
  hint: string;
  /** 未来接 GPT 时使用的 system prompt，含该节点的合规约束 */
  system: string;
  /** 期望的 JSON 输出结构 */
  schema: string;
  constraints: string[];
  buildUser: (ctx: AIContext) => string;
  /** 本地规则引擎：确定性推导，绝不是随机假数据 */
  local: (ctx: AIContext) => AISuggestion[];
  /** AI 输出校验：不合规直接回退本地，不让模型绕过产品规则 */
  validate: (raw: unknown, ctx: AIContext) => boolean;
  parse: (raw: unknown, ctx: AIContext) => AISuggestion[];
  /** 只有用户主动点「采用」才写回 draft，绝不自动覆盖已确认内容 */
  adopt: (s: AISuggestion, patch: DraftPatch) => void;
}

export interface AIRunRecord {
  taskId: AITaskId;
  source: AISource;
  at: number;
  durationMs: number;
  note: string;
  mode: AIProviderMode;
}

export type { AISettings };
