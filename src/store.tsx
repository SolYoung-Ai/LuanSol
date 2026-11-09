/* 全局项目仓库：IndexedDB 优先，localStorage 兜底；所有智能体共享同一份项目数据。 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AISettings, Asset, ChatMessage, CreationMode, DesignBrief, DesignDoc, Dieline, PrepressReport, ProductInfo, Project, ProjectWorkflow, ReferenceImage, UserSettings, Version } from './types';
import { createEmptyBrief } from './engine/brief';
import { buildDieline } from './engine/structure';
import { DEFAULT_AI, migrateAI } from './engine/llm';
import { cloneDesign } from './engine/design';
import { uid } from './engine/utils';
import { createEmptyDraft, normalizeDraft, type ProjectDraft } from './v3/draft';
import { createInitialWorkflow } from './types';
import { migrateProject } from './migrations';

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
  /** V3 九步向导的统一项目数据（旧数据没有此字段，载入时兜底） */
  draft: ProjectDraft;
  /** 独立素材库（持久化，可跨项目复用） */
  assets: Asset[];
}

const initial = (): Persisted => ({
  projects: [], activeId: null, brief: createEmptyBrief(), chat: [], schemes: [], design: null,
  report: null, settings: { ...DEFAULT_SETTINGS }, ai: { ...DEFAULT_AI }, storage: '—',
  draft: createEmptyDraft(), assets: [],
});

