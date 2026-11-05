/* ============================================================
 * 用户项目云同步（CloudBase PostgreSQL + RLS）
 * ------------------------------------------------------------
 * 表结构见 cloudbase/migrations/*_lunasol_projects.sql：
 *   id / owner_id / title / payload(jsonb) / updated_at
 * RLS 用 auth.uid() 比对 owner_id，任何越权读写都会被数据库拒绝。
 * 这里不做假同步：每次写入后会回读确认，失败如实返回错误。
 * ============================================================ */
import type { Project } from '../types';
import { db, sdkUsable } from './sdk';
import { rowId } from './keys';

export interface CloudMeta {
  id: string;
  title: string;
  updated_at: string;
}

export interface CloudRow extends CloudMeta {
  owner_id: string;
  payload: Project;
}

export type CloudResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string };

const TABLE = 'lunasol_projects';
const fail = (message: string) => ({ ok: false as const, message });

/* 行主键带上账号：同一台设备换账号时不会撞上别人的行，
 *  也避免用 upsert 去「更新」一行本账号看不见的记录。 */
export { rowId, projectIdOf } from './keys';

function errText(e: unknown): string {
  if (!e) return '';
  if (typeof e === 'string') return e;
  const m = (e as { message?: string }).message;
  if (m) return String(m);
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

/** 登录态是否具备云同步能力（配置齐全且已登录） */
export function canSync(uid?: string | null): boolean {
  return Boolean(uid && sdkUsable());
}

/* ------------------------------- 写入 ------------------------------- */
export async function pushProject(uid: string, p: Project): Promise<CloudResult> {
  const d = await db();
  if (!d) return fail('云服务未配置，无法同步');
  if (!uid) return fail('尚未登录，无法同步到云端');
  const row = {
    id: rowId(uid, p.id),
    owner_id: uid,
    title: p.name || '未命名包装项目',
    payload: p as unknown as Record<string, unknown>,
    updated_at: new Date(p.updatedAt || Date.now()).toISOString(),
  };
  try {
    const w = await d.from(TABLE).upsert(row, { onConflict: 'id' });
    if (w.error) return fail(`写入失败：${errText(w.error)}`);
    // 回读确认真的落库（也顺带验证 RLS 允许该用户读自己的行）
    const back = await d.from(TABLE).select('id,title,updated_at').eq('id', rowId(uid, p.id)).limit(1);
    if (back.error) return fail(`回读失败：${errText(back.error)}`);
    const rows = (back.data || []) as CloudMeta[];
    if (!rows.length) return fail('写入未生效：云端没有读回这条项目');
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(errText(e) || '同步请求异常');
  }
}

export async function pushMany(uid: string, list: Project[]): Promise<{ ok: number; failed: { id: string; message: string }[] }> {
  let ok = 0;
  const failed: { id: string; message: string }[] = [];
  for (const p of list) {
    const r = await pushProject(uid, p);
    if (r.ok) ok += 1; else failed.push({ id: p.id, message: r.message });
  }
  return { ok, failed };
}

/* ------------------------------- 读取 ------------------------------- */
export async function listProjects(): Promise<CloudResult<CloudMeta[]>> {
  const d = await db();
  if (!d) return fail('云服务未配置');
  try {
    const r = await d.from(TABLE).select('id,title,updated_at').order('updated_at', { ascending: false }).limit(100);
    if (r.error) return fail(`读取失败：${errText(r.error)}`);
    return { ok: true, data: ((r.data || []) as CloudMeta[]) };
  } catch (e) {
    return fail(errText(e) || '读取请求异常');
  }
}

export async function pullProject(id: string): Promise<CloudResult<Project>> {
  const d = await db();
  if (!d) return fail('云服务未配置');
  try {
    const r = await d.from(TABLE).select('*').eq('id', id).limit(1);
    if (r.error) return fail(`读取失败：${errText(r.error)}`);
    const rows = (r.data || []) as CloudRow[];
    if (!rows.length) return fail('云端没有这条项目（可能已被删除，或不属于当前账号）');
    const p = rows[0].payload;
    if (!p || typeof p !== 'object' || !p.id) return fail('云端项目数据不完整，已跳过');
    return { ok: true, data: p };
  } catch (e) {
    return fail(errText(e) || '读取请求异常');
  }
}

export async function pullAll(): Promise<CloudResult<Project[]>> {
  const list = await listProjects();
  if (!list.ok) return list;
  const out: Project[] = [];
  const errors: string[] = [];
  for (const meta of list.data) {
    const one = await pullProject(meta.id);
    if (one.ok) out.push(one.data); else errors.push(one.message);
  }
  if (!out.length && errors.length) return fail(errors[0]);
  return { ok: true, data: out };
}

/* ------------------------------- 删除 ------------------------------- */
export async function removeProject(id: string): Promise<CloudResult> {
  const d = await db();
  if (!d) return fail('云服务未配置');
  try {
    const r = await d.from(TABLE).delete().eq('id', id);
    if (r.error) return fail(`删除失败：${errText(r.error)}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(errText(e) || '删除请求异常');
  }
}

/** 生成本地时间标签，用于界面展示同步时间 */
export const timeLabel = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
