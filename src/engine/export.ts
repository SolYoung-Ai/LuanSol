/* 文件输出 Agent：生成真实的毫米级印刷文件，而不是把整张设计截图塞进 PDF。
 * PDF = 逐图层绘制（矢量图形 + 按图层转曲的文字 + 独立刀模页），
 * SVG = 保留可编辑文字的矢量展开稿，DXF = 由刀模几何直接写出的 CAD 图元。 */
// jsPDF / JSZip 体积大且只在「导出文件」时用到，改为函数内动态 import（见 buildPdf / buildBundle），
// 避免首屏或任何页面静态拉起这两个重库。此处仅保留 jsPDF 类型（编译期擦除，无运行时依赖）。
import type { jsPDF } from 'jspdf';
import type { DesignDoc, Dieline, Face, Layer, Segment, Sheet, TextLayer } from '../types';
import { faceMarkup, faceSvg, shapePrims, type Prim } from './design';
import { downloadBlob, escapeXml, hexToRgb, mmToPx, ptToMm, round, svgToDataUrl, wrapText } from './utils';

const n = (v: number) => round(v, 2);

export function spreadSvg(design: DesignDoc, dieline: Dieline, sheetIndex = 0, showDieline = true): string {
  const sheet = dieline.sheets[sheetIndex];
  if (!sheet) return '';
  const b = dieline.bleed;
  const panels = sheet.rects.filter((r) => r.face && r.artwork);
  const bgParts = panels.map((p) => {
    const f = design.faces[p.face!];
    return `<rect x="${n(p.x - b)}" y="${n(p.y - b)}" width="${n(p.w + b * 2)}" height="${n(p.h + b * 2)}" fill="${f?.bg || '#ffffff'}"/>`;
  }).join('');
  const artParts = panels.map((p) => {
    const f = design.faces[p.face!];
    if (!f) return '';
    const roundClip = dieline.structure === 'labelRound';
    return `<svg x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" viewBox="0 0 ${n(f.w)} ${n(f.h)}">${faceMarkup(f, roundClip)}</svg>`;
  }).join('');
  const line = (s: Segment) => {
    const style = s.kind === 'cut' ? 'stroke="#151515" stroke-width="0.35"'
      : s.kind === 'crease' ? 'stroke="#e05252" stroke-width="0.25" stroke-dasharray="2 1.5"'
        : s.kind === 'bleed' ? 'stroke="#2b7fc3" stroke-width="0.2" stroke-dasharray="1 1"'
          : 'stroke="#9aa0a6" stroke-width="0.18" stroke-dasharray="0.8 1.2"';
    return `<line x1="${n(s.x1)}" y1="${n(s.y1)}" x2="${n(s.x2)}" y2="${n(s.y2)}" ${style}/>`;
  };
  const circles = sheet.circles.map((c) => `<circle cx="${n(c.cx)}" cy="${n(c.cy)}" r="${n(c.r)}" fill="none" stroke="${c.kind === 'cut' ? '#111' : '#2b7fc3'}" stroke-width="0.35" stroke-dasharray="${c.kind === 'cut' ? '' : '1 1'}"/>`).join('');
  const labels = (showDieline ? '' : panels.map((p) => `<text x="${n(p.x + 2)}" y="${n(p.y + 5)}" font-size="3.5" fill="#9a9a9a" font-family="sans-serif">${escapeXml(p.label)}</text>`).join(''));
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(sheet.width)}mm" height="${n(sheet.height)}mm" viewBox="0 0 ${n(sheet.width)} ${n(sheet.height)}">
<rect width="${n(sheet.width)}" height="${n(sheet.height)}" fill="#ffffff"/>
${bgParts}${artParts}${showDieline ? sheet.segments.map(line).join('') + circles : labels}
</svg>`;
}

/* ---------------- 位图渲染 ---------------- */
export async function svgToCanvas(svg: string, widthMm: number, heightMm: number, dpi = 300, bg = '#ffffff'): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(mmToPx(widthMm, dpi)));
  c.height = Math.max(1, Math.ceil(mmToPx(heightMm, dpi)));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  const img = new Image();
  const src = svgToDataUrl(svg);
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('SVG 渲染失败')); img.src = src; });
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export const canvasToBlob = (c: HTMLCanvasElement, type = 'image/png', q = 0.94) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => b ? resolve(b) : reject(new Error('图片生成失败')), type, q));

/** 单个文字图层按指定 DPI 单独栅格化（等效转曲），避免依赖印厂字体 */
async function textLayerPng(l: TextLayer, dpi: number): Promise<string> {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(mmToPx(l.w, dpi)));
  c.height = Math.max(1, Math.ceil(mmToPx(l.h, dpi)));
  const ctx = c.getContext('2d')!;
  const scale = dpi / 25.4;
  ctx.scale(scale, scale); // 之后 1 单位 = 1mm
  const fs = ptToMm(l.fontSize);
  ctx.font = `${l.fontWeight} ${fs}px ${l.fontFamily}`;
  ctx.fillStyle = l.color;
  ctx.textBaseline = 'top';
  ctx.textAlign = l.align === 'center' ? 'center' : l.align === 'right' ? 'right' : 'left';
  try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${l.letterSpacing}em`; } catch { /* 老浏览器忽略 */ }
  const tx = l.align === 'center' ? l.w / 2 : l.align === 'right' ? l.w : 0;
  const lines = wrapText(l.text, l.w, fs, l.letterSpacing);
  lines.forEach((line, i) => ctx.fillText(line, tx, i * fs * l.lineHeight));
  return c.toDataURL('image/png');
}

