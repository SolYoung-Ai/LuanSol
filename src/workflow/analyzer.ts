/* ============================================================
 * AI 设计分析器（任务书第四、五部分）
 * ------------------------------------------------------------
 * 诚实能力边界：当前云函数没有视觉理解端点，文本模型看不到图片。
 * 因此分析只能基于：
 *   1) 用户的自然语言描述；
 *   2) 前端真实计算的客观信号（尺寸、宽高比、Canvas 采样主色）；
 *   3) 用户对每张参考图的备注与用途说明。
 * 报告 source 固定为 'text-frontend'；结构/材质/工艺一律标记推测，
 * 不编造合规信息，不假装识别出图片里的具体对象。
 * ============================================================ */
import type {
  AnalysisReport,
  CreationMode,
  DesignConcept,
  ProductInfo,
  ReferenceImage,
  ReferenceRole,
} from '../types';
import { llmJson, type LLMMessage } from '../engine/llm';
import type { AISettings } from '../types';
import { getAIGate, reportAIUsage } from '../ai/gate';
import { uid } from '../engine/utils';

const REFERENCE_ROLE_LABELS: Record<ReferenceRole, string> = {
  packaging: '包装参考图',
  product: '产品照片',
  competitor: '竞品包装',
  logo: '品牌 Logo',
  brandGuideline: '品牌视觉规范',
  font: '字体参考',
  material: '材质参考',
  finishing: '印刷工艺参考',
  sketch: '手绘草图',
  other: '其他灵感',
};

const MODE_LABELS: Record<CreationMode, string> = {
  referenceStyle: '参考风格创作：提取参考图的设计语言，但不复制第三方 Logo/商标/完整作品',
  referenceInnovate: '参考基础上创新：学习部分设计特点，结合用户品牌重新设计',
  fromScratch: '完全从零开始：不依赖参考图，根据产品信息自行构思',
};

