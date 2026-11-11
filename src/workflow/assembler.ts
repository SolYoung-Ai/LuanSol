/* ============================================================
 * P3 自动组装引擎（任务书 5.4 / 第七部分）
 * ------------------------------------------------------------
 * 把工作流里已成功的设计任务（AI 生成图片）+ 真实文字图层，
 * 按选定结构与各面尺寸组装成标准 DesignDoc：
 *   - 背景/材质/图案 → 满版图片图层（cover，置于底层）
 *   - 插画/装饰 → 可独立图片图层（contain，置于上层）
 *   - 品牌/产品/净含量 → 真实可编辑文字图层，不用图片伪造
 * 结构、尺寸、配色均从产品信息与分析报告推断，给真实兜底，
 * 不编造条码/Logo/生产信息。
 * ============================================================ */
import type {
  ConceptImage,
  DesignBrief,
  DesignDoc,
  ImageLayer,
  Layer,
  Palette,
  ProductInfo,
  ProjectWorkflow,
  StructureId,
  TextLayer,
} from '../types';
import { faceSizes } from '../engine/structure';
import { makeText } from '../engine/design';
import { parseSize } from '../engine/brief';
import { readableOn, uid } from '../engine/utils';
import { tl } from '../langStore';

/** 从产品信息推断包装结构 */
export function inferStructure(wf: ProjectWorkflow): StructureId {
  const text = `${wf.productInfo.packagingType} ${wf.productInfo.description} ${wf.productInfo.packagingType}`;
  if (/圆(形)?标签|圆贴|封口贴/.test(text)) return 'labelRound';
  if (/标签|瓶贴|不干胶|贴标/.test(text)) return 'labelRect';
  if (/自立袋|袋装|咖啡豆|铝箔袋/.test(text)) return 'pouch';
  if (/天地盖/.test(text)) return 'topBottom';
  if (/抽屉/.test(text)) return 'drawer';
  if (/飞机盒|快递盒/.test(text)) return 'mailer';
  return 'tuck';
}

/** 各结构的默认成品尺寸（mm），用户未明确给尺寸时兜底 */
const DEFAULT_SIZE: Record<StructureId, { l: number; w: number; h: number }> = {
  tuck: { l: 200, w: 150, h: 80 },
  topBottom: { l: 200, w: 150, h: 80 },
  drawer: { l: 180, w: 130, h: 70 },
  mailer: { l: 220, w: 160, h: 60 },
  pouch: { l: 140, w: 60, h: 220 },
  labelRect: { l: 90, w: 120, h: 0 },
  labelRound: { l: 80, w: 80, h: 0 },
};

/** 推断成品尺寸：优先解析用户填的尺寸，否则用结构默认值 */
function inferSize(wf: ProjectWorkflow, structure: StructureId) {
  const candidate = [wf.productInfo.expectedSize, wf.productInfo.description]
    .map((t) => (t ? parseSize(t) : null))
    .find(Boolean);
  return candidate || DEFAULT_SIZE[structure];
}

/** 结构 → 旧 brief 的包装形式枚举 */
const PACK_TYPE_OF: Record<StructureId, DesignBrief['packType']> = {
  tuck: 'box', topBottom: 'box', drawer: 'box', mailer: 'box',
  pouch: 'pouch', labelRect: 'label', labelRound: 'label',
};

/**
 * 从工作流构建与组装结果一致的 DesignBrief：
 * 让编辑器的刀模、3D、印前视图与实际结构/尺寸对得上，而不是停留在空 brief。
 */
export function buildBrief(wf: ProjectWorkflow): DesignBrief {
  const structure = inferStructure(wf);
  const size = inferSize(wf, structure);
  const info = wf.productInfo;
  const specMatch = info.description.match(/(\d+(?:\.\d+)?\s*(?:g|kg|ml|L|克|毫升|片|袋|盒))/i);
  const paletteColors = (wf.analysis?.palette || []).map((c) => c.hex).filter(Boolean).slice(0, 4);

  return {
    product: info.productName || info.productType || '',
    category: info.productType || '',
    packType: PACK_TYPE_OF[structure],
    brand: info.brandName || '',
    tagline: '',
    spec: specMatch ? specMatch[1] : '',
    description: info.description,
    style: '',
    colors: paletteColors,
    motif: '',
    audience: info.audience,
    scene: info.salesScene,
    material: '',
    structure,
    size,
    structureExtra: {},
    targetGroup: info.audience,
    extraText: [],
    raw: [info.description].filter(Boolean),
    referenceImage: wf.referenceImages[0]?.src || '',
    referenceName: wf.referenceImages[0]?.name || '',
  };
}

