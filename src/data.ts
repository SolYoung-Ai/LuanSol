import type { MockupKind } from './components/visuals';
import type { Palette, StructureId } from './types';

export const P = (bg: string, primary: string, accent: string, ink = '#1d1d1b'): Palette => ({ bg, primary, accent, ink, muted: '#8d8d8a' });

export interface InspirationItem {
  id: string; brand: string; sub: string; category: string; style: string;
  palette: Palette; kind: MockupKind; structure: StructureId; keywords: string[]; desc: string;
}

export const INSPIRATIONS: InspirationItem[] = [
  { id: 'i1', brand: '山隐茶集', sub: 'Highland Oolong', category: '茶饮', style: '现代东方', palette: P('#f3eee4', '#20463a', '#c8a86b'), kind: 'box', structure: 'topBottom', keywords: ['留白', '山水', '宋体', '低饱和'], desc: '大面积米白留白，深绿山水只占下三分之一，品牌名以宋体居中，克制而安静。' },
  { id: 'i2', brand: '屿光咖啡', sub: 'Island Roasters', category: '咖啡', style: '复古怀旧', palette: P('#efe2cd', '#8a5a3b', '#a8352c', '#3b2b20'), kind: 'pouch', structure: 'pouch', keywords: ['牛皮纸', '旧标签', '暖棕'], desc: '暖棕底色配一枚朱红印章式标签，像旧咖啡馆里手写的一张产地卡。' },
  { id: 'i3', brand: '野果实验室', sub: 'Wild Berry Lab', category: '食品', style: '潮流插画', palette: P('#fff6e9', '#d9603b', '#2b4c7e', '#20202a'), kind: 'box', structure: 'tuck', keywords: ['高饱和', '插画', '几何'], desc: '橙蓝撞色与手绘果实的组合，正面只保留一个强视觉中心，适合电商缩略图。' },
  { id: 'i4', brand: '素白研', sub: 'SOOBAI LAB', category: '美妆', style: '现代极简', palette: P('#f7f6f2', '#1d1d1b', '#c9c4b8'), kind: 'bottle', structure: 'labelRect', keywords: ['无衬线', '细线', '黑金'], desc: '瓶身几乎不装饰，只靠一条细线与字距建立秩序，把成分信息放在背面。' },
  { id: 'i5', brand: '日常物', sub: 'EVERYDAY OBJECTS', category: '日用品', style: '自然有机', palette: P('#f4efe3', '#4b6b4a', '#b99b78', '#2d372c'), kind: 'tube', structure: 'labelRect', keywords: ['植物线条', '牛皮纸', '环保'], desc: '柔和绿与未漂白纸感，配合单线植物插画，传达不打扰的日常感。' },
  { id: 'i6', brand: '本源', sub: 'ORIGIN DAILY', category: '保健食品', style: '轻奢商业', palette: P('#171717', '#c8a86b', '#e8e2d4', '#f5f1e8'), kind: 'box', structure: 'drawer', keywords: ['深色底', '金字', '网格'], desc: '深黑底配细金线网格，信息层级非常清楚，适合系列化SKU延伸。' },
  { id: 'i7', brand: '有礼', sub: 'WITH LOVE', category: '礼品', style: '现代东方', palette: P('#f7f1e5', '#7b2d35', '#c8a86b', '#3b241f'), kind: 'gift', structure: 'topBottom', keywords: ['酒红', '烫金感', '仪式感'], desc: '酒红与米金的礼盒配色，开合面不做多余图形，把仪式感留给结构本身。' },
  { id: 'i8', brand: '见山', sub: 'SEE MOUNTAIN', category: '文创', style: '现代极简', palette: P('#eef1ef', '#22395c', '#c8a86b', '#1b2733'), kind: 'label', structure: 'labelRound', keywords: ['冷调', '圆标', '封口贴'], desc: '冷灰蓝圆标与细边框，用在信封封口或牛皮纸袋上，成本很低但很完整。' },
  { id: 'i9', brand: '半日焙', sub: 'HALF DAY BAKE', category: '食品', style: '复古怀旧', palette: P('#f8f1e1', '#a9673f', '#d98b5f', '#4a3527'), kind: 'box', structure: 'tuck', keywords: ['焦糖', '手写体', '温暖'], desc: '奶油与焦糖的暖色层次，正面用一枚圆形印章收住视线。' },
  { id: 'i10', brand: '雾屿茶', sub: 'MIST ISLAND', category: '茶饮', style: '自然有机', palette: P('#e9eee7', '#2f5d4a', '#a8bfa6', '#1d2b24'), kind: 'pouch', structure: 'pouch', keywords: ['雾绿', '波浪', '轻量化'], desc: '雾绿渐变与细波浪线，适合轻量自立袋，视觉上比纸盒更年轻。' },
  { id: 'i11', brand: '白露香氛', sub: 'WHITE DEW', category: '美妆', style: '高级极简', palette: P('#f1eee9', '#6d5b8e', '#c8a86b', '#2c2634'), kind: 'bottle', structure: 'labelRound', keywords: ['淡紫', '细金线', '通透'], desc: '低饱和紫与细金圈，把香调名称放在最下方，留白占七成。' },
  { id: 'i12', brand: '谷间', sub: 'VALLEY GRAIN', category: '食品', style: '自然有机', palette: P('#f3eee4', '#8a5a3b', '#b99b78', '#3b2b20'), kind: 'pouch', structure: 'pouch', keywords: ['大地色', '麦穗', '朴素'], desc: '大地色系与麦穗线条，正面文字压缩到最小，让材质本身说话。' },
];

export const CATEGORIES = ['全部', '食品', '茶饮', '咖啡', '美妆', '日用品', '保健食品', '礼品', '文创'];

export const QUICK_START = [
  { id: 'box', title: '包装盒', en: 'BOX', desc: '食品盒、茶叶盒、礼品盒、产品外包装', kind: 'box' as MockupKind, palette: P('#f3eee4', '#20463a', '#c8a86b') },
  { id: 'label', title: '产品标签', en: 'LABEL', desc: '瓶贴、罐贴、食品标签、护肤品标签', kind: 'label' as MockupKind, palette: P('#f7f6f2', '#1d1d1b', '#c9c4b8') },
  { id: 'pouch', title: '袋装包装', en: 'POUCH', desc: '自立袋、咖啡袋、零食袋、包装袋', kind: 'pouch' as MockupKind, palette: P('#efe2cd', '#8a5a3b', '#a8352c') },
  { id: 'custom', title: '自定义包装', en: 'CUSTOM', desc: '上传现有包装照片或参考文件，由你确认结构与尺寸', kind: 'gift' as MockupKind, palette: P('#eef1ef', '#22395c', '#c8a86b') },
];

export const FLOW_STEPS = ['描述想法', '确认需求', '选择方案', '编辑设计', '3D 预览', '印前检查', '导出文件'];

export const STRUCTURE_GROUPS = ['盒类', '袋类', '标签类'] as const;
