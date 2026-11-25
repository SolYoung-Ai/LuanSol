/* ============================================================
   Studio 2.0 阶段四 — 当前设计上下文
   ------------------------------------------------------------
   DeepSeek 每次规划前拿到一份「真实、可核对」的快照：
   项目、结构、成品尺寸、当前面、真实元素 ID、毫米/百分比双坐标、
   锁定与可见状态、当前选中对象。模型不允许猜 ID。
   Base64 图片不进上下文，只给图层引用，避免把 token 浪费在图片上。
   ============================================================ */
import { faceEls, type DesignEl, type StudioDesign, type StudioProject } from '../types';
import { dimsOf, elLocalRect, facesOf } from '../frames';
import { formDef } from '../types';

export interface AIContextElement {
  id: string;
  name: string;
  kind: DesignEl['kind'];
  type: string;
  text?: string;
  srcKind?: 'none' | 'data' | 'https';
  assetId?: string;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number | null;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  color?: string;
  sizePct?: number;
  sizeMm?: number;
  weight?: number;
  rotation: number;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  layerType?: string;
}

export interface AIContext {
  projectId: string;
  projectName: string;
  form: string;
  formId: string;
  structure: string;
  dimsMm: { l: number; w: number; h: number } | null;
  currentFace: string;
  currentFaceLabel: string;
  currentPanelMm: { w: number; h: number } | null;
  faceBackground: string;
  palette: { bg: string; ink: string; accent: string };
  elements: AIContextElement[];
  otherFaces: { id: string; label: string; count: number }[];
  selected: AIContextElement[];
  imageSources: { layerId: string; name: string; srcKind: 'data' | 'https' }[];
}

const round = (n: number) => Math.round(n * 100) / 100;

function kindLabel(el: DesignEl): string {
  if (el.kind === 'text') return '文字';
  if (el.kind === 'sticker') return '图片 / 插图';
  if (el.shape === 'ellipse') return '椭圆';
  if (el.shape === 'line') return '直线';
  return '形状 / 矩形';
}

export function describeEl(el: DesignEl): { name: string; type: string } {
  const name = el.name?.trim()
    || (el.kind === 'text' ? `文字「${(el.text || '').slice(0, 16)}」` : kindLabel(el));
  return { name, type: kindLabel(el) };
}

export function buildAIContext(
  project: StudioProject,
  design: StudioDesign,
  face: string,
  selectedIds: string[],
): AIContext {
  const panels = facesOf(project);
  const panel = panels.find((p) => p.id === face) || panels[0] || null;
  const els = faceEls(design, panel?.id || face);
  const mmW = panel?.w || 100;
  const mmH = panel?.h || 100;

  const toCtx = (el: DesignEl): AIContextElement => {
    const r = elLocalRect(el, { w: mmW, h: mmH });
    return {
      id: el.id,
      name: describeEl(el).name,
      kind: el.kind,
      type: describeEl(el).type,
      ...(el.kind === 'text' ? { text: el.text || '' } : {}),
      ...(el.kind === 'sticker'
        ? { srcKind: el.src ? (el.src.startsWith('data:') ? 'data' as const : 'https' as const) : 'none' as const }
        : {}),
      ...(el.assetId ? { assetId: el.assetId } : {}),
      xPct: round(el.x),
      yPct: round(el.y),
      wPct: round(el.w),
      hPct: el.h === undefined ? null : round(el.h),
      xMm: round(r.x),
      yMm: round(r.y),
      wMm: round(r.w),
      hMm: round(r.h),
      ...(el.color ? { color: el.color } : {}),
      ...(el.size !== undefined ? { sizePct: round(el.size), sizeMm: round((el.size / 100) * mmW) } : {}),
      ...(el.weight !== undefined ? { weight: el.weight } : {}),
      rotation: el.rotation ?? 0,
      zIndex: el.zIndex ?? 0,
      locked: el.locked === true,
      visible: el.visible !== false,
      ...(el.layerType ? { layerType: el.layerType } : {}),
    };
  };

  const elements = els.map(toCtx);
  const selected = elements.filter((e) => selectedIds.includes(e.id));
  const imageSources = els
    .filter((e) => e.kind === 'sticker' && e.src)
    .map((e) => ({
      layerId: e.id,
      name: describeEl(e).name,
      srcKind: (e.src!.startsWith('data:') ? 'data' : 'https') as 'data' | 'https',
    }));

  return {
    projectId: project.id,
    projectName: project.name,
    form: formDef(project.answers.form.v)?.zh || '未定',
    formId: project.answers.form.v || '',
    structure: panel ? '已生成刀模' : '无刀模',
    dimsMm: dimsOf(project),
    currentFace: panel?.id || face,
    currentFaceLabel: panel?.labelZh || face,
    currentPanelMm: panel ? { w: panel.w, h: panel.h } : null,
    faceBackground: design.bg,
    palette: { bg: design.bg, ink: design.ink, accent: design.accent },
    elements,
    otherFaces: panels
      .filter((p) => p.id !== (panel?.id || face))
      .map((p) => ({ id: p.id, label: p.labelZh, count: faceEls(design, p.id).length })),
    selected,
    imageSources,
  };
}

/** 注入 system prompt 的紧凑 JSON。字段名就是模型要引用的字段。 */
export function contextJson(ctx: AIContext): string {
  return JSON.stringify(ctx, null, 2);
}

/** 供对话界面展示的一句摘要，不是模型上下文。 */
export function contextBrief(ctx: AIContext): string {
  const sel = ctx.selected.length
    ? ctx.selected.map((e) => `${e.name}（${e.id}）`).join('、')
    : '无';
  return `${ctx.currentFaceLabel} · ${ctx.currentPanelMm?.w || 0}×${ctx.currentPanelMm?.h || 0}mm · ${ctx.elements.length} 个对象 · 选中：${sel}`;
}

/** 稳定指纹：确认计划时检测画布是否被用户改过。 */
export function designDigest(design: StudioDesign): string {
  const src = JSON.stringify({
    bg: design.bg,
    ink: design.ink,
    accent: design.accent,
    faces: design.faces,
    els: design.els,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + '-' + src.length.toString(36);
}