interface AppCtx {
  s: Persisted;
  dieline: Dieline;
  toast: string | null;
  setToast: (t: string | null) => void;
  update: (p: Partial<Persisted>) => void;
  patchBrief: (p: Partial<DesignBrief>) => void;
  /** 局部更新 V3 九步向导数据（自动保存、返回上一步不丢数据） */
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
  /** 开一份新的空草稿（草稿箱可见），供「开始设计 / 新建设计」从第 1 步重新开始 */
  startEmptyDraft: () => string;
  /** V2：创建带 AI 工作流的真实项目并设为当前项目 */
  createWorkflowProject: (input: {
    mode: CreationMode;
    productInfo: ProductInfo;
    referenceImages: ReferenceImage[];
    name?: string;
  }) => Project;
  /** V2：局部更新某项目的工作流数据，刷新 updatedAt */
  patchWorkflow: (projectId: string, patch: Partial<ProjectWorkflow>) => void;
  /** V2：更新项目顶层字段（如组装后的 design、structure），刷新 updatedAt */
  updateProject: (projectId: string, patch: Partial<Project>) => void;
  addVersion: (label: string) => void;
  restoreVersion: (id: string) => void;
  addAsset: (asset: Asset) => void;
  removeAsset: (id: string) => void;
  toggleFavoriteAsset: (id: string) => void;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => { const c = useContext(Ctx); if (!c) throw new Error('AppContext missing'); return c; };

/** 轻提示的语气判定。
 *  之前所有提示都用 ✓ 对勾图标，包括「请先选择主颜色」这类拦截原因——
 *  对勾会让用户以为操作成功了。这里按文案把「需要用户处理」的提示识别为警示语气。 */
export function toastTone(text: string): 'ok' | 'warn' {
  if (!text) return 'ok';
  const warn = /请先|请选择|请填|请至少|请把|请输入|还需要|无法|不能|失败|不完整|不足|过期|未登录|未从|登录后|额度|受限|暂不支持|需要订阅|未设置|没有可用/;
  return warn.test(text) ? 'warn' : 'ok';
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<Persisted>(initial);
  const [toast, setToast] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  // 用户是否已主动删除过项目：一旦主动操作，「空 state 磁盘恢复」保护就不再适用，
  // 否则用户主动删光全部作品时，会被旧磁盘数据重新拉回。
  const userDeletedRef = useRef(false);

  useEffect(() => {
    idbLoad().then((v) => {
      if (v && typeof v === 'object') setS((prev) => {
        const loaded = v as Partial<Persisted>;
        return {
          ...prev,
          ...loaded,
          // 旧草稿的 workflow 可能缺后续新增字段，必须在进入 React 之前补全
          projects: Array.isArray(loaded.projects) ? loaded.projects.map(migrateProject) : prev.projects,
          settings: { ...DEFAULT_SETTINGS, ...loaded.settings },
          ai: migrateAI({ ...DEFAULT_AI, ...loaded.ai }),
          draft: normalizeDraft(loaded.draft),
        };
      });
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      // 防御：内存里项目为空时，先核对磁盘是否真的为空。
      // 若磁盘有数据而内存为空（异常重挂载 / 初始化竞态），用磁盘数据恢复，绝不能用空 state 覆盖真实作品。
      // 但用户主动删除导致的空（userDeletedRef）不在此列，必须如实保存空状态，不能把作品拉回。
      if (s.projects.length === 0 && !userDeletedRef.current) {
        const onDisk = await idbLoad();
        const diskProjects = onDisk && typeof onDisk === 'object' && Array.isArray((onDisk as Persisted).projects)
          ? (onDisk as Persisted).projects : [];
        if (diskProjects.length > 0) {
          setS((prev) => ({ ...(onDisk as Persisted), projects: diskProjects.map(migrateProject), storage: prev.storage }));
          return;
        }
      }
      const kind = await idbSave(s);
      setS((prev) => prev.storage === kind ? prev : { ...prev, storage: kind });
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

  const dieline = useMemo(() => buildDieline(s.brief.structure, s.brief.size.l ? s.brief.size : { l: 200, w: 150, h: 80 }, s.settings.bleed, 5, s.brief.structureExtra), [s.brief.structure, s.brief.size, s.settings.bleed, s.brief.structureExtra]);

  const refreshDieline = useCallback(() => buildDieline(s.brief.structure, s.brief.size, s.settings.bleed, 5, s.brief.structureExtra), [s.brief, s.settings.bleed]);

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
        // 保留 V2 工作流数据，旧路径保存不丢失
        workflow: old?.workflow,
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
    // 云端项目同样可能是旧结构（用户换设备 / 之前版本上传的），并入前先补全字段
    for (const raw of list) {
      const c = migrateProject(raw);
      const local = map.get(c.id);
      if (!local) { map.set(c.id, c); changed = true; continue; }
      if ((c.updatedAt || 0) > (local.updatedAt || 0)) { map.set(c.id, c); changed = true; }
    }
    if (!changed) return prev;
    const projects = [...map.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return { ...prev, projects };
  }), []);

  const deleteProject = useCallback((id: string) => {
    userDeletedRef.current = true;
    setS((prev) => ({
      ...prev, projects: prev.projects.filter((p) => p.id !== id), activeId: prev.activeId === id ? null : prev.activeId,
    }));
  }, []);

  const duplicateProject = useCallback((id: string) => setS((prev) => {
    const p = prev.projects.find((x) => x.id === id);
    if (!p) return prev;
    return { ...prev, projects: [{ ...p, id: uid('proj'), name: `${p.name}（副本）`, createdAt: Date.now(), updatedAt: Date.now() }, ...prev.projects] };
  }), []);

  const newProject = useCallback(() => setS((prev) => ({
    ...prev, activeId: null, brief: createEmptyBrief(), chat: [], schemes: [], design: null, report: null,
    draft: createEmptyDraft(),
  })), []);

  /** 新建空草稿：直接生成一个 stage=entry 的项目并设为当前项目。
   *  与 newProject 的区别是「有一个真实的草稿项目」，所以离开后能在草稿箱找到，
   *  也不会被编辑器里的默认工程初始化反覆盖。 */
  const startEmptyDraft = useCallback((): string => {
    let id = '';
    setS((prev) => {
      const existing = prev.projects.find((p) => p.workflow?.stage === 'entry' && !p.design);
      if (existing) {
        id = existing.id;
        return { ...prev, activeId: existing.id, design: null, chat: [], report: null };
      }
      const now = Date.now();
      const workflow = createInitialWorkflow(now);
      workflow.stage = 'entry';
      const proj: Project = {
        id: uid('proj'), name: '未命名草稿', brief: createEmptyBrief(),
        structure: 'tuck', scheme: 'minimal', design: null, versions: [],
        createdAt: now, updatedAt: now, status: 'draft', workflow,
      };
      id = proj.id;
      return {
        ...prev, activeId: id, projects: [proj, ...prev.projects],
        design: null, chat: [], report: null, brief: createEmptyBrief(),
      };
    });
    return id;
  }, []);

  /** V2：创建带 AI 工作流的真实项目。点「开始 AI 设计」后 stage 直接进入分析阶段。 */
  const createWorkflowProject = useCallback((input: {
    mode: CreationMode;
    productInfo: ProductInfo;
    referenceImages: ReferenceImage[];
    name?: string;
  }): Project => {
    let result!: Project;
    setS((prev) => {
      const now = Date.now();
      const id = uid('proj');
      const workflow = createInitialWorkflow(now);
      workflow.stage = 'requirements';
      workflow.mode = input.mode;
      workflow.productInfo = input.productInfo;
      workflow.referenceImages = input.referenceImages;
      const proj: Project = {
        id,
        name: input.name
          || input.productInfo.brandName
          || input.productInfo.productName
          || '未命名包装项目',
        brief: createEmptyBrief(),
        structure: 'tuck',
        scheme: 'minimal',
        design: null,
        versions: [],
        createdAt: now,
        updatedAt: now,
        status: 'draft',
        workflow,
      };
      result = proj;
      return { ...prev, activeId: id, projects: [proj, ...prev.projects] };
    });
    return result;
  }, []);

  /** V2：局部更新某项目的工作流，同步刷新项目与工作流的 updatedAt。 */
  const patchWorkflow = useCallback((projectId: string, patch: Partial<ProjectWorkflow>) => {
    setS((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => {
        if (p.id !== projectId || !p.workflow) return p;
        const now = Date.now();
        return {
          ...p,
          updatedAt: now,
          workflow: { ...p.workflow, ...patch, updatedAt: now },
        };
      }),
    }));
  }, []);

  /** V2：更新项目顶层字段（如组装后的 design、structure），同步刷新 updatedAt。 */
  const updateProject = useCallback((projectId: string, patch: Partial<Project>) => {
    setS((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === projectId ? { ...p, ...patch, updatedAt: Date.now() } : p,
      ),
    }));
  }, []);

  // —— 独立素材库 ——
  const addAsset = useCallback((asset: Asset) => setS((prev) => ({
    ...prev, assets: [asset, ...prev.assets],
  })), []);
  const removeAsset = useCallback((id: string) => setS((prev) => ({
    ...prev, assets: prev.assets.filter((a) => a.id !== id),
  })), []);
  const toggleFavoriteAsset = useCallback((id: string) => setS((prev) => ({
    ...prev, assets: prev.assets.map((a) => a.id === id ? { ...a, favorite: !a.favorite } : a),
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
    saveProject, syncProject, loadProject, mergeCloudProjects, deleteProject, duplicateProject, newProject, startEmptyDraft,
    createWorkflowProject, patchWorkflow, updateProject,
    addVersion, restoreVersion,
    addAsset, removeAsset, toggleFavoriteAsset,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
