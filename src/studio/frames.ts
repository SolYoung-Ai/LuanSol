/* ============================================================
   Studio 3.0 — 包装工作台与印刷引擎之间的桥
   ------------------------------------------------------------
   工作台自己的画布是一个「面」（正面 / 背面 / 侧面 …），坐标是百分比；
   印刷引擎要的是毫米坐标的 DesignDoc 与真实刀模几何。
   这一层只做换算与映射，不放界面逻辑，所以可以直接单测：

     form → 真实 StructureId → buildDieline → 面清单 / 面尺寸
     面的元素（百分比）→ Layer（mm）→ DesignDoc（3D 贴图 / 导出用）
   ------------------------------------------------------------
   一个重要取舍：包装形式里只有手提袋没有对应刀模结构。宁可在界面里
   明说「这个形式暂无刀板」，也不拿纸盒的刀模冒充手提袋。
   ============================================================ */
import { buildDieline } from '../engine/structure';
import type {
  DesignBrief, DesignDoc, Dieline, Face, FaceId, Layer, Palette, StructureId,
} from '../types';
import { wrapText } from '../engine/utils';
import {
  formDef, type DesignEl, type FormId, type SizeMM, type StudioProject,
} from './types';

/* ============================ 形式 → 结构 ============================ */

/** 包装形式到刀模结构的映射。null = 结构库还没有这个形式的刀模。 */
export const FORM_STRUCTURE: Record<FormId, StructureId | null> = {
  box: 'tuck',
  gift: 'topBottom',
  pouch: 'pouch',
  bag3d: 'pouch',
  can: 'labelRect',
  bottle: 'labelRect',
  tube: 'labelRect',
  sachet: 'labelRect',
  bag: 'pouch',
  outer: 'tuck',
  tote: null,
};

/** 这些形式在 3D 里也没有可用的盒型几何 */
export const structureFor = (form: FormId | ''): StructureId | null =>
  form ? (FORM_STRUCTURE[form] ?? null) : null;

export const hasDieline = (form: FormId | ''): boolean => !!structureFor(form);

/* ============================ 面 ============================ */

export type FacePanel = { id: FaceId; w: number; h: number; labelZh: string; labelEn: string };

export const FACE_LABEL: Record<FaceId, { zh: string; en: string }> = {
  front: { zh: '正面', en: 'Front' },
  back: { zh: '背面', en: 'Back' },
  left: { zh: '左侧', en: 'Left' },
  right: { zh: '右侧', en: 'Right' },
  top: { zh: '顶面', en: 'Top' },
};

const FACE_ORDER: FaceId[] = ['front', 'back', 'left', 'right', 'top'];

/** 项目当前实际能印刷的面：直接读刀模里的可印刷面板，不另写一份尺寸表。
 *  （天地盖的盖盒、抽屉盒的内外盒都会落到同一组面上，所以去重。） */
export function facesOf(p: Pick<StudioProject, 'answers'>): FacePanel[] {
  const d = dielineOf(p);
  if (!d) return [];
  const seen = new Map<FaceId, FacePanel>();
  for (const sheet of d.sheets) {
    for (const r of sheet.rects) {
      const id = r.face;
      if (!id || !r.artwork || seen.has(id)) continue;
      seen.set(id, { id, w: r.w, h: r.h, labelZh: FACE_LABEL[id].zh, labelEn: FACE_LABEL[id].en });
    }
  }
  return FACE_ORDER.filter((id) => seen.has(id)).map((id) => seen.get(id)!);
}

export function faceById(p: Pick<StudioProject, 'answers'>, id: string): FacePanel | null {
  return facesOf(p).find((f) => f.id === id) || null;
}

/** 面比例：画布按这个比例铺，编辑器里看到的形状就是成品面的形状 */
export function faceRatio(p: Pick<StudioProject, 'answers'>, id: string): [number, number] {
  const f = faceById(p, id);
  return f ? [f.w, f.h] : [3, 4];
}

/* ============================ 刀模 ============================ */

export const STUDIO_BLEED = 3;
export const STUDIO_SAFE = 5;