/** 从分析报告/配色构建 Palette，给真实兜底 */
function buildPalette(wf: ProjectWorkflow): Palette {
  const byRole = (role: string) => wf.analysis?.palette.find((c) => c.role === role)?.hex;
  const fallback = wf.concepts.find((c) => c.id === wf.selectedConceptId)?.colors || [];

  const bg = byRole('background') || fallback[0] || '#f3eee4';
  const primary = byRole('primary') || fallback[1] || '#20463a';
  const accent = byRole('accent') || fallback[2] || '#c8a86b';
  const ink = byRole('ink') || readableOn(bg);
  const muted = readableOn(bg) === '#ffffff' ? '#c9c4b8' : '#8d8d8a';
  return { bg, primary, accent, ink, muted };
}

/** 图片图层的叠放顺序：底纹类在下层，主体装饰在上层 */
const TYPE_ORDER: Record<string, number> = {
  background: 0,
  texture: 1,
  pattern: 2,
  illustration: 3,
  decoration: 4,
};

/** 满版底纹类（cover）vs 独立主体类（contain） */
const FULL_BLEED_TYPES = new Set(['background', 'texture', 'pattern']);

/** 从一个成功任务构建图片图层 */
function buildImageLayer(
  task: ProjectWorkflow['tasks'][number],
  faceW: number,
  faceH: number,
): ImageLayer | null {
  const v = task.variants[task.selectedVariant];
  if (!v) return null;
  const fullBleed = FULL_BLEED_TYPES.has(task.type);

  if (fullBleed) {
    return {
      id: uid('ly'), name: task.name, type: 'image',
      x: 0, y: 0, w: faceW, h: faceH,
      rotation: 0, opacity: 1, locked: false,
      src: v.src, naturalW: v.naturalW, naturalH: v.naturalH, fit: 'cover',
    };
  }
  // 独立主体：居中偏上，留出下方文字空间
  const w = faceW * 0.72;
  const h = faceH * 0.42;
  return {
    id: uid('ly'), name: task.name, type: 'image',
    x: (faceW - w) / 2, y: faceH * 0.16, w, h,
    rotation: 0, opacity: 1, locked: false,
    src: v.src, naturalW: v.naturalW, naturalH: v.naturalH, fit: 'contain',
  };
}

/** 正面的真实文字图层：品牌名 / 产品名 / 净含量 */
function buildFrontText(
  wf: ProjectWorkflow,
  palette: Palette,
  faceW: number,
  faceH: number,
): TextLayer[] {
  const info = wf.productInfo;
  const brand = info.brandName || 'LunaSol';
  const product = info.productName || info.productType || '精选好物';
  const specMatch = info.description.match(/(\d+(?:\.\d+)?\s*(?:g|kg|ml|L|克|毫升|片|袋|盒))/i);
  const spec = specMatch ? `净含量 ${specMatch[1]}` : '净含量：请按实际填写';
  const m = Math.min(8, Math.max(3, faceW * 0.05));

  return [
    makeText('品牌名称', brand, 'brand',
      { x: m, y: faceH * 0.62, w: faceW - m * 2, h: faceH * 0.12 },
      { color: palette.ink, align: 'center', fontSize: 26, fontWeight: 600, letterSpacing: 0.1 }),
    makeText('产品名称', product, 'product',
      { x: m, y: faceH * 0.74, w: faceW - m * 2, h: faceH * 0.1 },
      { color: palette.ink, align: 'center', fontSize: 15, fontWeight: 400, letterSpacing: 0.08 }),
    makeText('规格', spec, 'info',
      { x: m, y: faceH * 0.88, w: faceW - m * 2, h: faceH * 0.07 },
      { color: palette.muted, align: 'center', fontSize: 9, placeholder: !specMatch }),
  ];
}

