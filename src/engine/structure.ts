/* 包装结构引擎：由成品尺寸计算真实展开刀模（裁切线 / 压痕线 / 出血 / 安全区）
 * 所有几何为毫米坐标。裁切线 = 面片并集的边界；压痕线 = 相邻面片的公共边。
 * 该计算完全由几何规则完成，不经 AI 判断结构是否可生产。 */
import type { Dieline, FaceId, PanelRect, Segment, Sheet, StructureId, StructureInfo } from '../types';
import { round } from './utils';

const EPS = 0.001;

export const STRUCTURES: StructureInfo[] = [
  {
    id: 'tuck', name: '常规插舌盒', group: '盒类', difficulty: 1, first: true,
    nameEn: 'Tuck-end carton',
    desc: '一体成型、上下插舌，最常见的折叠纸盒。',
    descEn: 'One-piece blank with top and bottom tuck flaps — the most common folding carton.',
    use: '茶叶、零食、轻食、小型礼品',
    useEn: 'Tea, snacks, light food, small gifts',
  },
  {
    id: 'topBottom', name: '天地盖盒', group: '盒类', difficulty: 2, first: true,
    nameEn: 'Two-piece lid & base box',
    desc: '上下两片套合，开合有仪式感，硬挺度高。',
    descEn: 'Separate lid and base that sleeve together — a ceremonial open, high rigidity.',
    use: '高端茶礼、礼盒、文创、美妆套盒',
    useEn: 'Premium tea gifts, gift boxes, cultural goods, beauty sets',
  },
  {
    id: 'drawer', name: '抽屉盒', group: '盒类', difficulty: 3, first: true,
    nameEn: 'Drawer box',
    desc: '外套 + 内盒抽拉结构，层次丰富。',
    descEn: 'Outer sleeve with a sliding inner tray — rich layering.',
    use: '茶礼、首饰、香氛、限定礼盒',
    useEn: 'Tea gifts, jewellery, fragrance, limited editions',
  },
  {
    id: 'mailer', name: '飞机盒', group: '盒类', difficulty: 2, first: true,
    nameEn: 'Mailer box',
    desc: '一体折叠、侧翼包覆，运输保护性好、组装快。',
    descEn: 'One-piece fold with wrap-around wings — strong protection in transit, fast to assemble.',
    use: '电商快递、服装、文创、订阅礼盒',
    useEn: 'E-commerce shipping, apparel, cultural goods, subscription boxes',
  },
  {
    id: 'pouch', name: '自立袋', group: '袋类', difficulty: 2, first: true,
    nameEn: 'Stand-up pouch',
    desc: '正面 + 背面 + 底部折角，带顶部封口边。',
    descEn: 'Front, back and gusseted base with a top seal edge.',
    use: '咖啡豆、零食、茶叶、谷物',
    useEn: 'Coffee beans, snacks, tea, grains',
  },
  {
    id: 'labelRect', name: '矩形标签', group: '标签类', difficulty: 1, first: true,
    nameEn: 'Rectangular label',
    desc: '直角或圆角矩形贴标，适配瓶身与袋体。',
    descEn: 'Square or rounded-corner label that fits bottles and pouches.',
    use: '瓶贴、食品标签、护肤品标签',
    useEn: 'Bottle labels, food labels, skincare labels',
  },
  {
    id: 'labelRound', name: '圆形标签', group: '标签类', difficulty: 1, first: true,
    nameEn: 'Round label',
    desc: '圆形模切贴标，适合封口贴与瓶盖贴。',
    descEn: 'Die-cut round label, ideal for seals and cap stickers.',
    use: '封口贴、罐贴、手作品牌',
    useEn: 'Seal stickers, jar labels, craft brands',
  },
];

/** 结构名与分组名按语言取值：结构名是专有名词，不能随界面语言漂移成内部 id */
export const structName = (s: StructureInfo, lang: string) => (lang === 'en' ? s.nameEn : s.name);
export const structDesc = (s: StructureInfo, lang: string) => (lang === 'en' ? s.descEn : s.desc);
export const structUse = (s: StructureInfo, lang: string) => (lang === 'en' ? s.useEn : s.use);
export const GROUP_EN: Record<string, string> = { 盒类: 'Boxes', 袋类: 'Bags', 标签类: 'Labels' };
export const groupName = (g: string, lang: string) => (lang === 'en' ? GROUP_EN[g] || g : g);

