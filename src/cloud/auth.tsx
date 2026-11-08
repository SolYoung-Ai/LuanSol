/* ============================================================
 * LunaSol 真实登录系统（CloudBase 国内站 / Web SDK v3）
 * ------------------------------------------------------------
 *  - 会话判定只用 auth.getSession().data.session；
 *    不用已废弃的 getLoginState()/getUser() 冒充登录态。
 *  - 登录、注册、验证码、退出全部调用真实云端接口；
 *    失败原样展示 error.message，不伪造成功、不静默降级成本地假登录。
 *  - 用户名/密码登录：signInWithPassword（已实测返回 session 与 uid）。
 *  - 注册：signUp({phone|email, password}) → data.verifyOtp({token})，
 *    走 CloudBase 默认短信通道；邮件通道需要环境侧配置后才能收到信。
 * ============================================================ */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authApi, type Err, type RawSession, type RawUser, type VerifyFn } from './sdk';
import { cloudConfigured, cloudOriginSupported } from './config';
import { accountKey, otpTarget } from './keys';

export { accountKey, otpTarget };

export interface AuthUser { id: string; label: string; account: string; avatarUrl: string; email: string; phone: string }

/** 登录不可用时的真实原因。
 *  SDK 未就绪有两种完全不同的情况，不能都报「未配置环境」——那会把
 *  「域名不在白名单」说成「没配环境」，属于错误信息误导。 */
function unavailable(action: string): string {
  if (!cloudConfigured) return `尚未配置 CloudBase 环境，无法${action}`;
  if (!cloudOriginSupported()) {
    return `当前域名不在 CloudBase 安全域名白名单内，${action}请求会被浏览器拦截；请到正式站点${action}`;
  }
  return `登录服务未就绪，无法${action}，请刷新页面重试`;
}
export type CodeKind = 'signup' | 'login';
export type ActionResult = { ok: boolean; message: string };

interface AuthCtx {
  ready: boolean;
  configured: boolean;
  originOk: boolean;
  user: AuthUser | null;
  session: RawSession;
  pending: { kind: CodeKind; target: string } | null;
  busy: boolean;
  error: string | null;
  signInWithPassword: (account: string, password: string) => Promise<ActionResult>;
  startSignup: (target: string, password: string) => Promise<ActionResult>;
  startCodeLogin: (target: string) => Promise<ActionResult>;
  signInWithWechat: () => Promise<ActionResult>;
  verifyCode: (token: string) => Promise<ActionResult>;
  cancelCode: () => void;
  signOut: () => Promise<ActionResult>;
  /** 更新昵称 / 头像（真改 CloudBase user_metadata） */
  updateProfile: (p: { nickName?: string; avatarUrl?: string }) => Promise<ActionResult>;
  /** 设置密码：已登录会话即身份验证，手机验证码登录可直接设置 */
  changePassword: (newPassword: string, oldPassword?: string) => Promise<ActionResult>;
  /** 绑定/换绑邮箱或手机：第一步发验证码 */
  startLink: (kind: 'email' | 'phone', target: string) => Promise<ActionResult>;
  /** 绑定/换绑：校验验证码完成绑定 */
  verifyLink: (token: string) => Promise<ActionResult>;
  refreshUser: () => Promise<void>;
  linkPending: { kind: 'email' | 'phone'; target: string } | null;
  clearError: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthContext missing');
  return c;
};

const errorMessage = (e: unknown, fallback: string) => {
  const m = (e as { message?: string } | null)?.message;
  return m ? String(m) : fallback;
};

function toUser(s?: RawSession): AuthUser | null {
  const src: RawUser | undefined = s?.user;
  if (!src) return null;
  const id = String(src.id || src.sub || src.uid || '');
  if (!id) return null;
  const account = String(src.email || src.phone || src.username || '');
  const label = src.user_metadata?.name || src.user_metadata?.nickName || src.user_metadata?.username || src.username || account || id;
  return {
    id,
    label: String(label),
    account,
    avatarUrl: String(src.user_metadata?.avatarUrl || ''),
    email: String(src.email || ''),
    phone: String(src.phone || ''),
  };
}