/**
 * 执行自动组装，返回标准 DesignDoc。
 * 只纳入已成功的任务；未生成的任务跳过，不放假图层。
 */
export function assembleDesign(wf: ProjectWorkflow): DesignDoc {
  const structure = inferStructure(wf);
  const size = inferSize(wf, structure);
  const palette = buildPalette(wf);
  const sizes = faceSizes(structure, size);

  const faces: DesignDoc['faces'] = {};

  for (const [faceId, spec] of Object.entries(sizes)) {
    const fid = faceId as keyof typeof sizes;
    // 分配到当前面或通用面（all）的成功任务
    const faceTasks = wf.tasks
      .filter((t) => t.status === 'success' && (t.face === fid || t.face === 'all'))
      .sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9));

    const imageLayers: Layer[] = faceTasks
      .map((t) => buildImageLayer(t, spec.w, spec.h))
      .filter((l): l is ImageLayer => l !== null);

    // 只有正面加文字排版；其他面保持干净，留给用户自行补充
    const textLayers = fid === 'front' ? buildFrontText(wf, palette, spec.w, spec.h) : [];

    faces[fid] = {
      id: fid as never,
      w: spec.w,
      h: spec.h,
      bg: palette.bg,
      layers: [...imageLayers, ...textLayers],
    };
  }

  const usedCount = wf.tasks.filter((t) => t.status === 'success').length;
  const name = wf.productInfo.brandName || wf.productInfo.productName || tl('未命名包装项目', 'Untitled package');

  return {
    id: uid('design'),
    name: `${name} · AI 组装`,
    scheme: 'minimal',
    palette,
    faces,
    rationale:
      `由 AI 工作流自动组装：纳入 ${usedCount} 个已生成素材，按「${structure}」结构分配到各面；` +
      '品牌、产品名与净含量为独立可编辑文字图层，未用整张图片充当印刷稿，未编造条码/Logo/生产信息。',
    createdAt: Date.now(),
  };
}

/* ============================================================
 * 由「设计方案」选中的整包效果图组装工程
 * ------------------------------------------------------------
 * 与 assembleDesign 的区别：这里没有逐任务素材，只有一张 AI 生成的
 * 整包效果图。把它作为各面的底图（cover），正面叠加真实文字图层，
 * 让用户进编辑器后能直接改字、挪位、调色，而不是拿一张死图。
 * ============================================================ */

/** 从产品信息（主题色）构建调色板，给真实兜底 */
function paletteFromInfo(info: ProductInfo): Palette {
  const c = (Array.isArray(info.themeColors) ? info.themeColors : []).filter(Boolean);
  const bg = c[0] || info.brandMainColor || '#f3eee4';
  const primary = c[1] || '#20463a';
  const accent = c[2] || '#c8a86b';
  const ink = readableOn(bg);
  const muted = ink === '#ffffff' ? 'rgba(255,255,255,0.78)' : 'rgba(20,20,20,0.62)';
  return { bg, primary, accent, ink, muted };
}

/** 正面文字图层：品牌 / 产品名 / 一级卖点 / 净含量 */
function textFromInfo(info: ProductInfo, palette: Palette, faceW: number, faceH: number): TextLayer[] {
  const brand = info.brandName || info.logoName || 'LunaSol';
  const product = info.productName || '精选好物';
  const spec = info.netContent ? `净含量 ${info.netContent}` : '净含量：请按实际填写';
  const m = Math.min(8, Math.max(3, faceW * 0.05));

  const layers: TextLayer[] = [
    makeText('品牌名称', brand, 'brand',
      { x: m, y: faceH * 0.52, w: faceW - m * 2, h: faceH * 0.11 },
      { color: palette.ink, align: 'center', fontSize: 26, fontWeight: 600, letterSpacing: 0.1 }),
    makeText('产品名称', product, 'product',
      { x: m, y: faceH * 0.63, w: faceW - m * 2, h: faceH * 0.09 },
      { color: palette.ink, align: 'center', fontSize: 15, fontWeight: 400, letterSpacing: 0.08 }),
  ];
  if (info.sellingPointPrimary) {
    layers.push(makeText('一级卖点', info.sellingPointPrimary, 'tagline',
      { x: m, y: faceH * 0.72, w: faceW - m * 2, h: faceH * 0.07 },
      { color: palette.muted, align: 'center', fontSize: 10, fontWeight: 400, letterSpacing: 0.06 }));
  }
  layers.push(makeText('规格', spec, 'info',
    { x: m, y: faceH * 0.86, w: faceW - m * 2, h: faceH * 0.06 },
    { color: palette.muted, align: 'center', fontSize: 9, placeholder: !info.netContent }));
  return layers;
}

