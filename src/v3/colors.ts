/* ============================================================
 * 主色与 AI 色彩搭配引擎
 * ------------------------------------------------------------
 * 不是随机给六组颜色：颜色之间有主次比例、明度/彩度关系，
 * 并依据风格配置使用不同的配色逻辑（彩陶 ≠ 单色釉 ≠ 高对比商业）。
 * 全部确定性计算，同一输入永远得到同一结果。
 * ============================================================ */
import type { PaletteDraft } from './draft';
import type { StyleConfig } from './styles';

export interface PaletteContext {
  primary: string;
  style?: StyleConfig;
  category?: string;
  audience?: string;
  logoColors?: string[];
}

export const isHex = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return [32, 70, 58];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + 360) % 360;
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [h, s, l];
}
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
export const hsl = (h: number, s: number, l: number) => rgbToHex(...hslToRgb(h, s, l));
export const mix = (a: string, b: string, t: number) => {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
};
export const readableOn = (bg: string) => {
  const [r, g, b] = hexToRgb(bg);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 150 ? '#1d1d1b' : '#ffffff';
};
export const nameOfColor = (hex: string) => {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  if (s < 0.08) return l > 0.85 ? '白' : l > 0.6 ? '浅灰' : l > 0.3 ? '深灰' : '墨黑';
  if (h < 15 || h >= 345) return s > 0.45 ? '朱红' : '暖粉';
  if (h < 45) return l > 0.7 ? '米白' : s > 0.5 ? '赤陶' : '驼棕';
  if (h < 70) return '赭黄';
  if (h < 160) return l > 0.7 ? '浅绿' : '森林绿';
  if (h < 200) return '青瓷';
  if (h < 255) return '靛蓝';
  if (h < 290) return '紫';
  return '胭脂';
};

/** 从已上传 Logo 中提取主色：把图片画到小画布上做简化色彩聚类 */
export async function extractLogoColors(src: string, count = 5): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = 48; cv.height = 48;
        const cx = cv.getContext('2d');
        if (!cx) return resolve([]);
        cx.drawImage(img, 0, 0, 48, 48);
        const d = cx.getImageData(0, 0, 48, 48).data;
        const buckets = new Map<string, number>();
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 40) continue;                       // 透明像素
          const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
          const [h, s, l] = rgbToHsl(r, g, b);
          if (l > 0.94 || l < 0.06 || s < 0.07) continue;    // 近白/近黑/灰不算品牌色
          const key = `${Math.round(h / 24)}-${Math.round(s * 4)}-${Math.round(l * 4)}`;
          buckets.set(key, (buckets.get(key) || 0) + 1);
        }
        const out = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, count).map(([k]) => {
          const [hh, ss, ll] = k.split('-').map(Number);
          return hsl(hh * 24 + 12, Math.min(0.9, (ss + 0.5) / 4), Math.min(0.75, Math.max(0.25, (ll + 0.5) / 4)));
        });
        resolve(out);
      } catch { resolve([]); }
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });
}

const P = (id: string, name: string, primary: string, secondary: string, accent: string, bg: string,
  ratio: [number, number, number, number], reason: string): PaletteDraft => ({
  id, name, primary, secondary, accent, bg, ink: readableOn(bg), ratio, reason, source: 'ai',
});

