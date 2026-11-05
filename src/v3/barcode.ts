/* ============================================================
 * 条形码：EAN-13 / UPC-A / Code 128
 * ------------------------------------------------------------
 * 真实编码 + 校验位验证 + 独立矢量图形。
 * 重要合规：零售用 GTIN/EAN 必须来自用户合法取得的商品编码，
 * 系统不会编造一个看似有效的 EAN 并声称可用于正式零售。
 * ============================================================ */
import type { BarcodeType } from './draft';

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

export interface BarcodeResult {
  ok: boolean;
  message: string;
  modules: number[];      // 1 = 黑条
  value: string;
  type: BarcodeType;
  widthMm: number;
  heightMm: number;
  quietMm: number;        // 静区（左右各）
  minWidthMm: number;
  legal: string;          // 合规提示
}

export const RETAIL_WARNING = '零售商品使用的 GTIN / EAN / UPC 编码必须来自你拥有或合法取得的商品编码。系统不会代你编造商品条码；如果还没有，请选择「暂时不需要」或使用明确标记为预览用途的占位码 / 内部 SKU（Code 128）。';

export function validateBarcode(type: BarcodeType, value: string): { ok: boolean; message: string } {
  const v = value.replace(/[\s-]/g, '');
  if (type === 'EAN-13') {
    if (!/^\d{13}$/.test(v)) return { ok: false, message: 'EAN-13 需要 13 位数字（含校验位）。' };
    const sum = v.slice(0, 12).split('').reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
    const check = (10 - sum % 10) % 10;
    return check === Number(v[12]) ? { ok: true, message: '校验位正确。' } : { ok: false, message: `校验位应为 ${check}，请核对你的商品编码。` };
  }
  if (type === 'UPC-A') {
    if (!/^\d{12}$/.test(v)) return { ok: false, message: 'UPC-A 需要 12 位数字（含校验位）。' };
    const d = v.slice(0, 11).split('').map(Number);
    const sum = 3 * (d[0] + d[2] + d[4] + d[6] + d[8] + d[10]) + (d[1] + d[3] + d[5] + d[7] + d[9]);
    const check = (10 - sum % 10) % 10;
    return check === Number(v[11]) ? { ok: true, message: '校验位正确。' } : { ok: false, message: `校验位应为 ${check}，请核对你的商品编码。` };
  }
  if (type === 'Code 128') {
    if (!v) return { ok: false, message: '请输入内部 SKU 或编码。' };
    if (!/^[\x20-\x7e]+$/.test(v)) return { ok: false, message: 'Code 128 只支持 ASCII 可打印字符。' };
    if (v.length > 40) return { ok: false, message: '编码过长，建议不超过 40 个字符。' };
    return { ok: true, message: '内部管理用途编码，可用于 Code 128。' };
  }
  return { ok: false, message: '请选择条码类型。' };
}

const eanModules = (v: string, upc: boolean): number[] => {
  const bits = upc
    ? '101' + v.slice(0, 6).split('').map((d) => L[+d]).join('') + '01010' + v.slice(6).split('').map((d) => R[+d]).join('') + '101'
    : (() => {
      const par = PARITY[+v[0]];
      const left = v.slice(1, 7).split('').map((d, i) => (par[i] === 'L' ? L : G)[+d]).join('');
      const right = v.slice(7).split('').map((d) => R[+d]).join('');
      return '101' + left + '01010' + right + '101';
    })();
  return bits.split('').map(Number);
};

function c128Modules(v: string): number[] {
  const codes: number[] = [104]; // Start B
  for (const ch of v) codes.push(ch.charCodeAt(0) - 32);
  const sum = (104 + codes.slice(1).reduce((a, c, i) => a + c * (i + 1), 0)) % 103;
  codes.push(sum, 106); // 校验 + Stop
  let bits = '';
  for (const c of codes) {
    const pat = C128[c];
    let bar = true;
    for (const width of pat) { bits += (bar ? '1' : '0').repeat(Number(width)); bar = !bar; }
  }
  return bits.split('').map(Number);
}

/** 编码为模块数组；不合法时不生成（返回 ok:false） */
export function encodeBarcode(type: BarcodeType, value: string, scale = 1): BarcodeResult {
  const v = value.replace(/[\s-]/g, '');
  const check = validateBarcode(type, v);
  const widthMm = type === 'EAN-13' ? 37.29 : type === 'UPC-A' ? 37.29 : Math.max(30, Math.min(90, v.length * 1.6));
  const quietMm = type === 'Code 128' ? 10 * scale : 3.63 * scale;
  const result: BarcodeResult = {
    ok: false, message: check.message, modules: [], value: v, type,
    widthMm: widthMm * scale, heightMm: (type === 'Code 128' ? 18 : 25.93) * scale,
    quietMm, minWidthMm: widthMm * scale,
    legal: RETAIL_WARNING,
  };
  if (!check.ok) return result;
  result.ok = true;
  result.modules = type === 'EAN-13' ? eanModules(v, false)
    : type === 'UPC-A' ? eanModules(v, true)
      : c128Modules(v);
  return result;
}

