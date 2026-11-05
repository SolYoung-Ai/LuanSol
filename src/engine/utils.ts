export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const round = (v: number, n = 2) => Math.round(v * 10 ** n) / 10 ** n;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(s || '000000', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToCmyk(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const k = 1 - Math.max(r, g, b);
  if (k >= 0.9999) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((1 - r - k) / (1 - k)) * 100),
    m: Math.round(((1 - g - k) / (1 - k)) * 100),
    y: Math.round(((1 - b - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}

export function readableOn(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#141414' : '#ffffff';
}

export const escapeXml = (s: string) =>
  String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] as string));

export function seeded(n: number) {
  let s = (n || 1) * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/** 估算单行可容纳字符数（中文按 1em，拉丁按 0.55em） */
export function wrapText(text: string, boxW: number, fontSizeMm: number, letterSpacingEm = 0): string[] {
  const unit = fontSizeMm * (1 + letterSpacingEm);
  const perLine = Math.max(1, Math.floor(boxW / unit));
  const out: string[] = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    let width = 0;
    for (const ch of para) {
      const cw = /[\x00-\xff]/.test(ch) ? 0.55 : 1;
      if (width + cw > perLine && line) { out.push(line); line = ''; width = 0; }
      line += ch; width += cw;
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function formatDate(t: number) {
  const d = new Date(t);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const MM_PER_PT = 0.3527778;
export const ptToMm = (pt: number) => pt * MM_PER_PT;
export const mmToPx = (mm: number, dpi = 300) => (mm / 25.4) * dpi;
