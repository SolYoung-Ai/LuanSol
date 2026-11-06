/* 把统一项目数据模型转换为所有 AI 任务共享的上下文。
 * 九步向导、汇总页、编辑器看到的是同一份状态，不会出现「AI 不知道上一步填了什么」。 */
import type { ProjectDraft } from '../v3/draft';
import { FORM_META } from '../v3/draft';
import { styleById, buildStylePrompt } from '../v3/styles';
import { WIZARD_STEPS, stepDone } from '../v3/steps';
import type { AIContext } from './types';

export function buildAIContext(d: ProjectDraft, userNote = ''): AIContext {
  const cfg = styleById(d.style_id);
  const dm = d.package_dimensions;
  const vals = Object.entries(dm.values || {})
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `${k}=${Math.round(Number(v))}mm`)
    .join(' ');
  const category = d.product_category.type || d.product_category.custom || '';
  const audienceText = [...d.target_audience.groups, ...d.target_audience.tiers, ...d.target_audience.ages].join('、');
  const c = d.copy_content;

  let stylePrompt = '';
  if (cfg) {
    try {
      stylePrompt = buildStylePrompt(cfg, {
        product: category, brand: c.brandName || '品牌',
        audience: audienceText || '大众消费群体', form: FORM_META[d.package_type].label,
        primary: d.primary_color || cfg.dominant_colors[0] || '#20463a',
        motif: d.illustration_type === 'none' ? '不需要图案' : d.illustration_description || cfg.pattern_elements.slice(0, 2).join('、'),
      });
    } catch { stylePrompt = ''; }
  }

  return {
    step: d.step || 0,
    completed: WIZARD_STEPS.filter((_, i) => stepDone(d, i)).length,
    form: d.package_type,
    formLabel: FORM_META[d.package_type]?.label || d.package_type,
    sizeText: vals || '尚未填写',
    structureId: dm.structureId || '',
    category,
    categoryGroup: d.product_category.group || '',
    customCategory: d.product_category.custom || '',
    ages: d.target_audience.ages || [],
    groups: d.target_audience.groups || [],
    tiers: d.target_audience.tiers || [],
    audienceText,
    styleId: d.style_id || '',
    styleName: cfg?.style_name || '',
    styleEra: cfg?.era || '',
    styleFeatures: cfg?.visual_features || [],
    stylePatterns: cfg?.pattern_elements || [],
    styleColors: cfg?.dominant_colors || [],
    stylePrompt,
    primary: d.primary_color || '',
    paletteName: d.color_palette?.name || '',
    paletteColors: d.color_palette ? [d.color_palette.primary, d.color_palette.secondary, d.color_palette.accent, d.color_palette.bg] : [],
    illustrationType: d.illustration_type || '',
    illustrationDescription: d.illustration_description || '',
    brand: c.brandName || '',
    product: c.productName || '',
    tagline: c.tagline || '',
    subtitle: c.subtitle || '',
    spec: c.spec || '',
    description: c.description || '',
    logoMode: d.logo_creation_mode || '',
    logoBrandName: d.logo_ai_spec?.brandName || c.brandName || '',
    barcodeNeeded: d.barcode_asset.needed,
    barcodeType: d.barcode_asset.type || '',
    barcodePreviewOnly: Boolean(d.barcode_asset.previewOnly),
    userNote: userNote.trim(),
  };
}

/** 紧凑的项目状态文本，供所有任务的 user prompt 复用 */
export function contextText(c: AIContext): string {
  return [
    `包装形态：${c.formLabel}（${c.form}）`,
    `成品尺寸：${c.sizeText}；结构：${c.structureId || '未选'}`,
    `产品类型：${c.category || '未填写'}${c.categoryGroup ? `（${c.categoryGroup}）` : ''}`,
    `目标人群：${c.audienceText || '未指定'}`,
    `设计风格：${c.styleName || '未选择'}${c.styleEra ? `（${c.styleEra}）` : ''}`,
    c.styleFeatures.length ? `风格视觉特征：${c.styleFeatures.join('、')}` : '',
    c.stylePatterns.length ? `风格纹样元素：${c.stylePatterns.join('、')}` : '',
    `主色：${c.primary || '未选择'}；配色方案：${c.paletteName || '未选择'}`,
    c.paletteColors.length ? `配色：${c.paletteColors.join(' ')}` : '',
    `图案选择：${c.illustrationType || '未选择'}${c.illustrationDescription ? ` · ${c.illustrationDescription}` : ''}`,
    `品牌名：${c.brand || '未填写'}；产品名：${c.product || '未填写'}`,
    c.tagline ? `宣传语：${c.tagline}` : '',
    c.description ? `产品介绍：${c.description}` : '',
    `条码：${c.barcodeNeeded === false ? '不需要' : c.barcodeType || '未选择'}${c.barcodePreviewOnly ? '（预览占位码）' : ''}`,
    `流程进度：第 ${c.step + 1} 步，已完成 ${c.completed}/10`,
  ].filter(Boolean).join('\n');
}
