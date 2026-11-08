/* LunaSol 核心数据模型 —— 所有智能体共享同一份项目数据 */

export type SchemeId = 'minimal' | 'illustration' | 'commercial';
export type StructureId = 'tuck' | 'topBottom' | 'drawer' | 'mailer' | 'pouch' | 'labelRect' | 'labelRound';
export type FaceId = 'front' | 'back' | 'left' | 'right' | 'top';
export type ShapeKind =
  | 'rect' | 'circle' | 'line' | 'mountain' | 'wave' | 'sun' | 'arch'
  | 'grid' | 'botanical' | 'dots' | 'stripes' | 'blob' | 'seal'
  /* 中国传统艺术风格专用纹样（各自有独立的绘制语法） */
  | 'spiral' | 'concentric' | 'cloud' | 'lotus' | 'taotie' | 'fish' | 'woodgrain' | 'glaze' | 'blueband'
  | 'barcode';
export type TextRole = 'brand' | 'product' | 'tagline' | 'info' | 'legal' | 'custom';

export interface Palette {
  bg: string;
  primary: string;
  accent: string;
  ink: string;
  muted: string;
}

export interface BaseLayer {
  id: string;
  name: string;
  x: number; y: number; w: number; h: number; // mm
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden?: boolean;
}

export interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  role: TextRole;
  fontFamily: string;
  fontSize: number; // pt
  fontWeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  letterSpacing: number; // em
  lineHeight: number; // em
  placeholder?: boolean;
}

export interface ShapeLayer extends BaseLayer {
  type: 'shape';
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  seed: number;
  rx?: number;
  /** barcode 图层：独立矢量条码，type/value 用于真实编码 */
  barcode?: { type: string; value: string };
}

export interface ImageLayer extends BaseLayer {
  type: 'image';
  src: string; // data URL
  naturalW: number;
  naturalH: number;
  fit: 'cover' | 'contain';
}

export type Layer = TextLayer | ShapeLayer | ImageLayer;

/** 素材类别：决定生成提示词与素材库筛选 */
export type AssetCategory =
  | 'background' | 'illustration' | 'texture' | 'pattern' | 'sticker' | 'product' | 'logo' | 'other';

/** 独立素材库中的一个素材。素材持久化、可复用，并可作为独立图层加入画布。 */
export interface Asset {
  id: string;
  name: string;
  src: string; // data URL
  kind: 'generated' | 'uploaded';
  category: AssetCategory;
  naturalW: number;
  naturalH: number;
  favorite: boolean;
  /** 属于某个项目的素材标记；全局可复用素材为空 */
  projectId?: string;
  /** 生成素材的原始提示词，便于再次生成 */
  sourcePrompt?: string;
  createdAt: number;
}

export interface Face {
  id: FaceId;
  w: number; h: number; // mm（成品面尺寸）
  bg: string;
  layers: Layer[];
}

export interface DesignDoc {
  id: string;
  name: string;
  scheme: SchemeId;
  palette: Palette;
  faces: Partial<Record<FaceId, Face>>;
  rationale: string;
  createdAt: number;
}

export interface DesignBrief {
  product: string;
  category: string;
  packType: string;
  brand: string;
  tagline: string;
  spec: string;
  description: string;
  style: string;
  colors: string[];
  motif: string;
  audience: string;
  scene: string;
  material: string;
  structure: StructureId;
  size: { l: number; w: number; h: number }; // mm
  /** 结构补充参数（mm）：粘合位宽度 / 插舌长度 / 盒盖高度 / 套合间隙 / 内盒壁厚 / 侧翼长度 / 顶部封口边 / 圆角半径。
   *  由用户在向导 STEP 01 确认，直接参与刀模几何计算；key 与 v3/draft.ts 的 STRUCTURE_EXTRA 一致。 */
  structureExtra?: Record<string, number>;
  targetGroup: string;
  extraText: string[];
  raw: string[];
  referenceImage?: string;
  referenceName?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  at: number;
  options?: string[];
  kind?: 'question' | 'note' | 'result';
}

/** 几何线段（mm，绝对坐标，位于某一张刀模图纸内） */
export interface Segment {
  x1: number; y1: number; x2: number; y2: number;
  kind: 'cut' | 'crease' | 'bleed' | 'safe';
}

export interface PanelRect {
  x: number; y: number; w: number; h: number;
  face?: FaceId;
  label: string;
  artwork?: boolean; // 是否为可印刷面
}

export interface Sheet {
  id: string;
  name: string;
  width: number; height: number; // 展开尺寸 mm
  rects: PanelRect[];
  segments: Segment[];
  circles: { cx: number; cy: number; r: number; kind: 'cut' | 'bleed' }[];
  safeRects: { x: number; y: number; w: number; h: number }[];
}

export interface Dieline {
  structure: StructureId;
  sheets: Sheet[];
  bleed: number;
  safe: number;
  finished: { l: number; w: number; h: number };
  warnings: string[];
}

