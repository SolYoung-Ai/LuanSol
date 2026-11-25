/* ============================================================
   Studio 3.0 — 编辑器（做包装的那一屏）
   ------------------------------------------------------------
   三块视图，同一份数据：
     · 面编辑：按面（正面/背面/侧/顶）拖文字、拖插图、改字号颜色；
     · 刀板：真实刀模展开图（裁切线 / 压线 / 出血 / 安全边），各面图文按毫米落位；
     · 3D：按真实盒型生成模型，各面贴的正是面编辑里那一份版面。
   「从 3D 展开」= 3D → 刀板的过渡，不是另画一张图：两边读的是同一个 DesignDoc。

   导出不是截图：SVG 保留矢量、PDF 逐图层按毫米绘制并附独立刀模页、DXF 是 CAD 实体。
   没有尺寸 / 形式没有刀模结构时，导出按钮禁用并在界面上说明为什么。
   ============================================================ */
import React, {
  Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';
import { useApp } from '../store';
import { Icon, type IconName } from '../components/icons';
import { useSubscription } from '../cloud/subscription';
import { LAYER_SPLIT, layerSplitCost, SEEDREAM55_ASSET_COST, SEEDREAM55_COST } from '../cloud/models';
import { callLayerSplit, callStudioAI } from '../engine/seedream';
import { parseSplitResponse, type ParsedSplit } from '../engine/seedreamLayers';
import { importSplitLayers } from './layerImport';
import { CancelledError } from '../engine/cancel';
import { DielineView } from '../components/visuals';
import {
  buildBundle, buildDxf, buildPdf, downloadText, exportPng, mockupSvg, spreadSvg,
} from '../engine/export';
import { downloadBlob } from '../engine/utils';
import { compressImageForUpload } from '../workflow/imageUtils';
import {
  bgForFace, faceEls, formDef, sizeOk, sizeText, withFaceBg, withFaceEls,
  type DesignEl, type StudioAnswers, type StudioDesign,
} from './types';
import {
  STUDIO_SAFE, briefForStudio, dielineOf, dielineSummary, dimsOf, designDocFor, drawOrder, faceRatio, facesOf, mmToPct,
  pctToMm, structureFor,
} from './frames';
import { viewerSupport } from './viewerSupport';
import { runPrepress } from '../engine/prepress';
import { Booting, Frame, type MobileView } from './Frame';
import { useStudioProject } from './useStudio';
import {
  addImage, addShape, addText, buildDesign, duplicateEls, groupEls, orderEls, patchEls,
  removeEls, setElsBox, setSticker, stickerPrompt, ungroupEls,
} from './design';
import {
  canRedo, canUndo, createHistory, pushHistory, redoHistory, syncHistory, undoHistory,
  type HistoryState,
} from './history';
import EditCanvas, { isTypingTarget } from './EditCanvas';
import Inspector from './Inspector';
import LayerList from './LayerList';
import StudioChat from './StudioChat';

const Viewer3D = lazy(() => import('../components/Viewer3D'));

const MAX_CHAT = 60;

/** 读图片的真实像素宽高：拆分底图的 size 缺失时用它补坐标系 */
async function imageSize(src: string): Promise<{ w: number; h: number } | null> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    return { w: img.naturalWidth, h: img.naturalHeight };
  } catch {
    return null;
  }
}

type View = 'face' | 'flat' | '3d';
type Tab = 'layers' | 'assets' | 'export';

