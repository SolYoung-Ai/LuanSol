/* ============================================================
 * LunaSol 手绘笔触引擎 (hand-drawn stroke engine)
 * ------------------------------------------------------------
 * 目标：不要"标准 SVG 图标"，而要像设计师用黑色马克笔随手画的线。
 *
 * 手法：
 *  1. 确定性随机（同 seed 永远得到同一形状，渲染稳定不闪烁）
 *  2. 直线带轻微弓形（bow），端点轻微出头（overshoot）——手绘的强特征
 *  3. 曲线采样点做半径抖动 → Catmull-Rom 转三次贝塞尔（有机形状）
 *  4. 每个笔画是独立 path（单子路径），保证描边动画按元素精确计算
 *  5. 每个图形独立 seed → 风格统一但形状不重复
 * ============================================================ */

export type Rnd = () => number;

/** 确定性伪随机（mulberry32） */
export function makeRnd(seed: number): Rnd {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rr = (v: number) => Math.round(v * 100) / 100;

export interface StrokeOpt {
  /** 弓形强度：相对线长，0 = 笔直 */
  bow?: number;
  /** 端点出头：相对线长 */
  over?: number;
  /** 控制点抖动（px） */
  jit?: number;
}

/** 抖动一个点 */
function jp(rnd: Rnd, x: number, y: number, jit: number): number[] {
  return [x + (rnd() - 0.5) * 2 * jit, y + (rnd() - 0.5) * 2 * jit];
}

/**
 * 一条"手绘直线"：轻微弓形 + 端点出头 + 控制点抖动。
 * 端点出头是手绘最强的识别特征——真人在纸上画直线几乎不会正好停在转角。
 */
export function hLine(rnd: Rnd, x1: number, y1: number, x2: number, y2: number, o: StrokeOpt = {}): string {
  const bow = o.bow ?? 0.03;
  const over = o.over ?? 0.028;
  const jit = o.jit ?? 1.0;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;

  const o1 = len * over * (0.25 + rnd() * 1.35);
  const o2 = len * over * (0.25 + rnd() * 1.35);
  const ax = x1 - ux * o1, ay = y1 - uy * o1;
  const bx = x2 + ux * o2, by = y2 + uy * o2;

  // 弓形方向：垂直于线段，幅度随机正负
  const bowAmt = (rnd() - 0.5) * 2 * bow * len;
  const nx = -uy, ny = ux;

  const c1 = jp(rnd, ax + (bx - ax) * 0.27 + nx * bowAmt * 0.95, ay + (by - ay) * 0.27 + ny * bowAmt * 0.95, jit);
  const c2 = jp(rnd, ax + (bx - ax) * 0.74 + nx * bowAmt * 0.5, ay + (by - ay) * 0.74 + ny * bowAmt * 0.5, jit);

  return `M${rr(ax)} ${rr(ay)}C${rr(c1[0])} ${rr(c1[1])} ${rr(c2[0])} ${rr(c2[1])} ${rr(bx)} ${rr(by)}`;
}

/**
 * 折线：每一段独立成笔画。
 * 独立成笔画有两个好处：转角处自然出现"多画了一点"的重叠，
 * 且描边动画能逐段推进，而不是整条一起闪。
 */
export function hPoly(rnd: Rnd, pts: number[][], closed = false, o: StrokeOpt = {}): string[] {
  const jit = o.jit ?? 1.1;
  const p = pts.map(([x, y]) => jp(rnd, x, y, jit));
  const list = closed ? [...p, p[0]] : p;
  const out: string[] = [];
  for (let i = 0; i < list.length - 1; i++) {
    out.push(hLine(rnd, list[i][0], list[i][1], list[i + 1][0], list[i + 1][1], {
      ...o,
      over: (o.over ?? 0.028) * (i === 0 ? 1 : 0.35),
    }));
  }
  return out;
}

/** Catmull-Rom → 三次贝塞尔（闭合或开放） */
function catmull(pts: number[][], closed: boolean): string {
  const p = pts;
  const n = p.length;
  const get = (i: number) => (closed ? p[(i + n) % n] : p[Math.min(n - 1, Math.max(0, i))]);
  let d = `M${rr(p[0][0])} ${rr(p[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${rr(c1x)} ${rr(c1y)} ${rr(c2x)} ${rr(c2y)} ${rr(p2[0])} ${rr(p2[1])}`;
  }
  if (closed) d += 'Z';
  return d;
}

