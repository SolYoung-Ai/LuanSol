/* ============================================================
 * 本地决策引擎：未接 AI 时提供「真实可用的建议」，不是假数据。
 * ------------------------------------------------------------
 * 每条建议都由当前项目状态确定性推导（品类 / 风格 / 人群 / 尺寸），
 * 同一个输入永远得到同一个结果。接入 GPT 后这些函数仍是失败回退，
 * 保证后台不可用、超时或返回违规内容时流程不会中断、也不会说谎。
 * ============================================================ */
import { FORM_META, STRUCTURE_EXTRA, type ProjectDraft } from '../v3/draft';
import { structureById } from '../engine/structure';
import { STYLES, recommendStyles, styleById } from '../v3/styles';
import { generatePalettes, recommendPrimary, nameOfColor } from '../v3/colors';
import { generateLogoOptions } from '../v3/logo';
import { suggestTagline } from '../engine/design';
import { createEmptyBrief } from '../engine/brief';
import type { AIContext, AISuggestion, DraftPatch } from './types';

const PRODUCT_GROUPS: { group: string; items: string[] }[] = [
  { group: '食品', items: ['零食', '糕点', '糖果', '茶叶', '咖啡', '其他食品'] },
  { group: '饮品', items: ['茶饮', '咖啡', '果汁', '酒类', '其他饮品'] },
  { group: '美妆个护', items: ['护肤品', '化妆品', '洗护用品', '香水', '身体护理'] },
  { group: '日用品', items: ['家居用品', '清洁用品', '文具', '生活用品'] },
  { group: '健康产品', items: ['营养品', '保健食品', '其他健康产品'] },
  { group: '礼品与文创', items: ['节日礼品', '文创产品', '品牌周边', '定制礼盒'] },
];

const MOTIF_HINTS: Record<string, string[]> = {
  茶叶: ['远山轮廓', '茶树叶', '云气'], 咖啡: ['咖啡豆', '产地线条', '烘焙色块'],
  糕点: ['食材线稿', '花卉', '节令元素'], 酒类: ['山川', '谷物', '印章'],
  护肤品: ['植物线条', '水波', '极简几何'], 礼品: ['花卉', '丝带', '对称纹样'],
  文创: ['几何构成', '传统纹样', '文字排版'], 零食: ['食材轮廓', '活泼色块', '图形符号'],
};

const hintsFor = (category: string, fallback: string[]) =>
  Object.entries(MOTIF_HINTS).find(([k]) => category.includes(k))?.[1] || fallback;

const sug = (id: string, title: string, detail: string, value?: unknown): AISuggestion => ({ id, title, detail, value });

/** 把结构候选按包装形态 + 品类做真实排序 */
function structureCandidates(c: AIContext): { id: string; why: string }[] {
  const meta = FORM_META[c.form as keyof typeof FORM_META];
  if (!meta) return [];
  const cat = `${c.category}${c.customCategory}${c.audienceText}`;
  const rank: Record<string, number> = { tuck: 3, topBottom: 2, drawer: 1, mailer: 2, pouch: 1, labelRect: 2, labelRound: 1 };
  if (/礼|高端|商务|文创/.test(cat)) { rank.topBottom += 4; rank.drawer += 3; rank.tuck -= 1; }
  if (/电商|快递|订阅|服装/.test(cat)) rank.mailer += 4;
  if (/茶|糕点|零食|食品/.test(cat)) rank.tuck += 2;
  return [...meta.structures]
    .sort((a, b) => (rank[b] ?? 0) - (rank[a] ?? 0))
    .slice(0, 2)
    .map((id) => {
      const st = structureById(id);
      const why = /礼|高端|商务|文创/.test(cat) && (id === 'topBottom' || id === 'drawer')
        ? `${st.use}；开合仪式感更适合礼品与高端定位。`
        : /电商|快递|订阅/.test(cat) && id === 'mailer'
          ? `${st.use}；一体折叠更适合运输保护与快速组装。`
          : `${st.use}；是${c.formLabel}最常见的可量产结构。`;
      return { id, why };
    });
}

