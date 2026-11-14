/* ============================================================
 * 设计台（在线设计编辑器）画布引擎
 * ------------------------------------------------------------
 * 基于 Fabric.js v6 的薄封装：把「元素增删、选中、撤销重做、导出」等
 * 高频动作收敛成一组方法，页面组件只跟这些方法打交道，不直接摸 fabric 实例。
 *
 * 为什么包一层而不是在组件里直接 new Canvas：
 *   1. 撤销/重做需要拦截每一次「提交动作」，散在组件里很容易漏；
 *   2. 元素到「图层列表」的映射、选中状态回传，都需要一个稳定的事件出口；
 *   3. 导出 PNG 的清晰度（按倍率重渲）是编辑器体验的命门，得在一处维护。
 * ============================================================ */
import { Canvas, FabricObject, FabricImage, IText, Rect, Circle, Triangle, Line, Polygon, Path, Group, Textbox, Gradient, Pattern, Point } from 'fabric';

export type ElementKind = 'text' | 'shape' | 'image' | 'line' | 'sticker';

/** 图层列表项：与画布对象一一对应，供图层面板渲染 */
export interface LayerItem {
  id: string;
  name: string;
  kind: ElementKind;
  /** 层级从 0 起，0 在最底 */
  index: number;
}

/** 画布快照（供撤销/重做） */
interface Snapshot {
  json: string;
}

/** 引擎对外回调 */
export interface EngineEvents {
  onSelect: (item: LayerItem | null) => void;
  onLayers: (items: LayerItem[]) => void;
  onHistory: (canUndo: boolean, canRedo: boolean) => void;
  onDirty: (dirty: boolean) => void;
}

let uid = 0;
const nextId = () => `el_${Date.now().toString(36)}_${(uid++).toString(36)}`;

/** 画布默认设计尺寸（小红书竖版 1080×1440，逻辑像素） */
export const DESIGN_W = 1080;
export const DESIGN_H = 1440;

export class EditorEngine {
  readonly canvas: Canvas;
  private events: EngineEvents;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private saving = false;
  /** 一次「提交」的初始快照，用于把拖拽/缩放这类连续操作合并成一步撤销 */
  private txSnapshot: Snapshot | null = null;
  private zoom = 1;

  constructor(el: HTMLCanvasElement, events: EngineEvents) {
    this.events = events;
    this.canvas = new Canvas(el, {
      width: DESIGN_W,
      height: DESIGN_H,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      selection: true,
      selectionColor: 'rgba(124, 77, 255, 0.08)',
      selectionBorderColor: '#7c4dff',
      selectionLineWidth: 1.5,
      borderColor: '#7c4dff',
      cornerColor: '#7c4dff',
      cornerStrokeColor: '#ffffff',
      cornerStyle: 'circle',
      cornerSize: 10,
      transparentCorners: false,
      controlsAboveOverlay: true,
    });

    this.canvas.on('object:added', () => this.syncLayers());
    this.canvas.on('object:removed', () => this.syncLayers());
    this.canvas.on('selection:created', () => this.emitSelect());
    this.canvas.on('selection:updated', () => this.emitSelect());
    this.canvas.on('selection:cleared', () => this.events.onSelect(null));
    this.canvas.on('object:modified', () => this.commit());
    this.canvas.on('object:moving', () => this.markDirty());
    this.canvas.on('object:scaling', () => this.markDirty());
    this.canvas.on('object:rotating', () => this.markDirty());
    this.canvas.on('object:skewing', () => this.markDirty());

    // 键盘删除：Delete 删除选中对象（编辑文字时 Backspace 是输入，不触发）。
    // 键盘删除改由页面层 window keydown 兜底，这里不再绑定（fabric v6 的键盘事件类型不对外）。

    // 首次空快照，作为「撤销到空白」的底
    this.pushSnapshot();
  }

  /* ---------------- 快照 / 撤销重做 ---------------- */
  private serialize(): string {
    return JSON.stringify(this.canvas.toDatalessJSON(['id']));
  }

  private pushSnapshot() {
    this.undoStack.push({ json: this.serialize() });
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
    this.emitHistory();
  }

