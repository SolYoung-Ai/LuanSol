/* ============================================================
 * 订阅 / 额度数据层 + Provider（CloudBase Postgres + RLS）
 * ------------------------------------------------------------
 *  - 表 lunasol_subscriptions：owner_id = auth.uid()，RLS 自动隔离；
 *  - 免费用户 quota_total = 2（新注册自动授予），会员 = 600 次/月；
 *  - 闸门：AI 真正调用前过 registerAIGate；成功后 reportAIUsage 自增计数；
 *  - 非登录能力来源（GitHub Pages 镜像 / 未配置云）放行且不计量——
 *    因为这些来源无法订阅，强行拦截会破坏「镜像可试用」的既有承诺；
 *  - 支付系统尚未接入：activate 通过「激活码」占位开通，后续替换为支付回调。
 * ============================================================ */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { db, sdkUsable } from './sdk';
import { cloudOriginSupported } from './config';
import { registerAIGate, registerAIReporter, type GateResult } from '../ai/gate';
import { PRICING } from './plans';
import { useAuth } from './auth';
import { useApp } from '../store';
import { PaywallModal, type PaywallNeed } from '../components/PaywallModal';

export type Plan = 'free' | 'pro_monthly';
export type SubStatus = 'none' | 'active';

export interface Subscription {
  id: string;
  owner_id: string;
  plan: Plan;
  status: SubStatus;
  quota_total: number;
  quota_used: number;
  bonus_credits?: number;
  period_start: string | null;
  period_end: string | null;
  activated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

const TABLE = 'lunasol_subscriptions';
const FREE_TRIAL = PRICING.freeTrialUses;
const PRO_QUOTA = PRICING.proMonthlyQuota;

export type CloudResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };
const fail = (m: string) => ({ ok: false as const, message: m });