/** 有机闭合形状（平滑） */
export function hSmooth(rnd: Rnd, pts: number[][], closed = true, jit = 1.4): string {
  const p = pts.map(([x, y]) => jp(rnd, x, y, jit));
  return catmull(p, closed);
}

/**
 * 手绘椭圆 / 圆 —— 半径带随机起伏 + 采样点抖动，
 * 绝不会出现"正圆"这种一眼假的几何感。
 */
export function hEllipse(rnd: Rnd, cx: number, cy: number, rx: number, ry: number, o: StrokeOpt & { n?: number; wob?: number } = {}): string {
  const n = o.n ?? 9;
  const wob = o.wob ?? 0.07;
  const jit = o.jit ?? 1.3;
  const ph = rnd() * Math.PI * 2;
  const pts: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * Math.PI * 2;
    const k = 1 + (rnd() - 0.5) * 2 * wob;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return hSmooth(rnd, pts, true, jit);
}

/** 手绘弧线（角度制） */
export function hArc(rnd: Rnd, cx: number, cy: number, r: number, a0: number, a1: number, o: StrokeOpt & { n?: number; wob?: number } = {}): string {
  const n = o.n ?? 7;
  const wob = o.wob ?? 0.06;
  const jit = o.jit ?? 1.1;
  const pts: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const k = 1 + (rnd() - 0.5) * 2 * wob;
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]);
  }
  return hSmooth(rnd, pts, false, jit);
}

/** 手绘折线组（剪刀、铅笔等多段结构） */
export function hSegments(rnd: Rnd, segs: number[][][], o: StrokeOpt = {}): string[] {
  return segs.map((s) => hLine(rnd, s[0][0], s[0][1], s[1][0], s[1][1], o));
}

/** 手绘实心小点（墨点 / 眼睛 / 装饰） */
export function hDot(rnd: Rnd, cx: number, cy: number, r: number): string {
  const n = 7;
  const ph = rnd() * Math.PI * 2;
  const pts: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * Math.PI * 2;
    const k = 1 + (rnd() - 0.5) * 0.22;
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]);
  }
  return hSmooth(rnd, pts, true, 0.35);
}

/* ============================================================
 * 品牌角色「Luna」骨架
 * ------------------------------------------------------------
 * 一个简化但有个性的人物：偏瘦长比例（不是儿童头身比）、
 * 松弛的 T 恤轮廓、参差不齐的刘海、翘起的一撮短发。
 * 全站共用同一套骨架与五官。
 *
 * 造型要点（决定"像不像手绘"而不是"像图标"）：
 *  · 头是蛋形不是正圆，下巴略收、略偏
 *  · 躯干是一件"衣服"：肩比腰宽、下摆平直——绝不是连衣裙
 *  · 四肢是"有厚度的管子"（两条边 + 圆头端帽），而不是一根线
 *  · 手和脚是小体积的团块，末端明确；脚是能看出鞋头的形状
 *  · 眼睛是实心墨点，缩到图标尺寸也能认出来
 *  · 头发贴着颅骨长，刘海参差——不能变成一顶帽子
 * ============================================================ */

export type Face = 'smile' | 'focus' | 'joy' | 'think' | 'surprise';
export type Hair = 'short' | 'messy' | 'bun';

/** 与 doodle.tsx 的 Stroke 兼容的笔画描述 */
export interface PStroke { d: string; w?: number; o?: number; fill?: string; noDash?: boolean }