function pdfFill(doc: jsPDF, hex: string) { const [r, g, b] = hexToRgb(hex); doc.setFillColor(r, g, b); }
function pdfDraw(doc: jsPDF, hex: string) { const [r, g, b] = hexToRgb(hex); doc.setDrawColor(r, g, b); }

function drawPrim(doc: jsPDF, p: Prim, ox: number, oy: number) {
  if (p.k === 'rect') {
    if (p.fill === 'none') return;
    pdfFill(doc, p.fill);
    if (p.rx) doc.roundedRect(ox + p.x, oy + p.y, p.w, p.h, p.rx, p.rx, 'F');
    else doc.rect(ox + p.x, oy + p.y, p.w, p.h, 'F');
  } else if (p.k === 'circle') {
    pdfFill(doc, p.fill);
    doc.circle(ox + p.cx, oy + p.cy, p.r, 'F');
  } else if (p.k === 'line') {
    pdfDraw(doc, p.stroke); doc.setLineWidth(p.strokeWidth);
    doc.line(ox + p.x1, oy + p.y1, ox + p.x2, oy + p.y2);
  } else {
    const pts = p.pts;
    if (!pts.length) return;
    const [fx, fy] = pts[0];
    const rel = pts.slice(1).map(([x, y]) => [x - fx, y - fy]);
    if (p.fill && p.fill !== 'none') { pdfFill(doc, p.fill); doc.lines(rel, ox + fx, oy + fy, [1, 1], 'F', !!p.close); }
    if (p.stroke && p.stroke !== 'none') { pdfDraw(doc, p.stroke); doc.setLineWidth(p.strokeWidth || 0.4); doc.lines(rel, ox + fx, oy + fy, [1, 1], 'S', !!p.close); }
  }
}

async function drawLayerPdf(doc: jsPDF, l: Layer, ox: number, oy: number, dpi: number) {
  if (l.hidden) return;
  if (l.type === 'shape') { for (const p of shapePrims(l)) drawPrim(doc, p, ox + l.x, oy + l.y); return; }
  if (l.type === 'image') {
    const fmt = l.src.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    try { doc.addImage(l.src, fmt, ox + l.x, oy + l.y, l.w, l.h); } catch { /* 忽略不可解码图片 */ }
    return;
  }
  const png = await textLayerPng(l, dpi);
  doc.addImage(png, 'PNG', ox + l.x, oy + l.y, l.w, l.h);
}

