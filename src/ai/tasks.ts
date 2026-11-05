/* ============================================================
 * AI 任务注册表 —— 「给后台接入留位置」的核心
 * ------------------------------------------------------------
 * 每个流程节点都在这里声明：需要什么上下文、期望什么输出、
 * 哪些内容绝对不能生成、AI 不可用时如何回退、用户采纳后写哪里。
 * 后台接好 GPT 后，这些定义原样生效，不需要改任何流程或 UI 代码。
 * ============================================================ */
import { FORM_META, type ProjectDraft } from '../v3/draft';
import { STYLES } from '../v3/styles';
import { styleById } from '../v3/styles';
import { generatePalettes, recommendPrimary, isHex } from '../v3/colors';
import { contextText } from './context';
import { LOCAL, ADOPT } from './local';
import type { AIContext, AISuggestion, AITaskDef, AITaskId } from './types';

const SCHEMA = '{"suggestions":[{"title":"建议标题(不超过 20 字)","detail":"理由与说明(不超过 80 字)","value":{}}]}';

/** 文案合规：这些词一旦出现在 AI 生成的包装文字里，整条建议作废 */
const FORBIDDEN_COPY = /成分|配料|生产日期|保质期|有效期|功效|疗效|治疗|治愈|认证|有机|ISO|QS|许可证|无添加|纯天然|包治|专利|SC\d{8,}/i;
/** 条码合规：不许生成看似有效的商品编码 */
const FORBIDDEN_BARCODE = /\d{8,}/;

const STEP_TASK: AITaskId[] = [
  'size.structure', 'logo.directions', 'audience.profile', 'product.category', 'style.recommend',
  'color.primary', 'palette.schemes', 'illustration.motif', 'copy.suggestion', 'barcode.advice',
];
export const TASK_FOR_STEP = (step: number): AITaskId => STEP_TASK[Math.max(0, Math.min(9, step))];

const userFor = (c: AIContext, task: string) =>
  `${task}\n\n【当前项目状态】\n${contextText(c)}\n${c.stylePrompt ? `\n【已选风格的完整设计规则】\n${c.stylePrompt}\n` : ''}${c.userNote ? `\n【用户补充的想法】${c.userNote}\n` : ''}\n只输出 JSON，不要输出解释文字或 Markdown 代码块。`;

type RawSuggestion = { title?: unknown; detail?: unknown; value?: unknown };
const rawList = (raw: unknown): RawSuggestion[] => {
  const r = raw as { suggestions?: unknown };
  return Array.isArray(r?.suggestions) ? r.suggestions as RawSuggestion[] : [];
};
const baseValid = (raw: unknown): boolean => {
  const list = rawList(raw);
  return list.length >= 1 && list.length <= 6 && list.every((x) =>
    x && typeof x.title === 'string' && x.title.trim().length > 0 &&
    typeof x.detail === 'string' && x.detail.trim().length > 0);
};
const values = (raw: unknown): Record<string, unknown>[] =>
  rawList(raw).map((x) => (x.value && typeof x.value === 'object' ? x.value as Record<string, unknown> : {}));

const parseCommon = (id: AITaskId, raw: unknown): AISuggestion[] =>
  rawList(raw).map((x, i) => ({
    id: `ai-${id}-${i}`,
    title: String(x.title).trim().slice(0, 40),
    detail: String(x.detail).trim().slice(0, 220),
    value: x.value && typeof x.value === 'object' ? x.value : {},
  }));

const C = (s: string[]) => s;

/** 系统提示词统一带上「不得编造法定信息、不得改写用户已确认内容」的底线 */
const SYSTEM_BASE = '你是 LunaSol 包装设计助手，服务于没有设计经验的普通用户。建议要具体、可执行、使用简体中文；只输出严格 JSON。禁止编造配料、生产日期、功效、认证、许可与法规内容；禁止生成可冒充零售商品的条码数字；禁止建议覆盖用户已经确认的品牌名、产品名与商标。';

function def(id: AITaskId, step: number | 'review' | 'editor', title: string, hint: string,
  taskPrompt: string, valueSchema: string, constraints: string[],
  extraValidate: (raw: unknown, c: AIContext) => boolean = () => true,
  extraParse?: (raw: unknown, c: AIContext) => AISuggestion[]): AITaskDef {
  return {
    id, step, title, hint,
    system: `${SYSTEM_BASE}\n${taskPrompt}\n${constraints.length ? `本节点额外约束：${constraints.join('；')}。` : ''}`,
    schema: `${SCHEMA}\n其中 value 结构：${valueSchema}`,
    constraints,
    buildUser: (c) => userFor(c, taskPrompt),
    local: LOCAL[id],
    validate: (raw, c) => baseValid(raw) && extraValidate(raw, c),
    parse: extraParse || ((raw) => parseCommon(id, raw)),
    adopt: ADOPT[id],
  };
}