export const structureById = (id: StructureId) => STRUCTURES.find((s) => s.id === id) || STRUCTURES[0];

interface Edge { v: boolean; at: number; a: number; b: number; owner: number }

function edgesOf(r: PanelRect, owner: number): Edge[] {
  return [
    { v: true, at: r.x, a: r.y, b: r.y + r.h, owner },
    { v: true, at: r.x + r.w, a: r.y, b: r.y + r.h, owner },
    { v: false, at: r.y, a: r.x, b: r.x + r.w, owner },
    { v: false, at: r.y + r.h, a: r.x, b: r.x + r.w, owner },
  ];
}

function segmentOf(e: Edge, a: number, b: number, kind: Segment['kind']): Segment {
  return e.v
    ? { x1: e.at, y1: a, x2: e.at, y2: b, kind }
    : { x1: a, y1: e.at, x2: b, y2: e.at, kind };
}

function segKey(s: Segment) {
  const [x1, y1, x2, y2] = s.x1 > s.x2 || (s.x1 === s.x2 && s.y1 > s.y2)
    ? [s.x2, s.y2, s.x1, s.y1] : [s.x1, s.y1, s.x2, s.y2];
  return `${kindChar(s.kind)}${round(x1, 3)},${round(y1, 3)},${round(x2, 3)},${round(y2, 3)}`;
}
const kindChar = (k: Segment['kind']) => ({ cut: 'C', crease: 'F', bleed: 'B', safe: 'S' }[k]);

