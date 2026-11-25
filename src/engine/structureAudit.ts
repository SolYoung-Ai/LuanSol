/* 结构几何审计：把「测试里要保证的几何条件」写成可复用的检查器。
 * 它不修刀模、不判断是否可生产，只回答：这段几何本身是否自洽。
 * 所有坐标单位 mm。 */
import type { Dieline, PanelRect, Segment, Sheet, StructureId } from '../types';
import { STRUCTURE_MIN } from './structure';

const EPS = 0.01;
export type AuditLevel = 'error' | 'warning';
export interface AuditIssue {
  code: string;
  level: AuditLevel;
  message: string;
  sheetId?: string;
  ref?: string;
}
export interface AuditResult {
  ok: boolean;
  issues: AuditIssue[];
  counts: {
    sheets: number;
    panels: number;
    cut: number;
    crease: number;
    bleed: number;
    safe: number;
    circles: number;
  };
}

const finite = (...v: number[]) => v.every(Number.isFinite);
const near = (a: number, b: number) => Math.abs(a - b) <= EPS;

/** 归一键：同一条线段（方向无关）得到同一个 key */
export function segKey(s: Segment | { x1: number; y1: number; x2: number; y2: number }) {
  const flip = s.x1 > s.x2 || (near(s.x1, s.x2) && s.y1 > s.y2);
  const [x1, y1, x2, y2] = flip ? [s.x2, s.y2, s.x1, s.y1] : [s.x1, s.y1, s.x2, s.y2];
  return `${x1.toFixed(3)},${y1.toFixed(3)},${x2.toFixed(3)},${y2.toFixed(3)}`;
}

const len = (s: Segment) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
const vertical = (s: Segment) => near(s.x1, s.x2) && !near(s.y1, s.y2);
const horizontal = (s: Segment) => near(s.y1, s.y2) && !near(s.x1, s.x2);

/** 两条共线线段的真实重叠长度（不共线返回 0） */
function collinearOverlap(a: Segment, b: Segment): number {
  if (vertical(a) && vertical(b) && near(a.x1, b.x1)) {
    return Math.max(0, Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) - Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2)));
  }
  if (horizontal(a) && horizontal(b) && near(a.y1, b.y1)) {
    return Math.max(0, Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2)));
  }
  return 0;
}

function pointOnEdge(x: number, y: number, r: PanelRect) {
  const left = near(x, r.x) && y >= r.y - EPS && y <= r.y + r.h + EPS;
  const right = near(x, r.x + r.w) && y >= r.y - EPS && y <= r.y + r.h + EPS;
  const top = near(y, r.y) && x >= r.x - EPS && x <= r.x + r.w + EPS;
  const bottom = near(y, r.y + r.h) && x >= r.x - EPS && x <= r.x + r.w + EPS;
  return left || right || top || bottom;
}

function pointInside(x: number, y: number, r: PanelRect) {
  return x > r.x + EPS && x < r.x + r.w - EPS && y > r.y + EPS && y < r.y + r.h - EPS;
}

function panelOverlapArea(a: PanelRect, b: PanelRect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > EPS && h > EPS ? w * h : 0;
}

function segMid(s: Segment) {
  return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
}

