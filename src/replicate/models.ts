/* ============================================================
 * 复刻设计 · 模型库（唯一来源）
 * ------------------------------------------------------------
 * 「模型」在这里不是大模型，而是**一套调好的复刻预设**：
 *   一张参考图（版式/风格基准） + 类型 + 尺寸 + 复刻度 + 一段补充要求。
 *
 * 为什么要这东西：「新建复刻」要求用户同时上传参考图和素材图，
 * 大多数人手里只有自己的产品图，没有可参考的版式——第一屏就卡住。
 * 模型库把「参考图」这一步做完了：点一下直接进工作区，
 * 参考图已就位，用户只需上传自己的素材。
 *
 * 约定：
 *   · img 用相对路径（站点 base 是 './'，GitHub Pages 在 /LuanSol/ 子路径下）；
 *   · prompt 是中文，直接拼进生图提示词——生图提示词不随界面语言翻译；
 *   · name / desc 双语，界面按当前语言取。
 *   · 这些图都是免费可商用素材，**画面里不能出现第三方品牌**，
 *     否则用户复刻时会把自己的素材和别人的 logo 混在一起。
 * ============================================================ */
import type { L } from './kinds';

export interface ReplicateModel {
  id: string;
  /** 对应 KINDS 里的类型 id：决定场景规则与默认比例 */
  kind: string;
  name: L;
  desc: L;
  /** 预览图 + 预填的参考图（同一张） */
  img: string;
  ratio: string;
  fidelity: number;
  /** 预填到「补充提示词」，用户可以改 */
  prompt: string;
  /** 卡片未加载时的底色，避免白闪 */
  tone: string;
}

