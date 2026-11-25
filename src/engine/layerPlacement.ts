/* ============================================================
   Seedream 5.5 图层还原 — 坐标映射
   ------------------------------------------------------------
   官方 bounding_box.absolute = [left, top, right, bottom]，
   单位是**输出底图的像素**，左上角为 (0,0)。

   这里只做一件事：把底图像素矩形映射到目标画布的毫米矩形。
   不读 DOM、不读 React、不猜随机位置，所以能直接单测。

   目标画布是「当前包装面板的 mm 视觉画布」，不是未经确认的
   包装成品尺寸。比例不一致时必须显式选 fit，绝不允许偷偷拉伸。
   ============================================================ */

export type LayerFit = 'contain' | 'cover' | 'stretch';

export interface PixelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface MmBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacementResult extends MmBox {
  /** 实际使用的等比缩放（stretch 时 x/y 不同，取几何平均仅用于展示） */
  scale: number;
  /** 目标画布之外被裁掉的部分（毫米），仅 cover 可能大于 0 */
  clipped: { left: number; top: number; right: number; bottom: number };
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** 校验并规整 bbox。越界不静默丢掉图层：夹回底图范围并报告 clipped。 */
export function normalizeBox(box: PixelBox, baseW: number, baseH: number): { box: PixelBox; clipped: boolean } {
  const W = Math.max(1, baseW);
  const H = Math.max(1, baseH);
  let left = Math.min(W, Math.max(0, box.left));
  let top = Math.min(H, Math.max(0, box.top));
  let right = Math.min(W, Math.max(0, box.right));
  let bottom = Math.min(H, Math.max(0, box.bottom));
  if (right <= left) right = Math.min(W, left + 1);
  if (bottom <= top) bottom = Math.min(H, top + 1);
  const clipped = box.left < 0 || box.top < 0 || box.right > W || box.bottom > H
    || right <= box.left || bottom <= box.top;
  return { box: { left, top, right, bottom }, clipped };
}

/**
 * 底图像素矩形 → 目标画布毫米矩形。
 *
 * 公式（官方语义）：
 *   scaleX = targetWidth / baseImageWidth
 *   scaleY = targetHeight / baseImageHeight
 *   x = left * scaleX
 *   y = top * scaleY
 *   width = (right - left) * scaleX
 *   height = (bottom - top) * scaleY
 *
 * stretch 直接用上面的公式；contain/cover 先把底图整体等比缩放进
 * 目标画布，再用**同一个**比例映射每个图层，保证图层之间相对位置不变。
 */
export function mapBoxToCanvas(
  box: PixelBox,
  baseW: number,
  baseH: number,
  targetW: number,
  targetH: number,
  fit: LayerFit = 'contain',
): PlacementResult {
  const bw = Math.max(1, baseW);
  const bh = Math.max(1, baseH);
  const tw = Math.max(1, targetW);
  const th = Math.max(1, targetH);

  let sx = tw / bw;
  let sy = th / bh;
  let offsetX = 0;
  let offsetY = 0;

  if (fit !== 'stretch') {
    const s = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
    sx = s;
    sy = s;
    offsetX = (tw - bw * s) / 2;
    offsetY = (th - bh * s) / 2;
  }

  const rawX = offsetX + box.left * sx;
  const rawY = offsetY + box.top * sy;
  const rawW = Math.max(0.01, (box.right - box.left) * sx);
  const rawH = Math.max(0.01, (box.bottom - box.top) * sy);

  // cover 时整体底图比画布大，边缘图层会超出画布。保留真实坐标，
  // 同时把超出量报给 UI，让用户知道这块在画布外而不是被“修正”到画布内。
  const clipped = {
    left: Math.max(0, -rawX),
    top: Math.max(0, -rawY),
    right: Math.max(0, rawX + rawW - tw),
    bottom: Math.max(0, rawY + rawH - th),
  };

  return {
    x: rawX,
    y: rawY,
    w: rawW,
    h: rawH,
    scale: Math.sqrt(sx * sy),
    clipped,
  };
}

/** 验收用：1000×1000 底图、bbox [200,100,600,500]、目标 200×200mm
 *  → x=40 / y=20 / w=80 / h=80mm。也覆盖非正方形与比例不一致的情况。 */
export function placementSelfCheck(): { ok: boolean; detail: string } {
  const r = mapBoxToCanvas({ left: 200, top: 100, right: 600, bottom: 500 }, 1000, 1000, 200, 200, 'stretch');
  const ok = Math.abs(r.x - 40) < 1e-9 && Math.abs(r.y - 20) < 1e-9
    && Math.abs(r.w - 80) < 1e-9 && Math.abs(r.h - 80) < 1e-9;
  return {
    ok,
    detail: `x=${r.x.toFixed(3)} y=${r.y.toFixed(3)} w=${r.w.toFixed(3)} h=${r.h.toFixed(3)}`,
  };
}

/** 毫米矩形 → 某个面的百分比坐标（Studio 画布用百分比存储）。
 *  这里与 frames.pctToMm 互为逆运算；不引用 frames，避免循环依赖。 */
export function mmBoxToPct(
  box: MmBox,
  panelW: number,
  panelH: number,
): { x: number; y: number; w: number; h: number } {
  const pw = Math.max(1, panelW);
  const ph = Math.max(1, panelH);
  return {
    x: (box.x / pw) * 100,
    y: (box.y / ph) * 100,
    w: (box.w / pw) * 100,
    h: (box.h / ph) * 100,
  };
}
