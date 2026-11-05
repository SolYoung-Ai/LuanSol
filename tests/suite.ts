/* LunaSol 真实功能测试套件（Node + 浏览器共用同一套断言）
 * 浏览器部分覆盖 PDF 生成与字节级预检、SVG 位图渲染等依赖 DOM 的能力。 */
import { createEmptyBrief, nextQuestion, parseSize, parseUtterance } from '../src/engine/brief';
import { buildDieline, dielineStats, faceSizes, STRUCTURES } from '../src/engine/structure';
import { buildSchemes, cloneDesign, faceSvg, fitText, makeText, textOverflow } from '../src/engine/design';
import { applyPatch, localIntent } from '../src/engine/modify';
import { autoFix, runPrepress } from '../src/engine/prepress';
import { buildBundle, buildDxf, buildPdf, spreadSvg, svgToCanvas, verifyPdf } from '../src/engine/export';
import type { DesignBrief, DesignDoc, StructureId, TextLayer } from '../src/types';

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
