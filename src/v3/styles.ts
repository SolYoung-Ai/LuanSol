/* ============================================================
 * LunaSol 完整包装风格数据库
 * ------------------------------------------------------------
 * 每个风格是一份独立设计配置，AI 生成时读取整份配置执行，
 * 而不是只把风格名称拼进提示词。
 * 传统风格带有 era 标记：同一套设计不会混用不同历史时期的纹样。
 * 风格为视觉设计参考，不代表严格的历史文物复原或学术鉴定。
 * ============================================================ */
import type { ShapeKind, ShapeLayer, Palette } from '../types';
import { shapePrims, type Prim } from '../engine/design';

export type PaletteLogic = 'heritage' | 'monochrome' | 'contrast' | 'natural' | 'pastel' | 'luxury';

export interface ShapePlan {
  shape: ShapeKind;
  fill: 'primary' | 'accent' | 'ink' | 'bg';
  opacity: number;
  /** 相对面尺寸的比例 [x, y, w, h] */
  box: [number, number, number, number];
  strokeWidth?: number;
}

export interface StyleConfig {
  style_id: string;
  style_name: string;
  group: 'modern' | 'tradition';
  era: string;              // 历史时期 / 现代流派
  eraIndex: number;         // 传统风格 01–14 编号（细分共用同一编号）
  subtitle: string;
  description: string;
  visual_features: string[];
  dominant_colors: string[];
  supporting_colors: string[];
  pattern_elements: string[];
  illustration_guidance: string;
  typography_guidance: string;
  composition_guidance: string;
  suitable_categories: string[];
  reference_thumbnail: string;
  ai_prompt_template: string;
  /** 执行配置 */
  shapes: ShapePlan[];
  paletteLogic: PaletteLogic;
  fontHint: 'sans' | 'serif' | 'display';
  monochrome?: boolean;
}

type Draft = Partial<StyleConfig> & Pick<StyleConfig, 'style_id' | 'style_name' | 'group' | 'era' | 'eraIndex' | 'description'
  | 'visual_features' | 'dominant_colors' | 'pattern_elements' | 'illustration_guidance' | 'shapes'>;

function mk(c: Draft): StyleConfig {
  const cfg: StyleConfig = {
    subtitle: '', supporting_colors: [], typography_guidance: '使用现代无衬线字体，保持清晰的字距与层级。',
    composition_guidance: '主标题与品牌名占据清晰视觉中心，辅助信息置于背面，保持安全边距。',
    suitable_categories: ['食品', '茶饮', '礼品', '文创'], reference_thumbnail: '', ai_prompt_template: '',
    paletteLogic: 'natural', fontHint: 'sans', ...c,
  } as StyleConfig;
  // 提示词模板把整份配置都写进去，AI 读到的是具体视觉规则
  cfg.ai_prompt_template = [
    `风格：${cfg.style_name}（${cfg.era}）`,
    `风格说明：${cfg.description}`,
    `必须体现的视觉特征：${cfg.visual_features.join('、')}`,
    `必须使用的纹样 / 图形元素：${cfg.pattern_elements.join('、')}`,
    `主色方向：${cfg.dominant_colors.join('、')}；辅助色：${cfg.supporting_colors.join('、') || '按主色低饱和衍生'}`,
    `插画与图形执行规则：${cfg.illustration_guidance}`,
    `字体与文字层级：${cfg.typography_guidance}`,
    `构图规则：${cfg.composition_guidance}`,
    `适用品类：${cfg.suitable_categories.join('、')}`,
    cfg.group === 'tradition' ? `时代约束：只使用 ${cfg.era} 的视觉语法，不得混入其它历史时期的纹样；本风格为视觉设计参考，非文物复原。` : '',
    '关键约束：品牌名、产品名称、说明文字必须输出为独立可编辑文字图层，不得绘制进图片；不得编造配料、功效、认证与法规信息。',
    '产品：{{product}}；品牌：{{brand}}；目标人群：{{audience}}；包装形态：{{form}}；用户指定主色：{{primary}}；图案要求：{{motif}}。',
  ].filter(Boolean).join('\n');
  cfg.reference_thumbnail = styleThumbnail(cfg);
  return cfg;
}

