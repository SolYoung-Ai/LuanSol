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
  user_metadata?: { name?: string; username?: string; nickName?: string };
};
export type RawSession = { access_token?: string; user?: RawUser } | null;
export type VerifyResult = { data?: { user?: RawUser; session?: RawSession }; error?: Err };
export type VerifyFn = (p: { token: string }) => Promise<VerifyResult>;

export interface CloudAuthApi {
  signInWithPassword(p: Record<string, string>): Promise<{ data?: { user?: RawUser; session?: RawSession }; error?: Err }>;
  signUp(p: Record<string, string>): Promise<{ data?: { verifyOtp?: VerifyFn }; error?: Err }>;
  signInWithOtp(p: Record<string, string>): Promise<{ data?: { verifyOtp?: VerifyFn }; error?: Err }>;
  getSession(): Promise<{ data?: { session?: RawSession; user?: RawUser }; error?: Err }>;
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
  insert(row: Record<string, unknown>): Promise<DbResult>;
  upsert(row: Record<string, unknown>, opts?: { onConflict?: string }): Promise<DbResult>;
  update(patch: Record<string, unknown>): { eq(column: string, value: string): Promise<DbResult> };
  delete(): { eq(column: string, value: string): Promise<DbResult> };
}
export interface Db {
  from(table: string): DbTable;
}

export async function db(): Promise<Db | null> {
  const a = await ensureApp();
  if (!a || typeof a.rdb !== 'function') return null;
  return a.rdb() as Db;
}