export interface Pose {
  /** 头心 */
  head: [number, number];
  /** 头半径 */
  hr: number;
  /** 颈根 */
  neck: [number, number];
  /** 胸/肩中点（脊柱参考） */
  chest: [number, number];
  /** 腰 */
  waist: [number, number];
  /** 胯 */
  hip: [number, number];
  /** 手臂：[肩, 肘, 手] */
  armL: [[number, number], [number, number], [number, number]];
  armR: [[number, number], [number, number], [number, number]];
  /** 腿：[胯, 膝, 脚] */
  legL: [[number, number], [number, number], [number, number]];
  legR: [[number, number], [number, number], [number, number]];
  /** 表情 */
  face?: Face;
  /** 头发 */
  hair?: Hair;
  /** 朝向：1 = 面朝右，-1 = 面朝左 */
  facing?: 1 | -1;
  /** 手臂画在身体前面（托下巴、抱东西时用） */
  armFront?: boolean;
}

type Pt = [number, number];

/** 圆头端帽：从 n 侧绕到 -n 侧（经过 +u 端点） */
function cap(c: Pt, u: Pt, n: Pt, r: number, steps = 3): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const phi = (i / steps) * Math.PI;
    out.push([
      c[0] + n[0] * r * Math.cos(phi) + u[0] * r * Math.sin(phi),
      c[1] + n[1] * r * Math.cos(phi) + u[1] * r * Math.sin(phi),
    ]);
  }
  return out;
}

/** 有厚度的肢体（两点直段）：两条边 + 两端圆帽 */
export function limb(rnd: Rnd, a: Pt, b: Pt, wa: number, wb: number): string {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const u: Pt = [dx / len, dy / len];
  const n: Pt = [-u[1], u[0]];
  const a1: Pt = [a[0] + n[0] * wa, a[1] + n[1] * wa];
  const a2: Pt = [a[0] - n[0] * wa, a[1] - n[1] * wa];
  const capB = cap(b, u, n, wb);
  const capA = cap(a, [-u[0], -u[1]], n, wa).reverse();
  const pts: Pt[] = [a1, capB[0], ...capB.slice(1), a2, ...capA.slice(1)];
  return hSmooth(rnd, pts, true, 0.5);
}

