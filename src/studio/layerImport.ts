/* ============================================================
   阶段三 — 拆图结果 → 工作台元素
   ------------------------------------------------------------
   输入是已经校验过的 ParsedSplit，输出是纯数据 DesignEl[]。
   不读 DOM，不刷新 React；导入、撤销、保存都交给 DesignStage。

   关键约束：
   · 底图只作为一个背景对象导入一次，不做“底图 + 全图层再叠一遍”；
   · 每个图层都用官方 bbox 映射到面板毫米，再转百分比，无随机位置；
   · OCR 置信不足时保留原 PNG，不硬转文字；
   · 同一 jobId + 同一图层 key 重复导入会被识别并跳过。
   ============================================================ */
import { mapBoxToCanvas, mmBoxToPct, normalizeBox } from '../engine/layerPlacement';
import { ocrToTextSpec, type ParsedLayer, type ParsedSplit } from '../engine/seedreamLayers';
import type { DesignEl, ElLayerType, StudioDesign } from './types';
import { faceEls, withFaceEls } from './types';

export interface ImportPanel {
  id: string;
  /** 当前面板视觉画布尺寸（mm） */
  w: number;
  h: number;
}

export interface ImportOptions {
  panel: ImportPanel;
  face: string;
  /** 只导入这些 key；不传 = 全部 */
  keys?: string[];
  /** 是否尝试把高结构化 OCR 转成可编辑文字（原 PNG 仍保留，默认隐藏） */
  reconstructText?: boolean;
  fit?: 'contain' | 'cover' | 'stretch';
  now?: number;
}

export interface ImportResult {
  design: StudioDesign;
  ids: string[];
  imported: number;
  skipped: number;
  duplicates: number;
  warnings: string[];
}

const safeId = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);

/** 图层类型标签 → DesignEl.layerType */
const asLayerType = (k: ParsedLayer['kind']): ElLayerType => k;

/**
 * 把拆图结果加入某一面。
 * 底图放在最底层，透明图层按 z_index 从小到大叠上去；面板坐标是毫米，
 * 元素坐标是百分比（Studio 全站统一口径）。
 */
