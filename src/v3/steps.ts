/* 十步向导的步骤定义：每一步只处理一个决定 */
import type { ProjectDraft } from './draft';

export interface StepDef {
  id: string;
  short: string;        // 进度条短名
  kicker: string;
  title: string;
  desc: string;
  why: string;          // 为什么需要填写
  optional?: boolean;   // 可跳过
  mainLabel: string;    // 主按钮文案
}

export const WIZARD_STEPS: StepDef[] = [
  {
    id: 'size', short: '制作尺寸', kicker: 'STEP 01 / 10', title: '首先，确定你的包装尺寸。',
    desc: '告诉 LunaSol 你想制作的包装尺寸，我们会自动处理后续结构和排版。',
    why: '成品尺寸决定刀模、展开面积、文字大小和安全边距，是唯一不能省略的参数。',
    mainLabel: '下一步 · 品牌 Logo',
  },
  {
    id: 'logo', short: '品牌 Logo', kicker: 'STEP 02 / 10', title: '你的品牌，叫什么名字？',
    desc: '已经有 Logo 就上传；还没有，也可以在这里让 AI 做几个方向。',
    why: 'Logo 是包装上识别度最高的元素，会作为独立素材保存，随时可以替换。',
    optional: true, mainLabel: '下一步 · 目标人群',
  },
  {
    id: 'audience', short: '目标人群', kicker: 'STEP 03 / 10', title: '你的产品，希望卖给谁？',
    desc: '不同的消费者，对包装的审美和视觉表达会有不同偏好。',
    why: '人群决定字体气质、配色明度和信息密度，不需要写复杂的人群报告。',
    optional: true, mainLabel: '下一步 · 产品类型',
  },
  {
    id: 'product', short: '产品类型', kicker: 'STEP 04 / 10', title: '你准备包装什么产品？',
    desc: '选择具体品类，系统会推荐合适的布局与内容层级。',
    why: '包装形态（盒子/标签）与产品类型（茶叶/护肤品）是两件事，这里只问产品。',
    mainLabel: '下一步 · 设计风格',
  },
  {
    id: 'style', short: '设计风格', kicker: 'STEP 05 / 10', title: '选择你喜欢的设计风格。',
    desc: '每种风格都有独立的视觉规则、纹样、色彩与排版配置。',
    why: 'AI 会读取这套配置执行具体视觉特征，而不是只把风格名写进提示词。',
    mainLabel: '下一步 · 主颜色',
  },
  {
    id: 'color', short: '主颜色', kicker: 'STEP 06 / 10', title: '为你的包装选择一个主颜色。',
    desc: '可以直接点选、输入 HEX / RGB，也可以从 Logo 提取或让 AI 推荐。',
    why: '主色是整套配色的锚点，后面所有方案都会以它为基础展开。',
    mainLabel: '下一步 · AI 配色',
  },
  {
    id: 'palette', short: 'AI 配色', kicker: 'STEP 07 / 10', title: '让我们为包装搭配一组好看的颜色。',
    desc: '系统结合主色、风格、品类、人群与 Logo 色彩生成 4～6 套方案。',
    why: '颜色之间有主次比例与搭配关系，不同风格使用不同的配色逻辑。',
    optional: true, mainLabel: '下一步 · 图案',
  },
  {
    id: 'illustration', short: '图案选择', kicker: 'STEP 08 / 10', title: '你希望包装上出现什么样的图案？',
    desc: '线稿、彩色插画，或者完全不需要图案，只靠排版与材质。',
    why: '传统艺术风格会优先使用对应时期的纹样逻辑，不会随意混搭。',
    optional: true, mainLabel: '下一步 · 包装文案',
  },
  {
    id: 'copy', short: '包装文案', kicker: 'STEP 09 / 10', title: '告诉我们包装上需要写什么。',
    desc: '所有文字都会成为独立可编辑图层，不会被画进图片里。',
    why: '品牌名、产品名和说明文字决定正面与背面的信息层级。',
    mainLabel: '下一步 · 条形码',
  },
  {
    id: 'barcode', short: '条形码', kicker: 'STEP 10 / 10', title: '需要在包装上添加条形码吗？',
    desc: '可以上传现有条码，或按你提供的有效编码生成矢量条码。',
    why: '零售条码需要合法取得的商品编码；没有也可以先跳过，之后随时补。',
    optional: true, mainLabel: '查看需求汇总',
  },
];

/** 每一步的完成判定：用于进度条、跳到指定步骤、汇总页 */
export function stepDone(d: ProjectDraft, i: number): boolean {
  switch (i) {
    case 0: return d.package_dimensions.known && !!d.package_dimensions.structureId;
    case 1: return d.logo_creation_mode === 'own' ? !!d.brand_logo : d.logo_creation_mode === 'ai' ? !!d.logo_svg : d.logo_creation_mode === 'none';
    case 2: return !!(d.target_audience.ages.length || d.target_audience.groups.length || d.target_audience.tiers.length);
    case 3: return !!(d.product_category.type || d.product_category.custom);
    case 4: return !!d.style_id;
    case 5: return !!d.primary_color;
    case 6: return !!d.color_palette;
    case 7: return !!d.illustration_type;
    case 8: return !!(d.copy_content.brandName || d.copy_content.productName);
    case 9: return d.barcode_asset.needed !== null;
    default: return false;
  }
}

export const stepProgress = (d: ProjectDraft) => WIZARD_STEPS.reduce((n, _s, i) => n + (stepDone(d, i) ? 1 : 0), 0);