export default function DesignStage({ id, onBrief }: { id: string; onBrief: () => void }) {
  const { t } = useLang();
  const { setToast } = useApp();
  const sub = useSubscription();
  const { project, loadState, saveState, savedAt, message, update, uid } = useStudioProject(id);

  const [tab, setTab] = useState<Tab>('layers');
  const [view, setView] = useState<View>('face');
  const [face, setFace] = useState('front');
  const [mobile, setMobile] = useState<MobileView>('canvas');
  const [zoom, setZoom] = useState(100);
  const [selIds, setSelIds] = useState<string[]>([]);
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [editing, setEditing] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'insp' | 'chat'>('insp');
  const [histTick, setHistTick] = useState(0);
  const [draft, setDraft] = useState<StudioDesign | null>(null);
  const [prompt, setPrompt] = useState('');
  const [gen, setGen] = useState<'idle' | 'run' | 'err'>('idle');
  const [genMsg, setGenMsg] = useState('');
  const [aiMode, setAiMode] = useState<'concept' | 'asset'>('concept');
  const [concept, setConcept] = useState('');
  const [splitMax, setSplitMax] = useState<number>(LAYER_SPLIT.defaultImages);
  const [textRecognition, setTextRecognition] = useState(true);
  const [split, setSplit] = useState<ParsedSplit | null>(null);
  const [splitSel, setSplitSel] = useState<string[]>([]);
  const [splitStage, setSplitStage] = useState<'idle' | 'confirm' | 'run' | 'done' | 'err'>('idle');
  const [splitMsg, setSplitMsg] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const aiAbortRef = useRef<AbortController | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [unfolding, setUnfolding] = useState(false);
  const [show3dOpen, setShow3dOpen] = useState(true);
  const [orbit, setOrbit] = useState(true);
  const [exporting, setExporting] = useState('');

  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const draftRef = useRef<StudioDesign | null>(null);
  const histRef = useRef<HistoryState | null>(null);
  const clipRef = useRef<DesignEl[]>([]);
  const replaceIdRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const design = draft ?? project?.design ?? null;
  const panels = useMemo(() => (project ? facesOf(project) : []), [project]);
  const activePanel = panels.find((f) => f.id === face) || panels[0] || null;
  const faceKey = activePanel?.id || 'front';

  const dieline = useMemo(() => (project ? dielineOf(project) : null), [project]);
  const dims = useMemo(() => (project ? dimsOf(project) : null), [project]);
  const structure = useMemo(() => (project ? structureFor(project.answers.form.v) : null), [project]);
  const summary = useMemo(() => dielineSummary(dieline), [dieline]);


  /* 各面元素 → 印刷引擎的 DesignDoc：3D、刀板、导出共用一份 */
  const facesMap = useMemo(() => {
    const m: Partial<Record<string, DesignEl[]>> = { ...(design?.faces || {}) };
    if (design) m.front = faceEls(design, 'front');
    return m;
  }, [design]);
  const doc = useMemo(
    () => (project && design ? designDocFor({ ...project, design }, facesMap) : null),
    [project, design, facesMap],
  );
  const sheet = dieline?.sheets[Math.min(sheetIdx, dieline.sheets.length - 1)] || null;
  /* 印前报告：导出按钮和左侧面板共用同一份结果，避免「显示通过、导出却按旧数据」 */
  const prepress = useMemo(() => {
    if (!project || !doc || !dieline || !structure) return null;
    return runPrepress({ design: doc, brief: briefForStudio(project, structure), dieline, dpi: 300 });
  }, [project, doc, dieline, structure]);

  /* 画布尺寸：容器多大，画布就按面的真实比例装进去。
     布局完成前 clientHeight 会是 0，所以首次读取放在 layout 阶段，
     再补两帧（字体/工具栏进来后高度会变）——否则画布会按 0 高算出 0.2 倍。 */
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    const raf = window.requestAnimationFrame(read);
    const t1 = window.setTimeout(read, 160);
    const t2 = window.setTimeout(read, 600);
    window.addEventListener('resize', read);
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('resize', read);
    };
  }, [loadState, view, faceKey]);

  /* 云端/外部更新时同步；历史栈跟着外部稿对齐，但不清空 past/future */
  useEffect(() => {
    draftRef.current = project?.design ?? null;
    setDraft(project?.design ?? null);
    if (project?.design) {
      histRef.current = histRef.current
        ? syncHistory(histRef.current, project.design)
        : createHistory(project.design);
      setHistTick((x) => x + 1);
    }
  }, [project?.design]);

  useEffect(() => {
    if (project) setPrompt(stickerPrompt(project));
  }, [project?.id, project?.answers.form.v, project?.answers.patterns.v.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 放下插图后直接选中它，用户不用再去图层里找 */
  const selectSticker = useCallback((d: StudioDesign, key: string) => {
    const list = faceEls(d, key);
    const s = [...list].reverse().find((e) => e.kind === 'sticker');
    if (s) { setSelIds([s.id]); setRightTab('insp'); }
  }, []);

  /** 一次完整操作 = 一条历史。拖动期间只走 onPreview，松手才进来。 */
  const commit = useCallback((d: StudioDesign, mergeKey = '') => {
    histRef.current = histRef.current
      ? pushHistory(histRef.current, d, mergeKey)
      : createHistory(d);
    draftRef.current = d;
    setDraft(d);
    update((cur) => ({ ...cur, design: d }));
    setHistTick((x) => x + 1);
  }, [update]);

  const restore = useCallback((d: StudioDesign) => {
    draftRef.current = d;
    setDraft(d);
    update((cur) => ({ ...cur, design: d }));
    setHistTick((x) => x + 1);
    setSelIds((ids) => ids.filter((id) => faceEls(d, faceKey).some((e) => e.id === id)));
  }, [update, faceKey]);

  /** AI 修改提交：设计稿与结构尺寸一起更新，但只记一条历史。 */
  const commitAI = useCallback((d: StudioDesign, answers: StudioAnswers | null, mergeKey: string) => {
    histRef.current = histRef.current
      ? pushHistory(histRef.current, d, mergeKey)
      : createHistory(d);
    draftRef.current = d;
    setDraft(d);
    update((cur) => ({ ...cur, ...(answers ? { answers } : {}), design: d }));
    setHistTick((x) => x + 1);
  }, [update]);

  const undo = useCallback(() => {
    const h = histRef.current;
    if (!h || !canUndo(h)) return;
    const n = undoHistory(h);
    histRef.current = n;
    restore(n.present);
  }, [restore]);

  const redo = useCallback(() => {
    const h = histRef.current;
    if (!h || !canRedo(h)) return;
    const n = redoHistory(h);
    histRef.current = n;
    restore(n.present);
  }, [restore]);

  /* 复制：只在内存里留一份纯数据（不碰系统剪贴板，不弹权限框） */
  const copySel = useCallback(() => {
    if (!design || !selIds.length) return;
    clipRef.current = faceEls(design, faceKey)
      .filter((e) => selIds.includes(e.id))
      .map((e) => ({ ...e }));
  }, [design, faceKey, selIds]);

  const pasteClip = useCallback(() => {
    if (!design || !clipRef.current.length) return;
    const now = Date.now();
    const gm = new Map<string, string>();
    const copies = clipRef.current.map((e, i) => {
      if (e.groupId && !gm.has(e.groupId)) gm.set(e.groupId, `g_${now.toString(36)}_${i}`);
      return {
        ...e,
        id: `${e.kind === 'text' ? 't' : e.kind === 'rect' ? 's' : 'img'}_${now.toString(36)}_p${i}`,
        x: Math.min(96, e.x + 2),
        y: Math.min(98, e.y + 3),
        groupId: e.groupId ? gm.get(e.groupId) : undefined,
        createdAt: now,
        updatedAt: now,
      } as DesignEl;
    });
    const next = withFaceEls(design, faceKey, [...faceEls(design, faceKey), ...copies]);
    commit(next);
    setSelIds(copies.map((e) => e.id));
  }, [design, faceKey, commit]);

  /* 键盘：输入框里绝不抢键；Esc 退出编辑/选择；方向键按毫米比例微调 */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (isTypingTarget(ev.target)) return;
      const meta = ev.metaKey || ev.ctrlKey;
      const key = ev.key;
      if (meta && key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) redo(); else undo();
        return;
      }
      if (meta && key.toLowerCase() === 'c') { ev.preventDefault(); copySel(); return; }
      if (meta && key.toLowerCase() === 'v') { ev.preventDefault(); pasteClip(); return; }
      if (meta && key.toLowerCase() === 'a') {
        ev.preventDefault();
        if (design) setSelIds(faceEls(design, faceKey).map((e) => e.id));
        return;
      }
      if (key === 'Delete' || key === 'Backspace') {
        if (!design || !selIds.length) return;
        ev.preventDefault();
        commit(removeEls(design, selIds, faceKey));
        setSelIds([]);
        return;
      }
      if (key === 'Escape') { setSelIds([]); setEditing(null); return; }
      if (key.toLowerCase() === 'v' && !meta) { setTool('select'); return; }
      if (key.toLowerCase() === 'h' && !meta) { setTool('hand'); return; }
      if (key.startsWith('Arrow') && design && selIds.length) {
        ev.preventDefault();
        const step = ev.shiftKey ? 10 : 1;
        const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
        const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
        const boxes: Record<string, { x: number; y: number }> = {};
        for (const id of selIds) {
          const el = faceEls(design, faceKey).find((e) => e.id === id);
          if (!el || el.locked) continue;
          boxes[id] = { x: Math.min(99, Math.max(-el.w + 5, el.x + dx)), y: Math.min(99, Math.max(-(el.h ?? 10) + 5, el.y + dy)) };
        }
        if (Object.keys(boxes).length) commit(setElsBox(design, boxes, faceKey), 'nudge');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [design, faceKey, selIds, undo, redo, copySel, pasteClip, commit]);

  /* 确认过但没有设计稿（旧数据）：进来补一版 */
  useEffect(() => {
    if (!project || project.design || loadState !== 'ready') return;
    const d = buildDesign(project);
    draftRef.current = d;
    setDraft(d);
    update((cur) => ({ ...cur, design: d }));
  }, [project, loadState, update]);

  /* 切面时清空选中，避免选中框跟到另一面；历史是整份设计，所以不丢 */
  useEffect(() => { setSelIds([]); setEditing(null); }, [faceKey]);

  const saveLabel = saveState === 'saving' ? t('保存中…', 'Saving…')
    : saveState === 'saved' ? t(`已保存 ${savedAt ? new Date(savedAt).toTimeString().slice(0, 5) : ''}`, `Saved ${savedAt ? new Date(savedAt).toTimeString().slice(0, 5) : ''}`)
      : saveState === 'error' ? t('云端失败 · 已存本机', 'Cloud failed · saved locally')
        : saveState === 'local' ? t('只存在本机', 'Local only')
          : t('自动保存', 'Auto-save');

  /* ---------------- 状态页 ---------------- */
  if (loadState === 'loading') {
    return <div className="st-ed"><Booting text={t('正在打开这个项目…', 'Opening this project…')} /></div>;
  }
  if (loadState === 'locked') {
    return <div className="st-ed">
      <div className="st-ed-gate">
        <h1>{t('登录后才能打开这个设计', 'Sign in to open this design')}</h1>
        <p>{t('设计按账号存档，登录后就能接着改。', 'Designs are stored per account — sign in to keep editing.')}</p>
        <div className="st-ed-gate-actions">
          <button className="st-btn st-btn-dark" onClick={() => go(`/login?next=${encodeURIComponent(`/studio?id=${id}&view=design`)}`)}>
            {t('去登录', 'Sign in')}<span aria-hidden>→</span>
          </button>
          <button className="st-btn st-btn-ghost" onClick={() => go('/studio')}>{t('回到项目列表', 'Back to projects')}</button>
        </div>
      </div>
    </div>;
  }
  if (!project || !design) {
    return <div className="st-ed"><Booting text={t('正在排第一版版面…', 'Laying out the first version…')} /></div>;
  }

  /* 形式没有刀模结构：不假装有 3D 与刀板，明确给出出口 */
  if (!panels.length) {
    return <div className="st-ed">
      <div className="st-ed-gate">
        <h1>{t('这个包装形式暂时没有刀板', 'No dieline for this format yet')}</h1>
        <p>{t('结构库里还没有「' + (formDef(project.answers.form.v)?.zh || '该形式') + '」的刀模几何，所以 3D 与刀板导出都还没法按真实尺寸算。改成一个有结构的盒型/袋型就能继续。',
          'The structure library has no dieline for this format yet, so 3D and dieline export cannot use real dimensions. Pick a carton or pouch format to continue.')}</p>
        <div className="st-ed-gate-actions">
          <button className="st-btn st-btn-dark" onClick={onBrief}>{t('去改包装形式', 'Change the format')}<span aria-hidden>→</span></button>
          <button className="st-btn st-btn-ghost" onClick={() => go('/studio')}>{t('回到项目列表', 'Back to projects')}</button>
        </div>
      </div>
    </div>;
  }

  /* ---------------- 几何：当前面的画布像素 ---------------- */
  const [rw, rh] = faceRatio(project, faceKey);
  /* 还没测到容器时按视口给一个合理值，测到后立刻贴合——不能让用户看到一块 28px 的画布 */
  const availW = box.w > 0 ? box.w : Math.min(560, Math.max(280, window.innerWidth - 48));
  const availH = box.h > 0 ? box.h : Math.min(640, Math.max(320, window.innerHeight * 0.46));
  const fit = Math.min((availW - 48) / rw, (availH - 128) / rh);
  const scale = Math.max(0.2, fit * (zoom / 100));
  const boardW = Math.max(1, rw * scale);
  const boardH = Math.max(1, rh * scale);
  const safeInsetX = activePanel ? mmToPct(STUDIO_SAFE, activePanel.w) : 5;
  const safeInsetY = activePanel ? mmToPct(STUDIO_SAFE, activePanel.h) : 5;

  /* ---------------- 新增对象 ---------------- */
  const addTextHere = () => {
    const d = addText(design, t('双击改文字', 'Double-click to edit'), faceKey);
    commit(d);
    const list = faceEls(d, faceKey);
    setSelIds([list[list.length - 1].id]);
    setRightTab('insp');
  };

  const addShapeHere = (shape: 'rect' | 'ellipse' | 'line') => {
    const el = addShape(design, shape, faceKey, { color: shape === 'line' ? design.ink : design.accent });
    commit(withFaceEls(design, faceKey, [...faceEls(design, faceKey), el]));
    setSelIds([el.id]);
    setRightTab('insp');
  };

  const els = drawOrder(faceEls(design, faceKey));

  /* ---------------- AI：完整设计 / 独立透明素材 ---------------- */
  const aiCost = aiMode === 'asset' ? SEEDREAM55_ASSET_COST : SEEDREAM55_COST;
  const splitCost = layerSplitCost(splitMax);

  const regenerate = async () => {
    if (gen === 'run') return;
    if (!uid) { setToast(t('登录后才能生成', 'Sign in to generate')); return; }
    const bal = sub.usedLeft ?? 0;
    if (bal < aiCost) {
      setGen('err');
      setGenMsg(t(`积分不足：本次需要 ${aiCost} 积分，当前余额 ${bal}。可在「积分与充值」签到或兑换后再试。`,
        `Not enough credits: ${aiCost} needed, balance ${bal}.`));
      return;
    }
    const ac = new AbortController();
    aiAbortRef.current = ac;
    setGen('run');
    setGenMsg(aiMode === 'asset' ? t('正在生成透明素材…', 'Generating a transparent asset…') : t('正在生成完整概念图…', 'Generating the full concept…'));
    try {
      const res = await callStudioAI({
        mode: aiMode,
        prompt: prompt.trim() || stickerPrompt(project),
        size: '1024x1024',
        signal: ac.signal,
        uid,
        projectId: id,
      });
      if (aiMode === 'asset') {
        const cur = draftRef.current;
        if (cur) {
          const src = res.assetUrl || res.dataUrl;
          const dim = await imageSize(src);
          const el = addImage(cur, src, dim?.w || 1024, dim?.h || 1024, faceKey, {
            fit: 'contain', source: 'ai', name: t('透明素材', 'Transparent asset'), layerType: 'illustration',
          });
          const next = withFaceEls(cur, faceKey, [...faceEls(cur, faceKey), el]);
          commit(next);
          setSelIds([el.id]);
          setRightTab('insp');
        }
        setGen('idle');
        setGenMsg(t(`透明 PNG 已导入 · 扣 ${res.cost} 积分 · 余额 ${res.balance}`, `PNG imported · ${res.cost} credits · balance ${res.balance}`));
        setToast(t('透明素材已作为独立图层放进这一面', 'Transparent asset added as its own layer'));
      } else {
        setConcept(res.dataUrl);
        setSplit(null);
        setSplitSel([]);
        setSplitStage('idle');
        setSplitMsg('');
        setImportMsg('');
        setGen('idle');
        setGenMsg(t(`完整概念图已生成 · 扣 ${res.cost} 积分 · 余额 ${res.balance}。确认后可拆图层。`,
          `Concept generated · ${res.cost} credits · balance ${res.balance}. Split it when ready.`));
      }
    } catch (e) {
      if (e instanceof CancelledError || ac.signal.aborted) {
        setGen('idle');
        setGenMsg(t('已取消，已扣积分按服务端规则退回', 'Cancelled — the charge is refunded by the server'));
      } else {
        setGen('err');
        setGenMsg((e as Error)?.message || t('生成失败，积分未扣', 'Failed — no credits were used'));
      }
    } finally {
      if (aiAbortRef.current === ac) aiAbortRef.current = null;
    }
  };

  /** 拆图是独立的一次模型调用：先给预估，用户二次确认后才扣费。 */
  const startSplit = async () => {
    if (!concept) { setSplitStage('err'); setSplitMsg(t('先生成完整概念图', 'Generate a concept first')); return; }
    if (splitStage === 'run') return;
    const ac = new AbortController();
    aiAbortRef.current = ac;
    setSplitStage('run');
    setSplitMsg(t('Seedream 5.5 正在拆图层，通常需要 20–60 秒…', 'Seedream 5.5 is splitting layers — usually 20–60 s…'));
    const jobId = `ls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    try {
      const raw = await callLayerSplit({
        image: concept,
        prompt: prompt.trim(),
        maxImages: splitMax,
        textRecognition,
        size: 'auto',
        signal: ac.signal,
        jobId,
        uid,
      });
      let parsed = parseSplitResponse(raw, { jobId });
      if (parsed.base && (!parsed.base.width || !parsed.base.height)) {
        const dim = await imageSize(parsed.base.assetUrl || parsed.base.dataUrl);
        if (dim) parsed = parseSplitResponse(raw, { jobId, baseSize: dim });
      }
      if (!parsed.base || !parsed.layers.length) {
        throw new Error(t('模型没有返回可用的底图与图层，积分已退回', 'No usable base and layers were returned — credits refunded'));
      }
      setSplit(parsed);
      setSplitSel([parsed.base.key, ...parsed.layers.map((l) => l.key)]);
      setSplitStage('done');
      setImportMsg('');
      setSplitMsg(t(`已拆出 ${parsed.layers.length} 个透明图层 + 1 张底图 · 扣 ${parsed.cost} 积分 · 余额 ${parsed.balance}`,
        `${parsed.layers.length} transparent layers + base · ${parsed.cost} credits · balance ${parsed.balance}`));
    } catch (e) {
      if (e instanceof CancelledError || ac.signal.aborted) {
        setSplitStage('idle');
        setSplitMsg(t('已取消拆图，已扣积分按服务端规则退回', 'Split cancelled — the charge is refunded by the server'));
      } else {
        setSplitStage('err');
        setSplitMsg((e as Error)?.message || t('拆图失败，积分已退回', 'Split failed — credits refunded'));
      }
    } finally {
      if (aiAbortRef.current === ac) aiAbortRef.current = null;
    }
  };

  const importLayers = (all: boolean) => {
    if (!split || !activePanel || !design) return;
    const keys = all ? undefined : splitSel;
    if (!all && !splitSel.length) { setImportMsg(t('至少选一个图层', 'Select at least one layer')); return; }
    const r = importSplitLayers(design, split, {
      panel: { id: activePanel.id, w: activePanel.w, h: activePanel.h },
      face: faceKey,
      keys,
      reconstructText: textRecognition,
      fit: 'contain',
    });
    if (!r.imported) {
      setImportMsg(t(`没有新图层可导入：重复 ${r.duplicates}，跳过 ${r.skipped}`,
        `Nothing new: ${r.duplicates} duplicate, ${r.skipped} skipped`));
      return;
    }
    commit(r.design);
    setSelIds(r.ids);
    setRightTab('insp');
    setImportMsg(t(`已导入 ${r.imported} 个对象（含底图/OCR 文字），可在图层里单独编辑。`,
      `${r.imported} objects imported — each is editable in the layer list.`));
    if (r.warnings.length) setSplitMsg(r.warnings.slice(0, 3).join('；'));
    setToast(t(`已导入 ${r.imported} 个图层对象`, `${r.imported} layer objects imported`));
  };

  /* 上传自己的图：走和 Logo 同一条压缩链路，别把 30MB 原图塞进项目 */
  const uploadOwn = async (f: File | undefined) => {
    if (!f) return;
    const base = draftRef.current || design;
    try {
      const c = await compressImageForUpload(f, { maxEdge: 1400, maxBytes: 700 * 1024 });
      // 有明确替换目标（属性面板「换一张」）或选中的是空图位 → 原位替换；否则新增
      const explicit = replaceIdRef.current;
      const emptySel = selIds.length === 1
        ? faceEls(base, faceKey).find((e) => e.id === selIds[0] && e.kind === 'sticker' && !e.src)
        : null;
      const target = explicit || emptySel?.id || '';
      replaceIdRef.current = null;
      if (target) {
        const next = patchEls(base, [target], {
          src: c.dataUrl, naturalW: c.width, naturalH: c.height,
          fit: faceEls(base, faceKey).find((e) => e.id === target)?.fit || 'contain',
          source: 'upload',
        }, faceKey);
        commit(next);
        setSelIds([target]);
        setToast(t(`已替换 · ${c.width}×${c.height}px · ${Math.round(c.bytes / 1024)}KB`,
          `Replaced · ${c.width}×${c.height}px · ${Math.round(c.bytes / 1024)}KB`));
      } else {
        const el = addImage(base, c.dataUrl, c.width, c.height, faceKey, { fit: 'contain' });
        const next = withFaceEls(base, faceKey, [...faceEls(base, faceKey), el]);
        commit(next);
        setSelIds([el.id]);
        setRightTab('insp');
        setToast(t(`已放到这一面 · ${c.width}×${c.height}px · ${Math.round(c.bytes / 1024)}KB`,
          `Placed · ${c.width}×${c.height}px · ${Math.round(c.bytes / 1024)}KB`));
      }
    } catch (e) {
      const code = (e as Error)?.message;
      setToast(code === 'TOO_LARGE'
        ? t('图太大了，超过 700KB 上限。先压到 1400px 以内再传。', 'Too large (over 700 KB). Resize to 1400 px and retry.')
        : code === 'NOT_IMAGE'
          ? t('这不像是图片文件，换 PNG / JPG / WebP。', 'Not an image file — use PNG, JPG or WebP.')
          : t('这张图读不出来，换 JPG / PNG / WebP 试试', 'Could not read this image — try JPG / PNG / WebP'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const pickReplace = (id: string) => {
    replaceIdRef.current = id;
    fileRef.current?.click();
  };

  const pickFile = () => fileRef.current?.click();

  /* ---------------- 导出 ---------------- */
  const sizeReady = !!project.answers.size && sizeOk(project.answers.size.dims)
    && (project.answers.size.confirmed || project.answers.size.mode === 'custom');
  const canExport = !!doc && !!dieline && sizeReady;

  const runExport = async (kind: string) => {
    if (!doc || !dieline) return;
    const report = prepress;
    if (!report) {
      setToast(t('印前检查尚未完成，先确认尺寸与包装形式。', 'Prepress is not ready — confirm size and format first.'));
      return;
    }
    const errors = report.items.filter((i) => i.level === 'error');
    if (errors.length) {
      const ok = window.confirm(t(
        `印前检查有 ${errors.length} 个严重问题：\n\n${errors.slice(0, 5).map((e) => `• ${e.title}：${e.detail}`).join('\n')}\n\n这些问题可能导致文件不可印刷。仍要导出吗？`,
        `Prepress found ${errors.length} blocking issue(s):\n\n${errors.slice(0, 5).map((e) => `• ${e.title}: ${e.detail}`).join('\n')}\n\nThe file may not be printable. Export anyway?`,
      ));
      if (!ok) {
        setToast(t('已取消导出：先按印前报告修复严重问题。', 'Export cancelled — fix the blocking prepress issues first.'));
        return;
      }
    } else if (report.status === 'warning') {
      setToast(t('印前有需要确认的参数，文件仍会按真实刀模导出。', 'Prepress has items to confirm; the file still uses the real dieline.'));
    }
    setExporting(kind);
    const base = (project.name || 'LunaSol').replace(/[\\/:*?"<>|]/g, '_');
    try {
      if (kind === 'svg') {
        const svg = spreadSvg(doc, dieline, sheetIdx, false);
        downloadText(svg, `${base}_展开稿_${dieline.sheets[sheetIdx]?.name || 'sheet'}.svg`, 'image/svg+xml');
        setToast(t('已导出展开稿 SVG（矢量，保留文字）', 'Artwork SVG exported (vector, text kept)'));
      } else if (kind === 'dieline-svg') {
        const svg = spreadSvg(doc, dieline, sheetIdx, true);
        downloadText(svg, `${base}_刀板_${dieline.sheets[sheetIdx]?.name || 'sheet'}.svg`, 'image/svg+xml');
        setToast(t('已导出刀板 SVG（含裁切线与压线）', 'Dieline SVG exported (cut and crease lines)'));
      } else if (kind === 'pdf') {
        const { blob } = await buildPdf(doc, dieline, 300, report);
        downloadBlob(blob, `${base}_印刷稿.pdf`);
        setToast(t('已导出印刷稿 PDF：毫米页面 + 印刷 / 裁切 / 压痕分页 + 工艺页',
          'Print PDF exported: mm pages, separate print / cut / crease / process pages'));
      } else if (kind === 'dxf') {
        const dxf = buildDxf(dieline, sheetIdx);
        downloadText(dxf, `${base}_刀模_${dieline.sheets[sheetIdx]?.name || 'sheet'}.dxf`, 'application/dxf');
        setToast(t('已导出 DXF 刀模（CAD 可直接打开）', 'DXF dieline exported'));
      } else if (kind === 'zip') {
        const { blob } = await buildBundle(doc, dieline, 300, report.status !== 'error');
        downloadBlob(blob, `${base}_全套文件.zip`);
        setToast(t('已打包：展开稿 / 刀模 DXF / 分层 PDF / 尺寸说明', 'Bundle ready: artwork, DXF, layered PDF, size notes'));
      } else if (kind === 'png') {
        const s = dieline.sheets[sheetIdx];
        await exportPng(spreadSvg(doc, dieline, sheetIdx, false), s.width, s.height, `${base}_展开图_300dpi.png`, 300);
        setToast(t('已导出 300dpi 展开图 PNG', '300 dpi artwork PNG exported'));
      } else if (kind === 'mock') {
        const svg = mockupSvg(doc);
        if (svg) await exportPng(svg, 240, 181, `${base}_效果图.png`, 200);
        setToast(t('已导出效果图（矢量拼装，非 3D 截图）', 'Preview exported (vector mockup, not a 3D screenshot)'));
      }
    } catch (e) {
      setToast((e as Error)?.message || t('导出失败，请重试', 'Export failed — try again'));
    } finally {
      setExporting('');
    }
  };

  /* ---------------- 左侧：图层 ---------------- */
  const layersPane = <div className="st-dz-lyrs">
    <div className="st-dz-facetag">{activePanel ? t(activePanel.labelZh, activePanel.labelEn) : ''}
      <i>{activePanel ? `${Math.round(activePanel.w)} × ${Math.round(activePanel.h)} mm` : ''}</i>
    </div>
    <LayerList
      design={design}
      faceKey={faceKey}
      els={els}
      sel={selIds}
      onSelect={setSelIds}
      onPatch={(ids, p, key) => commit(patchEls(design, ids, p, faceKey), `${key}:${ids.join(',')}`)}
      onOrder={(a) => commit(orderEls(design, selIds, a, faceKey))}
      onDuplicate={() => {
        const r = duplicateEls(design, selIds, faceKey);
        commit(r.design);
        setSelIds(r.ids);
      }}
      onDelete={() => { commit(removeEls(design, selIds, faceKey)); setSelIds([]); }}
      onGroup={() => { const g = groupEls(design, selIds, faceKey); commit(g.design); }}
      onUngroup={() => commit(ungroupEls(design, selIds, faceKey))}
    />
    <div className="st-dz-addbar">
      <button onClick={addTextHere}><Icon name="text" size={14} />{t('文字', 'Text')}</button>
      <button onClick={() => addShapeHere('rect')}><Icon name="shape" size={14} />{t('形状', 'Shape')}</button>
      <button onClick={pickFile}><Icon name="image" size={14} />{t('图片', 'Image')}</button>
    </div>
    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(ev) => void uploadOwn(ev.target.files?.[0])} />
  </div>;

  /* ---------------- 左侧：素材 ---------------- */
  const logoSrc = project.answers.logo.image || project.answers.logo.refImage || '';

  const assetsPane = <div className="st-dz-assets">
    <div className="st-dz-facetag">{activePanel ? t(activePanel.labelZh, activePanel.labelEn) : ''}
      <i>{t('素材会放到这一面', 'Goes onto this face')}</i></div>

    <div className="st-ed-sec-label">{t('AI 生成', 'AI generation')}</div>
    <div className="st-ai-mode" role="tablist">
      <button
        className={aiMode === 'concept' ? 'on' : ''}
        role="tab"
        aria-selected={aiMode === 'concept'}
        onClick={() => { setAiMode('concept'); setGen('idle'); setGenMsg(''); }}
      >{t('完整设计', 'Full design')}</button>
      <button
        className={aiMode === 'asset' ? 'on' : ''}
        role="tab"
        aria-selected={aiMode === 'asset'}
        onClick={() => { setAiMode('asset'); setGen('idle'); setGenMsg(''); }}
      >{t('独立素材', 'Standalone asset')}</button>
    </div>
    <p className="st-dz-note">{aiMode === 'concept'
      ? t('先出一张完整包装概念图；确认后再拆成底图、透明插画、装饰、文字等可编辑图层。',
        'Generate one full packaging concept first; split it into base, transparent art, decoration and text after you confirm.')
      : t('直接出原生透明 PNG 插画，作为单个独立图层导入，不经过拆图。',
        'Generate a native transparent PNG and import it as one standalone layer — no split.')}</p>

    <label className="st-dz-field">
      <span>{t('想生成什么', 'What to draw')}</span>
      <textarea rows={4} value={prompt} onChange={(ev) => setPrompt(ev.target.value)} />
    </label>
    <button className="st-dz-gen" onClick={() => void regenerate()} disabled={gen === 'run'}>
      {gen === 'run' ? <span className="st-spin" aria-hidden /> : <Icon name="spark" size={14} />}
      {gen === 'run'
        ? t('正在生成…', 'Generating…')
        : aiMode === 'concept'
          ? t(`生成完整概念图 · ${SEEDREAM55_COST} 积分`, `Full concept · ${SEEDREAM55_COST} credits`)
          : t(`生成透明素材 · ${SEEDREAM55_ASSET_COST} 积分`, `Transparent asset · ${SEEDREAM55_ASSET_COST} credits`)}
    </button>
    {gen === 'run' && <button className="st-ai-cancel" onClick={() => aiAbortRef.current?.abort()}>
      {t('取消（已扣积分退回）', 'Cancel (refund)')}
    </button>}
    {genMsg && <p className={`st-dz-note ${gen === 'err' ? 'warn' : ''}`}>{genMsg}</p>}

    {aiMode === 'concept' && concept && <div className="st-split-card">
      <img className="st-split-preview" src={concept} alt={t('完整概念图', 'Full concept')} />
      <div className="st-split-row">
        <span>{t('拆分层数上限', 'Layer cap')}<em>{t('含底图', 'incl. base')}</em></span>
        <select value={splitMax} onChange={(ev) => setSplitMax(Number(ev.target.value))} disabled={splitStage === 'run'}>
          {LAYER_SPLIT.presets.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <label className="st-split-check">
        <input type="checkbox" checked={textRecognition} onChange={(ev) => setTextRecognition(ev.target.checked)} disabled={splitStage === 'run'} />
        <span>{t('识别规整文字（OCR，仅供重建参考）', 'Recognise clean text (OCR hint only)')}</span>
      </label>
      <p className="st-dz-note">{t(`预估 ${splitCost} 积分（${LAYER_SPLIT.base} 基础 + ${LAYER_SPLIT.perImage} × ${splitMax} 层）。拆图是单独一次模型调用，失败或取消按服务端规则退回。`,
        `Est. ${splitCost} credits (${LAYER_SPLIT.base} base + ${LAYER_SPLIT.perImage} × ${splitMax}). Separate model call; failed or cancelled runs are refunded by the server.`)}</p>

      {(splitStage === 'idle' || splitStage === 'err') && <button className="st-dz-gen" onClick={() => { setSplitStage('confirm'); setSplitMsg(''); }}>
        <Icon name="layers" size={14} />{t(`拆分为可编辑图层 · 预估 ${splitCost} 积分`, `Split into layers · est. ${splitCost}`)}
      </button>}

      {splitStage === 'confirm' && <div className="st-split-confirm">
        <b>{t('确认调用 Seedream 5.5 图层拆分？', 'Run Seedream 5.5 layer split?')}</b>
        <p>{t(`本次将从账户预扣 ${splitCost} 积分；最多 ${splitMax} 个输出（含底图）。确认后才会发起模型调用。`,
          `${splitCost} credits will be held; up to ${splitMax} outputs including the base. The model is called only after you confirm.`)}</p>
        <div className="st-split-actions">
          <button className="st-dz-gen is-inline" onClick={() => void startSplit()}>{t('确认并拆分', 'Confirm & split')}</button>
          <button className="st-ai-cancel is-inline" onClick={() => setSplitStage('idle')}>{t('先不拆', 'Not now')}</button>
        </div>
      </div>}

      {splitStage === 'run' && <div className="st-split-confirm">
        <p className="st-split-running"><span className="st-spin is-dark" aria-hidden />{t('正在拆图并持久化图层素材…', 'Splitting and persisting layer assets…')}</p>
        <button className="st-ai-cancel" onClick={() => aiAbortRef.current?.abort()}>{t('取消拆分（已扣积分退回）', 'Cancel split (refund)')}</button>
      </div>}

      {splitMsg && <p className={`st-dz-note ${splitStage === 'err' ? 'warn' : ''}`}>{splitMsg}</p>}
      {split && splitStage === 'done' && <>
        <div className="st-split-list">
          {split.base && <label className="st-split-item">
            <input
              type="checkbox"
              checked={splitSel.includes(split.base.key)}
              onChange={(ev) => setSplitSel((cur) => ev.target.checked ? [...cur, split.base!.key] : cur.filter((k) => k !== split.base!.key))}
            />
            <img src={split.base.assetUrl || split.base.dataUrl} alt="" />
            <span><b>{split.base.name}</b><em>{t('底图 · 最底层', 'Base · bottom')} · {split.base.width}×{split.base.height}px</em></span>
          </label>}
          {split.layers.map((l) => <label key={l.key} className="st-split-item">
            <input
              type="checkbox"
              checked={splitSel.includes(l.key)}
              onChange={(ev) => setSplitSel((cur) => ev.target.checked ? [...cur, l.key] : cur.filter((k) => k !== l.key))}
            />
            <img src={l.assetUrl || l.dataUrl} alt="" />
            <span>
              <b>{l.name}</b>
              <em>z{l.zIndex} · {l.kind}{l.ocr ? ' · OCR' : ''} · {l.box ? `${Math.round(l.box.left)},${Math.round(l.box.top)} → ${Math.round(l.box.right)},${Math.round(l.box.bottom)}` : t('无 bbox', 'no bbox')}</em>
            </span>
          </label>)}
        </div>
        <div className="st-split-actions">
          <button className="st-dz-gen is-inline" onClick={() => importLayers(true)}>{t('导入全部图层', 'Import all')}</button>
          <button className="st-dz-gen is-inline is-ghost" onClick={() => importLayers(false)}>{t(`导入所选 ${splitSel.length}`, `Import ${splitSel.length}`)}</button>
        </div>
        {importMsg && <p className="st-dz-note">{importMsg}</p>}
        <p className="st-dz-note">{t(`映射到「${activePanel ? t(activePanel.labelZh, activePanel.labelEn) : faceKey}」${activePanel?.w}×${activePanel?.h}mm 画布，按官方 bbox 等比恢复，不拉伸。`,
          `Mapped onto the ${activePanel?.w}×${activePanel?.h} mm ${activePanel ? t(activePanel.labelZh, activePanel.labelEn) : faceKey} canvas using the official bbox, aspect kept.`)}</p>
      </>}
    </div>}

    {aiMode === 'asset' && <p className="st-dz-note">{t('透明素材是单独模型调用，按次计费；失败不扣。已在项目里作为独立图片对象保存。',
      'The transparent asset is a separate paid call; failures are refunded. It is saved as its own image object.')}</p>}

    <div className="st-ed-sec-label">{t('你自己的图', 'Your own files')}</div>
    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(ev) => void uploadOwn(ev.target.files?.[0])} />
    <button className="st-dz-asset is-file" onClick={pickFile}>
      <span className="st-dz-asset-ico"><Icon name="upload" size={18} /></span>
      <span>{t('上传插图 / 图案', 'Upload artwork')}</span>
    </button>
    {logoSrc && <button className="st-dz-asset" onClick={() => {
      const cur = draftRef.current;
      if (!cur) return;
      const next = setSticker(cur, logoSrc, faceKey);
      commit(next);
      selectSticker(next, faceKey);
      setToast(t('Logo 已放到这一面', 'Logo placed on this face'));
    }}>
      <img src={logoSrc} alt="" />
      <span>{t('把 Logo 放到这一面', 'Place the logo')}</span>
    </button>}

    <div className="st-ed-sec-label">{t('底色', 'Canvas colour')}<em>{t(activePanel?.labelZh || '当前面', activePanel?.labelEn || 'this face')}</em></div>
    <div className="st-dz-colors is-wide">
      {[bgForFace(design, faceKey), design.ink, design.accent, '#FFFFFF', '#FBF9F5', '#F4EEE4', '#191919', '#23364D', '#8C2F2F', '#2F5D4A'].map((c) => <button
        key={c}
        className={bgForFace(design, faceKey) === c ? 'on' : ''}
        style={{ background: c }}
        onClick={() => commit(withFaceBg(design, faceKey, c))}
        aria-label={c}
      />)}
    </div>
  </div>;

  /* ---------------- 左侧：导出 ---------------- */
  const exportPane = <div className="st-dz-export">
    <div className="st-ed-sec-label">{t('刀板与印前', 'Dieline')}</div>
    {summary
      ? <>
        <div className="st-dz-erow"><b>{t('成品尺寸', 'Finished')}</b><em>{dims ? sizeText(dims) : '—'}</em></div>
        <div className="st-dz-erow"><b>{t('展开图', 'Sheets')}</b><em>{summary.sheets} {t('张', 'sheets')} · {summary.width} × {summary.height} mm</em></div>
        <div className="st-dz-erow"><b>{t('刀线', 'Cut / crease')}</b><em>{summary.cut} / {summary.crease}</em></div>
        <div className="st-dz-erow"><b>{t('出血 / 安全边', 'Bleed / safe')}</b><em>3 / 5 mm</em></div>
      </>
      : <p className="st-dz-note warn">{t('还没有刀模：先确认包装形式与尺寸。', 'No dieline yet — pick a format and size first.')}</p>}

    {!!summary?.warnings.length && <ul className="st-dz-warn">
      {summary.warnings.map((w) => <li key={w}>{w}</li>)}
    </ul>}

    {prepress && <div className="st-dz-preflight">
      <div className="st-ed-sec-label">{t('印前检查', 'Prepress')}<em>{prepress.status === 'pass' ? t('通过', 'Pass') : prepress.status === 'warning' ? t('需确认', 'Review') : t('不通过', 'Blocking')}</em></div>
      <p className="st-dz-note">{prepress.summary}</p>
      <ul className="st-dz-checks">
        {prepress.items.filter((i) => i.level !== 'pass').slice(0, 10).map((i) => <li key={i.id} className={i.level}>
          <b>{i.title}</b><span>{i.detail}</span>
        </li>)}
        {!prepress.items.some((i) => i.level !== 'pass') && <li className="pass"><b>{t('全部检查项通过', 'All checks passed')}</b></li>}
      </ul>
      {prepress.status === 'error' && <p className="st-dz-note warn">
        {t('存在严重问题：导出时会先要求确认风险，不能静默生成文件。', 'Blocking issues: export asks for explicit confirmation and never fails silently.')}
      </p>}
    </div>}

    {!sizeReady && <p className="st-dz-note warn">
      {t('尺寸还没确认，导出不会按真实毫米算。回需求确认尺寸后再来。', 'The size is not confirmed yet — exports would not use real millimetres.')}
      <button className="st-dz-link" onClick={onBrief}>{t('去确认尺寸', 'Confirm size')}</button>
    </p>}

    <div className="st-ed-sec-label">{t('导出', 'Export')}</div>
    <div className="st-dz-exports">
      <button className="st-dz-exp" onClick={() => void runExport('pdf')} disabled={!canExport || !!exporting}>
        <b>{t('印刷稿 PDF', 'Print PDF')}</b>
        <em>{t('毫米页面 · 印刷 / 裁切 / 压痕分页', 'mm pages · print / cut / crease')}</em>
        <Icon name="download" size={14} />
      </button>
      <button className="st-dz-exp" onClick={() => void runExport('svg')} disabled={!canExport || !!exporting}>
        <b>{t('展开稿 SVG', 'Artwork SVG')}</b>
        <em>{t('矢量，文字仍可编辑', 'Vector, text stays editable')}</em>
        <Icon name="download" size={14} />
      </button>
      <button className="st-dz-exp" onClick={() => void runExport('dieline-svg')} disabled={!canExport || !!exporting}>
        <b>{t('刀板 SVG', 'Dieline SVG')}</b>
        <em>{t('裁切线 + 压线 + 出血', 'Cut, crease, bleed')}</em>
        <Icon name="scissors" size={14} />
      </button>
      <button className="st-dz-exp" onClick={() => void runExport('dxf')} disabled={!canExport || !!exporting}>
        <b>{t('刀模 DXF', 'Dieline DXF')}</b>
        <em>{t('CAD 直接打开，图层 CUT / CREASE', 'Opens in CAD, layers CUT / CREASE')}</em>
        <Icon name="download" size={14} />
      </button>
      <button className="st-dz-exp" onClick={() => void runExport('png')} disabled={!canExport || !!exporting}>
        <b>{t('展开图 PNG', 'Artwork PNG')}</b>
        <em>{t('300 dpi，直接发印厂看稿', '300 dpi preview')}</em>
        <Icon name="image" size={14} />
      </button>
      <button className="st-dz-exp" onClick={() => void runExport('mock')} disabled={!canExport || !!exporting}>
        <b>{t('效果图 PNG', 'Mockup PNG')}</b>
        <em>{t('矢量拼装的样机，不是 3D 截图', 'Vector mockup, not a 3D capture')}</em>
        <Icon name="box3d" size={14} />
      </button>
      <button className="st-dz-exp is-strong" onClick={() => void runExport('zip')} disabled={!canExport || !!exporting}>
        <b>{t('全套打包 ZIP', 'Full bundle ZIP')}</b>
        <em>{t('展开稿 + DXF + PDF + 说明', 'Artwork + DXF + PDF + notes')}</em>
        <Icon name="folder" size={14} />
      </button>
    </div>
    {!!exporting && <p className="st-dz-note">{t('正在生成文件…', 'Building the file…')}</p>}
    <p className="st-dz-note">{t('以上文件都由刀模几何与毫米图层直接算出来，不是画布截图。',
      'All files are generated from the dieline geometry and millimetre layers — not screenshots.')}</p>
  </div>;

  /* ---------------- 中间：视图切换 ---------------- */
  const viewBar = <div className="st-dz-vbar">
    <div className="st-dz-vswitch" role="tablist">
      {([['face', t('编辑面', 'Face'), 'text'], ['flat', t('刀板', 'Dieline'), 'scissors'], ['3d', '3D', 'box3d']] as [View, string, IconName][])
        .map(([v, label, icon]) => <button
          key={v}
          className={view === v ? 'on' : ''}
          onClick={() => setView(v)}
          role="tab"
          aria-selected={view === v}
        ><Icon name={icon as IconName} size={14} />{label}</button>)}
    </div>

    {view === 'face' && <div className="st-dz-faces" role="tablist">
      {panels.map((f) => <button
        key={f.id}
        className={faceKey === f.id ? 'on' : ''}
        onClick={() => setFace(f.id)}
        role="tab"
        aria-selected={faceKey === f.id}
      >{t(f.labelZh, f.labelEn)}</button>)}
    </div>}
  </div>;

  /* ---------------- 中间：面编辑画布（SVG 矢量对象） ---------------- */
  const canvas = <div className="st-dz-wrap" ref={wrapRef}>
    <EditCanvas
      design={design}
      faceKey={faceKey}
      panel={activePanel}
      els={els}
      zoom={zoom}
      boardW={boardW}
      boardH={boardH}
      tool={tool}
      sel={selIds}
      onSelect={setSelIds}
      onPreview={(next) => { draftRef.current = next; setDraft(next); }}
      onCommit={(next, mergeKey) => commit(next, mergeKey)}
      onPickFile={() => pickFile()}
      onEditing={setEditing}
    />
    <div className="st-dz-caption">
      {t('安全边 5mm 已标出；出血 3mm 在导出时自动加上', '5 mm safe margin is marked; 3 mm bleed is added on export')}
    </div>
  </div>;

  /* ---------------- 中间：刀板展开 ---------------- */
  const flatView = <div className="st-dz-flat">
    {dieline && sheet
      ? <>
        {dieline.sheets.length > 1 && <div className="st-dz-sheets">
          {dieline.sheets.map((s, i) => <button key={s.id} className={sheetIdx === i ? 'on' : ''} onClick={() => setSheetIdx(i)}>{s.name}</button>)}
        </div>}
        <div className="st-dz-flat-board">
          <DielineView sheet={sheet} dieline={dieline} design={doc} className="st-dz-dieline" />
        </div>
        <div className="st-dz-caption">
          {sheet.width} × {sheet.height} mm · {t('黑实线裁切 / 红虚线压线 / 蓝虚线出血', 'solid = cut, dashed red = crease, dashed blue = bleed')}
        </div>
      </>
      : <p className="st-dz-empty">{t('还没有刀模几何。', 'No dieline geometry yet.')}</p>}
  </div>;

  /* ---------------- 中间：3D ---------------- */
  const unfold = () => {
    if (unfolding) return;
    setUnfolding(true);
    window.setTimeout(() => {
      setView('flat');
      setUnfolding(false);
      setToast(t('已展开成刀板，对着看能核对每个面', 'Unfolded to the dieline — check each panel against it'));
    }, 520);
  };

  const support = structure ? viewerSupport(structure) : null;
  const threeD = <div className={`st-dz-3d ${unfolding ? 'is-unfolding' : ''}`}>
    {!unfolding && doc && structure && dims && support?.level === 'reliable'
      ? <Suspense fallback={<Booting text={t('正在加载 3D…', 'Loading 3D…')} />}>
        <Viewer3D
          design={doc}
          structure={structure}
          size={dims}
          dieline={dieline}
          open={show3dOpen}
          material="matte"
          background="light"
          light={1}
          autoRotate={orbit}
        />
      </Suspense>
      : null}
    {!unfolding && support?.level === 'unsupported' && <div className="st-dz-3d-unsupported">
      <div className="st-dz-3d-icon"><Icon name="box3d" size={28} /></div>
      <b>{t(support.title, support.titleEn)}</b>
      <p>{t(support.detail, support.detailEn)}</p>
      <p className="st-dz-note">{t('这里不渲染示意模型，避免把错误折叠关系当成已验证结构。平面稿、刀板与印刷文件不受影响。',
        'No placeholder model is rendered, so an incorrect fold is never mistaken for a verified structure. Artwork, dieline and print files are unaffected.')}</p>
    </div>}
    {unfolding && <div className="st-dz-unfold">
      <span className="st-dz-unfold-sheet" />
      <p>{t('正在展开成刀板…', 'Unfolding to the dieline…')}</p>
    </div>}
    <div className="st-dz-3dbar">
      <button className={show3dOpen ? 'on' : ''} onClick={() => setShow3dOpen((v) => !v)} disabled={support?.level === 'unsupported'}>
        <Icon name="box3d" size={14} />{show3dOpen ? t('盖上', 'Close') : t('打开', 'Open')}
      </button>
      <button className={orbit ? 'on' : ''} onClick={() => setOrbit((v) => !v)} disabled={support?.level === 'unsupported'}>
        <Icon name="refresh" size={14} />{t('自动旋转', 'Turntable')}
      </button>
      <button className="st-dz-unfold-btn" onClick={unfold} disabled={unfolding}>
        <Icon name="scissors" size={14} />{t('展开成刀板', 'Unfold to dieline')}
      </button>
    </div>
    <div className="st-dz-caption">
      {support?.level === 'unsupported'
        ? t('该结构只提供平面与刀板视图，不提供猜测性的 3D 模型。', 'Flat and dieline views only — no guessed 3D model for this structure.')
        : t('3D 与平面稿读取同一份设计数据；未考虑纸厚、折叠补偿与插舌间隙，不等于量产结构。',
          '3D and artwork share one dataset. Paper thickness, fold compensation and tuck clearance are not modelled — this is not a production-ready structure.')}
    </div>
  </div>;

  const center = <>
    {viewBar}
    {view === 'face' ? canvas : view === 'flat' ? flatView : threeD}
  </>;

  const toolbar = <div className="st-ed-tools">
    {view === 'face'
      ? <>
        <button className={`st-ed-tool ${tool === 'select' ? 'on' : ''}`} onClick={() => setTool('select')}
          aria-label={t('选择工具', 'Select tool')} title="V"><Icon name="select" size={16} /></button>
        <button className={`st-ed-tool ${tool === 'hand' ? 'on' : ''}`} onClick={() => setTool('hand')}
          aria-label={t('平移画布', 'Pan canvas')} title="H / 空格"><Icon name="move" size={16} /></button>
        <span className="st-ed-tool-sep" aria-hidden />
        <button className="st-ed-tool" onClick={undo} disabled={!histRef.current || !canUndo(histRef.current)}
          aria-label={t('撤销', 'Undo')} title="⌘Z"><Icon name="undo" size={16} /></button>
        <button className="st-ed-tool" onClick={redo} disabled={!histRef.current || !canRedo(histRef.current)}
          aria-label={t('重做', 'Redo')} title="⇧⌘Z"><Icon name="redo" size={16} /></button>
        <span className="st-ed-tool-sep" aria-hidden />
        <button className="st-ed-tool" onClick={() => setZoom((z) => Math.max(50, z - 10))} aria-label={t('缩小', 'Zoom out')}>
          <Icon name="zoomOut" size={16} />
        </button>
        <button className="st-ed-tool-num" onClick={() => setZoom(100)} title={t('回到 100%', 'Reset')}>{zoom}%</button>
        <button className="st-ed-tool" onClick={() => setZoom((z) => Math.min(200, z + 10))} aria-label={t('放大', 'Zoom in')}>
          <Icon name="zoomIn" size={16} />
        </button>
        <button className="st-ed-tool" onClick={() => setZoom(100)} aria-label={t('适应窗口', 'Fit')}><Icon name="fit" size={16} /></button>
        <span className="st-ed-tool-sep" aria-hidden />
        <button className="st-ed-tool" onClick={addTextHere} title={t('加文字', 'Add text')} aria-label={t('加文字', 'Add text')}>
          <Icon name="text" size={16} />
        </button>
        <button className="st-ed-tool" onClick={() => addShapeHere('rect')} title={t('加矩形', 'Add rectangle')} aria-label={t('加矩形', 'Rectangle')}>
          <Icon name="shape" size={16} />
        </button>
        <button className="st-ed-tool" onClick={() => addShapeHere('ellipse')} title={t('加圆形', 'Add ellipse')} aria-label={t('加圆形', 'Ellipse')}>
          <Icon name="square" size={16} />
        </button>
        <button className="st-ed-tool" onClick={pickFile} title={t('上传图片', 'Upload image')} aria-label={t('上传图片', 'Upload')}>
          <Icon name="image" size={16} />
        </button>
        <span className="st-ed-tool-sep" aria-hidden />
        <button className="st-ed-tool-txt" onClick={() => { setTab('assets'); setMobile('left'); }}>
          <Icon name="spark" size={14} />{t('生成插图', 'Generate')}
        </button>
      </>
      : <button className="st-ed-tool-txt" onClick={() => setView('face')}>
        <Icon name="text" size={14} />{t('回到面编辑', 'Back to face editor')}
      </button>}
  </div>;

  const actions = <>
    <button className="st-ed-ghost" onClick={onBrief}>{t('改需求', 'Brief')}</button>
    <button className="st-ed-primary" onClick={() => { setTab('export'); setMobile('left'); }}>
      {t('导出刀板', 'Export')}<Icon name="chevronRight" size={15} />
    </button>
  </>;

  return <Frame
    mode="design"
    backTo="/studio"
    backLabel={t('项目', 'Projects')}
    title={<span className="st-ed-name" title={project.name}>{project.name}</span>}
    save={<span className={`st-save ${saveState}`} title={message || undefined}><i aria-hidden />{saveLabel}</span>}
    actions={actions}
    tabs={[
      { id: 'layers', label: t('图层', 'Layers') },
      { id: 'assets', label: t('素材', 'Assets') },
      { id: 'export', label: t('导出', 'Export') },
    ]}
    tab={tab}
    onTab={(x) => setTab(x as Tab)}
    left={tab === 'layers' ? layersPane : tab === 'assets' ? assetsPane : exportPane}
    leftFoot={<button className="st-ed-back-list" onClick={() => go('/studio')}>
      <Icon name="folder" size={14} />{t('所有项目', 'All projects')}
    </button>}
    center={<>{center}{toolbar}</>}
    right={<div className="st-right">
      <div className="st-right-tabs">
        <button className={rightTab === 'insp' ? 'on' : ''} onClick={() => setRightTab('insp')}>
          <Icon name="layers" size={13} />{t('属性', 'Properties')}
        </button>
        <button className={rightTab === 'chat' ? 'on' : ''} onClick={() => setRightTab('chat')}>
          <Icon name="message" size={13} />{t('顾问', 'Advisor')}
        </button>
      </div>
      {rightTab === 'insp'
        ? <Inspector
          design={design}
          faceKey={faceKey}
          panel={activePanel}
          els={els}
          sel={selIds}
          onCommit={(next, key) => commit(next, key)}
          onPickFile={pickReplace}
          onGroup={() => { const g = groupEls(design, selIds, faceKey); commit(g.design); }}
          onUngroup={() => commit(ungroupEls(design, selIds, faceKey))}
          onOrder={(a) => commit(orderEls(design, selIds, a, faceKey))}
          onDuplicate={() => {
            const r = duplicateEls(design, selIds, faceKey);
            commit(r.design);
            setSelIds(r.ids);
          }}
          onDelete={() => { commit(removeEls(design, selIds, faceKey)); setSelIds([]); }}
        />
        : <StudioChat
          messages={project.chat || []}
          onChange={(next) => update((cur) => ({ ...cur, chat: next.slice(-MAX_CHAT) }))}
          cloudbaseUid={uid}
          project={project}
          design={design}
          faceKey={faceKey}
          panel={activePanel}
          selectedIds={selIds}
          onApplyAI={commitAI}
          onUndo={undo}
        />}
    </div>}
    view={mobile}
    onView={setMobile}
    panelLabel={t(tab === 'assets' ? '素材' : tab === 'export' ? '导出' : '图层', tab === 'assets' ? 'Assets' : tab === 'export' ? 'Export' : 'Layers')}
  />;
}
