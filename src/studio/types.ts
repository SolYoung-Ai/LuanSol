/* ============================================================
   Studio 2.0 — 需求收集的数据模型
   ------------------------------------------------------------
   设计原则（阶段 3 任务书第四部分）：
   1. 每一项答案都要能回答「这是谁给的」：
        user  = 用户自己打的字
        option= 用户从选项里挑的
        ai    = AI 给的推荐（必须带 confirmed 标记，没确认的不算定稿）
        none  = 还没回答
      所以答案统一包一层 Ans<T>，而不是只存值。
   2. 不编造产品信息：本阶段不产生配方、功效、认证、规格等任何
      产品事实，AI 只在「尺寸」上给一个可按常见规格推算的建议，且必须由用户确认。
   3. 结构化 JSON 直接可交给 DeepSeek：exportStructured() 会把
      用户填写 / 用户选择 / AI 推荐 / 尚未确认 四类分开列出。
   ============================================================ */

export const STUDIO_SCHEMA = 'lunasol.studio.v1';

/** 本机项目 id 前缀：云表与旧工作台共用 lunasol_projects，
 *  靠这个前缀把 Studio 项目与旧的包装设计项目分开，互不污染。 */
export const STUDIO_ID_PREFIX = 'st_';

export type CategoryId =
  | 'food' | 'drink' | 'tea' | 'beauty' | 'skincare'
  | 'health' | 'daily' | 'gift' | 'other';

export type FormId =
  | 'box' | 'gift' | 'pouch' | 'bag3d' | 'can'
  | 'bottle' | 'tube' | 'sachet' | 'bag' | 'tote' | 'outer';

export type StyleId =
  | 'minimal' | 'luxury' | 'organic' | 'oriental' | 'retro'
  | 'illustration' | 'fresh' | 'trend' | 'tech';

export type PatternId =
  | 'text' | 'geometric' | 'handdrawn' | 'botanical'
  | 'orientalPattern' | 'photo' | 'ai';

/** 答案来源。none = 这一项还没回答。 */
export type Source = 'user' | 'option' | 'ai' | 'none';

export interface Ans<T> {
  v: T;
  src: Source;
  /** 仅对 src='ai' 有意义：用户是否采纳了这条建议 */
  confirmed: boolean;
}

export const ans = <T,>(v: T, src: Source, confirmed = true): Ans<T> => ({ v, src, confirmed });
export const blank = <T,>(v: T): Ans<T> => ({ v, src: 'none', confirmed: false });

export const isAnswered = (a: Ans<unknown>): boolean =>
  a.src !== 'none' && a.v !== '' && a.v !== null && a.v !== undefined
  && !(Array.isArray(a.v) && a.v.length === 0);

export interface SizeMM { l: number; w: number; h: number }

export interface StudioSize {
  mode: 'recommended' | 'custom';
  dims: SizeMM;
  /** 推荐尺寸来自 AI 推算，必须 confirmed 才算定稿 */
  src: 'ai' | 'user';
  confirmed: boolean;
}

export interface LogoPick {
  mode: '' | 'upload' | 'reference' | 'none';
  /** 用户上传的 Logo（data URL，已压缩） */
  image: string | null;
  /** 用户上传的参考图（data URL，已压缩） */
  refImage: string | null;
}

export interface StudioAnswers {
  category: Ans<CategoryId | ''>;
  productName: Ans<string>;
  productContent: Ans<string>;
  sellingPoints: Ans<string>;
  form: Ans<FormId | ''>;
  size: StudioSize | null;
  stylePrimary: Ans<StyleId | ''>;
  styleSecondary: Ans<StyleId[]>;
  colors: Ans<string[]>;
  customColors: Ans<string[]>;
  /** 色彩参考图（data URL） */
  colorRef: Ans<string | null>;
  /** 结构补充参数（mm）：粘胶位 / 插舌 / 盖墙 / 间隙 / 侧翼 / 封口边 / 圆角。
   *  旧项目没有这个字段；有值时必须传给结构引擎，不能在工作台链路里被忽略。 */
  structureExtra?: Record<string, number>;
  patterns: Ans<PatternId[]>;
  logo: LogoPick;
  extra: Ans<string>;
}

export type StudioStatus = 'draft' | 'confirmed';

/** 工作台右侧的顾问对话：跟着项目走，刷新/换设备都能看到。
 *  只存文字（图片素材在 answers 里），上限 60 条，避免 payload 无限长。 */
export interface StudioChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: number;
  error?: boolean;
  /** 阶段四：普通文本 / 待确认计划 / 执行结果 */
  kind?: 'text' | 'plan' | 'result' | 'error';
  /** 待确认或已执行的操作预览（随项目一起保存） */
  plan?: import('./ai/types').StudioPlanPreview;
  planStatus?: 'pending' | 'applied' | 'rejected' | 'failed' | 'stale' | 'superseded' | 'undone';
  /** 执行后每一条动作的真实结果 */
  results?: import('./ai/types').ActionResult[];
  /** 执行后的设计指纹，用于判断是否还能直接撤销这次 AI 操作 */
  afterDigest?: string;
}

/* ============================ 设计稿（编辑器里的画布内容） ============================ */

