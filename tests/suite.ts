/* LunaSol 真实功能测试套件（Node + 浏览器共用同一套断言）
 * 浏览器部分覆盖 PDF 生成与字节级预检、SVG 位图渲染等依赖 DOM 的能力。 */
import { createEmptyBrief, nextQuestion, parseSize, parseUtterance } from '../src/engine/brief';
import { buildDieline, dielineStats, faceSizes, STRUCTURES, structureById } from '../src/engine/structure';
import { buildSchemes, cloneDesign, faceSvg, fitText, makeText, textOverflow } from '../src/engine/design';
import { applyPatch, localIntent } from '../src/engine/modify';
import { autoFix, runPrepress } from '../src/engine/prepress';
import { buildBundle, buildDxf, buildPdf, spreadSvg, svgToCanvas, verifyPdf } from '../src/engine/export';
import type { DesignBrief, DesignDoc, StructureId, TextLayer } from '../src/types';
import { STYLES, TRADITION_COUNT, styleById, stylePrimaryColor, buildStylePrompt } from '../src/v3/styles';
import { createEmptyDraft, draftToBrief, dimensionComplete, structureReady } from '../src/v3/draft';
import { generatePalettes } from '../src/v3/colors';
import { accountKey, otpTarget, emailTarget, isEmail, rowId, projectIdOf, ownsProject } from '../src/cloud/keys';
import { LOGIN_CONFIG } from '../src/cloud/loginConfig';
import { decideGate, usageStat, CREDIT_BUCKET_FREE } from '../src/cloud/subscription';
import { PRICING } from '../src/cloud/plans';
import { payReturnFlag, clearPayReturnFlag } from '../src/cloud/pay';
import { IMAGE_MODELS, OPEN_IMAGE_MODELS, HYPER3D_COST, imageCost, imageModel, isProOnlyTier, resolveTier } from '../src/cloud/models';
import {
  CHAT_MODELS, FALLBACK_CHAT_MODEL, FREE_CHAT_MODEL, chatModel, costOfUsage, isPeakNow,
} from '../src/cloud/chatModels';
import { toastTone } from '../src/store';
import { CLOUD, cloudConfigured, deepSeekReady } from '../src/cloud/config';
import { validateBarcode, encodeBarcode, decodeEan, verifyBarcode } from '../src/v3/barcode';
import { DEFAULT_AI, aiEnabled, aiMode, aiStatusLabel } from '../src/engine/llm';
import { AI_TASKS, TASK_FOR_STEP } from '../src/ai/tasks';
import { buildAIContext, contextText } from '../src/ai/context';
import { runAITask, registerAITransport, resetAITransport, aiCapabilitySummary } from '../src/ai/provider';
import { assembleDesign, inferStructure } from '../src/workflow/assembler';
import { createInitialWorkflow } from '../src/types';
import { KINDS, RATIOS, kindById } from '../src/replicate/kinds';
import { FIDELITIES, buildReplicatePrompt, fidelityLevel } from '../src/replicate/prompt';
import { TEMPLATES } from '../src/replicate/templates';
import { migrateProductInfo, migrateProject, migrateWorkflow } from '../src/migrations';
import { humanizeAuthError, isSessionNoise } from '../src/cloud/authErrors';
import type { DesignTask, Project, ProjectWorkflow } from '../src/types';

export interface Result { name: string; ok: boolean; detail: string }
const A = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
const near = (a: number, b: number, eps = 0.6) => Math.abs(a - b) <= eps;

function sampleBrief(): DesignBrief {
  const b = createEmptyBrief();
  const r = parseUtterance(b, '我想做一个茶叶包装盒，尺寸是 20cm × 15cm × 8cm，整体采用米白色和深绿色，风格简约高级，加入中国传统山水元素，品牌名称叫山隐茶集。');
  return r.brief;
}

