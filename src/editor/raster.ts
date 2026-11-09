/* 图片/矢量素材处理：统一转成 PNG data URL，保证导出与 3D 预览都能用。
 * 直接用 SVG data URL 作为图片层会让 jsPDF 导出失败（它只认 PNG/JPEG），
 * 所以在插入画布前先栅格化一次。 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片读取失败，请换一张试试'));
    img.src = src;
  });
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/** 矢量 SVG → 透明底 PNG（size 为输出方图边长） */
export async function svgToPng(svg: string, size = 640): Promise<{ src: string; w: number; h: number }> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持画布，无法处理素材');
  ctx.drawImage(img, 0, 0, size, size);
  return { src: canvas.toDataURL('image/png'), w: size, h: size };
}

/** 位图统一转 PNG，并按最长边限制尺寸，避免超大照片撑爆存储 */
export async function normalizeBitmap(src: string, max = 1600): Promise<{ src: string; w: number; h: number }> {
  const img = await loadImage(src);
  let { width: w, height: h } = img;
  const scale = Math.min(1, max / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持画布，无法处理素材');
  ctx.drawImage(img, 0, 0, w, h);
  return { src: canvas.toDataURL('image/png'), w, h };
}

/** 上传文件 → 可插入画布的 PNG */
export async function fileToPng(file: File): Promise<{ src: string; w: number; h: number; name: string }> {
  const name = file.name.replace(/\.[^.]+$/, '') || '上传素材';
  const raw = await readAsDataUrl(file);
  if (/svg/i.test(file.type) || /\.svg$/i.test(file.name)) {
    const png = await svgToPng(raw, 720);
    return { ...png, name };
  }
  const png = await normalizeBitmap(raw);
  return { ...png, name };
}
