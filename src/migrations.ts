/* ============================================================
 * 历史数据迁移
 * ------------------------------------------------------------
 * ProductInfo / ProjectWorkflow 在迭代中加过 themeColors、
 * illustrationElements、生产信息 7 个字段、conceptImages、autoGenPending 等。
 * 老用户浏览器（IndexedDB / 云端项目）里存的是加字段之前的 JSON，
 * 这些键**根本不存在**，渲染层一句 `info.themeColors.includes(...)`
 * 就抛 TypeError，把整棵 React 树打崩 → 整页白屏且刷新无效。
 *
 * 以前在用到的地方各自写兜底，漏一个就白屏一次。这里改成「载入即补全」：
 * 以当前默认结构为底板逐键回填，缺键 / null / 类型不符一律取默认值。
 * 以后新增字段只要写进 emptyProductInfo()，历史数据自动兼容。
 *
 * 独立成文件（不 import React）的原因：纯函数便于在 Node 里直接跑测试。
 * ============================================================ */
import { createEmptyBrief } from './engine/brief';
import {
  createInitialWorkflow,
  emptyProductInfo,
  type ProductInfo,
  type Project,
  type ProjectWorkflow,
  type ReferenceImage,
} from './types';

export function migrateProductInfo(raw: unknown): ProductInfo {
  const base = emptyProductInfo();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof ProductInfo)[]) {
    const v = src[key as string];
    if (v === undefined || v === null) continue;
    const def = base[key];
    if (Array.isArray(def) && !Array.isArray(v)) continue;
    if (!Array.isArray(def) && typeof def === 'object' && typeof v !== 'object') continue;
    if (typeof def !== 'object' && typeof v !== typeof def) continue;
    (base as unknown as Record<string, unknown>)[key as string] = v;
  }
  return base;
}

export function migrateWorkflow(raw: unknown): ProjectWorkflow | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Partial<ProjectWorkflow>;
  const base = createInitialWorkflow(src.updatedAt || src.createdAt || Date.now());
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    ...base,
    ...src,
    version: 1,
    stage: src.stage || base.stage,
    mode: src.mode || base.mode,
    productInfo: migrateProductInfo(src.productInfo),
    referenceImages: arr<ReferenceImage>(src.referenceImages),
    concepts: arr<ProjectWorkflow['concepts'][number]>(src.concepts),
    conceptImages: arr<ProjectWorkflow['conceptImages'][number]>(src.conceptImages),
    tasks: arr<ProjectWorkflow['tasks'][number]>(src.tasks),
    analysis: src.analysis ?? null,
    selectedConceptId: src.selectedConceptId ?? null,
    selectedConceptImageId: src.selectedConceptImageId ?? null,
    autoGenPending: src.autoGenPending === true,
    createdAt: src.createdAt || base.createdAt,
    updatedAt: src.updatedAt || base.updatedAt,
  };
}

/** 单个项目迁移：没有 workflow 的老项目原样返回 */
export function migrateProject(p: Project): Project {
  if (!p || typeof p !== 'object') return p;
  /* 项目骨架也在这里补齐：云端可能存在早期版本写上去、字段不全的行
     （没有 brief / brief.size），工作台渲染 `p.brief.size.l` 会直接 TypeError，
     整页打崩成「这个页面没能显示出来」。缺什么补什么，比各处写 p.brief?.size 更彻底。 */
  const base = createEmptyBrief();
  const brief = (p.brief && typeof p.brief === 'object')
    ? { ...base, ...p.brief, size: { ...base.size, ...(p.brief as { size?: object }).size } }
    : base;
  const safe: Project = {
    ...p,
    name: typeof p.name === 'string' && p.name.trim() ? p.name : '未命名包装项目',
    brief,
    createdAt: Number(p.createdAt) || Date.now(),
    updatedAt: Number(p.updatedAt) || Date.now(),
    status: p.status || 'draft',
  };
  if (!p.workflow) return safe;
  const workflow = migrateWorkflow(p.workflow);
  return workflow ? { ...safe, workflow } : safe;
}
