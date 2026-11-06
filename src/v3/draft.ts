/* ============================================================
 * V3 统一项目数据模型
 * ------------------------------------------------------------
 * 九步向导、AI 生成、编辑器、印前与导出共享同一份 draft。
 * 字段命名对齐产品需求：project_id / package_type / style_id / …
 * 旧项目数据不会有 draft，store 载入时用 createEmptyDraft() 兜底。
 * ============================================================ */
import type { DesignBrief, StructureId } from '../types';
import { createEmptyBrief } from '../engine/brief';

export type PackageForm = 'box' | 'label' | 'pouch' | 'bottle' | 'gift' | 'custom';
export type Unit = 'mm' | 'cm' | 'inch';
export type LogoMode = '' | 'own' | 'ai' | 'none';
export type IllustrationType = '' | 'line' | 'illustration' | 'none';
export type BarcodeType = '' | 'EAN-13' | 'UPC-A' | 'Code 128' | 'upload';

export interface DimField {
  key: string;
  label: string;
  hint?: string;
  min: number;
  max: number;
  def: number;
  suffix?: string;
}

export interface FormMeta {
  id: PackageForm;
  label: string;
  en: string;
  desc: string;
  fields: DimField[];
  /** 形状 / 材质等单选，写入 dimensions.choice */
  choice?: { key: string; label: string; options: string[] };
  /** 该形态可生成的结构；结构本身还需要 extra 参数才算完整 */
  structures: StructureId[];
}

const F = (key: string, label: string, def: number, min: number, max: number, hint?: string): DimField => ({ key, label, def, min, max, hint });

export const FORM_META: Record<PackageForm, FormMeta> = {
  box: {
    id: 'box', label: '包装盒', en: 'FOLDING CARTON', desc: '食品盒、茶叶盒、产品外盒、礼盒',
    fields: [F('l', '长度 L', 200, 20, 600), F('w', '宽度 W', 150, 20, 600), F('h', '高度 H', 80, 5, 400)],
    structures: ['tuck', 'topBottom', 'drawer', 'mailer'],
  },
  label: {
    id: 'label', label: '产品标签', en: 'PRODUCT LABEL', desc: '瓶贴、罐贴、食品与护肤品标签',
    fields: [F('l', '标签宽度', 90, 10, 400), F('w', '标签高度', 120, 10, 400)],
    choice: { key: 'shape', label: '标签形状', options: ['矩形', '圆角矩形', '圆形', '椭圆'] },
    structures: ['labelRect', 'labelRound'],
  },
  pouch: {
    id: 'pouch', label: '包装袋', en: 'POUCH', desc: '自立袋、咖啡袋、零食袋',
    fields: [F('l', '袋宽', 140, 30, 500), F('w', '袋高', 220, 40, 700), F('h', '侧边折角', 60, 0, 200, '没有折角填 0')],
    structures: ['pouch'],
  },
  bottle: {
    id: 'bottle', label: '瓶罐包装', en: 'BOTTLE / JAR', desc: '饮料瓶、酱料罐、护肤品瓶身的环绕标签',
    fields: [
      F('l', '容器直径', 70, 20, 300, '或填下方周长'),
      F('c', '容器周长', 0, 0, 1200, '直径与周长填一个即可'),
      F('w', '标签高度', 80, 10, 400),
      F('h', '标签宽度', 0, 0, 1200, '留空则按周长自动计算'),
    ],
    structures: ['labelRect', 'labelRound'],
  },
  gift: {
    id: 'gift', label: '礼品包装', en: 'GIFT BOX', desc: '节日礼盒、品牌礼盒、伴手礼',
    fields: [F('l', '长度 L', 260, 40, 700), F('w', '宽度 W', 200, 40, 700), F('h', '高度 H', 90, 10, 400)],
    structures: ['topBottom', 'drawer', 'tuck'],
  },
  custom: {
    id: 'custom', label: '自定义包装', en: 'CUSTOM', desc: '异形或特殊结构，先给出外形尺寸，结构稍后确认',
    fields: [F('l', '长度 L', 200, 10, 900), F('w', '宽度 W', 150, 10, 900), F('h', '高度 H', 80, 0, 600)],
    structures: ['tuck', 'topBottom', 'drawer', 'mailer'],
  },
};