export async function runTests(): Promise<Result[]> {
  const R: Result[] = [];
  const t = async (name: string, fn: () => unknown | Promise<unknown>) => {
    try { const d = await fn(); R.push({ name, ok: true, detail: d === undefined ? 'OK' : String(d) }); }
    catch (e) { R.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  };
  const inBrowser = typeof document !== 'undefined' && typeof window !== 'undefined';

  await t('尺寸解析 · cm / mm / inch / 二位尺寸', () => {
    const a = parseSize('20cm × 15cm × 8cm')!;
    A(near(a.l, 200) && near(a.w, 150) && near(a.h, 80), `cm 解析错误 ${JSON.stringify(a)}`);
    const b = parseSize('200 × 150 × 80mm')!;
    A(near(b.l, 200) && near(b.w, 150) && near(b.h, 80), `mm 解析错误 ${JSON.stringify(b)}`);
    const c = parseSize('8 x 5 x 3 inch')!;
    A(near(c.l, 203.2) && near(c.w, 127) && near(c.h, 76.2), `inch 解析错误 ${JSON.stringify(c)}`);
    const d = parseSize('90 × 120mm')!;
    A(near(d.l, 90) && near(d.w, 120) && d.h === 0, `二位尺寸解析错误 ${JSON.stringify(d)}`);
    return '4 种输入全部换算为 mm';
  });

  await t('需求理解 · 规格书示例整句结构化', () => {
    const { brief: b, detected } = parseUtterance(createEmptyBrief(), '我想做一个茶叶包装盒，尺寸是 20cm × 15cm × 8cm，整体采用米白色和深绿色，风格简约高级，加入中国传统山水元素，品牌名称叫山隐茶集。');
    A(b.brand === '山隐茶集', `品牌识别错误: ${b.brand}`);
    A(near(b.size.l, 200) && near(b.size.h, 80), `尺寸识别错误 ${JSON.stringify(b.size)}`);
    A(b.colors.length >= 2, '配色未识别');
    A(b.style.length > 0, '风格未识别');
    A(b.packType === 'box', `包装形式识别错误 ${b.packType}`);
    A(detected.length >= 4, `识别字段过少 ${detected.length}`);
    return detected.join(' / ');
  });

  await t('逐步对话 · 每次只问一个最重要的问题', () => {
    let b = createEmptyBrief();
    const q1 = nextQuestion(b)!;
    A(/包装形式|哪一种/.test(q1.question), `首个问题错误: ${q1.question}`);
    A(q1.options.length <= 4 && q1.options.length >= 2, '快捷选项数量异常');
    b = parseUtterance(b, '我想做咖啡自立袋').brief;
    const q2 = nextQuestion(b)!;
    A(!/包装形式|哪一种/.test(q2.question), '重复询问已提供的信息');
    b = parseUtterance(b, '品牌叫屿光咖啡').brief;
    const q3 = nextQuestion(b)!;
    A(/喜欢哪种感觉|风格/.test(q3.question), `第三个问题不是风格: ${q3.question}`);
    b = parseUtterance(b, '简约高级').brief;
    A(nextQuestion(b) === null, '信息齐全后仍在追问');
    return '4 轮对话收敛，无重复提问';
  });

  await t('结构引擎 · 6 种结构均由真实几何算出裁切/压痕/出血/安全区', () => {
    const lines: string[] = [];
    for (const s of STRUCTURES) {
      const size = /label/.test(s.id) ? { l: 90, w: 120, h: 0 } : s.id === 'pouch' ? { l: 140, w: 60, h: 220 } : { l: 200, w: 150, h: 80 };
      const d = buildDieline(s.id as StructureId, size, 3, 5);
      const st = dielineStats(d);
      A(d.sheets.length >= 1, `${s.name} 无展开图`);
      A(d.sheets.every((sh) => sh.width > 0 && sh.height > 0), `${s.name} 展开尺寸无效`);
      A(st.cut > 0 || d.sheets.some((sh) => sh.circles.length), `${s.name} 缺少裁切线`);
      A(st.bleedLines > 0 || d.sheets.some((sh) => sh.circles.length), `${s.name} 缺少出血线`);
      A(d.sheets.every((sh) => sh.safeRects.length >= (s.id === 'labelRound' ? 1 : 1)), `${s.name} 缺少安全区`);
      if (!/label/.test(s.id)) A(st.crease > 0, `${s.name} 缺少压痕线`);
      A(d.sheets.every((sh) => sh.segments.filter((x) => x.kind === 'cut').every((x) => x.x1 >= 2.99 && x.y1 >= 2.99)), `${s.name} 裁切线未留出血边距`);
      lines.push(`${s.name}:${st.cut}C/${st.crease}F/${d.sheets.length}张`);
    }
    return lines.join(' ');
  });

  await t('结构引擎 · 面尺寸与展开尺寸随输入尺寸变化', () => {
    const a = buildDieline('tuck', { l: 200, w: 150, h: 80 });
    const b = buildDieline('tuck', { l: 240, w: 180, h: 100 });
    A(b.sheets[0].width > a.sheets[0].width && b.sheets[0].height > a.sheets[0].height, '尺寸变化未反映到展开图');
    const fs = faceSizes('tuck', { l: 200, w: 150, h: 80 });
    A(fs.front.w === 200 && fs.front.h === 80 && fs.left!.w === 150, '面尺寸计算错误');
    return `${a.sheets[0].width}×${a.sheets[0].height} → ${b.sheets[0].width}×${b.sheets[0].height} mm`;
  });

  await t('结构补充参数 · 用户确认的数值真实参与刀模几何', () => {
    const size = { l: 200, w: 150, h: 80 };
    const dims = (d: ReturnType<typeof buildDieline>) => d.sheets.map((s) => `${s.width}x${s.height}`).join('|');

    // 天地盖：盒盖高度决定底盒高度，套合间隙决定盖盒每边宽出多少
    const tbDefault = buildDieline('topBottom', size, 3, 5);
    const tbUser = buildDieline('topBottom', size, 3, 5, { wall: 25, gap: 1.5 });
    const tbOther = buildDieline('topBottom', size, 3, 5, { wall: 50, gap: 3 });
    A(dims(tbUser) !== dims(tbDefault), '天地盖的盒盖高度/套合间隙没有影响展开图');
    A(dims(tbOther) !== dims(tbUser), '天地盖换参数后展开图没有变化');

    // 插舌盒：粘合位宽度与插舌长度
    const tuckA = buildDieline('tuck', size, 3, 5, { glue: 14, tuckLen: 18 });
    const tuckB = buildDieline('tuck', size, 3, 5, { glue: 24, tuckLen: 30 });
    A(dims(tuckA) !== dims(tuckB), '粘合位宽度/插舌长度没有影响展开图');

    // 自立袋：顶部封口边
    const pouchA = buildDieline('pouch', size, 3, 5, { seal: 12 });
    const pouchB = buildDieline('pouch', size, 3, 5, { seal: 25 });
    A(pouchB.sheets[0].height > pouchA.sheets[0].height, '顶部封口边没有影响展开高度');

    // 飞机盒：侧翼长度；抽屉盒：内盒壁厚
    const mailA = buildDieline('mailer', size, 3, 5, { flap: 40 });
    const mailB = buildDieline('mailer', size, 3, 5, { flap: 70 });
    A(mailB.sheets[0].height > mailA.sheets[0].height, '侧翼长度没有影响展开高度');
    const drawA = buildDieline('drawer', size, 3, 5, { wall: 22 });
    const drawB = buildDieline('drawer', size, 3, 5, { wall: 45 });
    A(dims(drawA) !== dims(drawB), '内盒壁厚没有影响展开图');

    // 矩形标签：圆角半径 > 0 时裁切线应多于直角矩形
    const square = buildDieline('labelRect', size, 3, 5, { radius: 0 });
    const round = buildDieline('labelRect', size, 3, 5, { radius: 8 });
    const cuts = round.sheets[0].segments.filter((s) => s.kind === 'cut').length;
    A(cuts > square.sheets[0].segments.filter((s) => s.kind === 'cut').length, '圆角半径没有生成圆角裁切线');
    A(round.sheets[0].segments.some((s) => s.kind === 'bleed'), '圆角标签缺少出血线');

    // 超出常规区间的参数必须给出可读的提示
    const warn = buildDieline('tuck', size, 3, 5, { glue: 28, tuckLen: 38 });
    A(warn.warnings.length > 0, '异常结构参数没有产生任何提示');

    return `天地盖 ${dims(tbDefault)} → ${dims(tbUser)}；圆角裁切线 ${cuts} 段`;
  });

  await t('向导尺寸校验 · 参数填齐即算通过，不被隐藏的「确认」按钮卡住', () => {
    const d = createEmptyDraft();
    d.package_dimensions.known = true;
    d.package_dimensions.values = { l: 200, w: 150, h: 80 };
    d.package_dimensions.structureId = 'topBottom' as never;
    d.package_dimensions.extra = { wall: 25, gap: 1.5 };

    // 关键回归点：structureConfirmed 仍是旧草稿里的 false（用户没多点一次「确认」），
    // 但只要补充参数齐全就必须判定为通过，否则会出现「都填好了却还是被拦住」。
    d.package_dimensions.structureConfirmed = false;
    A(structureReady(d), '补充参数齐全却判定为未就绪');
    A(dimensionComplete(d).ok, '尺寸校验没有通过');

    // 真正缺参数时必须拦得住
    const bad = createEmptyDraft();
    bad.package_dimensions.known = true;
    bad.package_dimensions.values = { l: 200, w: 150, h: 80 };
    bad.package_dimensions.structureId = 'topBottom' as never;
    A(!structureReady(bad), '缺少补充参数时仍判定为就绪');
    A(!dimensionComplete(bad).ok, '缺少补充参数时尺寸校验竟然通过');
    A(dimensionComplete(bad).missing.length > 0, '缺少的参数没有列出');
    return `缺 ${dimensionComplete(bad).missing.length} 项会被拦截，齐全时直接放行`;
  });

  await t('十步数据 → DesignBrief · 结构补充参数随 brief 传到下游', () => {
    const d = createEmptyDraft();
    d.package_dimensions.known = true;
    d.package_dimensions.values = { l: 200, w: 150, h: 80 };
    d.package_dimensions.structureId = 'tuck' as never;
    d.package_dimensions.extra = { glue: 22, tuckLen: 26 };
    const b = draftToBrief(d);
    A(b.structureExtra && b.structureExtra.glue === 22 && b.structureExtra.tuckLen === 26, '补充参数没有进入 brief');
    // brief 里的补充参数必须真的改变刀模
    const withExtra = buildDieline(b.structure, b.size, 3, 5, b.structureExtra);
    const without = buildDieline(b.structure, b.size, 3, 5);
    A(withExtra.sheets[0].width !== without.sheets[0].width, 'brief 的补充参数没有影响刀模');
    return `粘合位 22 / 插舌 26 → 展开宽 ${without.sheets[0].width} → ${withExtra.sheets[0].width} mm`;
  });

  await t('风格 → 主色 · 选定风格即带出真实主色，界面所见即草稿值', () => {
    // 回归点：取色器一直显示 #20463a（占位默认值）但草稿里 primary_color 是空的，
    // 用户以为选好了却会被「请先选择主颜色」拦住。
    const c = stylePrimaryColor('yangshao');
    A(/^#[0-9a-f]{6}$/i.test(c), '风格主色不是合法 HEX');
    A(c === styleById('yangshao')!.dominant_colors[0], '风格主色与风格库不一致');
    A(stylePrimaryColor('not-a-style') === '', '未知风格应返回空主色而不是兜底假色');
    // 每个风格都必须能给出主色，否则选风格后仍会被拦
    for (const s of STYLES) A(stylePrimaryColor(s.style_id) !== '', `风格「${s.style_name}」没有可用的主色`);
    return `${STYLES.length} 个风格全部带出主色，示例 ${c}`;
  });

  await t('轻提示语气 · 拦截类提示不再显示成功对勾', () => {
    A(toastTone('请先选择主颜色') === 'warn', '拦截提示被判为成功语气');
    A(toastTone('还需要完善：包装结构') === 'warn', '缺项提示被判为成功语气');
    A(toastTone('请至少填写品牌名称或产品名称') === 'warn', '文案校验提示被判为成功语气');
    A(toastTone('连接失败：接口不可用') === 'warn', '失败提示被判为成功语气');
    A(toastTone('已使用「现代极简」，主色已带出为 #f7f6f2，可继续调整') === 'ok', '成功提示被误判为警示');
    A(toastTone('项目已暂存到「我的作品」，浏览器自动保存') === 'ok', '中性提示被误判为警示');
    A(toastTone('已生成 6 套配色方案') === 'ok', '生成提示被误判为警示');
    return '拦截→警示，其余→成功';
  });

  await t('需求汇总 · 包装结构显示中文名而不是内部 ID', () => {
    A(structureById('topBottom').name === '天地盖盒', '结构中文名错误');
    A(!/^[a-zA-Z]+$/.test(structureById('topBottom').name), '结构名仍是内部 ID');
    for (const s of STRUCTURES) A(/[一-龥]/.test(s.name), `结构「${s.id}」没有中文名`);
    return STRUCTURES.map((s) => s.name).join(' / ');
  });

  await t('AI 闸门 · 未登录引导登录、积分用尽引导买积分，互不混淆', () => {
    const anon = decideGate({ loggedIn: false, remaining: null });
    A(!anon.ok && anon.need === 'login', '未登录时应引导登录');
    A(/免费体验/.test(anon.reason), '未登录提示没有说明免费体验积分');

    const left = decideGate({ loggedIn: true, remaining: 2 });
    A(left.ok, '还有积分时不应拦截');

    const used = decideGate({ loggedIn: true, remaining: 0 });
    A(!used.ok && used.need === 'credits', '积分用尽应引导购买积分');
    // 纯积分制没有「订阅 / 续费」这个动作，提示里绝不能出现这两个词
    A(/积分包/.test(used.reason), '积分不足应指向积分包');
    A(!/订阅|续费|会员/.test(used.reason), '纯积分制下不应再提订阅 / 续费 / 会员');

    const unknown = decideGate({ loggedIn: true, remaining: null });
    A(unknown.ok, '账本未加载时不应拦截');
    return '登录 / 有积分 / 无积分 / 未加载 四种状态判定正确';
  });

  let design: DesignDoc;
  const brief = sampleBrief();
  const dieline = buildDieline(brief.structure, brief.size, 3, 5);

  await t('设计引擎 · 三套方案、分层可编辑文字、无整图冒充设计稿', () => {
    const schemes = buildSchemes(brief);
    A(schemes.length === 3, '方案数量不是 3');
    A(new Set(schemes.map((s) => s.scheme)).size === 3, '三套方向不够不同');
    design = schemes[0];
    for (const s of schemes) {
      const faces = Object.values(s.faces).filter(Boolean);
      A(faces.length >= 1, '方案缺少包装面');
      const texts = faces.flatMap((f) => f!.layers.filter((l) => l.type === 'text')) as TextLayer[];
      A(texts.length >= 3, '文字图层过少');
      A(texts.some((x) => x.text === '山隐茶集'), '品牌名未作为独立文字图层');
      A(!faces.some((f) => f!.layers.some((l) => l.type === 'image')), '内置方案不应把整张图片当设计稿');
    }
    return `3 套 / ${Object.keys(design.faces).length} 面 / ${Object.values(design.faces).flatMap((f) => f!.layers).length} 图层`;
  });

  await t('文字排版智能体 · 字号自适应与溢出检测', () => {
    const l = makeText('测试', '这是一段很长的产品说明文字用于验证自动换行和字号自适应能力'.repeat(3), 'info', { x: 5, y: 5, w: 30, h: 12 }, { fontSize: 28 });
    A(l.fontSize < 28, '空间不足时字号未缩小');
    const tooSmall = { ...l, fontSize: 5, w: 2, h: 1, text: '超长文字超长文字超长文字' } as TextLayer;
    A(textOverflow(tooSmall), '溢出未被检测');
    return `字号 28pt → ${l.fontSize}pt，溢出检测生效`;
  });

  await t('SVG 输出 · 保留可编辑 <text> 与矢量图元', () => {
    const svg = faceSvg(design.faces.front!);
    A(svg.includes('<text'), 'SVG 缺少文字元素');
    A(svg.includes('viewBox'), 'SVG 缺少 viewBox');
    const spread = spreadSvg(design, dieline, 0, true);
    A((spread.match(/<svg/g) || []).length >= 2, '展开稿未包含嵌套面');
    A(spread.includes('stroke="#151515"'), '展开稿缺少裁切线');
    return `${svg.length} bytes / ${spread.length} bytes`;
  });

  await t('DXF 输出 · 真实 CAD 图元与毫米单位', () => {
    const dxf = buildDxf(dieline, 0);
    A(dxf.includes('$INSUNITS'), 'DXF 未声明单位');
    A(dxf.includes('\nCUT\n') && dxf.includes('\nCREASE\n'), 'DXF 缺少刀模图层');
    A(dxf.includes('\nLINE\n') && dxf.trimEnd().endsWith('EOF'), 'DXF 结构不完整');
    return `${dxf.split('\n').length} 行`;
  });

  await t('局部修改 · 锁定图层不被改动', () => {
    const d = cloneDesign(design);
    const brand = d.faces.front!.layers.find((l) => l.type === 'text' && l.role === 'brand') as TextLayer;
    A(!!brand, '找不到品牌图层');
    brand.locked = true;
    const r = applyPatch(d, [{ op: 'setText', role: 'brand', text: '被改掉了' }, { op: 'scaleText', role: 'product', factor: 1.3 }]);
    const after = r.design.faces.front!.layers.find((l) => l.type === 'text' && l.role === 'brand') as TextLayer;
    A(after.text === '山隐茶集', '锁定图层仍被修改');
    A(r.changes.length >= 2, '修改记录缺失');
    return r.changes.join('；');
  });

  await t('对话修改意图 · 内置规则解析', () => {
    const ops = localIntent('背景换成米白色');
    A(ops.some((o) => o.op === 'setBackground' && o.color === '#f3eee4'), '背景色意图解析错误');
    A(localIntent('把包装改成更简约一点').some((o) => o.op === 'removeDecor'), '简约意图解析错误');
    return '2 类意图解析正确';
  });

  await t('印前检查 · 真实数据驱动的报告', () => {
    const r = runPrepress({ design, brief, dieline, dpi: 300 });
    A(r.items.length >= 10, `检查项过少 ${r.items.length}`);
    A(['pass', 'warning', 'error'].includes(r.status), '检查状态异常');
    A(r.cmyk.length > 0, '缺少 CMYK 换算');
    A(r.items.every((i) => typeof i.title === 'string' && i.title.length > 0), '检查项缺少通俗提示');
    const fixed = autoFix(design, dieline);
    A(fixed.design.faces.front!.layers.length === design.faces.front!.layers.length, '自动修复误删图层');
    return `${r.items.length} 项检查 / 状态 ${r.status} / ${r.summary}`;
  });

  /* ==================== V3 十步向导 / 风格库 / 配色 / 条码 回归 ==================== */
  await t('V3 风格库 · 14 组传统艺术风格且每个风格配置完整', () => {
    A(TRADITION_COUNT === 14, `传统艺术风格组数为 ${TRADITION_COUNT}，应为 14`);
    const trad = STYLES.filter((s) => s.group === 'tradition');
    A(trad.length >= 14, `传统风格可选项只有 ${trad.length} 个`);
    for (const s of STYLES) {
      const missing = (['style_id', 'style_name', 'description', 'visual_features', 'dominant_colors',
        'supporting_colors', 'pattern_elements', 'illustration_guidance', 'typography_guidance',
        'composition_guidance', 'suitable_categories', 'reference_thumbnail', 'ai_prompt_template', 'shapes'] as const)
        .filter((k) => { const v = s[k]; return !v || (Array.isArray(v) && !v.length); });
      A(!missing.length, `${s.style_id} 缺少字段：${missing.join(',')}`);
      A(s.reference_thumbnail.startsWith('data:image/svg+xml'), `${s.style_id} 缩略图不是独立 SVG`);
      A(s.shapes.length > 0, `${s.style_id} 没有可执行纹样配置`);
    }
    const ids = new Set(STYLES.map((s) => s.style_id));
    A(ids.size === STYLES.length, 'style_id 存在重复');
    const thumbs = new Set(STYLES.map((s) => s.reference_thumbnail));
    A(thumbs.size === STYLES.length, '不同风格复用了同一张缩略图');
    const shapeSigs = new Set(trad.map((s) => JSON.stringify(s.shapes.map((x) => x.shape))));
    A(shapeSigs.size >= 10, `传统风格纹样配置过于雷同：只有 ${shapeSigs.size} 种组合`);
    return `${STYLES.length} 个风格 / ${trad.length} 个传统选项 / ${TRADITION_COUNT} 组 / ${shapeSigs.size} 种纹样组合`;
  });

  await t('V3 风格提示词 · 展开完整配置而非只拼风格名', () => {
    const cfg = styleById('yuan-blue')!;
    const p = buildStylePrompt(cfg, { product: '高山乌龙茶', brand: '山隐茶集', audience: '年轻潮流人群', form: '包装盒', primary: '#2b4c7e', motif: '缠枝莲纹' });
    A(p.length > 300, `提示词过短：${p.length} 字`);
    A(p.includes(cfg.illustration_guidance.slice(0, 8)), '未包含插画规则');
    A(p.includes(cfg.typography_guidance.slice(0, 8)), '未包含字体规则');
    A(p.includes(cfg.composition_guidance.slice(0, 8)), '未包含构图规则');
    A(p.includes('元代'), '未包含时代约束');
    return `${p.length} 字，含插画 / 字体 / 构图 / 时代约束`;
  });

  await t('V3 项目数据 · 第 09 步产品名称不被品类覆盖', () => {
    const d = createEmptyDraft();
    d.product_category.type = '茶叶';
    d.copy_content.productName = '高山乌龙茶';
    const b = draftToBrief(d, '元青花');
    A(b.product === '高山乌龙茶', `产品名被改写为「${b.product}」`);
    A(b.category !== '高山乌龙茶', '品类与产品名混淆');
    return `product=${b.product} / category=${b.category}`;
  });

  await t('V3 不需要插画 · 不向设计引擎传入任何装饰图案', () => {
    const d = createEmptyDraft();
    d.illustration_type = 'none';
    d.illustration_description = '不应出现';
    const b = draftToBrief(d, '元青花');
    A(b.motif === '', `仍传入了 motif：${b.motif}`);
    const cfg = styleById('yuan-blue')!;
    const none = buildSchemes(b, cfg);
    const decorOf = (doc: DesignDoc) => Object.values(doc.faces).flatMap((f) => (f?.layers || [])
      .filter((l) => l.type === 'shape' && l.name.includes(cfg.style_name)));
    A(decorOf(none[0]).length === 0 && decorOf(none[1]).length === 0, '「不需要插画」仍生成了风格装饰图层');
    const withLine = { ...b, motif: '缠枝莲纹' };
    A(decorOf(buildSchemes(withLine, cfg)[1]).length > 0, '选择线稿后反而没有生成对应纹样');
    return '无插画 0 个装饰层 / 有线稿时纹样层存在';
  });

  await t('V3 配色 · 4–6 套方案且不同风格使用不同配色逻辑', () => {
    const heritage = generatePalettes({ primary: '#2b4c7e', style: styleById('yuan-blue'), category: '茶叶' });
    const mono = generatePalettes({ primary: '#e8e3d6', style: styleById('song-glaze'), category: '茶叶' });
    A(heritage.length >= 4 && heritage.length <= 6, `传统配色方案数量异常：${heritage.length}`);
    A(mono.length >= 4 && mono.length <= 6, `单色釉配色方案数量异常：${mono.length}`);
    A(new Set(heritage.map((p) => p.id)).size === heritage.length, '配色方案 id 重复');
    for (const p of heritage) A(p.ratio.length === 4 && p.ratio.reduce((a, b) => a + b, 0) === 100, `${p.name} 比例不合计 100`);
    const h1 = heritage[0].primary.toLowerCase(), m1 = mono[0].primary.toLowerCase();
    A(h1 !== m1, '不同风格配色逻辑产出完全相同的主色');
    return `heritage=${heritage.length} / monochrome=${mono.length}`;
  });

  await t('V3 条码 · EAN-13 / UPC-A 校验位与反向解码', () => {
    A(validateBarcode('EAN-13', '6901234567892').ok, '合法 EAN-13 被拒绝');
    A(!validateBarcode('EAN-13', '6901234567893').ok, '错误校验位被接受');
    A(!validateBarcode('EAN-13', '690123').ok, '位数不足被接受');
    A(validateBarcode('UPC-A', '036000291452').ok, '合法 UPC-A 被拒绝');
    A(!validateBarcode('UPC-A', '036000291453').ok, '错误 UPC-A 校验位被接受');
    A(validateBarcode('Code 128', 'SKU-2026-001').ok, '合法内部 SKU 被拒绝');
    const e = encodeBarcode('EAN-13', '6901234567892');
    A(e.ok && e.modules.length > 50, 'EAN-13 编码失败');
    A(verifyBarcode(e).ok, `条码自检失败：${verifyBarcode(e).message}`);
    const dec = decodeEan(e.modules);
    A(dec.ok && dec.value === '6901234567892', `反向解码不一致：${dec.value} / ${dec.message}`);
    A(e.quietMm > 0 && e.widthMm >= e.minWidthMm && Math.abs(e.widthMm - 37.29) < 0.01, '静区或 EAN-13 标准宽度异常');
    return `${e.modules.length} 模块 / ${e.widthMm.toFixed(1)} mm / 静区 ${e.quietMm.toFixed(1)} mm`;
  });

  /* ---------------- 统一 AI 能力层 / 后台接入契约 ---------------- */
  const aiDraft = createEmptyDraft();
  aiDraft.package_type = 'box';
  aiDraft.product_category = { ...aiDraft.product_category, group: '食品', type: '茶叶' };
  aiDraft.copy_content = { ...aiDraft.copy_content, brandName: '山隐茶集', productName: '高山乌龙茶' };
  aiDraft.style_id = 'yuan-blue';
  aiDraft.primary_color = '#2b4c7e';
  aiDraft.target_audience = { ...aiDraft.target_audience, groups: ['高端消费群体'] };
  const aiCtx = buildAIContext(aiDraft, '想做得更清淡');
  const proxyAI = { ...DEFAULT_AI, mode: 'proxy' as const, apiKey: '', textModel: '', baseUrl: 'https://backend.example.com/v1' };

  await t('AI 接入模式 · 后台代理无需前端 Key 即可全站启用', () => {
    A(!aiEnabled({ ...DEFAULT_AI, mode: 'off', apiKey: 'sk-x' }), 'off 模式不应启用');
    A(!aiEnabled({ ...DEFAULT_AI, mode: 'browser', apiKey: '' }), '浏览器直连缺 Key 不应启用');
    A(aiEnabled({ ...DEFAULT_AI, mode: 'browser', apiKey: 'sk-x' }), '浏览器直连应启用');
    A(aiEnabled(proxyAI), '后台代理模式被前端 Key 判定挡住了');
    A(aiMode(proxyAI) === 'proxy' && aiStatusLabel(proxyAI).includes('AI 已接入'), '代理状态标注不正确');
    A(aiCapabilitySummary().total === 12 && aiCapabilitySummary().steps === 9, '能力点数量异常');
    return `total=${aiCapabilitySummary().total} / steps=${aiCapabilitySummary().steps}`;
  });

  await t('AI 上下文 · 九步数据与完整风格配置统一传入', () => {
    const text = contextText(aiCtx);
    A(text.includes('高山乌龙茶') && text.includes('茶叶') && text.includes('#2b4c7e'), '九步数据未进入统一上下文');
    A(text.includes('高端消费群体') && text.includes('包装盒'), '人群 / 形态缺失');
    A(aiCtx.styleName.length > 0 && aiCtx.stylePrompt.length > 400, '完整风格配置未展开为提示词');
    A(aiCtx.userNote === '想做得更清淡', '用户补充想法丢失');
    return `context=${text.split('\n').length} 行 / stylePrompt=${aiCtx.stylePrompt.length} 字`;
  });

  await t('AI 任务层 · 九步每步都有可用本地建议与合规约束', () => {
    for (let i = 0; i < 9; i++) {
      const def = AI_TASKS[TASK_FOR_STEP(i)];
      A(def && def.local(aiCtx).length >= 1, `STEP ${i + 1} 没有本地建议`);
      A(def.system.includes('禁止') && def.constraints.length > 0, `STEP ${i + 1} 缺少合规约束`);
      A(typeof def.adopt === 'function' && typeof def.validate === 'function', `STEP ${i + 1} 缺少采纳或校验`);
    }
    const styles = AI_TASKS['style.recommend'].local(aiCtx);
    A(styles.every((s) => STYLES.some((x) => x.style_id === (s.value as { style_id: string }).style_id)), '本地风格推荐编造了不存在的风格');
    return `9/9 步有建议 · 风格推荐 ${styles.length} 条均来自真实风格库`;
  });

  await t('AI 合规校验 · 违规文案 / 假条码 / 假风格 / 擅自加图案全部拦截', () => {
    const okShape = { suggestions: [{ title: '建议', detail: '理由', value: {} }] };
    const mk = (v: unknown) => ({ suggestions: [{ ...okShape.suggestions[0], value: v }] });
    A(!AI_TASKS['copy.suggestion'].validate(mk({ tagline: '通过有机认证，功效显著' }), aiCtx), '违规文案未被拦截');
    A(!AI_TASKS['barcode.advice'].validate(mk({ type: 'EAN-13', value: '6901234567892' }), aiCtx), '编造零售条码未被拦截');
    A(!AI_TASKS['style.recommend'].validate(mk({ style_id: 'not-a-real-style' }), aiCtx), '不存在的风格未被拦截');
    A(!AI_TASKS['size.structure'].validate(mk({ structureId: 'pouch' }), aiCtx), '与包装形态不符的结构未被拦截');
    const noArt = { ...aiCtx, illustrationType: 'none' };
    A(!AI_TASKS['illustration.motif'].validate(mk({ description: '莲瓣纹' }), noArt), '「不需要插画」时 AI 图案未被拦截');
    A(AI_TASKS['color.primary'].validate(mk({ color: '#20463a' }), aiCtx), '合法 HEX 主色被误拒');
    A(AI_TASKS['copy.suggestion'].validate(mk({ tagline: '一盏山野，慢享自然' }), aiCtx), '合规文案被误拒');
    return '6 类拦截 + 2 类合法放行全部正确';
  });

  await t('AI 执行层 · 未接入标注本地 / 代理接入生效 / 失败与违规如实回退', async () => {
    const local = await runAITask('style.recommend', aiCtx, { ...DEFAULT_AI, mode: 'off' });
    A(local.source === 'local' && local.note.includes('未调用 AI'), '未接入时未如实标注');
    A(local.suggestions.every((s) => STYLES.some((x) => x.style_id === (s.value as { style_id: string }).style_id)), '本地建议不是真实风格');

    registerAITransport(async (req) => {
      A(req.user.includes('高山乌龙茶'), '十步上下文没有传给后台');
      A(req.system.includes('禁止'), '合规约束没有传给后台');
      return { suggestions: [{ title: 'AI 推荐 · 元青花', detail: '符合高端茶叶定位', value: { style_id: 'yuan-blue' } }] };
    });
    const real = await runAITask('style.recommend', aiCtx, proxyAI);
    A(real.source === 'ai' && real.suggestions[0].title.includes('AI'), '代理接入后 AI 结果未生效');

    registerAITransport(async () => { throw new Error('backend down'); });
    const failed = await runAITask('color.primary', aiCtx, proxyAI);
    A(failed.source === 'fallback' && failed.note.includes('回退') && failed.suggestions.length > 0, '调用失败未如实回退');

    registerAITransport(async () => ({ suggestions: [{ title: 'x', detail: 'y', value: { tagline: '通过 ISO 认证' } }] }));
    const blocked = await runAITask('copy.suggestion', aiCtx, proxyAI);
    A(blocked.source === 'fallback' && blocked.suggestions.every((s) => !/认证|ISO/.test(JSON.stringify(s.value))), '违规 AI 输出被当成了正常结果');
    resetAITransport();
    return 'local / ai / fallback / 合规拦截 四条路径均正确';
  });

  /* ---------------- P3 自动组装引擎 ---------------- */
  /** 构造一个带成功任务的工作流（盒类） */
  function sampleWorkflow(): ProjectWorkflow {
    const wf = createInitialWorkflow();
    wf.productInfo = {
      ...wf.productInfo,
      description: '桂花乌龙茶礼盒，深茶绿底，净含量 200g',
      productName: '桂花乌龙茶', brandName: '山隐茶集', productType: '茶叶',
      packagingType: '包装盒', expectedSize: '200 × 150 × 80mm',
    };
    wf.analysis = {
      productSummary: '桂花乌龙茶礼盒', category: '茶叶', keyFeatures: [],
      palette: [
        { hex: '#20463a', rgb: '32,70,58', role: 'background' },
        { hex: '#c8a86b', rgb: '200,168,107', role: 'accent' },
        { hex: '#f3eee4', rgb: '243,238,228', role: 'ink' },
      ],
      materials: [], finishing: [], structureSuggestion: 'tuck',
      visualDirection: '', risks: [], opportunities: [],
    } as never;
    const bgTask: DesignTask = {
      id: 't1', type: 'background', name: '深茶绿底纹', face: 'all',
      description: '', prompt: '深茶绿底纹', imageTier: 'flash', status: 'success',
      variants: [{
        src: 'data:image/png;base64,AAAA', at: 1, prompt: '深茶绿底纹',
        model: 'flash', tier: 'flash', naturalW: 1024, naturalH: 1024,
      }],
      selectedVariant: 0,
    };
    const pendingTask: DesignTask = {
      id: 't2', type: 'illustration', name: '桂花插画', face: 'front',
      description: '', prompt: '桂花插画', imageTier: 'flash', status: 'pending', variants: [], selectedVariant: 0,
    };
    wf.tasks = [bgTask, pendingTask];
    return wf;
  }

  await t('结构推断 · 按包装形态识别 7 种结构', () => {
    const mk = (packagingType: string) => {
      const wf = createInitialWorkflow();
      wf.productInfo = { ...wf.productInfo, packagingType };
      return wf;
    };
    A(inferStructure(mk('自立袋')) === 'pouch', '自立袋识别错误');
    A(inferStructure(mk('产品标签')) === 'labelRect', '标签识别错误');
    A(inferStructure(mk('天地盖盒')) === 'topBottom', '天地盖识别错误');
    A(inferStructure(mk('抽屉盒')) === 'drawer', '抽屉识别错误');
    A(inferStructure(mk('包装盒')) === 'tuck', '默认盒识别错误');
    return '5 类结构推断正确';
  });

  await t('自动组装 · 成功任务成图层、文字独立可编辑、未成功任务不造假', () => {
    const doc = assembleDesign(sampleWorkflow());
    const faceList = Object.values(doc.faces);
    A(faceList.length >= 5, `盒类应含 5 个面，实际 ${faceList.length}`);
    // 每个面都应纳入通用背景图（满版 cover）
    for (const f of faceList) {
      const imgs = f.layers.filter((l) => l.type === 'image');
      A(imgs.length === 1, `面 ${f.id} 应只有 1 个背景图层，实际 ${imgs.length}`);
      const bg = imgs[0] as import('../src/types').ImageLayer;
      A(bg.fit === 'cover' && bg.w === f.w && bg.h === f.h, '背景图未满版 cover');
    }
    // 正面额外有 3 个真实文字图层（品牌/产品/规格）
    const front = doc.faces.front!;
    const texts = front.layers.filter((l) => l.type === 'text') as import('../src/types').TextLayer[];
    A(texts.length === 3, `正面应有 3 个文字图层，实际 ${texts.length}`);
    A(texts.some((x) => x.text === '山隐茶集'), '品牌名未作为文字图层');
    A(texts.some((x) => x.text === '桂花乌龙茶'), '产品名未作为文字图层');
    A(texts.some((x) => /200g/.test(x.text)), '净含量未提取');
    // pending 的插画任务不应产生图层
    A(!front.layers.some((l) => l.type === 'image' && l.name === '桂花插画'), '未成功任务被造假图层');
    // 配色取自分析报告
    A(doc.palette.bg === '#20463a', '背景色未取自分析报告');
    return `${faceList.length} 面 / 正面 ${texts.length} 文字层 / 无假图层`;
  });

  await t('自动组装 · 无分析报告时给真实兜底不崩溃', () => {
    const wf = sampleWorkflow();
    wf.analysis = null;
    const doc = assembleDesign(wf);
    A(!!doc.palette.bg && /^#/.test(doc.palette.bg), '兜底配色缺失');
    A(Object.values(doc.faces).length >= 5, '兜底面数量异常');
    return '缺分析报告仍能组装，配色与文字走兜底';
  });

  /* ---------------- 云账号 · 用户名/邮箱/手机号分别归一化 ---------------- */
  await t('云账号 · 用户名/邮箱/手机号分别归一化，注册只认手机号或邮箱', () => {
    A(accountKey('lunasol_user').username === 'lunasol_user', '用户名归一化错误');
    A(accountKey('a@b.com').email === 'a@b.com', '邮箱归一化错误');
    A(accountKey('13800138000').phone === '+8613800138000', '手机号未补国家码');
    A(accountKey('+85261234567').phone === '+85261234567', '国际号码被改写');
    A(otpTarget('lunasol_user') === null, '用户名不该被当成验证码目标');
    A(otpTarget('13800138000')?.label === '手机号', '手机号注册目标识别失败');
    A(otpTarget('a@b.com')?.label === '邮箱', '邮箱注册目标识别失败');
    return '4 类账号 + 3 类目标识别正确';
  });

  /* ---------------- 登录配置 · 短信停用后验证码只认邮箱 ---------------- */
  await t('登录配置 · 短信已关闭，任何验证码路径都不得构造 phone 参数', () => {
    A(emailTarget('a@b.com')?.key.email === 'a@b.com', '邮箱验证码目标识别失败');
    A(emailTarget('  A@B.COM  ')?.key.email === 'A@B.COM', '邮箱未正确 trim');
    A(emailTarget('13800138000') === null, '手机号仍被当成验证码目标，会触发短信计费');
    A(emailTarget('+8613800138000') === null, '国际号码仍被当成验证码目标');
    A(emailTarget('lunasol_user') === null, '用户名仍被当成验证码目标');
    A(emailTarget('a@b') === null, '非法邮箱未被拦截');
    A(isEmail('a@b.com') && !isEmail('13800138000'), 'isEmail 判定错误');
    A(LOGIN_CONFIG.methods.sms === false, '控制台已关闭短信，前端配置未同步');
    A(LOGIN_CONFIG.methods.emailCode === true && LOGIN_CONFIG.methods.password === true, '登录方式配置与控制台不一致');
    A(LOGIN_CONFIG.register.mode === 'auto', '注册模式应为自动注册并登录');
    return '邮箱验证码 + 配置镜像一致，短信入口为 0';
  });

  await t('云同步键 · 行主键带账号，换账号不覆盖别人的行', () => {
    const a = rowId('uid_a', 'proj_1');
    const b = rowId('uid_b', 'proj_1');
    A(a !== b, '不同账号的同名项目主键冲突');
    A(projectIdOf(a) === 'proj_1' && projectIdOf(b) === 'proj_1', '主键还原项目 ID 失败');
    A(projectIdOf('legacy_id') === 'legacy_id', '旧主键兼容失败');
    A(ownsProject(undefined, 'uid_a'), '未认领草稿应可带入首个账号');
    A(ownsProject('uid_a', 'uid_a'), '同账号应可同步');
    A(!ownsProject('uid_a', 'uid_b'), '其他账号的项目不应被上传');
    return '主键隔离 + 归属判定正确';
  });

  await t('云配置 · 缺环境变量时不假装已接入云端', () => {
    // Node 测试环境没有 VITE_* 变量，必须诚实报告「未配置」而不是默认成功
    A(cloudConfigured === false, '缺少环境变量时不应认为云服务已配置');
    A(deepSeekReady === false, '缺少代理地址时不应认为 DeepSeek 已接入');
    A(typeof CLOUD.region === 'string' && CLOUD.region.length > 0, '默认区域缺失');
    return '未配置状态如实上报';
  });

  /* ---- 历史草稿迁移：这几条对应线上「打开就白屏」的真实事故 ---- */

  await t('旧草稿迁移 · 缺 themeColors 的草稿不再抛错（白屏根因）', () => {
    // 加 themeColors 之前的真实形态：这些键根本不存在，不是空数组
    const legacy = {
      id: 'proj_legacy', name: '旧草稿', structure: 'tuck-end',
      brief: createEmptyBrief(), design: null, versions: [],
      createdAt: 1, updatedAt: 2, status: 'draft',
      workflow: {
        version: 1, stage: 'requirements', mode: 'referenceStyle',
        productInfo: { description: '旧描述', productName: '旧产品', brandName: '旧品牌' },
        referenceImages: [], analysis: null, concepts: [], selectedConceptId: null,
        tasks: [], createdAt: 1, updatedAt: 2,
      },
    } as unknown as Project;

    const m = migrateProject(legacy);
    const info = m.workflow!.productInfo;
    A(Array.isArray(info.themeColors), 'themeColors 没有补成数组');
    A(info.themeColors.length === 0, `themeColors 应为空数组，实际 ${JSON.stringify(info.themeColors)}`);
    A(info.themeColors.includes('#ffffff') === false, 'themeColors.includes 仍不可用');
    A(info.description === '旧描述', '用户已填的产品描述被默认值覆盖了');
    A(info.productName === '旧产品', '用户已填的产品名称被默认值覆盖了');
    A(info.productionAddress === '', '生产信息字段没有补默认空串');
    A(Array.isArray(m.workflow!.conceptImages), 'conceptImages 没有补成数组');
    A(m.workflow!.autoGenPending === false, 'autoGenPending 没有补成 false');
    return 'themeColors / conceptImages / 生产信息 / autoGenPending 均已补全';
  });

  await t('旧草稿迁移 · null 与类型不符的字段回退默认值', () => {
    const info = migrateProductInfo({ themeColors: null, illustrationElements: 123, logoMode: 'upload', netContent: '250g' });
    A(Array.isArray(info.themeColors), 'null 的 themeColors 未回退成数组');
    A(info.illustrationElements === '', '数字类型的插画元素未回退成空串');
    A(info.logoMode === 'upload', '合法的 logoMode 不应被丢弃');
    A(info.netContent === '250g', '合法的净含量不应被丢弃');

    const wf = migrateWorkflow({ productInfo: null, conceptImages: null, stage: 'concepts' });
    A(wf !== undefined, 'workflow 迁移返回了 undefined');
    A(Array.isArray(wf!.conceptImages), 'null 的 conceptImages 未回退成数组');
    A(wf!.stage === 'concepts', '显式 stage 不应被覆盖');
    A(migrateWorkflow(null) === undefined, 'null workflow 应返回 undefined');
    return 'null / 错类型字段均回落，合法值保留';
  });

  await t('旧草稿迁移 · 没有 workflow 的老项目原样返回', () => {
    const old = { id: 'p0', name: '更早的项目' } as unknown as Project;
    const m = migrateProject(old);
    A(m.workflow === undefined, '无 workflow 的项目不应被凭空补出 workflow');
    A(m.name === '更早的项目', '项目字段被改动');
    // 字段不全的云端行会把工作台打崩（p.brief.size.l）：载入即补全，缺什么给默认值
    A(!!m.brief && typeof m.brief.size?.l === 'number', 'brief.size 没有被补全（工作台会白屏）');
    const broken = migrateProject({ id: 'p1', name: 'x', brief: {} } as unknown as Project);
    A(typeof broken.brief.size.w === 'number', 'brief 缺 size 时未补全');
    A(broken.createdAt > 0 && broken.updatedAt > 0, '时间戳没有兜底');
    return '原样返回（缺字段已补全）';
  });

  await t('鉴权错误 · 会话恢复失败不展示给用户', () => {
    // 线上真实出现过的原文（多标签页轮换 refresh token 时 SDK 抛出）
    const noise = 'invalid refresh token. for it may be has been refreshed by other process';
    A(isSessionNoise(noise), '未识别为会话噪音');
    A(humanizeAuthError(noise) === '', '会话噪音应静默为「无错误」');
    A(isSessionNoise('Auth session missing!'), '未识别 auth session missing');
    A(isSessionNoise('jwt expired'), '未识别 jwt expired');
    // 正常未登录状态也不能当成错误
    A(isSessionNoise('not logged in'), '未识别 not logged in');
    // 真正的账号密码错误必须留下来并翻成中文
    A(!isSessionNoise('Invalid login credentials'), '密码错误被误判为噪音');
    A(/账号或密码/.test(humanizeAuthError('Invalid login credentials')), '密码错误未翻译');
    // 未识别的消息保持原文，不臆造原因
    A(humanizeAuthError('Some brand new server message') === 'Some brand new server message', '未知消息被改写');
    A(humanizeAuthError('') === '操作失败，请稍后重试', '空消息未使用兜底文案');
    return '噪音吞掉 / 常见错误中文化 / 未知消息保真';
  });

  if (inBrowser) {
    await t('浏览器渲染 · SVG 转 300DPI 位图', async () => {
      const sh = dieline.sheets[0];
      const c = await svgToCanvas(spreadSvg(design, dieline, 0, false), sh.width, sh.height, 72);
      A(c.width > 100 && c.height > 100, '画布尺寸异常');
      return `${c.width}×${c.height} px`;
    });

    await t('印刷 PDF · 毫米页面 / 独立刀模页 / 逐图层绘制', async () => {
      const { bytes } = await buildPdf(design, dieline, 150);
      A(bytes[0] === 0x25 && bytes[1] === 0x50, '缺少 %PDF 文件头');
      const v = verifyPdf(bytes, dieline.sheets);
      A(v.ok, `PDF 预检失败: ${v.issues.join('；')} | ${bytes.length} bytes`);
      A(v.pages >= dieline.sheets.length * 2, '页面数不足');
      return `${v.pages} 页 / ${Math.round(v.bytes / 1024)} KB / MediaBox ${v.boxes.length} 个`;
    });

    await t('文件包 · ZIP 内 PDF 预检通过', async () => {
      const z = await buildBundle(design, dieline, 150, true);
      A(z.check.ok, `包内 PDF 预检失败: ${z.check.issues.join('；')}`);
      A(z.blob.size > 2000, 'ZIP 体积异常');
      return `${Math.round(z.blob.size / 1024)} KB`;
    });
  } else {
    R.push({ name: '浏览器相关测试', ok: true, detail: 'SKIP（Node 环境无 DOM，由浏览器测试覆盖）' });
  }
  await t('图像档位 · 价格与模型一一对应（防扣错积分）', () => {
    const ids = IMAGE_MODELS.map((m) => m.id);
    A(new Set(ids).size === ids.length, '档位 id 有重复');
    A(imageCost('flash') === PRICING.costs.imageFlash, `flash 价格不一致: ${imageCost('flash')}`);
    A(imageCost('pro') === PRICING.costs.imagePro, `pro 价格不一致: ${imageCost('pro')}`);
    A(imageCost('gpt2-text') === Math.round(PRICING.costs.imageGpt2Text * PRICING.gptImagePromoRate),
      `GPT Image 2 文字输入应为原价 ${PRICING.costs.imageGpt2Text} × ${PRICING.gptImagePromoRate}，实际 ${imageCost('gpt2-text')}`);
    A(imageCost('gpt2-ref') === Math.round(PRICING.costs.imageGpt2Ref * PRICING.gptImagePromoRate),
      `GPT Image 2 输入图应为原价 ${PRICING.costs.imageGpt2Ref} × ${PRICING.gptImagePromoRate}，实际 ${imageCost('gpt2-ref')}`);
    A(HYPER3D_COST === 21, `Hyper3D-Gen2 应为 21，实际 ${HYPER3D_COST}`);
    return ids.map((id) => `${id}=${imageCost(id)}`).join(' / ');
  });

  await t('图像档位 · 促销只作用于 GPT Image 2，且毛利不低于 70%', () => {
    /* 硬约束：积分净收入 = (US$14.00 − 3.9% − $0.40) × 7.1 ÷ 1000 ≈ ¥0.0927。
     * 这里故意沿用更低的 ¥0.0906（当年 US$13.70 的口径）算毛利：口径取低，
     * 涨价时测试不会虚高，降价到 13.7 附近也不至于误报。
     * 任何一档的实付积分 × 0.0906 都必须 ≥ 成本 ÷ 0.30，否则毛利跌破 70%。
     * Seedream 那两档不打折就是因为它本来就贴着成本线，一打折立刻亏。 */
    const RMB_PER_CREDIT = 0.0906;
    const floor = 0.30;
    const upstream: Record<string, number> = { flash: 0.12, pro: 0.30, 'gpt2-text': 0.9, 'gpt2-ref': 1.1 };
    for (const m of IMAGE_MODELS) {
      const margin = 1 - upstream[m.id] / (m.cost * RMB_PER_CREDIT);
      A(margin >= floor - 1e-6, `${m.label} 毛利只有 ${(margin * 100).toFixed(1)}%，低于 70%`);
      A(m.cost <= m.listCost, `${m.label} 实付高于原价`);
      // Seedream 不该进促销：成本已贴近下限
      if (m.id === 'flash' || m.id === 'pro') A(m.promoRate === undefined, `${m.label} 不应参加促销`);
    }
    return IMAGE_MODELS.map((m) => {
      const margin = 1 - upstream[m.id] / (m.cost * RMB_PER_CREDIT);
      return `${m.short}=${m.cost}(${(margin * 100).toFixed(0)}%)`;
    }).join(' / ');
  });

  await t('图像档位 · 展示价与扣费同源、未知档位不偷偷换价', () => {
    for (const m of IMAGE_MODELS) {
      A(imageModel(m.id).cost === m.cost, `${m.label} 展示价与扣费不一致`);
    }
    // 旧会话里可能出现历史档位名；回落时展示与扣费仍取同一个对象，不会出现「显示 6 扣 10」
    const fallback = imageModel('unknown-tier' as never);
    A(fallback.cost === imageModel(fallback.id).cost, '回落档位的价格不同源');
    A(OPEN_IMAGE_MODELS.every((m) => m.open), '未开放档位混进了可选列表');
    A(OPEN_IMAGE_MODELS.length === IMAGE_MODELS.length, '有档位被误标为未开放');
    return `可选 ${OPEN_IMAGE_MODELS.length} 档，全部开放`;
  });

  await t('图像档位 · 图生图档位强制绑定参考图', () => {
    const ref = imageModel('gpt2-ref');
    A(ref.needsRef === true, 'gpt2-ref 必须标记为需要参考图');
    A(!imageModel('gpt2-text').needsRef, 'gpt2-text 不应要求参考图');
    A(ref.provider === 'bai' && imageModel('flash').provider === 'ark', '厂商路由标记错误');
    return 'gpt2-ref 需参考图，其余不需要';
  });

  await t('生图档位 · 纯积分制下全部可选，档位名一律归一', () => {
    // 没有会员身份，任何档位都不该被身份锁住——锁住等于用户买了积分也花不出去
    A(!isProOnlyTier('gpt2-text') && !isProOnlyTier('gpt2-ref'), 'GPT Image 2 不应再按身份加锁');
    A(!isProOnlyTier('flash') && !isProOnlyTier('pro'), 'Seedream 两档不应被加锁');
    A(resolveTier('gpt2-ref') === 'gpt2-ref', 'gpt2-ref 应原样保留');
    A(resolveTier('gpt2-text') === 'gpt2-text', 'gpt2-text 应原样保留');
    A(resolveTier('pro') === 'pro', 'Seedream Pro 应原样保留');
    A(resolveTier(undefined) === 'flash', '未指定档位应默认 flash');
    A(resolveTier('已下线的档位' as never) === 'flash', '未知档位应回落 flash');
    return '所有档位按积分扣费，不再有身份门槛';
  });

  await t('对话模型 · 只保留主档与兜底两档，界面不再让用户选模型', () => {
    // 界面已无模型下拉：多一档就多一次解释，也与「不对外卖 token」的口径冲突
    A(CHAT_MODELS.length === 2, `应只有 2 档（主档 + 兜底），实际 ${CHAT_MODELS.length}`);
    const ids = CHAT_MODELS.map((m) => m.id);
    A(new Set(ids).size === ids.length, '档位 id 有重复');
    A(ids.includes(FREE_CHAT_MODEL) && ids.includes(FALLBACK_CHAT_MODEL), '主档或兜底档不在目录里');
    const def = chatModel(FREE_CHAT_MODEL);
    A(def.id === FREE_CHAT_MODEL, '默认档不在目录里');
    // 已下线的档位必须能映射走，否则云函数会收到一个白名单外的名字
    A(chatModel('deepseek-chat').id === FREE_CHAT_MODEL, 'deepseek-chat 未映射到默认档');
    A(chatModel('kimi-k3.1-pro').id === FREE_CHAT_MODEL, '已下线的 kimi 未映射到默认档');
    A(chatModel('不存在的档位').id === FREE_CHAT_MODEL, '未知档位没有回落默认档');
    return ids.join(' / ');
  });

  await t('对话模型 · 成本按 usage × 单价折算，分时价格正确', () => {
    const flash = chatModel('ds-v41-flash');
    const usage = { prompt_tokens: 1000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 0 } };
    // 2026-11-11 是周三：北京时间 20:00 = UTC 12:00（空闲时段）
    const offpeak = new Date('2026-11-11T12:00:00Z');
    const peak = new Date('2026-11-11T02:00:00Z'); // 北京时间 10:00（高峰时段）
    A(!isPeakNow(offpeak), '20:00 应为空闲时段');
    A(isPeakNow(peak), '10:00 应为高峰时段');
    const off = costOfUsage(flash, usage, offpeak);
    const on = costOfUsage(flash, usage, peak);
    A(Math.abs(off - 0.003) < 1e-9, `空闲时段成本应为 0.003，实际 ${off}`);
    A(Math.abs(on - 0.006) < 1e-9, `高峰时段成本应为 0.006，实际 ${on}`);
    // 缓存命中按 cache 价（0.02），不能按输入价（1.0）算，否则成本高估 50 倍
    const cached = costOfUsage(flash, { prompt_tokens: 1000, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 1000 } }, offpeak);
    A(Math.abs(cached - 0.00002) < 1e-9, `缓存命中成本应为 0.00002，实际 ${cached}`);
    // 周末不算高峰
    A(!isPeakNow(new Date('2026-11-14T02:00:00Z')), '周六白天不该按高峰计价');
    return `空闲 ${off} / 高峰 ${on}`;
  });

  await t('用量进度 · 分母取默认桶与近期充值量的较大者', () => {
    A(CREDIT_BUCKET_FREE === 100, `默认桶应为 100，实际 ${CREDIT_BUCKET_FREE}`);
    // 只有默认桶：分母 100，余额 62 → 用掉 38
    const base = usageStat(62)!;
    A(base.bucket === 100 && base.used === 38 && base.pct === 38, `默认桶计算错误: ${JSON.stringify(base)}`);
    // 充过值：分母换成该次充值量
    const paid = usageStat(1800, { recharge: 2100 })!;
    A(paid.bucket === 2100 && paid.used === 300 && paid.pct === 14, `充值桶计算错误: ${JSON.stringify(paid)}`);
    // 小额发放不该把分母压到比默认桶还小
    const small = usageStat(80, { recharge: 100 })!;
    A(small.bucket === 100, `小额发放把分母压小了: ${JSON.stringify(small)}`);
    // 余额比充值量还多（充值后还没怎么用）→ 0%，不出现负进度
    const more = usageStat(3500, { recharge: 2100 })!;
    A(more.bucket === 2100 && more.pct === 0 && more.used === 0, `余额超桶时算出了负进度: ${JSON.stringify(more)}`);
    // 未登录 / 未计量 → null，界面显示占位而不是 0%
    A(usageStat(null) === null, '无余额时应返回 null');
    return '默认桶 / 充值量 / 小额发放 / 超桶 四种情况均正确';
  });

  await t('定价口径 · 只有积分，没有任何按月收费的字段', () => {
    // 旧版这里有 proMonthlyPriceUSD / proMonthlyQuota，语义含糊到被数据库函数
    // 当成「开会员送 3000 积分」。这类字段一旦回到 PRICING，误发积分就会重演。
    const keys = Object.keys(PRICING);
    for (const banned of ['proMonthlyPriceUSD', 'proMonthlyPriceRMB', 'proMonthlyPriceCodeRMB', 'proMonthlyQuota', 'proCreditBucket']) {
      A(!keys.includes(banned), `PRICING 不应再有会员字段 ${banned}`);
    }
    A(PRICING.freeTrialUses > 0, '新注册赠送积分必须为正');
    A(PRICING.costs.chat === 0, '对话必须免费，否则与「聊天不扣积分」的对外说明冲突');
    return `无会员字段 · 注册送 ${PRICING.freeTrialUses} 积分 · 对话 ${PRICING.costs.chat} 积分`;
  });

  await t('积分包 · 三档递增、单位价格递减、兑换码价低于美元折算', () => {
    const packs = PRICING.creditsPacks;
    A(packs.length === 3, `应有 3 档积分包，实际 ${packs.length}`);
    for (let i = 0; i < packs.length; i += 1) {
      const p = packs[i];
      A(p.points > 0 && p.priceUSD > 0 && p.priceRMB > 0, `第 ${i + 1} 档价格或积分缺失`);
      // 兑换码价（人民币）必须低于美元折算价：双轨定价的意义就在这里
      const converted = p.priceUSD * PRICING.usdToRmb;
      A(p.priceRMB < converted,
        `${p.points} 积分兑换码价 ¥${p.priceRMB} 高于美元折算 ¥${converted.toFixed(1)}`);
      if (i > 0) {
        const prev = packs[i - 1];
        A(p.points > prev.points, '积分档位必须按积分从少到多排列');
        // 单位积分价必须递减，否则大包不划算，用户没有买大包的理由
        A(p.priceUSD / p.points < prev.priceUSD / prev.points,
          `${p.points} 积分的美元单价不低于 ${prev.points} 积分那档`);
        A(p.priceRMB / p.points < prev.priceRMB / prev.points,
          `${p.points} 积分的兑换码单价不低于 ${prev.points} 积分那档`);
      }
    }
    A(PRICING.customPointsPerRMB > 0, '自定义积分比例必须为正');
    return packs.map((p) => `${p.points}=US$${p.priceUSD}/¥${p.priceRMB}`).join(' / ');
  });

  await t('支付回跳 · hash 路由下的参数识别', () => {
    const g = globalThis as unknown as { window?: unknown };
    const prev = g.window;
    const set = (hash: string) => { g.window = { location: { hash, search: '', pathname: '/' }, history: { replaceState() {} } }; };
    try {
      set('#/subscribe?paid=1');
      A(payReturnFlag().returned && payReturnFlag().paid, 'paid=1 应识别为支付回跳');
      set('#/subscribe?checkout_id=ch_123');
      A(payReturnFlag().returned && payReturnFlag().paid, 'checkout_id 也应识别为回跳');
      set('#/subscribe');
      A(!payReturnFlag().returned && !payReturnFlag().paid, '无参数时不应识别为回跳');
      set('#/wizard?step=3&paid=0');
      A(payReturnFlag().returned && !payReturnFlag().paid, 'paid=0 是回跳但不代表已付');
      return 'paid=1 / checkout_id / 无参 / paid=0 四种情况正确';
    } finally { g.window = prev; }
  });

  await t('支付回跳 · 地址栏参数必须清干净（不清就会每次刷新都重新「正在确认」）', () => {
    const g = globalThis as unknown as { window?: unknown };
    const prev = g.window;
    const urls: string[] = [];
    const stub = (hash: string, search: string) => ({
      location: { hash, search, pathname: '/' },
      history: { replaceState: (_s: unknown, _t: unknown, u: string) => { urls.push(String(u)); } },
    });
    try {
      // 1) 本站正常形态：参数在 hash 里
      g.window = stub('#/credits?paid=1', '');
      clearPayReturnFlag();
      A(urls[0] === '/#/credits', `hash 里的 paid 没清掉：${urls[0]}`);

      // 2) 有些渠道会把参数放在 # 之前，只清 hash 的话会一直跟着页面跑
      urls.length = 0;
      g.window = stub('#/credits', '?paid=1&checkout_id=ch_1');
      clearPayReturnFlag();
      A(urls[0] === '/#/credits', `search 里的支付参数没清掉：${urls[0]}`);

      // 3) 没有支付参数时不该改写地址（会多一次无意义的历史记录）
      urls.length = 0;
      g.window = stub('#/credits', '');
      clearPayReturnFlag();
      A(urls.length === 0, '没有支付参数时不应改写地址');
      return 'hash / search 两处的 paid 与 checkout_id 都会被清掉';
    } finally { g.window = prev; }
  });

  await t('复刻提示词 · 复刻度分带必须真的改变指令，标题必须强制替换', () => {
    const main = KINDS.find((k) => k.id === 'main')!;
    const cover = KINDS.find((k) => k.id === 'cover')!;
    const exact = buildReplicatePrompt(main, 100, '', true, true);
    const layout = buildReplicatePrompt(main, 70, '', true, true);
    const loose = buildReplicatePrompt(main, 30, '', true, true);
    A(exact !== layout && layout !== loose && exact !== loose, '三带提示词完全相同，等于复刻度白拖');
    A(/一比一/.test(exact), '一比一带必须写明一比一');
    // 一比一不能拼类型场景句：那句话在要求重新构图，会把「照参考图」抵消掉
    A(!exact.includes(main.scene), '一比一档不应拼入会要求重新构图的场景句');
    A(layout.includes(main.scene), '参考版式带应保留场景规则');
    A(/重新设计/.test(loose), '只借感觉带必须明确要求重新设计版式');
    A(!/一比一/.test(loose), '只借感觉带不能出现一比一字样');
    // 滑杆是连续的：带内数值要出现在指令里，让「拖到多少」可追溯
    A(/复刻度 70%/.test(layout) && /复刻度 55%/.test(buildReplicatePrompt(main, 55, '', true, true)),
      '带内数值没有写进指令');
    // 标题：用户的标题必须是最高优先级指令，禁止照抄参考图原文字
    const withTitle = buildReplicatePrompt(cover, 100, '', true, true, '从零代码到 AI 产品矩阵');
    A(withTitle.includes('「从零代码到 AI 产品矩阵」'), '用户标题没有进入提示词');
    A(/严禁照抄或残留/.test(withTitle), '标题指令必须禁止照抄参考图原文字');
    const noTitle = buildReplicatePrompt(cover, 100, '', true, true);
    A(!noTitle.includes('严禁照抄'), '不填标题时不应出现替换指令');
    // 历史草稿里的 20–100 要能反查回档位，不能落到默认档以外
    A(fidelityLevel(95) === 'exact' && fidelityLevel(64) === 'layout' && fidelityLevel(35) === 'loose',
      '数值到档位的映射不正确');
    // 带参考图时收尾句不得再禁拼贴/分栏——分屏模版本身就是分栏
    A(!/无拼贴/.test(buildReplicatePrompt(cover, 100, '', true, false)), '有参考图时不应禁止拼贴分栏');
    A(/无拼贴/.test(buildReplicatePrompt(cover, 100, '', false, false)), '无参考图时应保留禁止拼贴');
    return '三带互不相同 + 标题强制替换 + 拼贴规则随参考图切换';
  });

  await t('模版库 · 每个模版都必须能直接开工', () => {
    // 允许为空：正式素材还没到位时这一页显示「准备中」的空状态，不是故障
    if (!TEMPLATES.length) return '模版库为空（等待正式素材，页面走空状态）';
    const ids = new Set<string>();
    const imgs = new Set<string>();
    for (const m of TEMPLATES) {
      A(!ids.has(m.id), `模版 id 重复：${m.id}`); ids.add(m.id);
      // 分类必须落在真实的复刻类型上，否则点进去会没有场景规则
      A(!!kindById(m.kind), `模版 ${m.id} 的类型 ${m.kind} 不存在`);
      // 比例必须是 RATIOS 里的值：界面按钮按它高亮，生图按它取尺寸
      A(RATIOS.some((r) => r.id === m.ratio), `模型 ${m.id} 的比例 ${m.ratio} 不在尺寸表里`);
      // 复刻度只允许三档，和历史草稿的数值映射保持同一套
      A(FIDELITIES.some((f) => f.value === m.fidelity), `模型 ${m.id} 的复刻度 ${m.fidelity} 不是合法档位`);
      A(m.img.startsWith('./tpl/'), `模型 ${m.id} 的参考图必须走站内相对路径`);
      A(!imgs.has(m.img), `模型 ${m.id} 与其它模型共用同一张参考图`); imgs.add(m.img);
      A(!!m.name.zh && !!m.name.en, `模型 ${m.id} 缺少双语名称`);
      A(!!m.desc.zh && !!m.desc.en, `模型 ${m.id} 缺少双语说明`);
      A(m.prompt.trim().length > 6, `模型 ${m.id} 没有预设提示词，预填就白做了`);
    }
    // 至少覆盖一个分类，避免「全填成同一种、其它分类点进去是空页」
    A(KINDS.some((k) => TEMPLATES.some((m) => m.kind === k.id)), '没有任何分类有可用模版');
    return `${TEMPLATES.length} 个模版，覆盖 ${new Set(TEMPLATES.map((m) => m.kind)).size} 个分类`;
  });

  return R;
}