export function importSplitLayers(
  design: StudioDesign,
  split: ParsedSplit,
  opt: ImportOptions,
): ImportResult {
  const pw = Math.max(1, opt.panel.w);
  const ph = Math.max(1, opt.panel.h);
  const layeringFit = opt.fit || 'contain';
  const job = split.jobId || `job_${opt.now || Date.now()}`;
  const keys = opt.keys ? new Set(opt.keys) : null;
  const existing = faceEls(design, opt.face);
  const existingIds = new Set(existing.map((e) => e.id));
  const maxZ = existing.reduce((m, e) => Math.max(m, e.zIndex ?? 0), -1);
  const now = opt.now || Date.now();
  const warnings: string[] = [];
  let duplicates = 0;
  let skipped = 0;

  const elements: DesignEl[] = [];
  let z = maxZ + 1;

  const makeId = (key: string) => `im_${safeId(job)}_${safeId(key)}`;

  /* ---------------- 底图：单独一个背景对象 ---------------- */
  if (split.base) {
    const b = split.base;
    if (keys && !keys.has(b.key) && !keys.has('__base__')) {
      // 用户没勾底图，跳过
    } else {
      const id = makeId('base_' + b.key);
      if (existingIds.has(id)) {
        duplicates += 1;
      } else if (b.dataUrl || b.assetUrl) {
        // 底图与图层用同一个 fit，避免“底图铺满、图层却居中留白”导致对不上。
        const bw = b.width || Math.round(pw);
        const bh = b.height || Math.round(ph);
        const bmm = mapBoxToCanvas(
          { left: 0, top: 0, right: bw, bottom: bh }, bw, bh, pw, ph, layeringFit,
        );
        const bp = mmBoxToPct(bmm, pw, ph);
        elements.push({
          id,
          kind: 'sticker',
          name: b.name || '底图',
          src: b.assetUrl || b.dataUrl,
          x: bp.x, y: bp.y, w: bp.w, h: bp.h,
          naturalW: bw,
          naturalH: bh,
          fit: layeringFit === 'cover' ? 'cover' : 'contain',
          layerType: 'background',
          importJob: job,
          source: 'ai',
          zIndex: z,
          createdAt: now,
          updatedAt: now,
        });
        z += 1;
      } else {
        skipped += 1;
      }
    }
  }

  /* ---------------- 透明图层 ---------------- */
  const layers = split.layers.filter((l) => (keys ? keys.has(l.key) : true));
  for (const l of layers) {
    if (!l.box) { skipped += 1; warnings.push(`${l.name}：缺少 bbox，未导入`); continue; }
    if (!l.dataUrl && !l.assetUrl) { skipped += 1; warnings.push(`${l.name}：没有可用图片，未导入`); continue; }
    if (!split.base || !split.base.width || !split.base.height) {
      skipped += 1;
      warnings.push(`${l.name}：底图尺寸未知，无法还原坐标`);
      continue;
    }

    const norm = normalizeBox(l.box, split.base.width, split.base.height);
    if (norm.clipped) warnings.push(`${l.name}：bbox 超出底图边界，已夹回可绘制范围`);
    const mm = mapBoxToCanvas(norm.box, split.base.width, split.base.height, pw, ph, layeringFit);
    if (mm.clipped.left + mm.clipped.top + mm.clipped.right + mm.clipped.bottom > 0.5) {
      warnings.push(`${l.name}：按 ${layeringFit} 映射后有部分落在画布外，保留真实坐标`);
    }
    const pct = mmBoxToPct(mm, pw, ph);

    const srcId = makeId(l.key);
    if (existingIds.has(srcId)) { duplicates += 1; continue; }

    const baseEl: DesignEl = {
      id: srcId,
      kind: 'sticker',
      name: l.name,
      src: l.assetUrl || l.dataUrl,
      x: pct.x,
      y: pct.y,
      w: Math.max(0.4, pct.w),
      h: Math.max(0.4, pct.h),
      naturalW: l.width || Math.round((pct.w / 100) * pw * 10),
      naturalH: l.height || Math.round((pct.h / 100) * ph * 10),
      fit: 'contain',
      layerType: asLayerType(l.kind),
      importJob: job,
      ocrText: l.ocr?.text || undefined,
      ocrConfidence: l.ocr?.confidence,
      source: 'ai',
      zIndex: z,
      createdAt: now,
      updatedAt: now,
    };
    z += 1;

    const spec = l.ocr ? ocrToTextSpec(l) : null;
    const canRebuild = opt.reconstructText !== false
      && !!spec && spec.confidence >= 0.7 && !spec.uncertain
      && spec.text.trim().length > 0 && spec.text.length <= 180;

    if (canRebuild && spec) {
      // 文字对象：字号按 OCR 第一行的像素高度估，只作视觉起点；字体是替代字体，
      // 绝不把 similar_font_family 写进 fontFamily。
      const lineH = l.ocr?.lines[0]?.box
        ? (l.ocr.lines[0].box.bottom - l.ocr.lines[0].box.top) * (ph / split.base.height)
        : mm.h * 0.5;
      const sizePct = Math.min(40, Math.max(0.8, (lineH * 0.82 / pw) * 100));
      const textEl: DesignEl = {
        id: `${srcId}_txt`,
        kind: 'text',
        name: `${l.name}（可编辑文字）`,
        text: spec.text,
        x: pct.x, y: pct.y, w: Math.max(1, pct.w),
        size: sizePct,
        color: spec.color,
        weight: spec.weight,
        align: 'left',
        lineHeight: spec.lineHeight,
        layerType: 'text',
        importJob: job,
        ocrText: spec.text,
        ocrConfidence: spec.confidence,
        source: 'ai',
        zIndex: z,
        createdAt: now,
        updatedAt: now,
      };
      z += 1;
      // 原文字像素层保留但默认隐藏：OCR 不准时用户一眼就能切回原图。
      baseEl.visible = false;
      baseEl.name = `${l.name}（原图像素，已保留）`;
      elements.push(baseEl, textEl);
      warnings.push(`${l.name}：OCR 已转为可编辑文字，原 PNG 保留在图层列表（默认隐藏）；字体为替代字体，请核对字形`);
    } else {
      elements.push(baseEl);
      if (l.ocr?.text) {
        warnings.push(`${l.name}：OCR 结构不足，保留原 PNG；可在属性面板手动改字`);
      }
    }
  }

  if (!elements.length) {
    return { design, ids: [], imported: 0, skipped, duplicates, warnings };
  }

  /* 底图必须压在所有已有内容之下；否则它会盖住用户原来的文字与图形。
     透明图层则叠在已有内容之上。 */
  const baseEl = elements.find((e) => e.layerType === 'background');
  const rest = elements.filter((e) => e !== baseEl);
  const nextEls = [...(baseEl ? [baseEl] : []), ...existing, ...rest]
    .map((e, i) => ({ ...e, zIndex: i }));
  const next = withFaceEls(design, opt.face, nextEls);
  return {
    design: next,
    ids: elements.filter((e) => e.visible !== false).map((e) => e.id),
    imported: elements.length,
    skipped,
    duplicates,
    warnings,
  };
}

/** 属性面板「换回原 PNG / 把 OCR 转文字」需要的查询；不引入 React */
export function findLayerPair(els: DesignEl[], id: string): { image?: DesignEl; text?: DesignEl } {
  const el = els.find((e) => e.id === id);
  if (!el) return {};
  const textId = `${el.id}_txt`;
  if (el.kind === 'text' && el.id.endsWith('_txt')) {
    return { text: el, image: els.find((e) => e.id === el.id.slice(0, -4)) };
  }
  if (el.kind === 'text') return { text: el };
  return { image: el, text: els.find((e) => e.id === textId) };
}