/** 结构补充参数：不能只凭三个外形尺寸就假定结构可精确生成 */
export const STRUCTURE_EXTRA: Record<StructureId, { key: string; label: string; def: number; min: number; max: number; hint?: string }[]> = {
  tuck: [{ key: 'glue', label: '粘合位宽度', def: 14, min: 8, max: 30 }, { key: 'tuckLen', label: '插舌长度', def: 18, min: 10, max: 40 }],
  topBottom: [{ key: 'wall', label: '盒盖高度', def: 25, min: 8, max: 120 }, { key: 'gap', label: '套合间隙', def: 1.5, min: 0.5, max: 5, hint: '上下盖之间的配合余量' }],
  drawer: [{ key: 'wall', label: '内盒壁厚', def: 22, min: 8, max: 100 }],
  mailer: [{ key: 'flap', label: '侧翼长度', def: 40, min: 15, max: 120 }],
  pouch: [{ key: 'seal', label: '顶部封口边', def: 12, min: 5, max: 40 }],
  labelRect: [{ key: 'radius', label: '圆角半径', def: 2, min: 0, max: 30, hint: '0 为直角' }],
  labelRound: [{ key: 'radius', label: '圆角半径', def: 0, min: 0, max: 30 }],
};

export interface Dimensions {
  unit: Unit;
  known: boolean;                    // 我知道尺寸 / 我还不确定
  values: Record<string, number>;    // 一律以 mm 存储
  choice: string;                    // 形状等单选
  structureId: StructureId | '';
  structureConfirmed: boolean;
  extra: Record<string, number>;     // 结构补充参数（mm）
  measuredNote: string;              // 不确定尺寸时的测量引导记录
}

export interface LogoAsset {
  name: string;
  src: string;             // data URL（原始文件保留，不做覆盖）
  mime: string;
  naturalW: number;
  naturalH: number;
  transparent: boolean;
  sharp: boolean;          // 清晰度是否达标
  scale: number;           // 用户确认的缩放
  recolor: string;         // 用户确认的换色，空 = 保持原始
  removeBg: boolean;       // 用户确认的去背
  keepOriginal: boolean;   // 未经确认不擅自修改
}

export interface LogoAISpec {
  brandName: string;
  industry: string;
  position: string;
  style: string;
  color: string;
  motif: string;
}
export interface LogoOption { id: string; name: string; svg: string; note: string }

export interface AudienceDraft {
  ages: string[];
  groups: string[];
  tiers: string[];
  aiRecommend: boolean;
  advice: string;
}

export interface ProductDraft {
  group: string;   // 食品 / 饮品 / …
  type: string;    // 茶叶 / 咖啡 / …
  custom: string;
  note: string;    // 不编造配料/功效/认证
}

export interface PaletteDraft {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  ink: string;
  ratio: [number, number, number, number];
  reason: string;
  source: 'ai' | 'custom';
}

export interface CopyDraft {
  brandName: string;
  productName: string;
  subtitle: string;
  tagline: string;
  description: string;
  spec: string;
  netWeight: string;
  extra: string;
  mode: 'own' | 'ai';
  confirmed: boolean;   // AI 建议必须确认后才写入
  aiSuggestion: string;
  complianceNote: string;
}

export interface BarcodeDraft {
  needed: boolean | null;
  type: BarcodeType;
  value: string;
  asset: { name: string; src: string; naturalW: number; naturalH: number; sharp: boolean } | null;
  svg: string;          // 生成的矢量条码
  previewOnly: boolean; // 内部 SKU / 占位码必须标记
  scale: number;
  position: string;
  legalNote: string;
}

export interface ProjectDraft {
  project_id: string;
  /** 向导状态 */
  step: number;
  visited: number[];
  skipped: number[];
  savedAt: number;
  snapshots: { at: number; label: string; data: string }[];

  package_type: PackageForm;
  package_dimensions: Dimensions;

  brand_logo: LogoAsset | null;
  logo_creation_mode: LogoMode;
  logo_ai_spec: LogoAISpec;
  logo_options: LogoOption[];
  logo_selected: string;
  logo_svg: string;

  target_audience: AudienceDraft;
  product_category: ProductDraft;