function mergeIntervals(list: [number, number][]): [number, number][] {
  if (!list.length) return [];
  const s = [...list].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [[...s[0]] as [number, number]];
  for (const [a, b] of s.slice(1)) {
    const last = out[out.length - 1];
    if (a <= last[1] + EPS) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function subtractIntervals(a: number, b: number, cuts: [number, number][]): [number, number][] {
  const merged = mergeIntervals(cuts.filter(([x, y]) => y > x + EPS));
  const out: [number, number][] = [];
  let cur = a;
  for (const [x, y] of merged) {
    const lo = Math.max(a, x), hi = Math.min(b, y);
    if (hi <= lo + EPS) continue;
    if (lo > cur + EPS) out.push([cur, lo]);
    cur = Math.max(cur, hi);
  }
  if (b > cur + EPS) out.push([cur, b]);
  return out;
}

/** 面片并集边界：外露边=裁切线，公共边=压痕线 */
function boundary(rects: PanelRect[], withCrease: boolean) {
  const edges = rects.flatMap((r, i) => edgesOf(r, i));
  const cut: Segment[] = [], crease: Segment[] = [];
  const seenC = new Set<string>(), seenF = new Set<string>();
  for (const e of edges) {
    const overlaps: [number, number][] = [];
    for (const e2 of edges) {
      if (e2.owner === e.owner || e2.v !== e.v || Math.abs(e2.at - e.at) > EPS) continue;
      const a = Math.max(e.a, e2.a), b = Math.min(e.b, e2.b);
      if (b - a > EPS) overlaps.push([a, b]);
    }
    const merged = mergeIntervals(overlaps);
    for (const [a, b] of subtractIntervals(e.a, e.b, merged)) {
      const s = segmentOf(e, a, b, 'cut');
      const k = segKey(s);
      if (!seenC.has(k)) { seenC.add(k); cut.push(s); }
    }
    if (withCrease) for (const [a, b] of merged) {
      const s = segmentOf(e, a, b, 'crease');
      const k = segKey(s);
      if (!seenF.has(k)) { seenF.add(k); crease.push(s); }
    }
  }
  return { cut, crease };
}

function assemble(
  id: string, name: string, raw: PanelRect[], bleed: number, safe: number,
  circles: Sheet['circles'] = [],
): Sheet {
  const { cut, crease } = boundary(raw, circles.length === 0);
  const expanded = raw.map((r) => ({ ...r, x: r.x - bleed, y: r.y - bleed, w: r.w + bleed * 2, h: r.h + bleed * 2 }));
  const bleedLines = circles.length ? [] : boundary(expanded, false).cut.map((s) => ({ ...s, kind: 'bleed' as const }));
  const safeRects = raw.filter((r) => r.artwork && r.face).map((r) => ({
    x: r.x + safe, y: r.y + safe, w: Math.max(0, r.w - safe * 2), h: Math.max(0, r.h - safe * 2),
  }));
  const safeLines: Segment[] = safeRects.flatMap((r) => [
    { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y, kind: 'safe' },
    { x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h, kind: 'safe' },
    { x1: r.x + r.w, y1: r.y + r.h, x2: r.x, y2: r.y + r.h, kind: 'safe' },
    { x1: r.x, y1: r.y + r.h, x2: r.x, y2: r.y, kind: 'safe' },
  ]);
  const right = Math.max(...raw.map((r) => r.x + r.w));
  const bottom = Math.max(...raw.map((r) => r.y + r.h));
  const shift = (s: Segment): Segment => ({ ...s, x1: s.x1 + bleed, y1: s.y1 + bleed, x2: s.x2 + bleed, y2: s.y2 + bleed });
  return {
    id, name,
    width: round(right + bleed * 2, 2),
    height: round(bottom + bleed * 2, 2),
    rects: raw.map((r) => ({ ...r, x: r.x + bleed, y: r.y + bleed })),
    segments: [...cut, ...crease, ...bleedLines, ...safeLines].map(shift),
    circles: circles.map((c) => ({ ...c, cx: c.cx + bleed, cy: c.cy + bleed })),
    safeRects: safeRects.map((r) => ({ ...r, x: r.x + bleed, y: r.y + bleed })),
  };
}

function tuckNet(l: number, w: number, h: number, glueW: number, tuckLen: number): PanelRect[] {
  const glue = round(glueW, 2);
  const tuck = round(tuckLen, 2);
  const dust = round(w * 0.55, 2);
  const y = tuck + w;
  const xF = 0, xR = l, xB = l + w, xL = l * 2 + w;
  const r: PanelRect[] = [
    { x: xF, y, w: l, h, face: 'front', label: '正面', artwork: true },
    { x: xR, y, w, h, face: 'right', label: '右侧', artwork: true },
    { x: xB, y, w: l, h, face: 'back', label: '背面', artwork: true },
    { x: xL, y, w, h, face: 'left', label: '左侧', artwork: true },
    { x: xL + w, y, w: glue, h, label: '粘合位' },
    { x: xF, y: tuck, w: l, h: w, face: 'top', label: '顶盖', artwork: true },
    { x: xB, y: tuck, w: l, h: w, label: '内插舌' },
    { x: xR, y: y - dust, w, h: dust, label: '防尘翼' },
    { x: xL, y: y - dust, w, h: dust, label: '防尘翼' },
    { x: xF, y: 0, w: l, h: tuck, label: '插舌' },
    { x: xF, y: y + h, w: l, h: w, label: '底盖' },
    { x: xB, y: y + h, w: l, h: w, label: '底盖' },
    { x: xR, y: y + h, w, h: dust, label: '防尘翼' },
    { x: xL, y: y + h, w, h: dust, label: '防尘翼' },
  ];
  return r;
}

function trayNet(l: number, w: number, wall: number, prefix: string, topFace?: FaceId): PanelRect[] {
  const g = round(Math.min(12, Math.max(7, wall * 0.4)), 2);
  const r: PanelRect[] = [
    { x: wall, y: wall, w: l, h: w, face: topFace, label: `${prefix}·主面`, artwork: !!topFace },
    { x: wall, y: 0, w: l, h: wall, face: topFace ? undefined : 'front', label: `${prefix}·前墙`, artwork: !topFace },
    { x: wall, y: wall + w, w: l, h: wall, face: topFace ? undefined : 'back', label: `${prefix}·后墙`, artwork: !topFace },
    { x: 0, y: wall, w: wall, h: w, face: topFace ? undefined : 'left', label: `${prefix}·左墙`, artwork: !topFace },
    { x: wall + l, y: wall, w: wall, h: w, face: topFace ? undefined : 'right', label: `${prefix}·右墙`, artwork: !topFace },
    { x: -g, y: wall, w: g, h: w, label: `${prefix}·粘合位` },
    { x: wall + l + wall, y: wall, w: g, h: w, label: `${prefix}·粘合位` },
  ];
  // 归一化到 0 起点
  const minX = Math.min(...r.map((p) => p.x));
  return r.map((p) => ({ ...p, x: p.x - minX }));
}

/** 飞机盒：一体折叠，顶盖 + 侧翼 + 前后墙 + 底面。侧翼长度由用户确认。 */
function mailerNet(l: number, w: number, h: number, flap: number): PanelRect[] {
  const t = round(Math.max(10, Math.min(flap, w * 0.6)), 2);
  const x = h;
  const yTop = t, yRear = t + w, yBottom = yRear + h, yFront = yBottom + w;
  return [
    { x, y: 0, w: l, h: t, label: '前插舌' },
    { x, y: yTop, w: l, h: w, face: 'top', label: '顶盖', artwork: true },
    { x, y: yRear, w: l, h, face: 'back', label: '后墙', artwork: true },
    { x, y: yBottom, w: l, h: w, label: '底面' },
    { x, y: yFront, w: l, h, face: 'front', label: '前墙', artwork: true },
    { x: 0, y: yTop, w: h, h: w, face: 'left', label: '左侧翼', artwork: true },
    { x: h + l, y: yTop, w: h, h: w, face: 'right', label: '右侧翼', artwork: true },
    { x: 0, y: yBottom, w: h, h: w, label: '左侧墙' },
    { x: h + l, y: yBottom, w: h, h: w, label: '右侧墙' },
  ];
}

function sleeveNet(l: number, w: number, h: number): PanelRect[] {
  const g = 10;
  return [
    { x: 0, y: 0, w: l, h: w, face: 'top', label: '外套·顶面', artwork: true },
    { x: l, y: 0, w: h, h: w, face: 'front', label: '外套·抽拉面', artwork: true },
    { x: l + h, y: 0, w: l, h: w, label: '外套·底面' },
    { x: 2 * l + h, y: 0, w: h, h: w, face: 'back', label: '外套·背面', artwork: true },
    { x: 2 * l + 2 * h, y: 0, w: g, h: w, label: '外套·粘合位' },
  ];
}

/** 结构补充参数（mm）：用户在向导 STEP 01 确认的真实几何值。
 *  key 与 src/v3/draft.ts 的 STRUCTURE_EXTRA 一致。 */
export type StructureExtra = Record<string, number>;

/** 读取补充参数：缺失或非法时退回引擎默认值，并夹到物理可用的区间内。 */
const extraNum = (extra: StructureExtra | undefined, key: string, fallback: number, min: number, max: number) => {
  const n = Number(extra?.[key]);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.max(min, n));
};

/** 圆角矩形轮廓（用短直线段逼近圆弧：现有 Segment 只有直线类型）。
 *  顺时针返回闭合点列，坐标为展开稿毫米坐标。 */
function roundedRectPoints(x: number, y: number, w: number, h: number, r: number, perCorner = 6): [number, number][] {
  const rr = Math.min(r, w / 2, h / 2);
  if (rr <= 0.01) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
  const corners: [number, number, number][] = [
    [x + w - rr, y + rr, -Math.PI / 2],       // 右上：-90° → 0°
    [x + w - rr, y + h - rr, 0],             // 右下：0° → 90°
    [x + rr, y + h - rr, Math.PI / 2],       // 左下：90° → 180°
    [x + rr, y + rr, Math.PI],               // 左上：180° → 270°
  ];
  const pts: [number, number][] = [];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const a = a0 + (Math.PI / 2) * (i / perCorner);
      pts.push([round(cx + rr * Math.cos(a), 3), round(cy + rr * Math.sin(a), 3)]);
    }
  }
  pts.push(pts[0]);
  return pts;
}