function auditSheet(sheet: Sheet, structure: StructureId, bleed: number): AuditIssue[] {
  const out: AuditIssue[] = [];
  const add = (code: string, level: AuditLevel, message: string, ref?: string) =>
    out.push({ code, level, message, sheetId: sheet.id, ref });
  const sheetRef = `sheet:${sheet.id}`;

  if (!finite(sheet.width, sheet.height) || sheet.width <= 0 || sheet.height <= 0) {
    add('sheet-size', 'error', `展开图 ${sheet.name} 的宽高不是有效正数（${sheet.width}×${sheet.height}）。`, sheetRef);
  }

  // 1. 面板本身
  for (const p of sheet.rects) {
    if (!finite(p.x, p.y, p.w, p.h)) {
      add('panel-nan', 'error', `面板「${p.label}」含 NaN / Infinity。`, p.label);
      continue;
    }
    if (p.w <= 0 || p.h <= 0) add('panel-nonpositive', 'error', `面板「${p.label}」宽高非正（${p.w}×${p.h}）。`, p.label);
    if (p.w < 0 || p.h < 0) add('panel-negative', 'error', `面板「${p.label}」出现负面积。`, p.label);
    if (p.x < -EPS || p.y < -EPS || p.x + p.w > sheet.width + EPS || p.y + p.h > sheet.height + EPS) {
      add('panel-outside-sheet', 'error', `面板「${p.label}」跑出展开图边界。`, p.label);
    }
  }

  // 2. 线段
  for (const s of sheet.segments) {
    if (!finite(s.x1, s.y1, s.x2, s.y2)) add('segment-nan', 'error', `${s.kind} 线段含 NaN / Infinity。`);
    else if (len(s) <= EPS) add('segment-zero', 'error', `${s.kind} 线段长度为零（${segKey(s)}）。`);
    if (!vertical(s) && !horizontal(s)) add('segment-diagonal', 'warning', `${s.kind} 线段不是水平/垂直（${segKey(s)}）。`);
  }
  for (const c of sheet.circles) {
    if (!finite(c.cx, c.cy, c.r) || c.r <= 0) add('circle-bad', 'error', '圆裁切半径或圆心无效。');
    else if (c.cx - c.r < -EPS || c.cy - c.r < -EPS || c.cx + c.r > sheet.width + EPS || c.cy + c.r > sheet.height + EPS) {
      add('circle-outside-sheet', 'warning', '圆裁切超出展开图边界。');
    }
  }

  // 3. 重复 / 冲突
  const seen = new Map<string, Segment>();
  for (const s of sheet.segments) {
    if (len(s) <= EPS) continue;
    const k = `${s.kind}:${segKey(s)}`;
    if (seen.has(k)) add('segment-duplicate', 'error', `${s.kind} 线段重复输出：${segKey(s)}。`);
    else seen.set(k, s);
  }
  const cuts = sheet.segments.filter((s) => s.kind === 'cut');
  const creases = sheet.segments.filter((s) => s.kind === 'crease');
  for (const c of creases) for (const cut of cuts) {
    if (collinearOverlap(c, cut) > 0.5) {
      add('cut-crease-overlap', 'error', `裁切线 ${segKey(cut)} 与压痕线 ${segKey(c)} 重合 ${collinearOverlap(c, cut).toFixed(2)}mm。`);
    }
  }

  // 4. 压痕必须落在两块面板的公共边上；裁切不能落在任何面板内部
  for (const s of creases) {
    const m = segMid(s);
    const owners = sheet.rects.filter((r) => pointOnEdge(m.x, m.y, r)).length;
    if (owners < 2) add('crease-orphan', 'error', `压痕线 ${segKey(s)} 只落在 ${owners} 块面板边上，不是有效折线。`);
  }
  for (const s of cuts) {
    const m = segMid(s);
    if (sheet.rects.some((r) => pointInside(m.x, m.y, r))) {
      add('cut-inside-panel', 'error', `裁切线 ${segKey(s)} 穿过面板内部（应为外轮廓）。`);
    }
    if (!sheet.rects.some((r) => pointOnEdge(m.x, m.y, r))) {
      add('cut-orphan', 'warning', `裁切线 ${segKey(s)} 不在任何面板边上。`);
    }
  }

  // 5. 面板重叠（明显压在一起会让展开稿无法折叠）
  for (let i = 0; i < sheet.rects.length; i++) {
    for (let j = i + 1; j < sheet.rects.length; j++) {
      const a = sheet.rects[i], b = sheet.rects[j];
      const area = panelOverlapArea(a, b);
      if (area > 0.5) add('panel-overlap', 'error', `面板「${a.label}」与「${b.label}」重叠 ${area.toFixed(2)}mm²。`, `${a.label} / ${b.label}`);
    }
  }

  // 6. 安全区
  for (const r of sheet.safeRects) {
    if (!finite(r.x, r.y, r.w, r.h)) add('safe-nan', 'error', '安全区含 NaN / Infinity。');
    else if (r.w <= 0 || r.h <= 0) add('safe-nonpositive', 'error', `安全区宽高非正（${r.w}×${r.h}）。`);
    else if (r.x < -EPS || r.y < -EPS || r.x + r.w > sheet.width + EPS || r.y + r.h > sheet.height + EPS) {
      add('safe-outside-sheet', 'warning', '安全区超出展开图边界。');
    }
  }

  // 7. 出血线：必须落在「外扩后并集」的外轮廓上。
  //    用每个出血线中点判断：至少属于一个外扩面板的边，且不在任何外扩面板内部。
  const b = Math.max(0, bleed);
  if (structure !== 'labelRound' && sheet.segments.some((s) => s.kind === 'bleed')) {
    const exp = sheet.rects.map((r) => ({ ...r, x: r.x - b, y: r.y - b, w: r.w + b * 2, h: r.h + b * 2 }));
    for (const s of sheet.segments.filter((x) => x.kind === 'bleed')) {
      const m = segMid(s);
      if (!exp.some((r) => pointOnEdge(m.x, m.y, r)) && !exp.some((r) => pointInside(m.x, m.y, r))) {
        add('bleed-orphan', 'warning', `出血线 ${segKey(s)} 不在任何面板的出血外沿上。`);
      }
    }
  }

  return out;
}