/** 把选中的整包效果图组装成可编辑工程 */
export function assembleFromConceptImage(wf: ProjectWorkflow, image: ConceptImage): DesignDoc {
  const structure = inferStructure(wf);
  const size = inferSize(wf, structure);
  const sizes = faceSizes(structure, size);
  const info = wf.productInfo;
  const palette = paletteFromInfo(info);

  const faces: DesignDoc['faces'] = {};
  for (const [faceId, spec] of Object.entries(sizes)) {
    const fid = faceId as keyof typeof sizes;
    const base: ImageLayer = {
      id: uid('ly'), name: `AI 方案 ${image.label}`, type: 'image',
      x: 0, y: 0, w: spec.w, h: spec.h,
      rotation: 0, opacity: 1, locked: false,
      src: image.src, naturalW: image.naturalW, naturalH: image.naturalH, fit: 'cover',
    };
    const textLayers = fid === 'front' ? textFromInfo(info, palette, spec.w, spec.h) : [];
    faces[fid] = {
      id: fid as never,
      w: spec.w,
      h: spec.h,
      bg: palette.bg,
      layers: [base, ...(textLayers as Layer[])],
    };
  }

  const name = info.brandName || info.productName || tl('未命名包装项目', 'Untitled package');
  return {
    id: uid('design'),
    name: `${name} · 方案 ${image.label}`,
    scheme: 'minimal',
    palette,
    faces,
    rationale:
      `采用方案 ${image.label} 的整包效果图作为各面底图，按「${structure}」结构铺开；` +
      '品牌、产品名、卖点与净含量为独立可编辑文字图层。效果图为 AI 概念渲染，' +
      '正式印刷前请在编辑器逐面调整，并核对文字、条码与出血。',
    createdAt: Date.now(),
  };
}

/* ============================================================
 * 真实背景色采样与文字可读性修正
 * assembleDesign 是同步纯函数，无法在组装时加载图片；这里提供
 * 异步修正：采样最底层满版图片的平均色，让文字颜色与真实背景
 * 匹配，避免报告配色与实际生图不一致时文字看不清。
 * ============================================================ */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** 加载图片并按 cover 语义采样平均色，返回 hex */
export async function sampleImageAvgColor(src: string): Promise<string> {
  const img = await loadImage(src);
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d 不可用');
  // cover：按短边填满并居中裁剪，与满版背景图层的 fit 一致
  const scale = Math.max(S / img.width, S / img.height);
  const sw = S / scale;
  const sh = S / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, S, S);
  const data = ctx.getImageData(0, 0, S, S).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  }
  return toHex(Math.round(r / n), Math.round(g / n), Math.round(b / n));
}

/**
 * 组装后根据真实满版背景图修正各面文字颜色，保证可读。
 * 原地更新 doc 中的文字图层；采样失败时回退到面背景色推断。
 */
export async function refineTextColors(doc: DesignDoc): Promise<void> {
  for (const face of Object.values(doc.faces)) {
    const textLayers = face.layers.filter((l): l is TextLayer => l.type === 'text');
    if (!textLayers.length) continue;
    const bgImage = face.layers.find((l): l is ImageLayer => l.type === 'image');

    let ink: string;
    try {
      const avg = bgImage?.src
        ? await sampleImageAvgColor(bgImage.src)
        : face.bg;
      ink = readableOn(avg);
    } catch {
      ink = readableOn(face.bg);
    }

    textLayers.forEach((l) => {
      // 辅助信息（净含量）用同色系稍弱的颜色，保持层级
      l.color = l.role === 'info'
        ? (ink === '#ffffff' ? 'rgba(255,255,255,0.78)' : 'rgba(20,20,20,0.62)')
        : ink;
    });
  }
}
