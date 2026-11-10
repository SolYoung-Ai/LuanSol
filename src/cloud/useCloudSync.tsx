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
import { useAuth } from './auth';
import { useSubscription } from './subscription';
import { listProjects, pushMany, pushProject, pullAll, removeProject, removeManyProjects, projectIdOf, timeLabel } from './projects';

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
  const { s, update, mergeCloudProjects, setToast } = useApp();
  const [state, setState] = useState<SyncState>('off');
  const [message, setMessage] = useState('未登录：项目只保存在本机浏览器');
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [cloudCount, setCloudCount] = useState<number | null>(null);
  const mergedFor = useRef<string | null>(null);
  const pushedAt = useRef<Record<string, number>>({});
  const owners = useRef<Record<string, string>>(readOwners());
  const cloudIdsRef = useRef<Set<string>>(new Set());
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

  /** 全量同步：先合并云端，再把本地多出来的项目上传。
   *  云同步是会员权益：免费用户只在本机保存，不自动上传；
   *  但「取回云端项目」始终开放，避免会员到期后取不回已有作品。 */
  const syncNow = useCallback(async () => {
    if (!user) { setState('off'); setMessage('未登录：项目只保存在本机浏览器'); return; }
    if (!isPro) { setState('off'); setMessage('云同步为会员权益：当前作品只保存在本机浏览器'); return; }
    if (running.current) return;
    running.current = true;
    setState('syncing');
    setMessage('正在与云端合并…');
    try {
      const pulled = await pullAll();
      if (pulled.ok) {
        mergeCloudProjects(pulled.data);
        claim(pulled.data.map((p) => p.id), user.id);
        cloudIdsRef.current = new Set(pulled.data.map((p) => p.id));
        setCloudCount(cloudIdsRef.current.size);
      } else {
        setState('error');
        setMessage(pulled.message);
        return;
      }
      const cloudIds = new Set(pulled.data.map((p) => p.id));
      // 等一拍让 store 合并结果落到 projectsRef，再决定要上传哪些
      await new Promise((r) => setTimeout(r, 60));
      const ups = projectsRef.current.filter((p) => {
        if (cloudIds.has(p.id)) return false;
        const o = owners.current[p.id];
        return !o || o === user.id;   // 属于其他账号的本机项目不上传
      });
      const skipped = projectsRef.current.filter((p) => !cloudIds.has(p.id) && owners.current[p.id] && owners.current[p.id] !== user.id).length;
      if (ups.length) {
        const r = await pushMany(user.id, ups);
        if (r.failed.length) {
          setState('error');
          setMessage(`已上传 ${r.ok} 个，${r.failed.length} 个失败：${r.failed[0].message}`);
          return;
        }
        ups.forEach((p) => { pushedAt.current[p.id] = p.updatedAt; cloudIdsRef.current.add(p.id); });
        claim(ups.map((p) => p.id), user.id);
      }
      const total = cloudIdsRef.current.size;
      setCloudCount(total);
      setLastSync(Date.now());
      setState('ok');
      setMessage(`已同步 ${total} 个项目${skipped ? ` · ${skipped} 个属于其他账号，未上传` : ''} · ${timeLabel(new Date().toISOString())}`);
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
      pushedAt.current = {};
      cloudIdsRef.current = new Set();
      setCloudCount(null);
      setState('off');
      setMessage('未登录：项目只保存在本机浏览器');
      return;
    }
    // 订阅还没加载完先等，避免把刚开通的会员判成免费用户
    if (subLoading) return;
    if (!isPro) {
      mergedFor.current = null;
      setState('off');
      setMessage('云同步为会员权益：当前作品只保存在本机浏览器');
      return;
    }
    if (mergedFor.current === user.id) return;
    mergedFor.current = user.id;
    void syncNow();
  }, [user, isPro, subLoading, syncNow]);

  /** 变更自动上传（4 秒防抖，只传有新修改且属于当前账号的项目） */
  useEffect(() => {
    if (!user || !isPro) return;
    const dirty = s.projects.filter((p) => {
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
        setMessage(`自动同步失败：${r.failed[0].message}`);
      } else {
        claim(dirty.map((p) => p.id), user.id);
        dirty.forEach((p) => cloudIdsRef.current.add(p.id));
        setCloudCount(cloudIdsRef.current.size);
        setState('ok');
        setLastSync(Date.now());
        setMessage(`已自动同步 ${r.ok} 个项目 · ${timeLabel(new Date().toISOString())}`);
      }
    }, 4000);
    return () => window.clearTimeout(t);
  }, [s.projects, user, isPro, claim]);

  const downloadAll = useCallback(async () => {
    if (!user) { setToast('请先登录再下载云端项目'); return; }
    setState('syncing');
    const r = await pullAll();
    if (!r.ok) { setState('error'); setMessage(r.message); setToast(r.message); return; }
    mergeCloudProjects(r.data);
    claim(r.data.map((p) => p.id), user.id);
    const list = await listProjects();
    if (list.ok) { cloudIdsRef.current = new Set(list.data.map((x) => projectIdOf(x.id))); setCloudCount(cloudIdsRef.current.size); }
    setState('ok');
    setLastSync(Date.now());
    setMessage(`已从云端取回 ${r.data.length} 个项目`);
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
    setMessage(`已同步「${p.name}」· ${timeLabel(new Date().toISOString())}`);
    update({});
    return true;
  }, [user, isPro, setToast, update, claim]);

  const removeOne = useCallback(async (id: string) => {
    if (!user) return false;
    const r = await removeProject(user.id, id);
    if (!r.ok) { setToast(r.message); return false; }
    delete pushedAt.current[id];
    cloudIdsRef.current.delete(projectIdOf(id));
    setCloudCount(cloudIdsRef.current.size);
    setToast('已从云端删除该项目');
    return true;
  }, [user, setToast]);

  const removeMany = useCallback(async (ids: string[]) => {
    if (!user) return { ok: 0, failed: [...ids] };
    const r = await removeManyProjects(user.id, ids);
    ids.forEach((id) => {
      delete pushedAt.current[id];
      cloudIdsRef.current.delete(projectIdOf(id));
    });
    setCloudCount(cloudIdsRef.current.size);
    if (r.failed.length > 0) setToast(`已删除 ${r.ok} 个，${r.failed.length} 个失败（刷新后会回来）`);
    else setToast(`已删除 ${r.ok} 个项目`);
    return r;
  }, [user, setToast]);

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