const polylineSegments = (pts: [number, number][], kind: Segment['kind']): Segment[] => {
  const out: Segment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    out.push({ x1: pts[i][0], y1: pts[i][1], x2: pts[i + 1][0], y2: pts[i + 1][1], kind });
  }
  return out;
};

/** 圆角矩形标签展开图：裁切线与出血线都按圆角生成（直角标签仍走通用矩形逻辑）。 */
function roundedLabelSheet(l: number, w: number, radius: number, bleed: number, safe: number): Sheet {
  const cutPts = roundedRectPoints(0, 0, l, w, radius);
  const bleedPts = roundedRectPoints(-bleed, -bleed, l + bleed * 2, w + bleed * 2, radius + bleed);
  const shift = (pts: [number, number][]) => pts.map((p) => [p[0] + bleed, p[1] + bleed] as [number, number]);
  return {
    id: 'label-rect', name: '矩形标签',
    width: round(l + bleed * 2, 2), height: round(w + bleed * 2, 2),
    rects: [{ x: bleed, y: bleed, w: l, h: w, face: 'front', label: '标签', artwork: true }],
    segments: [
      ...polylineSegments(shift(cutPts), 'cut'),
      ...polylineSegments(shift(bleedPts), 'bleed'),
    ],
    circles: [],
    safeRects: [{ x: bleed + safe, y: bleed + safe, w: Math.max(0, l - safe * 2), h: Math.max(0, w - safe * 2) }],
  };
}