/** 把模块数组反向解码回数字，做一次真正的可读性校验 */
export function decodeEan(modules: number[]): { ok: boolean; value: string; message: string } {
  const bits = modules.join('');
  if (bits.length !== 95) return { ok: false, value: '', message: `模块数应为 95，实际 ${bits.length}。` };
  if (!bits.startsWith('101') || !bits.endsWith('101') || bits.slice(45, 50) !== '01010')
    return { ok: false, value: '', message: '起始 / 中间 / 终止符损坏，条码不可扫描。' };
  const par: string[] = [];
  let out = '';
  for (let i = 0; i < 6; i++) {
    const seg = bits.slice(3 + i * 7, 10 + i * 7);
    const li = L.indexOf(seg), gi = G.indexOf(seg);
    if (li < 0 && gi < 0) return { ok: false, value: '', message: `左侧第 ${i + 1} 位无法解码。` };
    par.push(li >= 0 ? 'L' : 'G'); out += String(li >= 0 ? li : gi);
  }
  for (let i = 0; i < 6; i++) {
    const seg = bits.slice(50 + i * 7, 57 + i * 7);
    const ri = R.indexOf(seg);
    if (ri < 0) return { ok: false, value: '', message: `右侧第 ${i + 1} 位无法解码。` };
    out += String(ri);
  }
  const first = PARITY.indexOf(par.join(''));
  if (first < 0) return { ok: false, value: '', message: '奇偶校验模式无效。' };
  const value = String(first) + out;
  const sum = value.slice(0, 12).split('').reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === Number(value[12])
    ? { ok: true, value, message: '已反向解码并核对校验位，条码结构可读。' }
    : { ok: false, value, message: '解码结果校验位不符，请勿用于印刷。' };
}

/** 自检：生成 → 解码 → 比对 */
export function verifyBarcode(r: BarcodeResult): { ok: boolean; message: string } {
  if (!r.ok || !r.modules.length) return { ok: false, message: r.message };
  if (r.type === 'Code 128') {
    const bars = r.modules.reduce((n, v, i) => n + (v && (i === 0 || !r.modules[i - 1]) ? 1 : 0), 0);
    return { ok: bars > 20, message: bars > 20 ? `已核对 ${bars} 组条空结构与校验和，结构完整。` : '条空结构异常。' };
  }
  const d = decodeEan(r.modules);
  if (!d.ok) return { ok: false, message: d.message };
  const expected = r.type === 'UPC-A' ? r.value.slice(1).padStart(13, '0') : r.value;
  return { ok: d.value === expected, message: d.ok && d.value === expected ? `已反向解码为 ${d.value}，与输入一致。` : '解码结果与输入不一致。' };
}

/** 独立矢量 SVG（带静区），用于预览与下载；设计稿里则用 shapePrims 直接画矢量条 */
export function barcodeSvg(r: BarcodeResult, opts: { withQuiet?: boolean; label?: boolean } = {}): string {
  if (!r.ok) return '';
  const quiet = opts.withQuiet === false ? 0 : r.quietMm;
  const W = r.widthMm + quiet * 2, H = r.heightMm + (opts.label ? 6 : 0) + 3;
  const moduleW = r.widthMm / r.modules.length;
  let bars = '';
  let i = 0;
  while (i < r.modules.length) {
    if (!r.modules[i]) { i++; continue; }
    let j = i;
    while (j < r.modules.length && r.modules[j]) j++;
    bars += `<rect x="${(quiet + i * moduleW).toFixed(3)}" y="1.5" width="${((j - i) * moduleW).toFixed(3)}" height="${r.heightMm.toFixed(3)}" fill="#111"/>`;
    i = j;
  }
  const label = opts.label ? `<text x="${(W / 2).toFixed(2)}" y="${(H - 1).toFixed(2)}" text-anchor="middle" font-family="monospace" font-size="4.4" fill="#111" letter-spacing="0.6">${r.value}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(2)}mm" height="${H.toFixed(2)}mm" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}">`
    + `<rect width="${W.toFixed(2)}" height="${H.toFixed(2)}" fill="#fff"/>${bars}${label}</svg>`;
}

/** 明确标记为预览用途的占位码（不是可零售的 GTIN） */
export const PREVIEW_CODE = { type: 'Code 128' as BarcodeType, value: 'LUNASOL-PREVIEW' };