const VALID_BARCODE_TYPES = ['EAN-13', 'UPC-A', 'Code 128'];
const KNOWN_CATEGORIES = ['零食', '糕点', '糖果', '茶叶', '咖啡', '茶饮', '果汁', '酒类', '护肤品', '化妆品', '洗护用品', '香水', '身体护理', '家居用品', '清洁用品', '文具', '生活用品', '营养品', '保健食品', '节日礼品', '文创产品', '品牌周边', '定制礼盒'];

export const AI_TASKS: Record<AITaskId, AITaskDef> = {
  'size.structure': def('size.structure', 0, '尺寸与结构建议', '根据包装形态与产品类型，推荐可量产的真实结构；采纳后仍需你确认结构补充参数。',
    '结合包装形态与产品类型，推荐 1–2 种真实可量产的包装结构，说明为什么适合这个产品与销售渠道。不要建议不存在的结构，也不要假定插舌、粘合位等具体几何值。',
    '{"structureId":"tuck | topBottom | drawer | mailer | pouch | labelRect | labelRound"}',
    C(['structureId 必须来自当前包装形态允许的结构列表', '不得编造尺寸数值', '不得替用户确认结构参数']),
    (raw, c) => {
      const allowed = FORM_META[c.form as keyof typeof FORM_META]?.structures || [];
      const vs = values(raw);
      return vs.length > 0 && vs.every((v) => typeof v.structureId === 'string' && allowed.includes(v.structureId as never));
    }),

  'logo.directions': def('logo.directions', 1, 'Logo 方向建议', '结合品牌名、品类与风格，给出三个不同的 Logo 设计方向；采纳后会生成对应的矢量草图供你挑选。',
    '为这个品牌提出 3 个明显不同的 Logo 设计方向（例如文字标志、图形徽章、风格化线稿），说明各自适用的识别场景。',
    '{"style":"方向名称"}',
    C(['不得声称已完成商标注册或商标检索', '不得建议直接模仿第三方品牌', 'Logo 需作为独立矢量素材'])),

  'audience.profile': def('audience.profile', 2, '目标人群建议', '根据产品类型与风格，推荐年龄、消费群体与定位组合，并给出对应的包装表达建议。',
    '推断最合适的目标消费群体组合，并给出对应的字体气质、配色明度与信息密度建议。',
    '{"ages":["成年人"],"groups":["家庭用户"],"tiers":["大众中端"],"advice":"视觉表达建议"}',
    C(['groups / tiers / ages 必须是字符串数组', '不要输出虚构的市场调研数据或百分比']),
    (raw) => values(raw).every((v) => Array.isArray(v.groups) && Array.isArray(v.tiers) && Array.isArray(v.ages) && typeof v.advice === 'string')),

  'product.category': def('product.category', 3, '品类识别建议', '如果还没选产品类型，可以用一句话描述产品，AI 会从已有品类库里归类；已选类型不会被改写。',
    '把用户描述归入已有产品品类库，或说明当前品类对应的包装信息层级。不要创造新品类。',
    '{"group":"食品","type":"茶叶"}',
    C(['type 必须来自已知品类库', '不得编造配料、功效、认证与法规信息', '用户已选品类时不要建议替换']),
    (raw, c) => values(raw).every((v) => !v.type || (typeof v.type === 'string' && KNOWN_CATEGORIES.includes(v.type)))),

  'style.recommend': def('style.recommend', 4, '风格推荐', '结合品类、人群与包装形态，从真实风格库里推荐三个方向；传统风格会严格遵守各自时期的视觉语法。',
    '从风格数据库里挑出 3 个最合适的设计风格，说明为什么匹配当前产品与人群，以及各自的视觉特征。',
    '{"style_id":"风格数据库中的 style_id"}',
    C(['style_id 必须是风格数据库中真实存在的 id', '不得混搭不同历史时期的纹样', '不得发明不在库里的风格']),
    (raw) => values(raw).every((v) => typeof v.style_id === 'string' && STYLES.some((s) => s.style_id === v.style_id))),

  'color.primary': def('color.primary', 5, '主色推荐', '按所选风格的配色规则、品类与人群，推荐 1–3 个可作为锚点的主色。',
    '推荐适合作为包装主锚点的颜色，给出 HEX 与理由。颜色必须能用于印刷，避免过亮或对比不足。',
    '{"color":"#20463a"}',
    C(['color 必须是 6 位 HEX 颜色', '不得输出色名而不给 HEX']),
    (raw) => values(raw).every((v) => typeof v.color === 'string' && isHex(v.color) && /^#[0-9a-f]{6}$/i.test(v.color))),

  'palette.schemes': def('palette.schemes', 6, 'AI 配色方案', '生成 2–3 套带主次比例的配色；采纳后可直接进入实时预览并单独调整每个颜色。',
    '基于主色与风格配置，提出 2–3 套完整配色（主色 / 辅助色 / 点缀色 / 背景色），说明主次关系与适用场景。',
    '{"primary":"#20463a","secondary":"#8a9a86","accent":"#c8a86b","bg":"#f7f5ef"}',
    C(['四个颜色都必须是 6 位 HEX', '必须保持主次比例，不能给出四个同等权重的颜色', '传统风格配色需符合该时期色彩习惯']),
    (raw) => {
      const vs = values(raw);
      return vs.length > 0 && vs.every((v) => ['primary', 'secondary', 'accent', 'bg'].every((k) => typeof v[k] === 'string' && /^#[0-9a-f]{6}$/i.test(String(v[k]))));
    },
    (raw, c) => {
      const st = styleById(c.styleId);
      const base = generatePalettes({ primary: /^#[0-9a-f]{6}$/i.test(c.primary) ? c.primary : recommendPrimary(st), style: st, category: c.category, audience: c.audienceText });
      return rawList(raw).map((x, i) => {
        const v = (x.value && typeof x.value === 'object' ? x.value : {}) as Record<string, string>;
        const skeleton = base[0];
        const p: ProjectDraft['color_palettes'][number] = {
          ...skeleton, id: `ai-palette-${i}`, name: String(x.title).trim().slice(0, 24) || `AI 配色 ${i + 1}`,
          primary: v.primary, secondary: v.secondary, accent: v.accent, bg: v.bg,
          reason: String(x.detail).trim().slice(0, 160), source: 'ai',
        };
        return { id: `ai-palette-s-${i}`, title: p.name, detail: p.reason, value: { palettes: [p], selectId: p.id } };
      });
    }),

  'illustration.motif': def('illustration.motif', 7, '图案与插画描述', '结合风格纹样元素与品类联想，给出可直接使用的图案描述；选择「不需要插画」时不会生成任何装饰。',
    '给出 2–3 个具体的包装图案描述，必须遵守所选风格自身的纹样语法；若用户选择不需要插画，则不要提出任何图案。',
    '{"description":"远山轮廓、茶树叶与一缕云气"}',
    C(['用户选择「不需要插画」时禁止输出任何图案建议', '传统风格不得混用其它历史时期元素', '描述不能包含品牌 Logo 或法定文字']),
    (raw, c) => c.illustrationType !== 'none' && values(raw).every((v) => typeof v.description === 'string' && v.description.trim().length > 0)),

  'copy.suggestion': def('copy.suggestion', 8, '包装文案建议', '生成宣传语、副标题与产品介绍草稿；采纳后只填入空白字段，你已确认的文案不会被改写。',
    '为包装撰写简洁的宣传语、副标题与产品介绍草稿，符合所选风格气质。',
    '{"tagline":"宣传语","subtitle":"副标题","description":"产品介绍"}',
    C(['严禁编造配料、生产日期、保质期、功效、认证、许可与法规内容', '严禁写成「已通过 XX 认证」「含 XX 成分」等表述', '不得改写用户已填写的品牌名与产品名']),
    (raw) => values(raw).every((v) =>
      !FORBIDDEN_COPY.test([v.tagline, v.subtitle, v.description].map((x) => String(x || '')).join(' ')))),

  'barcode.advice': def('barcode.advice', 9, '条码合规建议', '说明该用哪种码、哪些数字必须自行合法取得；系统不会替你编造可零售的商品条码。',
    '给出条码类型与合规建议，提醒零售 GTIN 必须由用户合法取得。',
    '{"type":"EAN-13 | UPC-A | Code 128"}',
    C(['绝对不能生成 8 位以上连续数字或具体商品编码', '不得声称生成的占位码可用于零售', 'type 只能是 EAN-13 / UPC-A / Code 128']),
    (raw) => values(raw).every((v) =>
      VALID_BARCODE_TYPES.includes(String(v.type)) && !FORBIDDEN_BARCODE.test(JSON.stringify(v)))),

  'review.directions': def('review.directions', 'review', '三个设计方向', '整合十步数据，规划三个明显不同但都遵守同一需求的设计方向，再交给矢量设计引擎生成可编辑稿。',
    '作为包装设计总监，规划 3 个明显不同但都严格遵守同一份需求的设计方向，每个方向一句话说明视觉重点。',
    '{"title":"方案 A · 品牌与留白","focus":"视觉重点，一句话"}',
    C(['必须恰好 3 个方向', '若用户选择「不需要插画」，任何方向都不得提出添加装饰图案', '方向之间必须明显不同']),
    (raw) => rawList(raw).length === 3 && values(raw).every((v) => typeof v.title === 'string' && typeof v.focus === 'string')),

  'editor.modify': def('editor.modify', 'editor', 'AI 局部修改', '编辑器内的自然语言修改意图解析；接入后由 AI 输出图层级补丁，而不是整包重生成。',
    '把用户对包装的修改要求转成针对具体图层的局部修改意图。',
    '{"ops":[]}',
    C(['只能修改对应图层', '不得整包重生成已确认内容'])),
};

export const TASK_LIST = Object.values(AI_TASKS);