/** 画布上的一个元素。坐标一律用百分比：0-100，
 *  这样缩放、换设备、换画布尺寸都不用重算一遍像素。
 *
 *  LunaSol 2.0 阶段一（渐进式加固）：在原字段之上**追加**可选字段，
 *  不改动任何既有必填字段，旧项目读进来不需要迁移即可继续用。
 *  新字段的语义与缺省值见各自注释；换算规则集中在 studio/frames.ts。 */
export type ElKind = 'text' | 'sticker' | 'rect';

/** 图形对象的几何形态。`rect` 这个 kind 就是「形状」，用 shape 区分具体语法，
 *  这样旧数据（只有色块）不需要迁移，新图形直接复用同一套坐标与图层逻辑。 */
export type ElShape = 'rect' | 'ellipse' | 'line';

/** 图片适配：contain 留白完整显示，cover 裁满画框 */
export type ElFit = 'contain' | 'cover';

/** 图片裁切窗口（相对原图 0–1，画布内生效；导出仍按 cover 近似） */
export interface ElCrop { x: number; y: number; w: number; h: number }

/** 素材来源。用于追溯「这张图是 AI 生成的、用户上传的、还是 Logo」，
 *  旧数据没有这个字段，读取时保持 undefined，不当成伪造信息。 */
export type ElSource = 'ai' | 'upload' | 'logo' | 'library' | 'system';

/** AI 拆图导入后的素材类型。只是标签，不参与几何/导出；
 *  用户可以手动改，模型分类也不保证 100% 准确。 */
export type ElLayerType =
  | 'background' | 'illustration' | 'decorative' | 'product' | 'logo' | 'text' | 'unknown';

export interface DesignEl {
  id: string;
  kind: ElKind;
  /** text 的文案 */
  text?: string;
  /** sticker 的图片（data URL）；没有 = 还没生成，画布上显示可点的占位框 */
  src?: string;
  /** 左上角坐标，百分比 */
  x: number;
  y: number;
  /** 宽度占画布宽度的百分比 */
  w: number;
  /** 矩形高度占画布高度的百分比（text / sticker 按内容自适应，不填） */
  h?: number;
  /** 文字字号：占画布宽度的百分比（跟着缩放一起变） */
  size?: number;
  color?: string;
  weight?: number;
  align?: 'left' | 'center' | 'right';
  opacity?: number;

  /* ---- 2.0 追加的可选字段（全部可缺省，缺省即旧行为） ---- */

  /** 元素所属面板。**以 faces 容器为准**，这里的值只是冗余快照：
   *  保存/读回时由 normalizeDesign 按容器重写，避免两面各说各话。 */
  faceId?: string;
  /** 图层显示名；不填时界面按内容兜底（文字取前 14 字、图片显示「插图」）。 */
  name?: string;
  /** 顺时针旋转角度（度）。不填 = 0，与旧行为一致。 */
  rotation?: number;
  /** 是否可见。不填 = true；false 时画布不画、导出不再输出，但数据仍在。 */
  visible?: boolean;
  /** 是否锁定。不填 = false；锁定元素的拖动/改尺寸在数据层忽略。 */
  locked?: boolean;
  /** 同一面内的叠放次序，越小越靠后。不填时按数组顺序（旧行为）。 */
  zIndex?: number;
  /** 文字字体族。不填时用引擎默认的中文黑体。 */
  fontFamily?: string;
  /** 图片素材来源，用于追溯与素材库回链。 */
  source?: ElSource;
  /** 素材库 ID（图片来自素材库时填）。 */
  assetId?: string;
  /** 首次创建 / 最近一次修改时间（毫秒）。旧数据为空。 */
  createdAt?: number;
  updatedAt?: number;

  /* ---- 2.0 阶段二：矢量编辑所需字段（同样全部可选） ---- */

  /** rect 的具体形态：矩形 / 椭圆 / 直线。不填 = 矩形。 */
  shape?: ElShape;
  /** 圆角半径（毫米）。仅矩形有效，不填 = 0。 */
  radius?: number;
  /** 图形描边颜色；不填 = 无描边。 */
  stroke?: string;
  /** 描边宽度（毫米），夹 0..20。 */
  strokeWidth?: number;
  /** 文字字间距（em），与引擎语义一致，不填 = 0。 */
  letterSpacing?: number;
  /** 文字行高（em），不填 = 1.4。 */
  lineHeight?: number;
  /** 图片适配方式；不填 = contain（旧版行为）。 */
  fit?: ElFit;
  /** 图片裁切窗口（contain 之外再裁一部分时用）。 */
  crop?: ElCrop;
  /** 图片原始像素尺寸，用于等比例缩放与裁切提示；旧数据为空。 */
  naturalW?: number;
  naturalH?: number;
  /** 组合 ID：同一 groupId 的元素一起被选中、移动、缩放、旋转、隐藏。 */
  groupId?: string;

  /* ---- 2.0 阶段三：AI 拆图导入的追溯字段（全部可选） ---- */

  /** 模型给出的素材类型标签（background / illustration / ...）。 */
  layerType?: ElLayerType;
  /** 该图层来自哪次拆图任务，便于排查与去重。 */
  importJob?: string;
  /** OCR 识别原文，仅用于提示；不是字体/排版事实。 */
  ocrText?: string;
  /** OCR 结构完整度启发值 0..1，不是模型置信度。 */
  ocrConfidence?: number;

