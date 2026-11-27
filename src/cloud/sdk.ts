/* ============================================================
 * 云服务客户端：已停用（2026-11-28）
 * ------------------------------------------------------------
 * LunaSol 已退出 CloudBase，改为纯静态站点 + BYOK：
 *   - 数据库、登录、积分、云同步全部不再使用
 *   - AI 由用户在设置页填自己的 Key，浏览器直连厂商
 *
 * 这个文件保留**空实现**，不是删掉调用点 —— 十几处业务代码
 * （subscription / projects / chats / profile …）都从这里取
 * db / authApi / ensureApp，返回 null 就让它们各自走
 * 「未配置云服务」的分支，不发任何请求。
 *
 * 关键：不再 import @cloudbase/js-sdk。构建产物里不会有
 * 腾讯云 SDK 的任何字节，也不会有任何腾讯云域名。
 *
 * 要恢复账号体系：把下面 ensureApp 里的实现换回 git 历史
 * 中 10ae988 之前的版本，并在 .env 填回 envId / key 即可。
 * ============================================================ */
import { CLOUD } from './config';

/** 恒为 false：云服务已停用，所有调用点据此走本地分支 */
export function sdkUsable(): boolean {
  return false;
}

export async function ensureApp(): Promise<null> {
  return null;
}

/* ---------------- 认证方法的最小类型（SDK 未导出完整 d.ts） ---------------- */
export type Err = { message?: string } | null;
export type RawUser = {
  id?: string; sub?: string; uid?: string; email?: string; phone?: string; username?: string;
  user_metadata?: { name?: string; username?: string; nickName?: string; avatarUrl?: string };
};
export type RawSession = { access_token?: string; user?: RawUser } | null;

/** 通用 {data,error} 结果（CloudBase v3 为 Supabase 风格，字段可能为 null） */
type AuthEnvelope = { data?: Record<string, any> | null; error?: Err };
export type VerifyResult = { data?: { user?: RawUser; session?: RawSession }; error?: Err };
/** 发码后返回的验证码回调（注册/免密登录）：SDK 自动带 messageId */
export type OtpCallback = (p: { token: string | number; messageId?: string }) => Promise<VerifyResult>;

/** reauthenticate 返回的改密回调：nonce=验证码，password=新密码 */
export type ReauthUpdate = (p: { nonce: string | number; password: string }) => Promise<VerifyResult>;
/** updateUser 绑定邮箱/手机返回的验证码回调 */
export type LinkVerifyCallback = (p: { token: string | number; email?: string; phone?: string; messageId?: string }) => Promise<AuthEnvelope>;

export interface CloudAuthApi {
  signInWithPassword(p: Record<string, string>): Promise<VerifyResult>;
  signUp(p: Record<string, string>): Promise<{ data?: { user?: RawUser; session?: RawSession; verifyOtp?: OtpCallback } | null; error?: Err }>;
  signInWithOtp(p: Record<string, string>): Promise<{ data?: { user?: RawUser; session?: RawSession; verifyOtp?: OtpCallback; messageId?: string } | null; error?: Err }>;
  /** 第三方 OAuth 登录（如微信网页授权）：调用后会被重定向到授权页，不会立即返回会话。 */
  signInWithOAuth(p: { provider: string; redirectTo?: string }): Promise<{ data?: unknown; error?: Err }>;
  getSession(): Promise<VerifyResult>;
  /** 拉取最新用户资料 */
  getUser?(isRefresh?: boolean): Promise<{ data?: { user?: RawUser }; error?: Err }>;
  /** 改密第一步：向注册邮箱/手机发验证码，返回 updateUser 回调 */
  reauthenticate(): Promise<{ data?: { updateUser?: ReauthUpdate } | null; error?: Err }>;
  /** 已登录且知道旧密码时直接改密 */
  resetPasswordForOld(p: { old_password: string; new_password: string }): Promise<VerifyResult>;
  /** 绑定/换绑邮箱或手机：传 email/phone 会发验证码，返回 verifyOtp 回调 */
  updateUser(p: { email?: string; phone?: string; [k: string]: unknown }): Promise<{ data?: { verifyOtp?: LinkVerifyCallback; messageId?: string; user?: RawUser } | null; error?: Err }>;
  /** 更新昵称/头像（直接生效，不需要验证码） */
  updateUserBasicInfo?(p: { nickName?: string; avatarUrl?: string }): Promise<{ error?: Err } | null>;
  signOut(p?: unknown): Promise<AuthEnvelope>;
  /** 当前登录用户的访问令牌。云函数用它代用户读写 PG（服务端扣费的身份依据）。 */
  getAccessToken?(): Promise<{ accessToken: string; env: string }>;
  onAuthStateChange(cb: (event: string, session: RawSession) => void): { data?: { subscription?: { unsubscribe?: () => void } } };
}

export async function authApi(): Promise<CloudAuthApi | null> {
  return null;   // 云服务已停用
}

/** 云函数服务端扣费用的用户令牌；拿不到就返回空，由云函数拒绝扣费。 */
export async function cloudAccessToken(): Promise<string> {
  const a = await authApi();
  try {
    const r = await a?.getAccessToken?.();
    return r?.accessToken || '';
  } catch {
    return '';
  }
}

/* ---------------- PostgreSQL（CloudBase RDB / PostgREST 风格） ---------------- */
export type DbResult<T = unknown> = { data: T; error: Err; status?: number };

export interface DbQuery<T = unknown> extends Promise<DbResult<T>> {
  eq(column: string, value: string): DbQuery<T>;
  order(column: string, opts?: { ascending?: boolean }): DbQuery<T>;
  limit(n: number): DbQuery<T>;
}
export interface DbTable {
  select(columns?: string): DbQuery<unknown[]>;
  insert(row: object): Promise<DbResult>;
  upsert(row: object, opts?: { onConflict?: string }): Promise<DbResult>;
  update(patch: object): { eq(column: string, value: string): Promise<DbResult> };
  delete(): { eq(column: string, value: string): Promise<DbResult> };
}
export interface Db {
  from(table: string): DbTable;
  /** 调用数据库函数（用于原子自增等无法用普通查询表达的操作） */
  rpc?(name: string, params?: Record<string, unknown>): Promise<DbResult>;
}

export async function db(): Promise<Db | null> {
  return null;   // 云服务已停用
}
