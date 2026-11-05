/* 全局项目仓库：IndexedDB 优先，localStorage 兜底；所有智能体共享同一份项目数据。 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AISettings, ChatMessage, DesignBrief, DesignDoc, Dieline, PrepressReport, Project, UserSettings, Version } from './types';
import { createEmptyBrief } from './engine/brief';
import { buildDieline } from './engine/structure';
import { DEFAULT_AI, migrateAI } from './engine/llm';
import { cloneDesign } from './engine/design';
import { uid } from './engine/utils';
import { createEmptyDraft, normalizeDraft, type ProjectDraft } from './v3/draft';

const DB_NAME = 'lunasol-studio';
const STORE = 'state';
const LS = 'lunasol.state.v1';

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function idbSave(data: unknown) {
  const db = await openDB();
  if (!db) { try { localStorage.setItem(LS, JSON.stringify(data)); } catch { /* 配额不足 */ } return 'localStorage'; }
  return new Promise<string>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, 'app');
    tx.oncomplete = () => { db.close(); resolve('IndexedDB'); };
    tx.onerror = () => { db.close(); try { localStorage.setItem(LS, JSON.stringify(data)); } catch { /* ignore */ } resolve('localStorage'); };
  });
}
async function idbLoad(): Promise<unknown | null> {
  const db = await openDB();
  if (!db) { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get('app');
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); try { resolve(JSON.parse(localStorage.getItem(LS) || 'null')); } catch { resolve(null); } };
  });
}

export const DEFAULT_SETTINGS: UserSettings = {
  name: '创作者', advancedMode: false, defaultUnit: 'mm', bleed: 3, printDpi: 300, autoSave: true,
};

interface Persisted {
  projects: Project[];
  activeId: string | null;
  brief: DesignBrief;
  chat: ChatMessage[];
  schemes: DesignDoc[];
  design: DesignDoc | null;
  report: PrepressReport | null;
  settings: UserSettings;
  ai: AISettings;
  storage: string;
  /** V3 十步向导的统一项目数据（旧数据没有此字段，载入时兜底） */
  draft: ProjectDraft;
}

const initial = (): Persisted => ({
  projects: [], activeId: null, brief: createEmptyBrief(), chat: [], schemes: [], design: null,
  report: null, settings: { ...DEFAULT_SETTINGS }, ai: { ...DEFAULT_AI }, storage: '—',
  draft: createEmptyDraft(),
});