/* ---------------- 缩略图：用与生成引擎相同的图元绘制，保证每个风格都不同 ---------------- */
function primSvg(p: Prim, ox: number, oy: number): string {
  const n = (v: number) => Math.round(v * 100) / 100;
  switch (p.k) {
    case 'rect': return `<rect x="${n(p.x + ox)}" y="${n(p.y + oy)}" width="${n(p.w)}" height="${n(p.h)}" fill="${p.fill}" opacity="${n(p.opacity)}" ${p.rx ? `rx="${n(p.rx)}"` : ''}/>`;
    case 'circle': return `<circle cx="${n(p.cx + ox)}" cy="${n(p.cy + oy)}" r="${n(p.r)}" fill="${p.fill}" opacity="${n(p.opacity)}"/>`;
    case 'poly': return `<${p.close ? 'polygon' : 'polyline'} points="${p.pts.map(([x, y]) => `${n(x + ox)},${n(y + oy)}`).join(' ')}" fill="${p.fill || 'none'}" stroke="${p.stroke || 'none'}" stroke-width="${n(p.strokeWidth || 0)}" opacity="${n(p.opacity)}"/>`;
    case 'line': return `<line x1="${n(p.x1 + ox)}" y1="${n(p.y1 + oy)}" x2="${n(p.x2 + ox)}" y2="${n(p.y2 + oy)}" stroke="${p.stroke}" stroke-width="${n(p.strokeWidth)}" opacity="${n(p.opacity)}"/>`;
  }
}
export function styleThumbnail(c: StyleConfig): string {
  const [bg, primary, accent] = [c.dominant_colors[0], c.dominant_colors[1] || '#1d1d1b', c.dominant_colors[2] || '#c8a86b'];
  const W = 240, H = 164, FX = 62, FY = 20, FW = 116, FH = 118;
  const colorOf = (k: ShapePlan['fill']) => k === 'primary' ? primary : k === 'accent' ? accent : k === 'ink' ? '#1d1d1b' : bg;
  let shapes = '';
  for (const [i, sp] of c.shapes.entries()) {
    const layer: ShapeLayer = {
      id: `t${i}`, name: c.style_name, type: 'shape', shape: sp.shape,
      x: 0, y: 0, w: FW * sp.box[2], h: FH * sp.box[3], rotation: 0, opacity: sp.opacity, locked: false,
      fill: colorOf(sp.fill), stroke: colorOf(sp.fill), strokeWidth: sp.strokeWidth ?? 0.6, seed: 137 + i * 17,
    };
    const ox = FX + FW * sp.box[0], oy = FY + FH * sp.box[1];
    shapes += shapePrims(layer).map((p) => primSvg(p, ox, oy)).join('');
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="#f1f0ec"/>`
    + `<rect x="${FX - 5}" y="${FY - 5}" width="${FW + 10}" height="${FH + 10}" fill="${bg}" stroke="#ddd9d2" stroke-width="1"/>`
    + shapes
    + `<rect x="${FX + 8}" y="${FH - 2}" width="62" height="5" fill="#1d1d1b" opacity=".55"/>`
    + `<rect x="${FX + 8}" y="${FH + 6}" width="88" height="2.5" fill="#1d1d1b" opacity=".24"/>`
    + `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ============================================================
 * A. 现代商业风格（10）
 * ============================================================ */
const MODERN: StyleConfig[] = [
  mk({
    style_id: 'modern-minimal', style_name: '现代极简', group: 'modern', era: '当代商业', eraIndex: 0, subtitle: 'Modern Minimal',
    description: '大量留白、克制的无衬线字体、极少的图形，靠比例和字距建立秩序。',
    visual_features: ['七成以上留白', '单一强调色', '细分割线', '无装饰边框'],
    dominant_colors: ['#f7f6f2', '#1d1d1b', '#c9c4b8'], supporting_colors: ['#ffffff', '#8d8d8a'],
    pattern_elements: ['细线', '小面积色块'], illustration_guidance: '不加插画；如必须，仅用一条细线或一枚极简色块。',
    typography_guidance: '现代无衬线，宽字距，主标题与产品名之间保持明确层级。',
    composition_guidance: '居中或左对齐单一轴线，信息全部下移，正面只保留品牌与产品名。',
    suitable_categories: ['美妆', '护肤品', '日用品', '数码'], paletteLogic: 'contrast', fontHint: 'sans',
    shapes: [{ shape: 'line', fill: 'primary', opacity: 0.55, box: [0.08, 0.28, 0.84, 0.02] }],
  }),
  mk({
    style_id: 'premium-luxury', style_name: '高端轻奢', group: 'modern', era: '当代商业', eraIndex: 0, subtitle: 'Quiet Luxury',
    description: '深色底、金属色细线与规整网格，强调品牌感与仪式感。',
    visual_features: ['深色底', '金色细线', '规整网格', '高对比'],
    dominant_colors: ['#171717', '#c8a86b', '#e8e2d4'], supporting_colors: ['#f5f1e8', '#9a9488'],
    pattern_elements: ['细金线', '网格', '印章'], illustration_guidance: '仅使用几何细线与网格，不用具象插画。',
    typography_guidance: '衬线体或高对比现代体，品牌名大写宽字距。',
    composition_guidance: '中轴对称，品牌名置于上三分之一，金色细线分隔信息区。',
    suitable_categories: ['高端礼盒', '美妆', '珠宝', '酒类'], paletteLogic: 'luxury', fontHint: 'serif',
    shapes: [{ shape: 'grid', fill: 'accent', opacity: 0.32, box: [0.04, 0.04, 0.92, 0.92], strokeWidth: 0.35 },
      { shape: 'line', fill: 'accent', opacity: 0.8, box: [0.12, 0.24, 0.76, 0.02] }],
  }),
  mk({
    style_id: 'natural-eco', style_name: '自然环保', group: 'modern', era: '当代商业', eraIndex: 0, subtitle: 'Natural & Eco',
    description: '未漂白纸感、柔和绿色、单线植物，传达不打扰的日常感。',
    visual_features: ['牛皮纸底色', '低饱和绿', '单线植物', '朴素质感'],
    dominant_colors: ['#f4efe3', '#4b6b4a', '#b99b78'], supporting_colors: ['#e9e1cf', '#2d372c'],
    pattern_elements: ['植物线条', '叶片', '细波浪'], illustration_guidance: '单线植物线条，不用填色块，不使用卡通造型。',
    typography_guidance: '人文无衬线或温和衬线，行距宽松。',
    composition_guidance: '植物线条占下三分之一，上方保持留白，信息左对齐。',
    suitable_categories: ['食品', '茶叶', '日用品', '有机产品'], paletteLogic: 'natural', fontHint: 'sans',
    shapes: [{ shape: 'botanical', fill: 'primary', opacity: 0.85, box: [0.05, 0.42, 0.9, 0.5] },
      { shape: 'line', fill: 'primary', opacity: 0.4, box: [0.08, 0.24, 0.84, 0.02] }],
  }),
  mk({
    style_id: 'modern-orient', style_name: '现代东方', group: 'modern', era: '当代东方美学', eraIndex: 0, subtitle: 'Modern Oriental',
    description: '山水留白、低饱和自然色系与现代宋体气质的结合。',
    visual_features: ['大面积米白留白', '山水只占下三分之一', '低饱和', '印章式收尾'],
    dominant_colors: ['#f3eee4', '#20463a', '#c8a86b'], supporting_colors: ['#1d2b24', '#8d8d8a'],
    pattern_elements: ['山峦', '云雾', '朱红印章'], illustration_guidance: '水墨式层叠山峦，不用写实照片，不加现代几何。',
    typography_guidance: '宋体或现代衬线，品牌名居中，字距舒展。',
    composition_guidance: '上留白、中品牌、下山水的三段式，印章置于右下。',
    suitable_categories: ['茶叶', '地方特产', '文创', '礼品'], paletteLogic: 'heritage', fontHint: 'serif',
    shapes: [{ shape: 'mountain', fill: 'primary', opacity: 0.9, box: [0, 0.55, 1, 0.4] },
      { shape: 'seal', fill: 'accent', opacity: 0.75, box: [0.8, 0.78, 0.13, 0.12] }],
  }),
  mk({
    style_id: 'retro-commercial', style_name: '复古商业', group: 'modern', era: '二十世纪商业美术', eraIndex: 0, subtitle: 'Retro Commerce',
    description: '暖棕纸张、旧标签、衬线字体，像老店里的一张产地卡。',
    visual_features: ['牛皮纸暖棕', '旧式标签框', '朱红印章', '轻微做旧层次'],
    dominant_colors: ['#efe2cd', '#8a5a3b', '#a8352c'], supporting_colors: ['#3b2b20', '#d9c7a8'],
    pattern_elements: ['标签边框', '印章', '细条纹'], illustration_guidance: '版画式简笔图案，避免现代扁平插画。',
    typography_guidance: '复古衬线体，主标题粗重，辅助文字小而密。',
    composition_guidance: '居中标签框，四周留窄边，印章压在框角。',
    suitable_categories: ['咖啡', '糕点', '食品', '酒类'], paletteLogic: 'heritage', fontHint: 'serif',
    shapes: [{ shape: 'seal', fill: 'accent', opacity: 0.55, box: [0.06, 0.08, 0.88, 0.84] },
      { shape: 'stripes', fill: 'primary', opacity: 0.28, box: [0, 0.7, 1, 0.22] }],
  }),
  mk({
    style_id: 'trend-art', style_name: '潮流艺术', group: 'modern', era: '当代潮流', eraIndex: 0, subtitle: 'Trend Art',
    description: '高饱和撞色、自由形状与活泼排版，正面只保留一个强视觉中心。',
    visual_features: ['橙蓝撞色', '有机不规则形', '波点', '大字报式排版'],
    dominant_colors: ['#fff6e9', '#d9603b', '#2b4c7e'], supporting_colors: ['#20202a', '#f0b429'],
    pattern_elements: ['不规则色块', '圆点', '粗线条'], illustration_guidance: '大块自由形状与少量圆点，不加细碎装饰。',
    typography_guidance: '粗黑体、紧凑字距，产品名可以倾斜或分行。',
    composition_guidance: '一个主色块占半幅，文字压在色块上，形成单一视觉中心。',
    suitable_categories: ['零食', '饮品', '年轻潮流', '文创'], paletteLogic: 'contrast', fontHint: 'display',
    shapes: [{ shape: 'blob', fill: 'primary', opacity: 0.9, box: [0.16, 0.24, 0.72, 0.6] },
      { shape: 'dots', fill: 'accent', opacity: 0.7, box: [0, 0.05, 1, 0.3] }],
  }),
  mk({
    style_id: 'illustration-pack', style_name: '插画包装', group: 'modern', era: '当代插画', eraIndex: 0, subtitle: 'Illustrated',
    description: '彩色场景化插画作为主角，适合电商缩略图与系列化 SKU。',
    visual_features: ['彩色插画主视觉', '柔和背景', '统一描边', '故事化场景'],
    dominant_colors: ['#fff6e9', '#d9603b', '#6b8f5e'], supporting_colors: ['#2b4c7e', '#20202a'],
    pattern_elements: ['产品主题插画', '植物', '太阳'], illustration_guidance: '原创场景化插画，元素之间有关联，不堆砌无关小图标。',
    typography_guidance: '圆润无衬线，主标题压在插画留白处。',
    composition_guidance: '插画占下三分之二，上三分之一放品牌名与产品名。',
    suitable_categories: ['食品', '糕点', '茶饮', '儿童用品'], paletteLogic: 'pastel', fontHint: 'display',
    shapes: [{ shape: 'sun', fill: 'accent', opacity: 0.7, box: [0.62, 0.08, 0.32, 0.34] },
      { shape: 'botanical', fill: 'primary', opacity: 0.9, box: [0.02, 0.4, 0.96, 0.56] }],
  }),
  mk({
    style_id: 'geometric', style_name: '几何图形', group: 'modern', era: '现代主义', eraIndex: 0, subtitle: 'Geometric',
    description: '网格、同心圆与模块分割，靠精确比例制造节奏。',
    visual_features: ['规则网格', '同心圆', '模块分割', '冷调'],
    dominant_colors: ['#eef1ef', '#22395c', '#c8a86b'], supporting_colors: ['#1b2733', '#8fa6b8'],
    pattern_elements: ['同心圆', '网格', '斜线'], illustration_guidance: '只用几何元素，禁止具象插画与自由曲线。',
    typography_guidance: '现代无衬线，左对齐，字号按网格倍数取整。',
    composition_guidance: '把画面按黄金比例分区，文字落在其中一个模块内。',
    suitable_categories: ['文创', '日用品', '数码', '香氛'], paletteLogic: 'contrast', fontHint: 'sans',
    shapes: [{ shape: 'concentric', fill: 'primary', opacity: 0.85, box: [0.18, 0.16, 0.64, 0.64] },
      { shape: 'grid', fill: 'primary', opacity: 0.22, box: [0, 0, 1, 1], strokeWidth: 0.3 }],
  }),
  mk({
    style_id: 'jp-fresh', style_name: '日系清新', group: 'modern', era: '当代日系', eraIndex: 0, subtitle: 'Japanese Fresh',
    description: '淡彩、细线、大量呼吸感，信息被压到最少。',
    visual_features: ['淡彩', '细线', '小圆点', '极高留白'],
    dominant_colors: ['#fbf7f0', '#8fae9b', '#e2b6ae'], supporting_colors: ['#6b6a63', '#ffffff'],
    pattern_elements: ['细线', '小圆点', '淡色块'], illustration_guidance: '只用极细线条与几个小点，不用大面积图形。',
    typography_guidance: '细体无衬线，字号偏小，字距宽松。',
    composition_guidance: '内容集中在中部偏上，四周大量留白。',
    suitable_categories: ['美妆', '护肤', '糕点', '日用品'], paletteLogic: 'pastel', fontHint: 'sans',
    shapes: [{ shape: 'dots', fill: 'accent', opacity: 0.6, box: [0.1, 0.55, 0.8, 0.3] },
      { shape: 'line', fill: 'primary', opacity: 0.5, box: [0.1, 0.3, 0.8, 0.02] }],
  }),
  mk({
    style_id: 'euro-classic', style_name: '欧式经典', group: 'modern', era: '欧洲古典商业', eraIndex: 0, subtitle: 'European Classic',
    description: '拱形框、徽章与细边框，带有老牌商号的稳重感。',
    visual_features: ['拱形边框', '徽章', '深蓝与金', '中轴对称'],
    dominant_colors: ['#f5efe2', '#2f3d5c', '#c8a86b'], supporting_colors: ['#3b3026', '#d9cfba'],
    pattern_elements: ['拱形', '徽章', '双线边框'], illustration_guidance: '仅使用对称边框与徽章，不用风景插画。',
    typography_guidance: '古典衬线体，品牌名大写居中。',
    composition_guidance: '严格中轴对称，拱形框包住品牌名与年份。',
    suitable_categories: ['酒类', '巧克力', '礼品', '香氛'], paletteLogic: 'luxury', fontHint: 'serif',
    shapes: [{ shape: 'arch', fill: 'primary', opacity: 0.8, box: [0.1, 0.12, 0.8, 0.72] },
      { shape: 'seal', fill: 'accent', opacity: 0.7, box: [0.4, 0.76, 0.2, 0.16] }],
  }),
];

/* ============================================================
 * B. 中国传统艺术风格（14 组 / 18 个可选项）
 * ============================================================ */
const s = (
  id: string, name: string, era: string, eraIndex: number, o: Omit<Draft, 'style_id' | 'style_name' | 'group' | 'era' | 'eraIndex'>,
) => mk({ style_id: id, style_name: name, group: 'tradition', era, eraIndex, ...o } as Draft);

const TRADITION: StyleConfig[] = [
  s('yangshao', '仰韶彩陶风格', '新石器时代·仰韶文化', 1, {
    description: '红陶底、黑彩鱼纹与几何分区，图形概括、轮廓鲜明。',
    visual_features: ['红陶底色', '黑彩', '几何分区带', '概括鱼纹'],
    dominant_colors: ['#b9603f', '#241c18', '#d9a273'], supporting_colors: ['#8f452d', '#e5c9a6'],
    pattern_elements: ['几何鱼纹', '平行分区带', '三角折线'],
    illustration_guidance: '只画概括的几何鱼纹与水平分区带，笔触粗、轮廓分明；不得加入唐宋以后的花卉或云纹。',
    typography_guidance: '现代无衬线或拙朴隶意字体，避免纤细花体。',
    composition_guidance: '上下两道平行带夹住中央鱼纹主区，形成环带式构图。',
    suitable_categories: ['食品', '茶叶', '地方特产', '文创产品'], paletteLogic: 'heritage', fontHint: 'sans',
    shapes: [{ shape: 'fish', fill: 'ink', opacity: 0.9, box: [0.02, 0.24, 0.96, 0.5] },
      { shape: 'stripes', fill: 'ink', opacity: 0.35, box: [0, 0.02, 1, 0.18] }],
  }),
  s('majiayao', '马家窑彩陶风格', '新石器时代·马家窑文化', 2, {
    description: '旋涡纹、水波纹、同心圆，线条环绕器身连续转动。',
    visual_features: ['旋涡纹', '连续水波纹', '同心圆', '黑彩橙陶'],
    dominant_colors: ['#c07b4e', '#2b211a', '#e0b184'], supporting_colors: ['#7a4f31', '#f0d6b4'],
    pattern_elements: ['旋涡', '水波', '同心圆'],
    illustration_guidance: '必须出现连续旋转的旋涡纹与环绕式水波纹、同心圆；线条要连贯，不得只放一个孤立圆形。不得使用青铜兽面或明清花卉。',
    typography_guidance: '朴素无衬线，字号克制，让旋纹成为主角。',
    composition_guidance: '旋涡沿水平方向连续排布，下方三道水波环绕，中央同心圆定住视线。',
    suitable_categories: ['茶叶', '陶瓷', '文化礼品'], paletteLogic: 'heritage', fontHint: 'sans',
    shapes: [{ shape: 'spiral', fill: 'ink', opacity: 0.95, box: [0.02, 0.16, 0.96, 0.62] },
      { shape: 'concentric', fill: 'ink', opacity: 0.5, box: [0.62, 0.04, 0.34, 0.36] }],
  }),
  s('shangzhou-bronze', '商周青铜礼器风格', '商周', 3, {
    description: '兽面主纹左右对称，细密云雷纹填底，纹饰带有浮雕感。',
    visual_features: ['兽面纹左右对称', '云雷纹填底', '青铜绿与暗金', '浮雕感'],
    dominant_colors: ['#4b5148', '#a8833f', '#26302b'], supporting_colors: ['#7d8b78', '#d9c79a'],
    pattern_elements: ['兽面纹', '云雷纹', '对称夔龙'],
    illustration_guidance: '主纹必须中轴对称，底面填满细密回字形云雷纹；不得加入写意山水或花卉。',
    typography_guidance: '厚重篆意或方正衬线，品牌名居中。',
    composition_guidance: '中轴兽面居上三分之一，云雷纹满底，文字置于无纹饰的留白框内。',
    suitable_categories: ['高端礼盒', '酒类包装', '文化礼品'], paletteLogic: 'luxury', fontHint: 'serif',
    shapes: [{ shape: 'taotie', fill: 'accent', opacity: 0.9, box: [0.04, 0.12, 0.92, 0.76] }],
  }),
  s('chu-lacquer', '战国楚式漆器风格', '战国·楚', 4, {
    description: '黑地朱绘、凤鸟纹、细长卷曲线，构图舒展灵动。',
    visual_features: ['黑地朱绘', '细长卷曲线', '凤鸟意象', '流动舒展'],
    dominant_colors: ['#1c1412', '#b0342a', '#c98a4b'], supporting_colors: ['#3a211c', '#e0a56f'],
    pattern_elements: ['卷云曲线', '凤鸟纹', '朱绘细线'],
    illustration_guidance: '以朱红细长卷曲线在黑底上舒展穿插，暗示凤鸟姿态；不得使用对称几何网格。',
    typography_guidance: '细长篆意或现代细衬线，朱红色。',
    composition_guidance: '曲线自左下向右上贯穿，文字置于右上疏处。',
    suitable_categories: ['高端礼品', '茶叶', '文创包装'], paletteLogic: 'luxury', fontHint: 'serif',
    shapes: [{ shape: 'cloud', fill: 'accent', opacity: 0.95, box: [0, 0.08, 1, 0.82] },
      { shape: 'wave', fill: 'accent', opacity: 0.5, box: [0, 0.62, 1, 0.3] }],
  }),
  s('han-stone', '汉代画像石风格', '汉代', 5, {
    description: '侧面人兽剪影、横向叙事、刻线与拓印质感，造型古拙。',
    visual_features: ['侧面剪影', '横向叙事带', '拓印黑白', '古拙造型'],
    dominant_colors: ['#e3d9c6', '#3c3630', '#8b8172'], supporting_colors: ['#f2eadb', '#5c544a'],
    pattern_elements: ['人兽剪影', '横向分层', '刻线'],
    illustration_guidance: '只使用侧面剪影与横向分层叙事，边缘带拓印颗粒感；不得使用立体渲染或彩色插画。',
    typography_guidance: '方正隶意字体，横向排布。',
    composition_guidance: '两条水平叙事带占据中部，上下留白放品牌与说明。',
    suitable_categories: ['地方文化产品', '博物馆文创', '特色礼盒'], paletteLogic: 'monochrome', fontHint: 'serif',
    shapes: [{ shape: 'blob', fill: 'ink', opacity: 0.7, box: [0.05, 0.3, 0.4, 0.34] },
      { shape: 'blob', fill: 'ink', opacity: 0.55, box: [0.5, 0.32, 0.42, 0.3] },
      { shape: 'line', fill: 'ink', opacity: 0.6, box: [0.02, 0.24, 0.96, 0.02] },
      { shape: 'line', fill: 'ink', opacity: 0.6, box: [0.02, 0.7, 0.96, 0.02] }],
  }),
  s('han-cloud', '汉代云气纹风格', '汉代', 6, {
    description: '云头回卷、长尾舒展，云气穿插于禽兽之间，画面有流动感。',
    visual_features: ['云头回卷', '长尾舒展', '连续流动', '朱褐单线'],
    dominant_colors: ['#e8ddc6', '#8a3b2e', '#b98a58'], supporting_colors: ['#f5eedf', '#5c3a2c'],
    pattern_elements: ['云气纹', '回卷云头', '长尾曲线'],
    illustration_guidance: '云头必须回卷成螺旋并拖出长尾，多组云气朝同一方向流动；不得使用明代以后的写实花卉。',
    typography_guidance: '舒展隶意字体，文字沿云气走向排布。',
    composition_guidance: '三组云气自左向右贯穿，文字压在云气间隙。',
    suitable_categories: ['香品', '茶叶', '礼盒', '高端文化包装'], paletteLogic: 'heritage', fontHint: 'serif',
    shapes: [{ shape: 'cloud', fill: 'accent', opacity: 0.9, box: [0, 0.1, 1, 0.78] }],
  }),
  s('northern-grotto', '北朝石窟装饰风格', '北朝', 7, {
    description: '莲瓣层叠、忍冬纹连续展开，适合画边饰、背光与藻井。',
    visual_features: ['莲瓣层叠', '忍冬纹连续边饰', '土黄与赭石', '中心对称'],
    dominant_colors: ['#d9c8a8', '#7a5a34', '#a8842f'], supporting_colors: ['#efe3c9', '#4a3a26'],
    pattern_elements: ['莲瓣', '忍冬纹', '背光'],
    illustration_guidance: '以中心对称的层叠莲瓣为主，四周用连续忍冬纹作边饰；不得混入唐代宝相花的饱满团花。',
    typography_guidance: '端正魏碑意或方正衬线，居中。',
    composition_guidance: '莲瓣自底部向上展开成背光，边饰环绕四周，文字置于中心空白处。',
    suitable_categories: ['文化礼品', '香品', '文创产品'], paletteLogic: 'heritage', fontHint: 'serif',
    shapes: [{ shape: 'lotus', fill: 'primary', opacity: 0.9, box: [0.04, 0.12, 0.92, 0.8] },
      { shape: 'arch', fill: 'accent', opacity: 0.55, box: [0.12, 0.06, 0.76, 0.6] }],
  }),
  s('tang-rosette', '隋唐团花与宝相花纹样', '隋唐', 8, {
    description: '花瓣围绕中心层层展开，花叶饱满，适合礼盒中心纹章。',
    visual_features: ['中心团花', '花瓣层层展开', '饱满对称', '朱红与金'],
    dominant_colors: ['#f3e2cf', '#a83a32', '#c9a24a'], supporting_colors: ['#5a6f4a', '#7a2b28'],
    pattern_elements: ['宝相花', '团花', '卷草'],
    illustration_guidance: '中心一枚层层展开的饱满团花，四周可配卷草；不得使用宋代单色釉的极简处理。',
    typography_guidance: '丰润楷意或现代衬线，品牌名置于团花下方。',
    composition_guidance: '严格中轴对称，团花占上半幅，文字居中于下半幅。',
    suitable_categories: ['茶叶', '糕点', '礼品包装', '美妆产品'], paletteLogic: 'heritage', fontHint: 'serif',
    shapes: [{ shape: 'sun', fill: 'accent', opacity: 0.85, box: [0.24, 0.08, 0.52, 0.52] },
      { shape: 'lotus', fill: 'primary', opacity: 0.55, box: [0.04, 0.42, 0.92, 0.5] }],
  }),
  s('song-glaze', '宋代单色釉审美', '宋代', 9, {
    description: '大面积单一釉色、柔和光泽，以器形轮廓和细微色差表现层次。',
    visual_features: ['单色大面积', '柔和光泽', '细微色差', '无纹样'],
    dominant_colors: ['#c7d5cc', '#8ba394', '#e8eee9'], supporting_colors: ['#b4c5ba', '#5f756a'],
    pattern_elements: ['无装饰纹样', '釉面细微色差', '器形轮廓线'],
    illustration_guidance: '严禁添加任何传统纹样与插画；只用单一釉色与两三层极轻的同色明度差表现釉面，靠留白与比例说话。',
    typography_guidance: '极细无衬线或宋体，字号很小，字距很宽。',
    composition_guidance: '九成面积为单色，仅一处极细分割线，文字贴下缘。',
    suitable_categories: ['高端茶叶', '香薰', '陶瓷', '护肤品'], paletteLogic: 'monochrome', fontHint: 'serif', monochrome: true,
    shapes: [{ shape: 'glaze', fill: 'primary', opacity: 0.9, box: [0, 0, 1, 1] },
      { shape: 'line', fill: 'ink', opacity: 0.28, box: [0.1, 0.78, 0.8, 0.02] }],
  }),
  s('cizhou', '宋金磁州窑白地黑花风格', '宋金', 10, {
    description: '米白底、黑褐色笔绘，花叶用笔爽利，黑白疏密对比鲜明。',
    visual_features: ['米白底', '黑褐笔绘', '爽利花叶', '黑白强对比'],
    dominant_colors: ['#f0e7d3', '#2b2622', '#7a6a54'], supporting_colors: ['#faf5e9', '#4a4038'],
    pattern_elements: ['笔绘花叶', '缠枝', '粗细节奏'],
    illustration_guidance: '以黑白笔绘花叶为主，笔触爽利、疏密对比明显；不得使用工整对称的宫廷花卉或青花纹样。',
    typography_guidance: '朴拙手写感但保持可读，避免印刷体花体。',
    composition_guidance: '花叶自下向上生长占一侧，另一侧留白放文字。',
    suitable_categories: ['食品', '茶叶', '日用品', '文创包装'], paletteLogic: 'monochrome', fontHint: 'serif',
    shapes: [{ shape: 'botanical', fill: 'ink', opacity: 0.92, box: [0.02, 0.28, 0.96, 0.68] },
      { shape: 'wave', fill: 'ink', opacity: 0.4, box: [0, 0.08, 1, 0.18] }],
  }),
  s('yuan-blue', '元青花装饰风格', '元代', 11, {
    description: '青白对照，主体纹与多道边饰分层排列，适合环绕式包装。',
    visual_features: ['青白对照', '多道分层边饰', '环绕式构图', '中心团纹'],
    dominant_colors: ['#f4f2ea', '#2b4f8a', '#7c9dc2'], supporting_colors: ['#dfe7ef', '#1d3560'],
    pattern_elements: ['多层边饰', '缠枝莲', '回纹带'],
    illustration_guidance: '必须有上下多道平行边饰带，中央主体纹分层排列；不得使用宋代单色釉或明代木纹。',
    typography_guidance: '端正楷体或衬线，品牌名置于青花纹章内。',
    composition_guidance: '上下三道边饰夹住中央主体纹，整体可水平连续环绕。',
    suitable_categories: ['瓷器', '茶叶', '礼品', '高端产品包装'], paletteLogic: 'heritage', fontHint: 'serif',
    shapes: [{ shape: 'blueband', fill: 'primary', opacity: 0.95, box: [0, 0.02, 1, 0.96] },
      { shape: 'concentric', fill: 'primary', opacity: 0.5, box: [0.34, 0.28, 0.32, 0.36] }],
  }),
  s('ming-furniture', '明式家具风格', '明代', 12, {
    description: '木纹清晰、构件纤细、线脚简练，靠比例和转折体现精致感。',
    visual_features: ['清晰木纹', '纤细线脚', '比例克制', '框架结构'],
    dominant_colors: ['#e6d6bd', '#7a5334', '#b08a5c'], supporting_colors: ['#f4ead8', '#4a3320'],
    pattern_elements: ['木纹细线', '简练线脚', '框架比例'],
    illustration_guidance: '只出现极细木纹线与上下两道简练线脚，靠比例与留白体现精致；严禁加入雕花、团花、云纹等装饰。',
    typography_guidance: '清瘦宋体，字距宽，字号小。',
    composition_guidance: '细框架包围大面积留白，文字居中偏上。',
    suitable_categories: ['茶叶', '木质产品', '家具周边', '高端礼品'], paletteLogic: 'natural', fontHint: 'serif',
    shapes: [{ shape: 'woodgrain', fill: 'ink', opacity: 0.8, box: [0, 0, 1, 1] }],
  }),
  s('qing-enamel', '清代宫廷装饰 · 珐琅彩花卉', '清代', 13, {
    description: '细笔设色，精致花卉，层次丰富，色阶细腻。',
    visual_features: ['细笔花卉', '多层色阶', '柔和粉彩', '满而不乱'],
    dominant_colors: ['#f3e5d2', '#b5384a', '#5a7d52'], supporting_colors: ['#e8c9b0', '#c9a24a'],
    pattern_elements: ['折枝花卉', '细笔设色', '叶片层叠'],
    illustration_guidance: '细笔折枝花卉，花瓣有深浅色阶；不得加入掐丝金属线或雕漆浮雕。',
    typography_guidance: '端正楷体，品牌名压在留白开的窗口内。',
    composition_guidance: '花卉自一侧斜入，中央开光留白放文字。',
    suitable_categories: ['高端礼盒', '美妆', '珠宝', '文化礼品'], paletteLogic: 'heritage', fontHint: 'serif',
    shapes: [{ shape: 'botanical', fill: 'primary', opacity: 0.9, box: [0.02, 0.24, 0.96, 0.7] },
      { shape: 'sun', fill: 'accent', opacity: 0.45, box: [0.6, 0.06, 0.34, 0.34] }],
  }),
  s('qing-cloisonne', '清代宫廷装饰 · 掐丝珐琅', '清代', 13, {
    description: '金属线分区填色，纹样边界清晰，具有装饰秩序。',
    visual_features: ['金属线分区', '边界清晰', '石青底', '金色轮廓'],
    dominant_colors: ['#1d4a5f', '#c9a24a', '#2f7d78'], supporting_colors: ['#b5384a', '#e8dcc0'],
    pattern_elements: ['铜胎掐丝线', '分区填色', '莲瓣'],
    illustration_guidance: '所有色块必须由连续金色轮廓线分区，边界清晰；不得使用没骨写意或细笔渐层。',
    typography_guidance: '方正楷体，金色，置于中心开光。',
    composition_guidance: '中轴对称，色块按扇形分区，中央开光放品牌名。',
    suitable_categories: ['高端礼盒', '美妆', '珠宝', '文化礼品'], paletteLogic: 'luxury', fontHint: 'serif',
    shapes: [{ shape: 'grid', fill: 'accent', opacity: 0.6, box: [0.04, 0.04, 0.92, 0.92], strokeWidth: 0.8 },
      { shape: 'lotus', fill: 'accent', opacity: 0.7, box: [0.1, 0.3, 0.8, 0.6] }],
  }),
  s('qing-carved', '清代宫廷装饰 · 雕漆', '清代', 13, {
    description: '同色浮雕层次，强调雕刻深浅与表面质感。',
    visual_features: ['单色朱红', '浮雕层次', '深浅同色', '锦地纹'],
    dominant_colors: ['#8f231d', '#b3503f', '#6d1814'], supporting_colors: ['#c87a63', '#4a100d'],
    pattern_elements: ['同色浮雕', '层叠莲瓣', '锦地'],
    illustration_guidance: '只用同一色相的明度层叠表现雕刻深浅，不引入第二种色相；不得使用金线或多色花卉。',
    typography_guidance: '留白处用浅色细楷，极少文字。',
    composition_guidance: '满地浮雕层叠，中央留一块素面开光。',
    suitable_categories: ['高端礼盒', '珠宝', '文化礼品'], paletteLogic: 'monochrome', fontHint: 'serif', monochrome: true,
    shapes: [{ shape: 'lotus', fill: 'accent', opacity: 0.85, box: [0.02, 0.16, 0.96, 0.78] },
      { shape: 'arch', fill: 'accent', opacity: 0.5, box: [0.26, 0.3, 0.48, 0.46] }],
  }),
  s('hai-monthcard', '近代海派商业美术 · 月份牌', '近代·海派', 14, {
    description: '人物或商品居中，细腻商业插画，装饰性文字。',
    visual_features: ['商品居中', '细腻商业插画', '装饰性美术字', '边框'],
    dominant_colors: ['#f5e8d0', '#a8352c', '#3b5a6b'], supporting_colors: ['#e0b98a', '#2b2a28'],
    pattern_elements: ['居中商品插画', '拱形装饰框', '美术字'],
    illustration_guidance: '单一主体居中，配柔和商业插画背景与装饰框；不得使用传统宫廷纹样或现代几何。',
    typography_guidance: '装饰性美术字作主标题，辅助信息用端正小字。',
    composition_guidance: '中轴对称，主体居中，上下为装饰字与信息带。',
    suitable_categories: ['食品', '饮品', '糕点', '美妆', '复古品牌包装'], paletteLogic: 'heritage', fontHint: 'display',
    shapes: [{ shape: 'arch', fill: 'accent', opacity: 0.7, box: [0.08, 0.08, 0.84, 0.76] },
      { shape: 'botanical', fill: 'primary', opacity: 0.55, box: [0.04, 0.6, 0.92, 0.34] }],
  }),
  s('hai-trademark', '近代海派商业美术 · 商标', '近代·海派', 14, {
    description: '简洁鲜明的品牌标志，具有商业识别性。',
    visual_features: ['单一标志', '强识别色', '无多余装饰', '边框简洁'],
    dominant_colors: ['#f2e6cd', '#a8352c', '#2b2a28'], supporting_colors: ['#ffffff', '#d9c7a8'],
    pattern_elements: ['方形印章式商标', '细边框'],
    illustration_guidance: '只做一枚居中的方形标志，四周不得堆砌装饰。',
    typography_guidance: '粗美术字，品牌名是唯一视觉主体。',
    composition_guidance: '标志居中，四周大面积留白，底部一行规格文字。',
    suitable_categories: ['食品', '饮品', '糕点', '复古品牌包装'], paletteLogic: 'contrast', fontHint: 'display',
    shapes: [{ shape: 'seal', fill: 'primary', opacity: 0.85, box: [0.3, 0.24, 0.4, 0.44] },
      { shape: 'line', fill: 'ink', opacity: 0.5, box: [0.12, 0.8, 0.76, 0.02] }],
  }),
  s('hai-poster', '近代海派商业美术 · 广告画', '近代·海派', 14, {
    description: '人物、产品、装饰字和边框组合，中西结合的构图。',
    visual_features: ['多重边框', '产品与装饰字组合', '斜向构图', '中西结合'],
    dominant_colors: ['#f5e8d0', '#2b4f6b', '#a8352c'], supporting_colors: ['#e0b98a', '#2b2a28'],
    pattern_elements: ['双层边框', '斜带', '装饰字'],
    illustration_guidance: '边框、斜带、商品与装饰字组合成一张广告画；不得使用青铜、彩陶等古代纹样。',
    typography_guidance: '大号装饰美术字配小号说明文字。',
    composition_guidance: '外框包住画面，一条斜带切分主副信息区。',
    suitable_categories: ['食品', '饮品', '糕点', '美妆', '复古品牌包装'], paletteLogic: 'heritage', fontHint: 'display',
    shapes: [{ shape: 'rect', fill: 'accent', opacity: 0.22, box: [0.04, 0.06, 0.92, 0.88] },
      { shape: 'stripes', fill: 'primary', opacity: 0.5, box: [0.06, 0.5, 0.88, 0.24] },
      { shape: 'arch', fill: 'primary', opacity: 0.5, box: [0.3, 0.12, 0.4, 0.42] }],
  }),
];

export const STYLES: StyleConfig[] = [...MODERN, ...TRADITION];
export const STYLE_GROUPS = [
  { id: 'all', label: '全部风格' },
  { id: 'modern', label: '现代商业风格' },
  { id: 'tradition', label: '中国传统艺术风格' },
  { id: 'recommend', label: '为我推荐' },
  { id: 'favorites', label: '我的收藏' },
] as const;

export const styleById = (id: string) => STYLES.find((s) => s.style_id === id);
export const styleByName = (name: string) => STYLES.find((s) => s.style_name === name);
export const TRADITION_COUNT = new Set(TRADITION.map((s) => s.eraIndex)).size; // = 14

/** 风格自带的推荐主色（该风格 dominant_colors 的第一色）。
 *  选定风格时直接写进草稿，保证「界面上看到的颜色」就是「真正生效的颜色」，
 *  不会再出现取色器显示有颜色、草稿却是空的、然后被「请先选择主颜色」拦住的情况。 */
export function stylePrimaryColor(styleId: string): string {
  const c = styleById(styleId)?.dominant_colors?.[0] || '';
  return /^#[0-9a-f]{6}$/i.test(c) ? c : '';
}

/** 依据品类 / 人群 / 形态推荐风格（确定性规则，不冒充 AI） */
export function recommendStyles(input: { category?: string; audience?: string; form?: string }): StyleConfig[] {
  const c = `${input.category || ''} ${input.audience || ''} ${input.form || ''}`;
  const score = (s: StyleConfig) => {
    let v = 0;
    if (s.suitable_categories.some((x) => c.includes(x))) v += 4;
    if (/茶|香|礼|文创/.test(c) && s.group === 'tradition') v += 3;
    if (/年轻|潮流|儿童/.test(c) && ['trend-art', 'illustration-pack', 'jp-fresh'].includes(s.style_id)) v += 4;
    if (/高端|商务|礼品/.test(c) && ['premium-luxury', 'song-glaze', 'shangzhou-bronze', 'ming-furniture'].includes(s.style_id)) v += 3;
    if (/美妆|护肤/.test(c) && ['modern-minimal', 'jp-fresh', 'song-glaze'].includes(s.style_id)) v += 3;
    return v;
  };
  return [...STYLES].sort((a, b) => score(b) - score(a) || a.style_name.localeCompare(b.style_name)).slice(0, 6);
}

/** 把风格配置展开为设计引擎可用的独立矢量图层 */
export function styleDecorLayers(c: StyleConfig, w: number, h: number, p: Palette): ShapeLayer[] {
  const colorOf = (k: ShapePlan['fill']) => k === 'primary' ? p.primary : k === 'accent' ? p.accent : k === 'ink' ? p.ink : p.bg;
  return c.shapes.map((sp, i) => ({
    id: `style-${c.style_id}-${i}`, name: `${c.style_name} · ${sp.shape}`, type: 'shape' as const, shape: sp.shape,
    x: w * sp.box[0], y: h * sp.box[1], w: w * sp.box[2], h: h * sp.box[3],
    rotation: 0, opacity: sp.opacity, locked: false,
    fill: colorOf(sp.fill), stroke: colorOf(sp.fill), strokeWidth: sp.strokeWidth ?? 0.6, seed: 811 + i * 29,
  }));
}

/** 生成传给 LLM 的完整风格提示词（不是只拼风格名） */
export function buildStylePrompt(c: StyleConfig, ctx: { product: string; brand: string; audience: string; form: string; primary: string; motif: string }): string {
  return c.ai_prompt_template
    .replace('{{product}}', ctx.product || '未指定产品')
    .replace('{{brand}}', ctx.brand || '未指定品牌')
    .replace('{{audience}}', ctx.audience || '大众消费群体')
    .replace('{{form}}', ctx.form || '折叠纸盒')
    .replace('{{primary}}', ctx.primary || '沿用风格主色')
    .replace('{{motif}}', ctx.motif || '按风格默认纹样');
}