/** 构造参考图的客观信号文本（不含任何主观臆测） */
function referenceContext(refs: ReferenceImage[]): string {
  if (!refs.length) return '（用户未上传参考图）';
  return refs.map((r, i) => {
    const orientation = r.ratio > 1.2 ? '横向构图' : r.ratio < 0.8 ? '竖向构图' : '近方形构图';
    return [
      `图 ${i + 1}「${r.name}」`,
      `  用途：${REFERENCE_ROLE_LABELS[r.role]}`,
      `  客观信号：原始 ${r.naturalW}×${r.naturalH}px，${orientation}，宽高比 ${r.ratio.toFixed(2)}`,
      `  采样主色（Canvas 像素统计）：${r.dominantColors.join('、') || '未提取到明显主色'}`,
      r.note ? `  用户备注：${r.note}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n');
}

/** 过统一积分闸门；失败抛出带真实原因的错误，由组件展示 */
async function ensureCredit(): Promise<void> {
  const gate = getAIGate();
  if (!gate) return;
  const g = await gate('chat');
  if (!g.ok) throw new Error(g.reason || '需要登录或订阅后使用 AI 功能');
}

const ANALYSIS_SYSTEM = `你是 LunaSol 的资深包装设计总监，精通包装结构、印刷工艺、材质、字体排版、色彩与品牌定位。

【关键能力边界，必须严格遵守】
你看不到任何图片。下面给你的"参考图信息"只有客观信号（像素尺寸、宽高比、程序采样的主色）和用户自己写的备注。你绝对不能声称识别出了图片里的具体物体、精确结构或真实工艺。
- 凡涉及包装结构、材质、印刷工艺的判断，只能基于用户文字与主色做"推测"，confidence 不超过 medium，信息不足时给 low，并在 needsConfirmation / uncertainties 里写明需要用户确认。
- 禁止把光影效果直接认定为烫金/UV 等真实工艺。
- 禁止编造生产商、生产许可证、营养成分、条码数字、执行标准等法规信息；这些只能放进 requiredInformation，标记为待用户提供。
- 主色应优先采用程序采样到的 HEX，并给出 rgb 字段与角色。

只输出一个 JSON 对象，字段如下（不要输出 Markdown 或解释）：
{
  "productUnderstanding": "一句话概括产品与设计目标",
  "structure": { "suggestedType": "推测的包装类型", "shape": "外形特征", "features": "结构/开合特征", "confidence": "low|medium|high", "needsConfirmation": "需要用户确认的结构信息" },
  "materials": [{ "name": "材质名", "visualFeature": "视觉/纹理/反光特征", "recommendedAlternative": "可替代材质", "inferred": true }],
  "finishing": [{ "name": "工艺名", "visualEvidence": "视觉依据", "inferred": true }],
  "palette": [{ "hex": "#RRGGBB", "rgb": "r,g,b", "role": "primary|secondary|accent|background|ink", "proportion": 0.0 }],
  "typography": { "titleStyle": "标题字体气质", "bodyStyle": "正文字体气质", "hierarchy": "字号/字重层级", "suggestions": "可执行字体建议" },
  "graphics": [{ "element": "图形/插画元素", "style": "风格", "color": "颜色", "usage": "用途/位置", "generationHint": "生成建议" }],
  "layout": { "logoPosition": "Logo 位置", "mainVisual": "主视觉区域", "hierarchy": "信息层级", "whitespace": "留白比例" },
  "brandPositioning": { "personality": "品牌性格", "positioning": "定位", "audience": "目标人群", "priceSense": "价格感", "emotion": "情绪表达" },
  "requiredInformation": ["需要用户补充的合规/产品信息"],
  "uncertainties": ["不确定/需确认项"],
  "designConstraints": ["设计约束"]
}`;

function normalizeReport(raw: Partial<AnalysisReport>): AnalysisReport {
  const fallback = {
    productUnderstanding: '',
    structure: {
      suggestedType: '', shape: '', features: '',
      confidence: 'low' as const, needsConfirmation: '',
    },
    materials: [], finishing: [], palette: [],
    typography: { titleStyle: '', bodyStyle: '', hierarchy: '', suggestions: '' },
    graphics: [],
    layout: { logoPosition: '', mainVisual: '', hierarchy: '', whitespace: '' },
    brandPositioning: {
      personality: '', positioning: '', audience: '', priceSense: '', emotion: '',
    },
    requiredInformation: [], uncertainties: [], designConstraints: [],
  };
  return {
    source: 'text-frontend',
    ...fallback,
    ...raw,
    structure: { ...fallback.structure, ...(raw.structure || {}) },
    typography: { ...fallback.typography, ...(raw.typography || {}) },
    layout: { ...fallback.layout, ...(raw.layout || {}) },
    brandPositioning: { ...fallback.brandPositioning, ...(raw.brandPositioning || {}) },
    confirmed: false,
    at: Date.now(),
  };
}

/** 执行结构化分析，返回可编辑、可被后续节点调用的分析报告 */
export async function runAnalysis(
  productInfo: ProductInfo,
  refs: ReferenceImage[],
  mode: CreationMode,
  ai: AISettings,
): Promise<AnalysisReport> {
  await ensureCredit();
  const userContent = [
    `创作模式：${MODE_LABELS[mode]}`,
    '',
    '【产品信息】',
    `自然语言需求：${productInfo.description || '（未填写）'}`,
    productInfo.productName ? `产品名称：${productInfo.productName}` : '',
    productInfo.brandName ? `品牌名称：${productInfo.brandName}` : '',
    productInfo.productType ? `产品类型：${productInfo.productType}` : '',
    productInfo.audience ? `目标消费者：${productInfo.audience}` : '',
    productInfo.pricePositioning ? `价格定位：${productInfo.pricePositioning}` : '',
    productInfo.salesScene ? `销售场景：${productInfo.salesScene}` : '',
    productInfo.packagingType ? `包装类型：${productInfo.packagingType}` : '',
    productInfo.expectedSize ? `预计尺寸：${productInfo.expectedSize}` : '',
    productInfo.brandMainColor ? `品牌主色：${productInfo.brandMainColor}` : '',
    productInfo.specialRequirements ? `特殊要求：${productInfo.specialRequirements}` : '',
    '',
    '【参考图客观信号与用户备注】',
    referenceContext(refs),
  ].filter(Boolean).join('\n');

  const messages: LLMMessage[] = [
    { role: 'system', content: ANALYSIS_SYSTEM },
    { role: 'user', content: userContent },
  ];
  const raw = await llmJson<Partial<AnalysisReport>>(messages, ai);
  reportAIUsage('chat');
  return normalizeReport(raw);
}

const CONCEPT_SYSTEM = `你是 LunaSol 的包装设计总监。基于已确认的结构化分析报告，产出三个差异化的设计方向。
要求：
- 三个方向分别对应 key="faithful"（忠实参考）、key="brandOptimized"（品牌优化）、key="creative"（创意探索）。
- 每个方向都要具体可执行，颜色用 HEX，结合报告中的色彩/字体/图形规范。
- 不得复制第三方品牌 Logo/商标/完整作品。
只输出一个 JSON 对象：{ "concepts": [ ... ] }，每个元素字段：
{
  "key": "faithful|brandOptimized|creative",
  "name": "方案名",
  "concept": "设计概念",
  "visualKeywords": ["视觉关键词"],
  "colors": ["#hex"],
  "materialDirection": "材质方向",
  "structure": "包装结构",
  "typographyDirection": "字体方向",
  "illustrationDirection": "插画方向",
  "composition": "构图方式",
  "expectedEffect": "预期效果",
  "referenceRelation": "与参考图的关联"
}`;

/** 基于已确认报告生成三个设计方向 */
export async function generateConcepts(
  analysis: AnalysisReport,
  mode: CreationMode,
  ai: AISettings,
): Promise<DesignConcept[]> {
  await ensureCredit();
  const userContent = [
    `创作模式：${MODE_LABELS[mode]}`,
    `已确认分析报告（JSON）：${JSON.stringify(analysis)}`,
  ].join('\n');
  const messages: LLMMessage[] = [
    { role: 'system', content: CONCEPT_SYSTEM },
    { role: 'user', content: userContent },
  ];
  const raw = await llmJson<{ concepts?: Partial<DesignConcept>[] }>(messages, ai);
  reportAIUsage('chat');

  const wantedKeys: DesignConcept['key'][] = ['faithful', 'brandOptimized', 'creative'];
  const concepts: DesignConcept[] = [];
  (raw.concepts || []).forEach((c, i) => {
    const key = c.key && wantedKeys.includes(c.key) ? c.key : wantedKeys[i];
    if (!key) return;
    concepts.push({
      id: uid('concept'),
      key,
      name: c.name || '',
      concept: c.concept || '',
      visualKeywords: Array.isArray(c.visualKeywords) ? c.visualKeywords : [],
      colors: Array.isArray(c.colors) ? c.colors : [],
      materialDirection: c.materialDirection || '',
      structure: c.structure || '',
      typographyDirection: c.typographyDirection || '',
      illustrationDirection: c.illustrationDirection || '',
      composition: c.composition || '',
      expectedEffect: c.expectedEffect || '',
      referenceRelation: c.referenceRelation || '',
    });
  });
  return concepts;
}