interface AppCtx {
  s: Persisted;
  dieline: Dieline;
  toast: string | null;
  setToast: (t: string | null) => void;
  update: (p: Partial<Persisted>) => void;
  patchBrief: (p: Partial<DesignBrief>) => void;
  /** 局部更新 V3 十步向导数据（自动保存、返回上一步不丢数据） */
  patchDraft: (p: Partial<ProjectDraft> | ((d: ProjectDraft) => Partial<ProjectDraft>)) => void;
  addChat: (m: Omit<ChatMessage, 'id' | 'at'>) => void;
  clearChat: () => void;
  refreshDieline: () => Dieline;
  saveProject: (name?: string) => Project;
  syncProject: () => void;
  loadProject: (id: string) => void;
  /** 把云端项目并入本地：同 id 取 updatedAt 更新的一方，云端独有则新增 */
  mergeCloudProjects: (list: Project[]) => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => void;
  newProject: () => void;
  addVersion: (label: string) => void;
  restoreVersion: (id: string) => void;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => { const c = useContext(Ctx); if (!c) throw new Error('AppContext missing'); return c; };

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<Persisted>(initial);
  const [toast, setToast] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    idbLoad().then((v) => {
      if (v && typeof v === 'object') setS((prev) => ({
        ...prev, ...(v as Partial<Persisted>),
        settings: { ...DEFAULT_SETTINGS, ...(v as Persisted).settings },
        ai: migrateAI({ ...DEFAULT_AI, ...(v as Persisted).ai }),
        draft: normalizeDraft((v as Persisted).draft),
      }));
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      idbSave(s).then((kind) => setS((prev) => prev.storage === kind ? prev : { ...prev, storage: kind }));
    }, 350);
    return () => window.clearTimeout(saveTimer.current);
  }, [s, ready]);

  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 3200); return () => clearTimeout(t); }, [toast]);

  const update = useCallback((p: Partial<Persisted>) => setS((prev) => ({ ...prev, ...p })), []);
  const patchBrief = useCallback((p: Partial<DesignBrief>) => setS((prev) => ({ ...prev, brief: { ...prev.brief, ...p } })), []);
  const patchDraft = useCallback((p: Partial<ProjectDraft> | ((d: ProjectDraft) => Partial<ProjectDraft>)) => setS((prev) => {
    const next = typeof p === 'function' ? p(prev.draft) : p;
    return { ...prev, draft: normalizeDraft({ ...prev.draft, ...next, savedAt: Date.now() }) };
  }), []);
  const addChat = useCallback((m: Omit<ChatMessage, 'id' | 'at'>) => setS((prev) => ({ ...prev, chat: [...prev.chat, { ...m, id: uid('msg'), at: Date.now() }] })), []);
  const clearChat = useCallback(() => setS((prev) => ({ ...prev, chat: [] })), []);

  const dieline = useMemo(() => buildDieline(s.brief.structure, s.brief.size.l ? s.brief.size : { l: 200, w: 150, h: 80 }, s.settings.bleed, 5), [s.brief.structure, s.brief.size, s.settings.bleed]);

  const refreshDieline = useCallback(() => buildDieline(s.brief.structure, s.brief.size, s.settings.bleed, 5), [s.brief, s.settings.bleed]);

  const saveProject = useCallback((name?: string): Project => {
    let result!: Project;
    setS((prev) => {
      const id = prev.activeId || uid('proj');
      const old = prev.projects.find((p) => p.id === id);
      const now = Date.now();
      const versions = prev.design
        ? [...(old?.versions || []), { id: uid('ver'), label: '自动保存', at: now, design: cloneDesign(prev.design) }].slice(-20)
        : (old?.versions || []);
      const proj: Project = {
        id, name: name || old?.name || (prev.brief.brand ? `${prev.brief.brand} · ${prev.brief.product || '包装'}` : '未命名包装项目'),
        brief: prev.brief, structure: prev.brief.structure,
        scheme: prev.design?.scheme || 'minimal', design: prev.design ? cloneDesign(prev.design) : null,
        versions, createdAt: old?.createdAt || now, updatedAt: now,
        status: prev.report ? 'checked' : prev.design ? 'designing' : 'draft',
      };
      result = proj;
      const others = prev.projects.filter((p) => p.id !== id);
      return { ...prev, activeId: id, projects: [proj, ...others] };
    });
    return result;
  }, []);

  /** 静默同步当前设计到项目（不新增历史版本），用于自动保存 */
  const syncProject = useCallback(() => setS((prev) => {
    if (!prev.activeId || !prev.design) return prev;
    return { ...prev, projects: prev.projects.map((p) => p.id === prev.activeId ? { ...p, design: cloneDesign(prev.design!), updatedAt: Date.now() } : p) };
  }), []);

  const loadProject = useCallback((id: string) => {
    setS((prev) => {
      const p = prev.projects.find((x) => x.id === id);
      if (!p) return prev;
      return { ...prev, activeId: p.id, brief: p.brief, design: p.design ? cloneDesign(p.design) : null, schemes: [], report: null, chat: [] };
    });
  }, []);

  const mergeCloudProjects = useCallback((list: Project[]) => setS((prev) => {
    if (!list.length) return prev;
    const map = new Map(prev.projects.map((p) => [p.id, p]));
    let changed = false;
    for (const c of list) {
      const local = map.get(c.id);
      if (!local) { map.set(c.id, c); changed = true; continue; }
      if ((c.updatedAt || 0) > (local.updatedAt || 0)) { map.set(c.id, c); changed = true; }
    }
    if (!changed) return prev;
    const projects = [...map.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return { ...prev, projects };
  }), []);

  const deleteProject = useCallback((id: string) => setS((prev) => ({
    ...prev, projects: prev.projects.filter((p) => p.id !== id), activeId: prev.activeId === id ? null : prev.activeId,
  })), []);

  const duplicateProject = useCallback((id: string) => setS((prev) => {
    const p = prev.projects.find((x) => x.id === id);
    if (!p) return prev;
    return { ...prev, projects: [{ ...p, id: uid('proj'), name: `${p.name}（副本）`, createdAt: Date.now(), updatedAt: Date.now() }, ...prev.projects] };
  }), []);

  const newProject = useCallback(() => setS((prev) => ({
    ...prev, activeId: null, brief: createEmptyBrief(), chat: [], schemes: [], design: null, report: null,
    draft: createEmptyDraft(),
  })), []);

  const addVersion = useCallback((label: string) => setS((prev) => {
    if (!prev.design || !prev.activeId) return prev;
    const projects = prev.projects.map((p) => p.id === prev.activeId ? {
      ...p, design: cloneDesign(prev.design!), updatedAt: Date.now(),
      versions: [...p.versions, { id: uid('ver'), label, at: Date.now(), design: cloneDesign(prev.design!) }].slice(-30),
    } : p);
    return { ...prev, projects };
  }), []);

  const restoreVersion = useCallback((id: string) => setS((prev) => {
    const p = prev.projects.find((x) => x.id === prev.activeId);
    const v: Version | undefined = p?.versions.find((x) => x.id === id);
    if (!v) return prev;
    return { ...prev, design: cloneDesign(v.design), projects: prev.projects.map((x) => x.id === prev.activeId ? { ...x, design: cloneDesign(v.design), updatedAt: Date.now() } : x) };
  }), []);

  const value: AppCtx = {
    s, dieline, toast, setToast, update, patchBrief, patchDraft, addChat, clearChat, refreshDieline,
    saveProject, syncProject, loadProject, mergeCloudProjects, deleteProject, duplicateProject, newProject, addVersion, restoreVersion,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
