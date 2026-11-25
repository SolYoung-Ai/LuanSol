/* ============================================================
   Studio 2.0 阶段四 — AI 画布操作智能体的类型
   ------------------------------------------------------------
   规划器只产出受约束的 JSON，不接触 React / DOM；
   执行器只接收经过 Schema 与业务校验的动作，在 StudioDesign
   的不可变副本上试跑，全部成功后才交给界面提交一次历史。
   ============================================================ */
import type { StudioDesign, StudioProject } from '../types';

/** 面向 Studio 的受支持工具。命名尽量沿用旧编辑器的工具语义，
 *  但参数与执行对象是工作台自己的百分比图层。 */
export type StudioToolName =
  | 'inspect_design'
  | 'create_text_layer'
  | 'update_text_layer'
  | 'update_layer_position'
  | 'resize_design_object'
  | 'rotate_design_object'
  | 'change_object_color'
  | 'replace_image_layer'
  | 'create_shape_layer'
  | 'delete_layer'
  | 'duplicate_layer'
  | 'set_layer_visibility'
  | 'update_layer_order'
  | 'align_objects'
  | 'distribute_objects'
  | 'change_background'
  | 'run_prepress_check'
  | 'update_dimensions'
  | 'update_structure';

/** DeepSeek 输出的单个动作 */
export interface StudioAIAction {
  name: StudioToolName;
  params: Record<string, unknown>;
}

/** 对话意图：咨询 / 修改 / 需要补充信息 */
export type StudioPlanMode = 'advice' | 'edit' | 'clarify';

/** DeepSeek 必须返回的 JSON 结构 */
export interface StudioAIPlan {
  mode: StudioPlanMode;
  /** 给用户看的一句话结论 */
  summary: string;
  /** mode=clarify 时必须写清楚缺什么 */
  clarification?: string;
  actions: StudioAIAction[];
}

/** 单个字段的改动预览 */
export interface PreviewChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

/** 一个被影响对象 / 面板的预览 */
export interface PreviewItem {
  kind: 'element' | 'panel' | 'structure';
  targetId: string;
  targetName: string;
  targetType: string;
  change: PreviewChange[];
}

/** 权限等级。danger 必须在界面上再勾一次确认。 */
export type PlanPermission = 'normal' | 'danger';

/** 执行前给用户看的完整预览。它会随对话保存在项目里。 */
export interface StudioPlanPreview {
  planId: string;
  mode: StudioPlanMode;
  summary: string;
  clarification?: string;
  actions: StudioAIAction[];
  items: PreviewItem[];
  /** 没有变化的当前面对象数量 */
  unchangedCount: number;
  /** 是否涉及当前面之外的其它面 */
  crossPanel: boolean;
  targetFaces: string[];
  /** 是否触碰尺寸 / 结构 / 刀模相关设置 */
  structural: boolean;
  structuralImpact: string[];
  permission: PlanPermission;
  dangerReasons: string[];
  warnings: string[];
  /** 预览时的设计指纹；确认时若画布已变，计划作废 */
  baseDigest: string;
  baseFace: string;
  createdAt: number;
}

/** 单条动作的执行结果 */
export interface ActionResult {
  name: StudioToolName;
  ok: boolean;
  message: string;
}

/** 试跑结果。ok=false 时 design/project 不得被界面提交。 */
export interface PlanExecution {
  ok: boolean;
  preview: StudioPlanPreview | null;
  design: StudioDesign | null;
  project: StudioProject | null;
  results: ActionResult[];
  error: string;
}

/** 执行器的输入：只读快照 + 当前面 */
export interface StudioAISnapshot {
  project: StudioProject;
  design: StudioDesign;
  face: string;
  panel: { id: string; w: number; h: number; labelZh: string; labelEn: string } | null;
  selectedIds: string[];
}
