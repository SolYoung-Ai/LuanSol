/* ============================================================
   Studio 2.0 阶段四 — 工具校验、预览与原子执行
   ------------------------------------------------------------
   流程严格分为两步：
     previewPlan()  ：校验 + 在内存副本上把所有动作试跑一遍，产出预览；
     executePlan()  ：再跑一遍同样的试跑，全部成功才返回候选设计。
   界面只在 executePlan().ok 时提交一次历史。任何一个动作失败，
   candidate 为 null，画布没有发生任何变化，因此不存在「改一半」。
   ============================================================ */
import type { DesignEl, StudioDesign, StudioProject } from '../types';
import { bgForFace, faceEls, withFaceBg, withFaceEls } from '../types';
import { addShape, addText, duplicateEls, orderEls, patchEls, removeEls } from '../design';
import {
  STUDIO_SAFE, dielineOf, designDocFor, dimsOf, elLocalRect, facesOf, structureFor,
} from '../frames';
import { createEmptyBrief } from '../../engine/brief';
import { runPrepress } from '../../engine/prepress';
import { validateParams } from '../../editor/ai/tools';
import type { StudioToolDef } from './tools';
import { studioToolByName } from './tools';
import { describeEl, designDigest } from './context';
import type {
  ActionResult, PlanExecution, PlanPermission, PreviewChange, PreviewItem,
  StudioAIAction, StudioAIPlan, StudioAISnapshot, StudioPlanPreview,
} from './types';

const MAX_ACTIONS = 12;
const SELECT_ALIASES = ['selected', 'selection', 'current', 'it', 'this', '它', '这个', '选中', '当前选中'];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const fmt = (n: number) => `${round(n)}mm`;

interface AppState {
  project: StudioProject;
  design: StudioDesign;
  face: string;
  panel: { id: string; w: number; h: number; labelZh: string; labelEn: string };
  selectedIds: string[];
  faceChanged: boolean;
  structural: boolean;
  crossPanel: boolean;
  targetFaces: Set<string>;
  warnings: string[];
  changes: PreviewItem[];
  /** 本动作实际碰到的对象，用于统计「哪些没变」 */
  touched: Set<string>;
}

interface Applied {
  state: AppState;
  message: string;
}

const isPlaceholder = (value: unknown): boolean =>
  typeof value === 'string' && SELECT_ALIASES.includes(value.trim().toLowerCase());

function item(
  kind: PreviewItem['kind'], id: string, name: string, type: string, changes: PreviewChange[],
): PreviewItem | null {
  return changes.length ? { kind, targetId: id, targetName: name, targetType: type, change: changes } : null;
}

function addItem(state: AppState, it: PreviewItem | null) {
  if (it) state.changes.push(it);
}

function currentPanel(state: AppState) {
  const panels = facesOf(state.project);
  const p = panels.find((x) => x.id === state.face) || panels[0];
  if (!p) throw new Error('当前包装形式没有可用面板');
  state.panel = p;
  return p;
}

function findTarget(state: AppState, id: unknown, opts: { locked?: boolean } = {}): DesignEl {
  const layerId = typeof id === 'string' ? id : '';
  if (!layerId) throw new Error('缺少目标对象 ID');
  const inFace = faceEls(state.design, state.face).find((e) => e.id === layerId);
  if (inFace) {
    if (inFace.locked && opts.locked !== false) throw new Error(`对象「${describeEl(inFace).name}」已锁定，先解锁再改`);
    return inFace;
  }
  const other = Object.entries(state.design.faces || {})
    .find(([f, list]) => f !== state.face && Array.isArray(list) && list.some((e) => e.id === layerId));
  if (other) throw new Error(`对象 ${layerId} 在「${other[0]}」面，本阶段只允许修改当前面「${state.face}」`);
  throw new Error(`找不到对象 ${layerId}；不能猜不存在的 ID`);
}

function targetIds(state: AppState, raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error('layerIds 必须是数组');
  const ids = raw.map((x) => String(x));
  if (ids.some(isPlaceholder)) {
    if (state.selectedIds.length < 1) throw new Error('没有选中对象，不能使用「选中的」作为目标');
    return state.selectedIds.slice();
  }
  if (!ids.length) throw new Error('没有目标对象');
  return [...new Set(ids)];
}

function textHeightPct(el: DesignEl, panel: { w: number; h: number }): number {
  if (el.h !== undefined) return el.h;
  if (el.kind === 'text') {
    const sizeMm = ((el.size ?? 3) / 100) * panel.w;
    return Math.min(100, (sizeMm * 1.4) / panel.h * 100);
  }
  return el.w;
}

