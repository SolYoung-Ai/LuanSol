/* 印前检查 Agent：把专业检查项翻译成普通人能看懂的话。
 * 结构校验全部来自 buildDieline 的几何计算，不由模型"判断"是否可生产。 */
import type { CheckItem, DesignBrief, DesignDoc, Dieline, Face, Layer, PrepressReport, TextLayer } from '../types';
import { ptToMm, rgbToCmyk, round } from './utils';
import { fitText, textOverflow } from './design';
import { dielineStats } from './structure';
import { auditDieline, validateStructureInput } from './structureAudit';
import { tl } from '../langStore';

export interface PrepressInput {
  design: DesignDoc;
  brief: DesignBrief;
  dieline: Dieline;
  dpi: number;
}

/** PNG 是否带 alpha 通道（只看 IHDR 的 color type，不依赖文件名/DPI 元数据） */
function pngHasAlpha(src: string): boolean {
  if (!/^data:image\/png/i.test(src)) return false;
  try {
    const comma = src.indexOf(',');
    if (comma < 0) return false;
    const meta = src.slice(0, comma);
    const bytes = meta.includes('base64')
      ? Uint8Array.from(atob(src.slice(comma + 1)), (c) => c.charCodeAt(0))
      : null;
    if (!bytes || bytes.length < 26) return false;
    return bytes[25] === 4 || bytes[25] === 6;
  } catch { return false; }
}