function drawDielinePage(doc: jsPDF, sheet: Sheet, dieline: Dieline) {
  doc.addPage([sheet.width, sheet.height], sheet.width >= sheet.height ? 'landscape' : 'portrait');
  const styleFor = (kind: Segment['kind']) => {
    if (kind === 'cut') { doc.setDrawColor(20, 20, 20); doc.setLineWidth(0.35); doc.setLineDashPattern([], 0); }
    else if (kind === 'crease') { doc.setDrawColor(200, 60, 60); doc.setLineWidth(0.25); doc.setLineDashPattern([2, 1.5], 0); }
    else if (kind === 'bleed') { doc.setDrawColor(60, 130, 190); doc.setLineWidth(0.2); doc.setLineDashPattern([1, 1], 0); }
    else { doc.setDrawColor(170, 170, 170); doc.setLineWidth(0.18); doc.setLineDashPattern([0.8, 1.2], 0); }
  };
  let prev = '';
  for (const s of sheet.segments) { if (s.kind !== prev) { styleFor(s.kind); prev = s.kind; } doc.line(s.x1, s.y1, s.x2, s.y2); }
  for (const c of sheet.circles) { styleFor(c.kind === 'cut' ? 'cut' : 'bleed'); doc.circle(c.cx, c.cy, c.r); }
  doc.setLineDashPattern([], 0);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(3); doc.setTextColor(90, 90, 90);
  // 仅用 ASCII：jsPDF 标准字体遇中文会切换 UTF-16 编码并使标记不可读
  doc.text(`LunaSol DIELINE  |  ${sheet.id}  |  ${sheet.width} x ${sheet.height} mm  |  BLEED ${dieline.bleed}mm  |  SOLID=CUT  DASH=CREASE`, 5, sheet.height - 3);
}

/** 生成印刷 PDF：每个展开图两页（设计页 + 独立刀模页） */
export async function buildPdf(design: DesignDoc, dieline: Dieline, dpi = 300): Promise<{ blob: Blob; bytes: Uint8Array }> {
  const { jsPDF } = await import('jspdf');
  const first = dieline.sheets[0];
  // compress:false 让内容流保持可读，便于做真实的字节级预检（MediaBox / 刀模页 / 文字层）
  const doc = new jsPDF({ unit: 'mm', format: [first.width, first.height], orientation: first.width >= first.height ? 'landscape' : 'portrait', compress: false });
  doc.setProperties({ title: `${design.name} · LunaSol 印刷稿`, subject: 'Packaging artwork + dieline', creator: 'LunaSol AI Packaging Studio' });
  for (let i = 0; i < dieline.sheets.length; i++) {
    const sheet = dieline.sheets[i];
    if (i > 0) doc.addPage([sheet.width, sheet.height], sheet.width >= sheet.height ? 'landscape' : 'portrait');
    // 整页底色（覆盖出血区）
    const bg = (design.faces.front || Object.values(design.faces)[0] as Face | undefined)?.bg || '#ffffff';
    pdfFill(doc, bg); doc.rect(0, 0, sheet.width, sheet.height, 'F');
    // 各面的出血底色
    for (const p of sheet.rects.filter((r) => r.face && r.artwork)) {
      const f = design.faces[p.face!];
      if (!f) continue;
      pdfFill(doc, f.bg);
      doc.rect(p.x - dieline.bleed, p.y - dieline.bleed, p.w + dieline.bleed * 2, p.h + dieline.bleed * 2, 'F');
    }
    // 逐图层绘制
    for (const p of sheet.rects.filter((r) => r.face && r.artwork)) {
      const f = design.faces[p.face!];
      if (!f) continue;
      for (const l of f.layers) await drawLayerPdf(doc, l, p.x, p.y, dpi);
    }
    drawDielinePage(doc, sheet, dieline);
  }
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  return { blob: new Blob([bytes], { type: 'application/pdf' }), bytes };
}

