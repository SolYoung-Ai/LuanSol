/* LunaSol 真实功能测试套件（Node + 浏览器共用同一套断言）
 * 浏览器部分覆盖 PDF 生成与字节级预检、SVG 位图渲染等依赖 DOM 的能力。 */
import { createEmptyBrief, nextQuestion, parseSize, parseUtterance } from '../src/engine/brief';
import { buildDieline, dielineStats, faceSizes, STRUCTURES } from '../src/engine/structure';
import { buildSchemes, cloneDesign, faceSvg, fitText, makeText, textOverflow } from '../src/engine/design';
import { applyPatch, localIntent } from '../src/engine/modify';
import { autoFix, runPrepress } from '../src/engine/prepress';
import { buildBundle, buildDxf, buildPdf, spreadSvg, svgToCanvas, verifyPdf } from '../src/engine/export';
import type { DesignBrief, DesignDoc, StructureId, TextLayer } from '../src/types';
import { STYLES, TRADITION_COUNT, styleById, buildStylePrompt } from '../src/v3/styles';
import { createEmptyDraft, draftToBrief } from '../src/v3/draft';
import { generatePalettes } from '../src/v3/colors';
import { validateBarcode, encodeBarcode, decodeEan, verifyBarcode } from '../src/v3/barcode';
import { DEFAULT_AI, aiEnabled, aiMode, aiStatusLabel } from '../src/engine/llm';
import { AI_TASKS, TASK_FOR_STEP } from '../src/ai/tasks';
import { buildAIContext, contextText } from '../src/ai/context';
import { runAITask, registerAITransport, resetAITransport, aiCapabilitySummary } from '../src/ai/provider';

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
    A(aiMode(proxyAI) === 'proxy' && aiStatusLabel(proxyAI).includes('后台代理'), '代理状态标注不正确');
    A(aiCapabilitySummary().total === 12 && aiCapabilitySummary().steps === 10, '能力点数量异常');
    return `total=${aiCapabilitySummary().total} / steps=${aiCapabilitySummary().steps}`;
  });

  await t('AI 上下文 · 十步数据与完整风格配置统一传入', () => {
    const text = contextText(aiCtx);
    A(text.includes('高山乌龙茶') && text.includes('茶叶') && text.includes('#2b4c7e'), '十步数据未进入统一上下文');
    A(text.includes('高端消费群体') && text.includes('包装盒'), '人群 / 形态缺失');
    A(aiCtx.styleName.length > 0 && aiCtx.stylePrompt.length > 400, '完整风格配置未展开为提示词');
    A(aiCtx.userNote === '想做得更清淡', '用户补充想法丢失');
    return `context=${text.split('\n').length} 行 / stylePrompt=${aiCtx.stylePrompt.length} 字`;
  });

  await t('AI 任务层 · 十步每步都有可用本地建议与合规约束', () => {
    for (let i = 0; i < 10; i++) {
      const def = AI_TASKS[TASK_FOR_STEP(i)];
      A(def && def.local(aiCtx).length >= 1, `STEP ${i + 1} 没有本地建议`);
      A(def.system.includes('禁止') && def.constraints.length > 0, `STEP ${i + 1} 缺少合规约束`);
      A(typeof def.adopt === 'function' && typeof def.validate === 'function', `STEP ${i + 1} 缺少采纳或校验`);
    }
    const styles = AI_TASKS['style.recommend'].local(aiCtx);
    A(styles.every((s) => STYLES.some((x) => x.style_id === (s.value as { style_id: string }).style_id)), '本地风格推荐编造了不存在的风格');
    return `10/10 步有建议 · 风格推荐 ${styles.length} 条均来自真实风格库`;
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
  return R;
}
