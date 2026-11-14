/* ============================================================
 * 支付入口（Creem Checkout）
 * ------------------------------------------------------------
 * 为什么不在前端拼结账链接：静态链接带不了用户身份，付款成功后
 * 无法判断该给哪个账号开通。这里让云函数用 Checkout API 动态建会话，
 * 把 uid 写进 metadata，Creem 的 webhook 回来时才能对上人。
 *
 * 云函数负责：来源白名单 / 登录态 / 代理令牌 / Creem 密钥 / 产品 ID 白名单。
 * 前端一条也不持有——这里只声明「买哪一档积分包」。
 * ============================================================ */
import { CLOUD } from './config';
import { tl } from '../langStore';

/** 纯积分制：只有一次性积分包，没有会员订阅。 */
export type PayKind = 'credits';

export type PayStart = { ok: true; url: string } | { ok: false; message: string };

/** 跳转前记下这次买的是什么：回跳后页面已经重载，只能靠本地标记分辨。 */
const KIND_KEY = 'lunasol.pay.kind';

export function markPayKind(kind: PayKind): void {
  try { sessionStorage.setItem(KIND_KEY, kind); } catch { /* 无痕模式忽略 */ }
}

export function lastPayKind(): PayKind {
  return 'credits';
}

export function clearPayKind(): void {
  try { sessionStorage.removeItem(KIND_KEY); } catch { /* 忽略 */ }
}

/** 创建结账会话并返回 Creem 收银台地址。uid 由调用方传入（云函数会做来源与令牌校验）。
 *  积分包要带 points：三档同价不同量，服务端按 points 查它自己的产品白名单——
 *  这里传的是「买哪一档」，不是「给我多少积分」，实际发放量由产品 ID 决定。 */
export async function startCheckout(opts: { uid: string; email?: string; name?: string; kind?: PayKind; points?: number }): Promise<PayStart> {
  const base = CLOUD.aiBaseUrl;
  if (!base) return { ok: false, message: tl('支付服务未配置，请先在账户页联系人工开通', 'Payments are not configured — contact us from the account page to activate manually') };
  const kind: PayKind = 'credits';
  try {
    const r = await fetch(`${base}/pay/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CLOUD.aiToken ? { 'X-LunaSol-Token': CLOUD.aiToken } : {}),
        'X-CloudBase-Uid': opts.uid,
      },
      body: JSON.stringify({
        email: opts.email || '',
        // 名字只用来预填收银台、给风控多一点信号，不参与开通判断
        name: opts.name || '',
        kind,
        ...(kind === 'credits' && opts.points ? { pack: opts.points } : {}),
      }),
    });
    const data = await r.json().catch(() => null) as { ok?: boolean; url?: string; error?: { message?: string } } | null;
    if (!r.ok || !data || !data.ok || !data.url) {
      return { ok: false, message: data?.error?.message || tl(`支付服务返回 ${r.status}，请稍后再试`, `Payment service returned ${r.status} — please try again later`) };
    }
    return { ok: true, url: String(data.url) };
  } catch {
    return { ok: false, message: tl('网络异常，暂时无法创建支付订单', 'Network problem — could not create the payment order') };
  }
}

/** 支付回跳识别：Creem 会带回 paid=1（我们自己的 success_url）或 checkout_id 等参数。
 *  注意站点是 hash 路由，查询串在 # 之后。 */
export function payReturnFlag(): { returned: boolean; paid: boolean } {
  if (typeof window === 'undefined') return { returned: false, paid: false };
  const h = window.location.hash || '';
  const q = h.includes('?') ? h.slice(h.indexOf('?') + 1) : (window.location.search || '').replace(/^\?/, '');
  const sp = new URLSearchParams(q);
  const returned = sp.has('paid') || sp.has('checkout_id') || sp.has('subscription_id');
  return { returned, paid: sp.get('paid') === '1' || sp.has('checkout_id') };
}

/** 清掉地址栏里的支付参数，避免刷新时反复提示「正在确认」。
 *  两个位置都要清：本站正常是 hash 里的 `#/credits?paid=1`，但有些渠道会把
 *  参数放在 `#` 之前（location.search）。只清 hash 的话，location.search 里那份
 *  会一直跟着页面走，用户每次刷新/返回都会重新触发「正在确认积分到账…」。 */
export function clearPayReturnFlag(): void {
  if (typeof window === 'undefined') return;
  const drop = ['paid', 'checkout_id', 'subscription_id', 'order_id', 'status'];
  const h = window.location.hash || '';
  let nextHash = h;
  const qi = h.indexOf('?');
  if (qi >= 0) {
    const sp = new URLSearchParams(h.slice(qi + 1));
    drop.forEach((k) => sp.delete(k));
    const rest = sp.toString();
    nextHash = h.slice(0, qi) + (rest ? `?${rest}` : '');
  }
  const usp = new URLSearchParams(window.location.search);
  drop.forEach((k) => usp.delete(k));
  const nextSearch = usp.toString() ? `?${usp.toString()}` : '';
  if (nextHash === h && nextSearch === window.location.search) return;
  window.history.replaceState(null, '', `${window.location.pathname}${nextSearch}${nextHash}`);
}

/* ------------------------------------------------------------------
 * 付款前余额快照 + 「待确认」标记
 * -----------------------------------------------------------------
 * 回跳时页面已经整页重载，内存里的东西全没了，只有 sessionStorage 跨得过
 * 这一次跳转（同标签页、同源）。
 *  - baseline：付款前的余额。回跳后余额涨了 = 到账，比「近 15 分钟有充值记录」
 *    可靠得多——用户完全可能过半小时才回到这页。
 *  - pending：还没确认完的付款。地址栏参数会被立刻清掉，靠它记住「这单要确认」，
 *    这样未登录先去登录、或者中途刷新，回来还能继续确认。
 * ------------------------------------------------------------------ */
const BASE_KEY = 'lunasol.pay.baseline';
const PENDING_KEY = 'lunasol.pay.pending';

export type PayBaseline = { at: number; left: number | null };

export function markPayBaseline(left: number | null): void {
  try { sessionStorage.setItem(BASE_KEY, JSON.stringify({ at: Date.now(), left })); } catch { /* 忽略 */ }
}

export function readPayBaseline(): PayBaseline | null {
  try {
    const raw = sessionStorage.getItem(BASE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { at?: unknown; left?: unknown };
    if (typeof v?.at !== 'number') return null;
    return { at: v.at, left: typeof v.left === 'number' ? v.left : null };
  } catch { return null; }
}

export function clearPayBaseline(): void {
  try { sessionStorage.removeItem(BASE_KEY); } catch { /* 忽略 */ }
}

export function markPayPending(): void {
  try { sessionStorage.setItem(PENDING_KEY, String(Date.now())); } catch { /* 忽略 */ }
}

/** 超过 1 小时的待确认记录直接丢弃：那种情况下早就该用明细对账了 */
export function readPayPending(): number | null {
  try {
    const raw = Number(sessionStorage.getItem(PENDING_KEY) || 0);
    if (!raw) return null;
    if (Date.now() - raw > 60 * 60 * 1000) { sessionStorage.removeItem(PENDING_KEY); return null; }
    return raw;
  } catch { return null; }
}

export function clearPayPending(): void {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* 忽略 */ }
}