  style_id: string;
  style_parameters: string;      // JSON 字符串，保存选中风格的完整配置
  style_favorites: string[];

  primary_color: string;
  color_palette_id: string;
  color_palette: PaletteDraft | null;
  color_palettes: PaletteDraft[];
  saved_palettes: PaletteDraft[];

  illustration_type: IllustrationType;
  illustration_description: string;

  copy_content: CopyDraft;

  barcode_type: BarcodeType;
  barcode_value: string;
  barcode_asset: BarcodeDraft;

  /** 生成与交付（指向 store 中的 schemes / design / report） */
  design_variants: string[];
  selected_design: string;
  editable_layers: number;
  preflight_report: string;
  export_files: string[];
}

const UNIT_MM: Record<Unit, number> = { mm: 1, cm: 10, inch: 25.4 };
export const toMm = (v: number, u: Unit) => Math.round(v * UNIT_MM[u] * 100) / 100;
export const fromMm = (v: number, u: Unit) => Math.round(v / UNIT_MM[u] * 100) / 100;
export const unitLabel = (u: Unit) => u === 'mm' ? 'mm' : u === 'cm' ? 'cm' : 'in';

export function defaultDimensions(form: PackageForm): Dimensions {
  const m = FORM_META[form];
  return {
    unit: 'mm', known: true,
    values: Object.fromEntries(m.fields.map((f) => [f.key, f.def])),
    choice: m.choice?.options[0] || '',
    structureId: '', structureConfirmed: false, extra: {}, measuredNote: '',
  };
}

