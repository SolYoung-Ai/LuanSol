/* ============================================================
   Studio 2.0 — 项目持久化
   ------------------------------------------------------------
   为什么写进 lunasol_projects 而不是新开一张表：
   那张表已经开了 RLS（owner_id = auth.uid()），迁移也已上线；
   再建一张表要动生产库 DDL，风险与收益不成比例。
   为了不与旧工作台的包装项目互相污染，Studio 的本地 id 一律带
   `st_` 前缀，旧同步链路会跳过这些行（见 cloud/projects.ts）。

   双写：
   · 本机 localStorage：进页面立刻恢复，断网也能改（刷新不丢）
   · 云端 lunasol_projects：换设备 / 清缓存后仍能继续
   读取时以 updatedAt 较新的一方为准。
   ============================================================ */
import type { CloudResult } from '../cloud/projects';
import { rowId } from '../cloud/keys';
import { db } from '../cloud/sdk';
import {
  STUDIO_ID_PREFIX, normalizeStudioProject, type StudioProject,
} from './types';

const TABLE = 'lunasol_projects';
const CACHE_KEY = 'lunasol.studio.cache.v1';
const LAST_KEY = 'lunasol.studio.last.v1';
const MAX_LOCAL = 12;

const errText = (e: unknown): string => {
  if (!e) return '';
  if (typeof e === 'string') return e;
  const m = (e as { message?: string }).message;
  if (m) return String(m);
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
};

/* ------------------------------ 本机缓存 ------------------------------ */

export function readCache(): StudioProject[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeStudioProject).filter((p): p is StudioProject => !!p);
  } catch { return []; }
}

function writeCache(list: StudioProject[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(0, MAX_LOCAL)));
  } catch {
    /* 配额不足（参考图较大）：退一步只留文字，不让保存整条失败 */
    try {
      const slim = list.slice(0, MAX_LOCAL).map((p) => ({
        ...p,
        answers: {
          ...p.answers,
          colorRef: { ...p.answers.colorRef, v: null },
          logo: { ...p.answers.logo, image: null, refImage: null },
        },
      }));
      localStorage.setItem(CACHE_KEY, JSON.stringify(slim));
    } catch { /* 隐私模式：放弃本机缓存，云端仍会写 */ }
  }
}

export function cacheOne(p: StudioProject) {
  const list = readCache().filter((x) => x.id !== p.id);
  writeCache([p, ...list]);
  try { localStorage.setItem(LAST_KEY, p.id); } catch { /* ignore */ }
}

export function dropCached(id: string) {
  writeCache(readCache().filter((x) => x.id !== id));
  try { if (localStorage.getItem(LAST_KEY) === id) localStorage.removeItem(LAST_KEY); } catch { /* ignore */ }
}

/** 只取属于当前账号的缓存。
 *  同一台电脑换个账号登录时，绝不能把上一个账号的设计显示出来 ——
 *  云端有 RLS 兜着，本机缓存也必须按 ownerId 过一遍。 */
export function readCacheFor(uid: string): StudioProject[] {
  if (!uid) return [];
  return readCache().filter((p) => p.ownerId === uid);
}

export function lastProjectId(): string {
  try { return localStorage.getItem(LAST_KEY) || ''; } catch { return ''; }
}

export function cachedProject(id: string, uid: string): StudioProject | null {
  if (!uid) return null;
  const p = readCache().find((x) => x.id === id);
  return p && p.ownerId === uid ? p : null;
}

/* ------------------------------ 云端 ------------------------------ */

export interface StudioMeta {
  id: string;
  name: string;
  updatedAt: number;
  /** 云端列表只有元信息（不拉 payload，避免一次下载几十 MB 参考图），
   *  步骤与状态优先用本机缓存补；补不到就是 undefined。 */
  step?: number;
  status?: 'draft' | 'confirmed';
}

const isStudioRow = (cloudId: string): boolean => {
  const i = cloudId.indexOf(':');
  const local = i > 0 ? cloudId.slice(i + 1) : cloudId;
  return local.startsWith(STUDIO_ID_PREFIX);
};

export async function listStudio(): Promise<CloudResult<StudioMeta[]>> {
  const d = await db();
  if (!d) return { ok: false, message: '云服务未配置，项目只保存在本机' };
  try {
    const r = await d.from(TABLE).select('id,title,updated_at').order('updated_at', { ascending: false }).limit(100);
    if (!r) return { ok: true, data: [] };
    if (r.error) return { ok: false, message: `读取失败：${errText(r.error)}` };
    const rows = (r.data || []) as { id: string; title: string; updated_at: string }[];
    return {
      ok: true,
      data: rows.filter((x) => isStudioRow(String(x.id))).map((x) => ({
        id: String(x.id).slice(String(x.id).indexOf(':') + 1),
        name: x.title || '未命名设计',
        updatedAt: new Date(x.updated_at).getTime() || 0,
      })),
    };
  } catch (e) {
    return { ok: false, message: errText(e) || '读取请求异常' };
  }
}

export async function pullStudio(id: string): Promise<CloudResult<StudioProject>> {
  const d = await db();
  if (!d) return { ok: false, message: '云服务未配置' };
  try {
    const r = await d.from(TABLE).select('*').eq('id', id).limit(1);
    if (!r) return { ok: false, message: '读取失败：返回空结果' };
    if (r.error) return { ok: false, message: `读取失败：${errText(r.error)}` };
    const rows = (r.data || []) as { payload?: unknown }[];
    if (!rows.length) return { ok: false, message: '云端没有这条项目' };
    const p = normalizeStudioProject(rows[0].payload);
    if (!p) return { ok: false, message: '云端项目数据不完整' };
    return { ok: true, data: p };
  } catch (e) {
    return { ok: false, message: errText(e) || '读取请求异常' };
  }
}

/** 拉取某个 Studio 项目的完整数据（云端行主键是 uid:id） */
export async function pullStudioByRow(uid: string, localId: string): Promise<CloudResult<StudioProject>> {
  return pullStudio(rowId(uid, localId));
}

export async function pushStudio(uid: string, p: StudioProject): Promise<CloudResult> {
  const d = await db();
  if (!d) return { ok: false, message: '云服务未配置，已保存到本机' };
  if (!uid) return { ok: false, message: '尚未登录，已保存到本机' };
  if (p.ownerId && p.ownerId !== uid) return { ok: false, message: '这个项目属于另一个账号' };
  const row = {
    id: rowId(uid, p.id),
    owner_id: uid,
    title: p.name,
    payload: { ...p, ownerId: uid } as unknown as Record<string, unknown>,
    updated_at: new Date(p.updatedAt).toISOString(),
  };
  try {
    const w = await d.from(TABLE).upsert(row, { onConflict: 'id' });
    if (w.error) return { ok: false, message: `保存失败：${errText(w.error)}` };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: errText(e) || '保存请求异常' };
  }
}

export async function removeStudio(uid: string, id: string): Promise<CloudResult> {
  const d = await db();
  if (!d) return { ok: false, message: '云服务未配置' };
  try {
    const r = await d.from(TABLE).delete().eq('id', rowId(uid, id));
    if (r.error) return { ok: false, message: `删除失败：${errText(r.error)}` };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: errText(e) || '删除请求异常' };
  }
}