export function buildDieline(
  structure: StructureId,
  size: { l: number; w: number; h: number },
  bleed = 3,
  safe = 5,
  extra?: StructureExtra,
): Dieline {
  const l = Math.max(20, size.l), w = Math.max(15, size.w), h = Math.max(8, size.h);
  const warnings: string[] = [];
  let sheets: Sheet[] = [];

  if (structure === 'tuck') {
    // 粘合位宽度 / 插舌长度：优先用用户确认的值，否则用按宽度推导的默认值
    const glue = extraNum(extra, 'glue', round(Math.min(16, Math.max(9, w * 0.18)), 2), 5, 30);
    const tuckLen = extraNum(extra, 'tuckLen', round(Math.min(20, Math.max(11, w * 0.32)), 2), 8, 45);
    sheets = [assemble('tuck-main', '插舌盒展开图', tuckNet(l, w, h, glue, tuckLen), bleed, safe)];
    if (glue < 9 || glue > 20) warnings.push(`粘合位宽度 ${glue}mm 偏离常见 9–20mm 区间，请与印厂确认。`);
    if (tuckLen > 25) warnings.push(`插舌长度 ${tuckLen}mm 偏大，过长的插舌会影响成品挺度。`);
  } else if (structure === 'topBottom') {
    // 盒盖高度 = 盖盒侧壁高；套合间隙 = 盖盒每边比底盒宽出的配合余量
    const lidWall = extraNum(extra, 'wall', Math.max(12, h * 0.3), 8, 120);
    const gap = extraNum(extra, 'gap', 1.2, 0.3, 5);
    const baseWall = Math.max(10, h - lidWall);
    sheets = [
      assemble('tb-base', '底盒展开图', trayNet(l, w, baseWall, '底盒'), bleed, safe),
      assemble('tb-lid', '盖盒展开图', trayNet(l + gap * 2, w + gap * 2, lidWall, '盖盒', 'top'), bleed, safe),
    ];
    if (baseWall < 10) warnings.push('盒盖高度接近成品总高，底盒高度不足，请复核结构参数。');
    if (gap < 0.5) warnings.push('套合间隙小于 0.5mm，盖盒可能难以套合。');
  } else if (structure === 'drawer') {
    // 内盒壁厚 = 内盒侧壁高度
    const wall = extraNum(extra, 'wall', Math.max(14, h * 0.85), 8, 100);
    const innerWall = Math.min(wall, Math.max(10, h - 5));
    sheets = [
      assemble('dw-tray', '内盒展开图', trayNet(l - 3, w - 3, innerWall, '内盒'), bleed, safe),
      assemble('dw-sleeve', '外套展开图', sleeveNet(l, w, h), bleed, safe),
    ];
  } else if (structure === 'mailer') {
    // 侧翼长度
    const flap = extraNum(extra, 'flap', round(Math.min(120, Math.max(15, w * 0.28)), 2), 15, 120);
    sheets = [assemble('mailer-main', '飞机盒展开图', mailerNet(l, w, h, flap), bleed, safe)];
    if (flap > w * 0.6) warnings.push(`侧翼长度 ${flap}mm 已超过盒宽的 60%，折叠后容易干涉。`);
  } else if (structure === 'pouch') {
    const gusset = round(Math.min(60, Math.max(20, w * 0.5)), 2);
    // 顶部封口边
    const seal = extraNum(extra, 'seal', 12, 5, 40);
    sheets = [assemble('pouch', '自立袋展开图', [
      { x: 0, y: 0, w: l, h: seal, label: '顶部封口边' },
      { x: 0, y: seal, w: l, h, label: '正面', face: 'front', artwork: true },
      { x: l, y: seal, w: l, h, label: '背面', face: 'back', artwork: true },
      { x: 0, y: seal + h, w: l, h: gusset, label: '底部折角' },
      { x: l, y: seal + h, w: l, h: gusset, label: '底部折角' },
    ], bleed, safe)];
  } else if (structure === 'labelRect') {
    // 圆角半径：>0 时按圆角生成裁切与出血线，0 为直角
    const radius = extraNum(extra, 'radius', 0, 0, 30);
    sheets = radius > 0.05
      ? [roundedLabelSheet(l, w, radius, bleed, safe)]
      : [assemble('label-rect', '矩形标签', [
        { x: 0, y: 0, w: l, h: w, face: 'front', label: '标签', artwork: true },
      ], bleed, safe)];
  } else {
    const r = Math.min(l, w) / 2;
    const cx = l / 2, cy = w / 2;
    const raw: PanelRect[] = [{ x: 0, y: 0, w: l, h: w, face: 'front', label: '圆形标签', artwork: true }];
    const sheet = assemble('label-round', '圆形标签', raw, bleed, safe, [
      { cx, cy, r, kind: 'cut' }, { cx, cy, r: r + bleed, kind: 'bleed' },
    ]);
    // 圆标签只有圆形裁切，移除矩形裁切线；保留安全区提示
    sheet.segments = sheet.segments.filter((s) => s.kind !== 'cut' && s.kind !== 'crease' && s.kind !== 'bleed');
    sheet.safeRects = [{ x: cx - r + safe, y: cy - r + safe, w: (r - safe) * 2, h: (r - safe) * 2 }];
    sheets = [sheet];
  }

  if (l / w > 6 || w / l > 6) warnings.push('长宽比例较极端，建议与印厂确认纸张与模切可行性。');
  if (h > l * 2) warnings.push('盒高明显大于盒长，折叠纸盒成型难度较高。');
  if (bleed < 2 || bleed > 5) warnings.push('出血值超出常见 3mm 范围，请确认印厂要求。');

  return { structure, sheets, bleed, safe, finished: { l, w, h }, warnings };
}

