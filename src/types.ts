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
