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
export type VerifyResult = { data?: { user?: RawUser; session?: RawSession }; error?: Err };
export type VerifyFn = (p: { token: string }) => Promise<VerifyResult>;

export interface CloudAuthApi {
  signInWithPassword(p: Record<string, string>): Promise<{ data?: { user?: RawUser; session?: RawSession }; error?: Err }>;
  signUp(p: Record<string, string>): Promise<{ data?: { verifyOtp?: VerifyFn }; error?: Err }>;
  signInWithOtp(p: Record<string, string>): Promise<{ data?: { verifyOtp?: VerifyFn }; error?: Err }>;
  /** 第三方 OAuth 登录（如微信网页授权）：调用后会被重定向到授权页，不会立即返回会话。 */
  signInWithOAuth(p: { provider: string; redirectTo?: string }): Promise<{ data?: unknown; error?: Err }>;
  getSession(): Promise<{ data?: { session?: RawSession; user?: RawUser }; error?: Err }>;
  /** 更新昵称/头像（直接生效，不需要验证码） */
  updateUserBasicInfo?(p: { nickName?: string; avatarUrl?: string }): Promise<{ error?: Err }>;
  /** 更新邮箱/手机：会先要求验证码，返回 verifyOtp 回调 */
  updateUser?(p: { email?: string; phone?: string }): Promise<{ data?: { verifyOtp?: (params: { token: string | number; messageId?: string }) => Promise<{ data?: { user?: RawUser; session?: RawSession }; error?: Err }>; messageId?: string | number }; error?: Err }>;
  /** 修改密码：需要旧密码 */
  updatePassword?(newPassword: string, oldPassword: string): Promise<{ error?: Err }>;
  getUser?(): Promise<{ data?: { user?: RawUser }; error?: Err }>;
  signOut(): Promise<{ error?: Err }>;
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