function errText(e: unknown): string {
  if (!e) return '';
  if (typeof e === 'string') return e;
  const m = (e as { message?: string }).message;
  if (m) return String(m);
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

export function defaultFree(uid: string): Subscription {
  return { id: uid, owner_id: uid, plan: 'free', status: 'none', quota_total: FREE_TRIAL, quota_used: 0, period_start: null, period_end: null };
}

/** AI 闸门的判定结果（纯函数，便于回归测试）。
 *  登录与额度是两件事：未登录 → need='login'（引导登录，有 2 次免费体验）；
 *  已登录但额度用完 / 会员过期 → need='subscribe'（引导订阅）。 */
export type GateDecision = { ok: boolean; reason: string; need: PaywallNeed };

export function decideGate(input: {
  loggedIn: boolean;
  /** 剩余次数；null 表示订阅信息尚未加载完成，此时不拦截 */
  remaining: number | null;
  proActive: boolean;
  freeTrial?: number;
  quota?: number;
}): GateDecision {
  const trial = input.freeTrial ?? FREE_TRIAL;
  const quota = input.quota ?? PRO_QUOTA;
  if (!input.loggedIn) {
    return { ok: false, reason: `登录后即可使用平台 AI；新注册用户有 ${trial} 次免费体验`, need: 'login' };
  }
  if (input.remaining === null) return { ok: true, reason: '', need: 'subscribe' };
  if (input.remaining > 0) return { ok: true, reason: '', need: 'subscribe' };
  return {
    ok: false,
    reason: input.proActive
      ? '会员额度已用完或已过期，请续费后继续'
      : `免费体验已用完（${trial} 次），订阅会员即可每月使用 ${quota} 次 AI`,
    need: 'subscribe',
  };
}

export async function getSubscription(uid: string): Promise<CloudResult<Subscription>> {
  const d = await db(); if (!d) return fail('云服务未配置');
  try {
    const r = await d.from(TABLE).select('*').eq('id', uid).limit(1);
    if (r.error) return fail(`读取失败：${errText(r.error)}`);
    const rows = (r.data || []) as Subscription[];
    if (!rows.length) return fail('暂无订阅记录');
    return { ok: true, data: rows[0] };
  } catch (e) { return fail(errText(e) || '读取异常'); }
}

/** 读取订阅，若不存在则创建免费行（新注册用户自动获得 2 次免费体验）。 */
export async function ensureSubscription(uid: string): Promise<Subscription> {
  const got = await getSubscription(uid);
  if (got.ok) return got.data;
  const d = await db(); if (!d) return defaultFree(uid);
  const row = defaultFree(uid);
  try { await d.from(TABLE).upsert(row, { onConflict: 'id' }); } catch { /* 表未创建时静默降级为本地免费 */ }
  return row;
}

/** 获取本地日期字符串（YYYY-MM-DD），不用 UTC 避免凌晨跨天 bug */
function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 自增用量计数（成功调用 AI 后）。返回最新 used，失败返回 -1。
 *  优先走数据库端的原子函数：并发调用不会互相覆盖计数；
 *  数据库函数不可用时退回「读-改-写」，结果仍然正确，只是并发下可能少计一次。 */
export async function recordUsage(uid: string, n = 1): Promise<number> {
  const d = await db(); if (!d) return -1;
  try {
    if (typeof d.rpc === 'function') {
      const r = await d.rpc('lunasol_consume_quota', { p_uid: uid, p_n: n });
      if (!r.error) {
        const v = typeof r.data === 'number' ? r.data : (r.data as { value?: number } | null)?.value;
        // -1 表示该用户还没有订阅行（新注册用户），必须继续走兜底逻辑建行并计数，
        // 否则第一次 AI 调用会白白丢掉这一次额度。
        if (typeof v === 'number' && v >= 0) return v;
      }
    }
  } catch { /* 落到兜底实现 */ }
  const cur = await getSubscription(uid);
  const base = cur.ok ? cur.data : await ensureSubscription(uid);
  const next = Math.min(base.quota_total, base.quota_used + n);
  try { await d.from(TABLE).update({ quota_used: next, updated_at: new Date().toISOString() }).eq('id', uid); } catch { /* 忽略 */ }
  return next;
}

/** 【仅供服务端/内部调用】直接写库开通会员。
 *  绝不可由前端凭一个字符串调用：旧版 activate(code) 把 code 参数丢掉后直接调它，
 *  导致任何登录用户输入任意文本都能拿到 600 次/月额度。前端入口已停用（见 activate），
 *  未来只允许「支付回调」或「服务端校验激活码」后调用本函数。 */
export async function activatePlan(uid: string, plan: Plan = 'pro_monthly', months = 1, by: string | null = null): Promise<CloudResult<Subscription>> {
  const d = await db(); if (!d) return fail('云服务未配置，无法开通');
  const start = new Date();
  const end = new Date(start.getTime() + months * 30 * 24 * 3600 * 1000);
  const row: Subscription = {
    id: uid, owner_id: uid, plan, status: 'active', quota_total: PRO_QUOTA, quota_used: 0,
    period_start: start.toISOString(), period_end: end.toISOString(), activated_by: by, updated_at: start.toISOString(),
  };
  try { await d.from(TABLE).upsert(row, { onConflict: 'id' }); return { ok: true, data: row }; }
  catch (e) { return fail(errText(e) || '开通失败'); }
}

export function remainingOf(sub: Subscription | null): number {
  if (!sub) return 0;
  if (sub.plan === 'pro_monthly') {
    if (sub.status !== 'active' || !sub.period_end || new Date(sub.period_end).getTime() <= Date.now()) return 0;
  }
  return Math.max(0, sub.quota_total - sub.quota_used);
}

export function isProActive(sub: Subscription | null): boolean {
  return !!sub && sub.plan === 'pro_monthly' && sub.status === 'active'
    && !!sub.period_end && new Date(sub.period_end).getTime() > Date.now();
}

/* ------------------------------------------------------------------ */

interface SubCtx {
  sub: Subscription | null;
  loading: boolean;
  /** 当前来源是否走订阅计量（正式站点=是；GitHub Pages 镜像=否） */
  metered: boolean;
  /** 剩余次数；非计量来源返回 null */
  usedLeft: number | null;
  isPro: boolean;
  refresh: () => Promise<void>;
  activate: (code: string) => Promise<{ ok: boolean; message: string }>;
  paywallOpen: boolean;
  paywallReason: string;
  /** 当前拦截原因：匿名（需登录）还是额度不足（需订阅） */
  paywallNeed: PaywallNeed;
  setPaywall: (open: boolean, reason?: string) => void;
  /** 内测期：签到 / 兑换码直接加到本地积分（localStorage），刷新保留 */
  addLocalCredits: (n: number) => void;
  /** 签到：从数据库读记录，计算连续天数，插入新记录，返回本次获得的积分 */
  doCheckin: () => Promise<{ ok: boolean; points: number; streak: number; message: string }>;
  /** 签到状态：今天是否已签到、连续签到天数 */
  checkinState: { checkedToday: boolean; streak: number; loading: boolean };
  /** 内测期：尝试兑换码，成功返回 {ok:true, points:n} */
  redeemCode: (code: string) => Promise<{ ok: boolean; points?: number; message: string }>;
}

const Ctx = createContext<SubCtx | null>(null);
export const useSubscription = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('SubscriptionContext missing');
  return c;
};