export function auditDieline(d: Dieline): AuditResult {
  const issues: AuditIssue[] = [];
  for (const s of d.sheets) issues.push(...auditSheet(s, d.structure, d.bleed));
  if (d.clamped) {
    issues.push({ code: 'input-clamped', level: 'error', message: `输入尺寸被夹取（输入 ${d.input?.l}×${d.input?.w}×${d.input?.h} → 计算 ${d.finished.l}×${d.finished.w}×${d.finished.h}mm），不能作为生产文件。` });
  }
  if (!d.sheets.length) issues.push({ code: 'no-sheet', level: 'error', message: '没有生成任何展开图。' });
  const all = d.sheets.flatMap((s) => s.segments);
  return {
    ok: !issues.some((i) => i.level === 'error'),
    issues,
    counts: {
      sheets: d.sheets.length,
      panels: d.sheets.reduce((a, s) => a + s.rects.length, 0),
      cut: all.filter((s) => s.kind === 'cut').length + d.sheets.reduce((a, s) => a + s.circles.filter((c) => c.kind === 'cut').length, 0),
      crease: all.filter((s) => s.kind === 'crease').length,
      bleed: all.filter((s) => s.kind === 'bleed').length,
      safe: all.filter((s) => s.kind === 'safe').length,
      circles: d.sheets.reduce((a, s) => a + s.circles.length, 0),
    },
  };
}

/** 输入层校验：用户填的尺寸是否合法（与刀模的实际计算分开） */
export function validateStructureInput(structure: StructureId, size: { l: number; w: number; h: number }): AuditIssue[] {
  const out: AuditIssue[] = [];
  const min = STRUCTURE_MIN[structure];
  const label = { l: '长度', w: '宽度', h: '高度' } as const;
  for (const key of ['l', 'w', 'h'] as const) {
    const v = size?.[key];
    if (!Number.isFinite(v)) out.push({ code: `input-${key}-nan`, level: 'error', message: `${label[key]}不是有效数字（${String(v)}）。` });
    else if (v <= 0) out.push({ code: `input-${key}-nonpositive`, level: 'error', message: `${label[key]}必须大于 0，当前 ${v}mm。` });
    else if (v < min[key]) out.push({ code: `input-${key}-under-min`, level: 'error', message: `${label[key]} ${v}mm 低于该结构下限 ${min[key]}mm。` });
  }
  if (Number.isFinite(size.l) && Number.isFinite(size.w) && size.l > 0 && size.w > 0) {
    const ratio = Math.max(size.l / size.w, size.w / size.l);
    if (ratio > 6) out.push({ code: 'input-ratio-extreme', level: 'warning', message: `长宽比 ${ratio.toFixed(2)}:1 超出常规 6:1，需与印厂确认。` });
  }
  return out;
}