/** 对导出的 PDF 做真实字节级预检：文件头、页面数、MediaBox 毫米尺寸 */
export function verifyPdf(bytes: Uint8Array, sheets: Sheet[]) {
  // 扫描完整字节流：刀模页位于文件尾部，截断会漏检
  const text = new TextDecoder('latin1').decode(bytes);
  const header = text.slice(0, 8);
  const pages = (text.match(/\/Type\s*\/Page\b/g) || []).length;
  const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => ({ w: Number(m[1]), h: Number(m[2]) }));
  const expectedPt = sheets.map((s) => ({ w: s.width * 2.8346, h: s.height * 2.8346 }));
  const sizeOk = boxes.length > 0 && expectedPt.every((e) => boxes.some((b) => Math.abs(b.w - e.w) < 3 && Math.abs(b.h - e.h) < 3));
  const issues: string[] = [];
  if (!header.startsWith('%PDF-')) issues.push('缺少 PDF 文件头');
  if (pages < sheets.length * 2) issues.push(`页面数不足（应为 ${sheets.length * 2} 页，检测到 ${pages} 页）`);
  if (!sizeOk) issues.push('页面物理尺寸（毫米）与刀模展开尺寸不一致');
  if (!text.includes('LunaSol DIELINE')) issues.push('未检测到独立刀模页');
  return { ok: issues.length === 0, issues, pages, boxes, bytes: bytes.length };
}

/** DXF R2000 最小可用结构，单位 mm，Y 轴翻转为 CAD 坐标系 */
export function buildDxf(dieline: Dieline, sheetIndex = 0): string {
  const s = dieline.sheets[sheetIndex];
  const flip = (y: number) => round(s.height - y, 3);
  const L: string[] = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES'];
  for (const seg of s.segments.filter((x) => x.kind === 'cut' || x.kind === 'crease')) {
    const layer = seg.kind === 'cut' ? 'CUT' : 'CREASE';
    L.push('0', 'LINE', '8', layer, '10', String(round(seg.x1, 3)), '20', String(flip(seg.y1)), '30', '0',
      '11', String(round(seg.x2, 3)), '21', String(flip(seg.y2)), '31', '0');
  }
  for (const c of s.circles.filter((x) => x.kind === 'cut')) {
    L.push('0', 'CIRCLE', '8', 'CUT', '10', String(round(c.cx, 3)), '20', String(flip(c.cy)), '30', '0', '40', String(round(c.r, 3)));
  }
  L.push('0', 'ENDSEC', '0', 'EOF');
  return L.join('\n') + '\n';
}

/** 2D 立体效果图（无需 WebGL，供 JPG 导出与分享页使用） */
export function mockupSvg(design: DesignDoc): string {
  const front = (design.faces.front || Object.values(design.faces)[0]) as Face | undefined;
  if (!front) return '';
  const W = 900, H = 680;
  const bw = 380, bh = Math.min(340, (front.h / front.w) * bw), d = 76;
  const x0 = (W - bw - d) / 2, y0 = (H - bh) / 2 + 30;
  const faceUrl = encodeURIComponent(faceSvg(front));
  const topPts = `${x0},${y0} ${x0 + d},${y0 - d * 0.62} ${x0 + bw + d},${y0 - d * 0.62} ${x0 + bw},${y0}`;
  const sidePts = `${x0 + bw},${y0} ${x0 + bw + d},${y0 - d * 0.62} ${x0 + bw + d},${y0 + bh - d * 0.62} ${x0 + bw},${y0 + bh}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7f5f0"/><stop offset="1" stop-color="#e9e6de"/></linearGradient>
<radialGradient id="sh"><stop offset="0" stop-color="#000" stop-opacity="0.26"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<linearGradient id="side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${design.palette.primary}" stop-opacity="0.78"/><stop offset="1" stop-color="#000" stop-opacity="0.28"/></linearGradient>
<clipPath id="front"><rect x="${x0}" y="${y0}" width="${bw}" height="${bh}"/></clipPath></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<ellipse cx="${x0 + bw / 2 + d / 2}" cy="${y0 + bh + 36}" rx="${bw * 0.72}" ry="34" fill="url(#sh)"/>
<polygon points="${topPts}" fill="${design.palette.accent}" opacity="0.55"/>
<polygon points="${sidePts}" fill="url(#side)"/>
<image href="data:image/svg+xml;charset=utf-8,${faceUrl}" x="${x0}" y="${y0}" width="${bw}" height="${bh}" preserveAspectRatio="none" clip-path="url(#front)"/>
<polygon points="${topPts}" fill="none" stroke="#00000018" stroke-width="1"/>
<polygon points="${sidePts}" fill="none" stroke="#00000018" stroke-width="1"/>
<rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" fill="none" stroke="#00000010" stroke-width="1"/>
</svg>`;
}