export interface StructureInfo {
  id: StructureId;
  name: string;
  group: '盒类' | '袋类' | '标签类';
  desc: string;
  use: string;
  difficulty: number; // 1-3
  first: boolean;
}

export interface Version {
  id: string;
  label: string;
  at: number;
  design: DesignDoc;
}

export interface Project {
  id: string;
  name: string;
  brief: DesignBrief;
  structure: StructureId;
  scheme: SchemeId;
  design: DesignDoc | null;
  versions: Version[];
  createdAt: number;
  updatedAt: number;
  status: 'draft' | 'designing' | 'checked' | 'exported';
  /** V2 AI 原生工作流数据（聚合）。旧项目无此字段，向后兼容，不覆盖真实数据。 */
  workflow?: ProjectWorkflow;
}

/** AI 接入模式：
 *  - off     只用内置本地引擎，界面明确标注「未调用 AI」
 *  - browser 浏览器直连 OpenAI 兼容接口，密钥只存本机
 *  - proxy   密钥放在你自己的后台，前端只填代理地址即可全站启用 AI */
export type AIProviderMode = 'off' | 'browser' | 'proxy';

export interface AISettings {
  mode: AIProviderMode;
  baseUrl: string;
  apiKey: string;
  /** 后台代理的可选鉴权令牌（不是模型厂商密钥） */
  proxyToken: string;
  textModel: string;
  imageModel: string;
  imageEnabled: boolean;
  temperature: number;
  retries: number;
  lastTest: { ok: boolean; at: number; message: string } | null;
  /** 配置版本：用于把旧版本「未接入」的默认值升级到已部署的后台代理 */
  rev?: number;
  /** CloudBase 用户 UID，用于云函数登录态校验 */
  cloudbaseUid?: string;
}

export interface UserSettings {
  name: string;
  advancedMode: boolean;
  defaultUnit: 'mm' | 'cm' | 'inch';
  bleed: number;
  printDpi: number;
  autoSave: boolean;
}

export interface CheckItem {
  id: string;
  group: string;
  level: 'pass' | 'warning' | 'error';
  title: string;
  detail: string;
  fix?: string;
}

export interface PrepressReport {
  at: number;
  items: CheckItem[];
  status: 'pass' | 'warning' | 'error';
  summary: string;
  cmyk: { c: number; m: number; y: number; k: number }[];
}

/* ============================ Luna 对话 ============================ */

/** 生图两档（对应 Seedream Flash / Pro） */
export type ImageTier = 'flash' | 'pro';

/** 单条 Luna 分身对话消息（区别于编辑器内部聊天用的旧 ChatMessage） */
export interface LunaMessage {
  id: string;
  role: 'user' | 'assistant';
  /** 正文文本 */
  content: string;
  /** 思考过程（DeepSeek Reasoner 返回，界面可折叠展示） */
  reasoning?: string;
  /** 生成的图片（data URL 或可访问 URL） */
  image?: string;
  /** 本条生图所用档位（仅生图消息） */
  imageTier?: ImageTier;
  /** 时间戳 */
  at: number;
  /** 是否出错（用于展示错误态） */
  error?: boolean;
}

/** 一个完整对话 */
export interface Conversation {
  id: string;
  title: string;
  messages: LunaMessage[];
  /** 该对话默认生图档位 */
  imageTier: ImageTier;
  createdAt: number;
  updatedAt: number;
}

/* ======================== V2 AI 原生工作流 ======================== */

/** 创作模式（任务书第三部分 C） */
export type CreationMode = 'referenceStyle' | 'referenceInnovate' | 'fromScratch';

/** 工作流阶段：驱动页面渲染，刷新后据此恢复 */
export type WorkflowStage = 'entry' | 'analysis' | 'concepts' | 'planning' | 'workflow' | 'assembled';

/** 参考图用途分类 */
export type ReferenceRole =
  | 'packaging' | 'product' | 'competitor' | 'logo' | 'brandGuideline'
  | 'font' | 'material' | 'finishing' | 'sketch' | 'other';

/** 上传的参考图片：真实转 data URL 持久化，非临时显示 */
export interface ReferenceImage {
  id: string;
  /** data URL */
  src: string;
  name: string;
  naturalW: number;
  naturalH: number;
  /** 宽高比（前端真实计算） */
  ratio: number;
  /** 图片用途分类 */
  role: ReferenceRole;
  /** 用户备注：说明这张图参考哪部分 */
  note: string;
  /** 前端真实提取的主色 HEX（Canvas 采样，非语义识别） */
  dominantColors: string[];
  createdAt: number;
}

/** 结构化产品信息：首次只要求 description，其余按需补充 */
export interface ProductInfo {
  /** 自然语言主描述（核心，允许只填这一句） */
  description: string;
  productName: string;
  brandName: string;
  productType: string;
  productIntro: string;
  audience: string;
  pricePositioning: string;
  salesScene: string;
  packagingType: string;
  expectedSize: string;
  brandMainColor: string;
  specialRequirements: string;
}

