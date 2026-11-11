/* 印前检查 Agent：把专业检查项翻译成普通人能看懂的话。
 * 结构校验全部来自 buildDieline 的几何计算，不由模型"判断"是否可生产。 */
import type { CheckItem, DesignBrief, DesignDoc, Dieline, Face, PrepressReport, TextLayer } from '../types';
import { rgbToCmyk, round } from './utils';
import { fitText, textOverflow } from './design';
import { dielineStats } from './structure';
import { tl } from '../langStore';

export interface PrepressInput {
  design: DesignDoc;
  brief: DesignBrief;
  dieline: Dieline;
  dpi: number;
}

export function runPrepress({ design, brief, dieline, dpi }: PrepressInput): PrepressReport {
  const items: CheckItem[] = [];
  const add = (id: string, group: string, level: CheckItem['level'], title: string, detail: string, fix?: string) =>
    items.push({ id, group, level, title, detail, fix });
  const faces = Object.values(design.faces).filter(Boolean) as Face[];
  const allLayers = faces.flatMap((f) => f.layers);
  const stats = dielineStats(dieline);

  // 1. 尺寸
  const fin = dieline.finished;
  const okSize = Math.abs(fin.l - brief.size.l) < 0.6 && Math.abs(fin.w - brief.size.w) < 0.6 && (!brief.size.h || Math.abs(fin.h - brief.size.h) < 0.6);
  add('size', tl('尺寸', 'Size'), okSize ? 'pass' : 'error', okSize ? tl('包装尺寸正常', 'Packaging size is correct') : tl('成品尺寸与需求不一致', 'Finished size does not match the brief'),
    tl(
      `成品 ${fin.l} × ${fin.w}${fin.h ? ` × ${fin.h}` : ''} mm；需求 ${brief.size.l} × ${brief.size.w}${brief.size.h ? ` × ${brief.size.h}` : ''} mm。刀模按前者计算。`,
      `Finished ${fin.l} × ${fin.w}${fin.h ? ` × ${fin.h}` : ''} mm; the brief asks for ${brief.size.l} × ${brief.size.w}${brief.size.h ? ` × ${brief.size.h}` : ''} mm. The dieline follows the former.`,
    ),
    okSize ? undefined : tl('返回创作中心重新输入尺寸', 'Go back to the studio and re-enter the size'));
  add('spread', tl('尺寸', 'Size'), dieline.sheets.every((s) => s.width > fin.l && s.height > 10) ? 'pass' : 'error',
    tl('展开尺寸已按结构计算', 'Flat size computed from the structure'),
    tl(`共 ${stats.sheets} 张展开图，最大展开面积 ${round(stats.area / 10000, 2)} dm²，裁切线 ${stats.cut} 段、压痕线 ${stats.crease} 段。`,
      `${stats.sheets} flat sheet(s), largest flat area ${round(stats.area / 10000, 2)} dm², ${stats.cut} cut segments and ${stats.crease} crease segments.`));

  // 2. 出血
  const bleedOk = dieline.bleed >= 2 && dieline.bleed <= 5;
  add('bleed', tl('出血', 'Bleed'), bleedOk ? 'pass' : 'warning', bleedOk ? tl('出血区域已自动加好', 'Bleed has been added automatically') : tl('出血值需要确认', 'Bleed value needs confirming'),
    tl(`默认按 ${dieline.bleed}mm 计算，成品区 / 出血区 / 安全区 / 裁切线 / 压痕线已分层。每个面的底色会自动延伸到出血边。`,
      `Calculated at ${dieline.bleed}mm by default; trim, bleed, safe area, cut lines and crease lines are separate layers. Each face background extends to the bleed edge automatically.`),
    bleedOk ? undefined : tl('在个人设置中按印厂要求调整出血值', 'Adjust the bleed in Settings to match your printer'));
  add('artwork', tl('出血', 'Bleed'), faces.every((f) => !!f.bg) ? 'pass' : 'error', tl('底色覆盖完整', 'Background coverage complete'),
    faces.every((f) => !!f.bg) ? tl('所有印刷面都有底色，裁切后不会露白边。', 'Every printed face has a background, so no white edges appear after trimming.') : tl('有印刷面缺少底色，裁切后可能出现白边。', 'A printed face has no background, so white edges may appear after trimming.'));

  // 3. 安全区与文字
  let tooClose = 0, overflow = 0, placeholders = 0;
  let safetyDetail = '';
  for (const sheet of dieline.sheets) {
    for (const panel of sheet.rects) {
      if (!panel.face || !panel.artwork) continue;
      const face = design.faces[panel.face];
      if (!face) continue;
      for (const l of face.layers) {
        if (l.type !== 'text' || l.hidden) continue;
        const t = l as TextLayer;
        if (t.x < dieline.safe - 0.5 || t.y < dieline.safe - 0.5 || t.x + t.w > face.w - dieline.safe + 0.5 || t.y + t.h > face.h - dieline.safe + 0.5) tooClose++;
        if (textOverflow(t)) overflow++;
        if (t.placeholder) placeholders++;
      }
    }
  }
  add('safe', tl('文字', 'Text'), tooClose === 0 ? 'pass' : 'warning', tooClose === 0 ? tl('文字都离裁切边足够远', 'All text is far enough from the trim edge') : tl('有一处文字距离裁切边缘较近，建议调整', 'Some text sits close to the trim edge — worth adjusting'),
    tooClose === 0 ? tl(`安全边距 ${dieline.safe}mm，所有文字均在安全区内。`, `Safe margin is ${dieline.safe}mm and all text sits inside it.`) : tl(`${tooClose} 处文字进入 ${dieline.safe}mm 安全区，印刷裁切时可能被切到。`, `${tooClose} text block(s) enter the ${dieline.safe}mm safe area and may be trimmed.`),
    tooClose ? tl('使用「自动修复」把文字移回安全区', 'Use “Auto-fix” to move the text back into the safe area') : undefined);
  add('overflow', tl('文字', 'Text'), overflow === 0 ? 'pass' : 'error', overflow === 0 ? tl('文字没有被裁切', 'No text is clipped') : tl('有文字超出文本框', 'Some text overflows its box'),
    overflow === 0 ? tl('所有文字都在自己的文本框内，且保持独立可编辑图层。', 'All text fits its own box and stays as an editable layer.') : tl(`${overflow} 处文字可能显示不全，系统不会擅自删减你提供的内容。`, `${overflow} text block(s) may be cut off; the system will never silently delete what you wrote.`),
    overflow ? tl('使用「自动修复」缩小字号，或手动调整文本框', 'Use “Auto-fix” to reduce the font size, or resize the box manually') : undefined);
  add('placeholder', tl('文字', 'Text'), placeholders === 0 ? 'pass' : 'warning',
    placeholders === 0 ? tl('包装文字已完整', 'Packaging copy is complete') : tl(`${placeholders} 处仍是占位文字，需要你补充真实信息`, `${placeholders} placeholder block(s) still need real information`),
    placeholders === 0 ? tl('所有文案已由你确认。', 'You have confirmed all copy.') : tl('例如净含量、产品说明、配料与生产信息。食品 / 化妆品等标签内容请自行按适用法规核实，LunaSol 不代替合规审查。', 'For example net weight, product description, ingredients and production details. Label content for food or cosmetics must be checked against the applicable regulations yourself — LunaSol does not replace a compliance review.'),
    placeholders ? tl('在编辑器中逐条替换占位文字', 'Replace each placeholder in the editor') : undefined);
  safetyDetail = tl(`共 ${allLayers.filter((l) => l.type === 'text').length} 个可编辑文字图层。`, `${allLayers.filter((l) => l.type === 'text').length} editable text layers.`);

  // 4. 图片分辨率
  const imgs = allLayers.filter((l) => l.type === 'image') as Extract<typeof allLayers[number], { type: 'image' }>[];
  const dpiList = imgs.map((l) => Math.min(l.naturalW / (l.w / 25.4), l.naturalH / (l.h / 25.4)));
  const low = dpiList.filter((d) => d < dpi);
  add('dpi', tl('图片', 'Images'), low.length === 0 ? 'pass' : low.includes(0) || low.some((d) => d < 150) ? 'error' : 'warning',
    low.length === 0 ? (imgs.length ? tl(`图片清晰度足够（≥${dpi} DPI）`, `Image resolution is sufficient (≥${dpi} DPI)`) : tl('没有位图，全部为矢量图形', 'No bitmaps — everything is vector')) : tl('部分图片清晰度不足，可能影响印刷效果', 'Some images are low resolution and may print poorly'),
    imgs.length ? tl(`共 ${imgs.length} 张位图，有效分辨率 ${dpiList.map((d) => Math.round(d)).join(' / ')} DPI，目标 ${dpi} DPI。矢量插画不受此限制。`, `${imgs.length} bitmap(s), effective resolution ${dpiList.map((d) => Math.round(d)).join(' / ')} DPI against a ${dpi} DPI target. Vector artwork is unaffected.`) : tl(`当前设计全部由矢量图形与文字组成，输出分辨率按 ${dpi} DPI 渲染。`, `This design is all vector shapes and text, rendered at ${dpi} DPI.`),
    low.length ? tl('替换图片，或在 AI 创作中心重新生成素材', 'Replace the images or regenerate assets in the AI studio') : undefined);

  // 5. 颜色
  const colors = new Set<string>();
  for (const f of faces) { colors.add(f.bg); for (const l of f.layers) { if (l.type === 'text') colors.add(l.color); else if (l.type === 'shape') colors.add(l.fill); } }
  const cmyk = [...colors].filter((c) => /^#[0-9a-f]{6}$/i.test(c)).map(rgbToCmyk);
  const extreme = [...colors].filter((c) => /^#[0-9a-f]{6}$/i.test(c)).filter((c) => { const v = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); return Math.max(...v) > 245 && Math.min(...v) < 20; });
  add('color', tl('颜色', 'Colour'), 'pass', tl('颜色已转换并标注印刷色值', 'Colours converted and print values noted'),
    tl(`检测到 ${colors.size} 种颜色，已给出近似 CMYK 值（如 C${cmyk[0]?.c ?? 0} M${cmyk[0]?.m ?? 0} Y${cmyk[0]?.y ?? 0} K${cmyk[0]?.k ?? 0}）。屏幕 RGB 与实际印刷色可能存在差异，建议打样确认。`,
      `${colors.size} colour(s) found, with approximate CMYK values (e.g. C${cmyk[0]?.c ?? 0} M${cmyk[0]?.m ?? 0} Y${cmyk[0]?.y ?? 0} K${cmyk[0]?.k ?? 0}). Screen RGB can differ from the printed result — a proof is recommended.`));
  if (extreme.length) add('gamut', tl('颜色', 'Colour'), 'warning', tl('有高饱和颜色，印刷可能偏色', 'Highly saturated colours may shift in print'), tl(`${extreme.length} 种荧光级颜色超出常见 CMYK 色域，导出时按近似值转换。`, `${extreme.length} neon-level colour(s) fall outside the usual CMYK gamut and will be converted to the nearest value on export.`), tl('改用低饱和配色', 'Use less saturated colours'));
  add('icc', tl('颜色', 'Colour'), 'warning', tl('色彩配置文件需与印厂确认', 'Confirm the colour profile with your printer'), tl('当前导出使用设备无关的近似 CMYK 换算，未内嵌特定 ICC 配置文件。若印厂指定 ICC，请在印前环节按其要求输出并打样。', 'Export currently uses a device-independent approximate CMYK conversion without embedding a specific ICC profile. If your printer specifies one, output to their requirements and proof it.'));

  // 6. 字体
  const fonts = new Set(allLayers.filter((l) => l.type === 'text').map((l) => (l as TextLayer).fontFamily));
  const missing = [...fonts].filter((f) => { try { return !document.fonts.check(`12px ${f}`); } catch { return false; } });
  add('font', tl('字体', 'Fonts'), missing.length ? 'warning' : 'pass', missing.length ? tl('有字体在本机可能缺失', 'Some fonts may be missing on this machine') : tl('字体检查通过', 'Font check passed'),
    missing.length ? tl(`系统字体回退可能影响排版：${missing.slice(0, 2).join(' / ')}。导出 PDF 时文字会以 ${dpi} DPI 转曲/栅格化嵌入，避免印厂缺字。`, `System font fallback may affect the layout: ${missing.slice(0, 2).join(' / ')}. Text is outlined/rasterised at ${dpi} DPI when exporting PDF, so the printer never sees missing fonts.`) : tl(`共 ${fonts.size} 种字体；导出 PDF 时文字按 ${dpi} DPI 嵌入（等效转曲），SVG 保留可编辑文字。${safetyDetail}`, `${fonts.size} font(s); PDF export embeds text at ${dpi} DPI (effectively outlined) while SVG keeps it editable. ${safetyDetail}`),
    missing.length ? tl('改用系统自带字体', 'Switch to a system font') : undefined);

  // 7. 刀模
  const cutOk = stats.cut > 0;
  const creaseOk = stats.crease > 0 || dieline.structure === 'labelRound' || dieline.structure === 'labelRect';
  const hasGlue = dieline.sheets.some((s) => s.rects.some((r) => /粘合/.test(r.label)));
  add('dieline', tl('刀模', 'Dieline'), cutOk && creaseOk ? 'pass' : 'error', cutOk && creaseOk ? tl('刀模结构完整', 'Dieline structure is complete') : tl('刀模存在关键错误，不允许标记为印刷合格', 'The dieline has critical errors and cannot be marked print-ready'),
    tl(`裁切线 ${stats.cut} 段、压痕线 ${stats.crease} 段、出血线 ${stats.bleedLines} 段；${hasGlue ? '粘合位已保留' : '该结构无需独立粘合位'}。结构由几何规则计算，不由 AI 判断可生产性。`,
      `${stats.cut} cut segments, ${stats.crease} crease segments, ${stats.bleedLines} bleed lines; ${hasGlue ? 'a glue flap is included' : 'this structure needs no separate glue flap'}. The structure is computed geometrically — AI never judges manufacturability.`));
  add('geometry', tl('刀模', 'Dieline'), dieline.warnings.length ? 'warning' : 'pass', dieline.warnings.length ? tl('结构参数需要留意', 'Some structure parameters need attention') : tl('结构参数在常规范围内', 'Structure parameters are within the usual range'),
    dieline.warnings.length ? dieline.warnings.join(' ') : tl(`成品 ${fin.l} × ${fin.w} × ${fin.h} mm，折叠关系与展开尺寸匹配。`, `Finished ${fin.l} × ${fin.w} × ${fin.h} mm; the folding matches the flat size.`),
    dieline.warnings.length ? tl('调整尺寸或咨询印厂', 'Adjust the size or ask your printer') : undefined);

  const errors = items.filter((i) => i.level === 'error');
  const warnings = items.filter((i) => i.level === 'warning');
  const status = errors.length ? 'error' : warnings.length ? 'warning' : 'pass';
  const summary = errors.length
    ? tl(`发现 ${errors.length} 个必须处理的问题，暂不建议印刷。`, `${errors.length} problem(s) must be fixed before printing.`)
    : warnings.length ? tl(`检查基本通过，有 ${warnings.length} 条建议需要你确认。`, `Checks broadly passed, with ${warnings.length} suggestion(s) to confirm.`)
      : tl('全部检查通过，可以生成印刷文件。', 'All checks passed — you can generate print files.');
  return { at: Date.now(), items, status, summary, cmyk };
}

/** 自动修复：只处理可确定修复的问题（安全区、字号溢出、文字越界），不改动内容 */
export function autoFix(design: DesignDoc, dieline: Dieline): { design: DesignDoc; changes: string[] } {
  const d: DesignDoc = JSON.parse(JSON.stringify(design));
  const changes: string[] = [];
  for (const sheet of dieline.sheets) for (const panel of sheet.rects) {
    if (!panel.face || !panel.artwork) continue;
    const f = d.faces[panel.face];
    if (!f) continue;
    for (const l of f.layers) {
      if (l.type !== 'text' || l.hidden) continue;
      const t = l as TextLayer;
      const s = dieline.safe;
      const nx = Math.max(s, Math.min(t.x, f.w - s - t.w));
      const ny = Math.max(s, Math.min(t.y, f.h - s - t.h));
      const nw = Math.min(t.w, f.w - s * 2 - Math.max(0, nx - s));
      if (nx !== t.x || ny !== t.y || nw !== t.w) { t.x = nx; t.y = ny; t.w = Math.max(4, nw); changes.push(tl(`「${l.name}」已移回安全区`, `“${l.name}” moved back into the safe area`)); }
      if (textOverflow(t)) { fitText(t); changes.push(tl(`「${l.name}」已缩小字号以完整显示`, `“${l.name}” font size reduced so it fits`)); }
    }
  }
  return { design: d, changes };
}