export function runPrepress({ design, brief, dieline, dpi }: PrepressInput): PrepressReport {
  const items: CheckItem[] = [];
  const add = (id: string, group: string, level: CheckItem['level'], title: string, detail: string, fix?: string) =>
    items.push({ id, group, level, title, detail, fix });
  const faces = Object.values(design.faces).filter(Boolean) as Face[];
  const allLayers = faces.flatMap((f) => f.layers);
  const stats = dielineStats(dieline);
  const audit = auditDieline(dieline);
  const inputCheck = validateStructureInput(dieline.structure, dieline.input || brief.size);
  const geometryErrors = [...inputCheck, ...audit.issues].filter((i) => i.level === 'error');
  const geometryWarnings = [...inputCheck, ...audit.issues].filter((i) => i.level === 'warning');

  // 1. 尺寸
  const fin = dieline.finished;
  const okSize = Math.abs(fin.l - brief.size.l) < 0.6 && Math.abs(fin.w - brief.size.w) < 0.6 && (!brief.size.h || Math.abs(fin.h - brief.size.h) < 0.6);
  add('size', tl('尺寸', 'Size'), okSize ? 'pass' : 'error', okSize ? tl('包装尺寸正常', 'Packaging size is correct') : tl('成品尺寸与需求不一致', 'Finished size does not match the brief'),
    tl(
      `成品 ${fin.l} × ${fin.w}${fin.h ? ` × ${fin.h}` : ''} mm；需求 ${brief.size.l} × ${brief.size.w}${brief.size.h ? ` × ${brief.size.h}` : ''} mm。刀模按前者计算。`,
      `Finished ${fin.l} × ${fin.w}${fin.h ? ` × ${fin.h}` : ''} mm; the brief asks for ${brief.size.l} × ${brief.size.w}${brief.size.h ? ` × ${brief.size.h}` : ''} mm. The dieline follows the former.`,
    ),
    okSize ? undefined : tl('返回创作中心重新输入尺寸', 'Go back to the studio and re-enter the size'));
  add('spread', tl('尺寸', 'Size'), dieline.sheets.every((s) => s.width > 0 && s.height > 0) ? 'pass' : 'error',
    tl('展开尺寸已按结构计算', 'Flat size computed from the structure'),
    tl(`共 ${stats.sheets} 张展开图：${dieline.sheets.map((s) => `${s.name} ${s.width}×${s.height}mm`).join('；')}。裁切线 ${stats.cut} 段、压痕线 ${stats.crease} 段。`,
      `${stats.sheets} flat sheet(s): ${dieline.sheets.map((s) => `${s.name} ${s.width}×${s.height}mm`).join('; ')}. ${stats.cut} cut segments and ${stats.crease} crease segments.`));

  // 结构几何自洽性（NaN / 零边 / 负面积 / 重复线 / 面板重叠 / 压痕或裁切无效）
  add('geometry-integrity', tl('刀模', 'Dieline'), geometryErrors.length ? 'error' : geometryWarnings.length ? 'warning' : 'pass',
    geometryErrors.length ? tl('刀模几何存在必须修复的错误', 'The dieline geometry has blocking errors') : geometryWarnings.length ? tl('刀模几何基本通过，有需要确认的参数', 'Geometry is coherent, with parameters to confirm') : tl('刀模几何自洽：无 NaN、无零边、无重叠', 'Dieline geometry is coherent: no NaN, zero edges or overlaps'),
    (geometryErrors.length || geometryWarnings.length)
      ? [...geometryErrors, ...geometryWarnings].slice(0, 8).map((i) => i.message).join(' ')
      : tl(`审计 ${audit.counts.panels} 块面板、${audit.counts.cut} 段裁切、${audit.counts.crease} 段压痕；输入尺寸合法。`, `${audit.counts.panels} panels, ${audit.counts.cut} cut and ${audit.counts.crease} crease segments audited; input size is legal.`),
    geometryErrors.length ? tl('调整尺寸/结构参数，或回到需求页重新确认尺寸', 'Adjust the size or structure parameters, or reconfirm the size') : undefined);

  // 2. 出血
  const bleedOk = dieline.bleed >= 2 && dieline.bleed <= 5;
  add('bleed', tl('出血', 'Bleed'), bleedOk ? 'pass' : 'warning', bleedOk ? tl('出血区域已自动加好', 'Bleed has been added automatically') : tl('出血值需要确认', 'Bleed value needs confirming'),
    tl(`默认按 ${dieline.bleed}mm 计算，成品区 / 出血区 / 安全区 / 裁切线 / 压痕线已分层。每个面的底色会自动延伸到出血边。`,
      `Calculated at ${dieline.bleed}mm by default; trim, bleed, safe area, cut lines and crease lines are separate layers. Each face background extends to the bleed edge automatically.`),
    bleedOk ? undefined : tl('在个人设置中按印厂要求调整出血值', 'Adjust the bleed in Settings to match your printer'));
  add('artwork', tl('出血', 'Bleed'), faces.every((f) => !!f.bg) ? 'pass' : 'error', tl('底色覆盖完整', 'Background coverage complete'),
    faces.every((f) => !!f.bg) ? tl('所有印刷面都有底色，裁切后不会露白边。', 'Every printed face has a background, so no white edges appear after trimming.') : tl('有印刷面缺少底色，裁切后可能出现白边。', 'A printed face has no background, so white edges may appear after trimming.'));

  // 3. 安全区与文字
  let tooClose = 0, overflow = 0, placeholders = 0, tiny = 0, crossing = 0, creaseConflict = 0;
  let safetyDetail = '';
  const textBox = (l: TextLayer) => {
    const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
    const a = (Number.isFinite(l.rotation) ? l.rotation : 0) * Math.PI / 180;
    const hw = Math.abs(l.w / 2 * Math.cos(a)) + Math.abs(l.h / 2 * Math.sin(a));
    const hh = Math.abs(l.w / 2 * Math.sin(a)) + Math.abs(l.h / 2 * Math.cos(a));
    return { x: cx - hw, y: cy - hh, w: hw * 2, h: hh * 2 };
  };
  for (const face of faces) {
    for (const l of face.layers) {
      if (l.type !== 'text' || l.hidden) continue;
      const t = l as TextLayer;
      const b = textBox(t);
      if (b.x < dieline.safe - 0.5 || b.y < dieline.safe - 0.5 || b.x + b.w > face.w - dieline.safe + 0.5 || b.y + b.h > face.h - dieline.safe + 0.5) tooClose++;
      if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > face.w + 0.5 || b.y + b.h > face.h + 0.5) crossing++;
      // 压痕在面板边缘：文字包围盒进入边缘 1.2mm 带，折叠后会压在折线上
      if (b.x < 1.2 || b.y < 1.2 || b.x + b.w > face.w - 1.2 || b.y + b.h > face.h - 1.2) creaseConflict++;
      if (ptToMm(t.fontSize) < 1.5) tiny++;
      if (textOverflow(t)) overflow++;
      if (t.placeholder) placeholders++;
    }
  }
  add('safe', tl('文字', 'Text'), tooClose === 0 ? 'pass' : 'warning', tooClose === 0 ? tl('文字都离裁切边足够远', 'All text is far enough from the trim edge') : tl('有文字距离裁切边缘较近，建议调整', 'Some text sits close to the trim edge — worth adjusting'),
    tooClose === 0 ? tl(`安全边距 ${dieline.safe}mm，所有文字（含旋转后的包围盒）均在安全区内。`, `Safe margin is ${dieline.safe}mm; every text block, including its rotated bounding box, sits inside it.`) : tl(`${tooClose} 处文字进入 ${dieline.safe}mm 安全区，印刷裁切时可能被切到。`, `${tooClose} text block(s) enter the ${dieline.safe}mm safe area and may be trimmed.`),
    tooClose ? tl('使用「自动修复」把文字移回安全区', 'Use “Auto-fix” to move the text back into the safe area') : undefined);
  add('text-cross', tl('文字', 'Text'), crossing === 0 ? 'pass' : 'error', crossing === 0 ? tl('没有文字跨越面板边界', 'No text crosses a panel edge') : tl('有文字跨越面板/折线，折叠后会错位', 'Some text crosses a panel edge and will break when folded'),
    crossing === 0 ? tl('所有文字都落在各自面板内。', 'Every text block stays on its own panel.') : tl(`${crossing} 处文字超出所在面板，折盒后会跨到另一个面。`, `${crossing} text block(s) extend beyond their panel and will land on another face when folded.`),
    crossing ? tl('缩小字号或把文字移回本面板', 'Reduce the size or move the text back onto this panel') : undefined);
  add('text-crease', tl('文字', 'Text'), creaseConflict === 0 ? 'pass' : 'warning', creaseConflict === 0 ? tl('文字避开压痕线', 'Text avoids the crease lines') : tl('文字压到折线区域，折叠后会变形', 'Text overlaps the crease area and will distort when folded'),
    creaseConflict === 0 ? tl('文字与面板边缘保持 1.2mm 以上距离。', 'Text keeps at least 1.2mm from panel edges.') : tl(`${creaseConflict} 处文字进入边缘 1.2mm 折线带。`, `${creaseConflict} text block(s) enter the 1.2mm fold-line band at panel edges.`),
    creaseConflict ? tl('把文字移向面板中部', 'Move the text toward the panel centre') : undefined);
  add('text-small', tl('文字', 'Text'), tiny === 0 ? 'pass' : 'warning', tiny === 0 ? tl('没有过小文字', 'No tiny text') : tl('有文字小于 1.5mm（约 4.25pt）', 'Some text is below 1.5mm (about 4.25pt)'),
    tiny === 0 ? tl('所有文字字号都在可印刷范围内。', 'All text sizes are within the printable range.') : tl(`${tiny} 处文字换算后小于 1.5mm，小字印刷容易糊版。`, `${tiny} text block(s) are below 1.5mm after conversion and may fill in on press.`),
    tiny ? tl('放大字号或删减文案', 'Increase the size or shorten the copy') : undefined);

  add('overflow', tl('文字', 'Text'), overflow === 0 ? 'pass' : 'error', overflow === 0 ? tl('文字没有被裁切', 'No text is clipped') : tl('有文字超出文本框', 'Some text overflows its box'),
    overflow === 0 ? tl('所有文字都在自己的文本框内，且保持独立可编辑图层。', 'All text fits its own box and stays as an editable layer.') : tl(`${overflow} 处文字可能显示不全，系统不会擅自删减你提供的内容。`, `${overflow} text block(s) may be cut off; the system will never silently delete what you wrote.`),
    overflow ? tl('使用「自动修复」缩小字号，或手动调整文本框', 'Use “Auto-fix” to reduce the font size, or resize the box manually') : undefined);
  add('placeholder', tl('文字', 'Text'), placeholders === 0 ? 'pass' : 'warning',
    placeholders === 0 ? tl('包装文字已完整', 'Packaging copy is complete') : tl(`${placeholders} 处仍是占位文字，需要你补充真实信息`, `${placeholders} placeholder block(s) still need real information`),
    placeholders === 0 ? tl('所有文案已由你确认。', 'You have confirmed all copy.') : tl('例如净含量、产品说明、配料与生产信息。食品 / 化妆品等标签内容请自行按适用法规核实，LunaSol 不代替合规审查。', 'For example net weight, product description, ingredients and production details. Label content for food or cosmetics must be checked against the applicable regulations yourself — LunaSol does not replace a compliance review.'),
    placeholders ? tl('在编辑器中逐条替换占位文字', 'Replace each placeholder in the editor') : undefined);
  safetyDetail = tl(`共 ${allLayers.filter((l) => l.type === 'text').length} 个可编辑文字图层。`, `${allLayers.filter((l) => l.type === 'text').length} editable text layers.`);

  // 4. 图片：缺失、有效 PPI、越界、透明度
  const imgs = allLayers.filter((l) => l.type === 'image') as Extract<typeof allLayers[number], { type: 'image' }>[];
  const missing = imgs.filter((l) => !l.src);
  const present = imgs.filter((l) => !!l.src && l.naturalW > 0 && l.naturalH > 0);
  const dpiList = present.map((l) => Math.min(l.naturalW / (l.w / 25.4), l.naturalH / (l.h / 25.4)));
  const low = dpiList.filter((d) => d < dpi);
  add('image-missing', tl('图片', 'Images'), missing.length ? 'error' : 'pass',
    missing.length ? tl('有图片图层还没有真实文件', 'Some image layers have no real file') : tl('图片文件齐全', 'Every image layer has a file'),
    missing.length ? tl(`${missing.length} 个图片图层只有占位框（无 src），印出来会是空白。`, `${missing.length} image layer(s) are placeholders with no source and would print blank.`) : tl('所有图片图层都指向真实文件。', 'All image layers point to real files.'),
    missing.length ? tl('替换为真实图片，或删除占位框', 'Replace with a real image or delete the placeholder') : undefined);
  add('dpi', tl('图片', 'Images'), low.length === 0 ? 'pass' : low.some((d) => d < 150) ? 'error' : 'warning',
    low.length === 0 ? (present.length ? tl(`图片有效分辨率足够（≥${dpi} PPI）`, `Effective image resolution is sufficient (≥${dpi} PPI)`) : tl('没有位图，全部为矢量图形', 'No bitmaps — everything is vector')) : tl('部分图片有效分辨率不足', 'Some images have insufficient effective resolution'),
    present.length ? tl(`共 ${present.length} 张位图，按实际印刷毫米尺寸反算：${dpiList.map((d) => Math.round(d)).join(' / ')} PPI，目标 ${dpi} PPI。不使用文件自带的 DPI 元数据。`, `${present.length} bitmap(s), computed from their actual printed mm size: ${dpiList.map((d) => Math.round(d)).join(' / ')} PPI against a ${dpi} PPI target. File DPI metadata is not trusted.`) : tl('当前设计没有可计算 PPI 的位图。', 'This design has no bitmap whose PPI can be computed.'),
    low.length ? tl('替换图片，或在 AI 创作中心重新生成素材', 'Replace the images or regenerate assets in the AI studio') : undefined);

  let outOfPanel = 0, alphaNoBg = 0;
  for (const face of faces) {
    for (const l of face.layers) {
      if (l.type !== 'image' || l.hidden) continue;
      if (l.x < -0.5 || l.y < -0.5 || l.x + l.w > face.w + 0.5 || l.y + l.h > face.h + 0.5) outOfPanel++;
      if (l.src && pngHasAlpha(l.src) && !face.bg) alphaNoBg++;
    }
  }
  add('image-bounds', tl('图片', 'Images'), outOfPanel === 0 ? 'pass' : 'warning', outOfPanel === 0 ? tl('图片都在面板内', 'Images stay within their panels') : tl('有图片超出面板/裁切线', 'Some images extend beyond the panel'),
    outOfPanel === 0 ? tl('图片边界均在所属面板内，不会被折到其它面。', 'Image bounds stay inside their own panels and will not fold onto another face.') : tl(`${outOfPanel} 张图片超出面板，可能被裁掉或折到相邻面。`, `${outOfPanel} image(s) extend past the panel and may be trimmed or fold onto a neighbouring face.`),
    outOfPanel ? tl('缩小图片或移回面板内', 'Scale down or move the image back inside the panel') : undefined);
  add('image-alpha', tl('图片', 'Images'), alphaNoBg === 0 ? 'pass' : 'error', alphaNoBg === 0 ? tl('透明背景处理正确', 'Transparency handled correctly') : tl('透明图片叠在没有底色的面上', 'Transparent image on a face with no background'),
    alphaNoBg === 0 ? tl('带 alpha 的 PNG 会保留透明度；下有面底色时按合成结果输出，不会自动加白底。', 'PNG alpha is preserved; where a face background exists the composite is exported and no white matte is added automatically.') : tl(`${alphaNoBg} 张透明图片所在的面没有底色，透明区会露出纸白。`, `${alphaNoBg} transparent image(s) sit on faces without a background, so transparent areas will show paper white.`),
    alphaNoBg ? tl('给该面设置底色，或改用不透明图片', 'Set a background for that face or use an opaque image') : undefined);

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

  // 5b. 印刷工艺：非 print 图层必须独立标记，不能混进普通四色稿
  const special = allLayers.filter((l) => l.process && l.process !== 'print');
  const kinds = ['foil', 'uv', 'spot'] as const;
  const countsText = kinds.map((k) => `${k}=${special.filter((l) => l.process === k).length}`).join(' / ');
  add('process', tl('工艺', 'Finishes'), special.length ? 'pass' : 'pass',
    special.length ? tl('特殊工艺已使用独立图层', 'Special finishes use separate layers') : tl('没有特殊工艺图层', 'No special finish layers'),
    special.length ? tl(`检测到 ${special.length} 个工艺图层（${countsText}）。导出 PDF 时烫金/UV/专色会单独出页，并以黑色 100% 标记工艺区域，不合并进普通 CMYK 图片。`, `${special.length} finish layer(s) (${countsText}). PDF export puts foil/UV/spot on separate pages, marking the areas with 100% black, never merged into the CMYK artwork.`) : tl('当前所有图层都按普通四色印刷处理；需要烫金/UV/专色时，在对象属性里选择对应工艺。', 'All layers are treated as ordinary CMYK artwork. Choose foil/UV/spot in object properties when needed.'),
    undefined);

  // 6. 字体
  const fonts = new Set(allLayers.filter((l) => l.type === 'text').map((l) => (l as TextLayer).fontFamily));
  const canCheckFont = typeof document !== 'undefined' && !!(document as Document).fonts;
  const missingFonts = canCheckFont
    ? [...fonts].filter((f) => { try { return !(document as Document).fonts.check(`12px ${f}`); } catch { return false; } })
    : [];
  add('font', tl('字体', 'Fonts'), missingFonts.length ? 'warning' : canCheckFont ? 'pass' : 'warning',
    missingFonts.length ? tl('有字体在本机可能缺失', 'Some fonts may be missing on this machine') : canCheckFont ? tl('字体检查通过', 'Font check passed') : tl('当前环境无法验证字体', 'Fonts cannot be verified in this environment'),
    missingFonts.length ? tl(`系统字体回退可能影响排版：${missingFonts.slice(0, 2).join(' / ')}。导出 PDF 时文字会以 ${dpi} PPI 栅格化嵌入，避免印厂缺字。`, `System font fallback may affect the layout: ${missing.slice(0, 2).join(' / ')}. Text is rasterised at ${dpi} PPI when exporting PDF, so the printer never sees missing fonts.`)
      : canCheckFont ? tl(`共 ${fonts.size} 种字体；导出 PDF 时文字按 ${dpi} PPI 嵌入（等效转曲），SVG 保留可编辑文字。${safetyDetail}`, `${fonts.size} font(s); PDF export embeds text at ${dpi} PPI (effectively outlined) while SVG keeps it editable. ${safetyDetail}`)
        : tl(`共 ${fonts.size} 种字体。当前运行环境没有 document.fonts，无法确认本机是否缺字；导出前请在浏览器中复核。SVG 中的字体名称也需印厂具备。`, `${fonts.size} font(s). This runtime has no document.fonts, so missing fonts cannot be confirmed; verify in a browser before export. The font names in SVG also need to exist at the printer.`),
    missingFonts.length || !canCheckFont ? tl('改用系统自带字体，或导出前在浏览器确认', 'Switch to a system font or verify in a browser before export') : undefined);

  // 7. 刀模
  const cutOk = stats.cut > 0;
  const creaseOk = stats.crease > 0 || dieline.structure === 'labelRound' || dieline.structure === 'labelRect';
  const hasGlue = dieline.sheets.some((s) => s.rects.some((r) => /粘合/.test(r.label)));
  add('dieline', tl('刀模', 'Dieline'), cutOk && creaseOk ? 'pass' : 'error', cutOk && creaseOk ? tl('刀模结构完整', 'Dieline structure is complete') : tl('刀模存在关键错误，不允许标记为印刷合格', 'The dieline has critical errors and cannot be marked print-ready'),
    tl(`裁切线 ${stats.cut} 段、压痕线 ${stats.crease} 段、出血线 ${stats.bleedLines} 段；${hasGlue ? '粘合位已保留' : '该结构无需独立粘合位'}。结构由几何规则计算，不由 AI 判断可生产性。`,
      `${stats.cut} cut segments, ${stats.crease} crease segments, ${stats.bleedLines} bleed lines; ${hasGlue ? 'a glue flap is included' : 'this structure needs no separate glue flap'}. The structure is computed geometrically — AI never judges manufacturability.`));
  const needsGlue = ['tuck', 'topBottom', 'drawer'].includes(dieline.structure);
  add('glue', tl('刀模', 'Dieline'), !needsGlue || hasGlue ? 'pass' : 'error',
    !needsGlue || hasGlue ? tl('粘合位/封口边已保留', 'Glue flap or seal edge is present') : tl('结构缺少粘合位', 'The structure is missing its glue flap'),
    !needsGlue ? tl(`${dieline.structure === 'pouch' ? '自立袋采用热封边' : '该结构为折叠/模切结构'}，没有独立粘合位。`, `${dieline.structure === 'pouch' ? 'The pouch uses a heat-sealed edge' : 'This structure folds or die-cuts without a separate glue flap'}.`) : hasGlue ? tl('粘合位在展开图中真实存在，不是图上画的装饰。', 'The glue flap exists in the real flat geometry, not as a drawn decoration.') : tl('刀模里找不到粘合位，成型后无法固定。', 'No glue flap exists in the dieline, so the box cannot be locked after folding.'));

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
