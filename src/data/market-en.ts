/* ============================================================
 * 审美市场 · 索引维度的英文名
 * ------------------------------------------------------------
 * 只翻译「维度词」——分组、地区、国家、风格。
 * 站点本身的名称、域名、评论正文一律保留原文：那些是有出处的引用，
 * 翻译会破坏可溯源性与作者原意（与 src/i18n.tsx 的口径一致）。
 *
 * 这些词同时充当筛选键：中文名是数据里的真实取值，英文只用于显示。
 * 所以这里必须是 Map（中文 → 英文），不能反着来，也不能改写数据源。
 * ============================================================ */

export const GROUP_EN: Record<string, string> = {
  视觉灵感: 'Visual discovery',
  数字艺术: 'Digital art',
  品牌识别: 'Brand identity',
  字体排版: 'Typography',
  摄影影像: 'Photography',
  建筑空间: 'Architecture',
  艺术馆藏: 'Art & archives',
  时尚奢侈: 'Fashion & luxury',
  动态影视: 'Motion & cinema',
  独立工作室: 'Independent studios',
};

export const REGION_EN: Record<string, string> = {
  北美: 'North America',
  欧洲: 'Europe',
  亚洲: 'Asia',
  大洋洲: 'Oceania',
  全球: 'Global',
};

export const COUNTRY_EN: Record<string, string> = {
  中国: 'China',
  加拿大: 'Canada',
  国际: 'International',
  希腊: 'Greece',
  德国: 'Germany',
  意大利: 'Italy',
  法国: 'France',
  澳大利亚: 'Australia',
  瑞典: 'Sweden',
  瑞士: 'Switzerland',
  美国: 'United States',
  英国: 'United Kingdom',
  荷兰: 'Netherlands',
  西班牙: 'Spain',
};

export const STYLE_EN: Record<string, string> = {
  东方美学: 'Eastern aesthetics',
  出版印刷: 'Publishing & print',
  动态图形: 'Motion graphics',
  包装结构: 'Packaging structure',
  品牌系统: 'Brand systems',
  字体排印: 'Typography',
  实验先锋: 'Experimental',
  工业设计: 'Industrial design',
  建筑摄影: 'Architectural photography',
  影像色彩: 'Cinematic color',
  插画图形: 'Illustration',
  摄影叙事: 'Photo storytelling',
  数字体验: 'Digital experience',
  时尚影像: 'Fashion imagery',
  极简克制: 'Minimal restraint',
  潮流文化: 'Street & youth culture',
  灵感档案: 'Inspiration archives',
  现代主义: 'Modernism',
  瑞士平面: 'Swiss graphic design',
  生活方式: 'Lifestyle',
  电影构图: 'Cinematic framing',
  空间秩序: 'Spatial order',
  编辑设计: 'Editorial design',
  色彩构成: 'Color composition',
  艺术档案: 'Art archives',
  视觉研究: 'Visual research',
};

/** 取英文名；查不到就原样返回（宁可见到中文，也不显示 undefined） */
export function enName(map: Record<string, string>, zh: string): string {
  return map[zh] || zh;
}