  /** 开始一笔可合并的连续操作（拖拽/缩放/旋转等），记下起点 */
  beginTx() {
    if (this.txSnapshot) return;
    this.txSnapshot = { json: this.serialize() };
  }

  /** 结束一笔操作，把「起点→终点」压成一步撤销 */
  commit() {
    if (this.txSnapshot) {
      const start = this.txSnapshot;
      this.txSnapshot = null;
      const end = this.serialize();
      if (start.json === end) return;
      this.undoStack.push({ json: end });
      if (this.undoStack.length > 60) this.undoStack.shift();
      this.redoStack = [];
    } else {
      this.pushSnapshot();
    }
    this.emitHistory();
    this.events.onDirty(true);
  }

  private markDirty() {
    if (!this.txSnapshot) this.beginTx();
    this.events.onDirty(true);
  }

  undo() {
    if (this.undoStack.length <= 1) return;
    const cur = this.undoStack.pop()!;
    this.redoStack.push(cur);
    const prev = this.undoStack[this.undoStack.length - 1];
    this.loadSnapshot(prev);
    this.emitHistory();
    this.events.onDirty(true);
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(next);
    this.loadSnapshot(next);
    this.emitHistory();
    this.events.onDirty(true);
  }

  private loadSnapshot(s: Snapshot) {
    this.saving = true;
    this.canvas.loadFromJSON(s.json).then(() => {
      this.canvas.requestRenderAll();
      this.saving = false;
      this.syncLayers();
      this.emitSelect();
    }).catch(() => { this.saving = false; });
  }

  private emitHistory() {
    this.events.onHistory(this.undoStack.length > 1, this.redoStack.length > 0);
  }

  /* ---------------- 元素添加 ---------------- */
  /** 添加文字（普通文本框，支持多行）。返回 fabric 对象 id */
  addText(opts: { text: string; fontSize?: number; fontFamily?: string; fontWeight?: number | string; fill?: string; left?: number; top?: number; width?: number }): string {
    const t = new Textbox(opts.text, {
      id: nextId(),
      left: opts.left ?? DESIGN_W / 2 - 150,
      top: opts.top ?? DESIGN_H / 2 - 60,
      width: opts.width ?? 420,
      fontSize: opts.fontSize ?? 64,
      fontFamily: opts.fontFamily ?? 'Plus Jakarta Sans',
      fontWeight: opts.fontWeight ?? 700,
      fill: opts.fill ?? '#1a1a1a',
      textAlign: 'center',
      splitByGrapheme: true,
      charSpacing: 0,
      lineHeight: 1.1,
    });
    this.canvas.add(t);
    this.canvas.setActiveObject(t);
    this.canvas.requestRenderAll();
    this.commit();
    return (t as any).id as string;
  }