/** Catmull-Rom 采样：把折线变成光滑曲线 */
function sampleCurve(pts: Pt[], per: number): Pt[] {
  const n = pts.length;
  if (n < 2) return pts.slice();
  const out: Pt[] = [];
  const get = (i: number) => pts[Math.min(n - 1, Math.max(0, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}

/**
 * 沿弯折路径生成的连续锥形管（手臂 / 腿）。
 * 比"分段画线"自然：肘和膝不会鼓出球形关节。
 */
export function tubePath(rnd: Rnd, pts: Pt[], w0: number, w1: number): string {
  const dense = sampleCurve(pts, 6);
  const n = dense.length;
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = dense[Math.max(0, i - 1)], b = dense[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const w = w0 + (w1 - w0) * t;
    left.push([dense[i][0] - (dy / l) * w, dense[i][1] + (dx / l) * w]);
    right.push([dense[i][0] + (dy / l) * w, dense[i][1] - (dx / l) * w]);
  }
  const e = dense[n - 1], eP = dense[n - 2];
  const el = Math.hypot(e[0] - eP[0], e[1] - eP[1]) || 1;
  const eu: Pt = [(e[0] - eP[0]) / el, (e[1] - eP[1]) / el];
  const en: Pt = [-eu[1], eu[0]];
  const capE: Pt[] = [];
  for (let i = 1; i < 4; i++) {
    const phi = (i / 4) * Math.PI;
    capE.push([
      e[0] + en[0] * w1 * Math.cos(phi) + eu[0] * w1 * Math.sin(phi),
      e[1] + en[1] * w1 * Math.cos(phi) + eu[1] * w1 * Math.sin(phi),
    ]);
  }
  const s = dense[0], sN = dense[1];
  const sl = Math.hypot(s[0] - sN[0], s[1] - sN[1]) || 1;
  const su: Pt = [(s[0] - sN[0]) / sl, (s[1] - sN[1]) / sl];
  const sn: Pt = [-su[1], su[0]];
  const capS: Pt[] = [];
  for (let i = 1; i < 4; i++) {
    const phi = (i / 4) * Math.PI;
    capS.push([
      s[0] + sn[0] * w0 * Math.cos(phi) + su[0] * w0 * Math.sin(phi),
      s[1] + sn[1] * w0 * Math.cos(phi) + su[1] * w0 * Math.sin(phi),
    ]);
  }
  // 注意：端帽首尾与左右边重复，必须去掉，否则 Catmull-Rom 会出现零长段而剧烈过冲
  const outline: Pt[] = [
    ...left,
    ...capE.slice(1),
    ...right.reverse().slice(1),
    ...capS.slice(1),
  ];
  return hSmooth(rnd, outline, true, 0.4);
}

/** 手：小团块 */
function hand(rnd: Rnd, w: Pt, r: number): string {
  const pts: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const k = 1 + (rnd() - 0.5) * 0.3;
    pts.push([w[0] + Math.cos(a) * r * k * 1.08, w[1] + Math.sin(a) * r * k]);
  }
  return hSmooth(rnd, pts, true, 0.35);
}

/**
 * 脚：一只有鞋头的鞋 + 一道鞋底线。
 * 之前只是一小段胶囊，远看像一个点，人就"站不住"。
 */
function shoe(rnd: Rnd, ankle: Pt, dir: 1 | -1, len: number, w: number): string[] {
  const hx = ankle[0], hy = ankle[1];
  const toeX = hx + dir * len;
  const toeY = hy + len * 0.16;
  const body: Pt[] = [
    [hx - dir * len * 0.28, hy - w * 1.1],
    [hx + dir * len * 0.34, hy - w * 0.8],
    [hx + dir * len * 0.78, hy - w * 0.22],
    [toeX, toeY - w * 0.05],
    [toeX + dir * len * 0.03, toeY + w * 0.58],
    [hx - dir * len * 0.32, hy + w * 0.62],
  ];
  return [
    hSmooth(rnd, body, true, 0.42),
    hLine(rnd, hx - dir * len * 0.32, hy + w * 0.62, toeX + dir * len * 0.03, toeY + w * 0.58, { bow: 0.06, over: 0.02 }),
  ];
}

/**
 * 膝盖位置校正。
 * 姿势数据里的膝盖常常被随手写低，导致"大腿过长、小腿过短"的竹竿腿。
 * 规则：站姿时把膝盖拉回髋→踝的 52% 处；
 *      只有明显折叠的腿（跑、跨步）才保留作者给的膝盖。
 */
function kneeOf(hip: Pt, knee: Pt, ankle: Pt): Pt {
  const span = Math.abs(ankle[1] - hip[1]);
  if (span < 1) return knee;
  const derived = hip[1] + (ankle[1] - hip[1]) * 0.52;
  if (Math.abs(knee[1] - derived) > span * 0.3) return knee;
  return [knee[0], derived];
}

/* ============================================================
 * 角色绘制
 * ============================================================ */

/** 画一个人：返回若干条独立笔画 */
export function drawPerson(rnd: Rnd, p: Pose, opt: { w?: number } = {}): PStroke[] {
  const out: PStroke[] = [];
  const W = opt.w ?? 3.0;
  const [hx, hy] = p.head;
  const hr = p.hr;
  const facing: 1 | -1 = p.facing ?? (p.hip[0] < hx ? -1 : 1);

  /* ---------- 规范比例：全部由头半径推导 ----------
     肩比腰宽、衣摆平直——这是一件松垮的 T 恤，不是连衣裙。
     姿势只负责脊柱的倾斜与手脚的落点。 */
  const shw = hr * 1.34;   // 肩半宽
  const chw = hr * 1.16;   // 胸半宽
  const wsw = hr * 1.06;   // 腰半宽（几乎不收腰）
  const hpw = hr * 1.10;   // 胯半宽
  const hw = hr * 1.12;    // 衣摆半宽
  const shY = p.chest[1] + 4;
  const hemY = p.hip[1] + hr * 0.55;
  const neckY = Math.max(p.neck[1], hy + hr * 1.32);
  const neckX = p.neck[0];

  const hipL: Pt = [p.hip[0] - hpw * 0.46, p.hip[1] + hr * 0.06];
  const hipR: Pt = [p.hip[0] + hpw * 0.46, p.hip[1] + hr * 0.06];

  /* ---------- 腿（画在最底层）：胯→膝→踝 一条连续的锥形管 ---------- */
  const legs: [Pt, Pt, Pt][] = [
    [hipL, kneeOf(hipL, p.legL[1], p.legL[2]), p.legL[2]],
    [hipR, kneeOf(hipR, p.legR[1], p.legR[2]), p.legR[2]],
  ];
  for (const [hip, knee, ankle] of legs) {
    out.push({ d: tubePath(rnd, [hip, knee, ankle], hr * 0.5, hr * 0.27), w: W });
    for (const s of shoe(rnd, ankle, facing, hr * 0.62, hr * 0.3)) out.push({ d: s, w: W * 0.92 });
  }

  /* ---------- 手臂：肩→肘→腕 一条连续的锥形管 ---------- */
  // 起点藏在躯干轮廓内，胳膊才像是"从肩膀下面长出来"，而不是外挂一根
  const shL: Pt = [p.chest[0] - shw * 0.56, shY + hr * 0.12];
  const shR: Pt = [p.chest[0] + shw * 0.56, shY + hr * 0.12];
  const armStrokes = (): PStroke[] => {
    const a: PStroke[] = [];
    const arms: [Pt, Pt, Pt][] = [[shL, p.armL[1], p.armL[2]], [shR, p.armR[1], p.armR[2]]];
    for (const [sh, el, wr] of arms) {
      a.push({ d: tubePath(rnd, [sh, el, wr], hr * 0.38, hr * 0.2), w: W });
      a.push({ d: hand(rnd, wr, hr * 0.21), w: W });
    }
    return a;
  };
  if (!p.armFront) out.push(...armStrokes());

  /* ---------- 躯干：一件松垮的 T 恤 ---------- */
  const torso: Pt[] = [
    [neckX - hr * 0.52, neckY],                                     // 领口左
    [p.chest[0] - shw * 0.8, shY - hr * 0.16],                      // 左斜肩
    [p.chest[0] - shw, shY + hr * 0.02],                            // 左肩点
    [p.chest[0] - chw * 0.99, p.chest[1] + hr * 1.06],              // 左腋下
    [p.waist[0] - wsw, p.waist[1]],                                 // 左腰
    [p.hip[0] - hpw, p.hip[1] - hr * 0.06],                         // 左胯
    [p.hip[0] - hw, hemY],                                          // 左衣摆角
    [p.hip[0] - hw * 0.34, hemY + hr * 0.03],                       // 下摆
    [p.hip[0] + hw * 0.34, hemY + hr * 0.03],
    [p.hip[0] + hw, hemY],                                          // 右衣摆角
    [p.hip[0] + hpw, p.hip[1] - hr * 0.06],
    [p.waist[0] + wsw, p.waist[1]],
    [p.chest[0] + chw * 0.99, p.chest[1] + hr * 1.06],
    [p.chest[0] + shw, shY + hr * 0.02],
    [p.chest[0] + shw * 0.8, shY - hr * 0.16],
    [neckX + hr * 0.52, neckY],                                     // 领口右
  ];
  out.push({ d: hSmooth(rnd, torso, true, 0.85), w: W });
  // 圆领
  out.push({
    d: hArc(rnd, neckX, neckY + hr * 0.04, hr * 0.58, Math.PI * 0.16, Math.PI * 0.84, { n: 5, wob: 0.09 }),
    w: W * 0.82,
  });

  /* ---------- 脖子 ---------- */
  out.push({ d: hLine(rnd, hx - hr * 0.34, hy + hr * 0.68, neckX - hr * 0.24, neckY + 1, { bow: 0.05, over: 0.01 }), w: W * 0.9 });
  out.push({ d: hLine(rnd, hx + hr * 0.34, hy + hr * 0.68, neckX + hr * 0.24, neckY + 1, { bow: 0.05, over: 0.01 }), w: W * 0.9 });

  /* ---------- 头：蛋形（下巴略收、略偏） ---------- */
  const headPts: Pt[] = [
    [hx - hr * 0.99, hy - hr * 0.12],
    [hx - hr * 0.87, hy - hr * 0.62],
    [hx - hr * 0.44, hy - hr * 0.97],
    [hx + hr * 0.12, hy - hr * 1.04],
    [hx + hr * 0.66, hy - hr * 0.84],
    [hx + hr * 0.96, hy - hr * 0.22],
    [hx + hr * 0.79, hy + hr * 0.44],
    [hx + hr * 0.33, hy + hr * 0.87],
    [hx - hr * 0.22, hy + hr * 0.95],
    [hx - hr * 0.73, hy + hr * 0.55],
  ];
  out.push({ d: hSmooth(rnd, headPts, true, 0.7), w: W });

  /* ---------- 耳朵（背向一侧露出来，给侧脸一点厚度） ---------- */
  const earX = hx - facing * hr * 0.88;
  out.push({
    d: hArc(rnd, earX, hy + hr * 0.2, hr * 0.17, Math.PI * 0.55, Math.PI * 1.5, { n: 4, wob: 0.12 }),
    w: W * 0.75,
  });

  /* ---------- 头发：外轮廓 + 一条参差的刘海 ----------
     关键：不要把头发画成一个闭合的"帽壳"。
     闭合形状的下缘会被平滑成一道弧线，一眼就是帽檐。
     正确做法是——外轮廓一笔（从左鬓角绕过头顶到右鬓角），
     刘海另外一笔，画成参差不齐的折线。 */
  const hair = p.hair ?? 'short';
  const hairOuter: Pt[] = [
    [hx - hr * 1.0, hy + hr * 0.12],
    [hx - hr * 1.0, hy - hr * 0.42],
    [hx - hr * 0.84, hy - hr * 0.82],
    [hx - hr * 0.48, hy - hr * 1.04],
    [hx - hr * 0.08, hy - hr * 1.1],
    [hx + hr * 0.34, hy - hr * 1.0],
    [hx + hr * 0.68, hy - hr * 0.86],
    [hx + hr * 0.92, hy - hr * 0.5],
    [hx + hr * 1.0, hy - hr * 0.1],
  ];
  out.push({ d: hSmooth(rnd, hairOuter, false, 0.55), w: W });
  // 刘海：横过额头的参差折线（不是圆弧）
  const bangs: Pt[] = hair === 'messy'
    ? [
      [hx + hr * 0.94, hy - hr * 0.14],
      [hx + hr * 0.58, hy + hr * 0.04],
      [hx + hr * 0.26, hy - hr * 0.22],
      [hx - hr * 0.06, hy + hr * 0.08],
      [hx - hr * 0.4, hy - hr * 0.2],
      [hx - hr * 0.72, hy - hr * 0.02],
      [hx - hr * 0.94, hy - hr * 0.2],
    ]
    : [
      [hx + hr * 0.92, hy - hr * 0.16],
      [hx + hr * 0.52, hy - hr * 0.02],
      [hx + hr * 0.1, hy - hr * 0.18],
      [hx - hr * 0.32, hy - hr * 0.04],
      [hx - hr * 0.7, hy - hr * 0.2],
      [hx - hr * 0.92, hy - hr * 0.12],
    ];
  out.push({ d: hPoly(rnd, bangs, false, { bow: 0.02, jit: 0.5, over: 0.012 }).join(' '), w: W * 0.92 });
  // 发丝：两三笔暗示头发的体积
  out.push({
    d: hSmooth(rnd, [[hx - hr * 0.66, hy - hr * 0.7], [hx - hr * 0.3, hy - hr * 0.84], [hx + hr * 0.08, hy - hr * 0.7]], false, 0.45),
    w: W * 0.58,
    o: 0.85,
  });
  out.push({
    d: hSmooth(rnd, [[hx - hr * 0.16, hy - hr * 0.94], [hx + hr * 0.2, hy - hr * 0.92], [hx + hr * 0.5, hy - hr * 0.76]], false, 0.45),
    w: W * 0.55,
    o: 0.75,
  });
  if (hair === 'messy') {
    // 头顶翘起来的两撮小发束
    out.push({
      d: hPoly(rnd, [[hx - hr * 0.4, hy - hr * 1.02], [hx - hr * 0.32, hy - hr * 1.3], [hx - hr * 0.1, hy - hr * 1.16]], false, { bow: 0.04, jit: 0.5 }).join(' '),
      w: W * 0.88,
    });
    out.push({
      d: hPoly(rnd, [[hx + hr * 0.16, hy - hr * 1.02], [hx + hr * 0.28, hy - hr * 1.32], [hx + hr * 0.48, hy - hr * 1.12]], false, { bow: 0.04, jit: 0.5 }).join(' '),
      w: W * 0.88,
    });
    // 一撮呆毛
    out.push({
      d: hSmooth(rnd, [
        [hx + hr * 0.18, hy - hr * 1.16],
        [hx + hr * 0.44, hy - hr * 1.44],
        [hx + hr * 0.66, hy - hr * 1.32],
      ], false, 0.5),
      w: W * 0.9,
    });
  }
  if (hair === 'bun') {
    // 丸子头（在朝向的反侧，靠后脑勺）
    const bx = hx - facing * hr * 1.24;
    const by = hy - hr * 0.72;
    out.push({ d: hEllipse(rnd, bx, by, hr * 0.3, hr * 0.28, { n: 9, wob: 0.1, jit: 0.6 }), w: W * 0.95 });
  }

  /* ---------- 五官 ---------- */
  const f = p.face ?? 'smile';
  const ey = hy + hr * 0.16;
  const ex = hr * 0.32;
  if (f === 'joy') {
    // 弯成月牙的开心眼
    out.push({ d: hArc(rnd, hx - ex, ey + hr * 0.08, hr * 0.24, Math.PI * 1.06, Math.PI * 1.94, { n: 5, wob: 0.06 }), w: W * 0.85 });
    out.push({ d: hArc(rnd, hx + ex, ey + hr * 0.08, hr * 0.24, Math.PI * 1.06, Math.PI * 1.94, { n: 5, wob: 0.06 }), w: W * 0.85 });
  } else if (f === 'focus' || f === 'think') {
    // 低头看的短横眼
    out.push({ d: hLine(rnd, hx - ex - 1.9, ey, hx - ex + 1.9, ey, { over: 0.02 }), w: W * 0.9 });
    out.push({ d: hLine(rnd, hx + ex - 1.9, ey, hx + ex + 1.9, ey, { over: 0.02 }), w: W * 0.9 });
  } else if (f === 'surprise') {
    out.push({ d: hEllipse(rnd, hx - ex, ey, hr * 0.15, hr * 0.19, { n: 8, wob: 0.1, jit: 0.4 }), w: W * 0.8 });
    out.push({ d: hEllipse(rnd, hx + ex, ey, hr * 0.15, hr * 0.19, { n: 8, wob: 0.1, jit: 0.4 }), w: W * 0.8 });
  } else {
    // 实心墨点眼
    out.push({ d: hDot(rnd, hx - ex, ey, hr * 0.085), w: W * 0.9, fill: 'currentColor' });
    out.push({ d: hDot(rnd, hx + ex, ey, hr * 0.085), w: W * 0.9, fill: 'currentColor' });
  }
  // 嘴
  if (f === 'joy') {
    out.push({ d: hArc(rnd, hx, hy + hr * 0.48, hr * 0.32, Math.PI * 0.08, Math.PI * 0.92, { n: 6, wob: 0.06 }), w: W * 0.85 });
  } else if (f === 'think') {
    out.push({ d: hLine(rnd, hx - hr * 0.16, hy + hr * 0.6, hx + hr * 0.14, hy + hr * 0.56, { bow: 0.12, over: 0.02 }), w: W * 0.85 });
  } else if (f === 'surprise') {
    out.push({ d: hEllipse(rnd, hx, hy + hr * 0.58, hr * 0.14, hr * 0.18, { n: 8, wob: 0.08, jit: 0.35 }), w: W * 0.8 });
  } else {
    out.push({ d: hArc(rnd, hx, hy + hr * 0.42, hr * 0.28, Math.PI * 0.12, Math.PI * 0.88, { n: 6, wob: 0.07 }), w: W * 0.85 });
  }

  /* ---------- 手臂画在身体前面（托下巴 / 抱东西） ---------- */
  if (p.armFront) out.push(...armStrokes());

  return out;
}