/** 项目尺寸：未确认时用形式的常见尺寸兜底（只用于预览，不用于生产）。
 *  导出前必须 sizeOk + confirmed，这一点由界面拦，不在这一层假装。 */
export function dimsOf(p: Pick<StudioProject, 'answers'>): SizeMM | null {
  if (p.answers.size) return p.answers.size.dims;
  return formDef(p.answers.form.v)?.size || null;
}

export function dielineOf(p: Pick<StudioProject, 'answers'>, bleed = STUDIO_BLEED, safe = STUDIO_SAFE): Dieline | null {
  const structure = structureFor(p.answers.form.v);
  const dims = dimsOf(p);
  if (!structure || !dims) return null;
  return buildDieline(structure, dims, bleed, safe, p.answers.structureExtra);
}

/** Studio 项目 → 印刷引擎的 DesignBrief（只保留真正需要、且 Studio 里已有的字段）。
 *  印前检查用它判断「成品尺寸是否等于用户确认的尺寸」。 */
export function briefForStudio(p: Pick<StudioProject, 'answers'>, structure: StructureId): DesignBrief {
  const dims = dimsOf(p) || { l: 0, w: 0, h: 0 };
  const a = p.answers;
  return {
    product: a.productName.v || '',
    category: a.category.v || '',
    packType: a.form.v || '',
    brand: '',
    tagline: '',
    spec: '',
    description: a.productContent.v || '',
    style: '',
    colors: a.colors.v || [],
    motif: '',
    audience: '',
    scene: '',
    material: '',
    structure,
    size: { l: dims.l, w: dims.w, h: dims.h },
    structureExtra: a.structureExtra,
    targetGroup: '',
    extraText: a.extra.v ? [a.extra.v] : [],
    raw: [],
  };
}

/** 刀模尺度摘要：给界面显示「展开多大、几张纸」 */
export function dielineSummary(d: Dieline | null) {
  if (!d) return null;
  const area = d.sheets.reduce((a, s) => a + (s.width * s.height) / 100, 0);
  return {
    sheets: d.sheets.length,
    width: Math.max(...d.sheets.map((s) => s.width)),
    height: Math.max(...d.sheets.map((s) => s.height)),
    cut: d.sheets.flatMap((s) => s.segments).filter((s) => s.kind === 'cut').length,
    crease: d.sheets.flatMap((s) => s.segments).filter((s) => s.kind === 'crease').length,
    areaCm2: Math.round(area),
    warnings: d.warnings,
  };
}

/* ============================ 坐标规范 ============================
   三套坐标各管一段，不许混用：

     百分比（DesignEl.x/y/w/h）  只属于「某个面」的局部坐标，0–100
     毫米（Layer.x/y/w/h）       某个面的成品毫米坐标（面左上角为原点）
     刀模全局毫米（Sheet）       展开图坐标 = 面局部毫米 + 面板在展开图里的偏移

   转换一律走本文件的函数，组件里不许自己乘除：
     pctToMm / mmToPct          百分比 ⇄ 面局部毫米（必须给真实面板宽高）
     elLocalRect                元素 → 面局部毫米
     localToSheet               面局部毫米 → 刀模全局毫米（必须带偏移）
     elSheetRect                元素 → 刀模全局毫米（一步到位）
   屏幕像素只用于画布显示，永远不写进项目数据。                          */

export type FaceBox = { w: number; h: number };
export type MmRect = { x: number; y: number; w: number; h: number };

/** 面板宽高必须有限且为正，否则任何换算都没有意义 */
export const validBox = (b: FaceBox | null | undefined): FaceBox | null =>
  (b && Number.isFinite(b.w) && Number.isFinite(b.h) && b.w > 0 && b.h > 0 ? b : null);

/** 百分比 → 面局部毫米。非法输入返回 0（不抛错，不返回 NaN 污染下游） */
export function pctToMm(pct: number, totalMm: number): number {
  if (!Number.isFinite(pct) || !Number.isFinite(totalMm) || totalMm <= 0) return 0;
  return (pct / 100) * totalMm;
}

/** 面局部毫米 → 百分比（反向换算，供导入旧版 layout 时使用） */
export function mmToPct(mm: number, totalMm: number): number {
  if (!Number.isFinite(mm) || !Number.isFinite(totalMm) || totalMm <= 0) return 0;
  return (mm / totalMm) * 100;
}