/** 每个可印刷面的成品尺寸（mm）—— 排版引擎与 3D 贴图共用 */
export function faceSizes(structure: StructureId, size: { l: number; w: number; h: number }) {
  const l = Math.max(20, size.l), w = Math.max(15, size.w), h = Math.max(8, size.h);
  if (structure === 'labelRect' || structure === 'labelRound') {
    return { front: { w: l, h: w }, back: { w: l, h: w } };
  }
  if (structure === 'pouch') {
    return { front: { w: l, h }, back: { w: l, h } };
  }
  return {
    front: { w: l, h }, back: { w: l, h },
    left: { w, h }, right: { w, h }, top: { w: l, h: w },
  };
}

export function recommendStructures(product: string, packType: string, size: { l: number; w: number; h: number }) {
  const gift = /礼|茶|香|首饰|文创|高端/.test(product);
  if (packType === 'label' || /标签|贴|瓶/.test(product)) return ['labelRect', 'labelRound', 'tuck'] as StructureId[];
  if (packType === 'pouch' || /袋|咖啡豆|自立/.test(product)) return ['pouch', 'labelRect', 'tuck'] as StructureId[];
  if (gift && size.h >= 50) return ['topBottom', 'drawer', 'tuck'] as StructureId[];
  return ['tuck', 'topBottom', 'drawer'] as StructureId[];
}

export function dielineStats(d: Dieline) {
  const all = d.sheets.flatMap((s) => s.segments);
  return {
    sheets: d.sheets.length,
    cut: all.filter((s) => s.kind === 'cut').length,
    crease: all.filter((s) => s.kind === 'crease').length,
    bleedLines: all.filter((s) => s.kind === 'bleed').length,
    area: d.sheets.reduce((a, s) => a + s.width * s.height, 0),
  };
}