  /** 印刷工艺：缺省 = 普通印刷；foil / uv / spot 必须独立图层导出。 */
  process?: 'print' | 'foil' | 'uv' | 'spot';
}

/** 编辑器里的画布状态。跟着项目一起存（本机 + 云端），换设备能接着改。
 *  从 3.0 起画布按「面」存：`faces` 每个面一份元素清单，`els` 是正面的旧字段，
 *  老数据读进来时迁移到 `faces.front`，导出/3D 都按面取值。 */
export interface StudioDesign {
  ratio: [number, number];
  bg: string;
  ink: string;
  accent: string;
  els: DesignEl[];
  /** 按面存的元素；key 为 FaceId（front / back / left / right / top） */
  faces?: Partial<Record<string, DesignEl[]>>;
  /** 按面覆盖的背景色。缺省时回落到 bg（旧数据无需迁移）。 */
  faceBg?: Partial<Record<string, string>>;
  updatedAt: number;
}

/** 取某个面的元素：老设计稿没有 faces 时，正面回落到 els，其余面为空 */
export function faceEls(d: StudioDesign | null | undefined, face = 'front'): DesignEl[] {
  if (!d) return [];
  const fromMap = d.faces?.[face];
  if (Array.isArray(fromMap)) return fromMap;
  return face === 'front' ? d.els : [];
}

/** 某个面实际使用的底色：面覆盖优先，否则用整份设计的 bg。 */
export function bgForFace(d: StudioDesign | null | undefined, face = 'front'): string {
  if (!d) return '#FFFFFF';
  const own = d.faceBg?.[face];
  return typeof own === 'string' && /^#[0-9a-fA-F]{6}$/.test(own) ? own : d.bg;
}

/** 写入某个面的底色，不影响其它面的覆盖值。 */
export function withFaceBg(d: StudioDesign, face: string, color: string): StudioDesign {
  return {
    ...d,
    faceBg: { ...(d.faceBg || {}), [face]: color },
    updatedAt: Date.now(),
  };
}

/** 写某个面：同时维护 els 与 faces，老代码读 els 不会读到旧内容。
 *  2.0：顺手把每个元素的 faceId 校正成所在面（容器是唯一权威，元素里的只是快照）。 */
export function withFaceEls(d: StudioDesign, face: string, els: DesignEl[]): StudioDesign {
  const stamped = els.map((e) => (e.faceId === face ? e : { ...e, faceId: face }));
  const faces = { ...(d.faces || {}), [face]: stamped };
  return {
    ...d,
    faces,
    els: face === 'front' ? stamped : faceEls({ ...d, faces }, 'front'),
    updatedAt: Date.now(),
  };
}

export interface StudioProject {
  schema: typeof STUDIO_SCHEMA;
  id: string;
  ownerId: string;
  name: string;
  status: StudioStatus;
  createdAt: number;
  updatedAt: number;
  /** 当前落在哪一段：1..9 = 单项答案（每页首项），10 = 需求总结。
   *  页面是 4 页，页与单步的映射见 PAGES / pageOfStep / stepOfPage。 */
  step: number;
  answers: StudioAnswers;
  /** AI 推荐记录：按当前包装形式算出的尺寸建议，供「AI 建议 · 待确认」展示 */
  suggestion: { form: FormId | ''; dims: SizeMM | null; at: number };
  confirmedAt: number | null;
  /** 右侧顾问对话（项目私有的那一段） */
  chat: StudioChatMsg[];
  /** 编辑器画布：确认需求后才建，草稿阶段为 null */
  design: StudioDesign | null;
}

/* ============================ 选项表 ============================ */

export interface CategoryDef {
  id: CategoryId;
  zh: string;
  en: string;
  /** 卡片上的一句话，告诉用户这一类通常怎么包装 */
  hintZh: string;
  hintEn: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'food', zh: '食品', en: 'Food', hintZh: '零食、糕点、调味', hintEn: 'Snacks, bakery, sauces' },
  { id: 'drink', zh: '饮品', en: 'Drinks', hintZh: '茶饮、咖啡、酒水', hintEn: 'Tea drinks, coffee, alcohol' },
  { id: 'tea', zh: '茶叶', en: 'Tea', hintZh: '散茶、茶包、茶礼', hintEn: 'Loose leaf, bags, gifts' },
  { id: 'beauty', zh: '美妆', en: 'Beauty', hintZh: '彩妆、香水', hintEn: 'Makeup, fragrance' },
  { id: 'skincare', zh: '护肤', en: 'Skincare', hintZh: '面霜、精华、身体护理', hintEn: 'Creams, serums, body care' },
  { id: 'health', zh: '保健品', en: 'Supplements', hintZh: '维生素、口服液', hintEn: 'Vitamins, tonics' },
  { id: 'daily', zh: '日用品', en: 'Household', hintZh: '洗护、清洁、家居', hintEn: 'Home and personal care' },
  { id: 'gift', zh: '礼品', en: 'Gifting', hintZh: '礼盒、伴手礼', hintEn: 'Gift boxes, souvenirs' },
  { id: 'other', zh: '其他', en: 'Other', hintZh: '还没想好也可以', hintEn: 'Anything else' },
];

export interface FormDef {
  id: FormId;
  zh: string;
  en: string;
  /** 该形式的常见结构，用于推荐尺寸 */
  size: SizeMM;
}

