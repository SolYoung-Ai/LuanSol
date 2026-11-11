/* ============================================================
 * 支付入口（Creem Checkout）
 * ------------------------------------------------------------
 * 为什么不在前端拼结账链接：静态链接带不了用户身份，付款成功后
 * 无法判断该给哪个账号开通。这里让云函数用 Checkout API 动态建会话，
 * 把 uid 写进 metadata，Creem 的 webhook 回来时才能对上人。
 *
 * 云函数负责：来源白名单 / 登录态 / 代理令牌 / Creem 密钥 / 产品 ID 白名单。
 * 前端一条也不持有——这里只声明「买会员还是买积分包」。
 * ============================================================ */
import { CLOUD } from './config';

/** 买什么：会员订阅（pro）还是一次性积分包（credits）。 */
export type PayKind = 'pro' | 'credits';

export type PayStart = { ok: true; url: string } | { ok: false; message: string };

/** 跳转前记下这次买的是什么：回跳后页面已经重载，只能靠本地标记分辨。 */
const KIND_KEY = 'lunasol.pay.kind';

export function markPayKind(kind: PayKind): void {
  try { sessionStorage.setItem(KIND_KEY, kind); } catch { /* 无痕模式忽略 */ }
}

export function lastPayKind(): PayKind {
  try { return sessionStorage.getItem(KIND_KEY) === 'credits' ? 'credits' : 'pro'; } catch { return 'pro'; }
}

export function clearPayKind(): void {
  try { sessionStorage.removeItem(KIND_KEY); } catch { /* 忽略 */ }
}

/** 创建结账会话并返回 Creem 收银台地址。uid 由调用方传入（云函数会做来源与令牌校验）。 */
export async function startCheckout(opts: { uid: string; email?: string; kind?: PayKind }): Promise<PayStart> {
  const base = CLOUD.aiBaseUrl;
  if (!base) return { ok: false, message: '支付服务未配置，请先在账户页联系人工开通' };
  try {
    const r = await fetch(`${base}/pay/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CLOUD.aiToken ? { 'X-LunaSol-Token': CLOUD.aiToken } : {}),
        'X-CloudBase-Uid': opts.uid,
      },
      body: JSON.stringify({ email: opts.email || '', kind: opts.kind || 'pro' }),
    });
    const data = await r.json().catch(() => null) as { ok?: boolean; url?: string; error?: { message?: string } } | null;
    if (!r.ok || !data || !data.ok || !data.url) {
      return { ok: false, message: data?.error?.message || `支付服务返回 ${r.status}，请稍后再试` };
    }
    return { ok: true, url: String(data.url) };
  } catch {
    return { ok: false, message: '网络异常，暂时无法创建支付订单' };
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

/** 清掉地址栏里的支付参数，避免刷新时反复提示「正在确认」 */
export function clearPayReturnFlag(): void {
  if (typeof window === 'undefined') return;
  const h = window.location.hash || '';
  const qi = h.indexOf('?');
  if (qi < 0) return;
  const next = `${h.slice(0, qi)}${h.slice(qi).replace(/\?.*$/, '')}`;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${next}`);
}