export function createEmptyDraft(): ProjectDraft {
  const form: PackageForm = 'box';
  return {
    project_id: `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    step: 0, visited: [0], skipped: [], savedAt: Date.now(), snapshots: [],
    package_type: form,
    package_dimensions: defaultDimensions(form),
    brand_logo: null, logo_creation_mode: '',
    logo_ai_spec: { brandName: '', industry: '', position: '', style: '极简文字 Logo', color: '#20463a', motif: '' },
    logo_options: [], logo_selected: '', logo_svg: '',
    target_audience: { ages: [], groups: [], tiers: [], aiRecommend: false, advice: '' },
    product_category: { group: '', type: '', custom: '', note: '' },
    style_id: '', style_parameters: '', style_favorites: [],
    primary_color: '', color_palette_id: '', color_palette: null, color_palettes: [], saved_palettes: [],
    illustration_type: '', illustration_description: '',
    copy_content: {
      brandName: '', productName: '', subtitle: '', tagline: '', description: '', spec: '', netWeight: '', extra: '',
      mode: 'own', confirmed: false, aiSuggestion: '', complianceNote: '',
    },
    barcode_type: '', barcode_value: '',
    barcode_asset: {
      needed: null, type: '', value: '', asset: null, svg: '', previewOnly: false, scale: 1,
      position: '背面右下', legalNote: '',
    },
    design_variants: [], selected_design: '', editable_layers: 0, preflight_report: '', export_files: [],
  };
}

/** 兼容旧数据：补齐所有可能缺失的字段 */
export function normalizeDraft(d: Partial<ProjectDraft> | undefined | null): ProjectDraft {
  const base = createEmptyDraft();
  if (!d || typeof d !== 'object') return base;
  return {
    ...base, ...d,
    package_dimensions: { ...base.package_dimensions, ...(d.package_dimensions || {}), values: { ...(d.package_dimensions?.values || {}) }, extra: { ...(d.package_dimensions?.extra || {}) } },
    target_audience: { ...base.target_audience, ...(d.target_audience || {}) },
    product_category: { ...base.product_category, ...(d.product_category || {}) },
    logo_ai_spec: { ...base.logo_ai_spec, ...(d.logo_ai_spec || {}) },
    copy_content: { ...base.copy_content, ...(d.copy_content || {}) },
    barcode_asset: { ...base.barcode_asset, ...(d.barcode_asset || {}) },
  };
}

/** 把当前形态的尺寸折算成结构引擎需要的 l / w / h（mm） */
export function effectiveSize(d: ProjectDraft): { l: number; w: number; h: number } {
  const v = d.package_dimensions.values;
  const f = d.package_type;
  if (f === 'bottle') {
    const c = v.c || Math.PI * (v.l || 70);
    return { l: v.h || c, w: v.w || 80, h: 0 };
  }
  if (f === 'label') return { l: v.l || 90, w: v.w || 120, h: 0 };
  return { l: v.l || 200, w: v.w || 150, h: v.h || 80 };
}

/** 结构是否已具备全部必要参数 */
export function dimensionComplete(d: ProjectDraft): { ok: boolean; missing: string[] } {
  const dm = d.package_dimensions;
  if (!dm.known) return { ok: false, missing: ['确认成品尺寸'] };
  const missing: string[] = [];
  const meta = FORM_META[d.package_type];
  for (const f of meta.fields) {
    if (f.key === 'c' || f.key === 'h' && (d.package_type === 'bottle' || d.package_type === 'pouch')) continue;
    if (!(dm.values[f.key] > 0)) missing.push(f.label);
  }
  if (d.package_type === 'bottle' && !(dm.values.l > 0 || dm.values.c > 0)) missing.push('容器直径或周长');
  if (!dm.structureId) missing.push('包装结构');
  else for (const e of STRUCTURE_EXTRA[dm.structureId] || []) {
    if (dm.extra[e.key] === undefined || Number.isNaN(dm.extra[e.key])) missing.push(e.label);
  }
  return { ok: missing.length === 0, missing };
}

/** 结构补充参数是否已齐全（选定了结构，且每个补充参数都有合法数值）。
 *  刻意不依赖 structureConfirmed 标志：那个标志需要用户额外点一次「确认」，
 *  很容易在「参数都填好了」的情况下仍然拦住流程，所以这里按真实数据判定。 */
export function structureReady(d: ProjectDraft): boolean {
  const dm = d.package_dimensions;
  if (!dm.structureId) return false;
  for (const e of STRUCTURE_EXTRA[dm.structureId] || []) {
    const v = dm.extra[e.key];
    if (v === undefined || v === null || Number.isNaN(Number(v))) return false;
  }
  return true;
}

/** 九步数据 → 旧 DesignBrief（下游 buildSchemes / 结构 / 印前 / 导出全部复用） */
export function draftToBrief(d: ProjectDraft, styleName = ''): DesignBrief {
  const b = createEmptyBrief();
  const p = d.product_category;
  const c = d.copy_content;
  const pal = d.color_palette;
  const bc = d.barcode_asset;
  const size = effectiveSize(d);
  const struct = (d.package_dimensions.structureId || FORM_META[d.package_type].structures[0]) as StructureId;
  // 用户第 09 步确认的产品名称优先；品类只作为 p.type / category / scene 传递，
  // 不得用「茶叶」这类品类词覆盖用户填写的「高山乌龙茶」。
  const product = c.productName || p.custom || p.type || '';
  const extra: string[] = [];
  if (c.subtitle) extra.push(c.subtitle);
  if (c.netWeight) extra.push(`净含量：${c.netWeight}`);
  if (c.extra) extra.push(c.extra);
  if (bc.needed && bc.svg) extra.push(bc.previewOnly ? '［预览用条码占位］' : '［条形码：见独立图层］');

  return {
    ...b,
    product,
    category: p.group,
    packType: d.package_type,
    brand: c.brandName || d.logo_ai_spec.brandName || '',
    tagline: c.tagline || '',
    spec: c.spec || c.netWeight || '',
    description: c.description || '',
    style: styleName || d.style_id,
    colors: pal ? [pal.bg, pal.primary, pal.secondary, pal.accent] : (d.primary_color ? ['#f7f5f0', d.primary_color] : []),
    motif: d.illustration_type === 'none' ? '' : (d.illustration_description || '主题图案'),
    audience: [...d.target_audience.ages, ...d.target_audience.groups].join('、'),
    targetGroup: [...d.target_audience.tiers, ...d.target_audience.groups].join('、'),
    scene: p.custom || p.type,
    material: '',
    structure: struct,
    size,
    structureExtra: { ...d.package_dimensions.extra },
    extraText: extra.filter(Boolean),
    raw: [],
    referenceImage: d.brand_logo?.src || '',
    referenceName: d.brand_logo?.name || (d.logo_svg ? 'AI 生成 Logo（SVG）' : ''),
  };
}