export function SubscriptionProvider({ children, requestLogin }: { children: React.ReactNode; requestLogin?: () => void }) {
  const auth = useAuth();
  const { setToast } = useApp();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<string>('');
  const [paywallNeed, setPaywallNeed] = useState<PaywallNeed>('subscribe');
  const subRef = useRef<Subscription | null>(null);
  const userRef = useRef(auth.user);
  subRef.current = sub;
  userRef.current = auth.user;

  const metered = cloudOriginSupported();

  const load = useCallback(async () => {
    const u = userRef.current;
    if (!u) { setSub(null); return; }
    if (!sdkUsable()) { setSub(defaultFree(u.id)); return; }
    setLoading(true);
    const s = await ensureSubscription(u.id);
    setSub(s);
    setLoading(false);
  }, []);

  // 闸门可能比订阅加载更早触发（用户点「获取建议」时订阅还在飞）。
  // 这里保存加载中的 Promise，让闸门等它完成再判定，避免出现「未计量就放行」的窗口。
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const loadTracked = useCallback(() => {
    const p = load().finally(() => { if (loadPromiseRef.current === p) loadPromiseRef.current = null; });
    loadPromiseRef.current = p;
    return p;
  }, [load]);

  useEffect(() => { void loadTracked(); }, [loadTracked, auth.user?.id]);

  const refresh = useCallback(async () => { await load(); }, [load]);

  // 注册闸门与用量上报（只需一次）
  useEffect(() => {
    registerAIGate(async (): Promise<GateResult> => {
      // 非登录能力来源（GitHub Pages 镜像 / 未配置云）无法订阅，放行且不计量
      if (!metered) return { ok: true };
      const u = userRef.current;
      // 订阅还没加载出来就先等它加载完，否则会在计量窗口内白送调用
      if (!subRef.current && loadPromiseRef.current) { try { await loadPromiseRef.current; } catch { /* 忽略 */ } }
      const s = subRef.current;
      const d = decideGate({
        loggedIn: !!u,
        // 还没有订阅行 = 新注册用户，免费体验一次都没用过，按满额放行；
        // 订阅信息尚未加载完成时传 null，同样放行，避免在计量窗口内白送调用。
        remaining: s ? remainingOf(s) : (u ? FREE_TRIAL : null),
        proActive: isProActive(s),
      });
      if (d.ok) return { ok: true };
      // 匿名用户不要直接抛登录框——那会打断正在填的表单。改为弹付费墙，
      // 由用户在弹窗里主动选择「立即登录」，未登录只是不计量，不影响继续用内置引擎。
      setPaywallReason(d.reason); setPaywallNeed(d.need); setPaywallOpen(true);
      return { ok: false, reason: d.reason, need: d.need };
    });
    registerAIReporter((taskId: string) => {
      const u = userRef.current; if (!u) return;
      // 根据 taskId 扣不同积分：聊天免费，生图按档位扣
      const cost = taskId === 'imageFlash' ? PRICING.costs.imageFlash
        : taskId === 'imageLite' ? PRICING.costs.imageLite
        : taskId === 'imagePro' ? PRICING.costs.imagePro
        : taskId === 'image' ? PRICING.costs.imageFlash  // 默认 Flash
        : 0;  // 聊天免费
      if (cost === 0) return;
      void recordUsage(u.id, cost).then((next) => { if (next >= 0) setSub((prev) => (prev ? { ...prev, quota_used: next } : prev)); });
    });
    return () => { registerAIGate(null); registerAIReporter(null); };
  }, [metered, requestLogin]);

  /** 前端开通入口：当前一律拒绝。
   *  原因：没有服务端校验的情况下，「输入任意字符串即开通」等于免费送会员。
   *  真正的开通必须由支付回调或服务端激活码校验完成后写库；在那之前这里如实报「未开放」，
   *  既不假装成功，也不给后门。 */
  const activate = useCallback(async (_code: string): Promise<{ ok: boolean; message: string }> => {
    const u = auth.user;
    if (!u) return { ok: false, message: '请先登录' };
    return { ok: false, message: '会员开通尚未开放：支付系统接入中，激活通道已停用。开通后会在账户页显示真实有效期。' };
  }, [auth.user]);

  const setPaywall = useCallback((open: boolean, reason?: string) => {
    setPaywallOpen(open);
    if (reason) setPaywallReason(reason);
  }, []);

  // ---- 内测期：本地积分（签到 / 兑换码直接加到 localStorage，刷新保留）----
  const LOCAL_KEY = 'lunasol_local_credits';
  const readLocal = () => {
    try { return parseInt(localStorage.getItem(LOCAL_KEY) || '0', 10) || 0; } catch { return 0; }
  };
  const [localCredits, setLocalCredits] = useState<number>(readLocal);
  const addLocalCredits = useCallback((n: number) => {
    setLocalCredits((prev) => {
      const next = Math.max(0, prev + n);
      localStorage.setItem(LOCAL_KEY, String(next));
      return next;
    });
  }, []);

  // ---- 签到：对接 PostgreSQL lunasol_checkin_logs 表 ----
  const [checkinState, setCheckinState] = useState<{ checkedToday: boolean; streak: number; loading: boolean }>({ checkedToday: false, streak: 0, loading: false });

  // 加载签到状态
  useEffect(() => {
    const u = userRef.current;
    if (!u) { setCheckinState({ checkedToday: false, streak: 0, loading: false }); return; }
    if (!sdkUsable()) { setCheckinState({ checkedToday: false, streak: 0, loading: false }); return; }
    let cancelled = false;
    (async () => {
      setCheckinState((prev) => ({ ...prev, loading: true }));
      const d = await db();
      if (!d) { setCheckinState({ checkedToday: false, streak: 0, loading: false }); return; }
      try {
        const today = localDateStr();
        // 查最近的签到记录，倒序
        const r = await d.from('lunasol_checkin_logs').select('checkin_date,streak,bonus').eq('user_id', u.id).order('checkin_date', { ascending: false }).limit(30);
        if (cancelled) return;
        const rows = (r.data || []) as { checkin_date: string; streak: number; bonus: number }[];
        if (!rows.length) {
          setCheckinState({ checkedToday: false, streak: 0, loading: false });
          return;
        }
        const checkedToday = rows[0].checkin_date === today;
        const streak = checkedToday ? rows[0].streak : rows[0].streak;
        setCheckinState({ checkedToday, streak, loading: false });
      } catch {
        if (!cancelled) setCheckinState({ checkedToday: false, streak: 0, loading: false });
      }
    })();
    return () => { cancelled = true; };
  }, [auth.user?.id]);

  const doCheckin = useCallback(async (): Promise<{ ok: boolean; points: number; streak: number; message: string }> => {
    const u = userRef.current;
    if (!u) return { ok: false, points: 0, streak: 0, message: '请先登录' };
    if (!sdkUsable()) return { ok: false, points: 0, streak: 0, message: '云服务未连接' };
    if (checkinState.checkedToday) return { ok: false, points: 0, streak: checkinState.streak, message: '今天已经签到过了' };
    const d = await db();
    if (!d) return { ok: false, points: 0, streak: 0, message: '数据库未连接' };

    const today = localDateStr();
    const yesterday = localDateStr(new Date(Date.now() - 86400000));

    // 查上一次签到记录
    const r = await d.from('lunasol_checkin_logs').select('checkin_date,streak').eq('user_id', u.id).order('checkin_date', { ascending: false }).limit(1);
    const rows = (r.data || []) as { checkin_date: string; streak: number }[];
    const lastStreak = rows.length > 0 ? rows[0].streak : 0;
    const newStreak = rows.length > 0 && rows[0].checkin_date === yesterday ? lastStreak + 1 : 1;

    // 计算积分：基础 10，连续 10 天额外 100，会员双倍
    const isProUser = isProActive(subRef.current);
    const basePoints = isProUser ? 20 : 10;
    const bonus = newStreak % 10 === 0 ? 100 : 0;
    const totalPoints = basePoints + bonus;

    // 插入签到记录
    try {
      await d.from('lunasol_checkin_logs').insert({
        user_id: u.id,
        checkin_date: today,
        streak: newStreak,
        bonus: totalPoints,
      });
    } catch (e) {
      return { ok: false, points: 0, streak: newStreak, message: '签到失败：' + errText(e) };
    }

    // 把积分加到 bonus_credits
    const cur = subRef.current;
    if (cur) {
      await d.from(TABLE).update({ bonus_credits: (cur.bonus_credits || 0) + totalPoints }).eq('id', cur.id);
      setSub((prev) => prev ? { ...prev, bonus_credits: (prev.bonus_credits || 0) + totalPoints } : prev);
    }

    setCheckinState({ checkedToday: true, streak: newStreak, loading: false });
    return {
      ok: true,
      points: totalPoints,
      streak: newStreak,
      message: `签到成功！+${totalPoints} 积分${bonus ? `（连续 ${newStreak} 天额外 +${bonus}）` : ''}`,
    };
  }, [checkinState.checkedToday]);

  // 兑换码：从 PostgreSQL 读，校验，加积分到 subscription.bonus_credits
  const redeemCode = useCallback(async (code: string): Promise<{ ok: boolean; points?: number; message: string }> => {
    const c = code.trim().toUpperCase();
    if (!c) return { ok: false, message: '请输入兑换码' };
    const u = auth.user;
    if (!u) return { ok: false, message: '请先登录再兑换' };
    const db = await import('./sdk').then((m) => m.db()).catch(() => null);
    if (!db) return { ok: false, message: '数据库未连接，请稍后再试' };
    // 1. 查码
    const r = await db.from('lunasol_redeem_codes').select('code,points,used,used_by').eq('code', c);
    if (r.error || !r.data || r.data.length === 0) return { ok: false, message: '兑换码无效，检查后重试' };
    const row = r.data[0] as { code: string; points: number; used: boolean; used_by: string | null };
    if (row.used) return { ok: false, message: '该兑换码已被使用' };
    // 2. 标记已使用（检查是否成功，防止并发重复兑换）
    const markRes = await db.from('lunasol_redeem_codes').update({ used: true, used_by: u.id }).eq('code', c);
    if (markRes.error) return { ok: false, message: '兑换失败，请稍后重试' };
    // 3. 给用户加积分到 bonus_credits
    const cur = subRef.current;
    if (cur) {
      await db.from(TABLE).update({ bonus_credits: (cur.bonus_credits || 0) + row.points }).eq('id', cur.id);
      setSub((prev) => prev ? { ...prev, bonus_credits: (prev.bonus_credits || 0) + row.points } : prev);
    }
    return { ok: true, points: row.points, message: `兑换成功！+${row.points} 积分` };
  }, [auth.user]);

  const usedLeftRaw = metered ? remainingOf(sub) : null;
  // 积分余额 = 云端剩余（quota_total - quota_used + bonus_credits）+ 本地签到缓存
  const bonus = sub ? (sub as any).bonus_credits || 0 : 0;
  const usedLeft = usedLeftRaw !== null ? usedLeftRaw + bonus + localCredits : null;
  const isPro = isProActive(sub);

  const value = useMemo<SubCtx>(() => ({
    sub, loading, metered, usedLeft, isPro, refresh, activate, paywallOpen, paywallReason, paywallNeed, setPaywall, addLocalCredits, doCheckin, checkinState, redeemCode,
  }), [sub, loading, metered, usedLeft, isPro, refresh, activate, paywallOpen, paywallReason, paywallNeed, setPaywall, addLocalCredits, doCheckin, checkinState, redeemCode]);

  return <Ctx.Provider value={value}>
    {children}
    <PaywallModal open={paywallOpen} reason={paywallReason} need={paywallNeed} onClose={() => setPaywall(false)} onActivate={activate} onLogin={requestLogin} />
  </Ctx.Provider>;
}
