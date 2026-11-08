/* ============================================================
 * CloudBase Web SDK 单例（按需加载）
 * ------------------------------------------------------------
 * 登录、云同步、PG 查询共用同一个 app 实例。
 * SDK 体积较大（约 220 kB gzip），而大多数访客可能从不登录，
 * 所以这里用动态 import：只有真正需要登录或云同步时才下载。
 * 初始化参数全部来自 .env 里的公开配置（envId / region / publishableKey）。
 * ============================================================ */
import { CLOUD, cloudConfigured, cloudOriginSupported } from './config';

type AnyApp = {
  auth: unknown;
  rdb?: () => { from(table: string): DbTable };
};

let app: AnyApp | null = null;
let loading: Promise<AnyApp | null> | null = null;

/** 只有配置齐全且当前域名在白名单内才加载 SDK，避免无谓的跨域失败与流量 */
export function sdkUsable(): boolean {
  return cloudConfigured && cloudOriginSupported();
}

export function ensureApp(): Promise<AnyApp | null> {
  if (!sdkUsable()) return Promise.resolve(null);
  if (app) return Promise.resolve(app);
  if (loading) return loading;
  loading = import('@cloudbase/js-sdk')
    .then((mod) => {
      const cloudbase = (mod as unknown as { default: { init(c: unknown): AnyApp } }).default || (mod as unknown as { init(c: unknown): AnyApp });
      app = cloudbase.init({
        env: CLOUD.envId,
        region: CLOUD.region,
        accessKey: CLOUD.publishableKey,
        auth: { detectSessionInUrl: true },
      });
      return app;
    })
    .catch(() => { loading = null; return null; });
  return loading;
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
  onAuthStateChange(cb: (event: string, session: RawSession) => void): { data?: { subscription?: { unsubscribe?: () => void } } };
}

export async function authApi(): Promise<CloudAuthApi | null> {
  const a = await ensureApp();
  return a ? (a.auth as CloudAuthApi) : null;
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
  const a = await ensureApp();
  if (!a || typeof a.rdb !== 'function') return null;
  return a.rdb() as Db;
}