function applyAction(action: StudioAIAction, state: AppState, def: StudioToolDef): Applied {
  const p = validateParams(def, action.params);
  const panel = currentPanel(state);

  switch (action.name) {
    case 'inspect_design': {
      return { state, message: `${state.face} 面 ${faceEls(state.design, state.face).length} 个对象，${panel.w}×${panel.h}mm` };
    }

    case 'create_text_layer': {
      const text = String(p.text);
      const sizeMm = Number(p.size_mm ?? 5);
      const wMm = Number(p.w_mm ?? panel.w * 0.6);
      const xMm = Number(p.x_mm ?? panel.w * 0.12);
      const yMm = Number(p.y_mm ?? panel.h * 0.2);
      const d1 = addText(state.design, text, state.face);
      const created = faceEls(d1, state.face).slice(-1)[0];
      const patch: Partial<DesignEl> = {
        x: round(xMm / panel.w * 100),
        y: round(yMm / panel.h * 100),
        w: round(wMm / panel.w * 100),
        size: round(sizeMm / panel.w * 100),
        color: String(p.color || state.design.ink),
        weight: Number(p.weight ?? 400),
        align: String(p.align || 'left') as DesignEl['align'],
        ...(p.name ? { name: String(p.name) } : {}),
      };
      const design = patchEls(d1, [created.id], patch, state.face);
      state.design = design;
      state.touched.add(created.id);
      addItem(state, item('element', created.id, String(p.name || `文字「${text.slice(0, 12)}」`), '文字', [
        { field: 'create', label: '新建', before: '无', after: `「${text.slice(0, 20)}」 ${fmt(sizeMm)}，${fmt(xMm)} / ${fmt(yMm)}` },
      ]));
      return { state, message: `已创建文字「${text.slice(0, 12)}」` };
    }

    case 'update_text_layer': {
      const target = findTarget(state, p.layerId);
      if (target.kind !== 'text') throw new Error(`「${describeEl(target).name}」不是文字对象`);
      const patch: Partial<DesignEl> = {};
      const changes: PreviewChange[] = [];
      if (p.text !== undefined) {
        patch.text = String(p.text);
        changes.push({ field: 'text', label: '内容', before: target.text || '', after: patch.text });
      }
      if (p.size_mm !== undefined) {
        const v = round(Number(p.size_mm) / panel.w * 100);
        patch.size = v;
        changes.push({ field: 'size', label: '字号', before: fmt(((target.size ?? 3) / 100) * panel.w), after: fmt(Number(p.size_mm)) });
      }
      if (p.color !== undefined) {
        patch.color = String(p.color);
        changes.push({ field: 'color', label: '颜色', before: target.color || '', after: patch.color });
      }
      if (p.weight !== undefined) {
        patch.weight = Number(p.weight);
        changes.push({ field: 'weight', label: '字重', before: String(target.weight ?? 400), after: String(patch.weight) });
      }
      if (p.align !== undefined) {
        patch.align = String(p.align) as DesignEl['align'];
        changes.push({ field: 'align', label: '对齐', before: target.align || 'left', after: String(p.align) });
      }
      if (p.fontFamily !== undefined) {
        patch.fontFamily = String(p.fontFamily);
        changes.push({ field: 'fontFamily', label: '字体', before: target.fontFamily || '默认', after: patch.fontFamily });
      }
      if (p.letterSpacing !== undefined) {
        patch.letterSpacing = Number(p.letterSpacing);
        changes.push({ field: 'letterSpacing', label: '字距', before: String(target.letterSpacing ?? 0), after: String(patch.letterSpacing) });
      }
      if (p.lineHeight !== undefined) {
        patch.lineHeight = Number(p.lineHeight);
        changes.push({ field: 'lineHeight', label: '行高', before: String(target.lineHeight ?? 1.4), after: String(patch.lineHeight) });
      }
      if (p.name !== undefined) {
        patch.name = String(p.name);
        changes.push({ field: 'name', label: '图层名', before: target.name || '', after: patch.name });
      }
      if (!changes.length) throw new Error('没有要修改的文字属性');
      state.design = patchEls(state.design, [target.id], patch, state.face);
      state.touched.add(target.id);
      addItem(state, item('element', target.id, describeEl(target).name, describeEl(target).type, changes));
      return { state, message: `已修改文字「${describeEl(target).name}」` };
    }

    case 'update_layer_position': {
      const target = findTarget(state, p.layerId);
      if (p.x_mm !== undefined && p.dx_mm !== undefined) throw new Error('x_mm 与 dx_mm 不能同时给');
      if (p.y_mm !== undefined && p.dy_mm !== undefined) throw new Error('y_mm 与 dy_mm 不能同时给');
      if ([p.x_mm, p.y_mm, p.dx_mm, p.dy_mm].every((v) => v === undefined)) throw new Error('没有给移动距离');
      const before = elLocalRect(target, panel);
      const newXmm = p.x_mm !== undefined ? Number(p.x_mm) : (p.dx_mm !== undefined ? before.x + Number(p.dx_mm) : before.x);
      const newYmm = p.y_mm !== undefined ? Number(p.y_mm) : (p.dy_mm !== undefined ? before.y + Number(p.dy_mm) : before.y);
      const x = round(newXmm / panel.w * 100);
      const y = round(newYmm / panel.h * 100);
      if (x < -30 || x > 130 || y < -30 || y > 130) throw new Error('移动结果超出面板范围，已拒绝');
      state.design = patchEls(state.design, [target.id], { x, y }, state.face);
      state.touched.add(target.id);
      addItem(state, item('element', target.id, describeEl(target).name, describeEl(target).type, [
        { field: 'x', label: 'X', before: fmt(before.x), after: fmt(newXmm) },
        { field: 'y', label: 'Y', before: fmt(before.y), after: fmt(newYmm) },
      ]));
      return { state, message: `已移动「${describeEl(target).name}」` };
    }

    case 'resize_design_object': {
      const target = findTarget(state, p.layerId);
      const before = elLocalRect(target, panel);
      const hPct0 = textHeightPct(target, panel);
      const scale = p.scale !== undefined ? Number(p.scale) : null;
      if (scale === null && p.w_mm === undefined && p.h_mm === undefined) throw new Error('没有给缩放比例或目标尺寸');
      const keep = p.keepAspectRatio !== false;
      let wPct = target.w;
      let hPct = hPct0;
      if (scale !== null) {
        wPct = target.w * scale;
        hPct = hPct0 * scale;
      } else {
        if (p.w_mm !== undefined) wPct = Number(p.w_mm) / panel.w * 100;
        if (p.h_mm !== undefined) hPct = Number(p.h_mm) / panel.h * 100;
        if (keep && p.w_mm !== undefined && p.h_mm === undefined) hPct = hPct0 * (wPct / target.w);
        if (keep && p.h_mm !== undefined && p.w_mm === undefined) wPct = target.w * (hPct / hPct0);
      }
      wPct = clamp(wPct, 1, 100);
      hPct = clamp(hPct, 0.1, 100);
      const cx = target.x + target.w / 2;
      const cy = target.y + hPct0 / 2;
      const patch: Partial<DesignEl> = {
        w: round(wPct),
        x: round(cx - wPct / 2),
        y: round(cy - hPct / 2),
      };
      if (target.kind !== 'text') patch.h = round(hPct);
      if (target.kind === 'text' && scale !== null) patch.size = round((target.size ?? 3) * scale);
      if (target.kind === 'text' && p.h_mm !== undefined) patch.h = round(hPct);
      state.design = patchEls(state.design, [target.id], patch, state.face);
      state.touched.add(target.id);
      addItem(state, item('element', target.id, describeEl(target).name, describeEl(target).type, [
        { field: 'w', label: '宽度', before: fmt(before.w), after: fmt(wPct / 100 * panel.w) },
        { field: 'h', label: '高度', before: fmt(before.h), after: fmt(hPct / 100 * panel.h) },
        ...(target.kind === 'text' ? [{ field: 'size', label: '字号', before: fmt(((target.size ?? 3) / 100) * panel.w), after: fmt(((patch.size ?? target.size ?? 3) / 100) * panel.w) }] : []),
      ]));
      return { state, message: `已缩放「${describeEl(target).name}」` };
    }

    case 'rotate_design_object': {
      const target = findTarget(state, p.layerId);
      if (p.rotation === undefined && p.delta_deg === undefined) throw new Error('没有给旋转角度');
      const next = p.rotation !== undefined
        ? Number(p.rotation)
        : (target.rotation ?? 0) + Number(p.delta_deg);
      const rotation = round(clamp(next, -180, 180));
      state.design = patchEls(state.design, [target.id], { rotation }, state.face);
      state.touched.add(target.id);
      addItem(state, item('element', target.id, describeEl(target).name, describeEl(target).type, [
        { field: 'rotation', label: '旋转', before: `${target.rotation ?? 0}°`, after: `${rotation}°` },
      ]));
      return { state, message: `已旋转「${describeEl(target).name}」` };
    }

    case 'change_object_color': {
      const target = findTarget(state, p.layerId);
      if (target.kind === 'sticker') throw new Error('图片对象不能直接改色；请换图或用带颜色的形状叠层');
      const color = String(p.color);
      if (!COLOR_RE.test(color)) throw new Error('颜色必须是 6 位 HEX');
      state.design = patchEls(state.design, [target.id], { color }, state.face);
      state.touched.add(target.id);
      addItem(state, item('element', target.id, describeEl(target).name, describeEl(target).type, [
        { field: 'color', label: '颜色', before: target.color || '', after: color },
      ]));
      return { state, message: `已改色「${describeEl(target).name}」` };
    }

    case 'replace_image_layer': {
      const target = findTarget(state, p.layerId);
      if (target.kind !== 'sticker') throw new Error(`「${describeEl(target).name}」不是图片对象`);
      let source: DesignEl | null = null;
      if (p.sourceLayerId !== undefined) {
        const list = faceEls(state.design, state.face);
        source = list.find((e) => e.id === String(p.sourceLayerId)) || null;
        if (!source) {
          const other = Object.entries(state.design.faces || {})
            .flatMap(([f, els]) => (els || []).map((e) => ({ face: f, el: e })))
            .find((x) => x.el.id === String(p.sourceLayerId) && x.el.kind === 'sticker');
          if (other) throw new Error(`图源在「${other.face}」面，不能跨面板取图`);
        }
      } else if (p.src !== undefined) {
        const src = String(p.src);
        const all = Object.values(state.design.faces || {}).flatMap((els) => els || []).concat(state.design.els);
        source = all.find((e) => e.kind === 'sticker' && e.src === src) || null;
        if (!source) throw new Error('只能使用当前项目里已经存在的图片，不能编造 URL 或 data URL');
      }
      if (!source || source.kind !== 'sticker' || !source.src) throw new Error('没有可用的图源');
      const patch: Partial<DesignEl> = {
        src: source.src,
        naturalW: source.naturalW,
        naturalH: source.naturalH,
        ...(source.assetId ? { assetId: source.assetId } : {}),
        source: 'library',
      };
      state.design = patchEls(state.design, [target.id], patch, state.face);
      state.touched.add(target.id);
      addItem(state, item('element', target.id, describeEl(target).name, describeEl(target).type, [
        { field: 'src', label: '图片', before: target.src ? '已有图片' : '空位', after: `取自「${describeEl(source).name}」` },
      ]));
      return { state, message: `已替换「${describeEl(target).name}」的图片` };
    }

    case 'create_shape_layer': {
      const shape = String(p.shape) as 'rect' | 'ellipse' | 'line';
      const wMm = Number(p.w_mm ?? (shape === 'line' ? panel.w * 0.5 : 30));
      const hMm = Number(p.h_mm ?? (shape === 'line' ? 0.5 : 20));
      const xMm = Number(p.x_mm ?? panel.w * 0.2);
      const yMm = Number(p.y_mm ?? panel.h * 0.3);
      const el = addShape(state.design, shape, state.face, {
        x: round(xMm / panel.w * 100),
        y: round(yMm / panel.h * 100),
        w: round(wMm / panel.w * 100),
        h: round(hMm / panel.h * 100),
        color: String(p.color || state.design.accent),
        ...(p.name ? { name: String(p.name) } : {}),
        ...(p.stroke !== undefined ? { stroke: String(p.stroke) } : {}),
        ...(p.strokeWidth !== undefined ? { strokeWidth: Number(p.strokeWidth) } : {}),
        ...(p.radius !== undefined ? { radius: Number(p.radius) } : {}),
        ...(p.opacity !== undefined ? { opacity: Number(p.opacity) } : {}),
        ...(p.rotation !== undefined ? { rotation: Number(p.rotation) } : {}),
      });
      state.design = withFaceEls(state.design, state.face, [...faceEls(state.design, state.face), el]);
      state.touched.add(el.id);
      addItem(state, item('element', el.id, el.name || shape, '形状', [
        { field: 'create', label: '新建', before: '无', after: `${shape} ${fmt(wMm)} × ${fmt(hMm)}，${fmt(xMm)} / ${fmt(yMm)}` },
      ]));
      return { state, message: `已创建${shape === 'ellipse' ? '椭圆' : shape === 'line' ? '直线' : '矩形'}` };
    }

    case 'delete_layer': {
      const target = findTarget(state, p.layerId);
      state.design = removeEls(state.design, [target.id], state.face);
      state.touched.add(target.id);
      addItem(state, item('element', target.id, describeEl(target).name, describeEl(target).type, [
        { field: 'delete', label: '删除', before: '存在', after: '已删除' },
      ]));
      return { state, message: `已删除「${describeEl(target).name}」` };
    }

    case 'duplicate_layer': {
      const target = findTarget(state, p.layerId, { locked: false });
      const r = duplicateEls(state.design, [target.id], state.face);
      if (!r.design || !r.ids.length) throw new Error('复制失败');
      const offsetMm = Number(p.offset_mm ?? 3);
      const dx = round(offsetMm / panel.w * 100);
      const dy = round(offsetMm / panel.h * 100);
      const copy = faceEls(r.design, state.face).find((e) => e.id === r.ids[0]);
      state.design = patchEls(r.design, r.ids, {
        x: round((copy?.x ?? 0) + dx),
        y: round((copy?.y ?? 0) + dy),
      }, state.face);
      state.touched.add(r.ids[0]);
      addItem(state, item('element', r.ids[0], `${describeEl(target).name} 副本`, describeEl(target).type, [
        { field: 'duplicate', label: '复制', before: `1 个「${describeEl(target).name}」`, after: '新增 1 个副本（可单独编辑）' },
      ]));
      return { state, message: `已复制「${describeEl(target).name}」` };
    }

    case 'set_layer_visibility': {
      const target = findTarget(state, p.layerId);
      const visible = Boolean(p.visible);
      state.design = patchEls(state.design, [target.id], { visible }, state.face);
      state.touched.add(target.id);
      addItem(state, item('element', target.id, describeEl(target).name, describeEl(target).type, [
        { field: 'visible', label: '可见', before: target.visible === false ? '隐藏' : '显示', after: visible ? '显示' : '隐藏' },
      ]));
      return { state, message: `${visible ? '已显示' : '已隐藏'}「${describeEl(target).name}」` };
    }

    case 'update_layer_order': {
      const ids = targetIds(state, p.layerIds);
      ids.forEach((id) => findTarget(state, id));
      const actionOrder = String(p.action) as 'front' | 'back' | 'up' | 'down';
      state.design = orderEls(state.design, ids, actionOrder, state.face);
      ids.forEach((id) => state.touched.add(id));
      addItem(state, item('element', ids.join(','), `${ids.length} 个对象`, '层级', [
        { field: 'order', label: '叠放', before: '原次序', after: { front: '移到最上层', back: '移到最下层', up: '上移一层', down: '下移一层' }[actionOrder] },
      ]));
      return { state, message: `已调整 ${ids.length} 个对象的层级` };
    }

    case 'align_objects': {
      let ids = p.layerIds === undefined ? state.selectedIds.slice() : targetIds(state, p.layerIds);
      if (!ids.length) throw new Error('没有选中对象可对齐');
      if (!Array.isArray(ids)) ids = [String(ids)];
      if (ids.length === 1 && String(p.ref || 'selection') === 'selection') ids = [ids[0]];
      const targets = ids.map((id) => findTarget(state, id));
      const frame = String(p.ref || 'selection') === 'panel'
        ? { left: STUDIO_SAFE / panel.w * 100, right: (panel.w - STUDIO_SAFE) / panel.w * 100, top: STUDIO_SAFE / panel.h * 100, bottom: (panel.h - STUDIO_SAFE) / panel.h * 100 }
        : {
          left: Math.min(...targets.map((e) => e.x)),
          right: Math.max(...targets.map((e) => e.x + e.w)),
          top: Math.min(...targets.map((e) => e.y)),
          bottom: Math.max(...targets.map((e) => e.y + textHeightPct(e, panel))),
        };
      const align = String(p.align);
      const boxes: Record<string, { x?: number; y?: number }> = {};
      for (const el of targets) {
        if (align === 'left') boxes[el.id] = { x: frame.left };
        if (align === 'center') boxes[el.id] = { x: frame.left + (frame.right - frame.left - el.w) / 2 };
        if (align === 'right') boxes[el.id] = { x: frame.right - el.w };
        if (align === 'top') boxes[el.id] = { y: frame.top };
        if (align === 'middle') boxes[el.id] = { y: frame.top + (frame.bottom - frame.top - textHeightPct(el, panel)) / 2 };
        if (align === 'bottom') boxes[el.id] = { y: frame.bottom - textHeightPct(el, panel) };
      }
      state.design = withFaceEls(state.design, state.face,
        faceEls(state.design, state.face).map((e) => boxes[e.id] ? { ...e, ...boxes[e.id], updatedAt: Date.now() } : e));
      targets.forEach((e) => state.touched.add(e.id));
      for (const el of targets) {
        addItem(state, item('element', el.id, describeEl(el).name, describeEl(el).type, [
          { field: 'align', label: '对齐', before: `${round(el.x)}% / ${round(el.y)}%`, after: '按当前参照对齐' },
        ]));
      }
      return { state, message: `已对齐 ${targets.length} 个对象` };
    }

    case 'distribute_objects': {
      const ids = p.layerIds === undefined ? state.selectedIds.slice() : targetIds(state, p.layerIds);
      if (ids.length < 3) throw new Error('等间距分布至少需要 3 个对象');
      const targets = ids.map((id) => findTarget(state, id));
      const axis = String(p.axis) === 'vertical' ? 'vertical' : 'horizontal';
      const sorted = [...targets].sort((a, b) => (axis === 'horizontal' ? a.x - b.x : a.y - b.y));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const start = axis === 'horizontal' ? first.x : first.y;
      const end = axis === 'horizontal' ? last.x + last.w : last.y + textHeightPct(last, panel);
      const total = sorted.reduce((sum, e) => sum + (axis === 'horizontal' ? e.w : textHeightPct(e, panel)), 0);
      const gap = (end - start - total) / (sorted.length - 1);
      let cur = start;
      const boxes: Record<string, { x?: number; y?: number }> = {};
      for (const el of sorted) {
        boxes[el.id] = axis === 'horizontal' ? { x: round(cur) } : { y: round(cur) };
        cur += (axis === 'horizontal' ? el.w : textHeightPct(el, panel)) + gap;
      }
      state.design = withFaceEls(state.design, state.face,
        faceEls(state.design, state.face).map((e) => boxes[e.id] ? { ...e, ...boxes[e.id], updatedAt: Date.now() } : e));
      targets.forEach((e) => state.touched.add(e.id));
      addItem(state, item('element', ids.join(','), `${targets.length} 个对象`, '分布', [
        { field: 'distribute', label: '等间距', before: '原间距', after: `${axis === 'horizontal' ? '水平' : '垂直'}等间距` },
      ]));
      return { state, message: `已分布 ${targets.length} 个对象` };
    }

    case 'change_background': {
      const targetFace = String(p.face || state.face);
      if (!facesOf(state.project).some((f) => f.id === targetFace)) throw new Error(`没有「${targetFace}」面`);
      if (targetFace !== state.face) {
        state.crossPanel = true;
        state.targetFaces.add(targetFace);
      } else {
        state.targetFaces.add(targetFace);
      }
      const before = bgForFace(state.design, targetFace);
      state.design = withFaceBg(state.design, targetFace, String(p.color));
      state.faceChanged = targetFace === state.face || state.faceChanged;
      addItem(state, {
        kind: 'panel',
        targetId: targetFace,
        targetName: `${targetFace} 面背景`,
        targetType: '面板',
        change: [{ field: 'bg', label: '背景色', before, after: String(p.color) }],
      });
      if (p.opacity !== undefined) state.warnings.push('背景色只支持不透明填充，opacity 已忽略');
      return { state, message: `已修改${targetFace}面背景` };
    }

    case 'run_prepress_check': {
      const brief = createEmptyBrief();
      brief.product = state.project.answers.productName.v || state.project.name;
      brief.brand = '';
      brief.size = dimsOf(state.project) || { l: panel.w, w: panel.h, h: 0 };
      brief.structure = structureFor(state.project.answers.form.v) || 'tuck';
      brief.colors = state.project.answers.colors.v || [];
      const dieline = dielineOf(state.project);
      const faces: Partial<Record<string, DesignEl[]>> = { ...(state.design.faces || {}) };
      faces[state.face] = faceEls(state.design, state.face);
      const doc = designDocFor({ ...state.project, design: state.design }, faces);
      if (!dieline || !doc) throw new Error('当前形式没有刀模，无法印前检查');
      const report = runPrepress({ design: doc, brief, dieline, dpi: 300 });
      const errors = report.items.filter((x) => x.level === 'error').length;
      const warns = report.items.filter((x) => x.level === 'warning').length;
      if (errors || warns) state.warnings.push(`印前检查：${errors} 错误 / ${warns} 警告`);
      return { state, message: `印前检查：${errors} 个错误、${warns} 个警告` };
    }

    case 'update_dimensions': {
      const dims = { l: Number(p.l), w: Number(p.w), h: Number(p.h) };
      const before = dimsOf(state.project);
      state.project = {
        ...state.project,
        answers: {
          ...state.project.answers,
          size: { mode: 'custom', dims, src: 'user', confirmed: true },
        },
        design: state.design,
        updatedAt: Date.now(),
      };
      state.structural = true;
      const panelNow = currentPanel(state);
      const outside = faceEls(state.design, state.face).filter((e) => {
        const r = elLocalRect(e, panelNow);
        return r.x < STUDIO_SAFE || r.y < STUDIO_SAFE
          || r.x + r.w > panelNow.w - STUDIO_SAFE
          || r.y + r.h > panelNow.h - STUDIO_SAFE;
      });
      if (outside.length) {
        state.warnings.push(`${outside.length} 个对象超出新面板 5mm 安全边，请执行后检查`);
      }
      addItem(state, {
        kind: 'structure',
        targetId: 'dimensions',
        targetName: '成品尺寸',
        targetType: '结构参数',
        change: [{
          field: 'size', label: '尺寸',
          before: before ? `${before.l}×${before.w}×${before.h}mm` : '未定',
          after: `${dims.l}×${dims.w}×${dims.h}mm`,
        }],
      });
      return { state, message: `成品尺寸已改为 ${dims.l}×${dims.w}×${dims.h}mm，刀模已重算` };
    }

    case 'update_structure':
      throw new Error('结构变更不开放给 AI 直接执行：请回到需求步骤确认结构，并重新检查版面安全区');

    default:
      throw new Error(`未知工具：${action.name}`);
  }
}