  /** 添加形状。kind 决定用哪个 fabric 类 */
  addShape(kind: string, fill = '#7c4dff', left?: number, top?: number): string {
    const cx = left ?? DESIGN_W / 2;
    const cy = top ?? DESIGN_H / 2;
    let obj: FabricObject;
    const common = { id: nextId(), fill, stroke: '#00000000', strokeWidth: 0 };
    switch (kind) {
      case 'rect': obj = new Rect({ ...common, left: cx - 120, top: cy - 90, width: 240, height: 180, rx: 0, ry: 0 }); break;
      case 'roundRect': obj = new Rect({ ...common, left: cx - 120, top: cy - 90, width: 240, height: 180, rx: 24, ry: 24 }); break;
      case 'circle': obj = new Circle({ ...common, left: cx - 90, top: cy - 90, radius: 90 }); break;
      case 'triangle': obj = new Triangle({ ...common, left: cx - 100, top: cy - 90, width: 200, height: 180 }); break;
      case 'star': obj = this.makeStar(common, cx, cy, 100, 5); break;
      case 'diamond': obj = new Polygon(this.points(120, 100), { ...common, left: cx - 120, top: cy - 100 }); break;
      case 'trapezoid': obj = new Polygon(this.points(240, 180), { ...common, left: cx - 120, top: cy - 90 }); break;
      case 'hexagon': obj = new Polygon(this.hexPoints(110), { ...common, left: cx - 110, top: cy - 110 }); break;
      case 'heart': obj = this.makeHeart(common, cx, cy, 100); break;
      case 'ring': obj = this.makeRing(common, cx, cy, 90, 40); break;
      case 'cloud': obj = this.makeCloud(common, cx, cy, 150); break;
      case 'bolt': obj = this.makeBolt(common, cx, cy, 130); break;
      case 'plus': obj = this.makePlus(common, cx, cy, 90); break;
      case 'arrow': obj = this.makeArrow(common, cx, cy, 220, false); break;
      case 'doubleArrow': obj = this.makeArrow(common, cx, cy, 220, true); break;
      case 'line': obj = new Line([cx - 130, cy, cx + 130, cy], { id: nextId(), stroke: '#1a1a1a', strokeWidth: 3, strokeLineCap: 'round' }); break;
      case 'dashedLine': obj = new Line([cx - 130, cy, cx + 130, cy], { id: nextId(), stroke: '#1a1a1a', strokeWidth: 3, strokeDashArray: [10, 8], strokeLineCap: 'round' }); break;
      case 'divider': obj = new Line([cx - 160, cy, cx + 160, cy], { id: nextId(), stroke: '#1a1a1a', strokeWidth: 6, strokeLineCap: 'round' }); break;
      case 'frame': obj = new Rect({ id: nextId(), left: cx - 130, top: cy - 100, width: 260, height: 200, fill: '#00000000', stroke: '#1a1a1a', strokeWidth: 6 }); break;
      case 'speech': obj = this.makeSpeech(common, cx, cy, 240, 160); break;
      case 'halfCircle': obj = this.makeHalfCircle(common, cx, cy, 100); break;
      default: obj = new Rect({ ...common, left: cx - 120, top: cy - 90, width: 240, height: 180, rx: 8, ry: 8 });
    }
    this.canvas.add(obj);
    this.canvas.setActiveObject(obj);
    this.canvas.requestRenderAll();
    this.commit();
    return (obj as any).id as string;
  }

  /** 添加贴纸（用 shape/sticker 定义里的 path 或基础形状，直接落到画布） */
  addSticker(def: { svg?: string; fill?: string; kind?: string }, left?: number, top?: number): string {
    const cx = left ?? DESIGN_W / 2;
    const cy = top ?? DESIGN_H / 2;
    const fill = def.fill ?? '#7c4dff';
    let obj: FabricObject | null = null;
    if (def.svg) {
      obj = this.fromSvg(def.svg, fill, cx, cy);
    }
    if (!obj) return this.addShape(def.kind || 'circle', fill, cx, cy);
    this.canvas.add(obj);
    this.canvas.setActiveObject(obj);
    this.canvas.requestRenderAll();
    this.commit();
    return (obj as any).id as string;
  }

  /** 添加背景：颜色 / 渐变 / 图案都落成画布底层 */
  setBackground(bg: { type: 'color' | 'gradient' | 'pattern'; color?: string; from?: string; to?: string; angle?: number; pattern?: string }) {
    if (bg.type === 'color') {
      this.canvas.backgroundColor = bg.color || '#ffffff';
    } else if (bg.type === 'gradient') {
      const g = new Gradient({
        type: 'linear',
        gradientUnits: 'percentage',
        coords: { x1: 0, y1: 0, x2: 0, y2: 1 },
        colorStops: [
          { offset: 0, color: bg.from || '#7c4dff' },
          { offset: 1, color: bg.to || '#ff7ab8' },
        ],
      });
      this.canvas.backgroundColor = g as any;
    } else if (bg.type === 'pattern') {
      this.canvas.backgroundColor = this.makePattern(bg.pattern || 'dots', bg.color || '#e0d8ff');
    }
    this.canvas.requestRenderAll();
    this.commit();
  }

  /** 添加本地图片 */
  async addImage(dataUrl: string, left?: number, top?: number): Promise<string> {
    const img = await FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' });
    const maxW = DESIGN_W * 0.6;
    const scale = Math.min(1, maxW / (img.width || 1));
    img.set({
      id: nextId(),
      left: (left ?? DESIGN_W / 2) - ((img.width || 0) * scale) / 2,
      top: (top ?? DESIGN_H / 2) - ((img.height || 0) * scale) / 2,
      scaleX: scale,
      scaleY: scale,
    });
    this.canvas.add(img);
    this.canvas.setActiveObject(img);
    this.canvas.requestRenderAll();
    this.commit();
    return (img as any).id as string;
  }