/** 依据风格配置生成 6 套配色：每种 paletteLogic 走完全不同的规则 */
export function generatePalettes(ctx: PaletteContext): PaletteDraft[] {
  const base = isHex(ctx.primary) ? ctx.primary : '#20463a';
  const [h, s, l] = rgbToHsl(...hexToRgb(base));
  const st = ctx.style;
  const logic = st?.paletteLogic || 'natural';
  const styleColors = st?.dominant_colors || [];
  const era = st?.era || '';
  const logo = (ctx.logoColors || []).filter(isHex);
  const tag = (n: string) => `${n}${logo.length ? ' · 呼应 Logo 色' : ''}`;

  /* 宋代单色釉 / 雕漆：同色相明度层叠，几乎不引入第二色相 */
  if (logic === 'monochrome' || st?.monochrome) {
    const anchor = styleColors[0] && isHex(styleColors[0]) ? mix(styleColors[0], base, 0.45) : base;
    const [ah, as] = rgbToHsl(...hexToRgb(anchor));
    const sat = Math.min(as, 0.26);
    return [
      P('m1', tag('釉色 · 天青'), hsl(ah, sat, 0.46), hsl(ah, sat * 0.8, 0.62), hsl(ah, sat * 0.6, 0.3), hsl(ah, sat * 0.35, 0.9),
        [62, 22, 8, 8], '单一釉色大面积铺陈，靠 4 级明度差表现釉面，不添加任何对比色。'),
      P('m2', tag('釉色 · 粉青'), hsl(ah + 8, sat * 0.8, 0.55), hsl(ah + 8, sat * 0.6, 0.72), hsl(ah, sat, 0.36), hsl(ah + 8, sat * 0.25, 0.94),
        [58, 24, 8, 10], '整体提亮一档，色阶更柔，适合浅色纸材与香薰、茶类。'),
      P('m3', tag('釉色 · 深沉'), hsl(ah - 6, sat * 1.15, 0.3), hsl(ah, sat * 0.7, 0.48), hsl(ah, sat * 0.5, 0.18), hsl(ah, sat * 0.2, 0.88),
        [66, 20, 6, 8], '压低明度，仅保留细微色差，突出器形轮廓与留白。'),
      P('m4', tag('单色 · 纸感'), hsl(ah, sat * 0.5, 0.42), hsl(ah, sat * 0.3, 0.66), hsl(ah, sat * 0.45, 0.28), hsl(38, 0.16, 0.93),
        [54, 24, 8, 14], '未漂白纸底色配同色系墨色，明度差是唯一层次来源。'),
      P('m5', tag('单色 · 朱雕'), hsl(ah, Math.min(0.4, sat + 0.12), 0.38), hsl(ah, Math.min(0.35, sat + 0.08), 0.52), hsl(ah, sat, 0.22), hsl(ah, sat * 0.2, 0.9),
        [70, 18, 5, 7], '同色相深浅层叠表现浮雕感，不引入金线或第二色相。'),
      P('m6', tag('单色 · 自由'), base, mix(base, '#ffffff', 0.35), mix(base, '#1d1d1b', 0.35), mix(base, '#ffffff', 0.88),
        [60, 22, 8, 10], '以你选的主色为唯一色相，按 60/22/8/10 的比例展开。'),
    ];
  }

  /* 传统风格：以该时期的实际主色为锚，配色逻辑随时代变化 */
  if (logic === 'heritage' && st) {
    const terra = styleColors[0] && isHex(styleColors[0]) ? styleColors[0] : base;
    const ink = styleColors[1] && isHex(styleColors[1]) ? styleColors[1] : mix(base, '#1d1d1b', 0.6);
    const gold = styleColors[2] && isHex(styleColors[2]) ? styleColors[2] : hsl(h + 30, 0.45, 0.58);
    return [
      P('h1', tag(`${era} · 本色`), mix(terra, base, 0.25), ink, gold, mix(terra, '#ffffff', 0.82),
        [58, 24, 10, 8], `以 ${era} 常见底色与纹饰色为锚，主次按 58/24/10/8 分配，纹样色只作点缀。`),
      P('h2', tag(`${era} · 高明度`), mix(terra, '#ffffff', 0.3), mix(ink, '#ffffff', 0.3), gold, '#f7f3ea',
        [52, 22, 8, 18], '把历史色提亮，保留色相关系，适合浅色纸盒与食品类。'),
      P('h3', tag(`${era} · 深底描金`), mix(ink, '#1d1d1b', 0.25), gold, mix(terra, '#ffffff', 0.35), mix(ink, '#1d1d1b', 0.25),
        [64, 20, 8, 8], '深底配该时期纹样色，金色只用于细线，适合礼盒。'),
      P('h4', tag('用户主色 × 时代色'), base, mix(base, ink, 0.55), gold, mix(base, '#ffffff', 0.86),
        [60, 22, 8, 10], `保留你选的主色，用 ${era} 的辅助色与纹饰色建立层次。`),
      P('h5', tag(`${era} · 低饱和`), mix(terra, '#c9c1b0', 0.45), mix(ink, '#8d8d8a', 0.4), mix(gold, '#ffffff', 0.25), '#f4f1e9',
        [56, 24, 8, 12], '降低彩度，适合现代印刷与电商展示，仍保留时代色相关系。'),
      P('h6', tag('高对比商业'), mix(ink, '#1d1d1b', 0.15), mix(terra, '#ffffff', 0.2), gold, '#ffffff',
        [50, 26, 12, 12], '提高底色与纹样色的明度差，适合货架远距离识别。'),
    ];
  }

  /* 轻奢：深色底 + 金属色 */
  if (logic === 'luxury') {
    const dark = mix(base, '#101010', 0.55);
    const gold = hsl(42, 0.5, 0.62);
    return [
      P('l1', tag('深底金线'), gold, mix(gold, dark, 0.55), '#e8e2d4', dark,
        [66, 18, 8, 8], '深底占七成，金属色只做细线与品牌名，形成克制的价值感。'),
      P('l2', tag('墨黑米金'), gold, '#c9c4b8', mix(gold, '#ffffff', 0.4), '#171717',
        [60, 22, 8, 10], '经典黑金，背景与文字明度差最大，小尺寸也清晰。'),
      P('l3', tag('象牙与古铜'), mix(gold, '#6d5638', 0.6), mix(base, '#ffffff', 0.6), gold, '#f5f1e8',
        [56, 24, 10, 10], '浅色纸材配古铜，适合不想用深色的高端产品。'),
      P('l4', tag('主色奢华化'), base, mix(base, gold, 0.4), gold, mix(base, '#0d0d0d', 0.7),
        [62, 20, 8, 10], '以你的主色为底，加入金色点缀与深色背景。'),
      P('l5', tag('低对比雅致'), mix(base, '#ffffff', 0.7), mix(base, '#1d1d1b', 0.3), mix(gold, '#ffffff', 0.2), '#f7f6f2',
        [52, 26, 8, 14], '明度差收窄，靠材质与字距体现精致。'),
      P('l6', tag('节日浓烈'), '#7b2d35', gold, '#e8d9b8', '#2a1418',
        [58, 22, 10, 10], '酒红与金的节日组合，适合限定礼盒。'),
    ];
  }

  /* 高对比商业：互补色 */
  if (logic === 'contrast') {
    const comp = hsl(h + 180, Math.min(0.75, Math.max(0.35, s)), 0.46);
    return [
      P('c1', tag('主色主导'), base, mix(base, '#ffffff', 0.55), comp, '#faf9f6',
        [60, 24, 8, 8], '主色占六成，互补色只做一处强调，保证货架识别度。'),
      P('c2', tag('互补撞色'), comp, mix(comp, '#ffffff', 0.6), base, '#ffffff',
        [46, 28, 14, 12], '主副色面积接近但明度拉开，年轻、有冲击力。'),
      P('c3', tag('深色主视觉'), mix(base, '#1d1d1b', 0.45), mix(base, '#ffffff', 0.7), comp, mix(base, '#1d1d1b', 0.45),
        [64, 20, 8, 8], '深主色满版，亮色文字与点缀形成强对比。'),
      P('c4', tag('留白商业'), base, mix(base, '#ffffff', 0.78), comp, '#ffffff',
        [38, 24, 8, 30], '大面积白底，主色只做区块，信息层级最清楚。'),
      P('c5', tag('三点配色'), base, hsl(h + 30, 0.45, 0.6), hsl(h - 30, 0.55, 0.5), '#f7f5f0',
        [52, 26, 12, 10], '在色环上取三点，既有变化又不会互相打架。'),
      P('c6', tag('柔和对比'), mix(base, '#ffffff', 0.25), mix(comp, '#ffffff', 0.5), mix(base, '#1d1d1b', 0.25), '#fbfaf7',
        [54, 24, 10, 12], '降低两个对比色的彩度，适合食品与日用品。'),
    ];
  }

  /* 自然 / 柔和：邻近色 + 大地色 */
  const analog = hsl(h + 28, Math.min(0.55, s * 0.85), Math.min(0.62, l + 0.1));
  const earth = hsl(32, 0.28, 0.62);
  const soft = logic === 'pastel';
  return [
    P('n1', tag('自然柔和'), base, mix(base, '#ffffff', 0.55), analog, '#f8f6f0',
      [58, 24, 8, 10], `主色 58%、辅助 24%、点缀 8%，${soft ? '彩度整体压低，适合淡彩包装' : '邻近色建立温和的层次'}。`),
    P('n2', tag('大地纸感'), mix(base, earth, 0.35), earth, mix(base, '#1d1d1b', 0.35), '#f4efe3',
      [54, 26, 8, 12], '大地色作辅助，保留未漂白纸的温度，适合食品与茶叶。'),
    P('n3', tag('清新淡彩'), mix(base, '#ffffff', soft ? 0.55 : 0.35), mix(analog, '#ffffff', 0.5), mix(base, '#1d1d1b', 0.2), '#fdfbf6',
      [42, 28, 8, 22], '大面积浅底，文字层级靠明度而非色块，呼吸感强。'),
    P('n4', tag('深绿稳重'), mix(base, '#1d1d1b', 0.3), mix(base, '#ffffff', 0.65), hsl(h + 40, 0.4, 0.58), '#f2f0e9',
      [62, 22, 8, 8], '主色加深，辅助色提亮，适合中高端与礼盒。'),
    P('n5', tag('同类渐变'), base, hsl(h + 12, Math.min(0.6, s), Math.min(0.68, l + 0.14)), hsl(h - 18, Math.min(0.6, s), 0.44), '#faf8f3',
      [56, 26, 8, 10], '只用同一色相的明度与微差，最不容易出错。'),
    P('n6', tag('AI 自由搭配'), base, hsl(h + 150, Math.min(0.5, s * 0.8), 0.58), hsl(h + 45, 0.5, 0.55), mix(base, '#ffffff', 0.9),
      [50, 26, 12, 12], '在保持主色识别度的前提下加入更远的点缀色，适合潮流与插画类。'),
  ];
}

/** 用户修改某个颜色时的联动建议（只改该色，不悄悄重算整套） */
export const withColor = (p: PaletteDraft, key: 'primary' | 'secondary' | 'accent' | 'bg', value: string): PaletteDraft =>
  ({ ...p, [key]: value, ink: readableOn(key === 'bg' ? value : p.bg), source: 'custom' });

/** 风格推荐主色：读取风格配置，不是随机色 */
export function recommendPrimary(st?: StyleConfig): string {
  if (!st) return '#20463a';
  const c = st.dominant_colors.find((x) => isHex(x) && x.toLowerCase() !== '#ffffff');
  return c || '#20463a';
}
