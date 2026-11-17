/* ============================================================
   Studio 2.0 — 编辑器（做图的那一屏）
   ------------------------------------------------------------
   需求确认之后才进来。这里才是「画布 + 缩放 + 元素」的世界：
     · 画布按包装形式给比例，缩放 50–200%，可「适应窗口」；
     · 元素可点选、拖动、拉宽，图层能上下调、能删；
     · 贴纸走真实生图接口：写一句话 → 出图 → 落进画布 → 扣积分；
     · 右侧始终是 Luna，问它「这块怎么改」比看文档快。
   没有的东西不假装有：导出、印前检查还没做，界面里就不放按钮。
   ============================================================ */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';
import { useApp } from '../store';
import { Icon } from '../components/icons';
import { useSubscription, recordUsage } from '../cloud/subscription';
import { imageCost } from '../cloud/models';
import { callImage } from '../engine/seedream';
import {
  CATEGORIES, PATTERNS, STYLES, exportStructured, formDef, missingRequired, sizeText,
  type DesignEl, type StudioDesign, type StudioProject,
} from './types';
import { Booting, Frame, type MobileView } from './Frame';
import { useStudioProject } from './useStudio';
import {
  addText, buildDesign, moveEl, patchEl, removeEl, reorderEl, resizeEl, setSticker, stickerPrompt,
} from './design';
import StudioChat from './StudioChat';

const MAX_CHAT = 60;
const TIER = 'flash' as const;

/** 出图后先缩到 900px 再进项目：原图 1024² 的 base64 能到 2MB，
 *  项目表已经 30MB，不能每张都整张塞进去。 */
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