const FORMS: Record<FormId, FormDef> = {
  box: { id: 'box', zh: '纸盒', en: 'Folding carton', size: { l: 120, w: 60, h: 180 } },
  gift: { id: 'gift', zh: '礼盒', en: 'Gift box', size: { l: 260, w: 180, h: 80 } },
  pouch: { id: 'pouch', zh: '自立袋', en: 'Stand-up pouch', size: { l: 140, w: 40, h: 210 } },
  bag3d: { id: 'bag3d', zh: '立体袋', en: 'Box pouch', size: { l: 130, w: 50, h: 200 } },
  can: { id: 'can', zh: '罐装', en: 'Can / tin', size: { l: 66, w: 66, h: 120 } },
  bottle: { id: 'bottle', zh: '瓶身标签', en: 'Bottle label', size: { l: 62, w: 62, h: 180 } },
  tube: { id: 'tube', zh: '软管', en: 'Soft tube', size: { l: 45, w: 45, h: 140 } },
  sachet: { id: 'sachet', zh: '独立茶包', en: 'Individual sachet', size: { l: 70, w: 70, h: 12 } },
  bag: { id: 'bag', zh: '茶袋', en: 'Tea bag', size: { l: 110, w: 50, h: 190 } },
  tote: { id: 'tote', zh: '手提袋', en: 'Carry bag', size: { l: 250, w: 120, h: 300 } },
  outer: { id: 'outer', zh: '产品外盒', en: 'Outer carton', size: { l: 90, w: 45, h: 150 } },
};

/** 第三步：按类别给出可选的包装形式（顺序即展示顺序） */
export const FORMS_BY_CATEGORY: Record<CategoryId, FormId[]> = {
  food: ['box', 'bag3d', 'pouch', 'can', 'gift'],
  drink: ['bottle', 'can', 'box', 'pouch', 'gift'],
  tea: ['box', 'bag', 'gift', 'sachet'],
  beauty: ['bottle', 'outer', 'tube', 'gift'],
  skincare: ['bottle', 'outer', 'tube', 'can', 'gift'],
  health: ['bottle', 'box', 'pouch', 'gift'],
  daily: ['box', 'pouch', 'bottle', 'can'],
  gift: ['gift', 'box', 'tote', 'can'],
  other: ['box', 'pouch', 'can', 'gift'],
};

export const formDef = (id: FormId | ''): FormDef | null => (id ? FORMS[id] : null);
export const formsFor = (c: CategoryId | ''): FormDef[] =>
  (c ? FORMS_BY_CATEGORY[c] : FORMS_BY_CATEGORY.other).map((id) => FORMS[id]);

export interface StyleDef {
  id: StyleId;
  zh: string;
  en: string;
  hintZh: string;
  hintEn: string;
}

export const STYLES: StyleDef[] = [
  { id: 'minimal', zh: '极简现代', en: 'Minimal modern', hintZh: '留白、克制、字体为主', hintEn: 'Whitespace and type' },
  { id: 'luxury', zh: '高端奢华', en: 'Luxury', hintZh: '深色、金属、精细工艺', hintEn: 'Deep tones, metal, finishing' },
  { id: 'organic', zh: '自然有机', en: 'Natural organic', hintZh: '纸感、大地色、手作感', hintEn: 'Paper, earth tones' },
  { id: 'oriental', zh: '东方美学', en: 'Eastern aesthetic', hintZh: '留白、水墨、印章', hintEn: 'Ink, seals, negative space' },
  { id: 'retro', zh: '复古怀旧', en: 'Retro', hintZh: '旧海报、老字体、颗粒', hintEn: 'Vintage posters and type' },
  { id: 'illustration', zh: '艺术插画', en: 'Illustrated', hintZh: '手绘主视觉、故事感', hintEn: 'Hand-drawn storytelling' },
  { id: 'fresh', zh: '清新活力', en: 'Fresh and bright', hintZh: '浅色、圆润、轻快', hintEn: 'Light, round, playful' },
  { id: 'trend', zh: '潮流个性', en: 'Bold trend', hintZh: '强对比、大字、符号', hintEn: 'Contrast, big type, symbols' },
  { id: 'tech', zh: '科技未来', en: 'Future tech', hintZh: '渐变、网格、精密感', hintEn: 'Gradients, grids, precision' },
];

export const styleDef = (id: StyleId | ''): StyleDef | null =>
  (id ? STYLES.find((s) => s.id === id) || null : null);

export interface PatternDef {
  id: PatternId;
  zh: string;
  en: string;
}

export const PATTERNS: PatternDef[] = [
  { id: 'text', zh: '纯文字', en: 'Typography only' },
  { id: 'geometric', zh: '几何图案', en: 'Geometric' },
  { id: 'handdrawn', zh: '手绘插画', en: 'Hand-drawn' },
  { id: 'botanical', zh: '植物元素', en: 'Botanical' },
  { id: 'orientalPattern', zh: '东方纹样', en: 'Eastern motifs' },
  { id: 'photo', zh: '产品摄影', en: 'Product photography' },
  { id: 'ai', zh: 'AI 自由设计', en: 'Let AI decide' },
];

export const patternDef = (id: PatternId): PatternDef | undefined => PATTERNS.find((p) => p.id === id);

