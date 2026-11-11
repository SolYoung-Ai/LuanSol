/* ============================================================
 * 云同步调度（登录后自动合并 / 变更自动上传 / 手动全量同步）
 * ------------------------------------------------------------
 * 原则：
 *   1. 未登录时完全不碰云端，界面显示本地保存，不假装已同步；
 *   2. 登录后先拉取云端列表做双向合并（同 id 取 updatedAt 更新的一方）；
 *   3. 之后本地每次修改在 4 秒防抖后按项目逐个上传，写入后回读确认；
 *   4. 任何失败都保留本地数据并把真实错误暴露到界面。
 * ============================================================ */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { tl } from '../langStore';
import { useAuth } from './auth';
import { useSubscription } from './subscription';
import {
  listProjects, pushMany, pushProject, pullAll, removeProject, removeManyProjects,
  projectIdOf, timeLabel, listDeleted, markDeleted,
} from './projects';

export type SyncState = 'off' | 'idle' | 'syncing' | 'ok' | 'error';

export interface CloudSync {
  state: SyncState;
  message: string;
  lastSync: number | null;
  cloudCount: number | null;
  /** 本机项目归属的账号；null 表示还没同步过，属于「当前设备未认领」 */
  ownerOf: (projectId: string) => string | null;
  syncNow: () => Promise<void>;
  downloadAll: () => Promise<void>;
  pushOne: (id: string) => Promise<boolean>;
  removeOne: (id: string) => Promise<boolean>;
  removeMany: (ids: string[]) => Promise<{ ok: number; failed: string[] }>;
}

/* 记录「哪个本机项目属于哪个云端账号」：
 * 同一台设备换账号登录时，绝不能把上一个账号的项目推到新账号下
 * （服务端 RLS 会拒绝，前端也不应该尝试）。 */
/* 已删除项目（墓碑）的本地缓存：{ uid: [projectId...] }。
 * 云端表是权威，但离线 / 请求失败时也要能立刻压制「刚删掉又回来」，
 * 所以删的那一刻先落本地，下一次同步再补写到云端。 */
const DEL_KEY = 'lunasol.deleted.v1';
function readDeleted(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(DEL_KEY) || '{}') as Record<string, string[]>; } catch { return {}; }
}
function writeDeleted(m: Record<string, string[]>) {
  try { localStorage.setItem(DEL_KEY, JSON.stringify(m)); } catch { /* 配额不足时忽略 */ }
}

const OWNER_KEY = 'lunasol.cloud.owners.v1';
function readOwners(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(OWNER_KEY) || '{}') as Record<string, string>; } catch { return {}; }
}
function writeOwners(m: Record<string, string>) {
  try { localStorage.setItem(OWNER_KEY, JSON.stringify(m)); } catch { /* 配额不足时忽略 */ }
}

