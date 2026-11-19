/* ============================================================
   Studio 2.0 — 从需求推出第一版版面（纯函数，可单测）
   ------------------------------------------------------------
   这里只做两件事：
     1. 把九页需求翻译成一块画布上的若干元素（文字 / 色块 / 贴纸位）；
     2. 提供元素的增删改与层级操作，全部返回新对象，不改入参。
   不做的事：不编造卖点、功效、规格。用户没写的字段就不放元素，
   画布上留白，而不是拿一句假文案填满。
   ============================================================ */
import {
  CATEGORIES, COLORS, PATTERNS, STYLES, faceEls, formDef, sizeText, withFaceEls,
  type DesignEl, type FormId, type StudioAnswers, type StudioDesign, type StudioProject,
} from './types';
import { facesOf } from './frames';

const HEX = /^#[0-9a-f]{6}$/i;
const isHex = (s: string) => HEX.test(s);

/** 相对亮度：用来判断这个颜色更像底色还是更像字色 */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** 常见包装形式的「正面」比例。印刷稿是展开图，编辑器先做正面这一面。 */
const RATIO_BY_FORM: Partial<Record<FormId, [number, number]>> = {
  box: [3, 4],
  gift: [4, 3],
  pouch: [3, 4.6],
  bag3d: [3, 4.4],
  can: [3, 4],
  bottle: [3, 4.6],
  tube: [1, 2.4],
  sachet: [1, 1],
  bag: [3, 4.6],
  tote: [4, 4.6],
  outer: [3, 4],
};

export function ratioFor(form: FormId | ''): [number, number] {
  return (form && RATIO_BY_FORM[form]) || [3, 4];
}

/** 从用户选的色里挑底色 / 字色 / 点缀色。
 *  没选色时退回站内的中性纸白 + 墨黑 + 品牌橙，不假装配色。 */
export function pickPalette(a: StudioAnswers): { bg: string; ink: string; accent: string } {
  const picked = [...a.colors.v, ...a.customColors.v].filter(isHex);
  const fallback = { bg: '#FBF9F5', ink: '#191919', accent: '#F47735' };
  if (!picked.length) return fallback;

  const sorted = [...picked].sort((x, y) => luminance(y) - luminance(x));
  const lightest = sorted[0];
  const darkest = sorted[sorted.length - 1];
  const bg = luminance(lightest) > 0.72 ? lightest : '#FBF9F5';
  const ink = luminance(darkest) < 0.42 ? darkest : '#191919';
  // 点缀色：既不是底色也不是字色的第一个色；只剩两色时用字色压深一档
  const accent = picked.find((c) => c !== bg && c !== ink) || (ink === '#191919' ? '#F47735' : ink);
  return { bg, ink, accent };
}

const colorName = (hex: string) => COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.zh || hex;

/** 拿去生图的提示词：只写用户给过的信息，不补产品事实。
 *  尾巴里的负向约束来自生图链路的实测经验——画面上出现商标造型会被审核拦。 */
export function stickerPrompt(p: StudioProject): string {
  const a = p.answers;
  const cat = CATEGORIES.find((c) => c.id === a.category.v)?.zh || '通用';
  const style = STYLES.find((s) => s.id === a.stylePrimary.v)?.zh || '极简现代';
  const pats = a.patterns.v.map((x) => PATTERNS.find((y) => y.id === x)?.zh).filter(Boolean).join('、') || '几何图案';
  const palette = [...a.colors.v, ...a.customColors.v].filter(isHex).slice(0, 3).map(colorName);
  return `为「${cat}」类包装设计一张装饰贴纸图案：${style}风格，主体元素是${pats}${palette.length ? `，配色以${palette.join(' / ')}为主` : ''}。扁平矢量插画，单个图案居中，纯白背景。画面里不要出现文字、商标、真实品牌标志或人物。`;
}

/** 一句话摘要：类别 · 形式 · 尺寸 */
export function metaLine(a: StudioAnswers): string {
  const cat = CATEGORIES.find((c) => c.id === a.category.v)?.zh || '';
  const form = formDef(a.form.v)?.zh || '';
  const size = a.size ? sizeText(a.size.dims) : '';
  return [cat, form, size].filter(Boolean).join('  ·  ');
}

/** 有没有图案位：选了图案或已经生成过贴纸才放这一块 */
function wantsSticker(a: StudioAnswers): boolean {
  return a.patterns.v.length > 0;
}