/** 颜色卡片：都是能直接印出来的常用包装色，不是随机取色 */
export interface ColorDef { hex: string; zh: string; en: string }

export const COLORS: ColorDef[] = [
  { hex: '#191919', zh: '墨黑', en: 'Ink' },
  { hex: '#3A3A3A', zh: '石墨', en: 'Graphite' },
  { hex: '#F7F3EC', zh: '象牙白', en: 'Ivory' },
  { hex: '#EDE4D3', zh: '米白', en: 'Oat' },
  { hex: '#C8A96A', zh: '香槟金', en: 'Champagne' },
  { hex: '#F47735', zh: '品牌橙', en: 'LunaSol orange' },
  { hex: '#C4693F', zh: '陶土', en: 'Terracotta' },
  { hex: '#8C2F2F', zh: '酒红', en: 'Wine' },
  { hex: '#2F5D4A', zh: '松绿', en: 'Pine' },
  { hex: '#7C8A5B', zh: '苔绿', en: 'Moss' },
  { hex: '#7C93A6', zh: '雾蓝', en: 'Mist blue' },
  { hex: '#23364D', zh: '藏蓝', en: 'Navy' },
  { hex: '#D9A6A0', zh: '藕粉', en: 'Blush' },
  { hex: '#6B5B95', zh: '紫藤', en: 'Wisteria' },
];

/* ============================ 项目工厂 ============================ */

export function emptyAnswers(): StudioAnswers {
  return {
    category: blank<CategoryId | ''>(''),
    productName: blank(''),
    productContent: blank(''),
    sellingPoints: blank(''),
    form: blank<FormId | ''>(''),
    size: null,
    stylePrimary: blank<StyleId | ''>(''),
    styleSecondary: ans<StyleId[]>([], 'none', false),
    colors: ans<string[]>([], 'none', false),
    customColors: ans<string[]>([], 'none', false),
    colorRef: blank<string | null>(null),
    patterns: ans<PatternId[]>([], 'none', false),
    logo: { mode: '', image: null, refImage: null },
    extra: blank(''),
  };
}