export async function exportPng(svg: string, wMm: number, hMm: number, filename: string, dpi = 300) {
  const c = await svgToCanvas(svg, wMm, hMm, dpi);
  downloadBlob(await canvasToBlob(c, 'image/png'), filename);
  return { width: c.width, height: c.height, dpi };
}

export async function exportJpgMockup(design: DesignDoc, filename: string) {
  const svg = mockupSvg(design);
  const c = await svgToCanvas(svg, 240, 181, 150, '#ffffff');
  downloadBlob(await canvasToBlob(c, 'image/jpeg', 0.92), filename);
  return { width: c.width, height: c.height };
}

export function downloadText(text: string, filename: string, type = 'text/plain') {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}

/** 打包下载：设计稿、刀模、印刷 PDF、效果图、检查清单 */
export async function buildBundle(design: DesignDoc, dieline: Dieline, dpi = 300, verified = true) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const base = design.name.replace(/[\\/:*?"<>|]/g, '_');
  dieline.sheets.forEach((s, i) => zip.file(`01_设计稿_${s.name}.svg`, spreadSvg(design, dieline, i, false)));
  dieline.sheets.forEach((s, i) => zip.file(`02_刀模_${s.name}.dxf`, buildDxf(dieline, i)));
  zip.file('03_高清效果图.svg', mockupSvg(design));
  const pdf = await buildPdf(design, dieline, dpi);
  const check = verifyPdf(pdf.bytes, dieline.sheets);
  zip.file(`04_印刷稿_${verified && check.ok ? '已预检' : '未通过预检'}.pdf`, pdf.blob);
  zip.file('05_导出说明.txt', [
    'LunaSol AI Packaging Studio — 导出说明',
    `项目：${design.name}`,
    `成品尺寸：${dieline.finished.l} × ${dieline.finished.w} × ${dieline.finished.h} mm`,
    `展开图：${dieline.sheets.map((s) => `${s.name} ${s.width}×${s.height}mm`).join('；')}`,
    `出血：${dieline.bleed}mm；安全区：${dieline.safe}mm；输出 DPI：${dpi}`,
    '',
    'PDF：逐图层绘制（矢量图形 + 按图层转曲文字 + 独立刀模页），页面物理尺寸为毫米。',
    `PDF 预检：${check.ok ? '通过' : '未通过 — ' + check.issues.join('；')}；页数 ${check.pages}；字节 ${check.bytes}`,
    'SVG：保留可编辑文字与矢量图形的展开稿。',
    'DXF：CUT=裁切线，CREASE=压痕线，单位 mm。',
    '',
    '注意：PDF/X-4 需要真实标准验证工具链，当前版本未提供该选项，请勿将本 PDF 当作 PDF/X-4 交付印厂。',
    '颜色为近似 CMYK 换算，未内嵌 ICC；屏幕色与印刷色存在差异，请打样确认。',
    '食品、化妆品等标签的法规信息请自行核实，LunaSol 不代替合规审查。',
  ].join('\n'));
  return { blob: await zip.generateAsync({ type: 'blob' }), check };
}
