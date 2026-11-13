/* ============================================================
 * 参考图真实处理（纯前端可计算，不伪造语义识别）
 * ------------------------------------------------------------
 *  - 校验格式（JPG/JPEG/PNG/WEBP）与大小
 *  - FileReader 转 data URL（真实持久化，非临时预览）
 *  - 读取自然尺寸与宽高比
 *  - Canvas 像素采样 + 量化聚类，提取主色 HEX
 * 注意：这里只能得到尺寸/颜色等客观信号，无法识别"结构/材质/工艺"，
 * 语义级分析由文本模型基于用户文字完成，并在报告中诚实标注。
 * ============================================================ */

export const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
/** 原始文件的保护上限：只防「几百 MB 的图把浏览器卡死」，不是业务上的大小限制。
 *  真正发出去之前会在本机压到长边 2048 / JPEG，通常 < 1MB，
 *  所以用户传 20MB 的原图也能正常用。 */
export const MAX_FILE_BYTES = 30 * 1024 * 1024;

export interface LoadedImageFile {
  dataUrl: string;
  naturalW: number;
  naturalH: number;
  ratio: number;
  dominantColors: string[];
}

/** 校验单个文件，返回错误文案；通过返回空串 */
export function validateImageFile(file: File): string {
  if (!ACCEPTED_TYPES.includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    return `「${file.name}」格式不支持，仅支持 JPG / PNG / WEBP`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `「${file.name}」超过 30MB，请先压缩或换一张`;
  }
  return '';
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error(`「${file.name}」读取失败`));
    fr.readAsDataURL(file);
  });
}

function loadHtmlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败，文件可能已损坏'));
    img.src = dataUrl;
  });
}

const toHex = (n: number) => n.toString(16).padStart(2, '0');

/**
 * Canvas 提取主色：缩放到 48px 采样，RGB 各量化到 32 色阶后聚类计数，
 * 过滤近白/近黑/低饱和像素，按频率取前 5，返回 HEX。
 */
export function extractDominantColors(img: HTMLImageElement, count = 5): string[] {
  const SAMPLE = 48;
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
  let pixels: ImageData;
  try {
    pixels = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
  } catch {
    return []; // 跨域污染等情况，如实返回空
  }

  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < pixels.data.length; i += 4) {
    const r = pixels.data[i];
    const g = pixels.data[i + 1];
    const b = pixels.data[i + 2];
    const a = pixels.data[i + 3];
    if (a < 128) continue; // 跳过透明像素
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // 过滤近白、近黑，保留有色彩信息量的像素
    const isNearWhite = r > 245 && g > 245 && b > 245;
    const isNearBlack = r < 12 && g < 12 && b < 12;
    if (isNearWhite || isNearBlack) continue;
    // 量化到 32 色阶（每通道 8 档）
    const qr = Math.round(r / 32) * 32;
    const qg = Math.round(g / 32) * 32;
    const qb = Math.round(b / 32) * 32;
    const key = `${qr},${qg},${qb}`;
    const cur = buckets.get(key);
    if (cur) cur.n += 1;
    else buckets.set(key, { r: qr, g: qg, b: qb, n: 1 });
  }

  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, count);
  return ranked.map((c) => `#${toHex(Math.min(255, c.r))}${toHex(Math.min(255, c.g))}${toHex(Math.min(255, c.b))}`);
}

/** 完整处理一个图片文件：校验 → data URL → 尺寸 → 主色 */
export async function processImageFile(file: File): Promise<LoadedImageFile> {
  const error = validateImageFile(file);
  if (error) throw new Error(error);
  const dataUrl = await readAsDataURL(file);
  const img = await loadHtmlImage(dataUrl);
  const dominantColors = extractDominantColors(img);
  return {
    dataUrl,
    naturalW: img.naturalWidth,
    naturalH: img.naturalHeight,
    ratio: img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1,
    dominantColors,
  };
}

export interface CompressedImage {
  dataUrl: string;
  width: number;
  height: number;
  /** data URL 的字符串长度，约等于实际请求体字节数 */
  bytes: number;
}

/**
 * 上传前在浏览器里压缩图片，替代「文件超过 4MB 就拒绝」的硬限制。
 *
 * 为什么必须压缩而不是把上限调大：图片以 base64 data URL 塞在 JSON body 里，
 * 体积会膨胀约 4/3；云函数 readJsonBody 有 6MB 请求体上限（网关也有自己的限制），
 * 4MB 的原图转完 base64 就已经 5.3MB，再加 prompt 等字段必撞上限，
 * 用户只会看到一句含糊的失败提示。压缩后单图通常 < 1MB，大图也能一次传完。
 *
 * 小图直接原样返回（不重新编码，避免 PNG 透明 / 画质损失）；
 * 大图缩长边 + JPEG，透明区域铺白底，避免转 JPEG 后变黑底。
 */
export async function compressImageForUpload(
  file: File,
  opts: { maxEdge?: number; quality?: number; maxBytes?: number } = {},
): Promise<CompressedImage> {
  if (!/^image\//.test(file.type)) throw new Error('NOT_IMAGE');
  if (file.size > MAX_FILE_BYTES) throw new Error('TOO_LARGE');

  const maxEdge = opts.maxEdge ?? 2048;
  const maxBytes = opts.maxBytes ?? 1.5 * 1024 * 1024;
  let quality = opts.quality ?? 0.86;

  const raw = await readAsDataURL(file);
  const img = await loadHtmlImage(raw);
  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;

  // 本来就小：原样保留，不做有损重编码
  if (raw.length <= maxBytes && Math.max(nw, nh) <= maxEdge) {
    return { dataUrl: raw, width: nw, height: nh, bytes: raw.length };
  }

  let scale = Math.min(1, maxEdge / Math.max(nw, nh));
  let out = raw;
  let w = nw;
  let h = nh;
  // 最多四轮：先降质量再降尺寸，直到低于目标体积
  for (let i = 0; i < 4; i += 1) {
    w = Math.max(1, Math.round(nw * scale));
    h = Math.max(1, Math.round(nh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    out = canvas.toDataURL('image/jpeg', quality);
    if (out.length <= maxBytes) break;
    quality = Math.max(0.5, quality - 0.12);
    scale *= 0.78;
  }
  return { dataUrl: out, width: w, height: h, bytes: out.length };
}