  /* ---------------- 选中 / 图层 ---------------- */
  getActive(): FabricObject | null {
    return this.canvas.getActiveObject() ?? null;
  }

  getActiveId(): string | null {
    const o = this.canvas.getActiveObject();
    return o ? (o as any).id ?? null : null;
  }

  private emitSelect() {
    const o = this.canvas.getActiveObject();
    this.events.onSelect(o ? this.toLayer(o) : null);
  }

  private toLayer(o: FabricObject): LayerItem {
    const objs = this.canvas.getObjects();
    const idx = objs.indexOf(o);
    return {
      id: (o as any).id ?? '',
      name: this.layerName(o),
      kind: this.layerKind(o),
      index: idx,
    };
  }

  private layerName(o: FabricObject): string {
    if (o instanceof IText || o instanceof Textbox) {
      const txt = (o as any).text || '';
      return txt.trim().slice(0, 20) || '文字';
    }
    if (o instanceof FabricImage) return '图片';
    if (o instanceof Line) return '线条';
    if (o instanceof Circle) return '圆形';
    if (o instanceof Triangle) return '三角形';
    return '形状';
  }

  private layerKind(o: FabricObject): ElementKind {
    if (o instanceof IText || o instanceof Textbox) return 'text';
    if (o instanceof FabricImage) return 'image';
    if (o instanceof Line) return 'line';
    return 'shape';
  }

  listLayers(): LayerItem[] {
    return this.canvas.getObjects().map((o, i) => ({
      id: (o as any).id ?? '',
      name: this.layerName(o),
      kind: this.layerKind(o),
      index: i,
    }));
  }

  syncLayers() {
    if (this.saving) return;
    this.events.onLayers(this.listLayers());
  }

  /** 图层面板：选中某元素（定位 + 高亮） */
  selectById(id: string) {
    const o = this.canvas.getObjects().find((x) => (x as any).id === id);
    if (!o) return;
    this.canvas.setActiveObject(o);
    this.canvas.requestRenderAll();
    this.emitSelect();
  }

  /** 图层面板：重命名（这里只把名字记到对象上，展示层用） */
  renameById(id: string, name: string) {
    const o = this.canvas.getObjects().find((x) => (x as any).id === id);
    if (!o) return;
    (o as any)._layerName = name;
    this.syncLayers();
  }

  /** 图层面板：删除 */
  removeById(id: string) {
    const o = this.canvas.getObjects().find((x) => (x as any).id === id);
    if (!o) return;
    this.canvas.remove(o);
    this.canvas.requestRenderAll();
    this.commit();
  }

  /** 图层面板：上移 / 下移层级 */
  moveLayer(id: string, dir: -1 | 1) {
    const objs = this.canvas.getObjects();
    const idx = objs.findIndex((x) => (x as any).id === id);
    if (idx < 0) return;
    const target = dir === 1 ? idx + 1 : idx - 1;
    if (target < 0 || target >= objs.length) return;
    const o = objs[idx];
    // 通过临时交换数组位置重排：fabric 的 sendBackwards/bringForward 在 v6 类型里
    // 挂在不同对象类上，直接用 canvas._objects 手动重排最稳。
    objs.splice(idx, 1);
    objs.splice(target, 0, o);
    this.canvas.requestRenderAll();
    this.commit();
  }

  deleteSelection() {
    const act = this.canvas.getActiveObjects();
    if (act.length === 0) return;
    act.forEach((o) => this.canvas.remove(o));
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.commit();
  }

  /* ---------------- 缩放 ----------------
   * 缩放完全由页面层 CSS transform 控制（canvas 物理尺寸固定 1080×1440），
   * fabric 内部 viewportTransform 恒为单位矩阵。这样导出 PNG 时用原始尺寸，
   * 不受显示缩放影响，逻辑也最简单。 */
  setZoom(z: number) {
    this.zoom = z;
  }

  getZoom() { return this.zoom; }

