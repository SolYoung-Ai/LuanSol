/* AI 结构化工具系统的类型定义。
 * AI 只能输出工具调用，不能执行任意 JS；每个工具都有参数 schema 和校验。 */

/** 22 个受支持的工具名（与需求 8.2 对齐） */
export type AIToolName =
  | 'create_text_layer'
  | 'update_text_layer'
  | 'create_image_layer'
  | 'replace_image_layer'
  | 'create_shape_layer'
  | 'update_layer_position'
  | 'update_layer_size'
  | 'update_layer_style'
  | 'delete_layer'
  | 'duplicate_layer'
  | 'group_layers'
  | 'set_layer_visibility'
  | 'change_background'
  | 'update_palette'
  | 'switch_face'
  | 'update_structure'
  | 'update_dimensions'
  | 'generate_image_asset'
  | 'add_generated_asset'
  | 'inspect_design'
  | 'run_prepress_check'
  | 'export_design';

/** 单个参数的校验规则。Studio 工具也复用这一份，避免出现第二套校验器。 */
export interface ParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  description?: string;
  enum?: (string | number)[];
  min?: number;
  max?: number;
  /** 数字必须是整数（用于图层数量、角度等） */
  integer?: boolean;
  /** 字符串正则，例如 HEX 颜色 */
  pattern?: string;
  /** 数组元素类型（目前只做逐项基础类型检查） */
  itemType?: 'string' | 'number';
  /** 数组最少 / 最多项 */
  minItems?: number;
  maxItems?: number;
  default?: unknown;
}

/** 工具执行结果 */
export interface ToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

/** AI 输出的单个动作 */
export interface AIAction {
  name: AIToolName;
  params: Record<string, unknown>;
}

/** AI 决策的完整响应（JSON 模式） */
export interface AIPlan {
  /** 设计师的思考/说明，会展示给用户 */
  thought: string;
  /** 要执行的动作序列 */
  actions: AIAction[];
}

/** 执行工具时可访问的编辑器能力（由 EditorContext 提供，避免直接耦合整个 context）。 */
export interface ToolHost {
  // 读取
  getDesign: () => import('../../types').DesignDoc | null;
  getCurrentFace: () => import('../../types').FaceId;
  getFace: () => import('../../types').Face | null;
  findLayer: (id: string) => import('../../types').Layer | null;
  // 图层操作
  addLayer: (layer: import('../../types').Layer) => void;
  removeLayer: (id: string) => void;
  patchLayer: (id: string, patch: Partial<import('../../types').Layer>) => void;
  duplicateLayerById: (id: string) => void;
  setVisibility: (id: string, visible: boolean) => void;
  // 工程
  switchFace: (face: import('../../types').FaceId) => void;
  setBackground: (bg: string) => void;
  setPalette: (palette: Partial<import('../../types').Palette>) => void;
  setStructure: (structure: import('../../types').StructureId) => void;
  setDimensions: (dim: { l: number; w: number; h: number }) => void;
  // 生成 / 检查 / 导出
  generateAsset: (prompt: string, kind: string) => Promise<{ src: string; naturalW: number; naturalH: number }>;
  runPrepress: () => import('../../types').PrepressReport;
  exportDesign: (format: string) => Promise<void>;
}