export default function DesignStage({ id, onBrief }: { id: string; onBrief: () => void }) {
  const { t } = useLang();
  const { setToast } = useApp();
  const sub = useSubscription();
  const { project, loadState, saveState, savedAt, message, update, uid } = useStudioProject(id);

  const [tab, setTab] = useState<'layers' | 'assets' | 'brief'>('layers');
  const [view, setView] = useState<MobileView>('canvas');
  const [zoom, setZoom] = useState(100);
  const [sel, setSel] = useState('');
  const [draft, setDraft] = useState<StudioDesign | null>(null);
  const [prompt, setPrompt] = useState('');
  const [gen, setGen] = useState<'idle' | 'run' | 'err'>('idle');
  const [genMsg, setGenMsg] = useState('');

  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const draftRef = useRef<StudioDesign | null>(null);
  const dragging = useRef(false);
  /** 拖拽状态。必须是 hook，不能放在下面那些条件 return 之后——React #310 的教训。 */
  const drag = useRef<{
    id: string; mode: 'move' | 'size'; px: number; py: number; x: number; y: number; w: number;
  } | null>(null);
  /** 拖拽状态。必须是 hook，不能放在下面那些条件 return 之后——React #310 的教训。 */
  const design = draft ?? project?.design ?? null;

  /* 画布尺寸：容器多大，画布就按比例装进去（缩放再乘上去） */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loadState]);

  /* 外部（云端 / 别的页）更新了设计稿时同步进来；正在拖的时候不抢 */
  useEffect(() => {
    if (dragging.current) return;
    draftRef.current = project?.design ?? null;
    setDraft(project?.design ?? null);
  }, [project?.design]);

  useEffect(() => { if (project) setPrompt(stickerPrompt(project)); }, [project?.id, project?.answers.form.v, project?.answers.patterns.v.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const missing = useMemo(() => (project ? missingRequired(project) : []), [project]);

  const context = useMemo(() => {
    if (!project) return '';
    const br = exportStructured(project);
    const els = (design?.els || []).map((e) => e.kind === 'sticker'
      ? `贴纸(${e.src ? '已生成' : '未生成'}) 位置 ${Math.round(e.x)}%/${Math.round(e.y)}%`
      : e.kind === 'rect' ? `色块 位置 ${Math.round(e.x)}%/${Math.round(e.y)}%`
        : `文字「${(e.text || '').slice(0, 24)}」 位置 ${Math.round(e.x)}%/${Math.round(e.y)}%`);
    return `【你现在在编辑器】用户已经确认需求，正在画布上调整版面。
【画布】${design ? `${design.ratio[0]}:${design.ratio[1]}，底色 ${design.bg}，字色 ${design.ink}` : '尚未生成'}
【画面元素】${els.join('；') || '空'}
【结构化需求】
${JSON.stringify({ written: br.written, selected: br.selected, ai: br.ai, pending: br.pending })}`;
  }, [project, design]);

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

  /* ---------------- 几何：画布像素 ---------------- */
  const [rw, rh] = design.ratio;
  /* 底部要给浮动工具条留位置：不留的话画布下沿会被工具条压住 */
  const fit = box.w > 0
    ? Math.min((box.w - 48) / rw, (box.h - 116) / rh)
    : 0;
  const scale = Math.max(0.2, fit * (zoom / 100));
  const boardW = Math.max(1, rw * scale);
  const boardH = Math.max(1, rh * scale);

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
      ? moveEl(cur, d.id, d.x + dx, d.y + dy)
      : resizeEl(cur, d.id, d.w + dx);
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

  const selected = design.els.find((e) => e.id === sel) || null;

  /* ---------------- 生成贴纸 ---------------- */
  const cost = imageCost(TIER);

  const regenerate = async () => {
    if (gen === 'run') return;
    if (!uid) { setToast(t('登录后才能生成贴纸', 'Sign in to generate graphics')); return; }
    const bal = sub.usedLeft ?? 0;
    if (bal < cost) {
      setGen('err');
      setGenMsg(t(`积分不足：生一张贴纸 ${cost} 积分，当前余额 ${bal}。可在「积分与充值」签到或兑换后再试。`,
        `Not enough credits: ${cost} per graphic, balance ${bal}.`));
      return;
    }
    setGen('run');
    setGenMsg(t('正在生成贴纸图案…', 'Generating the graphic…'));
    try {
      const raw = await callImage(prompt.trim() || stickerPrompt(project), { tier: TIER, uid, size: '1024x1024' });
      const src = await shrink(raw);
      const cur = draftRef.current;
      if (cur) commit(setSticker(cur, src));
      await recordUsage(uid, cost, 'image');
      setGen('idle');
      setGenMsg(t(`已生成并扣 ${cost} 积分`, `Generated · ${cost} credits used`));
      setSel('sticker');
      setToast(t('贴纸已经放到画布上了，可以拖动和改大小', 'Graphic placed on the canvas — drag or resize it'));
    } catch (e) {
      setGen('err');
      setGenMsg((e as Error)?.message || t('生成失败，积分未扣', 'Failed — no credits were used'));
    }
  };

  /* ---------------- 左侧：图层 ---------------- */
  const order = [...design.els].reverse(); // 最上面的元素排最前

  const layersPane = <div className="st-dz-lyrs">
    <div className="st-ed-sec-label">{t('图层', 'Layers')}<em>{design.els.length}</em></div>
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
          : (e.src ? t('贴纸', 'Graphic') : t('贴纸 · 待生成', 'Graphic · empty'))}</b>
      <span className="st-dz-lyr-dot" aria-hidden />
    </button>)}

    {selected && <div className="st-dz-insp">
      <div className="st-dz-insp-head">
        <b>{selected.kind === 'text' ? t('文字', 'Text') : selected.kind === 'rect' ? t('色块', 'Bar') : t('贴纸', 'Graphic')}</b>
        <button className="st-dz-insp-x" onClick={() => { commit(removeEl(design, selected.id)); setSel(''); }} title={t('删除这个元素', 'Delete')}>
          <Icon name="trash" size={13} />
        </button>
      </div>

      {selected.kind === 'text' && <>
        <label className="st-dz-field">
          <span>{t('内容', 'Text')}</span>
          <textarea
            rows={2}
            value={selected.text || ''}
            onChange={(ev) => commit(patchEl(design, selected.id, { text: ev.target.value }))}
          />
        </label>
        <label className="st-dz-field">
          <span>{t('字号', 'Size')}<em>{Math.round((selected.size || 3) * 10) / 10}</em></span>
          <input
            type="range" min={1} max={16} step={0.5}
            value={selected.size || 3}
            onChange={(ev) => commit(patchEl(design, selected.id, { size: Number(ev.target.value) }))}
          />
        </label>
        <label className="st-dz-field">
          <span>{t('颜色', 'Colour')}</span>
          <div className="st-dz-colors">
            {[design.ink, design.accent, design.bg, '#FFFFFF', '#8C2F2F', '#2F5D4A'].map((c) => <button
              key={c}
              className={selected.color === c ? 'on' : ''}
              style={{ background: c }}
              onClick={() => commit(patchEl(design, selected.id, { color: c }))}
              aria-label={c}
            />)}
          </div>
        </label>
      </>}

      {selected.kind === 'sticker' && !selected.src && <p className="st-dz-note">
        {t('这个位置还没图。到「图案」里写一句描述生成一张。', 'Empty. Describe it in Graphics and generate one.')}
      </p>}

      <div className="st-dz-insp-row">
        <button onClick={() => commit(reorderEl(design, selected.id, 1))} title={t('上移一层', 'Bring forward')}>↑</button>
        <button onClick={() => commit(reorderEl(design, selected.id, -1))} title={t('下移一层', 'Send backward')}>↓</button>
        <button onClick={() => commit(resizeEl(design, selected.id, selected.w + 4))}>+</button>
        <button onClick={() => commit(resizeEl(design, selected.id, selected.w - 4))}>−</button>
      </div>
    </div>}

    <button className="st-dz-add" onClick={() => { const d = addText(design); commit(d); setSel(d.els[d.els.length - 1].id); }}>
      <Icon name="plus" size={14} />{t('加一行文字', 'Add text')}
    </button>
  </div>;

  /* ---------------- 左侧：图案（生成贴纸） ---------------- */
  const logoSrc = project.answers.logo.image || project.answers.logo.refImage || '';

  const assetsPane = <div className="st-dz-assets">
    <div className="st-ed-sec-label">{t('图案', 'Graphics')}</div>

    <label className="st-dz-field">
      <span>{t('想生成什么', 'What to draw')}</span>
      <textarea rows={4} value={prompt} onChange={(ev) => setPrompt(ev.target.value)} />
    </label>

    <button className="st-dz-gen" onClick={() => void regenerate()} disabled={gen === 'run'}>
      {gen === 'run' ? <span className="st-spin" aria-hidden /> : <Icon name="image" size={14} />}
      {gen === 'run'
        ? t('正在生成…', 'Generating…')
        : design.els.some((e) => e.kind === 'sticker' && e.src)
          ? t(`重新生成贴纸 · ${cost} 积分`, `Regenerate graphic · ${cost} credits`)
          : t(`生成贴纸 · ${cost} 积分`, `Generate graphic · ${cost} credits`)}
    </button>
    {genMsg && <p className={`st-dz-note ${gen === 'err' ? 'warn' : ''}`}>{genMsg}</p>}
    <p className="st-dz-note">{t('提示词按你填的需求自动写好，可以改成你想画的样子。生成一张扣一次积分，失败不计费。',
      'The prompt is pre-filled from your brief — edit it freely. One charge per image; failures are not charged.')}</p>

    <div className="st-ed-sec-label">{t('你自己的素材', 'Your own files')}</div>
    {logoSrc
      ? <button className="st-dz-asset" onClick={() => {
        const cur = draftRef.current;
        if (!cur) return;
        commit(setSticker(cur, logoSrc));
        setSel('sticker');
        setToast(t('已经把 Logo 放到画布上', 'Logo placed on the canvas'));
      }}>
        <img src={logoSrc} alt="" />
        <span>{t('把 Logo 放到画布', 'Place the logo')}</span>
      </button>
      : <p className="st-dz-note">{t('没上传 Logo。需要的话到「需求 · 品牌 Logo」里传一张。', 'No logo uploaded — add one in Brief · Logo.')}</p>}

    <div className="st-ed-sec-label">{t('底色', 'Canvas colour')}</div>
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

  /* ---------------- 左侧：需求对照 ---------------- */
  const a = project.answers;
  const briefRows: [string, string][] = [
    [t('类别', 'Category'), CATEGORIES.find((c) => c.id === a.category.v)?.zh || '—'],
    [t('名称', 'Product'), a.productName.v || '—'],
    [t('形式', 'Format'), formDef(a.form.v)?.zh || '—'],
    [t('尺寸', 'Size'), a.size ? sizeText(a.size.dims) : '—'],
    [t('主风格', 'Style'), STYLES.find((s) => s.id === a.stylePrimary.v)?.zh || '—'],
    [t('配色', 'Palette'), [...a.colors.v, ...a.customColors.v].join(' ') || '—'],
    [t('图案', 'Graphics'), a.patterns.v.map((x) => PATTERNS.find((y) => y.id === x)?.zh || x).join(' · ') || '—'],
  ];

  const briefPane = <div className="st-dz-brief">
    <div className="st-ed-sec-label">{t('按这份需求做的', 'Built from this brief')}</div>
    {briefRows.map(([k, v]) => <div className="st-dz-brow" key={k}><b>{k}</b><em title={v}>{v}</em></div>)}
    <div className="st-dz-swatches">
      {[...a.colors.v, ...a.customColors.v].map((hex) => <i key={hex} style={{ background: hex }} />)}
    </div>
    {!!missing.length && <p className="st-dz-note warn">
      {t(`还有没填的：${missing.map((m) => m.zh).join('、')}`, `Still blank: ${missing.map((m) => m.en).join(', ')}`)}
    </p>}
    <button className="st-dz-add" onClick={onBrief}><Icon name="chevronLeft" size={14} />{t('回去改需求', 'Edit the brief')}</button>
  </div>;

  /* ---------------- 中间：画布 ---------------- */
  const canvas = <div className="st-dz-wrap" ref={wrapRef} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
    <div
      className="st-dz-board"
      style={{
        width: boardW, height: boardH,
        background: design.bg,
      }}
      onPointerDown={() => setSel('')}
    >
      {design.els.map((e) => {
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
                onClick={() => { setTab('assets'); setView('left'); }}
              >
                <Icon name="image" size={15} />
                <span>{t('生成贴纸', 'Generate')}</span>
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
    </div>
  </div>;

  const toolbar = <div className="st-ed-tools">
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
    <button className="st-ed-tool-txt" onClick={() => void regenerate()} disabled={gen === 'run'}>
      {gen === 'run' ? t('生成中…', 'Working…') : t('生成贴纸', 'Generate')}
    </button>
  </div>;

  const hasSticker = design.els.some((e) => e.kind === 'sticker' && e.src);

  const actions = <>
    <button className="st-ed-ghost" onClick={onBrief}>{t('改需求', 'Brief')}</button>
    <button className="st-ed-primary" onClick={() => void regenerate()} disabled={gen === 'run'}>
      {gen === 'run' ? t('生成中…', 'Working…')
        : hasSticker ? t('换一张贴纸', 'New graphic') : t('生成贴纸', 'Generate')}
      <Icon name="chevronRight" size={15} />
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
      { id: 'assets', label: t('图案', 'Graphics') },
      { id: 'brief', label: t('需求', 'Brief') },
    ]}
    tab={tab}
    onTab={(x) => setTab(x as typeof tab)}
    left={tab === 'layers' ? layersPane : tab === 'assets' ? assetsPane : briefPane}
    leftFoot={<button className="st-ed-back-list" onClick={() => go('/studio')}>
      <Icon name="folder" size={14} />{t('所有项目', 'All projects')}
    </button>}
    center={<>
      {canvas}
      {toolbar}
    </>}
    right={<StudioChat
      messages={project.chat || []}
      onChange={(next) => update((cur) => ({ ...cur, chat: next.slice(-MAX_CHAT) }))}
      context={context}
      cloudbaseUid={uid}
    />}
    view={view}
    onView={setView}
    panelLabel={t('图层', 'Layers')}
  />;
}
