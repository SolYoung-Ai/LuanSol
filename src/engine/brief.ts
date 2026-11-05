/* 需求理解 Agent：把自然语言逐步收敛成结构化设计需求。
 * 无 API Key 时使用确定性中文解析器（不伪装成 AI）；配置模型后调用真实 LLM 增强。 */
import type { AISettings, DesignBrief, StructureId } from '../types';
import { llmJson } from './llm';
import { clamp, round } from './utils';

export const COLOR_WORDS: Record<string, string> = {
  米白: '#f3eee4', 奶油: '#f8f1e1', 象牙白: '#f6f2e8', 白色: '#ffffff', 黑色: '#181818', 墨黑: '#1d1d1b',
  深绿: '#20463a', 墨绿: '#20463a', 森林绿: '#2f5d4a', 浅绿: '#a8bfa6', 焦糖: '#a9673f', 棕色: '#8a5a3b',
  大地色: '#b99b78', 暖橙: '#d98b5f', 红色: '#a8352c', 酒红: '#7b2d35', 粉色: '#e7b9bf', 珊瑚: '#e98f78',
  蓝色: '#2b4c7e', 深蓝: '#22395c', 天蓝: '#8fb8d6', 紫色: '#6d5b8e', 黄色: '#e8c04a', 金色: '#c8a86b',
  银色: '#c9c9c9', 灰色: '#8d8d8a', 浅灰: '#dedbd4', 莫兰迪: '#a9a39a',
};

export const STYLE_PRESETS = [
  { id: '现代极简', label: '简约高级', desc: '大量留白、克制字体、低饱和配色', palette: ['#f3eee4', '#1d1d1b', '#c8a86b', '#1d1d1b', '#8d8d8a'] },
  { id: '现代东方', label: '东方意境', desc: '山水留白、宋体气质、自然色系', palette: ['#f3eee4', '#20463a', '#c8a86b', '#1d2b24', '#8d8d8a'] },
  { id: '复古怀旧', label: '复古咖啡馆', desc: '暖棕纸张、旧式标签、衬线字体', palette: ['#efe2cd', '#8a5a3b', '#a8352c', '#3b2b20', '#a99277'] },
  { id: '自然有机', label: '自然环保', desc: '牛皮纸感、植物线条、柔和绿色', palette: ['#f4efe3', '#4b6b4a', '#b99b78', '#2d372c', '#8d8d8a'] },
  { id: '潮流插画', label: '潮流插画', desc: '高饱和色块、插画元素、活泼排版', palette: ['#fff6e9', '#d9603b', '#2b4c7e', '#20202a', '#8d8d8a'] },
  { id: '轻奢商业', label: '轻奢商业', desc: '深色底、金字、规整网格、品牌感强', palette: ['#171717', '#c8a86b', '#e8e2d4', '#f5f1e8', '#9a9488'] },
] as const;

export const CATEGORY_HINTS: Record<string, string> = {
  茶: '茶饮', 咖啡: '咖啡', 零食: '食品', 饼干: '食品', 糕点: '食品', 巧克力: '食品', 蜂蜜: '食品',
  坚果: '食品', 面膜: '美妆', 精华: '美妆', 护肤: '美妆', 香水: '美妆', 香薰: '日用品',
  保健: '保健食品', 维生素: '保健食品', 礼: '礼品', 文创: '文创', 酒: '食品', 果: '食品',
};

export function createEmptyBrief(): DesignBrief {
  return {
    product: '', category: '', packType: '', brand: '', tagline: '', spec: '', description: '',
    style: '', colors: [], motif: '', audience: '', scene: '', material: '',
    structure: 'tuck', size: { l: 0, w: 0, h: 0 }, targetGroup: '', extraText: [], raw: [], referenceImage: '', referenceName: '',
  };
}

