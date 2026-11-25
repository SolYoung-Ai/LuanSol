/* ============================================================
   Studio 2.0 阶段二 — 面编辑画布（SVG 矢量版）
   ------------------------------------------------------------
   为什么用 SVG：每一个文字/图形/图片都是独立的矢量对象，
   viewBox 直接用面板毫米（0 0 w h），所以画布坐标 = 设计坐标，
   导出、刀板、3D 读到的是同一串数字，不存在「截图当设计稿」。

   交互全部在毫米坐标里完成：
     clientToMm(指针, svg.getBoundingClientRect(), 面板尺寸)
   缩放（CSS 尺寸变化）、平移（容器 translate）、页面滚动、DPR
   都会被 getBoundingClientRect 吸收，数据里始终只写百分比。

   工具分工：
     选择工具 —— 点选 / 框选 / 拖动 / 把手缩放 / 旋转
     平移工具 或 空格 / 中键 —— 只平移视图，绝不移动对象
   ============================================================ */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useLang } from '../i18n';
import { Icon } from '../components/icons';
import {
  drawOrder, elTextMetrics, paletteOf,
  type FaceBox,
} from './frames';
import {
  angleDeg, boxHitsRect, centerOf, clamp, clientToMm, corners, expandSelection, handlePoints,
  mmRectToPct, normalizeAngle, pointInBox, resizeBox, selectionFrame, textOverflow,
  type Box, type Handle, type Pt,
} from './vec';
import { elLocalRect } from './frames';
import { patchEls, setElsBox } from './design';
import { faceEls, bgForFace, type DesignEl, type StudioDesign } from './types';

type Panel = { id: string; w: number; h: number; labelZh?: string; labelEn?: string };
type Tool = 'select' | 'hand';

interface Props {
  design: StudioDesign;
  faceKey: string;
  panel: Panel;
  els: DesignEl[];
  zoom: number;
  boardW: number;
  boardH: number;
  tool: Tool;
  sel: string[];
  onSelect: (ids: string[]) => void;
  onPreview: (next: StudioDesign) => void;
  onCommit: (next: StudioDesign, mergeKey?: string) => void;
  onPickFile: () => void;
  onEditing: (id: string | null) => void;
}

const FONT_FALLBACK = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';