export function buildDesign(p: StudioProject, now = Date.now()): StudioDesign {
  const a = p.answers;
  const { bg, ink, accent } = pickPalette(a);
  const name = a.productName.v.trim();
  const els: DesignEl[] = [];

  if (name) {
    els.push({
      id: 'name', kind: 'text', text: name,
      x: 10, y: 12, w: 80, size: 9.5, weight: 600, color: ink, align: 'left',
    });
  }
  els.push({ id: 'rule', kind: 'rect', x: 10, y: 25, w: 13, h: 0.55, color: accent });

  const meta = metaLine(a);
  if (meta) {
    els.push({
      id: 'meta', kind: 'text', text: meta,
      x: 10, y: 27.2, w: 72, size: 2.3, weight: 400, color: ink, opacity: 0.62,
    });
  }

  if (wantsSticker(a)) {
    els.push({ id: 'sticker', kind: 'sticker', x: 55, y: 40, w: 34 });
  }

  const sell = a.sellingPoints.v.trim();
  if (sell) {
    els.push({
      id: 'sell', kind: 'text', text: sell,
      x: 10, y: 58, w: wantsSticker(a) ? 40 : 62, size: 3.1, weight: 400, color: ink, opacity: 0.86,
    });
  }

  const content = a.productContent.v.trim();
  if (content) {
    els.push({
      id: 'content', kind: 'text', text: content,
      x: 10, y: 78, w: wantsSticker(a) ? 44 : 66, size: 2.4, weight: 400, color: ink, opacity: 0.6,
    });
  }

  els.push({
    id: 'mark', kind: 'text', text: 'LunaSol',
    x: 10, y: 91, w: 30, size: 1.9, weight: 500, color: ink, opacity: 0.38,
  });

  /* 刀模里真实存在的其余面：各给一版克制的默认版面。
     只用用户写过的字段（名称 / 内容 / 卖点 / 补充），不编任何卖点或规格。 */
  const panels = facesOf(p);
  const faces: Partial<Record<string, DesignEl[]>> = { front: els };
  for (const f of panels) {
    if (f.id !== 'front') faces[f.id] = defaultFaceEls(f.id, p, { ink, accent });
  }

  const front = panels.find((f) => f.id === 'front');
  return {
    ratio: front ? [front.w, front.h] : ratioFor(a.form.v),
    bg, ink, accent,
    els,
    faces,
    updatedAt: now,
  };
}

/** 除正面之外的默认版面：背面放信息，侧面与顶面只放品牌，避免满版假文案 */
function defaultFaceEls(
  face: string,
  p: StudioProject,
  c: { ink: string; accent: string },
): DesignEl[] {
  const a = p.answers;
  const name = a.productName.v.trim();
  const out: DesignEl[] = [];

  if (face === 'back') {
    if (name) out.push({ id: 'b_name', kind: 'text', text: name, x: 10, y: 10, w: 80, size: 4.2, weight: 500, color: c.ink, opacity: 0.72 });
    out.push({ id: 'b_rule', kind: 'rect', x: 10, y: 19, w: 10, h: 0.5, color: c.accent });
    const content = a.productContent.v.trim();
    if (content) out.push({ id: 'b_content', kind: 'text', text: content, x: 10, y: 26, w: 76, size: 2.3, color: c.ink, opacity: 0.7 });
    const sell = a.sellingPoints.v.trim();
    if (sell) out.push({ id: 'b_sell', kind: 'text', text: sell, x: 10, y: 60, w: 76, size: 2.1, color: c.ink, opacity: 0.55 });
    const extra = a.extra.v.trim();
    if (extra) out.push({ id: 'b_extra', kind: 'text', text: extra, x: 10, y: 78, w: 76, size: 1.8, color: c.ink, opacity: 0.45 });
    out.push({ id: 'b_mark', kind: 'text', text: 'LunaSol', x: 10, y: 92, w: 30, size: 1.6, weight: 500, color: c.ink, opacity: 0.32 });
    return out;
  }

  if (face === 'top') {
    if (name) out.push({ id: 't_name', kind: 'text', text: name, x: 12, y: 38, w: 76, size: 6, weight: 600, color: c.ink, align: 'center' });
    out.push({ id: 't_rule', kind: 'rect', x: 42, y: 52, w: 16, h: 0.4, color: c.accent });
    return out;
  }

  /* 左右侧：只放品牌名，位置靠下，别和正面抢 */
  if (name) out.push({ id: `${face}_name`, kind: 'text', text: name, x: 12, y: 76, w: 76, size: 2.8, weight: 500, color: c.ink, opacity: 0.6 });
  out.push({ id: `${face}_rule`, kind: 'rect', x: 12, y: 84, w: 8, h: 0.4, color: c.accent });
  return out;
}