/** 单例内部实现：整个应用只跑一份同步循环，避免多个页面重复上传 */
function useCloudSyncState(): CloudSync {
  const { user } = useAuth();
  const { isPro, loading: subLoading } = useSubscription();
  const { s, update, mergeCloudProjects, dropProjects, setToast } = useApp();
  const [state, setState] = useState<SyncState>('off');
  const [message, setMessage] = useState(tl('未登录：项目只保存在本机浏览器', 'Not signed in: projects stay in this browser'));
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [cloudCount, setCloudCount] = useState<number | null>(null);
  const mergedFor = useRef<string | null>(null);
  const pushedAt = useRef<Record<string, number>>({});
  const owners = useRef<Record<string, string>>(readOwners());
  const cloudIdsRef = useRef<Set<string>>(new Set());
  /** 已删除的 project_id（本地缓存 ∪ 云端墓碑）：同步时用它压制复活 */
  const tombstones = useRef<Set<string>>(new Set());
  /** 已完成首次同步的账号：在那之前不允许自动上传，否则可能在拉到「墓碑」之前
   *  就把别处已删除的项目又推回云端（同步虽会自愈，但会白跑一轮、也可能闪一下）。 */
  const syncedFor = useRef<string | null>(null);
  const deletedStore = useRef<Record<string, string[]>>(readDeleted());
  const running = useRef(false);
  const projectsRef = useRef(s.projects);
  projectsRef.current = s.projects;

  const ownerOf = useCallback((id: string) => owners.current[id] || null, []);

  const claim = useCallback((ids: string[], uid: string) => {
    if (!ids.length) return;
    const next = { ...owners.current };
    ids.forEach((id) => { next[id] = uid; });
    owners.current = next;
    writeOwners(next);
  }, []);

  /** 记下「这些项目已被删除」：先写本地（立刻生效），再补写云端（供其他设备读取） */
  const rememberDeleted = useCallback((uid: string, ids: string[]) => {
    if (!uid || !ids.length) return;
    const next = { ...deletedStore.current };
    const set = new Set([...(next[uid] || []), ...ids]);
    next[uid] = Array.from(set).slice(-1000);
    deletedStore.current = next;
    writeDeleted(next);
    ids.forEach((id) => tombstones.current.add(id));
    void markDeleted(uid, ids).then((r) => {
      if (!r.ok) setMessage(tl(`删除记录暂时没同步到云端：${r.message}（下次同步会自动补写）`, `Deletions have not reached the cloud yet: ${r.message} (the next sync will write them)`));
    });
  }, []);

  /** 拉取墓碑（本地 ∪ 云端），并把只在本地的那批补写上去 */
  const refreshTombstones = useCallback(async (uid: string): Promise<Set<string>> => {
    const local = deletedStore.current[uid] || [];
    const r = await listDeleted(uid);
    const cloudIds = r.ok ? r.data : [];
    const missing = local.filter((id) => !cloudIds.includes(id));
    if (missing.length) void markDeleted(uid, missing);
    const set = new Set([...local, ...cloudIds]);
    tombstones.current = set;
    return set;
  }, []);

  /** 全量同步：先合并云端，再把本地多出来的项目上传。
   *  云同步是会员权益：免费用户只在本机保存，不自动上传；
   *  但「取回云端项目」始终开放，避免会员到期后取不回已有作品。 */
  const syncNow = useCallback(async () => {
    if (!user) { setState('off'); setMessage(tl('未登录：项目只保存在本机浏览器', 'Not signed in: projects stay in this browser')); return; }
    if (!isPro) { setState('off'); setMessage(tl('云同步为会员权益：当前作品只保存在本机浏览器', 'Cloud sync is a member benefit: work stays in this browser for now')); return; }
    if (running.current) return;
    running.current = true;
    setState('syncing');
    setMessage(tl('正在与云端合并…', 'Merging with the cloud…'));
    try {
      /* 先取「删过哪些」再去拉项目：顺序反过来的话，已删除的项目会先在界面上闪一下 */
      const tombs = await refreshTombstones(user.id);

      const pulled = await pullAll();
      if (!pulled.ok) {
        setState('error');
        setMessage(pulled.message);
        return;
      }
      /* 云端仍带着墓碑里的 id = 之前那次 DELETE 没成功（或另一台设备刚把它传回去）。
         这类行不合并，并顺手清掉云端残行，避免它一直占着列表与次数。 */
      const ghosts = pulled.data.filter((p) => tombs.has(p.id));
      const alive = pulled.data.filter((p) => !tombs.has(p.id));
      if (ghosts.length) void removeManyProjects(user.id, ghosts.map((p) => p.id));

      mergeCloudProjects(alive);
      claim(alive.map((p) => p.id), user.id);
      cloudIdsRef.current = new Set(alive.map((p) => p.id));
      setCloudCount(cloudIdsRef.current.size);
      /* 其他设备删过的项目，本机若还留着副本也一并丢弃：这就是「一处删除，处处消失」 */
      if (tombs.size) dropProjects(Array.from(tombs));

      const cloudIds = cloudIdsRef.current;
      // 等一拍让 store 合并结果落到 projectsRef，再决定要上传哪些
      await new Promise((r) => setTimeout(r, 60));
      const ups = projectsRef.current.filter((p) => {
        if (cloudIds.has(p.id)) return false;
        if (tombs.has(p.id)) return false;      // 删过的永不回传
        const o = owners.current[p.id];
        return !o || o === user.id;   // 属于其他账号的本机项目不上传
      });
      const skipped = projectsRef.current.filter((p) => !cloudIds.has(p.id) && !tombs.has(p.id)
        && owners.current[p.id] && owners.current[p.id] !== user.id).length;
      if (ups.length) {
        const r = await pushMany(user.id, ups);
        if (r.failed.length) {
          setState('error');
          setMessage(tl(`已上传 ${r.ok} 个，${r.failed.length} 个失败：${r.failed[0].message}`, `Uploaded ${r.ok}, ${r.failed.length} failed: ${r.failed[0].message}`));
          return;
        }
        ups.forEach((p) => { pushedAt.current[p.id] = p.updatedAt; cloudIdsRef.current.add(p.id); });
        claim(ups.map((p) => p.id), user.id);
      }
      const total = cloudIdsRef.current.size;
      setCloudCount(total);
      setLastSync(Date.now());
      syncedFor.current = user.id;
      setState('ok');
      setMessage(tl(`已同步 ${total} 个项目${skipped ? ` · ${skipped} 个属于其他账号，未上传` : ''} · ${timeLabel(new Date().toISOString())}`, `${total} projects synced${skipped ? ` · ${skipped} belong to another account and were skipped` : ''} · ${timeLabel(new Date().toISOString())}`));
    } catch (e) {
      setState('error');
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
    }
  }, [user, isPro, mergeCloudProjects]);

  /** 登录 / 会员状态变化时做一次合并；非会员或退出后停止一切上传 */
  useEffect(() => {
    if (!user) {
      mergedFor.current = null;
      syncedFor.current = null;
      pushedAt.current = {};
      cloudIdsRef.current = new Set();
      tombstones.current = new Set();
      setCloudCount(null);
      setState('off');
      setMessage(tl('未登录：项目只保存在本机浏览器', 'Not signed in: projects stay in this browser'));
      return;
    }
    // 订阅还没加载完先等，避免把刚开通的会员判成免费用户
    if (subLoading) return;
    if (!isPro) {
      mergedFor.current = null;
      setState('off');
      setMessage(tl('云同步为会员权益：当前作品只保存在本机浏览器', 'Cloud sync is a member benefit: work stays in this browser for now'));
      return;
    }
    if (mergedFor.current === user.id) return;
    mergedFor.current = user.id;
    void syncNow();
  }, [user, isPro, subLoading, syncNow]);

  /** 变更自动上传（4 秒防抖，只传有新修改且属于当前账号的项目） */
  useEffect(() => {
    if (!user || !isPro) return;
    if (syncedFor.current !== user.id) return;   // 首次同步（含墓碑）完成后再允许自动上传
    const dirty = s.projects.filter((p) => {
      if (tombstones.current.has(p.id)) return false;   // 删过的不再上传
      const o = owners.current[p.id];
      if (o && o !== user.id) return false;
      return (pushedAt.current[p.id] ?? 0) < p.updatedAt;
    });
    if (!dirty.length) return;
    const t = window.setTimeout(async () => {
      setState('syncing');
      const r = await pushMany(user.id, dirty);
      dirty.forEach((p) => { pushedAt.current[p.id] = p.updatedAt; });
      if (r.failed.length) {
        setState('error');
        setMessage(tl(`自动同步失败：${r.failed[0].message}`, `Auto-sync failed: ${r.failed[0].message}`));
      } else {
        claim(dirty.map((p) => p.id), user.id);
        dirty.forEach((p) => cloudIdsRef.current.add(p.id));
        setCloudCount(cloudIdsRef.current.size);
        setState('ok');
        setLastSync(Date.now());
        setMessage(tl(`已自动同步 ${r.ok} 个项目 · ${timeLabel(new Date().toISOString())}`, `${r.ok} projects auto-synced · ${timeLabel(new Date().toISOString())}`));
      }
    }, 4000);
    return () => window.clearTimeout(t);
  }, [s.projects, user, isPro, claim]);

  const downloadAll = useCallback(async () => {
    if (!user) { setToast('请先登录再下载云端项目'); return; }
    setState('syncing');
    const tombs = await refreshTombstones(user.id);
    const r = await pullAll();
    if (!r.ok) { setState('error'); setMessage(r.message); setToast(r.message); return; }
    const alive = r.data.filter((p) => !tombs.has(p.id));
    const ghosts = r.data.filter((p) => tombs.has(p.id));
    if (ghosts.length) void removeManyProjects(user.id, ghosts.map((p) => p.id));
    mergeCloudProjects(alive);
    claim(alive.map((p) => p.id), user.id);
    if (tombs.size) dropProjects(Array.from(tombs));
    const list = await listProjects();
    if (list.ok) { cloudIdsRef.current = new Set(list.data.map((x) => projectIdOf(x.id))); setCloudCount(alive.length); }
    syncedFor.current = user.id;
    setState('ok');
    setLastSync(Date.now());
    setMessage(tl(`已从云端取回 ${alive.length} 个项目`, `Restored ${alive.length} projects from the cloud`));
    setToast(`已取回 ${r.data.length} 个云端项目`);
  }, [user, mergeCloudProjects, setToast, claim]);

  const pushOne = useCallback(async (id: string) => {
    if (!user) { setToast('请先登录再同步'); return false; }
    if (!isPro) { setToast('云同步为会员权益，开通后即可跨设备同步'); return false; }
    const p = projectsRef.current.find((x) => x.id === id);
    if (!p) return false;
    const o = owners.current[id];
    if (o && o !== user.id) {
      setToast('这个项目属于另一个账号，请登录该账号后再同步');
      return false;
    }
    setState('syncing');
    const r = await pushProject(user.id, p);
    if (!r.ok) { setState('error'); setMessage(r.message); setToast(r.message); return false; }
    pushedAt.current[id] = p.updatedAt;
    claim([id], user.id);
    cloudIdsRef.current.add(id);
    setCloudCount(cloudIdsRef.current.size);
    setState('ok');
    setLastSync(Date.now());
    setMessage(tl(`已同步「${p.name}」· ${timeLabel(new Date().toISOString())}`, `“${p.name}” synced · ${timeLabel(new Date().toISOString())}`));
    update({});
    return true;
  }, [user, isPro, setToast, update, claim]);

  const removeOne = useCallback(async (id: string) => {
    if (!user) return false;
    /* 先记墓碑再发 DELETE：DELETE 失败（网络抖动 / 网关 5xx）时，
       这个 id 仍然会被墓碑压住，不会再从云端被拉回来。 */
    rememberDeleted(user.id, [id]);
    const r = await removeProject(user.id, id);
    delete pushedAt.current[id];
    cloudIdsRef.current.delete(projectIdOf(id));
    setCloudCount(cloudIdsRef.current.size);
    setToast(r.ok
      ? tl('已删除，其他设备下次同步也会消失', 'Deleted — it will disappear on your other devices at their next sync')
      : tl(`已从各端删除；云端副本稍后自动清理（${r.message}）`, `Deleted everywhere; the cloud copy will be cleaned up shortly (${r.message})`));
    return true;
  }, [user, setToast, rememberDeleted]);

  const removeMany = useCallback(async (ids: string[]) => {
    if (!user) return { ok: 0, failed: [...ids] };
    rememberDeleted(user.id, ids);
    const r = await removeManyProjects(user.id, ids);
    ids.forEach((id) => {
      delete pushedAt.current[id];
      cloudIdsRef.current.delete(projectIdOf(id));
    });
    setCloudCount(cloudIdsRef.current.size);
    // 云端 DELETE 失败的个数不等于「会回来」：墓碑已经生效，下次同步会顺手把残行清掉
    if (r.failed.length > 0) setToast(`已删除 ${ids.length} 个（${r.failed.length} 个云端副本稍后自动清理，不会再出现）`);
    else setToast(`已删除 ${ids.length} 个项目，其他设备同步后也会消失`);
    return { ok: ids.length - r.failed.length, failed: r.failed };
  }, [user, setToast, rememberDeleted]);

  return { state, message, lastSync, cloudCount, ownerOf, syncNow, downloadAll, pushOne, removeOne, removeMany };
}

const SyncCtx = createContext<CloudSync | null>(null);

export function CloudSyncProvider({ children }: { children: React.ReactNode }) {
  const v = useCloudSyncState();
  return <SyncCtx.Provider value={v}>{children}</SyncCtx.Provider>;
}

export function useCloudSync(): CloudSync {
  const c = useContext(SyncCtx);
  if (!c) throw new Error('CloudSyncProvider missing');
  return c;
}
