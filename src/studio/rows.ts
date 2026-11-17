/* ============================================================
   Studio 2.0 — 项目列表的合并逻辑
   ------------------------------------------------------------
   本机缓存与云端列表按 id 合并，updatedAt 较新的一方为准。
   空项目（一条都没填）不进列表，避免满屏「未命名设计」。
   ============================================================ */
import { isBlankStudio, type StudioProject } from './types';
import { readCacheFor, type StudioMeta } from './api';

export interface StudioRow {
  id: string;
  name: string;
  updatedAt: number;
  step?: number;
  status?: 'draft' | 'confirmed';
  blank?: boolean;
  cloudOnly?: boolean;
  /** 有设计稿才带缩略色：工作台卡片用这一版版面自己的底色，不用示意图 */
  bg?: string;
  ink?: string;
  accent?: string;
  hasSticker?: boolean;
}

export function rowsFromCache(uid: string): StudioRow[] {
  return readCacheFor(uid).map((p: StudioProject) => ({
    id: p.id, name: p.name, updatedAt: p.updatedAt, step: p.step,
    status: p.status, blank: isBlankStudio(p),
    bg: p.design?.bg, ink: p.design?.ink, accent: p.design?.accent,
    hasSticker: !!p.design?.els.some((e) => e.kind === 'sticker' && e.src),
  }));
}

export function mergeRows(cacheRows: StudioRow[], cloud: StudioMeta[]): StudioRow[] {
  const map = new Map<string, StudioRow>();
  cacheRows.forEach((r) => map.set(r.id, r));
  cloud.forEach((c) => {
    const cur = map.get(c.id);
    if (!cur) {
      map.set(c.id, { id: c.id, name: c.name, updatedAt: c.updatedAt, cloudOnly: true });
    } else if (c.updatedAt > cur.updatedAt) {
      map.set(c.id, { ...cur, updatedAt: c.updatedAt, name: c.name || cur.name });
    } else if (c.name && (!cur.name || cur.name === '未命名设计')) {
      map.set(c.id, { ...cur, name: c.name });
    }
  });
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export const timeLabel = (ts: number): string => {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? `今天 ${p(d.getHours())}:${p(d.getMinutes())}`
    : `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${p(d.getHours())}:${p(d.getMinutes())}`;
};