const STYLE_RULES: [RegExp, string][] = [
  [/简约|极简|高级感|高级|性冷淡|留白|干净|现代/, '现代极简'],
  [/东方|中式|国风|禅|山水|水墨|传统|宋韵|古风/, '现代东方'],
  [/复古|怀旧|老上海|旧|vintage|古典/, '复古怀旧'],
  [/插画|潮流|可爱|俏皮|活泼|卡通|年轻/, '潮流插画'],
  [/自然|环保|有机|植物|手作|素/, '自然有机'],
  [/轻奢|商业|商务|品牌感|高端/, '轻奢商业'],
];

const MOTIF_RULES: [RegExp, string][] = [
  [/山水|山峦|云雾|水墨/, '山水'], [/花|植物|叶|草木| botanical|花卉/, '植物线条'],
  [/几何|线条|网格|波点|条纹/, '几何'], [/动物|猫|鸟|鱼/, '动物'],
  [/星|月|太阳|宇宙/, '日月星辰'], [/插画|手绘/, '手绘插画'],
];

/** 解析尺寸：支持 mm / cm / inch / 中文单位；二位=标签或袋宽高，三位=长宽高 */
export function parseSize(text: string): { l: number; w: number; h: number } | null {
  const re = /(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|inch|in|英寸|"|')?\s*[×xX*＊乘·]\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|inch|in|英寸|"|')?\s*(?:[×xX*＊乘·]\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|inch|in|英寸|"|')?\s*)?/;
  const m = text.match(re);
  if (!m) return null;
  const unitRaw = (m[6] || m[4] || m[2] || '').toLowerCase();
  let factor = 1;
  if (/^(cm|厘米)$/.test(unitRaw)) factor = 10;
  else if (/^(inch|in|英寸|")$/.test(unitRaw)) factor = 25.4;
  else if (/^(mm|毫米)$/.test(unitRaw)) factor = 1;
  else {
    const nums = [Number(m[1]), Number(m[3]), Number(m[5] || 0)].filter(Boolean);
    factor = nums.some((n) => n >= 100) ? 1 : 10; // 无单位：<=60 按 cm，否则按 mm
  }
  const l = round(clamp(Number(m[1]) * factor, 10, 1200), 1);
  const w = round(clamp(Number(m[3]) * factor, 10, 1200), 1);
  const h = m[5] ? round(clamp(Number(m[5]) * factor, 0, 1200), 1) : 0;
  return { l, w, h };
}

function detectCategory(text: string) {
  for (const [k, v] of Object.entries(CATEGORY_HINTS)) if (text.includes(k)) return v;
  return '';
}
function detectProduct(text: string) {
  // 先去掉句首的意愿 / 数量词，避免把「我想做一个茶叶」整段当成产品名
  let t = text.replace(/[,，。;；、\s]/g, '');
  t = t.replace(/^(我想|我要|我想做|我要做|想做|帮我|请|给我|打算|准备|想|要|做|制作|设计|一款|一个|一批|来个|来一款)+/, '');
  const m = t.match(/^([\u4e00-\u9fa5A-Za-z]{2,8}?)(?:包装盒|包装袋|包装|礼盒|纸盒|盒子|自立袋|袋|标签|贴纸|罐)/);
  if (m && m[1] && !/^(这个|那个|我的|某种|一些)/.test(m[1])) return m[1];
  for (const k of ['茶叶', '咖啡', '零食', '饼干', '面膜', '精华液', '香薰', '保健品', '巧克力', '蜂蜜', '礼品', '文创']) {
    if (text.includes(k)) return k;
  }
  return '';
}
function detectPackType(text: string, current: string) {
  if (/标签|瓶贴|贴纸|不干胶/.test(text)) return 'label';
  if (/袋|自立|咖啡豆包装|铝箔/.test(text)) return 'pouch';
  if (/盒|纸盒|礼盒|天地盖|抽屉/.test(text)) return 'box';
  if (/自定义|上传|参考图|现有包装/.test(text)) return 'custom';
  return current;
}
function detectColors(text: string) {
  const out: string[] = [];
  let rest = text;
  const generic: [RegExp, string][] = [
    [/米白|奶白|象牙|浅米/, '#f3eee4'], [/奶油/, '#f8f1e1'], [/深绿|墨绿|森林绿/, '#20463a'],
    [/焦糖|棕色|咖啡色|大地色/, '#a9673f'], [/金色/, '#c8a86b'], [/黑白|黑与白/, '#1d1d1b'],
    [/酒红/, '#7b2d35'], [/雾霾蓝|深蓝|蓝色/, '#2b4c7e'], [/粉色|粉/, '#e7b9bf'],
    [/橙色|橘色/, '#d98b5f'], [/红色/, '#a8352c'], [/白色/, '#ffffff'], [/黑色|墨黑/, '#1d1d1b'],
  ];
  // 已命中的词从文本中移除，避免「米白色」再被识别成「白色」
  for (const [re, hex] of generic) if (re.test(rest)) { out.push(hex); rest = rest.replace(re, ' '); }
  for (const [word, hex] of Object.entries(COLOR_WORDS)) if (rest.includes(word) && !out.includes(hex)) { out.push(hex); rest = rest.split(word).join(' '); }
  return out.slice(0, 4);
}
function detectBrand(text: string) {
  const patterns = [
    /品牌(?:名称)?(?:是|叫|为|：|:|\s)?\s*([^\s，。、,；;]{2,16})/,
    /(?:名字|名称)(?:是|叫|为|：|:|\s)?\s*([^\s，。、,；;]{2,16})/,
    /(?:叫|名为)\s*([^\s，。、,；;]{2,16})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1] && !/(包装|盒子|标签|尺寸|风格|颜色|设计)/.test(m[1])) return m[1].replace(/[「」“”"'《》]/g, '');
  }
  return '';
}
function detectStructure(text: string, current: StructureId): StructureId {
  if (/天地盖/.test(text)) return 'topBottom';
  if (/抽屉/.test(text)) return 'drawer';
  if (/插舌|常规盒|折叠盒/.test(text)) return 'tuck';
  if (/圆(形)?标签|圆贴/.test(text)) return 'labelRound';
  if (/矩形标签|方形标签|长方标签/.test(text)) return 'labelRect';
  if (/自立袋|袋装/.test(text)) return 'pouch';
  return current;
}

const QUICK_DEFAULTS: Record<string, { l: number; w: number; h: number }> = {
  box: { l: 200, w: 150, h: 80 },
  pouch: { l: 140, w: 60, h: 220 },
  label: { l: 90, w: 120, h: 0 },
  custom: { l: 200, w: 150, h: 80 },
};

/** 合并一句用户输入，返回被识别到的字段（用于界面反馈） */
export function parseUtterance(brief: DesignBrief, text: string): { brief: DesignBrief; detected: string[] } {
  const t = text.trim();
  const b: DesignBrief = { ...brief, size: { ...brief.size }, colors: [...brief.colors], extraText: [...brief.extraText], raw: [...brief.raw, t] };
  const found: string[] = [];

  const size = parseSize(t);
  if (size) {
    b.size = size;
    found.push(`尺寸 ${size.l} × ${size.w}${size.h ? ` × ${size.h}` : ''} mm`);
  }
  if (/推荐.*尺寸|常见尺寸|帮我定尺寸|不知道尺寸|帮我推荐.*大小/.test(t)) {
    b.size = { ...QUICK_DEFAULTS[b.packType || 'box'] };
    found.push(`采用常见尺寸 ${b.size.l} × ${b.size.w} × ${b.size.h} mm`);
  }
  const pack = detectPackType(t, b.packType);
  if (pack && pack !== b.packType) {
    b.packType = pack;
    found.push(`包装形式：${{ box: '包装盒', label: '产品标签', pouch: '袋装包装', custom: '自定义包装' }[pack]}`);
    if (!size && !brief.size.l) b.size = { ...QUICK_DEFAULTS[pack] };
  }
  const st = detectStructure(t, b.structure);
  if (st !== b.structure) { b.structure = st; found.push(`结构：${{ tuck: '插舌盒', topBottom: '天地盖', drawer: '抽屉盒', pouch: '自立袋', labelRect: '矩形标签', labelRound: '圆形标签' }[st]}`); }
  if (b.packType === 'label' && !/labelRect|labelRound/.test(b.structure)) b.structure = 'labelRect';
  if (b.packType === 'pouch' && b.structure !== 'pouch') b.structure = 'pouch';

  const product = detectProduct(t);
  if (product && (!b.product || product.length > b.product.length)) { b.product = product; found.push(`产品：${product}`); }
  const cat = detectCategory(t);
  if (cat && !b.category) b.category = cat;
  const brand = detectBrand(t);
  if (brand) { b.brand = brand; found.push(`品牌：${brand}`); }
  if (/还没有名字|帮我起|取个名字|没有品牌名/.test(t) && !b.brand) {
    const gen: Record<string, string> = { 茶饮: '山隐茶集', 咖啡: '屿光咖啡', 食品: '野果实验室', 美妆: '素白研', 礼品: '有礼', 文创: '见山', 保健食品: '本源', 日用品: '日常物' };
    b.brand = gen[b.category] || 'Luna 物产';
    found.push(`为你起名：${b.brand}`);
  }
  for (const [re, style] of STYLE_RULES) {
    if (re.test(t)) {
      b.style = style; found.push(`风格：${style}`);
      const p = STYLE_PRESETS.find((x) => x.id === style);
      if (p && !b.colors.length) b.colors = [p.palette[0], p.palette[1]];
      break;
    }
  }
  const preset = STYLE_PRESETS.find((p) => p.label === t.trim());
  if (preset) { b.style = preset.id; b.colors = [preset.palette[0], preset.palette[1]]; found.push(`风格：${preset.id}`); }
  const colors = detectColors(t);
  if (colors.length) { b.colors = [...new Set([...b.colors, ...colors])].slice(0, 4); found.push(`配色：${colors.map((c) => Object.entries(COLOR_WORDS).find(([, v]) => v === c)?.[0] || c).join('、')}`); }
  if (/让 ?AI|交给你|你决定|随便|都可以|不确定/.test(t) && !b.style) { b.style = '现代极简'; found.push('风格：AI 推荐 现代极简'); }
  for (const [re, motif] of MOTIF_RULES) if (re.test(t)) { b.motif = motif; found.push(`图案：${motif}`); break; }
  const tagline = t.match(/[「“"]([^」”"]{2,30})[」”"]/);
  if (tagline) { b.tagline = tagline[1]; found.push(`宣传语：${tagline[1]}`); }
  const spec = t.match(/(?:净含量|规格|含量|容量)\s*[:：]?\s*([0-9.]+\s*(?:g|kg|ml|L|克|毫升|片|袋|盒))/i);
  if (spec) { b.spec = spec[1]; found.push(`规格：${spec[1]}`); }
  if (/送礼|伴手礼|节日/.test(t)) b.scene = '馈赠场景';
  if (/电商|淘宝|抖音|小红书|线上/.test(t)) b.scene = '电商销售';
  if (/年轻人|女性|儿童|白领|学生/.test(t)) b.audience = (t.match(/年轻人|女性|儿童|白领|学生/) || [''])[0];
  if (/牛皮纸|瓦楞|白卡|特种纸|环保纸|铝箔/.test(t)) b.material = (t.match(/牛皮纸|瓦楞|白卡|特种纸|环保纸|铝箔/) || [''])[0];
  const extra = t.match(/(?:加上|写|印上|包含)\s*[「“"]([^」”"]{2,40})[」”"]/);
  if (extra && extra[1] !== b.tagline) { b.extraText.push(extra[1]); found.push(`追加文字：${extra[1]}`); }
  return { brief: b, detected: found };
}

export interface NextQuestion { question: string; options: string[]; hint: string }
export function nextQuestion(b: DesignBrief): NextQuestion | null {
  if (!b.packType) return { question: '好的，我们先定包装形式。你打算做成哪一种？', options: ['包装盒', '产品标签', '袋装包装', '自定义包装（上传参考）'], hint: '不确定也没关系，包装盒最适合第一次尝试。' };
  if (!b.size.l) return { question: '这个包装大概多大？可以直接告诉我长 × 宽 × 高。', options: ['20cm × 15cm × 8cm', '14cm × 6cm × 22cm', '帮我推荐常见尺寸'], hint: '支持 mm / cm / inch，例如「200 × 150 × 80mm」。' };
  if (!b.brand) return { question: '产品或品牌叫什么名字？', options: ['还没有名字，帮我起一个', '就叫 LunaSol', '我直接输入名字'], hint: '名字会作为包装正面的主视觉文字。' };
  if (!b.style) return { question: '你喜欢哪种感觉？选一个方向就好。', options: ['简约高级', '复古咖啡馆', '自然环保', '潮流插画'], hint: '也可以直接描述，例如「现代东方、安静一点」。' };
  if (!b.colors.length) return { question: '想用什么颜色？', options: ['米白色和深绿色', '奶油色和焦糖色', '黑白极简', '让 AI 决定'], hint: '颜色后面都能改，先给个方向即可。' };
  return null;
}

export function briefScore(b: DesignBrief) {
  const fields = [b.packType, b.size.l, b.brand, b.style, b.colors.length, b.product, b.structure];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

/** AI 增强解析：把整段对话交给真实模型，产出结构化字段（失败时保留本地解析结果） */
export async function aiEnhanceBrief(b: DesignBrief, s: AISettings): Promise<{ brief: DesignBrief; applied: boolean; message: string }> {
  const prompt = `你是包装设计需求整理助手。请把用户的自然语言对话整理成 JSON，仅输出 JSON 对象，字段如下：
{"product":"产品名","category":"品类","brand":"品牌名","style":"风格","motif":"图案元素","colors":["#hex"],"tagline":"宣传语","spec":"净含量","audience":"目标人群","scene":"使用场景","material":"材质偏好","extraText":["需要出现在包装上的其他文字"],"suggestions":["给普通用户的设计建议（中文，2-3条）"]}
规则：用户明确写出的值必须原样保留；未提及的字段可以给出合理建议，但不要编造法规/成分/认证类信息；颜色用十六进制。
用户对话：${b.raw.join('\n')}
当前已解析：${JSON.stringify({ product: b.product, brand: b.brand, style: b.style, colors: b.colors, size: b.size, structure: b.structure })}`;
  try {
    const data = await llmJson<Record<string, unknown>>([
      { role: 'system', content: '你只输出合法 JSON，不要输出解释文字。' },
      { role: 'user', content: prompt },
    ], s);
    const str = (v: unknown) => typeof v === 'string' ? v.trim() : '';
    const arr = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    const nb: DesignBrief = { ...b };
    if (str(data.product)) nb.product = str(data.product);
    if (str(data.category)) nb.category = str(data.category);
    if (str(data.brand) && !b.brand) nb.brand = str(data.brand);
    if (str(data.style) && !b.style) nb.style = str(data.style);
    if (str(data.motif)) nb.motif = str(data.motif);
    if (str(data.tagline)) nb.tagline = str(data.tagline);
    if (str(data.spec)) nb.spec = str(data.spec);
    if (str(data.audience)) nb.audience = str(data.audience);
    if (str(data.scene)) nb.scene = str(data.scene);
    if (str(data.material)) nb.material = str(data.material);
    const colors = arr(data.colors).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
    if (colors.length && !b.colors.length) nb.colors = colors.slice(0, 4);
    for (const x of arr(data.extraText)) if (!nb.extraText.includes(x)) nb.extraText.push(x);
    return { brief: nb, applied: true, message: `AI 已整理需求${arr(data.suggestions).length ? `：${arr(data.suggestions).join('；')}` : ''}` };
  } catch (e) {
    return { brief: b, applied: false, message: `AI 解析未成功，已保留本地解析结果（${e instanceof Error ? e.message : e}）` };
  }
}
