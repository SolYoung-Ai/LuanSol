/* ============================================================
 * 「用户取消」的统一信号
 * ------------------------------------------------------------
 * 对话与生图各自用 AbortController 掐掉 fetch，两边都需要把
 * 「用户主动取消」和「超时 / 网络错误」分开：
 *   · 取消  → 不写错误气泡、不扣积分，界面只留一条「已取消」
 *   · 超时  → 仍按失败处理，提示换个说法
 * 只看 AbortError 区分不出来（超时也是 AbortError），所以调用方
 * 会先把「用户取消」包装成 CancelledError 再抛出。
 * ============================================================ */

export class CancelledError extends Error {
  constructor(message = '已取消') {
    super(message);
    this.name = 'CancelledError';
  }
}

export function isCancelled(e: unknown): boolean {
  if (e instanceof CancelledError) return true;
  return typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError';
}

/** 把 fetch 的 AbortError 归一化成 CancelledError（只在「是用户点的取消」时调用） */
export function toCancelled(e: unknown): CancelledError {
  return e instanceof CancelledError ? e : new CancelledError();
}
