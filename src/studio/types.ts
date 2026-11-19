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
}

/* ============================ 设计稿（编辑器里的画布内容） ============================ */

/** 画布上的一个元素。坐标一律用百分比：0-100，
 *  这样缩放、换设备、换画布尺寸都不用重算一遍像素。 */
export type ElKind = 'text' | 'sticker' | 'rect';

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
  updatedAt: number;
}

/** 取某个面的元素：老设计稿没有 faces 时，正面回落到 els，其余面为空 */
export function faceEls(d: StudioDesign | null | undefined, face = 'front'): DesignEl[] {
  if (!d) return [];
  const fromMap = d.faces?.[face];
  if (Array.isArray(fromMap)) return fromMap;
  return face === 'front' ? d.els : [];
}

/** 写某个面：同时维护 els 与 faces，老代码读 els 不会读到旧内容 */
export function withFaceEls(d: StudioDesign, face: string, els: DesignEl[]): StudioDesign {
  const faces = { ...(d.faces || {}), [face]: els };
  return {
    ...d,
    faces,
    els: face === 'front' ? els : faceEls({ ...d, faces }, 'front'),
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

/** 单个元素的白名单清洗：云端 / localStorage 里来的东西一律当作不可信 */
function cleanEls(raw: unknown, limit = 24): DesignEl[] {
  if (!Array.isArray(raw)) return [];
  const clean: DesignEl[] = [];
  for (const e of raw.slice(0, limit)) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Partial<DesignEl>;
    const kind: ElKind = o.kind === 'sticker' ? 'sticker' : o.kind === 'rect' ? 'rect' : 'text';
    const src = typeof o.src === 'string' && o.src.startsWith('data:image/') ? o.src : undefined;
    if (kind === 'sticker' && src && src.length > 6_000_000) continue;
    const id = typeof o.id === 'string' && o.id ? o.id : `el_${clean.length}`;
    clean.push({
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
    });
  }
  return clean;
}

/** 设计稿的读书笔记：云端/localStorage 里的东西不可信，
 *  坐标越界、字号为 0、贴一张 40MB 的图都可能把画布弄崩，一律夹到安全范围。
 *  3.0 起按面清洗；老稿只有 els，等同于 faces.front。 */
export function normalizeDesign(raw: unknown): StudioDesign | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<StudioDesign>;
  const front = cleanEls(o.els);
  const faces: Partial<Record<string, DesignEl[]>> = {};
  if (o.faces && typeof o.faces === 'object') {
    for (const [face, list] of Object.entries(o.faces)) {
      if (!/^[a-zA-Z]{2,8}$/.test(face)) continue;
      faces[face] = cleanEls(list);
      if (face === 'front') faces.front = cleanEls(list);
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
