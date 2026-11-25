/* ============================================================
   Studio 2.0 阶段二 — 撤销 / 重做
   ------------------------------------------------------------
   策略：不可变快照 + 合并键。
   · 一次完整操作 = 一次 push（拖动只改预览，松手才 push，所以不会每像素一条）
   · 连续输入同一个字段（同一个元素同一个属性）在 900ms 内共享 mergeKey，合并成一条
   · 切换面板不会清历史：快照存的是整份 StudioDesign（所有面）
   · 历史上限 40 条；图片是 data URL 字符串，快照之间共享同一份字符串引用，
     不会每条都复制一份 Base64
   ============================================================ */
import type { StudioDesign } from './types';

export const HISTORY_LIMIT = 40;
export const MERGE_WINDOW_MS = 900;

export interface HistoryState {
  past: StudioDesign[];
  present: StudioDesign;
  future: StudioDesign[];
  /** 上一次合并键与时间，用于把连续输入合成一条 */
  lastKey: string;
  lastAt: number;
}

export function createHistory(design: StudioDesign): HistoryState {
  return { past: [], present: design, future: [], lastKey: '', lastAt: 0 };
}

export const canUndo = (h: HistoryState) => h.past.length > 0;
export const canRedo = (h: HistoryState) => h.future.length > 0;

/** 记一条历史；mergeKey 相同且间隔够短时并入上一条 */
export function pushHistory(
  h: HistoryState,
  next: StudioDesign,
  mergeKey = '',
  now = Date.now(),
): HistoryState {
  if (next === h.present) return h;
  const merged = !!mergeKey && mergeKey === h.lastKey && now - h.lastAt <= MERGE_WINDOW_MS;
  const past = merged
    ? h.past
    : [...h.past, h.present].slice(-HISTORY_LIMIT);
  return {
    past,
    present: next,
    future: [],
    lastKey: mergeKey,
    lastAt: now,
  };
}

/** 撤销：把当前放进 future，回到上一条 */
export function undoHistory(h: HistoryState): HistoryState {
  if (!h.past.length) return h;
  const present = h.past[h.past.length - 1];
  return {
    past: h.past.slice(0, -1),
    present,
    future: [h.present, ...h.future].slice(0, HISTORY_LIMIT),
    lastKey: '',
    lastAt: 0,
  };
}

/** 重做：把 future 的第一条拿回来 */
export function redoHistory(h: HistoryState): HistoryState {
  if (!h.future.length) return h;
  const present = h.future[0];
  return {
    past: [...h.past, h.present].slice(-HISTORY_LIMIT),
    present,
    future: h.future.slice(1),
    lastKey: '',
    lastAt: 0,
  };
}

/** 恢复历史时把「当前」替换成外部（云端/撤销）来的稿，同时保留栈 */
export function syncHistory(h: HistoryState, design: StudioDesign): HistoryState {
  if (design === h.present) return h;
  return { ...h, present: design };
}