/** 把模型常见的占位指代替换成真实选中 ID；没有唯一选中时明确报错。 */
function resolveTargets(plan: StudioAIPlan, snapshot: StudioAISnapshot): StudioAIPlan {
  const selected = snapshot.selectedIds;
  const actions = plan.actions.map((a) => {
    const params = { ...a.params };
    const needsLayer = 'layerId' in params || ['update_text_layer', 'update_layer_position', 'resize_design_object',
      'rotate_design_object', 'change_object_color', 'replace_image_layer', 'delete_layer', 'duplicate_layer',
      'set_layer_visibility'].includes(a.name);
    if (needsLayer) {
      if (isPlaceholder(params.layerId)) {
        if (selected.length !== 1) throw new Error('「它」指向不明确：请先选中一个对象，或直接说图层名');
        params.layerId = selected[0];
      } else if (params.layerId === undefined && selected.length === 1) {
        params.layerId = selected[0];
      }
    }
    if (Array.isArray(params.layerIds) && (params.layerIds as unknown[]).some(isPlaceholder)) {
      if (!selected.length) throw new Error('没有选中对象，不能把「它们」自动展开');
      params.layerIds = selected.slice();
    }
    return { ...a, params };
  });
  return { ...plan, actions };
}

function buildPreview(
  plan: StudioAIPlan,
  state: AppState,
  snapshot: StudioAISnapshot,
): StudioPlanPreview {
  const deleteCount = plan.actions.filter((a) => a.name === 'delete_layer').length;
  const dangerReasons: string[] = [];
  if (deleteCount > 1) dangerReasons.push(`一次删除 ${deleteCount} 个对象`);
  if (state.structural) dangerReasons.push('修改成品尺寸会重新运行刀模几何');
  if (state.crossPanel) dangerReasons.push('操作会跨到其它面板');
  if (plan.actions.length >= 10) dangerReasons.push(`一次执行 ${plan.actions.length} 个动作，属于批量修改`);
  const deletePlusBg = deleteCount >= 1 && plan.actions.some((a) => a.name === 'change_background') && plan.actions.length >= 3;
  if (deletePlusBg) dangerReasons.push('同时删除对象并改背景，可能等于替换整个面板');

  const afterEls = faceEls(state.design, state.face);
  const unchangedCount = afterEls.filter((e) => !state.touched.has(e.id)).length;
  const permission: PlanPermission = dangerReasons.length ? 'danger' : 'normal';
  const structuralImpact: string[] = [];
  if (state.structural) {
    structuralImpact.push('刀模几何按新尺寸重新计算；AI 没有直接写入任何刀模结果');
    if (state.warnings.length) structuralImpact.push(...state.warnings.filter((w) => w.includes('安全边')));
  }
  if (state.crossPanel) structuralImpact.push('仅修改明确点名的其它面板，未跨面复制对象');
  if (!structuralImpact.length) structuralImpact.push('不影响包装结构、尺寸与刀模计算结果');

  return {
    planId: `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    mode: plan.mode,
    summary: plan.summary,
    ...(plan.clarification ? { clarification: plan.clarification } : {}),
    actions: plan.actions,
    items: state.changes,
    unchangedCount,
    crossPanel: state.crossPanel,
    targetFaces: [...state.targetFaces],
    structural: state.structural,
    structuralImpact,
    permission,
    dangerReasons,
    warnings: state.warnings,
    baseDigest: designDigest(snapshot.design),
    baseFace: snapshot.face,
    createdAt: Date.now(),
  };
}

/** 试跑全部动作。任何一步失败就整体作废，不返回半成品。 */
function dryRun(plan: StudioAIPlan, snapshot: StudioAISnapshot): { ok: boolean; state: AppState | null; results: ActionResult[]; error: string } {
  const results: ActionResult[] = [];
  if (plan.actions.length === 0) return { ok: false, state: null, results, error: '计划里没有可执行动作' };
  if (plan.actions.length > MAX_ACTIONS) {
    return { ok: false, state: null, results, error: `一次最多 ${MAX_ACTIONS} 个动作，请拆开确认` };
  }
  if (!snapshot.panel) return { ok: false, state: null, results, error: '当前包装形式没有可用面板' };

  const state: AppState = {
    project: snapshot.project,
    design: snapshot.design,
    face: snapshot.face,
    panel: snapshot.panel,
    selectedIds: snapshot.selectedIds.slice(),
    faceChanged: false,
    structural: false,
    crossPanel: false,
    targetFaces: new Set(),
    warnings: [],
    changes: [],
    touched: new Set(),
  };

  for (const action of plan.actions) {
    const def = studioToolByName(action.name);
    if (!def) {
      results.push({ name: action.name, ok: false, message: `未知工具：${action.name}` });
      return { ok: false, state: null, results, error: `模型使用了不存在的工具「${action.name}」，已拒绝执行` };
    }
    try {
      const applied = applyAction(action, state, def);
      results.push({ name: action.name, ok: true, message: applied.message });
    } catch (e) {
      const message = (e as Error).message || '执行失败';
      results.push({ name: action.name, ok: false, message });
      return { ok: false, state: null, results, error: message };
    }
  }

  /** 结构操作后，设计对象可能越出安全区；这不是致命错误，但必须写进预览。 */
  if (state.structural) {
    const panel = currentPanel(state);
    const outside = faceEls(state.design, state.face).filter((e) => {
      const r = elLocalRect(e, panel);
      return r.x < STUDIO_SAFE || r.y < STUDIO_SAFE
        || r.x + r.w > panel.w - STUDIO_SAFE
        || r.y + r.h > panel.h - STUDIO_SAFE;
    });
    if (outside.length) {
      const note = `${outside.length} 个对象不在新面板的 5mm 安全区内`;
      if (!state.warnings.includes(note)) state.warnings.push(note);
    }
  }

  return { ok: true, state, results, error: '' };
}

/** 校验 + 试跑 + 预览。不会提交任何状态。 */
export function previewPlan(plan: StudioAIPlan, snapshot: StudioAISnapshot): PlanExecution {
  if (plan.mode !== 'edit') {
    return { ok: false, preview: null, design: null, project: null, results: [], error: '这不是修改计划' };
  }
  let resolved: StudioAIPlan;
  try {
    resolved = resolveTargets(plan, snapshot);
  } catch (e) {
    return { ok: false, preview: null, design: null, project: null, results: [], error: (e as Error).message };
  }
  const run = dryRun(resolved, snapshot);
  if (!run.ok || !run.state) {
    return { ok: false, preview: null, design: null, project: null, results: run.results, error: run.error };
  }
  const preview = buildPreview(resolved, run.state, snapshot);
  if (!preview.items.length) {
    return { ok: false, preview: null, design: null, project: null, results: run.results, error: '这些动作没有产生实际修改' };
  }
  return {
    ok: true,
    preview,
    design: run.state.design,
    project: run.state.project,
    results: run.results,
    error: '',
  };
}

/** 与 previewPlan 同一套试跑；返回的候选对象才能被界面提交。 */
export function executePlan(plan: StudioAIPlan, snapshot: StudioAISnapshot): PlanExecution {
  return previewPlan(plan, snapshot);
}

/** 确认时检查预览后画布是否被用户改过。 */
export function planIsStale(preview: StudioPlanPreview, design: StudioDesign): boolean {
  return preview.baseDigest !== designDigest(design);
}
