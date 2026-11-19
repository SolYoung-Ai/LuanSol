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
import { useSubscription, recordUsage } from '../cloud/subscription';
import { imageCost } from '../cloud/models';
import { callImage } from '../engine/seedream';
import { DielineView } from '../components/visuals';
import {
  buildBundle, buildDxf, buildPdf, downloadText, exportPng, mockupSvg, spreadSvg,
} from '../engine/export';
import { downloadBlob } from '../engine/utils';
import { compressImageForUpload } from '../workflow/imageUtils';
import {
  faceEls, formDef, sizeOk, sizeText,
  type DesignEl, type StudioDesign,
} from './types';
import {
  STUDIO_SAFE, dielineOf, dielineSummary, dimsOf, designDocFor, faceRatio, facesOf, structureFor,
} from './frames';
import { Booting, Frame, type MobileView } from './Frame';
import { useStudioProject } from './useStudio';
import {
  addText, buildDesign, duplicateEl, moveEl, patchEl, removeEl, reorderEl, resizeEl, setSticker,
  stickerPrompt,
} from './design';
import StudioChat from './StudioChat';

const Viewer3D = lazy(() => import('../components/Viewer3D'));

const MAX_CHAT = 60;
const TIER = 'flash' as const;

/** 出图后先缩到 900px 再进项目：原图 1024² 的 base64 能到 2MB，项目不能每张都整张塞进去 */
async function shrink(src: string, maxEdge = 900): Promise<string> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const s = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    const ctx = c.getContext('2d');
    if (!ctx) return src;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const webp = c.toDataURL('image/webp', 0.92);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
  } catch {
    return src;
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
  const [sel, setSel] = useState('');
  const [draft, setDraft] = useState<StudioDesign | null>(null);
  const [prompt, setPrompt] = useState('');
  const [gen, setGen] = useState<'idle' | 'run' | 'err'>('idle');
  const [genMsg, setGenMsg] = useState('');
  const [sheetIdx, setSheetIdx] = useState(0);
  const [unfolding, setUnfolding] = useState(false);
  const [show3dOpen, setShow3dOpen] = useState(true);
  const [orbit, setOrbit] = useState(true);
  const [exporting, setExporting] = useState('');

  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const draftRef = useRef<StudioDesign | null>(null);
  const dragging = useRef(false);
  const drag = useRef<{
    id: string; mode: 'move' | 'size'; px: number; py: number; x: number; y: number; w: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const design = draft ?? project?.design ?? null;
  const panels = useMemo(() => (project ? facesOf(project) : []), [project]);
  const activePanel = panels.find((f) => f.id === face) || panels[0] || null;
  const faceKey = activePanel?.id || 'front';

  const dieline = useMemo(() => (project ? dielineOf(project) : null), [project]);
  const dims = useMemo(() => (project ? dimsOf(project) : null), [project]);
  const structure = useMemo(() => (project ? structureFor(project.answers.form.v) : null), [project]);
  const summary = useMemo(() => dielineSummary(dieline), [dieline]);

  /* 3D 的取景：Viewer3D 的相机距离是固定的，210mm 的袋子会顶出画面。
     这里只等比缩小「显示尺寸」，比例与贴图不变——真实毫米仍走导出。 */
  const viewSize = useMemo(() => {
    if (!dims) return null;
    const max = Math.max(dims.l, dims.w, dims.h);
    const k = max > 140 ? 140 / max : 1;
    return k === 1 ? dims : { l: dims.l * k, w: dims.w * k, h: dims.h * k };
  }, [dims]);

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

  /* 云端/外部更新时同步；正在拖的时候不抢 */
  useEffect(() => {
    if (dragging.current) return;
    draftRef.current = project?.design ?? null;
    setDraft(project?.design ?? null);
  }, [project?.design]);

  useEffect(() => {
    if (project) setPrompt(stickerPrompt(project));
  }, [project?.id, project?.answers.form.v, project?.answers.patterns.v.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 放下插图后直接选中它，用户不用再去图层里找 */
  const selectSticker = useCallback((d: StudioDesign, key: string) => {
    const list = faceEls(d, key);
    const s = [...list].reverse().find((e) => e.kind === 'sticker');
    if (s) setSel(s.id);
  }, []);

  const commit = useCallback((d: StudioDesign) => {
    draftRef.current = d;
    setDraft(d);
    update((cur) => ({ ...cur, design: d }));
  }, [update]);

  /* 确认过但没有设计稿（旧数据）：进来补一版 */
  useEffect(() => {
    if (!project || project.design || loadState !== 'ready') return;
    const d = buildDesign(project);
    draftRef.current = d;
    setDraft(d);
    update((cur) => ({ ...cur, design: d }));
  }, [project, loadState, update]);

  /* 切面时清空选中，避免选中框跟到另一面 */
  useEffect(() => { setSel(''); }, [faceKey]);

  const context = useMemo(() => {
    if (!project) return '';
    const els = (design ? faceEls(design, faceKey) : []).map((e) => e.kind === 'sticker'
      ? `插图(${e.src ? '已放图' : '空位'}) ${Math.round(e.x)}%/${Math.round(e.y)}%`
      : e.kind === 'rect' ? `色块 ${Math.round(e.x)}%/${Math.round(e.y)}%`
        : `文字「${(e.text || '').slice(0, 24)}」 字号 ${e.size || 3}`);
    return `【你现在在编辑器】用户已确认需求，正在做包装版面。
【当前视图】${view === 'face' ? `面编辑 · ${activePanel ? activePanel.labelZh : '正面'}` : view === 'flat' ? '刀板展开图' : '3D 预览'}
【包装结构】${structure || '无'}，成品 ${dims ? sizeText(dims) : '尺寸未定'}
【刀模】${summary ? `${summary.sheets} 张展开图，${summary.cut} 条裁切线 / ${summary.crease} 条压线` : '尚未生成'}
【这一面的元素】${els.join('；') || '空'}
【结构化需求】
${JSON.stringify(project.answers.productName.v ? { 产品: project.answers.productName.v, 形式: formDef(project.answers.form.v)?.zh } : {})}`;
  }, [project, design, faceKey, view, activePanel, structure, dims, summary]);

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
  const safeInsetX = activePanel ? (STUDIO_SAFE / activePanel.w) * 100 : 5;
  const safeInsetY = activePanel ? (STUDIO_SAFE / activePanel.h) * 100 : 5;

  /* ---------------- 拖 / 拉宽 ---------------- */
  const onDown = (e: React.PointerEvent, el: DesignEl, mode: 'move' | 'size') => {
    e.preventDefault();
    e.stopPropagation();
    setSel(el.id);
    dragging.current = true;
    drag.current = { id: el.id, mode, px: e.clientX, py: e.clientY, x: el.x, y: el.y, w: el.w };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const cur = draftRef.current;
    if (!d || !cur) return;
    const dx = ((e.clientX - d.px) / boardW) * 100;
    const dy = ((e.clientY - d.py) / boardH) * 100;
    const next = d.mode === 'move'
      ? moveEl(cur, d.id, d.x + dx, d.y + dy, faceKey)
      : resizeEl(cur, d.id, d.w + dx, faceKey);
    draftRef.current = next;
    setDraft(next);
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    dragging.current = false;
    const cur = draftRef.current;
    if (d && cur) commit(cur);
  };

  const els = faceEls(design, faceKey);
  const selected = els.find((e) => e.id === sel) || null;
  const order = [...els].reverse();

  /* ---------------- 生成插图 ---------------- */
  const cost = imageCost(TIER);

  const regenerate = async () => {
    if (gen === 'run') return;
    if (!uid) { setToast(t('登录后才能生成插图', 'Sign in to generate graphics')); return; }
    const bal = sub.usedLeft ?? 0;
    if (bal < cost) {
      setGen('err');
      setGenMsg(t(`积分不足：生一张插图 ${cost} 积分，当前余额 ${bal}。可在「积分与充值」签到或兑换后再试。`,
        `Not enough credits: ${cost} per graphic, balance ${bal}.`));
      return;
    }
    setGen('run');
    setGenMsg(t('正在生成插图…', 'Generating the graphic…'));
    try {
      const raw = await callImage(prompt.trim() || stickerPrompt(project), { tier: TIER, uid, size: '1024x1024' });
      const src = await shrink(raw);
      const cur = draftRef.current;
      if (cur) {
        const next = setSticker(cur, src, faceKey);
        commit(next);
        selectSticker(next, faceKey);
      }
      await recordUsage(uid, cost, 'image');
      setGen('idle');
      setGenMsg(t(`已生成并扣 ${cost} 积分`, `Generated · ${cost} credits used`));
      setToast(t('插图已放到这一面，可以拖动和改大小', 'Graphic placed on this face — drag or resize it'));
    } catch (e) {
      setGen('err');
      setGenMsg((e as Error)?.message || t('生成失败，积分未扣', 'Failed — no credits were used'));
    }
  };

  /* 上传自己的图：走和 Logo 同一条压缩链路，别把 30MB 原图塞进项目 */
  const uploadOwn = async (f: File | undefined) => {
    if (!f) return;
    try {
      const c = await compressImageForUpload(f, { maxEdge: 1400, maxBytes: 700 * 1024 });
      const next = setSticker(draftRef.current || design, c.dataUrl, faceKey);
      commit(next);
      selectSticker(next, faceKey);
      setToast(t('已放到这一面，可以拖动和改大小', 'Placed on this face — drag or resize it'));
    } catch {
      setToast(t('这张图读不出来，换 JPG / PNG / WebP 试试', 'Could not read this image — try JPG / PNG / WebP'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const pickFile = () => fileRef.current?.click();

  /* ---------------- 导出 ---------------- */
  const sizeReady = !!project.answers.size && sizeOk(project.answers.size.dims)
    && (project.answers.size.confirmed || project.answers.size.mode === 'custom');
  const canExport = !!doc && !!dieline && sizeReady;

  const runExport = async (kind: string) => {
    if (!doc || !dieline) return;
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
        const { blob } = await buildPdf(doc, dieline);
        downloadBlob(blob, `${base}_印刷稿.pdf`);
        setToast(t('已导出印刷稿 PDF：毫米页面 + 逐图层 + 独立刀模页', 'Print PDF exported: mm pages, per-layer art, separate dieline page'));
      } else if (kind === 'dxf') {
        const dxf = buildDxf(dieline, sheetIdx);
        downloadText(dxf, `${base}_刀模_${dieline.sheets[sheetIdx]?.name || 'sheet'}.dxf`, 'application/dxf');
        setToast(t('已导出 DXF 刀模（CAD 可直接打开）', 'DXF dieline exported'));
      } else if (kind === 'zip') {
        const { blob } = await buildBundle(doc, dieline);
        downloadBlob(blob, `${base}_全套文件.zip`);
        setToast(t('已打包：展开稿 / 刀模 DXF / 印刷 PDF / 说明', 'Bundle ready: artwork, DXF, PDF, notes'));
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

  /* ---------------- 左侧：图层 + 属性 ---------------- */
  const layersPane = <div className="st-dz-lyrs">
    <div className="st-ed-sec-label">{t('图层', 'Layers')}<em>{els.length}</em></div>
    <div className="st-dz-facetag">{activePanel ? t(activePanel.labelZh, activePanel.labelEn) : ''}
      <i>{activePanel ? `${Math.round(activePanel.w)} × ${Math.round(activePanel.h)} mm` : ''}</i>
    </div>
    {!els.length && <p className="st-dz-note">
      {t('这一面还是空的。加一行文字，或到「素材」里生成一张插图。', 'This face is empty — add text or generate a graphic in Assets.')}
    </p>}
    {order.map((e) => <button
      key={e.id}
      className={`st-dz-lyr ${sel === e.id ? 'on' : ''}`}
      onClick={() => setSel(e.id)}
    >
      <span className={`st-dz-lyr-k ${e.kind}`} aria-hidden>
        {e.kind === 'text' ? 'T' : e.kind === 'rect' ? '▬' : '✦'}
      </span>
      <b>{e.kind === 'text' ? (e.text || t('文字', 'Text')).slice(0, 14)
        : e.kind === 'rect' ? t('色块', 'Bar')
          : (e.src ? t('插图', 'Graphic') : t('插图 · 待生成', 'Graphic · empty'))}</b>
      <span className="st-dz-lyr-dot" aria-hidden />
    </button>)}

    {selected && <div className="st-dz-insp">
      <div className="st-dz-insp-head">
        <b>{selected.kind === 'text' ? t('文字', 'Text') : selected.kind === 'rect' ? t('色块', 'Bar') : t('插图', 'Graphic')}</b>
        <button className="st-dz-insp-x" onClick={() => { commit(removeEl(design, selected.id, faceKey)); setSel(''); }} title={t('删除这个元素', 'Delete')}>
          <Icon name="trash" size={13} />
        </button>
      </div>

      {selected.kind === 'text' && <>
        <label className="st-dz-field">
          <span>{t('内容', 'Text')}</span>
          <textarea
            rows={2}
            value={selected.text || ''}
            onChange={(ev) => commit(patchEl(design, selected.id, { text: ev.target.value }, faceKey))}
          />
        </label>
        <label className="st-dz-field">
          <span>{t('字号', 'Size')}<em>{Math.round((selected.size || 3) * 10) / 10}</em></span>
          <input
            type="range" min={1} max={16} step={0.5}
            value={selected.size || 3}
            onChange={(ev) => commit(patchEl(design, selected.id, { size: Number(ev.target.value) }, faceKey))}
          />
        </label>
        <label className="st-dz-field">
          <span>{t('字重', 'Weight')}<em>{Number(selected.weight || 400)}</em></span>
          <input
            type="range" min={300} max={800} step={100}
            value={selected.weight || 400}
            onChange={(ev) => commit(patchEl(design, selected.id, { weight: Number(ev.target.value) }, faceKey))}
          />
        </label>
        <div className="st-dz-field">
          <span>{t('对齐', 'Align')}</span>
          <div className="st-dz-align">
            {(['left', 'center', 'right'] as const).map((a) => <button
              key={a}
              className={(selected.align || 'left') === a ? 'on' : ''}
              onClick={() => commit(patchEl(design, selected.id, { align: a }, faceKey))}
              title={a}
            >{a === 'left' ? <Icon name="alignLeft" size={14} /> : a === 'center' ? <Icon name="alignHCenter" size={14} /> : <Icon name="alignRight" size={14} />}</button>)}
          </div>
        </div>
        <label className="st-dz-field">
          <span>{t('颜色', 'Colour')}</span>
          <div className="st-dz-colors">
            {[design.ink, design.accent, design.bg, '#FFFFFF', '#8C2F2F', '#2F5D4A'].map((c) => <button
              key={c}
              className={selected.color === c ? 'on' : ''}
              style={{ background: c }}
              onClick={() => commit(patchEl(design, selected.id, { color: c }, faceKey))}
              aria-label={c}
            />)}
          </div>
        </label>
      </>}

      {selected.kind === 'rect' && <>
        <label className="st-dz-field">
          <span>{t('高度', 'Height')}<em>{Math.round((selected.h || 0.5) * 10) / 10}%</em></span>
          <input
            type="range" min={0.1} max={20} step={0.1}
            value={selected.h || 0.5}
            onChange={(ev) => commit(patchEl(design, selected.id, { h: Number(ev.target.value) }, faceKey))}
          />
        </label>
        <label className="st-dz-field">
          <span>{t('颜色', 'Colour')}</span>
          <div className="st-dz-colors">
            {[design.accent, design.ink, '#C8A96A', '#8C2F2F', '#2F5D4A', '#23364D'].map((c) => <button
              key={c}
              className={selected.color === c ? 'on' : ''}
              style={{ background: c }}
              onClick={() => commit(patchEl(design, selected.id, { color: c }, faceKey))}
              aria-label={c}
            />)}
          </div>
        </label>
      </>}

      {selected.kind === 'sticker' && <>
        {!selected.src && <p className="st-dz-note">
          {t('这个位置还没图。到「素材」里生成一张，或上传自己的图。', 'Empty. Generate one in Assets, or upload your own.')}
        </p>}
        <div className="st-dz-insp-row">
          <button onClick={pickFile}>{t('换图', 'Replace')}</button>
          {selected.src && <button className="st-dz-insp-danger" onClick={() => commit(patchEl(design, selected.id, { src: undefined }, faceKey))}>
            {t('清空', 'Clear')}
          </button>}
        </div>
      </>}

      <div className="st-dz-insp-row">
        <button onClick={() => commit(reorderEl(design, selected.id, 1, faceKey))} title={t('上移一层', 'Bring forward')}>↑</button>
        <button onClick={() => commit(reorderEl(design, selected.id, -1, faceKey))} title={t('下移一层', 'Send backward')}>↓</button>
        <button onClick={() => commit(resizeEl(design, selected.id, selected.w + 4, faceKey))} title={t('加宽', 'Wider')}>+</button>
        <button onClick={() => commit(resizeEl(design, selected.id, selected.w - 4, faceKey))} title={t('收窄', 'Narrower')}>−</button>
        <button onClick={() => commit(duplicateEl(design, selected.id, faceKey))} title={t('复制', 'Duplicate')}><Icon name="copy" size={13} /></button>
      </div>
    </div>}

    <button className="st-dz-add" onClick={() => {
      const d = addText(design, t('双击改文字', 'Double-click to edit'), faceKey);
      commit(d);
      const list = faceEls(d, faceKey);
      setSel(list[list.length - 1].id);
    }}>
      <Icon name="plus" size={14} />{t('加一行文字', 'Add text')}
    </button>
  </div>;

  /* ---------------- 左侧：素材 ---------------- */
  const logoSrc = project.answers.logo.image || project.answers.logo.refImage || '';

  const assetsPane = <div className="st-dz-assets">
    <div className="st-dz-facetag">{activePanel ? t(activePanel.labelZh, activePanel.labelEn) : ''}
      <i>{t('素材会放到这一面', 'Goes onto this face')}</i></div>

    <div className="st-ed-sec-label">{t('生成插图', 'Generate a graphic')}</div>
    <label className="st-dz-field">
      <span>{t('想生成什么', 'What to draw')}</span>
      <textarea rows={4} value={prompt} onChange={(ev) => setPrompt(ev.target.value)} />
    </label>
    <button className="st-dz-gen" onClick={() => void regenerate()} disabled={gen === 'run'}>
      {gen === 'run' ? <span className="st-spin" aria-hidden /> : <Icon name="spark" size={14} />}
      {gen === 'run' ? t('正在生成…', 'Generating…') : t(`生成一张 · ${cost} 积分`, `Generate · ${cost} credits`)}
    </button>
    {genMsg && <p className={`st-dz-note ${gen === 'err' ? 'warn' : ''}`}>{genMsg}</p>}
    <p className="st-dz-note">{t('提示词已按需求写好，可以改成你想画的样子。按次计费，失败不扣。',
      'The prompt is pre-filled from your brief — edit it freely. Charged per image; failures are not charged.')}</p>

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

    <div className="st-ed-sec-label">{t('底色', 'Canvas colour')}<em>{t('所有面共用', 'all faces')}</em></div>
    <div className="st-dz-colors is-wide">
      {[design.bg, design.ink, design.accent, '#FFFFFF', '#FBF9F5', '#F4EEE4', '#191919', '#23364D', '#8C2F2F', '#2F5D4A'].map((c) => <button
        key={c}
        className={design.bg === c ? 'on' : ''}
        style={{ background: c }}
        onClick={() => commit({ ...design, bg: c, updatedAt: Date.now() })}
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

    {!sizeReady && <p className="st-dz-note warn">
      {t('尺寸还没确认，导出不会按真实毫米算。回需求确认尺寸后再来。', 'The size is not confirmed yet — exports would not use real millimetres.')}
      <button className="st-dz-link" onClick={onBrief}>{t('去确认尺寸', 'Confirm size')}</button>
    </p>}

    <div className="st-ed-sec-label">{t('导出', 'Export')}</div>
    <div className="st-dz-exports">
      <button className="st-dz-exp" onClick={() => void runExport('pdf')} disabled={!canExport || !!exporting}>
        <b>{t('印刷稿 PDF', 'Print PDF')}</b>
        <em>{t('毫米页面 · 逐图层 · 独立刀模页', 'mm pages · per layer · dieline page')}</em>
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

  /* ---------------- 中间：面编辑画布 ---------------- */
  const canvas = <div className="st-dz-wrap" ref={wrapRef} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
    <div
      className="st-dz-board"
      style={{ width: boardW, height: boardH, background: design.bg }}
      onPointerDown={() => setSel('')}
    >
      {els.map((e) => {
        const base = {
          left: `${e.x}%`,
          top: `${e.y}%`,
          width: `${e.w}%`,
          opacity: e.opacity ?? 1,
        } as React.CSSProperties;

        if (e.kind === 'rect') {
          return <div
            key={e.id}
            className={`st-dz-el is-rect ${sel === e.id ? 'is-sel' : ''}`}
            style={{ ...base, height: `${(e.h || 0.5) / 100 * boardH}px`, background: e.color || design.accent }}
            onPointerDown={(ev) => onDown(ev, e, 'move')}
          />;
        }

        if (e.kind === 'sticker') {
          return <div
            key={e.id}
            className={`st-dz-el is-sticker ${sel === e.id ? 'is-sel' : ''} ${e.src ? '' : 'is-empty'}`}
            style={base}
            onPointerDown={(ev) => onDown(ev, e, 'move')}
          >
            {e.src
              ? <img src={e.src} alt="" draggable={false} />
              : <button
                className="st-dz-ph"
                onPointerDown={(ev) => { ev.stopPropagation(); setSel(e.id); }}
                onClick={() => { setTab('assets'); setMobile('left'); }}
              >
                <Icon name="image" size={15} />
                <span>{t('放一张图', 'Add artwork')}</span>
              </button>}
            {sel === e.id && <span className="st-dz-handle" onPointerDown={(ev) => onDown(ev, e, 'size')} />}
          </div>;
        }

        return <div
          key={e.id}
          className={`st-dz-el is-text ${sel === e.id ? 'is-sel' : ''}`}
          style={{
            ...base,
            fontSize: `${((e.size || 3) * boardW) / 100}px`,
            color: e.color || design.ink,
            fontWeight: e.weight || 400,
            textAlign: e.align || 'left',
          }}
          onPointerDown={(ev) => onDown(ev, e, 'move')}
        >
          {e.text}
          {sel === e.id && <span className="st-dz-handle" onPointerDown={(ev) => onDown(ev, e, 'size')} />}
        </div>;
      })}

      <span className="st-dz-safe" style={{ left: `${safeInsetX}%`, right: `${safeInsetX}%`, top: `${safeInsetY}%`, bottom: `${safeInsetY}%` }} aria-hidden />
    </div>
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

  const threeD = <div className={`st-dz-3d ${unfolding ? 'is-unfolding' : ''}`}>
    {doc && structure && viewSize && !unfolding
      ? <Suspense fallback={<Booting text={t('正在加载 3D…', 'Loading 3D…')} />}>
        <Viewer3D
          design={doc}
          structure={structure}
          size={viewSize || dims}
          open={show3dOpen}
          material="matte"
          background="light"
          light={1}
          autoRotate={orbit}
        />
      </Suspense>
      : null}
    {unfolding && <div className="st-dz-unfold">
      <span className="st-dz-unfold-sheet" />
      <p>{t('正在展开成刀板…', 'Unfolding to the dieline…')}</p>
    </div>}
    <div className="st-dz-3dbar">
      <button className={show3dOpen ? 'on' : ''} onClick={() => setShow3dOpen((v) => !v)}>
        <Icon name="box3d" size={14} />{show3dOpen ? t('盖上', 'Close') : t('打开', 'Open')}
      </button>
      <button className={orbit ? 'on' : ''} onClick={() => setOrbit((v) => !v)}>
        <Icon name="refresh" size={14} />{t('自动旋转', 'Turntable')}
      </button>
      <button className="st-dz-unfold-btn" onClick={unfold} disabled={unfolding}>
        <Icon name="scissors" size={14} />{t('展开成刀板', 'Unfold to dieline')}
      </button>
    </div>
    <div className="st-dz-caption">
      {t('3D 用的是这台机器的 WebGL；各面贴的就是你刚编辑的版面。', 'Rendered with your GPU; each face carries the artwork you just edited.')}
    </div>
  </div>;

  const center = <>
    {viewBar}
    {view === 'face' ? canvas : view === 'flat' ? flatView : threeD}
  </>;

  const toolbar = <div className="st-ed-tools">
    {view === 'face'
      ? <>
        <button className="st-ed-tool" onClick={() => setZoom((z) => Math.max(50, z - 10))} aria-label={t('缩小', 'Zoom out')}>
          <Icon name="zoomOut" size={16} />
        </button>
        <button className="st-ed-tool-num" onClick={() => setZoom(100)} title={t('回到 100%', 'Reset')}>{zoom}%</button>
        <button className="st-ed-tool" onClick={() => setZoom((z) => Math.min(200, z + 10))} aria-label={t('放大', 'Zoom in')}>
          <Icon name="zoomIn" size={16} />
        </button>
        <span className="st-ed-tool-sep" aria-hidden />
        <button className="st-ed-tool" onClick={() => setZoom(100)} aria-label={t('适应窗口', 'Fit')}>
          <Icon name="fit" size={16} />
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
    right={<StudioChat
      messages={project.chat || []}
      onChange={(next) => update((cur) => ({ ...cur, chat: next.slice(-MAX_CHAT) }))}
      context={context}
      cloudbaseUid={uid}
    />}
    view={mobile}
    onView={setMobile}
    panelLabel={t(tab === 'assets' ? '素材' : tab === 'export' ? '导出' : '图层', tab === 'assets' ? 'Assets' : tab === 'export' ? 'Export' : 'Layers')}
  />;
}