export function createStudioProject(ownerId: string, now = Date.now()): StudioProject {
  const id = `${STUDIO_ID_PREFIX}${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return {
    schema: STUDIO_SCHEMA,
    id,
    ownerId,
    name: '未命名设计',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    step: 1,
    answers: emptyAnswers(),
    suggestion: { form: '', dims: null, at: 0 },
    confirmedAt: null,
    chat: [],
    design: null,
  };
}

/* ============================ 尺寸推荐 ============================ */

/** AI 尺寸建议：按包装形式的常见成品规格给一个起点，单位 mm。
 *  这是「推断」不是「规格」——界面上必须标明 AI 建议并要求用户确认。 */
export function recommendSize(form: FormId | ''): SizeMM | null {
  const f = formDef(form);
  return f ? { ...f.size } : null;
}

export const sizeOk = (s: SizeMM | null): boolean =>
  !!s && [s.l, s.w, s.h].every((n) => Number.isFinite(n) && n >= 10 && n <= 1000);

export const sizeText = (s: SizeMM | null): string =>
  s ? `${Math.round(s.l)} × ${Math.round(s.w)} × ${Math.round(s.h)} mm` : '—';

/* ============================ 名称与校验 ============================ */

/** 项目名优先生成产品名称（任务书二） */
export function projectName(a: StudioAnswers): string {
  const n = a.productName.v.trim();
  return n || '未命名设计';
}

export interface MissingItem { /** 页码 1..4 */ step: number; zh: string; en: string }

/** 确认需求前必须齐全的项：只卡「没有它就没法设计」的，其余随时可空。
 *  返回的是**页码**，点一下就跳到该页。 */
export function missingRequired(p: StudioProject): MissingItem[] {
  const a = p.answers;
  const out: MissingItem[] = [];
  if (!a.category.v) out.push({ step: 1, zh: '产品类别', en: 'product category' });
  if (!a.productName.v.trim()) out.push({ step: 1, zh: '产品名称', en: 'product name' });
  if (!a.form.v) out.push({ step: 2, zh: '包装形式', en: 'packaging format' });
  if (!a.size || !sizeOk(a.size.dims)) out.push({ step: 2, zh: '包装尺寸', en: 'packaging size' });
  else if (!a.size.confirmed) out.push({ step: 2, zh: '确认包装尺寸', en: 'confirmed size' });
  if (!a.stylePrimary.v) out.push({ step: 3, zh: '主风格', en: 'primary style' });
  return out;
}

/* ============================ 页面分组 ============================ */
/* 九件事压成四页：一次只面对一件事的旧流程太长，
   但把「类别」和「名称」拆成两页纯属多余。合并后每页 1–4 个字段，
   都是在同一个决定里能一起想清楚的东西。 */

export interface PageDef {
  n: number;
  zh: string;
  en: string;
  subZh: string;
  subEn: string;
  /** 这一页包含的单项答案编号（对应 steps.tsx 的 STEPS） */
  steps: number[];
  required?: boolean;
}

export const PAGES: PageDef[] = [
  {
    n: 1,
    zh: '产品',
    en: 'The product',
    subZh: '是什么、叫什么、凭什么让人买——一页写完。',
    subEn: 'What it is, what it is called, why people buy it.',
    steps: [1, 2],
    required: true,
  },
  {
    n: 2,
    zh: '包装形式与尺寸',
    en: 'Format and size',
    subZh: '选一个最接近的结构，确认成品毫米尺寸——3D 与刀板都按它算。',
    subEn: 'Pick the closest structure and confirm the finished size — 3D and dieline use it.',
    steps: [3, 4],
    required: true,
  },
  {
    n: 3,
    zh: '风格与外观',
    en: 'Look and feel',
    subZh: '定调、配色、正面视觉、Logo，四件事一起定。',
    subEn: 'Style, palette, front-panel visuals and logo.',
    steps: [5, 6, 7, 8],
    required: true,
  },
  {
    n: 4,
    zh: '补充',
    en: 'Notes',
    subZh: '还有别的限制，写在这里；没有就直接确认。',
    subEn: 'Anything else — or confirm straight away.',
    steps: [9],
  },
];

export const PAGE_TOTAL = PAGES.length;
export const SUMMARY_STEP = 10;

/** 单步 → 页码 */
export function pageOfStep(step: number): number {
  const n = Math.max(1, Math.min(SUMMARY_STEP, Number(step) || 1));
  if (n >= SUMMARY_STEP) return PAGE_TOTAL + 1;
  const page = PAGES.find((p) => p.steps.includes(n));
  return page ? page.n : 1;
}

/** 页码 → 收进去存的单步（每页第一项）；总结页仍存 10 */
export function stepOfPage(page: number): number {
  const n = Math.max(1, Math.min(PAGE_TOTAL + 1, Number(page) || 1));
  if (n >= PAGE_TOTAL + 1) return SUMMARY_STEP;
  return PAGES[n - 1].steps[0];
}

/** 一条答案都没填的空项目：不进「我的设计」列表，避免满屏「未命名设计」。
 *  和旧工作台的 isBlankDraft 同一口径。 */
export function isBlankStudio(p: StudioProject): boolean {
  const a = p.answers;
  return !a.category.v && !a.productName.v.trim() && !a.productContent.v.trim()
    && !a.sellingPoints.v.trim() && !a.form.v && !a.size && !a.stylePrimary.v
    && !a.styleSecondary.v.length && !a.colors.v.length && !a.customColors.v.length
    && !a.colorRef.v && !a.patterns.v.length && !a.logo.mode && !a.extra.v.trim();
}

/* ============================ 结构化导出 ============================ */

/** 交给 DeepSeek 的结构化需求。
 *  四类分开列，绝不复述、绝不补全用户没说的话。 */
export interface StructuredBrief {
  schema: string;
  id: string;
  ownerId: string;
  name: string;
  status: StudioStatus;
  createdAt: number;
  updatedAt: number;
  /** 用户自己打的字 */
  written: Record<string, string>;
  /** 用户从选项里挑的 */
  selected: Record<string, string | string[]>;
  /** AI 给的建议（含是否已确认） */
  ai: Record<string, { value: unknown; confirmed: boolean }>;
  /** 还没回答 / 尚未确认的项 */
  pending: string[];
  /** 本阶段能力边界，避免下游把缺失项当成已知事实 */
  notes: string[];
}

const catZh = (id: CategoryId | '') => CATEGORIES.find((c) => c.id === id)?.zh || '';
const formZh = (id: FormId | '') => formDef(id)?.zh || '';
const styleZh = (id: StyleId | '') => styleDef(id)?.zh || '';

export function exportStructured(p: StudioProject): StructuredBrief {
  const a = p.answers;
  const written: Record<string, string> = {};
  const selected: Record<string, string | string[]> = {};
  const ai: Record<string, { value: unknown; confirmed: boolean }> = {};
  const pending: string[] = [];

  if (a.productName.v.trim()) written.productName = a.productName.v.trim();
  if (a.productContent.v.trim()) written.productContent = a.productContent.v.trim();
  if (a.sellingPoints.v.trim()) written.sellingPoints = a.sellingPoints.v.trim();
  if (a.extra.v.trim()) written.extra = a.extra.v.trim();

  if (a.category.v) selected.category = catZh(a.category.v);
  if (a.form.v) selected.form = formZh(a.form.v);
  if (a.stylePrimary.v) selected.stylePrimary = styleZh(a.stylePrimary.v);
  if (a.styleSecondary.v.length) selected.styleSecondary = a.styleSecondary.v.map(styleZh);
  if (a.colors.v.length || a.customColors.v.length) {
    selected.colors = [...a.colors.v, ...a.customColors.v];
  }
  if (a.patterns.v.length) selected.patterns = a.patterns.v.map((x) => patternDef(x)?.zh || x);
  if (a.logo.mode === 'none') selected.logoMode = '暂时没有 Logo';
  else if (a.logo.mode === 'upload' && a.logo.image) selected.logoMode = '用户上传 Logo';
  else if (a.logo.mode === 'reference' && a.logo.refImage) selected.logoMode = '用户上传参考图';
  if (a.colorRef.v) written.colorReference = '已上传色彩参考图';
  if (a.logo.refImage) written.logoReference = '已上传 Logo 参考图';

  if (a.size) {
    ai.size = {
      value: { ...a.size.dims, unit: 'mm' },
      confirmed: a.size.mode === 'custom' ? true : a.size.confirmed,
    };
    if (a.size.mode === 'recommended' && !a.size.confirmed) pending.push('包装尺寸（AI 建议待确认）');
  } else pending.push('包装尺寸');

  if (!a.productContent.v.trim()) pending.push('产品内容');
  if (!a.sellingPoints.v.trim()) pending.push('产品卖点');
  if (!a.patterns.v.length) pending.push('图案方向');
  if (!a.colors.v.length && !a.customColors.v.length) pending.push('主色');
  if (!a.logo.mode) pending.push('品牌 Logo 处理方式');

  return {
    schema: STUDIO_SCHEMA,
    id: p.id,
    ownerId: p.ownerId,
    name: p.name,
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    written,
    selected,
    ai,
    pending,
    notes: [
      '本阶段只收集需求，尚未生成任何包装图。',
      'AI 推荐尺寸由常见成品规格推算，未经用户确认前不作为生产依据。',
      '产品配方、功效、认证与规格一律未填写时保持为空，不做推测。',
    ],
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** 一个面的元素上限。旧上限 24 对真实包装版面不够用，2.0 阶段二提到 60，
 *  但仍然是硬上限，避免脏数据把画布拖死。 */
export const MAX_ELS_PER_FACE = 60;

/** 单个元素的白名单清洗：云端 / localStorage 里来的东西一律当作不可信。
 *  2.0 起同时清洗追加字段：旋转夹到 -180..180、透明度 0.05..1、
 *  zIndex 取整夹到 -99..99；faceId 由容器传入并**覆盖**数据里的值。 */
function cleanEls(raw: unknown, limit = 24, faceId?: string): DesignEl[] {
  if (!Array.isArray(raw)) return [];
  const clean: DesignEl[] = [];
  for (const e of raw.slice(0, limit)) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Partial<DesignEl>;
    const kind: ElKind = o.kind === 'sticker' ? 'sticker' : o.kind === 'rect' ? 'rect' : 'text';
    const rawSrc = typeof o.src === 'string' ? o.src : '';
    if (rawSrc.startsWith('data:image/') && rawSrc.length > 6_000_000) continue;
    /* 阶段三起，拆图图层用服务端素材短链（HTTPS）而不是把几十张 base64
       塞进项目 JSON。只接受 https，不接受 http / javascript / data:svg。 */
    const src = rawSrc.startsWith('data:image/')
      ? (rawSrc.length <= 6_000_000 ? rawSrc : undefined)
      : (rawSrc.startsWith('https://') && rawSrc.length <= 1000 ? rawSrc : undefined);
    const id = typeof o.id === 'string' && o.id ? o.id : `el_${clean.length}`;
    const el: DesignEl = {
      id,
      kind,
      text: typeof o.text === 'string' ? o.text.slice(0, 200) : undefined,
      src,
      x: num(o.x, 0, 100, 10),
      y: num(o.y, 0, 100, 10),
      w: num(o.w, 2, 100, 40),
      h: o.h === undefined ? undefined : num(o.h, 0.1, 100, 2),
      size: o.size === undefined ? undefined : num(o.size, 0.8, 40, 4),
      color: typeof o.color === 'string' && HEX.test(o.color) ? o.color : undefined,
      weight: o.weight === undefined ? undefined : num(o.weight, 300, 800, 400),
      align: o.align === 'center' || o.align === 'right' ? o.align : 'left',
      opacity: o.opacity === undefined ? undefined : num(o.opacity, 0.05, 1, 1),
    };
    /* 追加字段：只有明确给出了合法值才写，没给就保持 undefined（= 旧行为） */
    if (faceId) el.faceId = faceId;
    if (typeof o.name === 'string' && o.name.trim()) el.name = o.name.trim().slice(0, 40);
    if (o.rotation !== undefined) el.rotation = num(o.rotation, -180, 180, 0);
    if (typeof o.visible === 'boolean') el.visible = o.visible;
    if (typeof o.locked === 'boolean') el.locked = o.locked;
    if (o.zIndex !== undefined) el.zIndex = Math.round(num(o.zIndex, -99, 99, 0));
    if (typeof o.fontFamily === 'string' && o.fontFamily.trim()) el.fontFamily = o.fontFamily.trim().slice(0, 80);
    if (o.source === 'ai' || o.source === 'upload' || o.source === 'logo'
      || o.source === 'library' || o.source === 'system') el.source = o.source;
    if (typeof o.assetId === 'string' && o.assetId.trim()) el.assetId = o.assetId.trim().slice(0, 64);
    if (o.createdAt !== undefined) el.createdAt = num(o.createdAt, 0, Number.MAX_SAFE_INTEGER, 0) || undefined;
    if (o.updatedAt !== undefined) el.updatedAt = num(o.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0) || undefined;

    /* 阶段二：图形 / 文字排版 / 图片 / 组合 */
    if (o.shape === 'ellipse' || o.shape === 'line') el.shape = o.shape;
    if (o.radius !== undefined) el.radius = num(o.radius, 0, 60, 0);
    if (typeof o.stroke === 'string' && HEX.test(o.stroke)) el.stroke = o.stroke;
    if (o.strokeWidth !== undefined) el.strokeWidth = num(o.strokeWidth, 0, 20, 0);
    if (o.letterSpacing !== undefined) el.letterSpacing = num(o.letterSpacing, -0.2, 1, 0);
    if (o.lineHeight !== undefined) el.lineHeight = num(o.lineHeight, 0.8, 3, 1.4);
    if (o.fit === 'cover') el.fit = 'cover';
    if (o.crop && typeof o.crop === 'object') {
      const c = o.crop as Partial<ElCrop>;
      const cw = num(c.w, 0.05, 1, 1);
      const ch = num(c.h, 0.05, 1, 1);
      el.crop = { x: num(c.x, 0, 1 - cw, 0), y: num(c.y, 0, 1 - ch, 0), w: cw, h: ch };
    }
    if (o.naturalW !== undefined) el.naturalW = num(o.naturalW, 1, 20000, 1000);
    if (o.naturalH !== undefined) el.naturalH = num(o.naturalH, 1, 20000, 1000);
    if (typeof o.groupId === 'string' && o.groupId.trim()) el.groupId = o.groupId.trim().slice(0, 40);
    if (o.layerType === 'background' || o.layerType === 'illustration' || o.layerType === 'decorative'
      || o.layerType === 'product' || o.layerType === 'logo' || o.layerType === 'text'
      || o.layerType === 'unknown') el.layerType = o.layerType;
    if (typeof o.importJob === 'string' && o.importJob.trim()) el.importJob = o.importJob.trim().slice(0, 64);
    if (typeof o.ocrText === 'string' && o.ocrText.trim()) el.ocrText = o.ocrText.trim().slice(0, 500);
    if (o.ocrConfidence !== undefined) el.ocrConfidence = num(o.ocrConfidence, 0, 1, 0.5);
    clean.push(el);
  }
  return clean;
}

/** 设计稿的读书笔记：云端/localStorage 里的东西不可信，
 *  坐标越界、字号为 0、贴一张 40MB 的图都可能把画布弄崩，一律夹到安全范围。
 *  3.0 起按面清洗；老稿只有 els，等同于 faces.front。
 *  2.0：每个元素的 faceId 由容器决定，数据里写错的 faceId 会被重写。 */
export function normalizeDesign(raw: unknown): StudioDesign | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<StudioDesign>;
  const front = cleanEls(o.els, MAX_ELS_PER_FACE, 'front');
  const faces: Partial<Record<string, DesignEl[]>> = {};
  if (o.faces && typeof o.faces === 'object') {
    for (const [face, list] of Object.entries(o.faces)) {
      if (!/^[a-zA-Z]{2,8}$/.test(face)) continue;
      faces[face] = cleanEls(list, MAX_ELS_PER_FACE, face);
    }
  }
  if (!faces.front && front.length) faces.front = front;
  const els = faces.front || front;
  if (!els.length && !Object.values(faces).some((x) => (x as DesignEl[])?.length)) return null;
  const ratio: [number, number] = Array.isArray(o.ratio) && o.ratio.length === 2
    && o.ratio.every((n) => Number(n) > 0)
    ? [Number(o.ratio[0]), Number(o.ratio[1])]
    : [3, 4];
  return {
    ratio,
    bg: typeof o.bg === 'string' && HEX.test(o.bg) ? o.bg : '#FFFFFF',
    ink: typeof o.ink === 'string' && HEX.test(o.ink) ? o.ink : '#191919',
    accent: typeof o.accent === 'string' && HEX.test(o.accent) ? o.accent : '#F47735',
    els,
    faces,
    faceBg: Object.fromEntries(Object.entries(o.faceBg || {})
      .filter(([key, value]) => /^[a-zA-Z]{2,8}$/.test(key) && typeof value === 'string' && HEX.test(value as string))),
    updatedAt: Number(o.updatedAt) || Date.now(),
  };
}

/** 从云端 / 本地读回的旧数据补字段：刷新恢复、跨设备都走这里 */
export function normalizeStudioProject(raw: unknown): StudioProject | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<StudioProject> & { answers?: Partial<StudioAnswers> };
  if (!o.id || typeof o.id !== 'string' || !o.id.startsWith(STUDIO_ID_PREFIX)) return null;
  const base = emptyAnswers();
  const a = { ...base, ...(o.answers || {}) } as StudioAnswers;
  a.logo = { ...base.logo, ...(o.answers?.logo || {}) };
  return {
    schema: STUDIO_SCHEMA,
    id: o.id,
    ownerId: String(o.ownerId || ''),
    name: String(o.name || '未命名设计'),
    status: o.status === 'confirmed' ? 'confirmed' : 'draft',
    createdAt: Number(o.createdAt) || Date.now(),
    updatedAt: Number(o.updatedAt) || Date.now(),
    step: Math.min(10, Math.max(1, Number(o.step) || 1)),
    answers: a,
    suggestion: o.suggestion && typeof o.suggestion === 'object'
      ? { form: (o.suggestion.form || '') as FormId | '', dims: o.suggestion.dims || null, at: Number(o.suggestion.at) || 0 }
      : { form: '', dims: null, at: 0 },
    confirmedAt: o.confirmedAt ? Number(o.confirmedAt) : null,
    chat: Array.isArray(o.chat)
      ? o.chat
        .filter((m): m is StudioChatMsg => !!m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-60)
      : [],
    design: normalizeDesign(o.design),
  };
}