/** 生日走本机存储（SDK 用户资料里没有生日字段）：key 按用户隔离 */
export const birthdayKey = (uid: string) => `lunasol:birthday:${uid}`;
export const getBirthday = (uid: string): string => { try { return localStorage.getItem(birthdayKey(uid)) || ''; } catch { return ''; } };
export const setBirthday = (uid: string, v: string) => { try { v ? localStorage.setItem(birthdayKey(uid), v) : localStorage.removeItem(birthdayKey(uid)); } catch { /* 隐私模式 */ } };


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<RawSession>(null);
  const [pending, setPending] = useState<{ kind: CodeKind; target: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verifyRef = useRef<VerifyFn | null>(null);
  const linkVerifyRef = useRef<((p: { token: string | number; messageId?: string }) => Promise<{ data?: { user?: RawUser; session?: RawSession }; error?: Err }>) | null>(null);
  const [linkPending, setLinkPending] = useState<{ kind: 'email' | 'phone'; target: string } | null>(null);
  const configured = cloudConfigured;
  const originOk = cloudOriginSupported();

  const apply = useCallback((s: RawSession) => {
    setSession(s);
    setUser(toUser(s));
  }, []);

  // 用户登录/登出时，自动同步 uid 到 AI 配置里，供云函数登录态校验用
  useEffect(() => {
    try {
      const KEY = 'lunasol.ai.v1';
      const raw = localStorage.getItem(KEY);
      const cfg = raw ? JSON.parse(raw) : {};
      const uid = user?.id || '';
      if (cfg.cloudbaseUid !== uid) {
        cfg.cloudbaseUid = uid;
        localStorage.setItem(KEY, JSON.stringify(cfg));
      }
    } catch { /* 隐私模式忽略 */ }
  }, [user?.id]);

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        // SDK 按需加载：未配置或域名不在白名单时直接跳过，不产生跨域噪音
        const auth = await authApi();
        if (!alive) return;
        if (!auth) { setReady(true); return; }
        const r = await auth.getSession();
        if (!alive) return;
        if (r.error?.message && !/not logged|no session/i.test(r.error.message)) setError(r.error.message);
        apply(r.data?.session || null);
        try {
          const sub = auth.onAuthStateChange((event, s) => {
            if (event === 'SIGNED_OUT') { apply(null); return; }
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') apply(s || null);
          });
          unsubscribe = sub?.data?.subscription?.unsubscribe;
        } catch { /* 订阅失败不影响已取得的会话 */ }
      } catch (e) {
        if (alive) setError(errorMessage(e, '无法连接 CloudBase 登录服务'));
      } finally { if (alive) setReady(true); }
    })();
    return () => { alive = false; unsubscribe?.(); };
  }, [apply]);

  const signInWithPassword = useCallback(async (account: string, password: string): Promise<ActionResult> => {
    // 先做本地校验并立即进入加载态，避免等待 SDK 动态下载期间按钮无反馈
    if (!account.trim() || !password) return { ok: false, message: '请填写账号与密码' };
    setBusy(true); setError(null);
    try {
      const auth = await authApi();
      if (!auth) { const m = unavailable('登录'); setError(m); return { ok: false, message: m }; }
      const r = await auth.signInWithPassword({ ...accountKey(account), password });
      if (r.error) { const m = r.error.message || '登录失败'; setError(m); return { ok: false, message: m }; }
      if (!r.data?.session) { const m = '登录服务未返回会话，请重试'; setError(m); return { ok: false, message: m }; }
      apply(r.data.session);
      return { ok: true, message: '登录成功' };
    } catch (e) {
      const m = errorMessage(e, '登录请求失败，请检查网络'); setError(m); return { ok: false, message: m };
    } finally { setBusy(false); }
  }, [apply]);

  const startSignup = useCallback(async (target: string, password: string): Promise<ActionResult> => {
    const auth = await authApi();
    if (!auth) return { ok: false, message: unavailable('注册') };
    const t = otpTarget(target);
    if (!t) return { ok: false, message: '注册需要手机号或邮箱，用户名不能直接注册' };
    if (password.length < 8) return { ok: false, message: '密码至少 8 位' };
    setBusy(true); setError(null);
    try {
      const r = await auth.signUp({ ...t.key, password });
      if (r.error) { const m = r.error.message || '注册失败'; setError(m); return { ok: false, message: m }; }
      if (!r.data?.verifyOtp) { const m = '注册服务未返回验证码校验入口'; setError(m); return { ok: false, message: m }; }
      verifyRef.current = r.data.verifyOtp;
      setPending({ kind: 'signup', target: target.trim() });
      return { ok: true, message: `验证码已发送到${t.label}，填写后完成注册` };
    } catch (e) {
      const m = errorMessage(e, '注册请求失败，请检查网络'); setError(m); return { ok: false, message: m };
    } finally { setBusy(false); }
  }, []);

  const startCodeLogin = useCallback(async (target: string): Promise<ActionResult> => {
    const auth = await authApi();
    if (!auth) return { ok: false, message: unavailable('使用验证码') };
    const t = otpTarget(target);
    if (!t) return { ok: false, message: '请输入手机号或邮箱' };
    setBusy(true); setError(null);
    try {
      const r = await auth.signInWithOtp(t.key);
      if (r.error) { const m = r.error.message || '验证码发送失败'; setError(m); return { ok: false, message: m }; }
      if (!r.data?.verifyOtp) { const m = '登录服务未返回验证码校验入口'; setError(m); return { ok: false, message: m }; }
      verifyRef.current = r.data.verifyOtp;
      setPending({ kind: 'login', target: target.trim() });
      return { ok: true, message: `验证码已发送到${t.label}` };
    } catch (e) {
      const m = errorMessage(e, '验证码请求失败，请检查网络'); setError(m); return { ok: false, message: m };
    } finally { setBusy(false); }
  }, []);

  const verifyCode = useCallback(async (token: string): Promise<ActionResult> => {
    if (!pending) return { ok: false, message: '请先获取验证码' };
    if (!/^\d{4,8}$/.test(token.trim())) return { ok: false, message: '验证码格式不正确' };
    setBusy(true); setError(null);
    try {
      const r = await verifyRef.current?.({ token: token.trim() });
      if (!r) { const m = '验证码已失效，请重新发送'; setError(m); return { ok: false, message: m }; }
      if (r.error) { const m = r.error.message || '校验失败'; setError(m); return { ok: false, message: m }; }
      if (!r.data?.session) { const m = '校验通过但未获得会话，请重新登录'; setError(m); return { ok: false, message: m }; }
      apply(r.data.session);
      const done = pending.kind;
      setPending(null); verifyRef.current = null;
      return { ok: true, message: done === 'signup' ? '注册完成，已自动登录' : '登录成功' };
    } catch (e) {
      const m = errorMessage(e, '验证码校验失败'); setError(m); return { ok: false, message: m };
    } finally { setBusy(false); }
  }, [pending, apply]);

  const cancelCode = useCallback(() => { setPending(null); verifyRef.current = null; setError(null); }, []);

  const signInWithWechat = useCallback(async (): Promise<ActionResult> => {
    const auth = await authApi();
    if (!auth) return { ok: false, message: unavailable('微信登录') };
    setBusy(true); setError(null);
    try {
      // 重定向到微信授权页；成功后会跳回本站，CloudBase 自动用 URL 里的 code 建立会话。
      // redirectTo 只取 origin+pathname，避免 hash 路由把 ?code= 塞进 hash 导致 SDK 读不到。
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined;
      const r = await (auth as unknown as {
        signInWithOAuth(p: { provider: string; redirectTo?: string }): Promise<{ data?: unknown; error?: { message?: string } | null }>;
      }).signInWithOAuth({ provider: 'wechat', redirectTo });
      if (r?.error) { const m = (r.error as { message?: string })?.message || '微信登录发起失败'; setError(m); return { ok: false, message: m }; }
      // 正常情况下这里不会执行——页面已经被重定向到微信；返回这条仅作兜底提示。
      return { ok: true, message: '正在跳转到微信授权…' };
    } catch (e) {
      const m = errorMessage(e, '微信登录发起失败，请确认已在 CloudBase 控制台启用微信登录'); setError(m); return { ok: false, message: m };
    } finally { setBusy(false); }
  }, []);

  const signOut = useCallback(async (): Promise<ActionResult> => {
    const auth = await authApi();
    if (!auth) return { ok: false, message: unavailable('退出登录') };
    setBusy(true);
    try {
      const r = await auth.signOut();
      if (r.error) { const m = r.error.message || '退出失败'; setError(m); return { ok: false, message: m }; }
      apply(null);
      return { ok: true, message: '已退出登录' };
    } catch (e) {
      const m = errorMessage(e, '退出请求失败'); setError(m); return { ok: false, message: m };
    } finally { setBusy(false); }
  }, [apply]);

  const updateProfile = useCallback(async (p: { nickName?: string; avatarUrl?: string }): Promise<ActionResult> => {
    const auth = await authApi();
    if (!auth?.updateUserBasicInfo) return { ok: false, message: unavailable('更新资料') };
    setBusy(true); setError(null);
    try {
      const r = await auth.updateUserBasicInfo(p);
      if (!r) return { ok: true, message: '资料已保存' }; // 某些 SDK 版本不返回结果
      if (r.error) return { ok: false, message: r.error.message || '更新失败' };
      // 立即拉一次最新会话，让昵称/头像在导航与账户页可见
      const g = await auth.getUser?.();
      if (g?.data?.user) { const cur = session; apply({ ...(cur || null), user: g.data.user } as RawSession); }
      return { ok: true, message: '资料已保存' };
    } catch (e) { return { ok: false, message: errorMessage(e, '更新失败') }; } finally { setBusy(false); }
  }, [apply, session]);

  const changePassword = useCallback(async (newPassword: string, _oldPassword?: string): Promise<ActionResult> => {
    const auth = await authApi();
    if (!auth?.updatePassword) return { ok: false, message: unavailable('设置密码') };
    if (newPassword.length < 8) return { ok: false, message: '新密码至少 8 位' };
    setBusy(true); setError(null);
    try {
      // 已登录会话即身份验证，直接设置新密码（兼容手机验证码登录无旧密码的账号）
      const r = await auth.updatePassword(newPassword, _oldPassword || '');
      if (r.error) return { ok: false, message: r.error.message || '设置失败' };
      return { ok: true, message: '密码已设置，下次登录可使用手机号+密码或验证码登录' };
    } catch (e) { return { ok: false, message: errorMessage(e, '设置失败') }; } finally { setBusy(false); }
  }, []);

  const startLink = useCallback(async (kind: 'email' | 'phone', target: string): Promise<ActionResult> => {
    const auth = await authApi();
    if (!auth?.updateUser) return { ok: false, message: unavailable('绑定') };
    const v = target.trim();
    if (kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: false, message: '请输入正确的邮箱地址' };
    if (kind === 'phone' && !/^1\d{10}$/.test(v)) return { ok: false, message: '请输入 11 位手机号' };
    setBusy(true); setError(null);
    try {
      const r = await auth.updateUser(kind === 'email' ? { email: v } : { phone: v });
      if (r.error) return { ok: false, message: r.error.message || '验证码发送失败' };
      if (!r.data?.verifyOtp) return { ok: false, message: '绑定服务未返回验证码入口' };
      linkVerifyRef.current = r.data.verifyOtp;
      setLinkPending({ kind, target: v });
      return { ok: true, message: `验证码已发送到${kind === 'email' ? '邮箱' : '手机'}，填写后完成绑定` };
    } catch (e) { return { ok: false, message: errorMessage(e, '验证码发送失败') }; } finally { setBusy(false); }
  }, []);

  const verifyLink = useCallback(async (token: string): Promise<ActionResult> => {
    if (!linkPending) return { ok: false, message: '请先发送验证码' };
    setBusy(true); setError(null);
    try {
      const r = await linkVerifyRef.current?.({ token: token.trim() });
      if (!r) return { ok: false, message: '验证码已失效，请重新发送' };
      if (r.error) return { ok: false, message: r.error.message || '绑定失败' };
      if (r.data?.session) apply(r.data.session);
      setLinkPending(null); linkVerifyRef.current = null;
      return { ok: true, message: '绑定成功' };
    } catch (e) { return { ok: false, message: errorMessage(e, '绑定失败') }; } finally { setBusy(false); }
  }, [linkPending, apply]);

  const refreshUser = useCallback(async () => {
    const auth = await authApi();
    const g = await auth?.getUser?.();
    if (g?.data?.user) apply({ ...(session || null), user: g.data.user } as RawSession);
  }, [apply, session]);

  const value = useMemo<AuthCtx>(() => ({
    ready, configured, originOk, user, session, pending, busy, error, linkPending,
    signInWithPassword, startSignup, startCodeLogin, signInWithWechat, verifyCode, cancelCode, signOut,
    updateProfile, changePassword, startLink, verifyLink, refreshUser,
    clearError: () => setError(null),
  }), [ready, configured, originOk, user, session, pending, busy, error, linkPending, signInWithPassword, startSignup, startCodeLogin, signInWithWechat, verifyCode, cancelCode, signOut, updateProfile, changePassword, startLink, verifyLink, refreshUser]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
