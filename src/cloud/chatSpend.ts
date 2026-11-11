/* ============================================================
 * 对话模型「今日额度」记账（CloudBase PG）
 * ------------------------------------------------------------
 * 一张表一行 = 某人某天：
 *   lunasol_chat_spend(owner_id, day, cost_micro, calls)
 * cost_micro 用「微元」（1 元 = 1,000,000）存整数，避免浮点累加误差。
 *
 * 为什么按天存一行而不是写流水：额度只关心「今天花了多少」，
 * 一行 upsert 就够了，读写都便宜；流水另有 lunasol_credit_logs（积分口径，不是钱）。
 *
 * 记账时机 = 云函数返回成功之后（它带回本次真实 cost）。
 * 失败/取消不记：没花出去的钱不该占额度。
 * ============================================================ */
import { db } from './sdk';

export interface ChatSpendToday {
  /** 今日已花费（元） */
  costRmb: number;
  /** 今日调用次数 */
  calls: number;
}

/** 本地日期（YYYY-MM-DD）。数据库按 Asia/Shanghai 取日，前端只用它做展示判断。 */
export function localDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v) || 0;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const inner = o.value ?? o.total ?? o.cost_micro;
    if (inner !== undefined) return toNumber(inner);
  }
  return 0;
}

/** 读取今日累计花费。云端不可用 / 未登录时返回 null（调用方显示「统计中」，不假装是 0）。 */
export async function loadChatSpend(uid: string): Promise<ChatSpendToday | null> {
  if (!uid) return null;
  const d = await db();
  if (!d) return null;
  try {
    const r = await d.from('lunasol_chat_spend')
      .select('cost_micro,calls,day')
      .eq('owner_id', uid)
      .order('day', { ascending: false })
      .limit(1);
    if (!r || r.error) return null;
    const rows = (r.data || []) as { cost_micro?: number; calls?: number; day?: string }[];
    if (!rows.length) return { costRmb: 0, calls: 0 };
    const row = rows[0];
    // 只有当天的行才算今日额度；昨天那行不参与（按天重置）
    if (row.day && String(row.day).slice(0, 10) !== localDay()) return { costRmb: 0, calls: 0 };
    return { costRmb: toNumber(row.cost_micro) / 1e6, calls: Number(row.calls) || 0 };
  } catch {
    return null;
  }
}

/** 累加本次花费，返回今日累计（元）。失败返回 null，调用方保持原值。 */
export async function addChatSpend(uid: string, costRmb: number): Promise<number | null> {
  if (!uid) return null;
  const micro = Math.max(0, Math.round((Number(costRmb) || 0) * 1e6));
  if (micro <= 0) {
    const cur = await loadChatSpend(uid);
    return cur ? cur.costRmb : null;
  }
  const d = await db();
  if (!d) return null;

  // 首选数据库函数：一次 upsert 原子累加，多标签页并发也不会互相覆盖
  if (typeof d.rpc === 'function') {
    try {
      const r = await d.rpc('lunasol_add_chat_spend', { p_uid: uid, p_cost_micro: micro });
      if (!r.error) {
        const v = toNumber(r.data);
        if (v >= 0) return v / 1e6;
      }
    } catch { /* 落到读-改-写 */ }
  }

  // 兜底：函数未部署时直接读写的实现（并发下可能少记一次，不影响「额度大致用完」的判断）
  try {
    const cur = await loadChatSpend(uid);
    const base = cur?.costRmb || 0;
    const nextMicro = Math.round(base * 1e6) + micro;
    const row = {
      owner_id: uid,
      day: localDay(),
      cost_micro: nextMicro,
      calls: (cur?.calls || 0) + 1,
      updated_at: new Date().toISOString(),
    };
    const w = await d.from('lunasol_chat_spend').upsert(row, { onConflict: 'owner_id,day' });
    if (w && w.error) return null;
    return nextMicro / 1e6;
  } catch {
    return null;
  }
}
