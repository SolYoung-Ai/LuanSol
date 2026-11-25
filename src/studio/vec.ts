/* ============================================================
   Studio 2.0 阶段二 — 二维编辑器的几何内核
   ------------------------------------------------------------
   这里只放纯函数，不碰 DOM、不碰 React：
     元素（百分比） ⇄ 面内毫米（复用 frames 的 elLocalRect）
     选择框、八个把手、旋转把手的位置
     拖动 / 缩放 / 旋转的数学
     屏幕坐标（clientX/Y）→ 设计坐标（mm）

   屏幕 → 设计坐标只走 clientToMm：入参是 SVG 的真实 getBoundingClientRect，
   所以缩放、平移、页面滚动、设备像素比全部被自动吸收，组件里不许再自己换算。
   ============================================================ */
import { elLocalRect, elTextMetrics, validBox, type FaceBox, type MmRect } from './frames';
import type { DesignEl } from './types';

export type Pt = { x: number; y: number };
export type Box = MmRect;
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export const round2 = (n: number) => Math.round(n * 100) / 100;
const fin = (n: number | undefined, fallback = 0) => (Number.isFinite(n as number) ? (n as number) : fallback);

export const centerOf = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** 绕某点旋转（度，顺时针为正，与 SVG rotate 一致） */
export function rotatePt(p: Pt, c: Pt, deg: number): Pt {
  const r = (fin(deg) * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** 盒子的四角（按元素旋转角） */
export function corners(b: Box, rotation = 0): Pt[] {
  const c = centerOf(b);
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ].map((p) => rotatePt(p, c, rotation));
}

/** 一组盒子（各自带旋转）的轴对齐外框 */
export function unionBox(items: { box: Box; rotation?: number }[]): Box | null {
  const pts = items.flatMap((it) => corners(it.box, it.rotation || 0));
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** 单个元素的毫米盒（与导出、3D 完全同一份） */
export function elBox(el: DesignEl, face: FaceBox): Box {
  return elLocalRect(el, face);
}

/** 选择框：单选 = 元素自身（带旋转），多选/组合 = 轴对齐外框（旋转 0） */
export function selectionFrame(els: DesignEl[], face: FaceBox): { box: Box; rotation: number } | null {
  if (!els.length) return null;
  if (els.length === 1) {
    const el = els[0];
    return { box: elBox(el, face), rotation: fin(el.rotation) };
  }
  const box = unionBox(els.map((el) => ({ box: elBox(el, face), rotation: fin(el.rotation) })));
  return box ? { box, rotation: 0 } : null;
}

/** 八个缩放把手 + 旋转把手的位置（都在面内毫米坐标里）。
 *  旋转把手离顶边 3mm；缩放手把的命中半径按画布缩放换算，这里只给几何位置。 */
export function handlePoints(b: Box, rotation = 0, offsetMm = 3): Record<Handle, Pt> {
  const c = centerOf(b);
  const local: Record<Handle, Pt> = {
    nw: { x: b.x, y: b.y },
    n: { x: b.x + b.w / 2, y: b.y },
    ne: { x: b.x + b.w, y: b.y },
    e: { x: b.x + b.w, y: b.y + b.h / 2 },
    se: { x: b.x + b.w, y: b.y + b.h },
    s: { x: b.x + b.w / 2, y: b.y + b.h },
    sw: { x: b.x, y: b.y + b.h },
    w: { x: b.x, y: b.y + b.h / 2 },
    rotate: { x: b.x + b.w / 2, y: b.y - offsetMm },
  };
  const out = {} as Record<Handle, Pt>;
  for (const k of Object.keys(local) as Handle[]) out[k] = rotatePt(local[k], c, rotation);
  return out;
}

const near = (a: Pt, b: Pt, tol: number) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;

/** 命中哪个把手（tol 为毫米，由界面按 1/scale 换算成屏幕恒定大小） */
export function hitHandle(pt: Pt, b: Box, rotation = 0, tol = 1.6): Handle | null {
  const pts = handlePoints(b, rotation);
  const order: Handle[] = ['rotate', ...HANDLES];
  for (const k of order) if (near(pt, pts[k], k === 'rotate' ? tol * 1.4 : tol)) return k;
  return null;
}

/** 点在不在（可旋转的）盒子里 */
export function pointInBox(pt: Pt, b: Box, rotation = 0): boolean {
  const c = centerOf(b);
  const p = rotatePt(pt, c, -rotation);
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

/** 拖动/框选命中：元素盒子与矩形相交（按元素旋转后的角点判断） */
export function boxHitsRect(b: Box, rotation: number, rect: Box): boolean {
  const pts = corners(b, rotation);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return Math.min(...xs) <= rect.x + rect.w && Math.max(...xs) >= rect.x
    && Math.min(...ys) <= rect.y + rect.h && Math.max(...ys) >= rect.y;
}

const MIN_W = 1.5;
const MIN_H = 1;

/** 缩放：保持对角锚点不动，delta 是「展开图毫米」，按元素旋转角投到元素局部轴。
 *  返回元素级的未旋转盒（x/y/w/h，mm）。 */
export function resizeBox(
  start: Box, handle: Handle, dxMm: number, dyMm: number, rotation = 0,
  opts: { keepRatio?: boolean; minW?: number; minH?: number } = {},
): Box {
  if (handle === 'rotate') return start;
  const r = fin(rotation) * Math.PI / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  // 屏幕/展开图位移 → 元素局部位移（旋转的逆变换）
  const dx = dxMm * cos + dyMm * sin;
  const dy = -dxMm * sin + dyMm * cos;
  const minW = opts.minW ?? MIN_W;
  const minH = opts.minH ?? MIN_H;
  let { x, y, w, h } = start;

  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.includes('n');
  const south = handle.includes('s');

  if (east) w += dx;
  if (west) { x += dx; w -= dx; }
  if (south) h += dy;
  if (north) { y += dy; h -= dy; }

  if (opts.keepRatio && w > 0 && h > 0) {
    const ratio = start.w / start.h;
    if (east || west) {
      const nh = w / ratio;
      if (north) y += h - nh;
      h = nh;
    } else if (north || south) {
      const nw = h * ratio;
      if (west) x += w - nw;
      w = nw;
    }
  }

  if (w < minW) { if (west) x -= minW - w; w = minW; }
  if (h < minH) { if (north) y -= minH - h; h = minH; }
  return { x, y, w, h };
}

/** 指针相对中心的角度（度，0 = 正右，顺时针为正） */
export function angleDeg(c: Pt, p: Pt): number {
  return (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;
}

export function normalizeAngle(a: number): number {
  let v = fin(a) % 360;
  if (v > 180) v -= 360;
  if (v < -180) v += 360;
  return round2(v);
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** 屏幕坐标 → 面内毫米。rect 是 SVG 的真实 getBoundingClientRect()：
 *  已含 CSS 缩放、平移、页面滚动与设备像素比。 */
export function clientToMm(clientX: number, clientY: number, rect: DOMRect, face: FaceBox): Pt {
  const box = validBox(face);
  if (!box || !rect.width || !rect.height) return { x: 0, y: 0 };
  return {
    x: ((clientX - rect.left) / rect.width) * box.w,
    y: ((clientY - rect.top) / rect.height) * box.h,
  };
}

/** 毫米 → 百分比，直接写回 DesignEl.x/y/w/h（持久化单位始终是百分比） */
export function mmRectToPct(b: Box, face: FaceBox): { x: number; y: number; w: number; h: number } {
  const box = validBox(face) || { w: 100, h: 100 };
  return {
    x: round2((b.x / box.w) * 100),
    y: round2((b.y / box.h) * 100),
    w: round2((b.w / box.w) * 100),
    h: round2((b.h / box.h) * 100),
  };
}

/** 文本是否溢出文本框（给了 h 才有意义；与导出的 textOverflow 同一算法） */
export function textOverflow(el: DesignEl, face: FaceBox): boolean {
  if (el.kind !== 'text' || !el.h) return false;
  const box = validBox(face);
  if (!box) return false;
  const m = elTextMetrics(el, box);
  const boxH = (clamp(fin(el.h), 0.3, 100) / 100) * box.h;
  return m.h > boxH + 0.2;
}

/** 组合：把同一 groupId 的元素一起选中（没有 groupId 就只选它自己） */
export function expandSelection(els: DesignEl[], ids: string[]): string[] {
  const groups = new Set(els.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId!));
  return els.filter((e) => ids.includes(e.id) || (e.groupId && groups.has(e.groupId))).map((e) => e.id);
}
