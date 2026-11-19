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
  DesignDoc, Dieline, Face, FaceId, Layer, Palette, StructureId,
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
  return buildDieline(structure, dims, bleed, safe);
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

/* ============================ 元素 → 图层 ============================ */

export const PT_PER_MM = 2.834_646;

const clampNum = (n: number, min: number, max: number, fallback: number) =>
  (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback);

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 元素（百分比，相对某个面）→ 印刷引擎的 mm 图层。
 *  纯函数、无 DOM：3D 贴图、刀板预览、PDF 导出用的是同一份结果，所以三处永远一致。 */
export function elToLayer(
  el: DesignEl,
  face: { w: number; h: number },
  palette: Palette,
  prefix: string,
): Layer | null {
  const x = clampNum(el.x, -50, 150, 0) / 100 * face.w;
  const y = clampNum(el.y, -50, 150, 0) / 100 * face.h;
  const w = clampNum(el.w, 1, 100, 40) / 100 * face.w;
  const opacity = clampNum(el.opacity ?? 1, 0.05, 1, 1);
  const id = `${prefix}_${el.id}`;

  if (el.kind === 'text') {
    const text = String(el.text || '').slice(0, 200);
    const sizeMm = clampNum(el.size ?? 3, 0.5, 40, 3) / 100 * face.w;
    const fontSize = round1(Math.max(3, sizeMm * PT_PER_MM));
    const lines = Math.max(1, wrapText(text, Math.max(1, w), sizeMm).length);
    return {
      id, name: text.slice(0, 18) || '文字', type: 'text',
      x: round1(x), y: round1(y), w: round1(w),
      h: round1(lines * sizeMm * 1.4),
      rotation: 0, opacity, locked: false,
      text, role: 'custom',
      fontFamily: '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif',
      fontSize, fontWeight: Math.round(clampNum(el.weight ?? 400, 300, 800, 400) / 50) * 50,
      color: el.color || palette.ink,
      align: el.align || 'left',
      letterSpacing: 0, lineHeight: 1.4,
    };
  }

  if (el.kind === 'rect') {
    const hPct = clampNum(el.h ?? 0.5, 0.05, 100, 0.5) / 100 * face.h;
    return {
      id, name: '色块', type: 'shape', shape: 'rect',
      x: round1(x), y: round1(y), w: round1(w), h: round1(Math.max(0.3, hPct)),
      rotation: 0, opacity, locked: false,
      fill: el.color || palette.accent, stroke: 'none', strokeWidth: 0, seed: 0, rx: 0,
    };
  }

  /* 贴纸：没生成图的占位框不参与印刷，直接跳过，避免导出里出现空框 */
  if (!el.src) return null;
  const h = el.h ? clampNum(el.h, 1, 100, 40) / 100 * face.h : w;
  return {
    id, name: '插图', type: 'image',
    x: round1(x), y: round1(y), w: round1(w), h: round1(Math.max(1, h)),
    rotation: 0, opacity, locked: false,
    src: el.src, naturalW: 1000, naturalH: 1000, fit: 'contain',
  };
}

export const paletteOf = (d: { bg: string; ink: string; accent: string }): Palette => ({
  bg: d.bg, primary: d.accent, accent: d.accent, ink: d.ink, muted: '#8a8a84',
});

/** 元素清单（某个面）→ Face。没有元素也返回面，3D 与刀板才不会是空白。 */
export function faceDoc(
  id: FaceId,
  panel: { w: number; h: number },
  els: DesignEl[],
  palette: Palette,
): Face {
  const layers: Layer[] = [];
  for (const el of els) {
    const l = elToLayer(el, panel, palette, id);
    if (l) layers.push(l);
  }
  return { id, w: round1(panel.w), h: round1(panel.h), bg: palette.bg, layers };
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
    docFaces[panel.id] = faceDoc(panel.id, panel, faces[panel.id] || [], palette);
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