  fitToScreen(containerW: number, containerH: number): number {
    const pad = 120;
    const z = Math.min((containerW - pad) / DESIGN_W, (containerH - pad) / DESIGN_H);
    const clamped = Math.max(0.2, Math.min(2, z));
    this.setZoom(clamped);
    return clamped;
  }

  /* ---------------- 导出 ---------------- */
  exportPNG(scale = 1): string {
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    const url = this.canvas.toDataURL({ format: 'png', multiplier: scale, quality: 1 });
    this.canvas.requestRenderAll();
    return url;
  }

  /* ---------------- 工具：绘制装饰形状 ---------------- */
  private points(w: number, h: number) {
    return [
      { x: -w / 2, y: -h / 2 },
      { x: w / 2, y: -h / 2 },
      { x: w / 2, y: h / 2 },
      { x: -w / 2, y: h / 2 },
    ];
  }

  private hexPoints(r: number) {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return pts;
  }

  private makeStar(common: any, cx: number, cy: number, r: number, spikes: number) {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (Math.PI / spikes) * i - Math.PI / 2;
      pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
    }
    return new Polygon(pts, { ...common, left: cx - r, top: cy - r });
  }

  private makeHeart(common: any, cx: number, cy: number, r: number) {
    // 用 path 画心形
    const d = `M ${cx} ${cy + r * 0.8} C ${cx - r * 1.2} ${cy} ${cx - r} ${cy - r * 0.9} ${cx} ${cy - r * 0.35} C ${cx + r} ${cy - r * 0.9} ${cx + r * 1.2} ${cy} ${cx} ${cy + r * 0.8} Z`;
    return new Path(d, common);
  }

  private makeRing(common: any, cx: number, cy: number, rOuter: number, rInner: number) {
    const d = `M ${cx - rOuter} ${cy} a ${rOuter} ${rOuter} 0 1 0 ${rOuter * 2} 0 a ${rOuter} ${rOuter} 0 1 0 ${-rOuter * 2} 0 Z M ${cx - rInner} ${cy} a ${rInner} ${rInner} 0 1 1 ${rInner * 2} 0 a ${rInner} ${rInner} 0 1 1 ${-rInner * 2} 0 Z`;
    return new Path(d, common);
  }

  private makeCloud(common: any, cx: number, cy: number, w: number) {
    const h = w * 0.6;
    const d = `M ${cx - w / 2} ${cy + h * 0.15} a ${w * 0.18} ${w * 0.18} 0 0 1 0 ${-h * 0.4} a ${w * 0.28} ${w * 0.28} 0 0 1 ${w * 0.5} ${-h * 0.05} a ${w * 0.22} ${w * 0.22} 0 0 1 ${w * 0.5} ${h * 0.05} a ${w * 0.16} ${w * 0.16} 0 0 1 0 ${h * 0.4} Z`;
    return new Path(d, common);
  }

  private makeBolt(common: any, cx: number, cy: number, h: number) {
    const w = h * 0.55;
    const d = `M ${cx + w * 0.1} ${cy - h / 2} L ${cx - w * 0.5} ${cy + h * 0.05} L ${cx - w * 0.05} ${cy + h * 0.05} L ${cx - w * 0.25} ${cy + h / 2} L ${cx + w * 0.5} ${cy - h * 0.15} L ${cx + w * 0.05} ${cy - h * 0.15} Z`;
    return new Path(d, common);
  }

  private makePlus(common: any, cx: number, cy: number, r: number) {
    const d = `M ${cx - r * 0.3} ${cy - r} h ${r * 0.6} v ${r * 0.7} h ${r * 0.3} v ${r * 0.6} h ${-r * 0.3} v ${r * 0.7} h ${-r * 0.6} v ${-r * 0.7} h ${-r * 0.3} v ${-r * 0.6} h ${r * 0.3} Z`;
    return new Path(d, common);
  }

  private makeArrow(common: any, cx: number, cy: number, len: number, double: boolean) {
    const d = double
      ? `M ${cx - len / 2} ${cy} h ${len} M ${cx - len / 2} ${cy} l 30 -14 M ${cx - len / 2} ${cy} l 30 14 M ${cx + len / 2} ${cy} l -30 -14 M ${cx + len / 2} ${cy} l -30 14`
      : `M ${cx - len / 2} ${cy} h ${len} M ${cx + len / 2} ${cy} l -30 -14 M ${cx + len / 2} ${cy} l -30 14`;
    return new Path(d, { ...common, fill: '#00000000', stroke: common.fill, strokeWidth: 3, strokeLineCap: 'round', strokeLineJoin: 'round' });
  }

  private makeSpeech(common: any, cx: number, cy: number, w: number, h: number) {
    const d = `M ${cx - w / 2} ${cy - h / 2} h ${w} a ${h * 0.1} ${h * 0.1} 0 0 1 ${h * 0.1} ${h * 0.1} v ${h * 0.6} a ${h * 0.1} ${h * 0.1} 0 0 1 ${-h * 0.1} ${h * 0.1} h ${-w * 0.55} l ${-w * 0.12} ${h * 0.22} l ${-w * 0.03} ${-h * 0.22} h ${-w * 0.3} a ${h * 0.1} ${h * 0.1} 0 0 1 ${-h * 0.1} ${-h * 0.1} v ${-h * 0.6} a ${h * 0.1} ${h * 0.1} 0 0 1 ${h * 0.1} ${-h * 0.1} Z`;
    return new Path(d, common);
  }

  private makeHalfCircle(common: any, cx: number, cy: number, r: number) {
    const d = `M ${cx - r} ${cy} a ${r} ${r} 0 0 1 ${r * 2} 0 Z`;
    return new Path(d, common);
  }

  private makePattern(kind: string, color: string): Pattern {
    // 用一个离屏 canvas 画图案单元，再做成 fabric Pattern
    const size = 40;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = color;
    const m = size / 2;
    switch (kind) {
      case 'dots':
        ctx.beginPath(); ctx.arc(m, m, size * 0.12, 0, Math.PI * 2); ctx.fill();
        break;
      case 'grid':
        ctx.fillRect(0, 0, size, 1.5); ctx.fillRect(0, 0, 1.5, size);
        break;
      case 'diagonal':
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, size); ctx.lineTo(size, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size, size); ctx.stroke();
        break;
      case 'checker':
        ctx.fillRect(0, 0, m, m); ctx.fillRect(m, m, m, m);
        break;
      case 'wave':
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x <= size; x += 2) { const y = m + Math.sin((x / size) * Math.PI * 2) * 6; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
        break;
      case 'cross':
        ctx.fillRect(m - 1.5, 0, 3, size); ctx.fillRect(0, m - 1.5, size, 3);
        break;
      default:
        ctx.beginPath(); ctx.arc(m, m, size * 0.12, 0, Math.PI * 2); ctx.fill();
    }
    return new Pattern({ source: c, repeat: 'repeat' });
  }

  /** 把简单 SVG path 字符串转成 fabric 对象（贴纸用） */
  private fromSvg(svg: string, fill: string, cx: number, cy: number): FabricObject | null {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svg, 'image/svg+xml');
      const pathEl = doc.querySelector('path, circle, rect, polygon');
      if (!pathEl) return null;
      if (pathEl.tagName.toLowerCase() === 'circle') {
        const r = parseFloat(pathEl.getAttribute('r') || '50');
        return new Circle({ id: nextId(), left: cx - r, top: cy - r, radius: r, fill });
      }
      if (pathEl.tagName.toLowerCase() === 'rect') {
        const w = parseFloat(pathEl.getAttribute('width') || '100');
        const h = parseFloat(pathEl.getAttribute('height') || '100');
        return new Rect({ id: nextId(), left: cx - w / 2, top: cy - h / 2, width: w, height: h, fill });
      }
      const d = pathEl.getAttribute('d');
      if (!d) return null;
      const obj = new Path(d, { id: nextId(), fill });
      // 居中：计算 path 包围盒
      const bb = obj.getBoundingRect();
      obj.set({ left: cx - bb.width / 2, top: cy - bb.height / 2 });
      return obj;
    } catch {
      return null;
    }
  }

  /** 把选中文字设置弯曲（弧线）——简化实现：保留文本，加一个说明。弯曲文字在 fabric 里需要 path 文本，MVP 先做占位。 */
  dispose() {
    this.canvas.dispose();
  }
}

export { Point };
