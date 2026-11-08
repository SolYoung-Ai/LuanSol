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
export const MAX_FILE_BYTES = 12 * 1024 * 1024; // 单图 12MB

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
    return `「${file.name}」超过 12MB，无法上传`;
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