/* ============================ 元素操作 ============================ */

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** 所有元素操作都在「某个面」上做。face 默认 front，老调用点不用改。
 *  内部统一走 faceEls / withFaceEls，保证 faces 与旧的 els 不会各说各话。 */
const mapFace = (d: StudioDesign, face: string, fn: (els: DesignEl[]) => DesignEl[]): StudioDesign =>
  withFaceEls(d, face, fn(faceEls(d, face)));

/** 移动：允许贴边，但不能整个拖出画布（至少留 8% 在视野里） */
export function moveEl(d: StudioDesign, id: string, x: number, y: number, face = 'front'): StudioDesign {
  return mapFace(d, face, (els) => els.map((e) => (e.id === id
    ? { ...e, x: clamp(x, -e.w + 8, 96), y: clamp(y, -4, 98) } : e)));
}

/** 改宽度：文字与贴纸的最小宽度不同，文字太窄会折成一条竖线 */
export function resizeEl(d: StudioDesign, id: string, w: number, face = 'front'): StudioDesign {
  return mapFace(d, face, (els) => els.map((e) => (e.id === id
    ? { ...e, w: clamp(w, e.kind === 'rect' ? 1 : 8, 100) } : e)));
}

export function patchEl(d: StudioDesign, id: string, patch: Partial<DesignEl>, face = 'front'): StudioDesign {
  return mapFace(d, face, (els) => els.map((e) => (e.id === id
    ? { ...e, ...patch, id: e.id, kind: e.kind } : e)));
}

export function removeEl(d: StudioDesign, id: string, face = 'front'): StudioDesign {
  return mapFace(d, face, (els) => els.filter((e) => e.id !== id));
}

/** 层级：数组顺序即 z 轴顺序，末尾在最上面 */
export function reorderEl(d: StudioDesign, id: string, dir: -1 | 1, face = 'front'): StudioDesign {
  const els = faceEls(d, face);
  const i = els.findIndex((e) => e.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= els.length) return d;
  const next = [...els];
  [next[i], next[j]] = [next[j], next[i]];
  return withFaceEls(d, face, next);
}

/** 生成/重新生成贴纸后写回：这一面没有贴纸位就新建一个，有就原地换图 */
export function setSticker(d: StudioDesign, src: string, face = 'front'): StudioDesign {
  const els = faceEls(d, face);
  const has = els.some((e) => e.kind === 'sticker');
  const next = has
    ? els.map((e) => (e.kind === 'sticker' ? { ...e, src } : e))
    : [...els, { id: `sticker_${Date.now().toString(36)}`, kind: 'sticker' as const, src, x: 52, y: 36, w: 40 }];
  return withFaceEls(d, face, next);
}

/** 加一条新文字：给「加文字」按钮用，位置错开，避免每次都叠在同一处 */
export function addText(d: StudioDesign, text = '双击改文字', face = 'front'): StudioDesign {
  const n = faceEls(d, face).filter((e) => e.kind === 'text').length;
  const el: DesignEl = {
    id: `t_${Date.now().toString(36)}_${n}`,
    kind: 'text', text,
    x: 10, y: clamp(20 + n * 6, 5, 85), w: 50,
    size: 3, weight: 400, color: d.ink, align: 'left',
  };
  return withFaceEls(d, face, [...faceEls(d, face), el]);
}

/** 复制一个元素到同一面（偏移一点，便于做多行/多块） */
export function duplicateEl(d: StudioDesign, id: string, face = 'front'): StudioDesign {
  const els = faceEls(d, face);
  const src = els.find((e) => e.id === id);
  if (!src) return d;
  const copy: DesignEl = {
    ...src,
    id: `${src.id}_c${Date.now().toString(36).slice(-3)}`,
    x: clamp(src.x + 2, -src.w + 8, 96),
    y: clamp(src.y + 3, -4, 98),
  };
  return withFaceEls(d, face, [...els, copy]);
}

export function selectedEl(d: StudioDesign, id: string, face = 'front'): DesignEl | null {
  return faceEls(d, face).find((e) => e.id === id) || null;
}
