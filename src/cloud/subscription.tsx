/* ============================================================
 * 积分数据层 + Provider（CloudBase Postgres + RLS）
 * ------------------------------------------------------------
 *  纯积分制（2026-11-14 起）：全站没有会员 / 订阅 / 有效期 / 续费。
 *  用户只需要理解一个数字——积分余额，用一次扣几分，不够就买积分包。
 *
 *  - 表 lunasol_subscriptions 继续当积分账本用，owner_id = auth.uid()，RLS 隔离；
 *    plan / status / period_* / activated_by 是历史字段，代码不再读写；
 *  - 余额 = max(0, quota_total - quota_used) + bonus_credits。
 *    quota_total / quota_used 只记「新注册赠送」这一桶，签到 / 兑换码 / 积分包
 *    一律落 bonus_credits；扣减顺序见 lunasol_consume_quota；
 *  - 全部能力（模型 / 云端同步 / 印刷级导出 / 历史版本）登录后即可用，
 *    不再设权限位；生图按档位扣积分，是唯一的变现点；
 *  - 闸门：AI 调用前过 registerAIGate，只看「是否登录 + 总余额是否 > 0」；
 *  - 非计量来源（GitHub Pages 镜像 / 未配置云）放行且不计量，保持「镜像可试用」。
 * ============================================================ */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { tl } from '../langStore';
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
 *  纯积分制只有两种拦截：未登录 → need='login'；积分用尽 → need='credits'。
 *  没有会员状态，也没有「订阅」这个动作。 */
export type GateDecision = { ok: boolean; reason: string; need: PaywallNeed };

export function decideGate(input: {
  loggedIn: boolean;
  /** 总积分余额；null 表示账本尚未加载完成，此时不拦截 */
  remaining: number | null;
  freeTrial?: number;
}): GateDecision {
  const trial = input.freeTrial ?? FREE_TRIAL;
  if (!input.loggedIn) {
    return { ok: false, reason: tl(`登录后即可使用平台 AI；新注册用户有 ${trial} 积分免费体验`, `Sign in to use platform AI — new accounts get ${trial} credits to try it`), need: 'login' };
  }
  // 账本还没到 / 正在加载，先放行，避免首屏把正常用户拦在门外
  if (input.remaining === null) return { ok: true, reason: '', need: 'credits' };
  if (input.remaining > 0) return { ok: true, reason: '', need: 'credits' };
  return {
    ok: false,
    reason: tl('积分不足，购买积分包或每日签到后即可继续使用', 'Out of credits — buy a credit pack or check in daily to continue'),
    need: 'credits',
  };
}

