/* ============================================================
   Studio 2.0 — 单个项目的读写与自动保存
   ------------------------------------------------------------
   顺序永远是「先落本机，再上云」：
   用户每改一步，立刻写 localStorage（刷新 / 断网都不丢），
   900ms 防抖后再推云端。云端失败只改状态文案，不回滚任何输入。
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../cloud/auth';
import {
  cacheOne, cachedProject, pullStudioByRow, pushStudio,
} from './api';
import { projectName, type StudioProject } from './types';

export type SaveState = 'idle' | 'saving' | 'saved' | 'local' | 'error';
export type LoadState = 'loading' | 'ready' | 'missing';

export function useStudioProject(id: string) {
  const auth = useAuth();
  const owner = auth.user?.id || '';
  const [project, setProject] = useState<StudioProject | null>(() => cachedProject(id, owner));
  const [loadState, setLoadState] = useState<LoadState>(() => (cachedProject(id, owner) ? 'ready' : 'loading'));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState(0);
  const [message, setMessage] = useState('');

  const live = useRef<StudioProject | null>(project);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const uid = auth.user?.id || '';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; window.clearTimeout(timer.current); };
  }, []);

  /* ------------------------------ 读取 ------------------------------ */
  useEffect(() => {
    if (!uid) return;
    let alive = true;
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
  }, [uid, id]);

  /* ------------------------------ 写云端 ------------------------------ */
  const flush = useCallback(async (p: StudioProject) => {
    if (!uid) { setSaveState('local'); return; }
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
      if (!cur || !dirty.current || !uid) return;
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
