/* ============================================================
 * 复刻的类型目录（唯一来源）
 * ------------------------------------------------------------
 * 「复刻设计」有两页：记录列表（/replicate）与工作区（/replicate/new · /replicate/edit）。
 * 类型名、场景规则、默认比例都放在这里，两页读同一份，
 * 否则列表上写的「视频封面」和编辑区实际生成的规则会对不上。
 * 场景规则是生图提示词的一部分，保持中文，不随界面语言翻译。
 * ============================================================ */
import type { IconName } from '../components/icons';
import type { ReferenceRole } from '../types';

export type L = { zh: string; en: string };

/** 上游（方舟 / B.AI）单次最多接收 4 张参考图，参考图与素材图两栏共用这个额度 */
export const MAX_IMAGES = 4;
/** 一次出几张 */
export const BATCH = 3;

export const RATIOS: { id: string; label: string; size: string }[] = [
  { id: '1:1', label: '1:1', size: '1024x1024' },
  { id: '3:4', label: '3:4', size: '864x1152' },
  { id: '4:3', label: '4:3', size: '1152x864' },
  { id: '16:9', label: '16:9', size: '1280x720' },
  { id: '9:16', label: '9:16', size: '720x1280' },
];

export interface KindDef {
  id: string;
  name: L;
  desc: L;
  icon: IconName;
  /** 默认比例：详情页/海报竖版，视频封面 16:9，其余方图 */
  ratio: string;
  /** 该类型的画面规则，会被拼进提示词（生图提示词保持中文，不随界面语言走） */
  scene: string;
  /** 素材图的默认角色，写进项目草稿的 referenceImages */
  role: ReferenceRole;
  /** 有标题类画面（封面 / 海报 / 详情页）要求用户填自己的标题；
   *  不填就生图，模型会把参考图上的原文字照抄下来——这是实测踩过的坑。 */
  titleField?: L;
}

export const KINDS: KindDef[] = [
  {
    id: 'main',
    name: { zh: '主图', en: 'Main image' },
    desc: { zh: '电商首图，白底或极简场景', en: 'Storefront hero on a clean backdrop' },
    icon: 'image',
    ratio: '1:1',
    role: 'product',
    scene: '输出电商主图：单个主体居中，占画面 70%–85%，背景为纯白或极简浅色场景，光线均匀，四周留安全边距，不出现多余文字、水印、多件产品或拼贴',
  },
  {
    id: 'detail',
    name: { zh: '详情页', en: 'Detail page' },
    desc: { zh: '竖版单屏信息图，标题 + 卖点 + 细节', en: 'Vertical info panel: headline, selling points, detail' },
    icon: 'layers',
    ratio: '3:4',
    role: 'product',
    scene: '输出竖版详情页的单屏画面：清晰的上下信息层级，可包含一句主标题、两到三条卖点短语与一处产品细节特写，排版留白充足，中文文字清晰可读、不糊字',
    titleField: { zh: '页面标题', en: 'Page headline' },
  },
  {
    id: 'poster',
    name: { zh: '海报', en: 'Poster' },
    desc: { zh: '强对比、大标题留白，可独立张贴', en: 'High contrast with room for a headline' },
    icon: 'text',
    ratio: '3:4',
    role: 'product',
    scene: '输出商业海报：单一视觉中心、强对比、明确的大标题留白区，构图完整可独立张贴，画面内文字精简且中文字形正确',
    titleField: { zh: '海报标题', en: 'Poster headline' },
  },
  {
    id: 'cover',
    name: { zh: '视频封面', en: 'Video cover' },
    desc: { zh: '大标题 + 强对比，缩略图里也看得清', en: 'Big type, high contrast, legible as a thumbnail' },
    icon: 'fullscreen',
    ratio: '16:9',
    role: 'product',
    scene: '输出视频封面：主体偏一侧，另一侧留出大标题文字区，强对比高饱和，在缩略图尺寸下仍然可辨识',
    titleField: { zh: '视频标题', en: 'Video title' },
  },
  {
    id: 'packaging',
    name: { zh: '包装', en: 'Packaging' },
    desc: { zh: '保留容器形状与标签文字的正面效果图', en: 'Front mockup that keeps shape and label copy' },
    icon: 'shape',
    ratio: '1:1',
    role: 'packaging',
    scene: '输出包装正面商业效果图：保留素材图的容器形状、标签排版、品牌文字与净含量信息，纯色或极简背景，单个产品居中，材质与光泽真实',
  },
  {
    id: 'merch',
    name: { zh: '周边', en: 'Merch' },
    desc: { zh: '帆布袋 / 杯子 / 贴纸 / T恤 等物料图', en: 'Tote, mug, sticker or tee mockup' },
    icon: 'grid',
    ratio: '1:1',
    role: 'material',
    scene: '输出周边物料效果图：从帆布袋、马克杯、贴纸、T恤、徽章中选最贴合素材的一种，主体居中，背景干净，织物或陶瓷质感真实，阴影自然',
  },
];

export const kindById = (id: string | undefined): KindDef | null =>
  KINDS.find((k) => k.id === id) || null;

/** 内部 id 一律转成人能看的名字再渲染，不要把 kind 直接显示给用户 */
export const kindName = (k: KindDef, lang: string): string => (lang === 'en' ? k.name.en : k.name.zh);
export const kindDesc = (k: KindDef, lang: string): string => (lang === 'en' ? k.desc.en : k.desc.zh);