export async function getSubscription(uid: string): Promise<CloudResult<Subscription>> {
  const d = await db(); if (!d) return fail('云服务未配置');
  try {
    const r = await d.from(TABLE).select('*').eq('id', uid).limit(1);
    if (!r) return fail('读取失败：返回空结果');
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

/** 把数据库返回的 date / timestamptz 统一成 YYYY-MM-DD。
 *  date 列直接返回 "2026-11-10"；timestamptz 会返回带时区的 ISO 串，
 *  那种情况必须先转 Date 再取本地日期，否则会算错一天（跨天签到的老 bug）。 */
export function dateKeyOf(v: unknown): string {
  if (!v) return '';
  if (v instanceof Date) return localDateStr(v);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s.slice(0, 10) : localDateStr(d);
}

/** rpc 返回的 jsonb 可能是对象，也可能是 JSON 字符串 */
function asObject(v: unknown): Record<string, any> | null {
  if (!v) return null;
  if (typeof v === 'object') return v as Record<string, any>;
  if (typeof v === 'string') {
    try { const o = JSON.parse(v); return typeof o === 'object' ? o : null; } catch { return null; }
  }
  return null;
}

/** 自增用量计数（成功调用 AI 后）。返回最新 used，失败返回 -1。
 *  优先走数据库端的原子函数：并发调用不会互相覆盖计数；
 *  数据库函数不可用时退回「读-改-写」，结果仍然正确，只是并发下可能少计一次。 */
export async function recordUsage(uid: string, n = 1, taskType = 'ai_call'): Promise<number> {
  const d = await db(); if (!d) return -1;

  // 写入积分明细的辅助函数
  const writeLog = async (balanceAfter: number) => {
    try {
      await d.from('lunasol_credit_logs').insert({
        owner_id: uid,
        change_type: 'consume',
        amount: n,
        balance_after: balanceAfter,
        reason: taskType === 'image' ? tl('AI 图像生成消耗', 'AI image generation') : taskType === 'chat' ? tl('AI 对话消耗', 'AI chat') : tl('AI 调用消耗', 'AI call'),
        task_type: taskType,
      });
    } catch (e) {
      console.error('写入积分明细失败', e);
    }
  };

  try {
    if (typeof d.rpc === 'function') {
      const r = await d.rpc('lunasol_consume_quota', { p_uid: uid, p_n: n });
      if (!r.error) {
        const v = typeof r.data === 'number' ? r.data : (r.data as { value?: number } | null)?.value;
        // -1 表示该用户还没有订阅行（新注册用户），必须继续走兜底逻辑建行并计数，
        // 否则第一次 AI 调用会白白丢掉这一次额度。
        if (typeof v === 'number' && v >= 0) {
          await writeLog(v);
          return v;
        }
      }
    }
  } catch { /* 落到兜底实现 */ }
  const cur = await getSubscription(uid);
  const base = cur.ok ? cur.data : await ensureSubscription(uid);
  const next = Math.min(base.quota_total, base.quota_used + n);
  try {
    await d.from(TABLE).update({ quota_used: next, updated_at: new Date().toISOString() }).eq('id', uid);
    // 计算剩余总积分（基础额度剩余 + 奖励积分）
    const remaining = Math.max(0, base.quota_total - next) + (base.bonus_credits || 0);
    await writeLog(remaining);
  } catch { /* 忽略 */ }
  return next;
}

/** 基础赠送桶的剩余量。只用于账本内部计算，界面与闸门一律用 totalCreditsOf()。 */
export function remainingOf(sub: Subscription | null): number {
  if (!sub) return 0;
  return Math.max(0, sub.quota_total - sub.quota_used);
}

/** 总积分余额：基础桶 + 单独获得的积分（签到 / 兑换码 / 积分包）。
 *  lunasol_consume_quota 先扣基础桶再扣 bonus_credits，闸门与界面必须看两者之和，
 *  否则「免费桶用完但买过积分包」的用户会被误判为没额度。 */
export function totalCreditsOf(sub: Subscription | null): number {
  if (!sub) return 0;
  return remainingOf(sub) + Math.max(0, Number(sub.bonus_credits) || 0);
}

/* ---------------- 用量进度：分母口径全局唯一 ---------------- */

/** 进度条 100% 对应的默认积分量 */
export const CREDIT_BUCKET_FREE = PRICING.creditBucket;
/** 兼容旧引用 */
export const DEFAULT_CREDIT_BUCKET = CREDIT_BUCKET_FREE;

export interface UsageStat {
  /** 当前可用积分 */
  left: number;
  /** 100% 对应的积分量（默认 100 / 充过值 = 该次充值量） */
  bucket: number;
  /** 已用掉的积分 */
  used: number;
  /** 已使用百分比（0–100 整数） */
  pct: number;
}

/** 已使用进度：pct = (桶 - 余额) / 桶。
 *  侧栏账号卡与「积分」页共用此函数，两处百分比不会再各算一套。
 *  桶取「默认 100」与「近期充值量」的较大者——充值包最小 1000，
 *  所以真实充值一定大于默认桶；小额兑换码不会把分母压小到出现 100%。 */
export function usageStat(
  left: number | null,
  opts?: { recharge?: number | null },
): UsageStat | null {
  if (left === null || left === undefined) return null;
  const recharge = Number(opts?.recharge);
  const b = Math.max(CREDIT_BUCKET_FREE, Number.isFinite(recharge) ? recharge : 0);
  const l = Math.max(0, Math.round(left));
  const used = Math.max(0, b - l);
  return { left: l, bucket: b, used, pct: Math.min(100, Math.round((used / b) * 100)) };
}

/* ------------------------------------------------------------------ */

interface SubCtx {
  sub: Subscription | null;
  loading: boolean;
  /** 当前来源是否走积分计量（正式站点=是；GitHub Pages 镜像=否） */
  metered: boolean;
  /** 总积分余额；非计量来源返回 null */
  usedLeft: number | null;
  /** 进度条 100% 对应的积分量（默认 1000；近期充过积分则为该次充值量） */
  creditBucket: number;
  /** 已使用进度，侧栏与积分页共用；未登录 / 非计量来源为 null */
  usage: UsageStat | null;
  /** 兼容旧调用点：纯积分制下登录后全部能力开放，恒为 true。
   *  生图高档位仍按积分扣费，不在这里做权限拦截。 */
  isPro: boolean;
  refresh: () => Promise<void>;
  activate: (code: string) => Promise<{ ok: boolean; message: string }>;
  paywallOpen: boolean;
  paywallReason: string;
  /** 当前拦截原因：匿名（需登录）还是积分不足（需充值） */
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
  /** 获取积分使用记录 */
  getCreditLogs: (limit?: number) => Promise<CreditLog[]>;
}

export interface CreditLog {
  id: number;
  owner_id: string;
  /** recharge = 积分包购买（Creem 在线支付写入，见 lunasol_credits_apply） */
  change_type: 'consume' | 'grant' | 'checkin' | 'redeem' | 'recharge' | 'refund';
  amount: number;
  balance_after: number;
  reason: string;
  task_type?: string;
  created_at: string;
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
  const [paywallNeed, setPaywallNeed] = useState<PaywallNeed>('credits');
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
        // 还没有账本行 = 新注册用户，赠送积分一次都没用过，按满额放行；
        // 账本尚未加载完成时传 null，同样放行，避免首屏误拦。
        remaining: s ? totalCreditsOf(s) : (u ? FREE_TRIAL : null),
      });
      if (d.ok) return { ok: true };
      // 匿名用户不要直接抛登录框——那会打断正在填的表单。改为弹付费墙，
      // 由用户在弹窗里主动选择「立即登录」，未登录只是不计量，不影响继续用内置引擎。
      setPaywallReason(d.reason); setPaywallNeed(d.need); setPaywallOpen(true);
      return { ok: false, reason: d.reason, need: d.need };
    });
    registerAIReporter((taskId: string) => {
      const u = userRef.current; if (!u) return;
      // 积分由云函数统一扣减，前端只需要刷新显示
      // 这里不再手动扣减，避免双重扣减
      void refresh();
    });
    return () => { registerAIGate(null); registerAIReporter(null); };
  }, [metered, requestLogin]);

  /** 兼容旧接口：纯积分制没有「输入码即开通」这回事，一律引导到积分页。
   *  绝不可以在前端凭一个字符串改账本——旧版 activate(code) 曾把 code 丢掉后
   *  直接写库，等于任何登录用户都能白拿额度。 */
  const activate = useCallback(async (_code: string): Promise<{ ok: boolean; message: string }> => {
    return { ok: false, message: tl('已改为纯积分制，请在「积分」页购买积分包或每日签到获取积分', 'We switched to a simple credit system — buy a credit pack or check in daily on the Credits page') };
  }, []);

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
  /** 连点/多标签页互斥：签到请求进行中时直接忽略第二次点击 */
  const checkinBusyRef = useRef(false);
  /** 最近一次成功签到的本地日期，用于「刚签完马上又点」时立刻拦住 */
  const checkedDateRef = useRef<string>('');

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
        const yesterday = localDateStr(new Date(Date.now() - 86400000));
        // 查最近的签到记录，倒序
        const r = await d.from('lunasol_checkin_logs').select('checkin_date,streak,bonus').eq('user_id', u.id).order('checkin_date', { ascending: false }).limit(30);
        if (cancelled) return;
        const rows = (r.data || []) as { checkin_date: string; streak: number; bonus: number }[];
        if (!rows.length) {
          setCheckinState({ checkedToday: false, streak: 0, loading: false });
          return;
        }
        const lastDay = dateKeyOf(rows[0].checkin_date);
        const checkedToday = lastDay === today;
        // 连续天数只在「今天已签」或「昨天签过」时成立；断了就归零，
        // 否则隔了三天还显示「已连续签到 4 天」，用户会以为记录出错了。
        const streak = checkedToday || lastDay === yesterday ? Number(rows[0].streak) || 0 : 0;
        setCheckinState({ checkedToday, streak, loading: false });
      } catch {
        if (!cancelled) setCheckinState({ checkedToday: false, streak: 0, loading: false });
      }
    })();
    return () => { cancelled = true; };
  }, [auth.user?.id]);

  const doCheckin = useCallback(async (): Promise<{ ok: boolean; points: number; streak: number; message: string }> => {
    const u = userRef.current;
    if (!u) return { ok: false, points: 0, streak: 0, message: tl('请先登录', 'Please sign in first') };
    if (!sdkUsable()) return { ok: false, points: 0, streak: 0, message: tl('云服务未连接', 'Cloud service is not connected') };
    // 三重防重：本地已签标记 / 请求进行中 / 数据库唯一约束兜底
    if (checkinState.checkedToday || checkedDateRef.current === localDateStr()) {
      return { ok: false, points: 0, streak: checkinState.streak, message: tl('今天已经签到过了', 'Already checked in today') };
    }
    if (checkinBusyRef.current) {
      return { ok: false, points: 0, streak: checkinState.streak, message: tl('正在签到，请稍候', 'Checking in — one moment') };
    }
    checkinBusyRef.current = true;
    const d = await db();
    if (!d) { checkinBusyRef.current = false; return { ok: false, points: 0, streak: 0, message: tl('数据库未连接', 'Database is not connected') }; }

    try {
      /* 首选：数据库函数。查重、写记录、加积分、写明细都在一个事务里完成，
         并发点击 / 双标签页只会有一次真正生效，客户端拿到的就是最终结果。 */
      if (typeof d.rpc === 'function') {
        const r = await d.rpc('lunasol_checkin');
        const p = asObject(r.data);
        if (!r.error && p) {
          const streak = Number(p.streak) || 0;
          const points = Number(p.points) || 0;
          if (p.already) {
            setCheckinState({ checkedToday: true, streak, loading: false });
            checkedDateRef.current = localDateStr();
            return { ok: false, points: 0, streak, message: tl('今天已经签到过了', 'Already checked in today') };
          }
          if (p.ok) {
            setCheckinState({ checkedToday: true, streak, loading: false });
            checkedDateRef.current = localDateStr();
            void refresh();
            return {
              ok: true, points, streak,
              message: points > 0 ? tl(`签到成功！+${points} 积分`, `Checked in! +${points} credits`) : tl('签到成功（本月签到积分已达上限）', 'Checked in (this month\'s check-in credits are maxed out)'),
            };
          }
          return { ok: false, points: 0, streak, message: String(p.message || tl('签到失败，请稍后重试', 'Check-in failed — please try again')) };
        }
      }

      /* 兜底（数据库函数尚未部署时）：先查今天有没有记录，再插入；
         插入必须检查 error —— 唯一索引冲突时 SDK 不会抛异常，只回 {error}，
         以前没看这个返回值，导致「冲突了仍然加积分」，于是出现一天能签到两次。 */
      const today = localDateStr();
      const yesterday = localDateStr(new Date(Date.now() - 86400000));

      const dup = await d.from('lunasol_checkin_logs').select('id,streak').eq('user_id', u.id).eq('checkin_date', today).limit(1);
      const dupRows = (dup.data || []) as { id: number; streak: number }[];
      if (dupRows.length) {
        setCheckinState({ checkedToday: true, streak: Number(dupRows[0].streak) || 0, loading: false });
        checkedDateRef.current = today;
        return { ok: false, points: 0, streak: Number(dupRows[0].streak) || 0, message: tl('今天已经签到过了', 'Already checked in today') };
      }

      const r = await d.from('lunasol_checkin_logs').select('checkin_date,streak').eq('user_id', u.id).order('checkin_date', { ascending: false }).limit(1);
      const rows = (r.data || []) as { checkin_date: string; streak: number }[];
      const lastStreak = rows.length > 0 ? rows[0].streak : 0;
      const newStreak = rows.length > 0 && dateKeyOf(rows[0].checkin_date) === yesterday ? lastStreak + 1 : 1;

      // 纯积分制：每天固定 +10，不再有会员双倍、月上限或连续天数奖励
      const totalPoints = 10;

      const ins = await d.from('lunasol_checkin_logs').insert({
        user_id: u.id, checkin_date: today, streak: newStreak, bonus: totalPoints,
      });
      if (ins.error) {
        // 并发下第二次插入会撞唯一索引：当作「今天已签到」，绝不能继续发积分
        setCheckinState({ checkedToday: true, streak: newStreak, loading: false });
        checkedDateRef.current = today;
        return { ok: false, points: 0, streak: newStreak, message: tl('今天已经签到过了', 'Already checked in today') };
      }

      const cur = subRef.current;
      if (cur) {
        try {
          if (typeof d.rpc === 'function') {
            const g = await d.rpc('lunasol_grant_bonus', { p_uid: u.id, p_points: totalPoints });
            const v = typeof g.data === 'number' ? g.data : asObject(g.data)?.value;
            if (!g.error && typeof v === 'number') {
              setSub((prev) => prev ? { ...prev, bonus_credits: v } : prev);
            } else {
              await d.from(TABLE).update({ bonus_credits: (cur.bonus_credits || 0) + totalPoints }).eq('id', cur.id);
              setSub((prev) => prev ? { ...prev, bonus_credits: (prev.bonus_credits || 0) + totalPoints } : prev);
            }
          } else {
            await d.from(TABLE).update({ bonus_credits: (cur.bonus_credits || 0) + totalPoints }).eq('id', cur.id);
            setSub((prev) => prev ? { ...prev, bonus_credits: (prev.bonus_credits || 0) + totalPoints } : prev);
          }
        } catch {
          await d.from(TABLE).update({ bonus_credits: (cur.bonus_credits || 0) + totalPoints }).eq('id', cur.id);
          setSub((prev) => prev ? { ...prev, bonus_credits: (prev.bonus_credits || 0) + totalPoints } : prev);
        }
      }

      try {
        const finalSub = subRef.current;
        const balanceAfter = finalSub
          ? (finalSub.quota_total - finalSub.quota_used + (finalSub.bonus_credits || 0))
          : totalPoints;
        await d.from('lunasol_credit_logs').insert({
          owner_id: u.id, change_type: 'checkin', amount: totalPoints, balance_after: balanceAfter,
          reason: tl(`每日签到（连续 ${newStreak} 天）`, `Daily check-in (${newStreak}-day streak)`), task_type: 'checkin',
        });
      } catch { /* 明细失败不影响签到本身 */ }

      setCheckinState({ checkedToday: true, streak: newStreak, loading: false });
      checkedDateRef.current = today;
      return {
        ok: true, points: totalPoints, streak: newStreak,
        message: tl(`签到成功！+${totalPoints} 积分`, `Checked in! +${totalPoints} credits`),
      };
    } finally {
      checkinBusyRef.current = false;
    }
  }, [checkinState.checkedToday, checkinState.streak, refresh]);

  // 兑换码：优先走数据库函数（积分码 / 会员码一次事务内校验并发放），失败再退回老实现
  const redeemCode = useCallback(async (code: string): Promise<{ ok: boolean; points?: number; message: string }> => {
    const c = code.trim().toUpperCase();
    if (!c) return { ok: false, message: tl('请输入兑换码', 'Enter a redemption code') };
    const u = auth.user;
    if (!u) return { ok: false, message: tl('请先登录再兑换', 'Sign in before redeeming') };
    const db = await import('./sdk').then((m) => m.db()).catch(() => null);
    if (!db) return { ok: false, message: tl('数据库未连接，请稍后再试', 'Database is not connected — please try again later') };

    if (typeof db.rpc === 'function') {
      const res = await db.rpc('lunasol_redeem_code', { p_code: c });
      const p = asObject(res.data);
      if (!res.error && p) {
        if (!p.ok) return { ok: false, message: String(p.message || tl('兑换失败', 'Redemption failed')) };
        await refresh();
        return {
          ok: true,
          points: Number(p.points) || 0,
          message: String(p.message || tl('兑换成功', 'Redeemed')),
        };
      }
      // 数据库函数报错：如实返回错误。原来的「直接改表 + 调 grant_bonus」兼容路径
      // 已失效（前者没有 RLS 更新权限、后者已撤销执行权限），会把兑换码消耗掉
      // 却只返回一句「兑换成功」，用户拿到的是空头承诺，因此整段删除。
      return { ok: false, message: tl(`兑换失败：${errText(res.error) || '请稍后重试'}`, `Redemption failed: ${errText(res.error) || 'please try again later'}`) };
    }

    return { ok: false, message: tl('云端兑换服务不可用，请刷新页面后重试', 'The cloud redemption service is unavailable — refresh the page and try again') };
  }, [auth.user, refresh]);

  // 获取积分使用记录
  const getCreditLogs = useCallback(async (limit = 50): Promise<CreditLog[]> => {
    const u = userRef.current;
    if (!u) return [];
    const d = await db();
    if (!d) return [];
    try {
      const r = await d
        .from('lunasol_credit_logs')
        .select('*')
        .eq('owner_id', u.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!r) return [];
      if (r.error) return [];
      return (r.data || []) as CreditLog[];
    } catch {
      return [];
    }
  }, []);

  // 积分余额 = 基础桶剩余 + bonus_credits（签到 / 兑换码 / 积分包都在这里）
  // 账本还没到（首屏加载中 / 拉取失败）时不给 0：否则侧栏会先闪一下
  // 「0 积分 · 已使用 100%」，看起来像余额被清空了。null 由各处显示占位。
  const usedLeft = metered && sub ? totalCreditsOf(sub) : null;
  // 纯积分制：不再有会员身份，登录后所有能力开放，保留字段只为兼容既有调用点
  const isPro = true;

  // 进度条分母：默认 100；用户近期（90 天）充值过，则用该次充值的积分量做 100%。
  const [creditBucket, setCreditBucket] = useState<number>(CREDIT_BUCKET_FREE);
  useEffect(() => {
    const u = auth.user;
    if (!u || !metered || !sdkUsable()) { setCreditBucket(CREDIT_BUCKET_FREE); return; }
    let cancelled = false;
    (async () => {
      const d = await db();
      if (!d) return;
      try {
        const r = await d.from('lunasol_credit_logs')
          .select('amount,change_type,created_at')
          .eq('owner_id', u.id)
          .order('created_at', { ascending: false })
          .limit(40);
        if (cancelled || !r || r.error || !Array.isArray(r.data)) return;
        const since = Date.now() - 90 * 24 * 3600 * 1000;
        const hit = (r.data as { amount?: number; change_type?: string; created_at?: string }[])
          .find((row) => {
            const kind = String(row.change_type || '');
            const at = Date.parse(String(row.created_at || ''));
            return (kind === 'grant' || kind === 'recharge' || kind === 'redeem')
              && (!Number.isFinite(at) || at >= since);
          });
        const amount = Number(hit?.amount) || 0;
        if (!cancelled) setCreditBucket(amount);
      } catch { /* 读不到记录就保持默认桶 */ }
    })();
    return () => { cancelled = true; };
  }, [auth.user?.id, metered]);

  // 真正的分母 = max(默认 100, 近期充值量)；state 里只存充值量
  const usage = usageStat(usedLeft, { recharge: creditBucket });
  const bucket = usage?.bucket ?? CREDIT_BUCKET_FREE;

  const value = useMemo<SubCtx>(() => ({
    sub, loading, metered, usedLeft, creditBucket: bucket, usage, isPro, refresh, activate, paywallOpen, paywallReason, paywallNeed, setPaywall, addLocalCredits, doCheckin, checkinState, redeemCode, getCreditLogs,
  }), [sub, loading, metered, usedLeft, bucket, usage, isPro, refresh, activate, paywallOpen, paywallReason, paywallNeed, setPaywall, addLocalCredits, doCheckin, checkinState, redeemCode, getCreditLogs]);

  return <Ctx.Provider value={value}>
    {children}
    <PaywallModal open={paywallOpen} reason={paywallReason} need={paywallNeed} onClose={() => setPaywall(false)} onLogin={requestLogin} />
  </Ctx.Provider>;
}