export interface ElMetrics { sizeMm: number; lines: string[]; h: number; lineHeightMm: number }

/** 文字的毫米度量：字号是「宽度的百分比」，行高默认 1.4 倍字号。
 *  字间距与行高都读元素上的值，与导出的 textMarkup 完全同一套算法。
 *  elToLayer / elSheetRect / 画布 SVG 都从这里取，避免三处各排一次版。 */
export function elTextMetrics(el: DesignEl, face: FaceBox): ElMetrics {
  const box = validBox(face);
  if (!box) return { sizeMm: 0, lines: [''], h: 0, lineHeightMm: 0 };
  const sizeMm = clampNum(el.size ?? 3, 0.5, 40, 3) / 100 * box.w;
  const wMm = clampNum(el.w, 1, 100, 40) / 100 * box.w;
  const tracking = clampNum(el.letterSpacing ?? 0, -0.2, 1, 0);
  const lineHeight = clampNum(el.lineHeight ?? 1.4, 0.8, 3, 1.4);
  const text = String(el.text || '').slice(0, 200);
  const lines = wrapText(text, Math.max(1, wMm), Math.max(0.1, sizeMm), tracking);
  return {
    sizeMm, lines,
    lineHeightMm: sizeMm * lineHeight,
    h: Math.max(0.3, lines.length * sizeMm * lineHeight),
  };
}

/** 元素 → 面局部毫米矩形（不含旋转；旋转只影响绘制，不改包围盒原点） */
export function elLocalRect(el: DesignEl, face: FaceBox): MmRect {
  const box = validBox(face);
  if (!box) return { x: 0, y: 0, w: 0, h: 0 };
  const x = pctToMm(clampNum(el.x, -50, 150, 0), box.w);
  const y = pctToMm(clampNum(el.y, -50, 150, 0), box.h);
  const w = pctToMm(clampNum(el.w, 1, 100, 40), box.w);
  if (el.kind === 'rect') {
    const h = pctToMm(clampNum(el.h ?? 0.5, 0.05, 100, 0.5), box.h);
    return { x, y, w, h: Math.max(0.3, h) };
  }
  if (el.kind === 'sticker') {
    const h = el.h ? pctToMm(clampNum(el.h, 1, 100, 40), box.h) : w;
    return { x, y, w, h: Math.max(1, h) };
  }
  /* 文字：给了文本框高度就用它（用于溢出判定），没给则按行数自适应 */
  if (el.kind === 'text' && el.h) {
    return { x, y, w, h: Math.max(0.3, pctToMm(clampNum(el.h, 0.3, 100, 10), box.h)) };
  }
  return { x, y, w, h: elTextMetrics(el, box).h };
}

/** 面局部毫米 → 刀模全局毫米。偏移必须来自真实刀模面板，
 *  不同面板里的同一个局部坐标，在展开图上是两个不同位置。 */
export const localToSheet = (r: MmRect, origin: { x: number; y: number }): MmRect => ({
  x: r.x + (Number.isFinite(origin.x) ? origin.x : 0),
  y: r.y + (Number.isFinite(origin.y) ? origin.y : 0),
  w: r.w,
  h: r.h,
});

/** 某个面在展开图里的面板位置（可能有多块，取第一块作为原点基准；
 *  同一面重复出现（天地盖内外盒）时，各块按自己的偏移各自贴图）。 */
export function faceOrigins(d: Dieline | null | undefined, faceId: string): { x: number; y: number }[] {
  if (!d) return [];
  return d.sheets.flatMap((s) => s.rects.filter((r) => r.face === faceId && r.artwork).map((r) => ({ x: r.x, y: r.y })));
}

/** 元素 → 刀模全局毫米（用于刀板视图断言与导出核对） */
export function elSheetRect(el: DesignEl, face: FaceBox, origin: { x: number; y: number }): MmRect {
  return localToSheet(elLocalRect(el, face), origin);
}

/* ============================ 元素 → 图层 ============================ */

export const PT_PER_MM = 2.834_646;