export const LOCAL: Record<string, (c: AIContext) => AISuggestion[]> = {
  'size.structure': (c) => {
    const list = structureCandidates(c);
    if (!list.length) return [sug('size-none', '按当前形态填写实测尺寸', `${c.formLabel}暂无可用结构，请先补齐外形尺寸。`)];
    return list.map((x, i) => sug(`structure-${x.id}`,
      `采用「${structureById(x.id as never).name}」${i === 0 ? '（推荐）' : ''}`,
      `${x.why} 采纳后会自动带出该结构的插舌、粘合位等补充参数默认值，你可以直接改成实测值。`,
      { structureId: x.id }));
  },

  'logo.directions': (c) => {
    const brand = c.logoBrandName || c.brand || '你的品牌';
    const st = styleById(c.styleId);
    const era = c.styleEra || st?.era || '';
    const base = [
      { style: '文字标志', why: `以「${brand}」字形为主，识别直接、缩放后依旧清晰，适合${c.category || '多品类'}长期沿用。` },
      { style: '图形徽章', why: `用${c.stylePatterns[0] || '简洁几何'}构成徽记，适合${c.audienceText || '大众消费群体'}的货架识别。` },
      { style: era ? '风格化线稿' : '极简几何', why: era ? `呼应${era}的${c.styleFeatures[0] || '视觉语法'}，让 Logo 与包装纹样同源。` : '用单一几何符号建立记忆点，便于后续做系列化延展。' },
    ];
    return base.map((x, i) => sug(`logo-${i}`, x.style, x.why, { style: x.style }));
  },

  'audience.profile': (c) => {
    const cat = `${c.category}${c.customCategory}`;
    const high = /礼|高端|商务|酒|文创|茶/.test(cat) || /高端|商务|礼品/.test(c.audienceText);
    const young = /零食|糖果|潮玩|饮品|咖啡/.test(cat) || /年轻|儿童|潮流/.test(c.audienceText);
    const beauty = /护肤|化妆|香水|洗护/.test(cat);
    const profiles = [
      high
        ? { ages: ['成年人', '中老年人'], groups: ['商务人士', '高端消费群体'], tiers: ['中高端', '高端礼品'], advice: '低饱和深色主色、细宋体或衬线标题、大留白；金属色只做细线，信息密度低，突出品牌名与系列名。' }
        : beauty
          ? { ages: ['年轻人', '成年人'], groups: ['女性消费者', '大众消费群体'], tiers: ['大众中端', '中高端'], advice: '高明度中性背景、细无衬线字体、单一视觉中心；避免过多装饰，突出成分透明感与产品线区分。' }
          : young
            ? { ages: ['年轻人'], groups: ['年轻潮流人群', '大众消费群体'], tiers: ['平价亲民', '大众中端'], advice: '高饱和撞色、粗黑体主标题、一个强视觉中心；图案可以活泼，但正面文字层级必须清楚。' }
            : { ages: ['成年人', '全年龄段'], groups: ['家庭用户', '大众消费群体'], tiers: ['大众中端'], advice: '中等明度主色、现代无衬线字体、清晰三段式信息层级；配色控制在 3 色以内，适合货架与电商缩略图。' },
    ];
    if (c.userNote) profiles.push({ ...profiles[0], advice: `${profiles[0].advice} 已结合你补充的「${c.userNote.slice(0, 40)}」调整表达重点。` });
    return profiles.map((x, i) => sug(`audience-${i}`,
      `${x.groups.join(' + ')} · ${x.tiers.join(' / ')}`,
      `${x.advice} 年龄：${x.ages.join('、')}。`,
      { ...x }));
  },

  'product.category': (c) => {
    if (c.category || c.customCategory) {
      return [sug('category-keep', `保持「${c.category || c.customCategory}」`, '产品类型已确认，AI 不会擅自改写。下面给出该品类的信息层级建议：品牌名 → 产品名 → 规格 → 法定信息（由你按实际填写）。')];
    }
    const q = c.userNote.trim();
    const hit = q ? PRODUCT_GROUPS.flatMap((g) => g.items.map((i) => ({ g: g.group, i }))).find((x) => q.includes(x.i) || q.includes(x.g)) : undefined;
    if (!hit) return [sug('category-hint', '请在上方选择一个产品类型', '也可以补充一句产品描述，例如「想做一款高山乌龙茶礼盒」，AI 接入后会直接识别品类。')];
    return [sug('category-pick', `归类为「${hit.g} · ${hit.i}」`, `根据「${q.slice(0, 40)}」匹配到已有品类，采纳后可在上方继续修改。`, { group: hit.g, type: hit.i })];
  },

  'style.recommend': (c) => {
    const list = recommendStyles({ category: c.category || c.customCategory, audience: c.audienceText, form: c.form }).slice(0, 3);
    return list.map((s, i) => sug(`style-${s.style_id}`,
      `${s.style_name}${i === 0 ? '（推荐）' : ''}`,
      `${s.description} 视觉特征：${s.visual_features.slice(0, 3).join('、')}；适合：${s.suitable_categories.slice(0, 3).join('、')}。`,
      { style_id: s.style_id }));
  },

  'color.primary': (c) => {
    const st = styleById(c.styleId);
    const fromStyle = recommendPrimary(st);
    const fromPalette = c.styleColors[0] || '';
    const fromLogo = c.paletteColors[0] || '';
    const seen = new Set<string>();
    const items = [
      { color: fromStyle, why: st ? `按「${st.style_name}」的主色规则推荐，符合该风格的${st.paletteLogic || '配色'}逻辑。` : '中性深绿，印刷稳定、与米白背景对比充足，适合多数品类。' },
      fromPalette && fromPalette !== fromStyle ? { color: fromPalette, why: `直接取自「${c.styleName || '风格'}」的典型主色，风格识别度最高。` } : null,
      fromLogo && fromLogo !== fromStyle ? { color: fromLogo, why: '沿用当前配色方案的主色，保持品牌色彩一致。' } : null,
    ].filter((x): x is { color: string; why: string } => Boolean(x && /^#[0-9a-f]{6}$/i.test(x.color) && !seen.has(x.color.toLowerCase()) && !!seen.add(x.color.toLowerCase())));
    return items.map((x, i) => sug(`color-${i}`, `${nameOfColor(x.color)} ${x.color}`, x.why, { color: x.color }));
  },

  'palette.schemes': (c) => {
    const st = styleById(c.styleId);
    const palettes = generatePalettes({
      primary: /^#[0-9a-f]{6}$/i.test(c.primary) ? c.primary : recommendPrimary(st),
      style: st, category: c.category || c.customCategory, audience: c.audienceText,
      logoColors: c.paletteColors.slice(0, 2),
    });
    return palettes.slice(0, 3).map((p, i) => sug(`palette-${p.id}`, p.name,
      `${p.reason} 主色 ${p.primary} / 辅助 ${p.secondary} / 点缀 ${p.accent} / 背景 ${p.bg}，比例 ${p.ratio.join(' : ')}。`,
      { palettes, selectId: p.id }));
  },

  'illustration.motif': (c) => {
    if (c.illustrationType === 'none') {
      return [sug('motif-none', '保持「不需要插画」', '已明确不添加装饰图案。设计将只使用纯色、排版、材质与字体层级；AI 接入后同样受此约束，不会擅自生成纹样。')];
    }
    const st = styleById(c.styleId);
    const fromStyle = st?.pattern_elements.slice(0, 3) || [];
    const fromCat = hintsFor(c.category || c.customCategory, ['品牌相关元素', '产地元素', '材质纹理']);
    const list = [
      { d: fromStyle.join('、'), why: `严格使用「${st?.style_name}」自身时期的纹样语法，不混搭其它历史时期元素。` },
      { d: fromCat.slice(0, 3).join('、'), why: `呼应「${c.category || '当前品类'}」的产品联想，${c.illustrationType === 'line' ? '以单色线稿表达' : '可作为彩色插画主体'}。` },
      ...(c.userNote ? [{ d: c.userNote.slice(0, 50), why: '按你补充的想法直接作为图案描述，采纳后仍可逐字修改。' }] : []),
    ].filter((x) => x.d);
    return list.map((x, i) => sug(`motif-${i}`, x.d, x.why, { description: x.d }));
  },

  'copy.suggestion': (c) => {
    const name = c.product || c.category || '本产品';
    const b = createEmptyBrief();
    b.product = name; b.category = c.categoryGroup; b.style = c.styleName;
    const tag = suggestTagline(b);
    const note = c.userNote ? `（结合「${c.userNote.slice(0, 30)}」）` : '';
    return [
      sug('copy-a', `宣传语：${tag}`, `以产品名与${c.styleName || '当前风格'}气质生成，不含功效、认证与法规表述${note}。`, { tagline: tag, subtitle: '', description: '' }),
      sug('copy-b', `副标题：${name} · 精选系列`, '用于补充产品线与场景，不写死批次、日期或限量数量；采纳后请按实际核实。', { tagline: '', subtitle: `${name} · 精选系列`, description: '' }),
      sug('copy-c', '产品介绍：一句话说清特点与使用场景', '只描述可核实的口感、材质或使用场景；配料、生产日期、净含量、功效、认证与许可信息需要你在上方按实际填写，系统不会代写。', { tagline: '', subtitle: '', description: `以${name}为核心，用一句话说明特点与适用场景。` }),
    ];
  },

  'barcode.advice': (c) => [
    sug('barcode-a', '零售商品：使用合法取得的 GTIN', 'EAN-13 / UPC-A 编码必须由你从正规编码机构取得并自行填入。系统只做校验位验证与矢量绘制，绝不生成看似有效、可冒充零售的条码数字。', { type: 'EAN-13' }),
    sug('barcode-b', '内部管理：Code 128 + 自有 SKU', '只用于库存与内部流转，不能作为零售商品条码；编码内容由你自行定义。', { type: 'Code 128' }),
    ...(c.barcodeNeeded === false ? [sug('barcode-c', '暂时不需要条码', '可以先跳过，之后在编辑器里补充，不会阻断当前项目。')] : []),
  ],

  'review.directions': (c) => [
    sug('plan-0', '方案 A · 品牌与留白', `突出品牌名与${c.styleName || '所选风格'}的克制表达，留白为主，图案降到最低。`, { title: '方案 A · 品牌与留白', focus: `突出品牌名与${c.styleName || '所选风格'}的克制表达，留白为主，图案降到最低。` }),
    sug('plan-1', '方案 B · 图案与插画', c.illustrationType === 'none'
      ? '用户选择不需要插画：本方案改用色彩分区与排版节奏制造变化，不添加装饰。'
      : `以「${c.illustrationDescription || c.stylePatterns.slice(0, 2).join('、') || '风格纹样'}」为主视觉，文字压在留白处。`,
      { title: '方案 B · 图案与插画', focus: c.illustrationType === 'none' ? '用户选择不需要插画：本方案改用色彩分区与排版节奏制造变化，不添加装饰。' : `以「${c.illustrationDescription || c.stylePatterns.slice(0, 2).join('、') || '风格纹样'}」为主视觉，文字压在留白处。` }),
    sug('plan-2', '方案 C · 结构与商业表达', `强调信息层级与货架识别，采用${c.styleName || '当前风格'}的配色与构图规则，适合系列化 SKU。`, { title: '方案 C · 结构与商业表达', focus: `强调信息层级与货架识别，采用${c.styleName || '当前风格'}的配色与构图规则，适合系列化 SKU。` }),
  ],

  'editor.modify': () => [],
};

/** 采纳动作：全部使用函数式 patch，永远基于最新 draft，不覆盖用户已确认内容 */
export const ADOPT: Record<string, (s: AISuggestion, patch: DraftPatch) => void> = {
  'size.structure': (s, patch) => {
    const id = (s.value as { structureId?: string })?.structureId;
    if (!id) return;
    const defs = STRUCTURE_EXTRA[id as keyof typeof STRUCTURE_EXTRA] || [];
    const extra = Object.fromEntries(defs.map((e) => [e.key, e.def]));
    // 采纳后直接带上该结构的默认补充参数，并按真实数据置为已确认；
    // 否则「采纳 AI 推荐」会把用户重新卡在「请先确认结构补充参数」上。
    const confirmed = defs.every((e) => extra[e.key] !== undefined && !Number.isNaN(Number(extra[e.key])));
    patch((d) => ({
      package_dimensions: {
        ...d.package_dimensions, structureId: id as ProjectDraft['package_dimensions']['structureId'],
        structureConfirmed: confirmed,
        extra,
      },
    }));
  },
  'logo.directions': (s, patch) => {
    const style = String((s.value as { style?: string })?.style || '文字标志');
    patch((d) => {
      const spec = { ...d.logo_ai_spec, style, brandName: d.logo_ai_spec.brandName || d.copy_content.brandName };
      return {
        logo_creation_mode: 'ai', logo_ai_spec: spec,
        logo_options: generateLogoOptions(spec), logo_selected: '', logo_svg: '', brand_logo: null,
      };
    });
  },
  'audience.profile': (s, patch) => {
    const v = s.value as { ages: string[]; groups: string[]; tiers: string[]; advice: string };
    if (!v?.groups) return;
    patch((d) => ({ target_audience: { ...d.target_audience, ages: v.ages, groups: v.groups, tiers: v.tiers, advice: v.advice, aiRecommend: true } }));
  },
  'product.category': (s, patch) => {
    const v = s.value as { group: string; type: string };
    if (!v?.type) return;
    patch((d) => ({ product_category: { ...d.product_category, group: v.group, type: v.type, custom: '' } }));
  },
  'style.recommend': (s, patch) => {
    const id = String((s.value as { style_id?: string })?.style_id || '');
    const cfg = STYLES.find((x) => x.style_id === id);
    if (!cfg) return;
    patch(() => ({ style_id: id, style_parameters: JSON.stringify(cfg), primary_color: '', color_palette: null, color_palettes: [], color_palette_id: '' }));
  },
  'color.primary': (s, patch) => {
    const color = String((s.value as { color?: string })?.color || '');
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    patch(() => ({ primary_color: color, color_palette: null, color_palettes: [], color_palette_id: '' }));
  },
  'palette.schemes': (s, patch) => {
    const v = s.value as { palettes?: ProjectDraft['color_palettes']; selectId?: string };
    if (!v?.palettes?.length) return;
    patch(() => ({ color_palettes: v.palettes!, color_palette_id: v.selectId || v.palettes![0].id, color_palette: v.palettes!.find((p) => p.id === v.selectId) || v.palettes![0] }));
  },
  'illustration.motif': (s, patch) => {
    const v = s.value as { description?: string };
    if (!v?.description) return;
    patch((d) => ({ illustration_description: d.illustration_type === 'none' ? '' : v.description! }));
  },
  'copy.suggestion': (s, patch) => {
    const v = s.value as { tagline?: string; subtitle?: string; description?: string };
    if (!v) return;
    patch((d) => {
      const c = d.copy_content;
      // 只填空字段：用户已确认的文案绝不改写
      return { copy_content: {
        ...c, tagline: c.tagline || v.tagline || '', subtitle: c.subtitle || v.subtitle || '',
        description: c.description || v.description || '', mode: 'ai', confirmed: false,
        aiSuggestion: [v.tagline && `建议宣传语：${v.tagline}`, v.subtitle && `建议副标题：${v.subtitle}`, v.description && `建议产品介绍：${v.description}`].filter(Boolean).join('\n'),
      } };
    });
  },
  'barcode.advice': (s, patch) => {
    const v = s.value as { type?: string };
    if (!v?.type) return;
    patch((d) => ({ barcode_asset: { ...d.barcode_asset, needed: true, type: v.type as ProjectDraft['barcode_asset']['type'], svg: '' }, barcode_type: v.type as ProjectDraft['barcode_type'] }));
  },
  'review.directions': () => { /* 汇总页直接读取 suggestions，无需写回 draft */ },
  'editor.modify': () => { /* 编辑器沿用原有局部修改补丁流程 */ },
};