export default function EditCanvas({
  design, faceKey, panel, els, zoom, boardW, boardH, tool, sel,
  onSelect, onPreview, onCommit, onPickFile, onEditing,
}: Props) {
  const { t } = useLang();
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [space, setSpace] = useState(false);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRef = useRef<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [preview, setPreview] = useState<StudioDesign | null>(null);

  const shown = preview || design;
  const viewEls = useMemo(() => drawOrder(faceEls(shown, faceKey)), [shown, faceKey]);
  const palette = useMemo(() => paletteOf(design), [design]);
  const face: FaceBox = { w: panel.w, h: panel.h };
  const scale = boardW / Math.max(1, panel.w);
  const handleR = 3.2 / scale; // 屏幕上恒定 ~3.2px
  const dash = 1 / scale;

  const selectedEls = useMemo(() => viewEls.filter((e) => sel.includes(e.id)), [viewEls, sel]);
  const frame = useMemo(() => selectionFrame(selectedEls, face), [selectedEls, face.w, face.h]);
  const editing = editingId ? els.find((e) => e.id === editingId) || null : null;

  const setEdit = useCallback((id: string | null) => {
    editingRef.current = id;
    setEditingId(id);
    onEditing(id);
  }, [onEditing]);

  /* ---------------- 指针 → 毫米 ---------------- */
  const toMm = (clientX: number, clientY: number): Pt => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    return clientToMm(clientX, clientY, svg.getBoundingClientRect(), face);
  };

  /* ---------------- 交互状态 ---------------- */
  const state = useRef<{
    kind: 'move' | 'resize' | 'rotate' | 'marquee' | 'pan';
    start: Pt;
    startDesign: StudioDesign;
    startBoxes: Record<string, Box>;
    startFrame: { box: Box; rotation: number } | null;
    ids: string[];
    handle?: Handle;
    startRotation?: number;
    startAngle?: number;
    startOffset?: { x: number; y: number };
    startClient?: { x: number; y: number };
    additive?: boolean;
    moved: boolean;
    locked: boolean;
  } | null>(null);

  const boxesOf = (list: DesignEl[]): Record<string, Box> => {
    const m: Record<string, Box> = {};
    for (const e of list) m[e.id] = elLocalRect(e, face);
    return m;
  };

  const begin = (ev: React.PointerEvent, kind: 'move' | 'resize' | 'rotate' | 'marquee' | 'pan', ids: string[]) => {
    (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
    const start = toMm(ev.clientX, ev.clientY);
    state.current = {
      kind, start, startDesign: design, startBoxes: boxesOf(els), startFrame: frame,
      ids, handle: undefined, moved: false, locked: false, additive: ev.shiftKey,
    };
    if (kind === 'pan') {
      state.current.startOffset = { ...offset };
      state.current.startClient = { x: ev.clientX, y: ev.clientY };
    }
  };

  const onSurfaceDown = (ev: React.PointerEvent) => {
    if (ev.button === 2) return;
    if (editingId) commitText();
    if (tool === 'hand' || space || ev.button === 1) {
      ev.preventDefault();
      begin(ev, 'pan', []);
      setSpace(false);
      return;
    }
    // 空白处：开始框选
    onSelect([]);
    begin(ev, 'marquee', []);
    setMarquee({ x: 0, y: 0, w: 0, h: 0 });
  };

  const onElementDown = (ev: React.PointerEvent, el: DesignEl) => {
    ev.stopPropagation();
    if (ev.button === 2) return;
    if (tool === 'hand' || space || ev.button === 1) { begin(ev, 'pan', []); return; }
    if (editingId && editingId !== el.id) commitText();
    if (editingId === el.id) return;

    const ids = expandSelection(els, [el.id]);
    const additive = ev.shiftKey;
    let nextSel: string[] = [];
    if (additive) {
      nextSel = ids.every((id) => sel.includes(id))
        ? sel.filter((id) => !ids.includes(id))
        : [...sel.filter((id) => !ids.includes(id)), ...ids];
    } else if (!sel.includes(el.id)) {
      nextSel = ids;
    } else {
      nextSel = sel;
    }
    onSelect(nextSel);
    if (!nextSel.includes(el.id)) return;

    if (el.locked) return;
    begin(ev, 'move', nextSel.filter((id) => {
      const it = els.find((e) => e.id === id);
      return it && !it.locked;
    }));
  };

  /** 双击文字：进入就地编辑（用 dblclick，不依赖 pointerdown 的 detail） */
  const startEdit = (ev: React.MouseEvent, el: DesignEl) => {
    if (el.kind !== 'text' || el.locked) return;
    ev.preventDefault();
    ev.stopPropagation();
    onSelect([el.id]);
    setEdit(el.id);
    setEditValue(el.text || '');
  };

  const onHandleDown = (ev: React.PointerEvent, hd: Handle) => {
    ev.stopPropagation();
    if (!frame) return;
    begin(ev, hd === 'rotate' ? 'rotate' : 'resize', selectedEls.map((e) => e.id).filter((id) => {
      const it = els.find((e) => e.id === id);
      return it && !it.locked;
    }));
    if (!state.current) return;
    state.current.handle = hd;
    state.current.startRotation = frame.rotation;
    state.current.startAngle = angleDeg(centerOf(frame.box), toMm(ev.clientX, ev.clientY));
  };

  /* ---------------- 拖动 / 缩放 / 旋转 ---------------- */
  const onPointerMove = (ev: React.PointerEvent) => {
    const s = state.current;
    if (!s) return;
    const pt = toMm(ev.clientX, ev.clientY);
    const dx = pt.x - s.start.x;
    const dy = pt.y - s.start.y;
    if (Math.abs(dx) > 0.2 / scale || Math.abs(dy) > 0.2 / scale) s.moved = true;

    if (s.kind === 'pan') {
      // 平移只改视图位移，绝不换算到对象坐标
      const c0 = s.startClient || { x: 0, y: 0 };
      setOffset({
        x: (s.startOffset?.x || 0) + (ev.clientX - c0.x),
        y: (s.startOffset?.y || 0) + (ev.clientY - c0.y),
      });
      return;
    }

    if (s.kind === 'marquee') {
      setMarquee({
        x: Math.min(s.start.x, pt.x), y: Math.min(s.start.y, pt.y),
        w: Math.abs(dx), h: Math.abs(dy),
      });
      return;
    }

    if (s.kind === 'move') {
      const boxes: Record<string, { x: number; y: number }> = {};
      for (const id of s.ids) {
        const b = s.startBoxes[id];
        const el = els.find((e) => e.id === id);
        if (!b || !el) continue;
        // 至少留 8% 在面内，别把对象拖丢
        const minX = -(b.w + el.w * 0.08);
        const maxX = panel.w - el.w * 0.08;
        const eh = (el.h ?? 10) * 0.08;
        const minY = -(b.h + eh);
        const maxY = panel.h - eh;
        const nx = clamp(b.x + dx, minX, maxX);
        const ny = clamp(b.y + dy, minY, maxY);
        const p = mmRectToPct({ ...b, x: nx, y: ny }, face);
        boxes[id] = { x: p.x, y: p.y };
      }
      setPreview(setElsBox(s.startDesign, boxes, faceKey));
      return;
    }

    if (s.kind === 'resize' && s.handle && s.startFrame) {
      const keepRatio = ev.shiftKey || (s.ids.length === 1 && els.find((e) => e.id === s.ids[0])?.kind === 'sticker');
      const rot = s.ids.length === 1 ? (els.find((e) => e.id === s.ids[0])?.rotation || 0) : 0;
      const nb = resizeBox(s.startFrame.box, s.handle, dx, dy, rot, { keepRatio });
      const sf = s.startFrame.box;
      const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {};
      if (s.ids.length === 1) {
        const el = els.find((e) => e.id === s.ids[0]);
        const pct = mmRectToPct(nb, face);
        // 文字：横拉只改排版宽度，纵向把手才写死高度
        const vertical = s.handle.includes('n') || s.handle.includes('s');
        boxes[s.ids[0]] = {
          x: pct.x, y: pct.y, w: pct.w,
          h: el?.kind === 'text' && !vertical ? el.h ?? 0 : pct.h,
        };
        if (el?.kind === 'text' && !vertical) delete (boxes[s.ids[0]] as { h?: number }).h;
      } else {
        const sx = sf.w > 0 ? nb.w / sf.w : 1;
        const sy = sf.h > 0 ? nb.h / sf.h : 1;
        for (const id of s.ids) {
          const b = s.startBoxes[id];
          if (!b) continue;
          const pct = mmRectToPct({
            x: nb.x + (b.x - sf.x) * sx,
            y: nb.y + (b.y - sf.y) * sy,
            w: b.w * sx,
            h: b.h * sy,
          }, face);
          boxes[id] = pct;
        }
      }
      setPreview(setElsBox(s.startDesign, boxes, faceKey));
      return;
    }

    if (s.kind === 'rotate' && s.startFrame) {
      const c = centerOf(s.startFrame.box);
      const now = angleDeg(c, pt);
      const delta = now - (s.startAngle || 0);
      if (s.ids.length === 1) {
        const next = normalizeAngle((s.startRotation || 0) + delta);
        setPreview(setElsBox(s.startDesign, { [s.ids[0]]: { rotation: next } }, faceKey));
      } else {
        const boxes: Record<string, { x: number; y: number; rotation: number }> = {};
        const cpt = centerOf(s.startFrame.box);
        for (const id of s.ids) {
          const b = s.startBoxes[id];
          const el = els.find((e) => e.id === id);
          if (!b || !el) continue;
          const cc = centerOf(b);
          const rad = (delta * Math.PI) / 180;
          const rx = cpt.x + (cc.x - cpt.x) * Math.cos(rad) - (cc.y - cpt.y) * Math.sin(rad);
          const ry = cpt.y + (cc.x - cpt.x) * Math.sin(rad) + (cc.y - cpt.y) * Math.cos(rad);
          const p = mmRectToPct({ ...b, x: rx - b.w / 2, y: ry - b.h / 2 }, face);
          boxes[id] = { x: p.x, y: p.y, rotation: normalizeAngle((el.rotation || 0) + delta) };
        }
        setPreview(setElsBox(s.startDesign, boxes, faceKey));
      }
    }
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    const s = state.current;
    state.current = null;
    if (!s) return;
    if (s.kind === 'pan') return;

    if (s.kind === 'marquee') {
      const m = marquee;
      setMarquee(null);
      if (!m || m.w < 1 || m.h < 1) return;
      const hit = viewEls.filter((e) => e.visible !== false
        && boxHitsRect(elLocalRect(e, face), e.rotation || 0, m)).map((e) => e.id);
      const expanded = expandSelection(els, hit);
      onSelect(s.additive ? Array.from(new Set([...sel, ...expanded])) : expanded);
      return;
    }

    if (!s.moved) { setPreview(null); return; }
    const next = preview;
    setPreview(null);
    if (next) onCommit(next, s.kind === 'move' ? 'move' : s.kind === 'resize' ? 'resize' : 'rotate');
    void ev;
  };

  /* ---------------- 文字就地编辑 ---------------- */
  const commitText = () => {
    const id = editingRef.current;
    if (!id) return;
    const cur = els.find((e) => e.id === id) || null;
    const value = editValue.slice(0, 200);
    setEdit(null);
    if (cur && value !== (cur.text || '')) {
      onCommit(patchEls(design, [id], { text: value }, faceKey), `text:${id}`);
    }
  };

  /* ---------------- 空格平移 / Esc ---------------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) { e.preventDefault(); setSpace(true); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpace(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  useEffect(() => { if (tool === 'select') setSpace(false); }, [tool]);
  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    setPreview(null);
    state.current = null;
    setMarquee(null);
  }, [faceKey, panel.w, panel.h]);

  /* ---------------- 渲染单个对象 ---------------- */
  const renderEl = (el: DesignEl) => {
    if (el.visible === false) return null;
    const box = elLocalRect(el, face);
    const rot = el.rotation || 0;
    const cx = box.w / 2;
    const cy = box.h / 2;
    const transform = `translate(${box.x} ${box.y}) rotate(${rot} ${cx} ${cy})`;
    const common = {
      opacity: el.opacity ?? 1,
    } as const;

    if (el.kind === 'text') {
      const m = elTextMetrics(el, { w: panel.w, h: panel.h });
      const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
      const tx = el.align === 'center' ? box.w / 2 : el.align === 'right' ? box.w : 0;
      const overflow = textOverflow(el, face);
      return <g key={el.id} transform={transform} {...common} className="st-svg-text" data-el={el.id}>
        <text
          x={tx}
          y={m.sizeMm * 0.88}
          fill={el.color || design.ink}
          fontFamily={el.fontFamily || FONT_FALLBACK}
          fontSize={m.sizeMm}
          fontWeight={el.weight || 400}
          letterSpacing={`${el.letterSpacing ?? 0}em`}
          textAnchor={anchor}
          xmlSpace="preserve"
        >
          {m.lines.map((line, i) => <tspan key={i} x={tx} {...(i ? { dy: m.lineHeightMm } : {})}>{line}</tspan>)}
        </text>
        {overflow && <rect x={0} y={0} width={box.w} height={box.h} fill="none" stroke="#C0392B"
          strokeWidth={dash} strokeDasharray={`${dash * 4} ${dash * 2}`} />}
      </g>;
    }

    if (el.kind === 'rect') {
      const fill = el.color || design.accent;
      const stroke = el.stroke;
      const sw = clamp(el.strokeWidth ?? 0, 0, 20);
      const shapeProps = {
        fill: el.shape === 'line' ? 'none' : fill,
        stroke: el.shape === 'line' ? (el.stroke || fill) : stroke,
        strokeWidth: el.shape === 'line' ? clamp(el.strokeWidth ?? 0.4, 0.1, 20) : sw,
      };
      if (el.shape === 'ellipse') {
        return <g key={el.id} transform={transform} {...common} data-el={el.id}>
          <ellipse cx={cx} cy={cy} rx={cx} ry={cy} {...shapeProps} />
        </g>;
      }
      if (el.shape === 'line') {
        return <g key={el.id} transform={transform} {...common} data-el={el.id}>
          <line x1={0} y1={cy} x2={box.w} y2={cy} {...shapeProps} />
        </g>;
      }
      return <g key={el.id} transform={transform} {...common} data-el={el.id}>
        <rect x={0} y={0} width={box.w} height={box.h} rx={clamp(el.radius ?? 0, 0, Math.min(box.w, box.h) / 2)} {...shapeProps} />
      </g>;
    }

    // 图片：占位框显示可点提示；有图按 contain / cover（裁切窗口用 clipPath）
    if (!el.src) {
      return <g key={el.id} transform={transform} {...common} data-el={el.id}>
        <rect x={0} y={0} width={box.w} height={box.h} fill="rgba(0,0,0,0.04)" stroke={design.accent}
          strokeWidth={dash} strokeDasharray={`${dash * 3} ${dash * 3}`} />
        <text x={box.w / 2} y={box.h / 2} textAnchor="middle" fill="#8a8a84" fontSize={Math.max(3, box.h / 8)}
          style={{ pointerEvents: 'none' }}>{t('放一张图', 'Add artwork')}</text>
      </g>;
    }
    const clipId = `clip_${el.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const crop = el.crop;
    const iw = crop ? box.w / Math.max(0.05, crop.w) : box.w;
    const ih = crop ? box.h / Math.max(0.05, crop.h) : box.h;
    const ix = crop ? -crop.x * iw : 0;
    const iy = crop ? -crop.y * ih : 0;
    return <g key={el.id} transform={transform} {...common} data-el={el.id}>
      {crop && <defs><clipPath id={clipId}><rect x={0} y={0} width={box.w} height={box.h} /></clipPath></defs>}
      <image
        href={el.src}
        x={ix}
        y={iy}
        width={iw}
        height={ih}
        preserveAspectRatio={el.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}
        clipPath={crop ? `url(#${clipId})` : undefined}
        style={{ pointerEvents: 'auto' }}
      />
    </g>;
  };

  /* ---------------- 选择框与把手 ---------------- */
  const overlay = () => {
    if (!frame || !selectedEls.length) return null;
    const { box, rotation } = frame;
    const pts = corners(box, rotation);
    const hp = handlePoints(box, rotation, 3 / scale * 2.2);
    const c = centerOf(box);
    const canEdit = selectedEls.every((e) => !e.locked);
    const locked = !canEdit;
    return <g className="st-svg-sel">
      <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none"
        stroke={locked ? '#9a9a93' : '#111111'} strokeWidth={1.2 / scale} strokeDasharray={locked ? `${dash * 4} ${dash * 3}` : undefined} />
      {!locked && <>
        <line x1={hp.n.x} y1={hp.n.y} x2={hp.rotate.x} y2={hp.rotate.y} stroke="#111111" strokeWidth={1 / scale} />
        {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as Handle[]).map((k) => <circle
          key={k}
          cx={hp[k].x}
          cy={hp[k].y}
          r={handleR}
          fill="#fff"
          stroke="#111111"
          strokeWidth={1 / scale}
          style={{ cursor: cursorFor(k, rotation) }}
          onPointerDown={(ev) => onHandleDown(ev, k)}
        />)}
        <circle
          cx={hp.rotate.x}
          cy={hp.rotate.y}
          r={handleR * 1.15}
          fill="#F47735"
          stroke="#fff"
          strokeWidth={1 / scale}
          style={{ cursor: 'grab' }}
          onPointerDown={(ev) => onHandleDown(ev, 'rotate')}
        />
      </>}
      {selectedEls.length > 1 && <circle cx={c.x} cy={c.y} r={handleR} fill="#F47735" opacity={0.9} />}
    </g>;
  };

  const cursorFor = (h: Handle, rot: number) => {
    const base: Record<string, string> = {
      nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
      n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
    };
    const idx = Math.round((((rot % 360) + 360) % 360) / 45) % 8;
    const names = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
    return base[names[(names.indexOf(h) + idx) % 8]] || 'default';
  };

  /* ---------------- 文字编辑浮层 ---------------- */
  const editBox = () => {
    if (!editing || !frameRef.current) return null;
    const b = elLocalRect(editing, face);
    const c = centerOf(b);
    const es = elTextMetrics(editing, { w: panel.w, h: panel.h });
    return <textarea
      key={editing.id}
      className="st-svg-editor"
      value={editValue}
      autoFocus
      onChange={(ev) => setEditValue(ev.target.value)}
      onBlur={commitText}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); setEdit(null); }
        if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); commitText(); }
        ev.stopPropagation();
      }}
      style={{
        left: `${(c.x / panel.w) * 100}%`,
        top: `${(c.y / panel.h) * 100}%`,
        width: `${(b.w / panel.w) * 100}%`,
        height: `${Math.max(b.h, es.sizeMm) / panel.h * 100}%`,
        transform: `translate(-50%, -50%) rotate(${editing.rotation || 0}deg)`,
        fontSize: `${(es.sizeMm / panel.h) * boardH}px`,
        lineHeight: `${clamp(editing.lineHeight ?? 1.4, 0.8, 3)}`,
        fontWeight: editing.weight || 400,
        color: editing.color || design.ink,
        textAlign: editing.align || 'left',
        fontFamily: editing.fontFamily || FONT_FALLBACK,
        letterSpacing: `${editing.letterSpacing ?? 0}em`,
      }}
    />;
  };

  return <div className={`st-svg-frame ${tool === 'hand' || space ? 'is-hand' : ''}`} ref={frameRef}>
    <div className="st-svg-pan" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
      <svg
        ref={svgRef}
        className="st-svg"
        width={boardW}
        height={boardH}
        viewBox={`0 0 ${panel.w} ${panel.h}`}
        style={{ background: bgForFace(design, faceKey) }}
        onPointerDown={onSurfaceDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(ev) => { if (state.current?.kind === 'pan') onPointerUp(ev); }}
      >
        <rect x={0} y={0} width={panel.w} height={panel.h} fill={bgForFace(design, faceKey)} />
        {viewEls.map((el) => {
          const hidden = el.visible === false;
          if (hidden) return null;
          return <g
            key={el.id}
            onPointerDown={(ev) => onElementDown(ev, el)}
            onDoubleClick={(ev) => startEdit(ev, el)}
            style={{ cursor: editingId === el.id ? 'text' : el.locked ? 'default' : 'move' }}
          >{renderEl(el)}</g>;
        })}

        <rect
          x={(5 / panel.w) * face.w}
          y={(5 / panel.h) * face.h}
          width={panel.w - 10}
          height={panel.h - 10}
          fill="none"
          stroke="#B9B3A6"
          strokeWidth={dash}
          strokeDasharray={`${dash * 6} ${dash * 4}`}
          pointerEvents="none"
        />
        {overlay()}
        {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
          fill="rgba(244,119,53,0.10)" stroke="#F47735" strokeWidth={dash} pointerEvents="none" />}
      </svg>
    </div>
    {editBox()}
    <div className="st-svg-hint">
      <Icon name="fit" size={13} />
      {t('拖动对象 · 2×3 把手缩放 · 橙点旋转 · 空格拖动画布', 'Drag · resize with handles · orange dot rotates · space pans')}
    </div>
  </div>;
}

/** 焦点是否在输入控件里（快捷键不能抢输入） */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}