const clampNum = (n: number, min: number, max: number, fallback: number) =>
  (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback);

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 元素（百分比，相对某个面）→ 印刷引擎的 mm 图层。
 *  纯函数、无 DOM：3D 贴图、刀板预览、PDF 导出用的是同一份结果，所以三处永远一致。
 *  2.0：rotation / locked / visible 三个属性在这里落地（不填即旧行为）。 */
export function elToLayer(
  el: DesignEl,
  face: { w: number; h: number },
  palette: Palette,
  prefix: string,
): Layer | null {
  if (el.visible === false) return null;
  const box = validBox(face);
  if (!box) return null;
  const r = elLocalRect(el, box);
  const opacity = clampNum(el.opacity ?? 1, 0.05, 1, 1);
  const rotation = round1(clampNum(el.rotation ?? 0, -180, 180, 0));
  const locked = el.locked === true;
  const process = el.process || 'print';
  const id = `${prefix}_${el.id}`;

  if (el.kind === 'text') {
    const text = String(el.text || '').slice(0, 200);
    const m = elTextMetrics(el, box);
    const sizeMm = m.sizeMm;
    const fontSize = round1(Math.max(3, sizeMm * PT_PER_MM));
    return {
      id, name: el.name || text.slice(0, 18) || '文字', type: 'text',
      x: round1(r.x), y: round1(r.y), w: round1(r.w), h: round1(m.h),
      rotation, opacity, locked,
      text, role: 'custom',
      process,
      fontFamily: el.fontFamily || '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif',
      fontSize, fontWeight: Math.round(clampNum(el.weight ?? 400, 300, 800, 400) / 50) * 50,
      color: el.color || palette.ink,
      align: el.align || 'left',
      letterSpacing: clampNum(el.letterSpacing ?? 0, -0.2, 1, 0),
      lineHeight: clampNum(el.lineHeight ?? 1.4, 0.8, 3, 1.4),
    };
  }

  if (el.kind === 'rect') {
    const shape = el.shape === 'ellipse' ? 'circle' : el.shape === 'line' ? 'line' : 'rect';
    return {
      id, name: el.name || (shape === 'circle' ? '圆形' : shape === 'line' ? '直线' : '色块'),
      type: 'shape', shape,
      x: round1(r.x), y: round1(r.y), w: round1(r.w), h: round1(Math.max(0.3, r.h)),
      rotation, opacity, locked,
      fill: el.color || (shape === 'line' ? 'none' : palette.accent),
      stroke: el.stroke || (shape === 'line' ? (el.color || palette.ink) : 'none'),
      strokeWidth: clampNum(el.strokeWidth ?? (shape === 'line' ? 0.4 : 0), 0, 20, 0),
      seed: 0,
      rx: shape === 'rect' ? clampNum(el.radius ?? 0, 0, 60, 0) : 0,
      process,
    };
  }

  /* 贴纸：没有图时不参与绘制，但必须留在 DesignDoc 里，印前才能报「图片缺失」。
   *  导出层遇到 src 为空会跳过，不会生成空图框。 */
  return {
    id, name: el.name || (el.src ? '插图' : '待补图片'), type: 'image',
    x: round1(r.x), y: round1(r.y), w: round1(r.w), h: round1(Math.max(1, r.h)),
    rotation, opacity, locked,
    src: el.src || '',
    naturalW: Math.round(clampNum(el.naturalW ?? 0, 0, 20000, 0)),
    naturalH: Math.round(clampNum(el.naturalH ?? 0, 0, 20000, 0)),
    fit: el.fit === 'cover' ? 'cover' : 'contain',
    process,
  };
}

/** 印刷引擎图层 → 工作台元素（反向换算，用于旧版 DesignDoc 导入 Studio）。
 *  id 去掉 `face_` 前缀；围绕盒、旋转、透明度、锁定、隐藏、图片来源全部带回。
 *  文字高度由排版引擎算，不写回 h（否则会与文字实际行数打架）。 */
