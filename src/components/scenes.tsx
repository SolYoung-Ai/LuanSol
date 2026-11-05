import React from 'react';
import { makeRnd, hLine, hPoly, hEllipse, hArc, hDot, hSmooth, limb, drawPerson, type Pose, type Rnd } from './hand';
import { Ink, type DProps } from './doodle';

/** 场景内部使用的笔画描述 */
interface S { d: string; w?: number; o?: number; fill?: string }

/* ============================================================
 * LunaSol 叙事场景 (narrative scenes)
 * ------------------------------------------------------------
 * 每一幅都是"有故事的画面"，而不是几个独立小图标的拼贴：
 *   A 桌前创作 —— 人物伏案，剪刀、纸张、盒子和草稿都在同一张桌子上
 *   B 开箱惊喜 —— 巨大的纸盒被打开，星星、植物和图案从里面冒出来
 *   C 抱着奔跑 —— 人物抱着包装盒跑，后面拖一串不规则涂鸦
 *   D 笔变成盒 —— 人物握笔作画，线条一路延伸长成真正的包装盒
 * ============================================================ */

const cache = new Map<string, S[]>();
function build(key: string, fn: (r: Rnd) => S[]): S[] {
  let v = cache.get(key);
  if (!v) { v = fn(makeRnd(hash(key))); cache.set(key, v); }
  return v;
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------- 通用零件 ---------- */

/** 制图工作台：一块有厚度的台面 + 两条外八的桌腿 */
function table(r: Rnd, x: number, y: number, w: number, depth: number, legH: number): S[] {
  const out: S[] = [];
  // 台面板（带轻微起伏）
  out.push(...hPoly(r, [[x, y], [x + w, y - 1], [x + w, y + depth], [x, y + depth + 1]], true, { bow: 0.012, jit: 0.7 }).map(d => ({ d, w: 2.9 })));
  // 前沿高光线
  out.push({ d: hLine(r, x + 3, y + depth, x + w - 3, y + depth - 1, { bow: 0.01, over: 0.005 }), w: 2.2 });
  // 桌腿（略带弧度、外八）
  out.push(...hPoly(r, [[x + 16, y + depth], [x + 9, y + depth + legH * 0.55], [x + 13, y + depth + legH]], false, { bow: 0.03, jit: 0.7 }).map(d => ({ d, w: 2.6 })));
  out.push(...hPoly(r, [[x + w - 16, y + depth], [x + w - 9, y + depth + legH * 0.55], [x + w - 13, y + depth + legH]], false, { bow: 0.03, jit: 0.7 }).map(d => ({ d, w: 2.6 })));
  return out;
}

/** 小纸盒（等轴测） */
function smallBox(r: Rnd, x: number, y: number, w: number, h: number, lw = 2.8): S[] {
  const d = h * 0.42;
  return [
    ...hPoly(r, [[x, y + d], [x + w / 2, y], [x + w, y + d]], false, { bow: 0.04 }).map(p => ({ d: p, w: lw })),
    ...hPoly(r, [[x, y + d], [x, y + h], [x + w / 2, y + h + d]], false, { bow: 0.04 }).map(p => ({ d: p, w: lw })),
    ...hPoly(r, [[x + w, y + d], [x + w, y + h], [x + w / 2, y + h + d]], false, { bow: 0.04 }).map(p => ({ d: p, w: lw })),
    ...hPoly(r, [[x, y + d], [x + w / 2, y + d * 2], [x + w, y + d]], false, { bow: 0.05 }).map(p => ({ d: p, w: lw })),
  ];
}

/** 摊在桌上的草图纸 */
function sketchSheet(r: Rnd, x: number, y: number, w: number, h: number): S[] {
  const out: S[] = [];
  out.push(...hPoly(r, [[x, y + 4], [x + w - 3, y], [x + w, y + h - 3], [x + 3, y + h]], true, { bow: 0.025, jit: 0.6 }).map(d => ({ d, w: 2.3 })));
  // 纸上画着的一个小盒草稿
  const bx = x + w * 0.18, by = y + h * 0.28, bw = w * 0.34, bh = h * 0.4;
  out.push(...hPoly(r, [[bx, by + 3], [bx + bw / 2, by], [bx + bw, by + 3]], false, { bow: 0.05 }).map(d => ({ d, w: 1.9 })));
  out.push(...hPoly(r, [[bx, by + 3], [bx, by + bh], [bx + bw / 2, by + bh + 3]], false, { bow: 0.05 }).map(d => ({ d, w: 1.9 })));
  out.push(...hPoly(r, [[bx + bw, by + 3], [bx + bw, by + bh], [bx + bw / 2, by + bh + 3]], false, { bow: 0.05 }).map(d => ({ d, w: 1.9 })));
  out.push({ d: hLine(r, x + w * 0.62, y + h * 0.42, x + w * 0.86, y + h * 0.36, { bow: 0.1 }), w: 1.8 });
  return out;
}

function star(r: Rnd, cx: number, cy: number, R: number, w = 2.7): S {
  const pts: number[][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : R * 0.42;
    pts.push([cx + Math.cos(a) * rad * (1 + (r() - 0.5) * 0.14), cy + Math.sin(a) * rad * (1 + (r() - 0.5) * 0.14)]);
  }
  return { d: hPoly(r, pts, true, { bow: 0.03, jit: 0.7 }).join(' '), w };
}

function leaf(r: Rnd, cx: number, cy: number, R: number, ang: number, w = 2.5): S[] {
  const c = Math.cos(ang), s = Math.sin(ang);
  const p = (x: number, y: number) => [cx + x * c - y * s, cy + x * s + y * c] as [number, number];
  const a = p(-R, 0), b = p(0, -R * 0.62), c2 = p(R, 0), d = p(0, R * 0.62);
  return [
    { d: hSmooth(r, [a, b, c2, d], true, 0.9), w },
    { d: hLine(r, a[0], a[1], c2[0], c2[1], { bow: 0.05 }), w: w - 0.6 },
  ];
}

function flower(r: Rnd, cx: number, cy: number, R: number, w = 2.4): S[] {
  const out: S[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
    out.push({ d: hEllipse(r, cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62, R * 0.34, R * 0.28, { n: 7, wob: 0.15, jit: 0.6 }), w });
  }
  out.push({ d: hDot(r, cx, cy, R * 0.24), w: w - 0.4, fill: 'currentColor' });
  return out;
}

function squiggle(r: Rnd, x: number, y: number, len: number, w = 2.3): S {
  const pts: number[][] = [];
  const n = Math.max(3, Math.round(len / 14));
  for (let i = 0; i <= n; i++) {
    pts.push([x + (len * i) / n, y + Math.sin(i * 1.9 + r() * 0.6) * (5 + r() * 4)]);
  }
  return { d: hPoly(r, pts, false, { bow: 0.05, jit: 0.9 }).join(' '), w };
}

function sparkle(r: Rnd, cx: number, cy: number, R: number, w = 2.4): S {
  const pts: number[][] = [
    [cx, cy - R], [cx + R * 0.26, cy - R * 0.26], [cx + R, cy],
    [cx + R * 0.26, cy + R * 0.26], [cx, cy + R], [cx - R * 0.26, cy + R * 0.26],
    [cx - R, cy], [cx - R * 0.26, cy - R * 0.26],
  ];
  return { d: hPoly(r, pts, true, { bow: 0.05, jit: 0.7 }).join(' '), w };
}

/** 一支笔（笔杆 + 笔尖墨点） */
function pencil(r: Rnd, x1: number, y1: number, x2: number, y2: number, w = 2.6): S[] {
  return [
    { d: hLine(r, x1, y1, x2, y2, { bow: 0.04, over: 0.01 }), w },
    { d: hDot(r, x2, y2, 3.2), w: w - 0.3, fill: 'currentColor' },
  ];
}

/* ============================================================
 * 场景 A：桌前创作
 * ============================================================ */
export function SceneStudio(p: DProps) {
  const s = build('scene-studio', r => {
    const out: S[] = [];
    // 地面
    out.push({ d: hLine(r, 16, 322, 404, 318, { bow: 0.012, over: 0.004 }), w: 2.4 });
    // 工作台
    out.push(...table(r, 92, 224, 248, 18, 82));
    // 草图纸
    out.push(...sketchSheet(r, 158, 206, 118, 30));
    // 剪刀
    out.push(...hPoly(r, [[286, 210], [324, 199]], false, { bow: 0.04 }).map(d => ({ d, w: 2.4 })));
    out.push(...hPoly(r, [[292, 218], [330, 207]], false, { bow: 0.04 }).map(d => ({ d, w: 2.4 })));
    out.push({ d: hEllipse(r, 284, 220, 9.5, 7.5, { n: 8, wob: 0.1 }), w: 2.2 });
    out.push({ d: hEllipse(r, 296, 229, 9.5, 7.5, { n: 8, wob: 0.1 }), w: 2.2 });
    // 胶带
    out.push({ d: hEllipse(r, 122, 216, 19, 8.5, { n: 8, wob: 0.09 }), w: 2.4 });
    out.push({ d: hEllipse(r, 122, 216, 8.5, 3.8, { n: 7, wob: 0.12 }), w: 2 });
    // 立着的小盒
    out.push(...smallBox(r, 312, 172, 40, 34, 2.5));

    // 人物：站在工作台后俯身作画
    const pose: Pose = {
      head: [240, 92], hr: 25,
      neck: [239, 120], chest: [238, 140], waist: [232, 168], hip: [228, 196],
      armL: [[210, 148], [196, 178], [208, 210]],
      armR: [[266, 146], [278, 174], [262, 204]],
      legL: [[218, 196], [210, 248], [202, 304]],
      legR: [[240, 196], [252, 248], [262, 302]],
      face: 'focus', hair: 'messy', facing: 1,
    };
    out.push(...drawPerson(r, pose, { w: 3 }));
    // 手里的笔，笔尖落在纸上
    out.push(...pencil(r, 258, 208, 226, 220));
    // 头顶的灵感小圈
    out.push({ d: hEllipse(r, 272, 64, 9, 7.5, { n: 7, wob: 0.13 }), w: 2.1 });
    out.push(star(r, 296, 42, 11, 2.3));
    return out;
  });
  return <Ink vb="0 0 420 340" strokes={s} {...p} />;
}

/* ============================================================
 * 场景 B：打开巨大的纸盒，创意从里面冒出来
 * ============================================================ */
export function SceneBigBox(p: DProps) {
  const s = build('scene-bigbox', r => {
    const out: S[] = [];
    // 地面
    out.push({ d: hLine(r, 16, 302, 404, 298, { bow: 0.012, over: 0.004 }), w: 2.4 });
    // 巨大的盒子（下半）
    const bx = 168, by = 182, bw = 172, bh = 102;
    out.push(...hPoly(r, [[bx, by + 22], [bx + bw / 2, by], [bx + bw, by + 22]], false, { bow: 0.035 }).map(d => ({ d, w: 3.2 })));
    out.push(...hPoly(r, [[bx, by + 22], [bx, by + bh], [bx + bw / 2, by + bh + 22]], false, { bow: 0.035 }).map(d => ({ d, w: 3.2 })));
    out.push(...hPoly(r, [[bx + bw, by + 22], [bx + bw, by + bh], [bx + bw / 2, by + bh + 22]], false, { bow: 0.035 }).map(d => ({ d, w: 3.2 })));
    out.push(...hPoly(r, [[bx, by + 22], [bx + bw / 2, by + 44], [bx + bw, by + 22]], false, { bow: 0.05 }).map(d => ({ d, w: 3 })));
    // 掀开的箱盖
    out.push(...hPoly(r, [[bx, by + 22], [bx - 34, by - 30], [bx + 6, by - 52], [bx + bw / 2, by]], false, { bow: 0.05 }).map(d => ({ d, w: 2.9 })));
    out.push(...hPoly(r, [[bx + bw, by + 22], [bx + bw + 36, by - 28], [bx + bw - 4, by - 52], [bx + bw / 2, by]], false, { bow: 0.05 }).map(d => ({ d, w: 2.9 })));

    // 人物：站在盒子左侧，俯身把盖子掀开
    const pose: Pose = {
      head: [74, 112], hr: 24,
      neck: [80, 140], chest: [88, 158], waist: [100, 184], hip: [112, 208],
      armL: [[62, 166], [42, 154], [34, 128]],
      armR: [[114, 160], [134, 146], [146, 120]],
      legL: [[102, 208], [92, 250], [82, 292]],
      legR: [[124, 206], [136, 248], [148, 290]],
      face: 'joy', hair: 'short', facing: 1,
    };
    out.push(...drawPerson(r, pose, { w: 3 }));
    // 从盒里冒出来的创意
    out.push(star(r, 214, 108, 19, 2.8));
    out.push(star(r, 288, 78, 13, 2.4));
    out.push(sparkle(r, 330, 132, 12, 2.3));
    out.push(...leaf(r, 180, 72, 21, -0.7, 2.5));
    out.push(...leaf(r, 258, 44, 16, 0.5, 2.3));
    out.push(...flower(r, 316, 66, 13, 2.2));
    out.push(squiggle(r, 166, 134, 50, 2.1));
    out.push(squiggle(r, 292, 30, 42, 2));
    out.push({ d: hDot(r, 140, 58, 3.6), w: 2.2, fill: 'currentColor' });
    out.push({ d: hDot(r, 356, 104, 3), w: 2, fill: 'currentColor' });
    return out;
  });
  return <Ink vb="0 0 420 320" strokes={s} {...p} />;
}

/* ============================================================
 * 场景 C：抱着包装盒奔跑，后面拖一串涂鸦
 * ============================================================ */
export function SceneRun(p: DProps) {
  const s = build('scene-run', r => {
    const out: S[] = [];
    // 地面（带速度感的弧线）
    out.push({ d: hLine(r, 14, 268, 402, 264, { bow: 0.012, over: 0.004 }), w: 2.4 });
    // 身后拖的涂鸦尾迹
    out.push(squiggle(r, 24, 198, 60, 2.3));
    out.push(squiggle(r, 42, 152, 46, 2.1));
    out.push({ d: hEllipse(r, 50, 228, 13, 11, { n: 9, wob: 0.12 }), w: 2.1 });
    out.push(star(r, 34, 106, 12, 2.2));
    out.push(sparkle(r, 80, 76, 10, 2));
    out.push({ d: hDot(r, 20, 152, 3.4), w: 2, fill: 'currentColor' });
    // 速度线
    out.push({ d: hLine(r, 116, 120, 162, 114, { bow: 0.06, over: 0.01 }), w: 2 });
    out.push({ d: hLine(r, 130, 142, 172, 138, { bow: 0.06, over: 0.01 }), w: 1.9 });

    // 人物：向前奔跑，怀里抱着盒子
    const pose: Pose = {
      head: [248, 84], hr: 25,
      neck: [254, 112], chest: [260, 130], waist: [268, 168], hip: [274, 198],
      armL: [[226, 140], [208, 166], [232, 188]],
      armR: [[294, 134], [312, 158], [290, 184]],
      legL: [[266, 198], [228, 220], [182, 210]],
      legR: [[282, 196], [316, 220], [356, 252]],
      face: 'joy', hair: 'messy', facing: 1,
    };
    out.push(...drawPerson(r, pose, { w: 3 }));
    // 怀里的盒子
    out.push(...smallBox(r, 228, 140, 68, 48, 2.9));
    // 盒子上冒出的创意小元素
    out.push(star(r, 264, 116, 12, 2.3));
    out.push(squiggle(r, 296, 128, 32, 2));
    out.push({ d: hDot(r, 230, 114, 3), w: 2, fill: 'currentColor' });
    return out;
  });
  return <Ink vb="0 0 420 300" strokes={s} {...p} />;
}

/* ============================================================
 * 场景 D：握笔作画，线条一路长成真正的包装盒
 * ============================================================ */
export function SceneSketch(p: DProps) {
  const s = build('scene-sketch', r => {
    const out: S[] = [];
    out.push({ d: hLine(r, 16, 268, 402, 264, { bow: 0.012, over: 0.004 }), w: 2.4 });
    // 人物：站着握笔
    const pose: Pose = {
      head: [86, 96], hr: 26,
      neck: [90, 126], chest: [94, 146], waist: [100, 184], hip: [104, 214],
      armL: [[68, 154], [50, 180], [64, 208]],
      armR: [[124, 150], [140, 164], [160, 182]],
      legL: [[96, 214], [90, 238], [86, 262]],
      legR: [[114, 214], [118, 238], [122, 262]],
      face: 'focus', hair: 'short', facing: 1,
    };
    out.push(...drawPerson(r, pose, { w: 3 }));
    // 笔
    out.push(...pencil(r, 162, 184, 182, 194));
    // 从笔尖延伸的线：先是波浪，然后逐渐立起来变成盒子
    const pts: number[][] = [];
    for (let i = 0; i <= 9; i++) {
      const t = i / 9;
      const x = 184 + t * 74;
      const y = 196 - Math.pow(t, 1.7) * 96 + Math.sin(i * 1.4) * 5;
      pts.push([x, y]);
    }
    out.push({ d: hPoly(r, pts, false, { bow: 0.05, jit: 0.9 }).join(' '), w: 2.7 });
    // 线最终变成的包装盒
    out.push(...smallBox(r, 258, 90, 92, 62, 3.1));
    // 盒子上的一点标注
    out.push({ d: hLine(r, 266, 120, 324, 120, { bow: 0.07 }), w: 2 });
    out.push({ d: hLine(r, 304, 98, 304, 146, { bow: 0.05, over: 0.01 }), w: 2 });
    // 零散涂鸦
    out.push(star(r, 340, 44, 13, 2.4));
    out.push({ d: hDot(r, 228, 60, 3.4), w: 2.2, fill: 'currentColor' });
    out.push(sparkle(r, 190, 72, 9, 2));
    return out;
  });
  return <Ink vb="0 0 420 300" strokes={s} {...p} />;
}

/* ============================================================
 * 首页主视觉：一整幅跨栏的宽场景
 * 左边留白给标题，右边是正在发生的工作台，最右边是打开的大盒子
 * ============================================================ */
export function HeroScene(p: DProps) {
  const s = build('hero-scene', r => {
    const out: S[] = [];

    /* ---------- 地面 ---------- */
    out.push({ d: hLine(r, 6, 448, 1394, 443, { bow: 0.008, over: 0.003 }), w: 2.6 });

    /* ---------- 工作台（人物右手边，人物全身可见） ---------- */
    out.push(...table(r, 566, 262, 416, 20, 166));

    /* ---------- 主角：站在工作台旁，一手按纸一手握笔 ---------- */
    const pose: Pose = {
      head: [498, 138], hr: 29,
      neck: [500, 174], chest: [498, 194], waist: [492, 234], hip: [488, 272],
      armL: [[462, 202], [448, 234], [462, 258]],
      armR: [[534, 200], [558, 230], [588, 254]],
      legL: [[468, 340], [458, 390], [450, 430]],
      legR: [[512, 338], [522, 388], [528, 428]],
      face: 'focus', hair: 'messy', facing: 1,
    };
    out.push(...drawPerson(r, pose, { w: 3.1 }));
    // 手里的笔，笔尖落在纸面上
    out.push(...pencil(r, 592, 256, 616, 262, 2.7));

    /* ---------- 台面上的东西 ---------- */
    // 草图纸
    out.push(...sketchSheet(r, 596, 240, 116, 26));
    // 剪刀
    out.push(...hPoly(r, [[742, 246], [778, 236]], false, { bow: 0.04 }).map(d => ({ d, w: 2.3 })));
    out.push(...hPoly(r, [[748, 253], [784, 243]], false, { bow: 0.04 }).map(d => ({ d, w: 2.3 })));
    out.push({ d: hEllipse(r, 740, 254, 9, 7, { n: 8, wob: 0.11 }), w: 2.1 });
    out.push({ d: hEllipse(r, 751, 262, 9, 7, { n: 8, wob: 0.11 }), w: 2.1 });
    // 胶带
    out.push({ d: hEllipse(r, 936, 258, 19, 8.5, { n: 8, wob: 0.09 }), w: 2.4 });
    out.push({ d: hEllipse(r, 936, 258, 8.5, 3.8, { n: 7, wob: 0.12 }), w: 2 });
    // 已经做好的小盒
    out.push(...smallBox(r, 846, 208, 54, 44, 2.8));

    /* ---------- 中上方：漂浮的成品盒与涂鸦 ---------- */
    out.push(...smallBox(r, 616, 34, 60, 46, 2.8));
    out.push({ d: hEllipse(r, 640, 18, 7.5, 6, { n: 7, wob: 0.13 }), w: 2 });
    out.push(star(r, 748, 72, 14, 2.5));
    out.push(squiggle(r, 796, 42, 54, 2.1));
    out.push(sparkle(r, 890, 44, 11, 2.1));
    out.push({ d: hDot(r, 574, 40, 3.2), w: 2.1, fill: 'currentColor' });

    /* ---------- 最右边：巨大的被打开的盒子 + 冒出来的创意 ---------- */
    const bx = 1024, by = 316, bw = 322, bh = 132;
    out.push(...hPoly(r, [[bx, by + 22], [bx + bw / 2, by], [bx + bw, by + 22]], false, { bow: 0.028 }).map(d => ({ d, w: 3.2 })));
    out.push(...hPoly(r, [[bx, by + 22], [bx, by + bh], [bx + bw / 2, by + bh + 22]], false, { bow: 0.028 }).map(d => ({ d, w: 3.2 })));
    out.push(...hPoly(r, [[bx + bw, by + 22], [bx + bw, by + bh], [bx + bw / 2, by + bh + 22]], false, { bow: 0.028 }).map(d => ({ d, w: 3.2 })));
    out.push(...hPoly(r, [[bx, by + 22], [bx + bw / 2, by + 44], [bx + bw, by + 22]], false, { bow: 0.045 }).map(d => ({ d, w: 3 })));
    // 掀开的两个箱盖（右侧出血到画面外）
    out.push(...hPoly(r, [[bx, by + 22], [bx - 40, by - 36], [bx + 2, by - 66], [bx + bw / 2, by]], false, { bow: 0.045 }).map(d => ({ d, w: 2.9 })));
    out.push(...hPoly(r, [[bx + bw, by + 22], [bx + bw + 46, by - 34], [bx + bw - 4, by - 66], [bx + bw / 2, by]], false, { bow: 0.045 }).map(d => ({ d, w: 2.9 })));

    // 冒出来的元素（向上冲出画面）
    out.push(star(r, 1098, 200, 23, 2.9));
    out.push(star(r, 1210, 140, 15, 2.5));
    out.push(sparkle(r, 1312, 200, 14, 2.3));
    out.push(...leaf(r, 1052, 168, 23, -0.8, 2.5));
    out.push(...leaf(r, 1146, 108, 18, 0.6, 2.4));
    out.push(...flower(r, 1330, 120, 15, 2.3));
    out.push(squiggle(r, 1104, 124, 56, 2.1));
    out.push(squiggle(r, 1248, 96, 44, 2));
    out.push({ d: hDot(r, 1370, 168, 3.6), w: 2.2, fill: 'currentColor' });
    out.push({ d: hDot(r, 1012, 132, 3.2), w: 2.1, fill: 'currentColor' });
    return out;
  });
  return <Ink vb="0 0 1400 500" strokes={s} {...p} />;
}

/* ============================================================
 * 「我们是谁」用图：一个人打开装满创意的盒子
 * ============================================================ */
export function SceneIdeas(p: DProps) {
  const s = build('scene-ideas', r => {
    const out: S[] = [];
    out.push({ d: hLine(r, 14, 300, 386, 296, { bow: 0.012, over: 0.004 }), w: 2.4 });
    // 人：站在盒子左侧，弯身抱住装满创意的盒子
    const pose: Pose = {
      head: [76, 100], hr: 25,
      neck: [82, 128], chest: [90, 146], waist: [102, 172], hip: [112, 196],
      armL: [[64, 152], [46, 170], [54, 200]],
      armR: [[116, 148], [134, 160], [152, 186]],
      legL: [[102, 196], [92, 240], [84, 286]],
      legR: [[124, 194], [138, 236], [150, 284]],
      face: 'joy', hair: 'bun', facing: 1,
    };
    out.push(...drawPerson(r, pose, { w: 3 }));
    // 大盒子（被抱住）
    out.push(...smallBox(r, 160, 174, 158, 108, 3));
    // 盒子里冒出来的创意
    out.push(star(r, 194, 132, 17, 2.7));
    out.push(star(r, 266, 110, 12, 2.3));
    out.push(sparkle(r, 300, 152, 11, 2.2));
    out.push(...leaf(r, 230, 102, 19, -0.6, 2.4));
    out.push(...flower(r, 292, 90, 13, 2.2));
    out.push(squiggle(r, 150, 108, 50, 2.1));
    out.push({ d: hDot(r, 136, 72, 3.4), w: 2.2, fill: 'currentColor' });
    out.push({ d: hDot(r, 328, 124, 3), w: 2, fill: 'currentColor' });
    return out;
  });
  return <Ink vb="0 0 400 320" strokes={s} {...p} />;
}