/** 色彩规范条目 */
export interface ColorSpec {
  hex: string;
  rgb: string;
  role: 'primary' | 'secondary' | 'accent' | 'background' | 'ink';
  /** 估算占比 0-1（前端可计算时给出） */
  proportion?: number;
}

/** 材质分析条目：仅凭图片无法确定，一律标记为推测 */
export interface MaterialNote {
  name: string;
  visualFeature: string;
  recommendedAlternative: string;
  inferred: boolean;
}

/** 印刷工艺条目：光影不等于真实工艺，一律标记为推测 */
export interface FinishingNote {
  name: string;
  visualEvidence: string;
  inferred: boolean;
}

/** 图形与插画条目 */
export interface GraphicNote {
  element: string;
  style: string;
  color: string;
  usage: string;
  generationHint: string;
}

/**
 * 结构化设计分析报告（任务书 4.2，JSON 持久化，可被后续节点调用）。
 * source 诚实标注能力来源：
 *  - vision：真实视觉模型（当前后端无此端点，暂不可用）
 *  - text-frontend：文本模型基于用户文字 + 前端真实可计算的尺寸/主色（当前真实能力）
 */
export interface AnalysisReport {
  source: 'vision' | 'text-frontend';
  productUnderstanding: string;
  structure: {
    suggestedType: string;
    shape: string;
    features: string;
    confidence: 'low' | 'medium' | 'high';
    needsConfirmation: string;
  };
  materials: MaterialNote[];
  finishing: FinishingNote[];
  palette: ColorSpec[];
  typography: {
    titleStyle: string;
    bodyStyle: string;
    hierarchy: string;
    suggestions: string;
  };
  graphics: GraphicNote[];
  layout: {
    logoPosition: string;
    mainVisual: string;
    hierarchy: string;
    whitespace: string;
  };
  brandPositioning: {
    personality: string;
    positioning: string;
    audience: string;
    priceSense: string;
    emotion: string;
  };
  /** 合规信息清单：需要用户补充，AI 不编造生产商/许可证/条码 */
  requiredInformation: string[];
  /** 不确定项：区分图上可直接判断与仅靠推测 */
  uncertainties: string[];
  designConstraints: string[];
  /** 用户是否已确认并锁定为设计依据 */
  confirmed: boolean;
  at: number;
}

/** 设计方向（任务书 5.1，三个可选择方案） */
export interface DesignConcept {
  id: string;
  key: 'faithful' | 'brandOptimized' | 'creative';
  name: string;
  concept: string;
  visualKeywords: string[];
  colors: string[];
  materialDirection: string;
  structure: string;
  typographyDirection: string;
  illustrationDirection: string;
  composition: string;
  expectedEffect: string;
  referenceRelation: string;
}

/** 设计任务类型（任务书 5.2） */
export type DesignTaskType =
  | 'background' | 'illustration' | 'pattern' | 'texture' | 'decoration'
  | 'product-image' | 'typography' | 'brand' | 'barcode' | 'structural' | 'assembly';

/** 单个设计任务：P3 自动组装使用，P0 先建立类型底座 */
export interface DesignTask {
  id: string;
  type: DesignTaskType;
  name: string;
  face: FaceId | 'all';
  description: string;
  prompt: string;
  model: string;
  status: 'pending' | 'waiting' | 'running' | 'success' | 'failed' | 'cancelled';
  /** 生成结果对应的素材 ID */
  assetId?: string;
  /** 对应工程图层 ID（自动组装后回填） */
  layerId?: string;
  error?: string;
}

/** 聚合的 V2 工作流数据，挂在 Project.workflow；与项目同一份数据，不另起两套 */
export interface ProjectWorkflow {
  version: 1;
  stage: WorkflowStage;
  mode: CreationMode;
  productInfo: ProductInfo;
  referenceImages: ReferenceImage[];
  analysis: AnalysisReport | null;
  concepts: DesignConcept[];
  selectedConceptId: string | null;
  tasks: DesignTask[];
  createdAt: number;
  updatedAt: number;
}

/** 空产品信息（首次进入的默认值） */
export function emptyProductInfo(): ProductInfo {
  return {
    description: '',
    productName: '', brandName: '', productType: '', productIntro: '',
    audience: '', pricePositioning: '', salesScene: '', packagingType: '',
    expectedSize: '', brandMainColor: '', specialRequirements: '',
  };
}

/** 新建工作流的初始状态 */
export function createInitialWorkflow(now: number = Date.now()): ProjectWorkflow {
  return {
    version: 1,
    stage: 'entry',
    mode: 'referenceStyle',
    productInfo: emptyProductInfo(),
    referenceImages: [],
    analysis: null,
    concepts: [],
    selectedConceptId: null,
    tasks: [],
    createdAt: now,
    updatedAt: now,
  };
}