export function layerToEl(layer: Layer, face: FaceBox, prefix?: string): DesignEl | null {
  const box = validBox(face);
  if (!box || !layer || typeof layer.id !== 'string') return null;
  const id = prefix && layer.id.startsWith(`${prefix}_`) ? layer.id.slice(prefix.length + 1) : layer.id;
  const base: DesignEl = {
    id,
    kind: 'rect',
    x: round1(mmToPct(layer.x, box.w)),
    y: round1(mmToPct(layer.y, box.h)),
    w: round1(mmToPct(layer.w, box.w)),
    rotation: layer.rotation || undefined,
    opacity: layer.opacity,
    locked: layer.locked || undefined,
    visible: layer.hidden ? false : true,
    name: layer.name,
    source: 'system',
    process: layer.process && layer.process !== 'print' ? layer.process : undefined,
  };
  if (layer.type === 'text') {
    return {
      ...base, kind: 'text', text: layer.text,
      size: round1(mmToPct(layer.fontSize / PT_PER_MM, box.w)),
      weight: layer.fontWeight, color: layer.color, align: layer.align,
      fontFamily: layer.fontFamily,
      letterSpacing: layer.letterSpacing, lineHeight: layer.lineHeight,
    };
  }
  if (layer.type === 'shape') {
    return { ...base, kind: 'rect', color: layer.fill, h: round1(mmToPct(layer.h, box.h)) };
  }
  return {
    ...base, kind: 'sticker', src: layer.src, h: round1(mmToPct(layer.h, box.h)),
    naturalW: layer.naturalW, naturalH: layer.naturalH, fit: layer.fit,
  };
}

export const paletteOf = (d: { bg: string; ink: string; accent: string }): Palette => ({
  bg: d.bg, primary: d.accent, accent: d.accent, ink: d.ink, muted: '#8a8a84',
});

/** 叠放次序：zIndex 越小越靠后。**没写 zIndex 时直接用数组顺序**（旧行为），
 *  所以旧项目渲染结果一模一样；只有显式写了 zIndex 的新数据才重新排序。 */
export function drawOrder(els: DesignEl[]): DesignEl[] {
  if (!els.some((e) => Number.isFinite(e.zIndex))) return els;
  return els
    .map((e, i) => ({ e, i, z: Number.isFinite(e.zIndex) ? Number(e.zIndex) : i }))
    .sort((a, b) => (a.z - b.z) || (a.i - b.i))
    .map((x) => x.e);
}

/** 元素清单（某个面）→ Face。没有元素也返回面，3D 与刀板才不会是空白。 */
export function faceDoc(
  id: FaceId,
  panel: { w: number; h: number },
  els: DesignEl[],
  palette: Palette,
  faceBg?: string,
): Face {
  const layers: Layer[] = [];
  for (const el of drawOrder(els)) {
    const l = elToLayer(el, panel, palette, id);
    if (l) layers.push(l);
  }
  return { id, w: round1(panel.w), h: round1(panel.h), bg: faceBg || palette.bg, layers };
}

/** 整份设计稿：Studio 的按面元素 → 印刷引擎的 DesignDoc。
 *  3D、刀板展开、SVG/PDF/DXF 导出全部读这一个对象。 */
export function designDocFor(
  project: StudioProject,
  faces: Partial<Record<string, DesignEl[]>>,
  now = Date.now(),
): DesignDoc | null {
  const panels = facesOf(project);
  if (!panels.length) return null;
  const design = project.design;
  const palette = paletteOf(design || { bg: '#FBF9F5', ink: '#191919', accent: '#F47735' });
  const docFaces: Partial<Record<FaceId, Face>> = {};
  for (const panel of panels) {
    const ownBg = design?.faceBg?.[panel.id];
    docFaces[panel.id] = faceDoc(panel.id, panel, faces[panel.id] || [], palette, ownBg);
  }
  return {
    id: project.id,
    name: project.name,
    scheme: 'minimal',
    palette,
    faces: docFaces,
    rationale: 'Studio 工作台版面：按面编辑，全部读取自用户填写的需求。',
    createdAt: now,
  };
}

/** 某个面在刀模上的位置（用于刀板视图里高亮当前面） */
export function panelsOfFace(d: Dieline, id: string) {
  return d.sheets.flatMap((s, sheetIndex) => s.rects
    .filter((r) => r.face === id && r.artwork)
    .map((r) => ({ sheetIndex, rect: r })));
}