export const MODELS: ReplicateModel[] = [
  {
    id: 'main-vial',
    kind: 'main',
    name: { zh: '白底极简主图', en: 'Clean white hero' },
    desc: { zh: '单件居中，纯白背景，柔和侧光', en: 'One product, pure white, soft light' },
    img: './tpl/main-vial.jpg',
    ratio: '1:1',
    fidelity: 100,
    prompt: '纯白或极浅背景，主体居中，柔和侧光与自然投影，不加任何线条与装饰元素',
    tone: '#efece6',
  },
  {
    id: 'main-can',
    kind: 'main',
    name: { zh: '金属罐双件主图', en: 'Duo can hero' },
    desc: { zh: '两件并置，轻微错位，干净投影', en: 'Two units, offset, clean shadows' },
    img: './tpl/main-can.jpg',
    ratio: '1:1',
    fidelity: 100,
    prompt: '纯白背景，两件同款产品并置、轻微错位，柔和顶光与干净投影，画面不出现多余道具',
    tone: '#f2f1ee',
  },
  {
    id: 'detail-home',
    kind: 'detail',
    name: { zh: '米色家居详情头图', en: 'Quiet home detail' },
    desc: { zh: '低饱和米色，上方留标题区', en: 'Muted beige, headline band' },
    img: './tpl/detail-home.jpg',
    ratio: '3:4',
    fidelity: 100,
    prompt: '米色墙面与亚麻质地，低饱和暖调，画面留出清晰留白区放标题与卖点',
    tone: '#e7e0d4',
  },
  {
    id: 'detail-candle',
    kind: 'detail',
    name: { zh: '暖光蜡烛详情', en: 'Warm candle detail' },
    desc: { zh: '暖色暗调，烛光为主光源', en: 'Warm low-key, candlelit' },
    img: './tpl/detail-candle.jpg',
    ratio: '3:4',
    fidelity: 70,
    prompt: '暖色暗调，烛光作为主光源，深棕与琥珀色层次，氛围安静高级',
    tone: '#3b2a1c',
  },
  {
    id: 'poster-red',
    kind: 'poster',
    name: { zh: '暗调高对比海报', en: 'Dark contrast poster' },
    desc: { zh: '黑底单光源，强对比', en: 'Black backdrop, single light' },
    img: './tpl/poster-red.jpg',
    ratio: '3:4',
    fidelity: 100,
    prompt: '深黑背景，只保留一个光源，强对比，画面下半压住主体、上半留出标题区',
    tone: '#1a1210',
  },
  {
    id: 'poster-mono',
    kind: 'poster',
    name: { zh: '黑白银器海报', en: 'Mono silver poster' },
    desc: { zh: '黑白摄影，金属高光', en: 'Monochrome, metal highlights' },
    img: './tpl/poster-mono.jpg',
    ratio: '3:4',
    fidelity: 100,
    prompt: '黑白摄影质感，金属与玻璃的高光细节，深色背景，构图克制，大量留白',
    tone: '#d8d6d2',
  },
  {
    id: 'cover-tee',
    kind: 'cover',
    name: { zh: '挂拍衣料封面', en: 'Hanging garment cover' },
    desc: { zh: '浅灰墙，硬光投影，右留标题', en: 'Pale wall, hard shadow' },
    img: './tpl/cover-tee.jpg',
    ratio: '16:9',
    fidelity: 100,
    prompt: '浅灰墙面，主体挂在画面偏左，硬光拉出长投影，右侧留出大标题区域',
    tone: '#cfcac2',
  },
  {
    id: 'cover-bag',
    kind: 'cover',
    name: { zh: '白纸袋横版封面', en: 'Paper bag cover' },
    desc: { zh: '白底俯拍，右侧大面积留白', en: 'White top-down, wide space' },
    img: './tpl/cover-bag.jpg',
    ratio: '16:9',
    fidelity: 100,
    prompt: '纯白背景俯拍，主体偏左，右侧大面积留白放标题，画面干净无杂物',
    tone: '#f0eeea',
  },
  {
    id: 'pack-bag',
    kind: 'packaging',
    name: { zh: '纸袋正面样机', en: 'Paper bag mockup' },
    desc: { zh: '两个纸袋正面并排', en: 'Two bags, front view' },
    img: './tpl/pack-bag.jpg',
    ratio: '1:1',
    fidelity: 100,
    prompt: '浅灰背景，两个纸袋正面并排，一大一小，柔和投影，保留提手与折边结构',
    tone: '#eceae6',
  },
  {
    id: 'pack-pouch',
    kind: 'packaging',
    name: { zh: '立式袋双件', en: 'Stand-up pouch pair' },
    desc: { zh: '两只立式袋，保留封口折线', en: 'Two stand-up pouches' },
    img: './tpl/pack-pouch.jpg',
    ratio: '1:1',
    fidelity: 100,
    prompt: '浅灰背景，两只立式袋并排站立，保留顶部封口与侧面折线，柔和投影',
    tone: '#eeedea',
  },
  {
    id: 'merch-mug',
    kind: 'merch',
    name: { zh: '白瓷杯样机', en: 'Ceramic mug mockup' },
    desc: { zh: '两只瓷杯并排，浅白背景', en: 'Two mugs, pale backdrop' },
    img: './tpl/merch-mug.jpg',
    ratio: '1:1',
    fidelity: 100,
    prompt: '浅白背景，两只陶瓷杯并排，釉面高光自然，柔和投影',
    tone: '#f1f0ee',
  },
  {
    id: 'merch-tote',
    kind: 'merch',
    name: { zh: '帆布袋样机', en: 'Canvas tote mockup' },
    desc: { zh: '灰墙悬挂，布纹清晰', en: 'Hanging tote, visible weave' },
    img: './tpl/merch-tote.jpg',
    ratio: '1:1',
    fidelity: 100,
    prompt: '灰色墙面，帆布袋居中悬挂，布料褶皱与提手结构清晰，柔光',
    tone: '#8e8c88',
  },
];

export const modelById = (id: string | undefined | null): ReplicateModel | null =>
  MODELS.find((m) => m.id === id) || null;

export const modelsOfKind = (kind: string): ReplicateModel[] =>
  kind === 'all' ? MODELS : MODELS.filter((m) => m.kind === kind);
