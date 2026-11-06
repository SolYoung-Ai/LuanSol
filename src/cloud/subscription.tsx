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
import { PaywallModal } from '../components/PaywallModal';

export type Plan = 'free' | 'pro_monthly';
export type SubStatus = 'none' | 'active';

export interface Subscription {
  id: string;
  owner_id: string;
  plan: Plan;
  status: SubStatus;
  quota_total: number;
  quota_used: number;
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
        if (typeof v === 'number') return v;
      }
    }
  } catch { /* 落到兜底实现 */ }
  const cur = await getSubscription(uid);
  const base = cur.ok ? cur.data : await ensureSubscription(uid);
  const next = Math.min(base.quota_total, base.quota_used + n);
  try { await d.from(TABLE).update({ quota_used: next, updated_at: new Date().toISOString() }).eq('id', uid); } catch { /* 忽略 */ }
  return next;
}

/** 占位开通：当前用激活码，后续替换为支付成功回调。 */
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
  setPaywall: (open: boolean, reason?: string) => void;
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
      if (!u) { requestLogin?.(); return { ok: false, reason: '请先登录后再使用 AI 功能', need: 'login' }; }
      // 订阅还没加载出来就先等它加载完，否则会在计量窗口内白送调用
      if (!subRef.current && loadPromiseRef.current) { try { await loadPromiseRef.current; } catch { /* 忽略 */ } }
      const s = subRef.current;
      if (!s) return { ok: true }; // 确实没有订阅信息时放行，加载后开始计量
      if (remainingOf(s) > 0) return { ok: true };
      const reason = isProActive(s)
        ? '会员额度已用完或已过期，请续费后继续'
        : `免费体验已用完（${FREE_TRIAL} 次），订阅会员即可每月使用 ${PRO_QUOTA} 次 AI`;
      setPaywallReason(reason); setPaywallOpen(true);
      return { ok: false, reason, need: 'subscribe' };
    });
    registerAIReporter(() => {
      const u = userRef.current; if (!u) return;
      void recordUsage(u.id, 1).then((next) => { if (next >= 0) setSub((prev) => (prev ? { ...prev, quota_used: next } : prev)); });
    });
    return () => { registerAIGate(null); registerAIReporter(null); };
  }, [metered, requestLogin]);

  const activate = useCallback(async (code: string): Promise<{ ok: boolean; message: string }> => {
    const u = auth.user;
    if (!u) return { ok: false, message: '请先登录后再开通会员' };
    if (!sdkUsable()) return { ok: false, message: '当前构建未接入云服务，无法开通（请在正式站点操作）' };
    const r = await activatePlan(u.id, 'pro_monthly', 1, 'activation-code');
    if (r.ok) { setSub(r.data); setPaywallOpen(false); setToast('已开通会员，去尽情使用 AI 吧'); return { ok: true, message: '会员已开通' }; }
    return { ok: false, message: r.message };
  }, [auth.user, setToast]);

  const setPaywall = useCallback((open: boolean, reason?: string) => {
    setPaywallOpen(open);
    if (reason) setPaywallReason(reason);
  }, []);

  const usedLeft = metered ? remainingOf(sub) : null;
  const isPro = isProActive(sub);

  const value = useMemo<SubCtx>(() => ({
    sub, loading, metered, usedLeft, isPro, refresh, activate, paywallOpen, paywallReason, setPaywall,
  }), [sub, loading, metered, usedLeft, isPro, refresh, activate, paywallOpen, paywallReason, setPaywall]);

  return <Ctx.Provider value={value}>
    {children}
    <PaywallModal open={paywallOpen} reason={paywallReason} onClose={() => setPaywall(false)} onActivate={activate} />
  </Ctx.Provider>;
}
