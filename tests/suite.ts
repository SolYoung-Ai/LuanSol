/* LunaSol 真实功能测试套件（Node + 浏览器共用同一套断言）
 * 浏览器部分覆盖 PDF 生成与字节级预检、SVG 位图渲染等依赖 DOM 的能力。 */
import { createEmptyBrief, nextQuestion, parseSize, parseUtterance } from '../src/engine/brief';
import { STRUCTURE_MIN, buildDieline, dielineStats, faceSizes, STRUCTURES, structureById } from '../src/engine/structure';
import { buildSchemes, cloneDesign, faceSvg, fitText, makeText, textOverflow } from '../src/engine/design';
import { applyPatch, localIntent } from '../src/engine/modify';
import { autoFix, runPrepress } from '../src/engine/prepress';
import { auditDieline, validateStructureInput } from '../src/engine/structureAudit';
import { viewerSupport } from '../src/studio/viewerSupport';
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
import { migrateProductInfo, migrateProject, migrateWorkflow } from '../src/migrations';
import { humanizeAuthError, isSessionNoise } from '../src/cloud/authErrors';
import type { DesignTask, Project, ProjectWorkflow } from '../src/types';
import {
  CATEGORIES, FORMS_BY_CATEGORY, PAGES, PAGE_TOTAL, STUDIO_ID_PREFIX, createStudioProject, emptyAnswers,
  exportStructured, isBlankStudio, missingRequired, normalizeStudioProject, pageOfStep, projectName,
  recommendSize, sizeOk, stepOfPage, ans, normalizeDesign, faceEls, withFaceEls,
  type DesignEl, type StudioProject,
} from '../src/studio/types';
import {
  STUDIO_BLEED, STUDIO_SAFE, designDocFor, dielineOf, dielineSummary, dimsOf, drawOrder, elLocalRect,
  elSheetRect, elToLayer, faceDoc, faceOrigins, faceRatio, facesOf, hasDieline, layerToEl, mmToPct,
  pctToMm, structureFor, validBox, PT_PER_MM,
} from '../src/studio/frames';
import {
  addImage, addShape, addText, buildDesign, duplicateEls, groupEls, moveEl, orderEls, patchEl,
  patchEls, ratioFor, removeEl, reorderEl, resizeEl, setElsBox, setSticker, stickerPrompt, ungroupEls,
} from '../src/studio/design';
import {
  clientToMm, expandSelection, mmRectToPct, resizeBox, selectionFrame, textOverflow as elOverflows,
  corners, normalizeAngle,
} from '../src/studio/vec';
import {
  HISTORY_LIMIT, canRedo, canUndo, createHistory, pushHistory, redoHistory, undoHistory,
} from '../src/studio/history';
import {
  mapBoxToCanvas, mmBoxToPct, normalizeBox, placementSelfCheck,
} from '../src/engine/layerPlacement';
import { classifyLayer, parseSplitResponse } from '../src/engine/seedreamLayers';
import { importSplitLayers } from '../src/studio/layerImport';
import { previewPlan, executePlan, planIsStale } from '../src/studio/ai/executor';
import { buildAIContext as buildStudioAIContext, designDigest } from '../src/studio/ai/context';
import { STUDIO_TOOL_DEFS } from '../src/studio/ai/tools';
import type { StudioAIPlan, StudioAISnapshot } from '../src/studio/ai/types';

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


  /* ---------------- 阶段五：结构验证、3D 映射与导出交付 ---------------- */
  await t('阶段五 · 七种结构基础计算：尺寸有限、面板为正、无零边', () => {
    const dims = { l: 80, w: 50, h: 40 };
    const expectFaces: Record<StructureId, string[]> = {
      tuck: ['front', 'back', 'left', 'right', 'top'],
      topBottom: ['front', 'back', 'left', 'right', 'top'],
      drawer: ['front', 'back', 'left', 'right', 'top'],
      mailer: ['front', 'back', 'left', 'right', 'top'],
      pouch: ['front', 'back'],
      labelRect: ['front'],
      labelRound: ['front'],
    };
    const rows: string[] = [];
    for (const s of STRUCTURES) {
      const d = buildDieline(s.id, dims, 3, 5);
      A(d.sheets.length >= 1 && d.sheets.length <= 2, `${s.id} 展开图数量异常 ${d.sheets.length}`);
      A(Number.isFinite(d.finished.l) && Number.isFinite(d.finished.w) && Number.isFinite(d.finished.h), `${s.id} 成品尺寸非有限数`);
      for (const sh of d.sheets) {
        A(Number.isFinite(sh.width) && sh.width > 0, `${s.id}/${sh.id} 展开宽非正`);
        A(Number.isFinite(sh.height) && sh.height > 0, `${s.id}/${sh.id} 展开高非正`);
        for (const r of sh.rects) {
          A([r.x, r.y, r.w, r.h].every(Number.isFinite), `${s.id}/${sh.id}/${r.label} 面板坐标非有限`);
          A(r.w > 0 && r.h > 0, `${s.id}/${sh.id}/${r.label} 面板非正面积 ${r.w}×${r.h}`);
        }
        for (const g of sh.segments) {
          A([g.x1, g.y1, g.x2, g.y2].every(Number.isFinite), `${s.id} 线段坐标非有限`);
          A(Math.abs(g.x1 - g.x2) > 1e-6 || Math.abs(g.y1 - g.y2) > 1e-6, `${s.id} 存在零长度 ${g.kind} 线段`);
        }
      }
      const trueFaces = [...new Set(d.sheets.flatMap((sh) => sh.rects.filter((r) => r.face && r.artwork).map((r) => r.face!)))];
      const declared = Object.keys(faceSizes(s.id, dims));
      A(trueFaces.every((f) => declared.includes(f)), `${s.id} faceSizes 漏掉真实面 ${trueFaces.join(',')}`);
      A(declared.every((f) => (expectFaces[s.id] as string[]).includes(f)), `${s.id} faceSizes 虚构了不存在的面 ${declared.join(',')}`);
      const audit = auditDieline(d);
      A(!audit.issues.some((i) => i.level === 'error'), `${s.id} 审计报错：${audit.issues.filter((i) => i.level === 'error').map((i) => i.code + ' ' + i.detail).join('；')}`);
      rows.push(`${s.id}:${d.sheets.length}张/${d.sheets[0].width}×${d.sheets[0].height}`);
    }
    return rows.join(' | ');
  });

  await t('阶段五 · tuck 多尺寸矩阵：小/中/大/极端/非法全部可解释', () => {
    const cases: { name: string; size: { l: number; w: number; h: number } }[] = [
      { name: '小型', size: { l: 30, w: 20, h: 12 } },
      { name: '中型', size: { l: 80, w: 50, h: 40 } },
      { name: '大型', size: { l: 300, w: 200, h: 150 } },
      { name: '细长', size: { l: 200, w: 20, h: 40 } },
      { name: '最小', size: { l: 20, w: 15, h: 8 } },
      { name: '零值', size: { l: 0, w: 0, h: 0 } },
      { name: '负值', size: { l: -50, w: -20, h: -10 } },
      { name: 'NaN', size: { l: Number.NaN, w: 30, h: 20 } },
    ];
    const out: string[] = [];
    for (const c of cases) {
      const d = buildDieline('tuck', c.size, 3, 5);
      const sh = d.sheets[0];
      A(Number.isFinite(sh.width) && Number.isFinite(sh.height), `${c.name} 展开尺寸非有限`);
      for (const r of sh.rects) A(Number.isFinite(r.x + r.y + r.w + r.h) && r.w > 0 && r.h > 0, `${c.name} 面板非法`);
      const audit = auditDieline(d);
      const invalid = ['零值', '负值', 'NaN'].includes(c.name);
      const structuralErrors = audit.issues.filter((i) => i.level === 'error' && i.code !== 'input-clamped');
      A(!structuralErrors.length, `${c.name} 几何审计报错：${structuralErrors.map((i) => i.code).join(',')}`);
      if (invalid) A(audit.issues.some((i) => i.code === 'input-clamped'), `${c.name} 审计未标记 input-clamped`);
      if (invalid) {
        A(d.clamped, `${c.name} 被静默改成合法尺寸，未标记 clamped`);
        A(d.input !== undefined, `${c.name} 未保留原始输入`);
        A(d.warnings.some((w) => /下限|非法|NaN|有限/.test(w)), `${c.name} 未给出可读警告`);
      } else {
        A(!d.clamped, `${c.name} 合法输入被误判为 clamped`);
      }
      out.push(`${c.name}:${sh.width.toFixed(1)}×${sh.height.toFixed(1)}${d.clamped ? '(clamped)' : ''}`);
    }
    // 非法补充参数不能静默吃掉：仍要生成合法几何，同时说明采用了什么值
    const weird = buildDieline('tuck', { l: 80, w: 50, h: 40 }, 3, 5, { glue: -50, tuckLen: Number.POSITIVE_INFINITY });
    A(weird.warnings.some((w) => /结构参数「glue」/.test(w)), '非法 glue 没有可读警告');
    A(weird.warnings.some((w) => /结构参数「tuckLen」/.test(w)), 'Infinity tuckLen 没有可读警告');
    A(auditDieline(weird).issues.every((i) => i.level !== 'error'), '非法补充参数导致几何错误');
    return out.join(' | ');
  });

  await t('阶段五 · 切割线与压痕线：无重复、压痕落在面板、裁切不穿面板内部', () => {
    const d = buildDieline('tuck', { l: 80, w: 50, h: 40 }, 3, 5);
    const s = d.sheets[0];
    const keys = new Map<string, string>();
    for (const g of s.segments) {
      const k = `${g.kind}:${Math.min(g.x1, g.x2).toFixed(2)},${Math.min(g.y1, g.y2).toFixed(2)}:${Math.max(g.x1, g.x2).toFixed(2)},${Math.max(g.y1, g.y2).toFixed(2)}`;
      A(!keys.has(k), `重复线段 ${k}（${keys.get(k)} 与 ${g.kind}）`);
      keys.set(k, g.kind);
    }
    const creases = s.segments.filter((g) => g.kind === 'crease');
    A(creases.length >= 4, `压痕线过少 ${creases.length}`);
    for (const cr of creases) {
      const midX = (cr.x1 + cr.x2) / 2, midY = (cr.y1 + cr.y2) / 2;
      const owners = s.rects.filter((r) => midX >= r.x - 0.6 && midX <= r.x + r.w + 0.6 && midY >= r.y - 0.6 && midY <= r.y + r.h + 0.6).length;
      A(owners >= 2, `压痕 ${midX},${midY} 只落在 ${owners} 块面板上，不是有效折线`);
      A(!s.rects.some((r) => midX > r.x + 0.6 && midX < r.x + r.w - 0.6 && midY > r.y + 0.6 && midY < r.y + r.h - 0.6), '压痕线穿过了面板内部');
    }
    const cut = s.segments.filter((g) => g.kind === 'cut');
    A(cut.length >= 8, `裁切线过少 ${cut.length}`);
    return `${cut.length} 裁切 / ${creases.length} 压痕；无重复，压痕均落在 ≥2 块面板交界`;
  });

  await t('阶段五 · 出血与安全区：出血为外轮廓并集，安全区不产生零边', () => {
    const mid = buildDieline('tuck', { l: 80, w: 50, h: 40 }, 3, 5);
    const s = mid.sheets[0];
    const panels = s.rects.length;
    const bleed = s.segments.filter((g) => g.kind === 'bleed');
    A(bleed.length > 0, '没有出血线');
    A(bleed.length < panels * 4, `出血线仍是逐面板 4 边（${bleed.length} = ${panels}×4），未合并外轮廓`);
    A(s.safeRects.length > 0 && s.safeRects.every((r) => r.w > 0 && r.h > 0), '安全区存在非正矩形');
    A(!s.segments.some((g) => g.kind === 'safe' && Math.abs(g.x1 - g.x2) < 1e-6 && Math.abs(g.y1 - g.y2) < 1e-6), '安全区出现零长度线');
    // 小面板：宽高小于 2×safe，安全区必须为空而非负尺寸
    const tiny = buildDieline('labelRect', { l: 20, w: 15, h: 0 }, 3, 5).sheets[0];
    A(tiny.safeRects.every((r) => r.w > 0 && r.h > 0), '小面板安全区出现非正宽高');
    A(tiny.segments.filter((g) => g.kind === 'safe').every((g) => Math.abs(g.x1 - g.x2) > 1e-6 || Math.abs(g.y1 - g.y2) > 1e-6), '小面板安全区零边');
    return `出血 ${bleed.length} 段 < ${panels * 4}；安全区 ${s.safeRects.length} 块 / 小面板 ${tiny.safeRects.length} 块`;
  });

  await t('阶段五 · 2D↔3D 面板映射：尺寸同源，不可靠结构明确标记不支持', () => {
    const sizes = { l: 80, w: 50, h: 40 };
    const expect: Record<StructureId, string> = {
      tuck: 'reliable', topBottom: 'reliable', labelRect: 'reliable', labelRound: 'reliable',
      drawer: 'unsupported', mailer: 'unsupported', pouch: 'unsupported',
    };
    const rows: string[] = [];
    for (const s of STRUCTURES) {
      const d = buildDieline(s.id, sizes, 3, 5);
      const v = viewerSupport(s.id);
      A(v.level === expect[s.id], `${s.id} 3D 支持级别错误 ${v.level}`);
      A(!!v.title && !!v.detail, `${s.id} 缺少不可用说明`);
      if (v.level === 'reliable') {
        const fs = faceSizes(s.id, sizes);
        for (const [face, dim] of Object.entries(fs)) {
          const rects = d.sheets.flatMap((sh) => sh.rects.filter((r) => r.face === face && r.artwork));
          A(rects.length > 0, `${s.id} 声称可靠但缺少 ${face} 面板`);
          A(Math.abs(dim.w - rects[0].w) < 1e-6 && Math.abs(dim.h - rects[0].h) < 1e-6, `${s.id}/${face} 3D 读取尺寸 ${dim.w}×${dim.h} 与刀模 ${rects[0].w}×${rects[0].h} 不一致`);
        }
      }
      if (s.id === 'labelRect' || s.id === 'labelRound') A(!('back' in faceSizes(s.id, sizes)), `${s.id} 不应虚构背面`);
      rows.push(`${s.id}:${v.level}`);
    }
    return rows.join(' | ');
  });

  await t('阶段五 · SVG 真实毫米尺寸与可编辑文字', () => {
    const svg = spreadSvg(design, dieline, 0, true);
    const sh = dieline.sheets[0];
    A(svg.includes(`width="${sh.width}mm"`) && svg.includes(`height="${sh.height}mm"`), 'SVG 根尺寸不是真实毫米');
    A(/viewBox="0 0 [\d.]+ [\d.]+"/.test(svg), 'SVG 缺少毫米 viewBox');
    A(svg.includes('data-width-mm=') && svg.includes('data-height-mm='), 'SVG 缺少尺寸说明元数据');
    A(svg.includes('<text'), 'SVG 丢失可编辑文字');
    const layers = ['layer-print', 'layer-cut', 'layer-crease', 'layer-bleed', 'layer-safe'];
    for (const l of layers) A(svg.includes(`id="${l}"`), `SVG 缺少分层 ${l}`);
    return `${sh.width}×${sh.height}mm / ${svg.length} bytes / 5 层`;
  });

  await t('阶段五 · DXF 单位与真实毫米坐标', () => {
    const dxf = buildDxf(dieline, 0);
    A(/\$INSUNITS\n70\n4/.test(dxf), 'DXF 未声明毫米');
    A(/\$MEASUREMENT\n70\n1/.test(dxf), 'DXF 未声明公制');
    const sh = dieline.sheets[0];
    const first = dxf.split('\n');
    let checked = 0;
    for (let i = 0; i < first.length - 1; i++) {
      if (first[i] !== '0' || first[i + 1] !== 'LINE') continue;
      const x1 = Number(first[i + 8]), y1 = Number(first[i + 10]);
      const x2 = Number(first[i + 14]), y2 = Number(first[i + 16]);
      A([x1, y1, x2, y2].every(Number.isFinite), 'DXF 坐标非有限');
      A(x1 >= -0.01 && x1 <= sh.width + 0.01 && x2 >= -0.01 && x2 <= sh.width + 0.01, `DXF X 超展开宽 ${x1}..${x2}`);
      A(y1 >= -0.01 && y1 <= sh.height + 0.01 && y2 >= -0.01 && y2 <= sh.height + 0.01, `DXF Y 超展开高 ${y1}..${y2}`);
      checked++;
    }
    A(checked > 8, `DXF 实体过少 ${checked}`);
    return `${checked} 条 LINE 均在 0..${sh.width} / 0..${sh.height} mm 内`;
  });

  await t('阶段五 · 印前异常报告：非法尺寸被拦截，不静默通过', () => {
    const bad = buildDieline('tuck', { l: 0, w: 0, h: 0 }, 3, 5);
    const b = { ...brief, size: { l: 0, w: 0, h: 0 }, structure: 'tuck' as StructureId };
    const r = runPrepress({ design, brief: b, dieline: bad, dpi: 300 });
    A(r.status === 'error', `非法尺寸印前状态为 ${r.status}，应拦截`);
    const size = r.items.find((i) => i.id === 'size');
    A(size?.level === 'error', '非法尺寸未报 size error');
    const geo = r.items.find((i) => i.id === 'geometry-integrity');
    A(geo?.level === 'error', 'clamped 输入未报几何错误');
    A(r.items.some((i) => /下限|夹/.test(i.detail)), '报告未说明尺寸被夹取');
    const v = validateStructureInput('tuck', { l: 0, w: 0, h: 0 });
    A(v.some((i) => i.level === 'error'), 'validateStructureInput 未拦截零值');
    return `status=${r.status} / size=${size?.level} / geometry=${geo?.level}`;
  });

  await t('阶段五 · 印前异常报告：低 PPI / 缺图 / 透明底 / 文字越界与过小', () => {
    const doc = cloneDesign(design);
    const face = doc.faces.front!;
    face.bg = '';
    const tpl = face.layers.find((l) => l.type === 'text') as TextLayer;
    const png1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    face.layers.push(
      { ...tpl, id: 'tiny_cross', name: '越界小字', text: '越界', x: Math.max(0, face.w - 10), y: 0, w: 30, h: 10, fontSize: 3, zIndex: 999 },
      { id: 'low_img', name: '低分辨率图', type: 'image', x: 0, y: 0, w: face.w + 10, h: 50, rotation: 0, opacity: 1, locked: false, zIndex: 998, src: png1x1, naturalW: 100, naturalH: 100, fit: 'cover' },
      { id: 'missing_img', name: '空图', type: 'image', x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, locked: false, zIndex: 997, src: '', naturalW: 0, naturalH: 0, fit: 'cover' },
    );
    const rep = runPrepress({ design: doc, brief, dieline, dpi: 300 });
    const item = (id: string) => rep.items.find((i) => i.id === id);
    A(item('dpi')?.level === 'error', `低 PPI 未报 error：${item('dpi')?.level}`);
    A(/按实际印刷毫米尺寸反算/.test(item('dpi')?.detail || ''), '未说明按实际印刷尺寸计算 PPI');
    A(item('image-missing')?.level === 'error', '缺图未报 error');
    A(item('image-alpha')?.level === 'error', '透明图叠在无底色面上未报 error');
    A(item('image-bounds')?.level === 'warning', '图片越界未报 warning');
    A(item('text-cross')?.level === 'error', '文字跨面板未报 error');
    A(item('text-small')?.level === 'warning', '文字小于 1.5mm 未报 warning');
    A(rep.status === 'error', `综合状态应为 error，实际 ${rep.status}`);
    return `dpi=${item('dpi')?.level} / missing=${item('image-missing')?.level} / alpha=${item('image-alpha')?.level} / bounds=${item('image-bounds')?.level} / text-cross=${item('text-cross')?.level}`;
  });

  await t('阶段五 · PDF 真实毫米页面与透明图 alpha 保留', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const doc = {
      id: 'alpha', name: '透明图测试', scheme: 'minimal',
      palette: { bg: '#FFFFFF', ink: '#191919', accent: '#F47735', muted: '#999999' },
      rationale: '', createdAt: 1,
      faces: { front: { id: 'front', w: 80, h: 80, bg: '#FFFFFF', layers: [
        { id: 'alpha_img', name: '透明 PNG', type: 'image', x: 10, y: 10, w: 40, h: 40, rotation: 0, opacity: 1, locked: false, src: png, naturalW: 1, naturalH: 1, fit: 'cover', process: 'print' },
      ] } },
    } as unknown as DesignDoc;
    const d = buildDieline('labelRect', { l: 80, w: 80, h: 0 }, 3, 5);
    const { bytes } = await buildPdf(doc, d, 300);
    const text = new TextDecoder('latin1').decode(bytes);
    const box = text.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
    A(!!box, 'PDF 缺少 MediaBox');
    A(Math.abs(Number(box![1]) - d.sheets[0].width * 72 / 25.4) < 0.2 && Math.abs(Number(box![2]) - d.sheets[0].height * 72 / 25.4) < 0.2, `PDF 页面不是 ${d.sheets[0].width}×${d.sheets[0].height}mm：${box?.[1]}×${box?.[2]}pt`);
    A(text.includes('/SMask'), '透明 PNG 在 PDF 中丢失 alpha（没有 SMask）');
    A((text.match(/\/Type \/Page\b/g) || []).length >= 3, 'PDF 未按印刷 / CUT / CREASE 分页');
    return `${Number(box![1]).toFixed(2)}×${Number(box![2]).toFixed(2)}pt / SMask 存在 / ≥3 页`;
  });

  if (inBrowser) {
    await t('浏览器渲染 · SVG 转 300DPI 位图', async () => {
      const sh = dieline.sheets[0];
      const c = await svgToCanvas(spreadSvg(design, dieline, 0, false), sh.width, sh.height, 72);
      A(c.width > 100 && c.height > 100, '画布尺寸异常');
      return `${c.width}×${c.height} px`;
    });

    await t('印刷 PDF · 毫米页面 / 印刷裁切压痕分页 / 逐图层绘制', async () => {
      const { bytes } = await buildPdf(design, dieline, 150);
      A(bytes[0] === 0x25 && bytes[1] === 0x50, '缺少 %PDF 文件头');
      const v = verifyPdf(bytes, dieline.sheets);
      A(v.ok, `PDF 预检失败: ${v.issues.join('；')} | ${bytes.length} bytes`);
      A(v.pages >= dieline.sheets.length * 3, `页面数不足：${v.pages} < ${dieline.sheets.length * 3}`);
      A(v.cutPages >= dieline.sheets.length && v.creasePages >= dieline.sheets.length, 'CUT / CREASE 未按展开图独立成页');
      return `${v.pages} 页 / CUT ${v.cutPages} / CREASE ${v.creasePages} / ${Math.round(v.bytes / 1024)} KB`;
    });

    await t('阶段五 · 工艺图层独立出页：烫金页 100% 黑，不混进印刷页', async () => {
      const pd = cloneDesign(design);
      const foil = pd.faces.front!.layers.find((l) => l.type === 'text' || l.type === 'shape');
      A(!!foil, '找不到可标记工艺的图层');
      foil!.process = 'foil';
      const { bytes } = await buildPdf(pd, dieline, 150);
      const txt = new TextDecoder('latin1').decode(bytes);
      A((txt.match(/\/Type\s*\/Page\b/g) || []).length >= dieline.sheets.length * 4, '工艺图层未单独成页');
      A(txt.includes('SPOT FOIL') && txt.includes('BLACK 100% = PROCESS AREA'), '工艺页缺少独立标记');
      return '印刷 / CUT / CREASE / FOIL 四页；工艺页 100% 黑';
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

  /* ---------------------------- Studio 2.0 需求收集 ---------------------------- */

  await t('Studio · 包装形式必须属于所选类别', () => {
    for (const c of CATEGORIES) {
      const list = FORMS_BY_CATEGORY[c.id];
      A(list.length > 0, `${c.zh} 没有任何可选包装形式`);
      A(new Set(list).size === list.length, `${c.zh} 的包装形式有重复项`);
      for (const f of list) {
        A(!!recommendSize(f), `${c.zh} 的 ${f} 没有推荐尺寸，第四步会是空的`);
      }
    }
    const tea = FORMS_BY_CATEGORY.tea.map((f) => f);
    A(tea.includes('box') && tea.includes('sachet'), '茶叶类应包含茶盒与独立茶包');
    return `${CATEGORIES.length} 个类别，全部有可选项与推荐尺寸`;
  });

  await t('Studio · 推荐尺寸必须由用户确认才算定稿', () => {
    const p = createStudioProject('u_test', 1_000);
    p.answers.category = ans('tea', 'option');
    p.answers.productName = ans('山隐·明前龙井', 'user');
    p.answers.form = ans('box', 'option');
    const dims = recommendSize('box')!;
    p.answers.size = { mode: 'recommended', dims, src: 'ai', confirmed: false };

    A(sizeOk(dims), '推荐尺寸本身应合法');
    A(missingRequired(p).some((m) => m.step === 2), '未确认的 AI 尺寸必须出现在缺失项里（页码 2）');
    p.answers.size.confirmed = true;
    A(!missingRequired(p).some((m) => m.step === 2), '确认后不应再算缺失');

    // 自定义尺寸由用户填写，直接算已确认
    p.answers.size = { mode: 'custom', dims: { l: 200, w: 100, h: 60 }, src: 'user', confirmed: true };
    A(sizeOk(p.answers.size.dims), '自定义尺寸应合法');
    A(!missingRequired(p).some((m) => m.step === 2), '自定义尺寸不应再要求确认');

    // 越界尺寸必须挡住（0 / 负数 / 过小）
    A(!sizeOk({ l: 0, w: 100, h: 60 }), '0mm 不应通过');
    A(!sizeOk({ l: 5, w: 100, h: 60 }), '小于 10mm 不应通过');
    A(!sizeOk({ l: 2000, w: 100, h: 60 }), '大于 1000mm 不应通过');
    return 'AI 建议 → 待确认 → 已确认，自定义尺寸独立计';
  });

  await t('Studio · 结构化需求必须分清你写的 / 你选的 / AI 给的 / 还没确认的', () => {
    const p = createStudioProject('u_test', 2_000);
    p.answers.category = ans('tea', 'option');
    p.answers.productName = ans('山隐·明前龙井', 'user');
    p.answers.productContent = ans('100g 明前龙井', 'user');
    p.answers.form = ans('gift', 'option');
    p.answers.size = { mode: 'recommended', dims: recommendSize('gift')!, src: 'ai', confirmed: false };
    p.answers.stylePrimary = ans('oriental', 'option');
    p.answers.colors = ans(['#191919', '#F7F3EC'], 'option');
    p.answers.patterns = ans(['botanical', 'orientalPattern'], 'option');

    const out = exportStructured(p);
    A(out.written.productName === '山隐·明前龙井', '产品名称应归入「你填写」');
    A(out.selected.category === '茶叶', `类别应归入「你选择」，实际 ${out.selected.category}`);
    A(out.selected.form === '礼盒', '包装形式应归入「你选择」');
    A(Array.isArray(out.selected.patterns) && out.selected.patterns.length === 2, '图案多选应完整导出');
    A(out.ai.size && out.ai.size.confirmed === false, 'AI 尺寸必须带未确认标记');
    A(out.pending.includes('包装尺寸（AI 建议待确认）'), '未确认的 AI 尺寸必须出现在 pending 里');
    A(out.pending.includes('产品卖点'), '没填的卖点应出现在 pending 里');
    A(!('sellingPointPrimary' in out.selected), '不得凭空补出用户没给的字段');
    A(out.notes.some((n) => /尚未生成/.test(n)), '必须声明本阶段没有生成图片');
    return `${Object.keys(out.written).length} 项填写 / ${Object.keys(out.selected).length} 项选择 / ${out.pending.length} 项待补`;
  });

  await t('Studio · 项目名优先用产品名称，空项目不进列表', () => {
    const p = createStudioProject('u_test', 3_000);
    A(p.id.startsWith(STUDIO_ID_PREFIX), 'Studio 项目 id 必须带 st_ 前缀，否则会混进旧工作台');
    A(p.ownerId === 'u_test', '项目必须记录用户 ID');
    A(p.status === 'draft' && p.createdAt === 3_000 && p.updatedAt === 3_000, '新建项目应带创建 / 更新时间与 draft 状态');
    A(isBlankStudio(p), '一条都没填的新项目应判为空');
    A(projectName(p.answers) === '未命名设计', '空项目名应有兜底');
    p.answers.productName = ans('山隐·明前龙井', 'user');
    A(projectName(p.answers) === '山隐·明前龙井', '项目名必须优先用产品名称');
    A(!isBlankStudio(p), '填了产品名就不再是空项目');
    return 'id / ownerId / 名称 / 时间 / 状态 全部就位';
  });

  await t('Studio · 旧数据缺字段也能恢复，别的项目不会被误认', () => {
    const legacy = {
      id: 'st_abc123', ownerId: 'u1', name: '旧项目', status: 'draft', createdAt: 1, updatedAt: 2,
      step: 4, answers: { productName: { v: '旧名称', src: 'user', confirmed: true } },
    };
    const p = normalizeStudioProject(legacy);
    A(!!p, '缺字段的旧项目应能被补全');
    A(p!.answers.category.v === '' && p!.answers.logo.mode === '', '缺失项应补成空值，不能 undefined');
    A(p!.answers.colors.v.length === 0, '缺失的颜色数组要补成空数组');
    A(p!.step === 4, '步骤应保留');

    A(normalizeStudioProject({ id: 'proj_x', name: '旧包装项目' }) === null, '非 st_ 前缀的项目不能被当成 Studio 项目');
    A(normalizeStudioProject(null) === null, '空数据应安全返回 null');

    const empty = createStudioProject('u1', 10);
    A(Object.keys(emptyAnswers()).length === Object.keys(empty.answers).length, '空答案模板字段必须齐全');
    return '旧数据补全 + 前缀隔离';
  });

  await t('Studio · 顾问对话跟着项目走，坏数据与超长历史都要收口', () => {
    const p = createStudioProject('u1', 10);
    A(Array.isArray(p.chat) && p.chat.length === 0, '新项目应带一个空的对话数组');

    const many = Array.from({ length: 90 }, (_, i) => ({
      id: `m${i}`, role: i % 2 ? 'assistant' as const : 'user' as const, content: `第 ${i} 句`, at: i,
    }));
    const restored = normalizeStudioProject({ ...p, chat: [...many, { id: 'x', role: 'system', content: '越权角色' }] });
    A(!!restored, '带对话的项目应能被读回');
    A(restored!.chat.length === 60, `历史应裁到 60 条，实际 ${restored!.chat.length}`);
    A(restored!.chat.every((m) => m.role === 'user' || m.role === 'assistant'), '非 user/assistant 的脏数据要被丢掉');
    A(restored!.chat[restored!.chat.length - 1].content === `第 89 句`, '裁剪应保留最近的对话');

    const noChat = normalizeStudioProject({ id: 'st_old', ownerId: 'u1', name: '旧项目' });
    A(!!noChat && noChat.chat.length === 0, '没有对话字段的旧项目应补成空数组，不能 undefined');
    return '60 条上限 + 脏角色过滤 + 旧项目兜底';
  });


  await t('Studio · 编辑器第一版版面只排用户真的填过的内容', () => {
    const p = createStudioProject('u1', 10);
    const bare = buildDesign(p, 10);
    A(bare.els.every((e) => e.kind !== 'sticker'), '没选图案时不应该有贴纸位');
    A(!bare.els.some((e) => e.id === 'name'), '没填产品名称时不应该有标题文字');
    A(!bare.els.some((e) => e.id === 'sell'), '没填卖点时不能自己编一句');
    A(bare.els.some((e) => e.id === 'mark'), '水印行一直有');

    p.answers.productName = ans('云杉面霜', 'user');
    p.answers.sellingPoints = ans('冷白质地，不闷痘', 'user');
    p.answers.patterns = ans(['botanical'], 'option');
    p.answers.colors = ans(['#F7F3EC', '#2F5D4A'], 'option');
    p.answers.form = ans('box', 'option');
    const d = buildDesign(p, 20);
    A(d.els.find((e) => e.id === 'name')?.text === '云杉面霜', '标题取产品名称');
    A(d.els.some((e) => e.kind === 'sticker'), '选了图案要留贴纸位');
    A(d.bg === '#F7F3EC' && d.ink === '#2F5D4A', `底色取浅色、字色取深色，实际 ${d.bg}/${d.ink}`);
    A(d.ratio[0] === 120 && d.ratio[1] === 180, `画布比例取真实正面（120×180），实际 ${d.ratio.join('×')}`);
    return '空字段不排元素 · 有值才出现 · 色板与真实正面比例正确';
  });

  await t('Studio · 画布元素可移可拉可换图，且不会跑出画布', () => {
    const p = createStudioProject('u1', 10);
    p.answers.productName = ans('云杉面霜', 'user');
    let d = buildDesign(p, 10);
    const name = d.els.find((e) => e.id === 'name')!;

    d = moveEl(d, 'name', -500, 200);
    const moved = d.els.find((e) => e.id === 'name')!;
    A(moved.x >= -name.w + 8 && moved.x <= 96, `横向拖动应被夹住，实际 ${moved.x}`);
    A(moved.y <= 98, '纵向拖动应被夹住');

    d = resizeEl(d, 'name', 0);
    A(d.els.find((e) => e.id === 'name')!.w >= 8, '文字宽度有下限，不能被拉到看不见');
    d = resizeEl(d, 'name', 200);
    A(d.els.find((e) => e.id === 'name')!.w === 100, '宽度上限 100%');

    d = setSticker(d, 'data:image/png;base64,AAA');
    A(d.els.filter((e) => e.kind === 'sticker').length === 1, '换贴纸是原地替换，不应该越堆越多');
    A(d.els.find((e) => e.kind === 'sticker')!.src!.startsWith('data:image/'), '贴纸以 data URL 存');

    const added = addText(d);
    A(added.els.length === d.els.length + 1, '加文字应新增一个元素');
    const lastId = added.els[added.els.length - 1].id;
    const up = reorderEl(added, lastId, -1);
    A(up.els[up.els.length - 2].id === lastId, '下移一层应真的换位置');
    const gone = removeEl(added, lastId);
    A(!gone.els.some((e) => e.id === lastId), '删除应真的删掉');

    const painted = patchEl(added, lastId, { text: '改过的字', id: 'hack', kind: 'sticker' });
    const target = painted.els.find((e) => e.text === '改过的字')!;
    A(target.id === lastId && target.kind === 'text', 'patch 不允许改 id 与 kind');
    return '夹边界 · 宽度上下限 · 贴纸原地换 · 层级与删除 · patch 防串改';
  });

  await t('Studio · 设计稿读写要夹住脏数据（坐标越界、巨图、怪比例）', () => {
    A(normalizeDesign(null) === null, '空数据返回 null');
    A(normalizeDesign({ els: [] }) === null, '没有元素的设计稿不算设计稿');

    const dirty = normalizeDesign({
      ratio: [0, -3],
      bg: 'red',
      els: [
        { id: 'a', kind: 'text', text: 'x', x: 999, y: -80, w: 500, size: 0, color: 'blue' },
        { id: 'b', kind: 'sticker', src: 'javascript:alert(1)', x: 10, y: 10, w: 20 },
        { id: 'c', kind: 'svg', x: 10, y: 10, w: 10 },
        { id: 'd', kind: 'sticker', src: 'data:image/png;base64,' + 'A'.repeat(6_000_001) },
      ],
    });
    A(!!dirty, '有元素就能读回');
    A(dirty!.ratio[0] === 3 && dirty!.ratio[1] === 4, '非法比例回落到 3:4');
    A(dirty!.bg === '#FFFFFF', '非法底色回落到纸白');
    const a = dirty!.els.find((e) => e.id === 'a')!;
    A(a.x <= 100 && a.y >= 0 && a.w <= 100 && (a.size || 0) >= 0.8, '越界坐标与字号都被夹住');
    A(a.color === undefined, '非法色值被丢掉而不是照抄');
    A(dirty!.els.find((e) => e.id === 'b')!.src === undefined, '非图片 data URL 的 src 必须丢掉');
    A(dirty!.els.find((e) => e.id === 'c')!.kind === 'text', '未知 kind 归一到 text');
    A(!dirty!.els.some((e) => e.id === 'd'), '超过 6MB 的贴纸不进项目，避免 payload 撑爆');

    const p = createStudioProject('u1', 10);
    A(p.design === null, '新项目没有设计稿');
    const restored = normalizeStudioProject({ ...p, design: { els: [{ id: 'x', kind: 'text', text: '你好', x: 10, y: 10, w: 30 }] } });
    A(!!restored!.design, '带设计稿的项目能读回');
    A(normalizeStudioProject({ ...p, design: { els: [] } })!.design === null, '空设计稿当成没有');
    return '比例/底色回落 · 坐标夹紧 · 巨图与非图片被拒 · 项目级拼装';
  });

  await t('Studio · 贴纸提示词只写用户给过的信息，并带负向约束', () => {
    const p = createStudioProject('u1', 10);
    const bare = stickerPrompt(p);
    A(bare.includes('几何图案'), '没选图案时用中性默认，不乱猜');
    A(!/香|甜|配方|功效/.test(bare), '不能凭空补产品事实');
    A(bare.includes('不要出现文字') && bare.includes('商标'), '必须带「不要文字/商标」的负向约束');

    p.answers.category = ans('skincare', 'option');
    p.answers.stylePrimary = ans('minimal', 'option');
    p.answers.patterns = ans(['botanical'], 'option');
    p.answers.colors = ans(['#F7F3EC'], 'option');
    const s = stickerPrompt(p);
    A(s.includes('护肤') && s.includes('极简现代') && s.includes('植物元素'), '类别/风格/图案都要进提示词');
    A(s.includes('象牙白'), '色值要翻成人能读的色名');
    return '默认中性 · 无编造 · 负向约束 · 需求入词';
  });

  await t('Studio · 包装形式必须映射到真实刀模结构（手提袋明确没有）', () => {
    A(structureFor('box') === 'tuck', '纸盒应走 tuck 刀模');
    A(structureFor('gift') === 'topBottom', '礼盒应走天地盖');
    A(structureFor('pouch') === 'pouch' && structureFor('bag3d') === 'pouch', '袋类走 pouch');
    A(structureFor('can') === 'labelRect', '罐/瓶/管/袋装走标签刀模');
    A(structureFor('tote') === null && !hasDieline('tote'), '手提袋没有刀模，必须返回 null 而不是借用纸盒');
    return '11 个形式 → 结构映射，缺失项显式 null';
  });

  await t('Studio · 面清单与比例直接读刀模，不另写一份尺寸表', () => {
    const p = createStudioProject('u1', 10);
    p.answers.form = ans('box', 'option');
    p.answers.size = { mode: 'custom', dims: { l: 120, w: 60, h: 180 }, src: 'user', confirmed: true };
    const panels = facesOf(p);
    A(panels.map((f) => f.id).join(',') === 'front,back,left,right,top', `tuck 应有五个可印刷面，实际 ${panels.map((f) => f.id).join(',')}`);
    const front = panels.find((f) => f.id === 'front')!;
    A(front.w === 120 && front.h === 180, `正面应为 120×180，实际 ${front.w}×${front.h}`);
    const side = panels.find((f) => f.id === 'left')!;
    A(side.w === 60 && side.h === 180, `侧面应为 60×180，实际 ${side.w}×${side.h}`);
    A(faceRatio(p, 'top')[0] === 120 && faceRatio(p, 'top')[1] === 60, '顶面比例应为 120×60');
    A(faceRatio(p, 'nope')[0] === 3, '不存在的面回落 3:4，不崩');

    const d = dielineOf(p)!;
    A(d.sheets.length >= 1, '刀模至少一张展开图');
    A(d.bleed === STUDIO_BLEED && d.safe === STUDIO_SAFE, `出血 ${STUDIO_BLEED}mm / 安全边 ${STUDIO_SAFE}mm 应写进刀模`);
    const sum = dielineSummary(d)!;
    A(sum.cut > 0 && sum.crease > 0, '刀模必须同时有裁切线与压线');
    A(sum.width >= 120 && sum.height >= 180, `展开应不小于正面尺寸，实际 ${sum.width}×${sum.height}`);
    A(dimsOf(p)!.w === 60, '尺寸从项目里读，不是另存一份');
    return `五面 + ${sum.sheets} 张展开 · ${sum.cut} 裁切 / ${sum.crease} 压线`;
  });

  await t('Studio · 面的百分比元素换算成毫米图层（3D/刀板/导出共用）', () => {
    const face = { w: 100, h: 180 };
    const palette = { bg: '#fff', primary: '#000', accent: '#F47735', ink: '#191919', muted: '#888' };
    const text = elToLayer(
      { id: 'name', kind: 'text', text: '山隐', x: 10, y: 20, w: 80, size: 5, weight: 600, color: '#111' },
      face, palette, 'front',
    )!;
    A(text.type === 'text' && near(text.x, 10) && near(text.w, 80), `文字应落在 10mm 起、宽 80mm，实际 ${text.x}/${text.w}`);
    A(near(text.fontSize, 5 * PT_PER_MM, 0.2) || text.fontSize >= 3, `字号应折算成 pt，实际 ${text.fontSize}pt`);
    A(text.h! > 0, '文字必须有估算行高，否则图层没有高度');

    const rule = elToLayer({ id: 'rule', kind: 'rect', x: 10, y: 25, w: 13, h: 0.5 }, face, palette, 'front')!;
    A(rule.type === 'shape' && near(rule.h!, 0.9, 0.2), `色块高度跟着面高换算，实际 ${rule.h}mm`);

    const empty = elToLayer({ id: 'sticker', kind: 'sticker', x: 50, y: 50, w: 30 }, face, palette, 'front')!;
    A(empty.type === 'image' && empty.src === '', '没生成图的贴纸位要作为空图占位进入印前，才能报「图片缺失」');
    const stickerDoc = designDocFor(
      { ...createStudioProject('u1', 10), answers: { ...emptyAnswers(), form: ans('box', 'option'), size: { mode: 'custom', dims: { l: 100, w: 60, h: 180 }, src: 'user', confirmed: true } }, design: null } as StudioProject,
      { front: [{ id: 'sticker', kind: 'sticker', x: 50, y: 50, w: 30 }] },
    )!;
    A(!spreadSvg(stickerDoc, dieline, 0, false).includes('href=""'), '空图占位不得输出为空 <image>，否则 SVG/PDF 出现空框');
    const photo = elToLayer({ id: 'photo', kind: 'sticker', x: 50, y: 50, w: 30, src: 'data:image/png;base64,xx' }, face, palette, 'front')!;
    A(photo.type === 'image' && photo.src === 'data:image/png;base64,xx', '有图的贴纸要变成 image 图层');

    const d = designDocFor(
      { ...createStudioProject('u1', 10), answers: { ...emptyAnswers(), form: ans('box', 'option'), size: { mode: 'custom', dims: { l: 100, w: 60, h: 180 }, src: 'user', confirmed: true } }, design: null } as StudioProject,
      { front: [{ id: 'name', kind: 'text', text: '山隐', x: 10, y: 20, w: 80, size: 5 }], top: [] },
    )!;
    A(!!d.faces.front && d.faces.front.layers.length === 1, '正面图层要进来');
    A(!!d.faces.top && d.faces.top.layers.length === 0, '空面也要建出来，3D 与刀板才不会是空白');
    A(Object.keys(d.faces).length === 5, `五个面都要有，实际 ${Object.keys(d.faces).join(',')}`);
    return '文字 px→pt · 色块 mm · 占位贴纸剔除 · 空面保留';
  });

  await t('Studio · 九件事压成四页，旧 step 读进来不丢位置', () => {
    A(PAGE_TOTAL === 4 && PAGES.length === 4, `应该是 4 页，实际 ${PAGE_TOTAL}`);
    A(PAGES[0].steps.join(',') === '1,2' && PAGES[1].steps.join(',') === '3,4', '第 1 页含类别+产品信息，第 2 页含形式+尺寸');
    A(PAGES[2].steps.length === 4 && PAGES[3].steps.join(',') === '9', '第 3 页合并风格/颜色/图案/Logo，第 4 页补充');
    A(pageOfStep(2) === 1 && pageOfStep(4) === 2 && pageOfStep(8) === 3 && pageOfStep(9) === 4, '旧单步要能落到对应页');
    A(pageOfStep(10) === 5, '总结页仍是第 5 屏');
    A(stepOfPage(1) === 1 && stepOfPage(2) === 3 && stepOfPage(3) === 5 && stepOfPage(4) === 9 && stepOfPage(5) === 10,
      '每页存回第一项的单步编号，总结存 10');
    const p = createStudioProject('u1', 10);
    p.step = 8;
    A(pageOfStep(p.step) === 3, '老项目停在 Logo 那步，应打开「风格与外观」页而不是越界');
    return '4 页 · 页/步双向映射稳定';
  });

  await t('Studio · 多面数据：老稿只有 els 时自动迁到 faces.front', () => {
    const old = { ratio: [3, 4] as [number, number], bg: '#fff', ink: '#111', accent: '#f47735',
      els: [{ id: 'name', kind: 'text' as const, text: '旧稿', x: 10, y: 10, w: 80 }], updatedAt: 1 };
    const d = normalizeDesign(old)!;
    A(d.faces?.front?.length === 1, '老稿的 els 必须变成 faces.front');
    A(faceEls(d, 'front')[0].text === '旧稿', 'faceEls 读正面');
    A(faceEls(d, 'back').length === 0, '没有的背面是空的，不是复制正面');
    const d2 = withFaceEls(d, 'back', [{ id: 'b', kind: 'text', text: '背', x: 5, y: 5, w: 50 }]);
    A(faceEls(d2, 'back').length === 1 && faceEls(d2, 'front').length === 1, '改背面不该动正面');
    return 'els→faces.front 迁移 · 按面读写互不串';
  });



  /* ───────────── LunaSol 2.0 · 阶段一：设计数据层与坐标换算 ───────────── */

  const boxProject = (() => {
    const p = createStudioProject('u1', 10);
    p.answers.form = ans('box', 'option');
    p.answers.size = { mode: 'custom', dims: { l: 100, w: 60, h: 180 }, src: 'user', confirmed: true };
    return p;
  })();
  const palette = { bg: '#ffffff', primary: '#F47735', accent: '#F47735', ink: '#191919', muted: '#8a8a84' };

  await t('坐标 · 百分比只在面内：62×62 面板 50% 横向 = 31mm', () => {
    A(near(pctToMm(50, 62), 31, 0.01), `50% of 62 应为 31mm，实际 ${pctToMm(50, 62)}`);
    A(near(mmToPct(31, 62), 50, 0.01), '31mm 换回百分比应为 50%');
    const bottle = createStudioProject('u1', 10);
    bottle.answers.form = ans('bottle', 'option');
    bottle.answers.size = { mode: 'custom', dims: { l: 62, w: 62, h: 180 }, src: 'user', confirmed: true };
    const front = facesOf(bottle).find((f) => f.id === 'front')!;
    A(front.w === 62 && front.h === 62, `瓶标正面应为 62×62mm，实际 ${front.w}×${front.h}`);
    const r = elLocalRect({ id: 'a', kind: 'rect', x: 50, y: 50, w: 20, h: 20 }, front);
    A(near(r.x, 31, 0.01) && near(r.y, 31, 0.01), `居中元素应落在 31/31mm，实际 ${r.x}/${r.y}`);
    A(near(r.w, 12.4, 0.01), '宽度同样按面宽换算');
    return '62×62 · 50% → 31mm';
  });

  await t('坐标 · 同一百分比在不同宽高的面板得到不同的毫米位置', () => {
    const el: DesignEl = { id: 'a', kind: 'rect', x: 50, y: 25, w: 20, h: 10 };
    const square = elLocalRect(el, { w: 62, h: 62 });
    const wide = elLocalRect(el, { w: 120, h: 80 });
    A(near(square.x, 31, 0.01) && near(wide.x, 60, 0.01), `横向 50% 应分别为 31 / 60mm，实际 ${square.x} / ${wide.x}`);
    A(near(square.y, 15.5, 0.01) && near(wide.y, 20, 0.01), `纵向 25% 应随面高变化，实际 ${square.y} / ${wide.y}`);
    A(near(square.w, 12.4, 0.01) && near(wide.w, 24, 0.01), '同一宽度百分比在宽面上更大');
    return '62×62 / 120×80 · 百分比同、毫米不同';
  });

  await t('坐标 · 面局部 → 刀模全局必须带面板在展开图里的偏移', () => {
    const d = dielineOf(boxProject)!;
    const rects = d.sheets.flatMap((s) => s.rects);
    const front = rects.find((r) => r.face === 'front' && r.artwork)!;
    const back = rects.find((r) => r.face === 'back' && r.artwork)!;
    A(!!front && !!back, '折叠纸盒必须有正背两个可设计面');
    const origin = faceOrigins(d, 'front')[0];
    A(origin.x === front.x && origin.y === front.y, `正面原点应等于刀模面板偏移，实际 ${origin.x}/${origin.y} vs ${front.x}/${front.y}`);
    A(back.x !== front.x || back.y !== front.y, '正背面的局部 (0,0) 绝不能落到同一个全局点');
    const at0 = elSheetRect({ id: 'a', kind: 'rect', x: 0, y: 0, w: 10, h: 10 }, front, origin);
    A(near(at0.x, front.x, 0.01) && near(at0.y, front.y, 0.01), '局部 0,0 应正好落在面板偏移处');
    const at50 = elSheetRect({ id: 'a', kind: 'rect', x: 50, y: 50, w: 10, h: 10 }, front, origin);
    A(near(at50.x, front.x + front.w / 2, 0.05), `局部 50% 应加上面板偏移，实际 ${at50.x}`);
    const backOrigin = faceOrigins(d, 'back')[0];
    A(backOrigin.x !== origin.x || backOrigin.y !== origin.y, '背面有自己的原点');
    return `正面偏移 ${front.x},${front.y} · 背面偏移 ${back.x},${back.y}`;
  });

  await t('数据 · 旋转/透明度/隐藏/锁定/层级/来源 存得下、读得回', () => {
    const raw = {
      ratio: [3, 4], bg: '#fff', ink: '#111', accent: '#f47735', updatedAt: 1,
      els: [{
        id: 't1', kind: 'text', text: '山隐', x: 10, y: 10, w: 80,
        rotation: 15, opacity: 0.42, visible: false, locked: true, zIndex: 3,
        name: '主标题', fontFamily: 'serif', source: 'upload', assetId: 'as_1',
        createdAt: 5, updatedAt: 7, faceId: 'back',
      }],
    };
    const d = normalizeDesign(raw as never)!;
    const e = faceEls(d, 'front')[0];
    A(e.rotation === 15 && e.opacity === 0.42, `旋转/透明度应保留，实际 ${e.rotation}/${e.opacity}`);
    A(e.visible === false && e.locked === true && e.zIndex === 3, '隐藏/锁定/层级应保留');
    A(e.name === '主标题' && e.fontFamily === 'serif' && e.source === 'upload' && e.assetId === 'as_1', '名称/字体/来源/素材引用应保留');
    A(e.createdAt === 5 && e.updatedAt === 7, '时间戳应保留');
    A(e.faceId === 'front', '元素的 faceId 以所在容器为准，数据里写错要被纠正');
    A(elToLayer(e, { w: 100, h: 180 }, palette, 'front') === null, 'visible:false 的元素不能进入印刷输出');
    const shown = elToLayer({ ...e, visible: true }, { w: 100, h: 180 }, palette, 'front')!;
    A(shown.rotation === 15 && shown.opacity === 0.42 && shown.locked === true, '几何属性要带到图层上');
    const bad = normalizeDesign({ ...raw, els: [{ ...raw.els[0], rotation: NaN, opacity: Infinity }] } as never)!;
    const e2 = faceEls(bad, 'front')[0];
    A(e2.rotation === 0 && e2.opacity === 1, `垃圾数值要夹回默认，实际 ${e2.rotation}/${e2.opacity}`);
    return 'rotation 15° · opacity .42 · hidden · locked · zIndex 3';
  });

  await t('往返 · 新版元素 → 印刷图层 → 新版元素，关键属性不丢', () => {
    const panel = { w: 120, h: 60 };
    const el: DesignEl = {
      id: 't1', kind: 'text', text: '山隐茶集', x: 12, y: 30, w: 60, size: 6,
      weight: 600, color: '#191919', align: 'center', rotation: 12, opacity: 0.5,
      locked: true, name: '主标题', fontFamily: 'serif',
    };
    const layer = elToLayer(el, panel, palette, 'front')!;
    const back = layerToEl(layer, panel, 'front')!;
    A(back.id === 't1' && back.kind === 'text' && back.text === '山隐茶集', 'id/类型/文案必须原样回来');
    A(near(back.x, 12, 0.3) && near(back.y, 30, 0.3) && near(back.w, 60, 0.3), `坐标往返偏差过大：${back.x}/${back.y}/${back.w}`);
    A(near(back.size!, 6, 0.6), `字号往返偏差过大，实际 ${back.size}`);
    A(back.color === '#191919' && back.weight === 600 && back.align === 'center', '字色/字重/对齐不丢');
    A(back.rotation === 12 && back.opacity === 0.5 && back.locked === true && back.name === '主标题', '旋转/透明度/锁定/名称不丢');
    const rect = layerToEl(elToLayer({ id: 'r', kind: 'rect', x: 10, y: 20, w: 30, h: 10, color: '#F47735' }, panel, palette, 'front')!, panel, 'front')!;
    A(near(rect.h!, 10, 0.3) && rect.kind === 'rect', `色块高度往返偏差过大，实际 ${rect.h}`);
    const sticker = layerToEl(elToLayer({ id: 's', kind: 'sticker', src: 'data:image/png;base64,xx', x: 40, y: 40, w: 30, h: 20 }, panel, palette, 'front')!, panel, 'front')!;
    A(sticker.kind === 'sticker' && sticker.src === 'data:image/png;base64,xx' && near(sticker.h!, 20, 0.3), '贴纸的图与高度不丢');
    return '文字/色块/贴纸三类都往返';
  });

  await t('多面 · 正面元素不会出现在背面，空面也保留', () => {
    const doc = designDocFor(boxProject, {
      front: [{ id: 'f1', kind: 'text', text: '正面文案', x: 10, y: 10, w: 60, size: 5 }],
      back: [{ id: 'b1', kind: 'text', text: '背面文案', x: 10, y: 10, w: 60, size: 5 }],
      left: [],
    })!;
    A(doc.faces.front!.layers.length === 1 && doc.faces.back!.layers.length === 1, '每面只应拿到自己的元素');
    A(doc.faces.back!.layers[0].id === 'back_b1', `背面图层的 id 应带面前缀，实际 ${doc.faces.back!.layers[0].id}`);
    A(doc.faces.back!.layers.every((l) => (l as { text?: string }).text !== '正面文案'), '正面文案绝不能画到背面');
    A(doc.faces.left!.layers.length === 0 && !!doc.faces.left, '空面仍要建出来，3D 才不会缺面');
    const d = withFaceEls(normalizeDesign({ ratio: [3, 4], bg: '#fff', ink: '#111', accent: '#f47735', els: [{ id: 'x', kind: 'text', text: '正', x: 5, y: 5, w: 50 }], updatedAt: 1 })!, 'back', [{ id: 'y', kind: 'text', text: '背', x: 5, y: 5, w: 50 }]);
    A(faceEls(d, 'front')[0].faceId === 'front' && faceEls(d, 'back')[0].faceId === 'back', '写面时要把 faceId 校正成所在面');
    return '正/背/侧面互不串 · faceId 跟随容器';
  });

  await t('层级 · 有 zIndex 才重排，没写 zIndex 的老稿渲染不变', () => {
    const a: DesignEl = { id: 'a', kind: 'rect', x: 10, y: 10, w: 20, h: 20, zIndex: 2 };
    const b: DesignEl = { id: 'b', kind: 'rect', x: 20, y: 20, w: 20, h: 20, zIndex: 1 };
    const hidden: DesignEl = { id: 'c', kind: 'rect', x: 30, y: 30, w: 20, h: 20, visible: false };
    const doc = faceDoc('front', { w: 100, h: 100 }, [a, b, hidden], palette);
    A(doc.layers.map((l) => l.id).join(',') === 'front_b,front_a', `zIndex 小的先画，实际 ${doc.layers.map((l) => l.id).join(',')}`);
    const legacy = [{ id: 'a', kind: 'rect' as const, x: 1, y: 1, w: 5, h: 5 }, { id: 'b', kind: 'rect' as const, x: 2, y: 2, w: 5, h: 5 }];
    A(drawOrder(legacy) === legacy, '没有 zIndex 时必须原样返回同一个数组，旧稿零变化');
    A(faceDoc('front', { w: 100, h: 100 }, legacy, palette).layers.map((l) => l.id).join(',') === 'front_a,front_b', '旧稿按数组顺序绘制');
    return 'zIndex 升序 · 隐藏跳过 · 旧稿原序';
  });

  await t('脏输入 · NaN / Infinity / 零尺寸 / 缺面板都安全处理', () => {
    A(pctToMm(NaN, 62) === 0 && pctToMm(50, NaN) === 0 && pctToMm(50, 0) === 0 && pctToMm(50, -3) === 0, '非法百分比或尺寸要回落到 0，不能产出 NaN');
    A(mmToPct(Infinity, 62) === 0 && mmToPct(31, 0) === 0, '毫米侧同样兜底');
    A(validBox({ w: 0, h: 10 }) === null && validBox({ w: NaN, h: 10 }) === null && validBox(null) === null, '空/非正/缺失尺寸的面板必须判为无效');
    const bad = elLocalRect({ id: 'a', kind: 'rect', x: NaN, y: Infinity, w: 0, h: 0 }, { w: 0, h: 0 });
    A([bad.x, bad.y, bad.w, bad.h].every(Number.isFinite), '面尺寸为 0 时也不能算出 NaN');
    const layer = elToLayer({ id: 'a', kind: 'text', text: 'A', x: NaN, y: Infinity, w: 0, size: Infinity }, { w: 62, h: 62 }, palette, 'front')!;
    A([layer.x, layer.y, layer.w, layer.h!, layer.opacity].every(Number.isFinite), '图层字段必须全是有限数值');
    A(layer.x === 0 && layer.y === 0, `非法坐标要落回 0，实际 ${layer.x}/${layer.y}`);
    const blank = createStudioProject('u1', 10);
    A(facesOf(blank).length === 0, '没填形式时没有面');
    A(dielineOf(blank) === null && designDocFor(blank, {}) === null, '没有刀模时不硬造设计稿');
    A(faceRatio(blank, 'front')[0] === 3, '没有刀模时比例给 3:4 兜底，空态不崩');
    return 'NaN/Infinity/0/缺面板 全部兜底';
  });

  await t('兼容 · 旧 Studio 项目与旧 DesignDoc 都能继续读进来', () => {
    const legacy = {
      schema: 'lunasol.studio.v1', id: 'st_legacy1', ownerId: 'u1', name: '旧稿', status: 'confirmed',
      createdAt: 1, updatedAt: 2, step: 9,
      answers: {}, chat: [], design: {
        ratio: [3, 4], bg: '#ffffff', ink: '#191919', accent: '#F47735', updatedAt: 1,
        els: [{ id: 'name', kind: 'text', text: '旧文字', x: 10, y: 10, w: 80, size: 4 }],
      },
    };
    const p = normalizeStudioProject(legacy as never)!;
    A(!!p && p.id === 'st_legacy1' && p.step === 9, `旧项目应能恢复，实际 ${p && p.id}/${p && p.step}`);
    const d = p.design!;
    A(d.faces!.front!.length === 1 && faceEls(d, 'front')[0].text === '旧文字', '旧稿的 els 应迁到 faces.front');
    A(faceEls(d, 'front')[0].rotation === undefined, '旧元素没写过旋转，读进来就是 undefined，不能凭空补值');
    const oldDoc = designDocFor(boxProject, { front: [{ id: 'f1', kind: 'text', text: '旧引擎稿', x: 10, y: 10, w: 60, size: 5 }] })!;
    const imported = layerToEl(oldDoc.faces.front!.layers[0], { w: 100, h: 180 }, 'front')!;
    A(imported.id === 'f1' && imported.text === '旧引擎稿', '旧 DesignDoc 可反向导入 Studio 元素');
    A(imported.source === 'system' && imported.visible === true, '导入的元素要标注来源与可见状态');
    return '旧 Studio 稿 + 旧 DesignDoc 双向可读';
  });

  await t('一致性 · 画布毫米 / 刀板全局 / 导出图层用同一份换算', () => {
    const el: DesignEl = { id: 'hero', kind: 'rect', x: 50, y: 25, w: 40, h: 20, color: '#F47735' };
    const front = facesOf(boxProject).find((f) => f.id === 'front')!;
    const d = dielineOf(boxProject)!;
    const origin = faceOrigins(d, 'front')[0];
    const local = elLocalRect(el, front);
    const global = elSheetRect(el, front, origin);
    const doc = designDocFor(boxProject, { front: [el] })!;
    const layer = doc.faces.front!.layers[0];
    A(near(local.x, layer.x, 0.2) && near(local.y, layer.y, 0.2) && near(local.w, layer.w, 0.2),
      `画布与导出几何必须同源：${local.x}/${layer.x} · ${local.y}/${layer.y} · ${local.w}/${layer.w}`);
    A(near(global.x, layer.x + origin.x, 0.2) && near(global.y, layer.y + origin.y, 0.2),
      '刀板全局坐标 = 面局部毫米 + 面板偏移');
    const rect = d.sheets.flatMap((s) => s.rects).find((r) => r.face === 'front' && r.artwork)!;
    A(origin.x === rect.x && origin.y === rect.y, '3D / SVG / PDF 用的是同一个面板偏移，不允许各算一套');
    return '面局部 → 图层 → 刀板全局 三段对齐';
  });

  await t('矢量 · 屏幕坐标 → 设计毫米：缩放/平移/滚动/DPR 都被 rect 吸收', () => {
    const face = { w: 100, h: 150 };
    const base = { left: 100, top: 50, width: 200, height: 300 };
    const p1 = clientToMm(200, 200, base, face);
    A(near(p1.x, 50) && near(p1.y, 75), `200/300px 应落在 50/75mm，实际 ${p1.x}/${p1.y}`);
    // 画布被平移到 (40,20)：同一个鼠标点在设计里要往右下走
    const p2 = clientToMm(200, 200, { ...base, left: 40, top: 20 }, face);
    A(near(p2.x, 80) && near(p2.y, 90), `平移后同一屏幕点应落 80/90mm，实际 ${p2.x}/${p2.y}`);
    // 放大一倍：同样的像素位移 → 毫米位移减半
    const p3 = clientToMm(200, 200, { left: 0, top: 0, width: 400, height: 600 }, face);
    A(near(p3.x, 50) && near(p3.y, 50), `2× 画布应落 50/50mm，实际 ${p3.x}/${p3.y}`);
    return '同一换算函数吃掉缩放、平移与页面滚动';
  });

  await t('矢量 · 毫米 ↔ 百分比 往返不漂移', () => {
    const face = { w: 120, h: 180 };
    const mm = { x: 10, y: 20, w: 30, h: 40 };
    const pct = mmRectToPct(mm, face);
    A(near(pct.x, 8.333, 0.01) && near(pct.y, 11.111, 0.01), `x/y 应换算成百分比，实际 ${pct.x}/${pct.y}`);
    A(near(pct.w, 25, 0.01) && near(pct.h, 22.222, 0.01), `w/h 应换算成百分比，实际 ${pct.w}/${pct.h}`);
    const back = { x: (pct.x / 100) * face.w, y: (pct.y / 100) * face.h, w: (pct.w / 100) * face.w, h: (pct.h / 100) * face.h };
    A(near(back.x, mm.x, 0.01) && near(back.y, mm.y, 0.01) && near(back.w, mm.w, 0.01) && near(back.h, mm.h, 0.01),
      '往返回来必须还是同一块毫米框');
    return '10/20/30/40mm → 8.33%/11.11%/25%/22.22% → 原值';
  });

  await t('矢量 · 八向缩放：东把手只改宽，Shift 锁比例', () => {
    const start = { x: 10, y: 20, w: 30, h: 40 };
    const east = resizeBox(start, 'e', 15, 0, 0);
    A(near(east.w, 45) && near(east.x, 10) && near(east.y, 20) && near(east.h, 40), `e 把手应只加宽，实际 ${east.w}/${east.h}`);
    const west = resizeBox(start, 'w', 10, 0, 0);
    A(near(west.x, 20) && near(west.w, 20), `w 把手应从左边收，实际 x=${west.x} w=${west.w}`);
    const locked = resizeBox(start, 'se', 10, 0, 0, { keepRatio: true });
    A(locked.w > 30 && Math.abs((locked.w / locked.h) - (30 / 40)) < 0.05,
      `Shift 角把手应保持 3:4，实际 ${locked.w}×${locked.h}`);
    const north = resizeBox(start, 'n', 0, -8, 0);
    A(near(north.y, 12) && near(north.h, 48), `n 把手向下长高，实际 y=${north.y} h=${north.h}`);
    return 'e/w/n 三个方向 + 锁定比例都正确';
  });

  await t('矢量 · 旋转框四角与选择外框是多选的真实并集', () => {
    const els: DesignEl[] = [
      { id: 'a', kind: 'rect', x: 10, y: 20, w: 20, h: 20, color: '#000' },
      { id: 'b', kind: 'rect', x: 50, y: 30, w: 20, h: 30, color: '#000' },
    ];
    const f = selectionFrame(els, { w: 100, h: 100 })!;
    A(near(f.box.x, 10) && near(f.box.y, 20) && near(f.box.w, 60) && near(f.box.h, 40),
      `并集框应是 10/20/60/40，实际 ${f.box.x}/${f.box.y}/${f.box.w}/${f.box.h}`);
    A(f.rotation === 0, '多选框不带单元素旋转，否则把手会跟着斜');
    const one = selectionFrame([els[0]], { w: 100, h: 100 })!;
    A(one.box.w === 20 && one.rotation === 0, '单选框就是元素自己的框');
    const rot = corners({ x: 0, y: 0, w: 10, h: 10 }, 45);
    const dist = Math.hypot(rot[0].x - 5, rot[0].y - 5);
    A(rot.length === 4 && near(rot[0].x, 5, 0.2) && near(dist, 7.07, 0.1),
      `45° 角点应绕中心保持半径 7.07mm，实际 (${rot[0].x},${rot[0].y}) r=${dist}`);
    return '并集框 + 旋转角点 + 单选框';
  });

  await t('矢量 · 组合选中：点一个就带上同组全部', () => {
    const els: DesignEl[] = [
      { id: 'a', kind: 'text', x: 0, y: 0, w: 20, text: 'A', groupId: 'g1' },
      { id: 'b', kind: 'rect', x: 0, y: 20, w: 20, h: 5, groupId: 'g1' },
      { id: 'c', kind: 'rect', x: 0, y: 40, w: 20, h: 5 },
    ];
    const hit = expandSelection(els, ['a']);
    A(hit.length === 2 && hit.includes('a') && hit.includes('b'), `应选中同组两个，实际 ${hit.join(',')}`);
    A(expandSelection(els, ['c']).length === 1, '没有组合的元素只选自己');
    return 'groupId 扁平标签，不嵌套坐标';
  });

  await t('矢量 · 文字溢出只在写了固定高度时判定', () => {
    const face = { w: 100, h: 50 };
    const auto: DesignEl = { id: 't1', kind: 'text', x: 0, y: 0, w: 40, size: 6, text: '很长的一行文字'.repeat(3) };
    A(elOverflows(auto, face) === false, '没写高度的文字会自己撑开，不应误报溢出');
    const fixed: DesignEl = { ...auto, id: 't2', h: 6 };
    A(elOverflows(fixed, face) === true, '固定高度装不下时必须报溢出');
    const fits: DesignEl = { ...auto, id: 't3', h: 98 };
    A(elOverflows(fits, face) === false, '装得下就不报');
    return '自动高度不误报 · 固定高度能报';
  });

  await t('设计操作 · 图形与图片按真实比例落位', () => {
    const d = normalizeDesign({
      ratio: [3, 4], bg: '#FFFFFF', ink: '#191919', accent: '#F47735',
      els: [{ id: 't', kind: 'text', text: '起点', x: 10, y: 10, w: 40, size: 4 }],
    })!;
    const ell = addShape(d, 'ellipse', 'front', { x: 12, y: 20 });
    A(ell.kind === 'rect' && ell.shape === 'ellipse' && ell.w === 30 && ell.h === 40, `圆形默认 30×40，实际 ${ell.w}×${ell.h}`);
    const line = addShape(d, 'line', 'front');
    A(line.shape === 'line' && line.h === 0.5, '直线用 0.5% 高度，导出才有线宽');
    const img = addImage(d, 'data:image/png;base64,aa', 200, 100, 'front');
    A(img.kind === 'sticker' && img.w === 40 && near(img.h, 20), `200×100 的图按 40% 宽应得 20% 高，实际 ${img.h}`);
    A(img.naturalW === 200 && img.naturalH === 100 && img.fit === 'contain', '原图尺寸与适配方式要写进设计数据');
    return 'ellipse / line / image 尺寸正确且字段持久化';
  });

  await t('设计操作 · 批量改属性、写回框、层级归一', () => {
    const d = normalizeDesign({
      ratio: [3, 4], bg: '#FFFFFF', ink: '#191919', accent: '#F47735',
      els: [
        { id: 'a', kind: 'rect', x: 10, y: 10, w: 20, h: 10, color: '#000', zIndex: 5 },
        { id: 'b', kind: 'rect', x: 30, y: 30, w: 20, h: 10, color: '#000', zIndex: 9 },
        { id: 'c', kind: 'text', text: 'C', x: 50, y: 50, w: 20, size: 4, zIndex: 2 },
      ],
    })!;
    const patched = patchEls(d, ['a', 'b'], { opacity: 0.4, locked: true }, 'front');
    const list = faceEls(patched, 'front');
    A(list[0].opacity === 0.4 && list[1].locked === true && list[0].id === 'a' && list[0].kind === 'rect',
      '批量改属性不能动 id/kind');
    const boxed = setElsBox(d, { a: { x: 25, y: 5, w: 30, rotation: 15 } }, 'front');
    const a = faceEls(boxed, 'front')[0];
    A(near(a.x, 25) && near(a.y, 5) && near(a.w, 30) && a.rotation === 15, `写回框应生效，实际 ${a.x}/${a.y}/${a.w}/${a.rotation}`);
    const top = orderEls(d, ['a'], 'front', 'front');
    const topList = faceEls(top, 'front');
    const z = topList.map((e) => e.zIndex);
    A(topList[2].id === 'a' && z.join(',') === '0,1,2', `置顶后 a 应在末尾且 z=0..2，实际 ${topList.map((e) => e.id).join(',')} / ${z.join(',')}`);
    const back = orderEls(d, ['a'], 'back', 'front');
    A(faceEls(back, 'front')[0].id === 'a', '置底后排最前');
    return '批量属性 / 框写回 / 置顶置底与 zIndex 同步';
  });

  await t('设计操作 · 复制、组合、取消组合都不破坏原对象', () => {
    const d = normalizeDesign({
      ratio: [3, 4], bg: '#FFFFFF', ink: '#191919', accent: '#F47735',
      els: [
        { id: 'a', kind: 'rect', x: 10, y: 10, w: 20, h: 10, groupId: 'g0' },
        { id: 'b', kind: 'rect', x: 30, y: 30, w: 20, h: 10, groupId: 'g0' },
      ],
    })!;
    const dup = duplicateEls(d, ['a', 'b'], 'front');
    A(dup.ids.length === 2 && !dup.ids.includes('a') && faceEls(dup.design, 'front').length === 4,
      '复制应新增两条且保留原件');
    const g = groupEls(d, ['a', 'b'], 'front');
    const gid = faceEls(g.design, 'front').map((e) => e.groupId);
    A(gid[0] === gid[1] && gid[0] !== 'g0', '重新组合应给新组号');
    const u = ungroupEls(g.design, ['a', 'b'], 'front');
    A(faceEls(u, 'front').every((e) => !e.groupId), '取消组合后不留组号');
    return 'duplicate / group / ungroup 三件套';
  });

  await t('历史 · 合并连续输入、撤销重做、40 条上限', () => {
    const base = normalizeDesign({
      ratio: [3, 4], bg: '#FFFFFF', ink: '#191919', accent: '#F47735',
      els: [{ id: 'a', kind: 'rect', x: 10, y: 10, w: 20, h: 10, color: '#000' }],
    })!;
    let h = createHistory(base);
    A(!canUndo(h) && !canRedo(h), '刚建栈不能撤也不能重做');
    const s1 = patchEls(base, ['a'], { x: 12 }, 'front');
    h = pushHistory(h, s1, 'move:a', 1000);
    A(canUndo(h) && !canRedo(h), '一次操作后应可撤销');
    const s2 = patchEls(s1, ['a'], { x: 14 }, 'front');
    h = pushHistory(h, s2, 'move:a', 1500);
    A(h.past.length === 1, `900ms 内同一 mergeKey 应合并成一条，实际 ${h.past.length}`);
    const s3 = patchEls(s2, ['a'], { x: 30 }, 'front');
    h = pushHistory(h, s3, 'move:a', 3000);
    A(h.past.length === 2, '超过 900ms 应另起一条');
    h = undoHistory(h);
    A(faceEls(h.present, 'front')[0].x === 14,
      `超过合并窗口后另起一条，撤销应回到上一段结束时的 14（而不是 12），实际 ${faceEls(h.present, 'front')[0].x}`);
    h = redoHistory(h);
    A(faceEls(h.present, 'front')[0].x === 30, `重做应回到 30，实际 ${faceEls(h.present, 'front')[0].x}`);
    let bottom = h;
    while (canUndo(bottom)) bottom = undoHistory(bottom);
    A(!canUndo(bottom) && faceEls(bottom.present, 'front')[0].x === 10, '一直撤应回到最初的 10，且不能再撤');
    let many = createHistory(base);
    for (let i = 0; i < 60; i += 1) {
      many = pushHistory(many, patchEls(base, ['a'], { x: 5 + i }, 'front'), '', 10000 + i);
    }
    A(many.past.length === HISTORY_LIMIT, `历史上限 ${HISTORY_LIMIT}，实际 ${many.past.length}`);
    return `合并 / 撤销 / 重做 / 上限 ${HISTORY_LIMIT} 条`;
  });

  await t('历史 · 换面不丢栈，撤销恢复所有面的改动', () => {
    const base = normalizeDesign({
      ratio: [3, 4], bg: '#FFFFFF', ink: '#191919', accent: '#F47735',
      faces: {
        front: [{ id: 'f', kind: 'text', text: '正面', x: 10, y: 10, w: 40, size: 4 }],
        back: [{ id: 'b', kind: 'text', text: '背面', x: 10, y: 10, w: 40, size: 4 }],
      },
    })!;
    let h = createHistory(base);
    const next = patchEls(patchEls(base, ['f'], { text: '正面改' }, 'front'), ['b'], { text: '背面改' }, 'back');
    h = pushHistory(h, next, '', 1);
    // 模拟切到背面再撤：历史快照是整份设计，两个面都要回去
    h = undoHistory(h);
    A(faceEls(h.present, 'front')[0].text === '正面' && faceEls(h.present, 'back')[0].text === '背面',
      '撤销必须同时恢复所有面，不能只恢复当前面');
    A(faceEls(h.present, 'back').length === 1, '另一面不能被清空');
    return '整份快照跨面保留';
  });

  await t('渲染顺序 · 图层数组 = SVG / 刀板 / 3D / 导出同一顺序', () => {
    const d = normalizeDesign({
      ratio: [3, 4], bg: '#FFFFFF', ink: '#191919', accent: '#F47735',
      els: [
        { id: 'a', kind: 'rect', x: 10, y: 10, w: 20, h: 10, zIndex: 3 },
        { id: 'b', kind: 'text', text: 'B', x: 10, y: 20, w: 20, size: 4, zIndex: 1 },
      ],
    })!;
    const order = drawOrder(faceEls(d, 'front')).map((e) => e.id);
    A(order[0] === 'b' && order[1] === 'a', `zIndex 小的先画，实际 ${order.join('→')}`);
    const front = designDocFor(
      { ...createStudioProject('u1', 10), answers: { ...emptyAnswers(), form: ans('box', 'option'), size: { mode: 'custom', dims: { l: 100, w: 60, h: 180 }, src: 'user', confirmed: true } }, design: null } as StudioProject,
      { front: drawOrder(faceEls(d, 'front')) },
    )!;
    A(front.faces.front!.layers[0].id === 'front_b' && front.faces.front!.layers[1].id === 'front_a',
      `导出图层顺序必须和画布数组一致，实际 ${front.faces.front!.layers.map((l) => l.id).join('→')}`);
    return '底 → 顶 与图层列表倒序一致';
  });

  await t('几何 · 角度归一化后旋转按钮不积累 360°', () => {
    A(normalizeAngle(370) === 10 && normalizeAngle(-90) === -90, `370→10 / -90 保持 -90，实际 ${normalizeAngle(370)}/${normalizeAngle(-90)}`);
    A(normalizeAngle(190) === -170, '190 应折到 -170，画布与滑块同一区间');
    A(normalizeAngle(0) === 0, '0 还是 0');
    return '旋转值始终 -180..180，不积累整圈';
  });


  await t('阶段三 · 官方坐标还原：1000px → 200mm 验收用例', () => {
    const r = placementSelfCheck();
    A(r.ok, `官方公式不符：${r.detail}`);
    const mm = mapBoxToCanvas({ left: 200, top: 100, right: 600, bottom: 500 }, 1000, 1000, 200, 200, 'stretch');
    A(near(mm.x, 40, 1e-9) && near(mm.y, 20, 1e-9) && near(mm.w, 80, 1e-9) && near(mm.h, 80, 1e-9),
      `应为 x40 y20 w80 h80，实际 ${mm.x}/${mm.y}/${mm.w}/${mm.h}`);
    const pct = mmBoxToPct(mm, 200, 200);
    A(near(pct.x, 20) && near(pct.y, 10) && near(pct.w, 40) && near(pct.h, 40),
      `200mm 面板的百分比应为 20/10/40/40，实际 ${pct.x}/${pct.y}/${pct.w}/${pct.h}`);
    return `${r.detail} → 40×20mm 起点，宽高 80mm；百分比 20/10/40/40`;
  });

  await t('阶段三 · 比例不一致时 contain 不拉伸，图层相对位置保持', () => {
    // 正方形底图装进 300×200mm：等比缩放 0.2，左右各留 50mm
    const a = mapBoxToCanvas({ left: 200, top: 100, right: 600, bottom: 500 }, 1000, 1000, 300, 200, 'contain');
    A(near(a.scale, 0.2, 1e-9), `contain 比例应为 0.2，实际 ${a.scale}`);
    A(near(a.x, 50 + 40, 1e-9) && near(a.y, 20, 1e-9) && near(a.w, 80, 1e-9) && near(a.h, 80, 1e-9),
      `contain 应居中留白，实际 x=${a.x} y=${a.y} w=${a.w} h=${a.h}`);
    const b = mapBoxToCanvas({ left: 200, top: 100, right: 600, bottom: 500 }, 1000, 1000, 300, 200, 'cover');
    A(near(b.scale, 0.3, 1e-9), `cover 比例应为 0.3，实际 ${b.scale}`);
    A(b.y < 0 && near(b.h, 120, 1e-9), `cover 应裁切并保持 4:4 比例，实际 y=${b.y} h=${b.h}`);
    return 'contain 居中留白 / cover 等比裁切，均不改变图层宽高比';
  });

  await t('阶段三 · 解析器：底图/图层、z 顺序、bbox、OCR 与未知字段', () => {
    const raw = {
      model: 'doubao-seedream-5-5-261028',
      data: [
        { z_index: 2, name: '标题文字', size: '1024x1024', url: 'https://x/2.png', bounding_box: { absolute: [100, 100, 800, 220], normalized: [97, 97, 781, 214] }, text_recognition: { text: '山野\n好茶', lines: [{ text: '山野', bounding_box: { absolute: [100, 100, 400, 160] }, runs: [{ text: '山野', style: { similar_font_family: 'unknown', foreground_color: '#112233', bold: true } }] }, { text: '好茶', bounding_box: { absolute: [100, 170, 300, 220] }, runs: [{ text: '好茶', style: { similar_font_family: 'unknown' } }] }] }, unknown_field: 1 },
        { z_index: 0, name: '底图', size: '2048x2048', url: 'https://x/base.png', background: '#ffffff' },
        { z_index: 1, name: '插画', size: '1024x1024', url: 'https://x/1.png', bounding_box: { absolute: [40, 40, 900, 900] } },
      ],
    };
    const p = parseSplitResponse(raw);
    A(!!p.base && p.base.name === '底图', '应识别 z_index=0 且无 bbox 的底图');
    A(p.layers.length === 2 && p.layers[0].zIndex === 1 && p.layers[1].zIndex === 2, `图层应按 z 升序，实际 ${p.layers.map((x) => x.zIndex).join(',')}`);
    A(p.layers[1].kind === 'text' && p.layers[1].ocr?.text === '山野\n好茶', 'OCR 文本应保留并分类为 text');
    A(p.layers[1].ocr?.uncertain === true, 'unknown 字体必须标记为不确定，不能当真实字体');
    A(p.layers[1].kindConfidence < 1, '分类置信度不能是 100%');
    return `${p.layers.length} 图层 + 底图；z 升序；OCR 保留但标记字体不确定`;
  });

  await t('阶段三 · 解析器容错：缺 bbox / 空响应 / 越界框', () => {
    const p = parseSplitResponse({ data: [
      { z_index: 0, size: '1000x1000', url: 'u0' },
      { z_index: 1, name: '无框', size: '1000x1000', url: 'u1' },
      { z_index: 2, name: '越界', size: '1000x1000', url: 'u2', bounding_box: { absolute: [-10, 20, 1100, 900] } },
    ] });
    A(p.issues.some((s) => s.includes('缺少 bounding_box')), '缺 bbox 应进 issues，而不是静默随机摆放');
    const n = normalizeBox({ left: -10, top: 20, right: 1100, bottom: 900 }, 1000, 1000);
    A(n.clipped && n.box.left === 0 && n.box.right === 1000, '越界 bbox 应夹回底图范围并标记 clipped');
    const empty = parseSplitResponse({});
    A(!empty.base && empty.layers.length === 0 && empty.issues.length > 0, '空响应必须明确报错，不能返回空成功');
    return '缺 bbox 报错、越界夹回、空响应失败';
  });

  await t('阶段三 · 导入：底图只一次、按 bbox 落位、OCR 原图保留', () => {
    const base = normalizeDesign({
      ratio: [1, 1], bg: '#FFFFFF', ink: '#191919', accent: '#F47735',
      els: [{ id: 'old', kind: 'text', text: '旧', x: 5, y: 5, w: 20, size: 3 }],
    })!;
    const split = parseSplitResponse({
      jobId: 'job_test_1',
      data: [
        { z_index: 0, name: '底图', size: '1000x1000', assetId: 'a0', assetUrl: 'https://cdn.example/a0.png' },
        { z_index: 1, name: '主插画', size: '1000x1000', assetId: 'a1', assetUrl: 'https://cdn.example/a1.png', bounding_box: { absolute: [200, 100, 600, 500] } },
        { z_index: 2, name: '标题', size: '1000x1000', assetId: 'a2', assetUrl: 'https://cdn.example/a2.png', bounding_box: { absolute: [100, 600, 500, 700] }, text_recognition: { text: '好茶', lines: [{ text: '好茶', bounding_box: { absolute: [100, 600, 500, 700] }, runs: [{ text: '好茶', style: { similar_font_family: 'Source Han Sans', foreground_color: '#222222', bold: true } }] }] } },
      ],
    });
    const r = importSplitLayers(base, split, { panel: { id: 'front', w: 200, h: 200 }, face: 'front', now: 99 });
    const els = faceEls(r.design, 'front');
    A(r.imported === 4, `底图 1 + 图层 2 + 文字替换 1 = 4，实际 ${r.imported}`);
    const baseEls = els.filter((e) => e.layerType === 'background');
    A(baseEls.length === 1, `底图对象只能有 1 个，实际 ${baseEls.length}`);
    const ill = els.find((e) => e.id.includes('a1'))!;
    A(near(ill.x, 20) && near(ill.y, 10) && near(ill.w, 40) && near(ill.h, 40),
      `200mm 面板上 bbox [200,100,600,500] 应为 20/10/40/40%，实际 ${ill.x}/${ill.y}/${ill.w}/${ill.h}`);
    const text = els.find((e) => e.kind === 'text' && e.ocrText === '好茶')!;
    const orig = els.find((e) => e.kind === 'sticker' && e.ocrText === '好茶')!;
    A(!!text && !!orig && orig.visible === false, 'OCR 文字对象应生成，原 PNG 保留且默认隐藏，不能删除');
    A(!text.fontFamily, '不能把 similar_font_family 当真实字体写进 fontFamily');
    A(els.some((e) => e.id === 'old'), '旧图层必须保留');
    A(baseEls[0].zIndex === 0 && ill.zIndex > 0, `旧图与导入图层应按数组顺序归一化 z，实际 base=${baseEls[0].zIndex} ill=${ill.zIndex}`);
    const again = importSplitLayers(r.design, split, { panel: { id: 'front', w: 200, h: 200 }, face: 'front', now: 100 });
    A(again.duplicates >= 3 && again.imported === 0, `重复导入应跳过同一批图层，实际 dup=${again.duplicates} add=${again.imported}`);
    return `4 个对象；底图不重复；bbox 精确落位；OCR 原图隐藏保留；重复导入 0 新增`;
  });

  await t('阶段三 · 解析器：云函数持久化后只回 assetUrl 仍可用', () => {
    const p = parseSplitResponse({
      jobId: 'job_asset_only',
      data: [
        { z_index: 0, name: '底图', size: '1024x1024', assetId: 'base1', assetUrl: 'https://cdn.example/assets/base1' },
        { z_index: 1, name: '插画', size: '2048x2048', assetId: 'ill1', assetUrl: 'https://cdn.example/assets/ill1', bounding_box: { absolute: [100, 100, 500, 500] } },
      ],
    });
    A(!!p.base && p.base.assetUrl === 'https://cdn.example/assets/base1', '底图应读取 assetUrl 作为可用资源');
    A(p.layers.length === 1 && !p.layers[0].url && p.layers[0].assetUrl === 'https://cdn.example/assets/ill1', '图层只有 assetUrl 时不能被当成缺失资源丢弃');
    A(p.layers[0].width === 2048 && p.layers[0].height === 2048, 'size 应解析为图层自身画布像素尺寸');
    return '只返回 assetUrl 的持久化响应仍可解析，不误判为缺失图层';
  });

  await t('阶段三 · 分类低置信度归 unknown，不把模型猜测当事实', () => {
    const c = classifyLayer({ zIndex: 3, name: '未命名元素 07', description: '', ocr: null, prompt: '包装视觉' });
    A(c.kind === 'unknown' && c.confidence < 0.5, `无法判断必须归 unknown，实际 ${c.kind}/${c.confidence}`);
    A(classifyLayer({ zIndex: 0, name: '任意', description: '', ocr: null }).kind === 'background', 'z=0 是底图');
    A(classifyLayer({ zIndex: 1, name: '品牌 Logo', description: '', ocr: null }).kind === 'logo', 'Logo 名称应识别');
    return 'unknown 兜底 + background/logo 明确规则';
  });


  /* ================= 阶段四 · DeepSeek 画布操作智能体 ================= */

  const stage4Project = (): StudioProject => {
    const p = createStudioProject('tester', 1000);
    p.name = '阶段四测试';
    p.step = 10;
    p.answers.category = ans('tea', 'user');
    p.answers.productName = ans('桂花茶', 'user');
    p.answers.form = ans('box', 'user');
    p.answers.size = { mode: 'custom', dims: { l: 120, w: 60, h: 180 }, src: 'user', confirmed: true };
    const design = normalizeDesign({
      ratio: [1, 1], bg: '#FFFFFF', ink: '#191919', accent: '#F47735',
      faces: {
        front: [
          { id: 'title_01', kind: 'text', name: '正面标题', text: '桂花', x: 10, y: 10, w: 50, size: 6, color: '#111111', zIndex: 2 },
          { id: 'illustration_01', kind: 'sticker', name: '插画', src: 'data:image/png;base64,AAAA', x: 20, y: 30, w: 40, h: 40, zIndex: 3 },
          { id: 'locked_01', kind: 'text', name: '锁定字', text: '锁', x: 10, y: 80, w: 20, size: 3, color: '#222222', locked: true, zIndex: 4 },
        ],
        back: [
          { id: 'back_01', kind: 'text', name: '背面字', text: '背面', x: 5, y: 5, w: 30, size: 3, color: '#333333', zIndex: 1 },
        ],
      },
      els: [],
    })!;
    p.design = design;
    return p;
  };

  const snapshotOf = (p: StudioProject, selectedIds = ['title_01']): StudioAISnapshot => {
    const panel = facesOf(p).find((f) => f.id === 'front')!;
    return { project: p, design: p.design!, face: 'front', panel, selectedIds };
  };

  await t('阶段四 · 工具清单：19 个 Studio 工具全部复用旧校验器', () => {
    A(STUDIO_TOOL_DEFS.length === 19, `工具数应为 19，实际 ${STUDIO_TOOL_DEFS.length}`);
    const names = new Set(STUDIO_TOOL_DEFS.map((x) => x.name));
    for (const n of ['inspect_design', 'update_text_layer', 'update_layer_position', 'resize_design_object',
      'change_object_color', 'replace_image_layer', 'delete_layer', 'change_background',
      'run_prepress_check', 'update_dimensions', 'update_structure']) {
      A(names.has(n as never), `缺少工具 ${n}`);
    }
    A(new Set(names).size === names.size, '工具名不能重复');
    return '19 个工具；覆盖文字 / 移动 / 缩放 / 颜色 / 图片 / 删除 / 背景 / 印前 / 尺寸';
  });

  await t('阶段四 · 上下文：真实面板尺寸、元素 ID、选中对象，不猜 ID', () => {
    const p = stage4Project();
    const front = facesOf(p).find((f) => f.id === 'front')!;
    const ctx = buildStudioAIContext(p, p.design!, 'front', ['title_01']);
    const all = JSON.stringify(ctx);
    A(ctx.projectId === p.id, '上下文必须带项目 ID');
    A(ctx.currentFace === 'front' && !!ctx.currentPanelMm && ctx.currentPanelMm.w === front.w, '上下文必须带当前面板与真实毫米尺寸');
    A(all.includes('title_01') && all.includes('illustration_01') && all.includes('locked_01'), '上下文必须列出当前面元素 ID');
    A(ctx.selected && ctx.selected.length === 1 && ctx.selected[0].id === 'title_01', '上下文必须带当前选中对象');
    A(all.includes(String(front.w)) && all.includes(String(front.h)), '上下文必须带真实毫米宽高');
    A(!all.includes('data:image'), '大 Base64 不得进入上下文');
    return `front ${front.w}×${front.h}mm；3 个元素；选中 title_01`;
  });

  await t('阶段四 · 修改文字颜色：预览 after 正确，原设计不变，确认后才落盘', () => {
    const p = stage4Project();
    const before = designDigest(p.design!);
    const plan: StudioAIPlan = {
      mode: 'edit', summary: '标题改深绿',
      actions: [{ name: 'change_object_color', params: { layerId: 'title_01', color: '#234B38' } }],
    };
    const r = previewPlan(plan, snapshotOf(p));
    A(r.ok && !!r.preview, `预览应成功：${r.error}`);
    A(r.preview!.items.length === 1 && r.preview!.items[0].targetId === 'title_01', '预览必须指向 title_01');
    A(r.preview!.items[0].change.some((c) => c.after === '#234B38'), '预览必须给出目标颜色');
    A(faceEls(p.design!, 'front').find((e) => e.id === 'title_01')!.color === '#111111', '预览阶段不得改原设计');
    A(designDigest(r.design!) !== before, '候选设计指纹必须变化');
    A(faceEls(r.design!, 'front').find((e) => e.id === 'title_01')!.color === '#234B38', '候选设计必须是新颜色');
    const again = executePlan(plan, snapshotOf(p));
    A(again.ok && faceEls(again.design!, 'front').find((e) => e.id === 'title_01')!.color === '#234B38', '执行器与预览必须一致');
    return '预览 before #111111 → after #234B38；原对象未提前改变';
  });

  await t('阶段四 · 移动图片对象：毫米位移按当前面板换算，其他对象不动', () => {
    const p = stage4Project();
    const panel = facesOf(p).find((f) => f.id === 'front')!;
    const before = faceEls(p.design!, 'front').find((e) => e.id === 'illustration_01')!;
    const r = previewPlan({
      mode: 'edit', summary: '插画上移 5mm',
      actions: [{ name: 'update_layer_position', params: { layerId: 'illustration_01', dy_mm: -5 } }],
    }, snapshotOf(p));
    A(r.ok, r.error);
    const after = faceEls(r.design!, 'front').find((e) => e.id === 'illustration_01')!;
    A(near(after.y, before.y - 5 / panel.h * 100), `应上移 ${5 / panel.h * 100}%，实际 ${before.y}→${after.y}`);
    A(after.x === before.x && after.w === before.w && after.h === before.h, '移动不能改 X / 尺寸');
    const title = faceEls(r.design!, 'front').find((e) => e.id === 'title_01')!;
    A(JSON.stringify(title) === JSON.stringify(faceEls(p.design!, 'front').find((e) => e.id === 'title_01')), '未指定对象不得被改');
    return `y ${before.y}% → ${after.y}%；标题不变`;
  });

  await t('阶段四 · 缩小插画 15%：中心锚点、可保持比例', () => {
    const p = stage4Project();
    const before = faceEls(p.design!, 'front').find((e) => e.id === 'illustration_01')!;
    const r = previewPlan({
      mode: 'edit', summary: '插画缩小 15%',
      actions: [{ name: 'resize_design_object', params: { layerId: 'illustration_01', scale: 0.85, keepAspectRatio: true } }],
    }, snapshotOf(p));
    A(r.ok, r.error);
    const after = faceEls(r.design!, 'front').find((e) => e.id === 'illustration_01')!;
    A(near(after.w, before.w * 0.85, 0.2) && near(after.h, before.h * 0.85, 0.2), `宽高应缩到 85%，实际 ${after.w}×${after.h}`);
    A(near(after.x + after.w / 2, before.x + before.w / 2, 0.2) && near(after.y + after.h / 2, before.y + before.h / 2, 0.2), '必须以中心为锚点');
    return `${before.w}×${before.h}% → ${after.w}×${after.h}%`;
  });

  await t('阶段四 · 批量调整两个对象：一次确认，两处同时生效', () => {
    const p = stage4Project();
    const r = previewPlan({
      mode: 'edit', summary: '标题改色 + 插画缩放',
      actions: [
        { name: 'change_object_color', params: { layerId: 'title_01', color: '#234B38' } },
        { name: 'resize_design_object', params: { layerId: 'illustration_01', scale: 0.85 } },
      ],
    }, snapshotOf(p));
    A(r.ok, r.error);
    A(r.preview!.items.length === 2, `应预览 2 个对象，实际 ${r.preview!.items.length}`);
    const title = faceEls(r.design!, 'front').find((e) => e.id === 'title_01')!;
    const ill = faceEls(r.design!, 'front').find((e) => e.id === 'illustration_01')!;
    A(title.color === '#234B38' && near(ill.w, 34, 0.2), `两处修改必须都生效：${title.color}/${ill.w}`);
    return '2 个对象；标题 #234B38；插画宽 34%';
  });

  await t('阶段四 · 目标对象不存在 / 在其它面板：明确拒绝，不猜 ID', () => {
    const p = stage4Project();
    const miss = previewPlan({
      mode: 'edit', summary: '改不存在对象',
      actions: [{ name: 'change_object_color', params: { layerId: 'no_such_layer', color: '#234B38' } }],
    }, snapshotOf(p));
    A(!miss.ok && /不存在|找不到|没有/.test(miss.error), `不存在对象必须明确拒绝，实际：${miss.error}`);
    const back = previewPlan({
      mode: 'edit', summary: '改背面对象',
      actions: [{ name: 'change_object_color', params: { layerId: 'back_01', color: '#234B38' } }],
    }, snapshotOf(p));
    A(!back.ok && /背面|back/.test(back.error), `必须说明对象在其它面，实际：${back.error}`);
    A(back.design === null, '拒绝时不得返回可提交设计');
    return `不存在 → ${miss.error.slice(0, 24)}…；跨面 → ${back.error.slice(0, 24)}…`;
  });

  await t('阶段四 · 锁定对象：所有改属性动作拒绝', () => {
    const p = stage4Project();
    for (const act of [
      { name: 'change_object_color' as const, params: { layerId: 'locked_01', color: '#234B38' } },
      { name: 'update_layer_position' as const, params: { layerId: 'locked_01', dy_mm: -5 } },
      { name: 'delete_layer' as const, params: { layerId: 'locked_01' } },
    ]) {
      const r = previewPlan({ mode: 'edit', summary: '改锁定对象', actions: [act] }, snapshotOf(p, ['locked_01']));
      A(!r.ok && /锁定/.test(r.error), `${act.name} 必须拒绝锁定对象，实际：${r.error}`);
    }
    return '改色 / 移动 / 删除均拒绝 locked_01';
  });

  await t('阶段四 · 原子事务：第二动作失败时第一动作也不落盘', () => {
    const p = stage4Project();
    const before = JSON.stringify(p.design);
    const r = previewPlan({
      mode: 'edit', summary: '一半会失败的计划',
      actions: [
        { name: 'change_object_color', params: { layerId: 'title_01', color: '#234B38' } },
        { name: 'resize_design_object', params: { layerId: 'no_such_layer', scale: 0.85 } },
      ],
    }, snapshotOf(p));
    A(!r.ok, '任一动作失败必须整体失败');
    A(r.design === null && r.project === null, '失败时不得返回候选设计');
    A(r.results.length === 2 && r.results[0].ok && !r.results[1].ok, `结果应记录成功与失败，实际 ${JSON.stringify(r.results)}`);
    A(JSON.stringify(p.design) === before, '原设计必须保持原样');
    return '动作 1 成功、动作 2 失败 → 整体回滚，原设计未变';
  });

  await t('阶段四 · 删除多个对象 / 改尺寸：danger 二次确认，不自动执行', () => {
    const p = stage4Project();
    const del = previewPlan({
      mode: 'edit', summary: '删两个装饰对象',
      actions: [
        { name: 'delete_layer', params: { layerId: 'title_01' } },
        { name: 'delete_layer', params: { layerId: 'illustration_01' } },
      ],
    }, snapshotOf(p));
    A(del.ok && del.preview!.permission === 'danger', `批量删除必须 danger，实际 ${del.preview?.permission}`);
    A(del.preview!.dangerReasons.some((x) => /删除/.test(x)), '必须说明批量删除风险');
    const dim = previewPlan({
      mode: 'edit', summary: '改成品尺寸',
      actions: [{ name: 'update_dimensions', params: { l: 100, w: 50, h: 150 } }],
    }, snapshotOf(p));
    A(dim.ok && dim.preview!.structural && dim.preview!.permission === 'danger', '改尺寸必须标记结构影响 + danger');
    A(dim.project!.answers.size!.dims.l === 100, '候选项目必须写入新尺寸');
    return '批量删除 danger；改尺寸 structural + danger';
  });

  await t('阶段四 · 结构变更：AI 不得直接改刀模/结构', () => {
    const p = stage4Project();
    const r = previewPlan({
      mode: 'edit', summary: '换结构',
      actions: [{ name: 'update_structure', params: { structure: 'pouch' } }],
    }, snapshotOf(p));
    A(!r.ok && /结构变更/.test(r.error), `必须拒绝直接改结构，实际：${r.error}`);
    return r.error;
  });

  await t('阶段四 · 指代：唯一选中可解析「它」，多选/无选中必须拒绝', () => {
    const p = stage4Project();
    const ok = previewPlan({
      mode: 'edit', summary: '把它放大',
      actions: [{ name: 'resize_design_object', params: { layerId: '它', scale: 1.1 } }],
    }, snapshotOf(p, ['title_01']));
    A(ok.ok, `唯一选中应解析「它」：${ok.error}`);
    A(ok.preview!.items[0].targetId === 'title_01', '「它」必须落到当前唯一选中对象');
    const many = previewPlan({
      mode: 'edit', summary: '把它放大',
      actions: [{ name: 'resize_design_object', params: { layerId: '它', scale: 1.1 } }],
    }, snapshotOf(p, ['title_01', 'illustration_01']));
    A(!many.ok && /不明确|选中/.test(many.error), `多选必须要求澄清，实际：${many.error}`);
    const none = previewPlan({
      mode: 'edit', summary: '把它放大',
      actions: [{ name: 'resize_design_object', params: { layerId: '它', scale: 1.1 } }],
    }, snapshotOf(p, []));
    A(!none.ok && /选中|不明确/.test(none.error), `无选中必须要求澄清，实际：${none.error}`);
    return '唯一选中 → title_01；多选 / 无选中均拒绝';
  });

  await t('阶段四 · 面板背景：只改指定面，不波及其它面', () => {
    const p = stage4Project();
    const r = previewPlan({
      mode: 'edit', summary: '背面改米色',
      actions: [{ name: 'change_background', params: { face: 'back', color: '#F5EFE4' } }],
    }, snapshotOf(p));
    A(r.ok, r.error);
    A(r.preview!.crossPanel && r.preview!.permission === 'danger', '跨面修改必须提示并升级确认');
    A(r.design!.faceBg!.back === '#F5EFE4', '目标面必须改成米色');
    A((r.design!.faceBg!.front || r.design!.bg) === '#FFFFFF', '正面背景不得被改');
    const frontOnly = previewPlan({
      mode: 'edit', summary: '正面改暖白',
      actions: [{ name: 'change_background', params: { face: 'front', color: '#FBF7F0' } }],
    }, snapshotOf(p));
    A(frontOnly.ok && frontOnly.design!.faceBg!.front === '#FBF7F0' && !frontOnly.design!.faceBg!.back, '当前面改色不得影响背面');
    return 'back #F5EFE4 / front 保持 #FFFFFF；跨面 danger';
  });

  await t('阶段四 · 预览过期：画布指纹变化后计划作废', () => {
    const p = stage4Project();
    const r = previewPlan({
      mode: 'edit', summary: '标题改色',
      actions: [{ name: 'change_object_color', params: { layerId: 'title_01', color: '#234B38' } }],
    }, snapshotOf(p));
    A(r.ok, r.error);
    A(!planIsStale(r.preview!, p.design!), '刚生成时不得判定过期');
    const changed = normalizeDesign({ ...p.design!, bg: '#FAFAFA' })!;
    A(planIsStale(r.preview!, changed), '画布指纹变化后必须判定过期');
    return `${r.preview!.baseDigest} → 变化后 stale`;
  });

  await t('阶段四 · 纯咨询：不产生动作，不调用执行器', () => {
    const p = stage4Project();
    const r = previewPlan({ mode: 'advice', summary: '正面留白偏少', actions: [] }, snapshotOf(p));
    A(!r.ok && /不是修改计划/.test(r.error), 'advice 不应进入执行器');
    return 'advice 被执行器拒绝，咨询不落盘';
  });

  await t('阶段四 · 撤销事务：历史一次 push，撤销回到 AI 前状态', () => {
    const p = stage4Project();
    const h = createHistory(p.design!);
    const r = previewPlan({
      mode: 'edit', summary: '标题改色 + 插画缩放',
      actions: [
        { name: 'change_object_color', params: { layerId: 'title_01', color: '#234B38' } },
        { name: 'resize_design_object', params: { layerId: 'illustration_01', scale: 0.85 } },
      ],
    }, snapshotOf(p));
    A(r.ok, r.error);
    const pushed = pushHistory(h, r.design!, 'ai:plan_test', 10_000);
    A(pushed.past.length === 1, `一次 AI 事务只能产生一条历史，实际 ${pushed.past.length}`);
    const undone = undoHistory(pushed);
    A(undone.present && faceEls(undone.present, 'front').find((e) => e.id === 'title_01')!.color === '#111111', '撤销必须恢复标题颜色');
    A(faceEls(undone.present!, 'front').find((e) => e.id === 'illustration_01')!.w === 40, '撤销必须恢复插画尺寸');
    return '1 条历史；撤销后颜色与尺寸都回到 AI 前';
  });

  return R;
}
