/* ============================================================
   Studio 2.0 — 单个项目的读写与自动保存
   ------------------------------------------------------------
   顺序永远是「先落本机，再上云」：
   用户每改一步，立刻写 localStorage（刷新 / 断网都不丢），
   900ms 防抖后再推云端。云端失败只改状态文案，不回滚任何输入。
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../cloud/auth';
import { CLOUD_SYNC } from '../cloud/config';
import { localIdentity } from '../cloud/localIdentity';
import {
  cacheOne, cachedProject, pullStudioByRow, pushStudio,
} from './api';
import { projectName, type StudioProject } from './types';

export type SaveState = 'idle' | 'saving' | 'saved' | 'local' | 'error';
/** locked = 未登录。项目按账号存档，没登录时既读不到本机缓存也读不到云端，
 *  必须给一个明确的出口，不能让转圈一直转下去。 */
export type LoadState = 'loading' | 'ready' | 'missing' | 'locked';

export function useStudioProject(id: string) {
  const auth = useAuth();
  /* 云同步关闭时不依赖账号：用本机身份分槽，未登录也能正常打开工作台 */
  const owner = CLOUD_SYNC ? (auth.user?.id || '') : localIdentity();
  const [project, setProject] = useState<StudioProject | null>(() => cachedProject(id, owner));
  const [loadState, setLoadState] = useState<LoadState>(() => (cachedProject(id, owner) ? 'ready' : 'loading'));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState(0);
  const [message, setMessage] = useState('');

  const live = useRef<StudioProject | null>(project);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const uid = CLOUD_SYNC ? (auth.user?.id || '') : localIdentity();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; window.clearTimeout(timer.current); };
  }, []);

  /* ------------------------------ 读取 ------------------------------ */
  useEffect(() => {
    /* 会话还没确认完就先等；确认完了没有账号，直接进「需要登录」，
       否则这个页面会永远停在「正在打开…」——这条路由不强制登录，
       用户从旧链接进来时正好会踩到。 */
    if (CLOUD_SYNC && !auth.ready) return;
    if (!uid) { setLoadState('locked'); return; }
    let alive = true;
    /* 云同步关闭时只读本机缓存：设计稿不进数据库，换设备就看不见，这是当前阶段的口径 */
    if (!CLOUD_SYNC) {
      const local = cachedProject(id, uid);
      if (local) {
        live.current = local;
        setProject(local);
        setSavedAt(local.updatedAt);
        setLoadState('ready');
      } else {
        setLoadState('missing');
      }
      return () => { alive = false; };
    }
    void (async () => {
      const r = await pullStudioByRow(uid, id);
      if (!alive) return;
      if (!r.ok) {
        // 云端没有这条：本机有就继续用（刚建的项目还没推上去）
        if (!live.current) setLoadState('missing');
        return;
      }
      const cloud = r.data;
      const cur = live.current;
      // 本机有未推送的改动时不覆盖，避免「刚填的字被云端旧版刷掉」
      if (!cur || (!dirty.current && cloud.updatedAt > cur.updatedAt)) {
        live.current = cloud;
        setProject(cloud);
        cacheOne(cloud);
        setSavedAt(cloud.updatedAt);
      }
      setLoadState('ready');
    })();
    return () => { alive = false; };
  }, [uid, id, auth.ready]);

  /* ------------------------------ 写云端 ------------------------------ */
  const flush = useCallback(async (p: StudioProject) => {
    if (!uid || !CLOUD_SYNC) { setSaveState('local'); return; }
    const r = await pushStudio(uid, p);
    if (!mounted.current) return;
    if (r.ok) {
      // 只有推的确实是最新版才算「已保存」
      if (live.current && live.current.updatedAt === p.updatedAt) {
        setSaveState('saved');
        setSavedAt(p.updatedAt);
        setMessage('');
      }
    } else {
      setSaveState('error');
      setMessage(r.message);
    }
  }, [uid]);

  /** 局部更新：函数式拿旧值，返回新整份项目 */
  const update = useCallback((fn: (cur: StudioProject) => StudioProject) => {
    const cur = live.current;
    if (!cur) return;
    const next = fn(cur);
    const stamped: StudioProject = {
      ...next,
      schema: 'lunasol.studio.v1',
      name: projectName(next.answers),
      updatedAt: Date.now(),
    };
    live.current = stamped;
    dirty.current = true;
    setProject(stamped);
    cacheOne(stamped);
    setSaveState('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(stamped); }, 900);
  }, [flush]);

  /** 立刻保存（确认需求、离开页面前用） */
  const saveNow = useCallback(async () => {
    const cur = live.current;
    if (!cur) return false;
    window.clearTimeout(timer.current);
    if (!CLOUD_SYNC) { setSaveState('local'); setSavedAt(cur.updatedAt); return true; }
    const r = uid ? await pushStudio(uid, cur) : { ok: false as const, message: '未登录' };
    if (r.ok) { setSaveState('saved'); setSavedAt(cur.updatedAt); return true; }
    setSaveState('error');
    setMessage(r.message);
    return false;
  }, [uid]);

  // 卸载 / 关页面前把还没推的改动补一次，不留在「只在本机」
  useEffect(() => {
    const onLeave = () => {
      const cur = live.current;
      if (!cur || !dirty.current || !uid || !CLOUD_SYNC) return;
      void pushStudio(uid, cur);
    };
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      onLeave();
    };
  }, [uid]);

  return { project, loadState, saveState, savedAt, message, update, saveNow, uid };
}
