/* ============================================================
 * 工作台（WORKSPACE）
 * ------------------------------------------------------------
 * 不是文件管理器，是「你的包装作品集」：所有草稿、设计中、已完成都在这里。
 * 数据来源：IndexedDB（未登录可用）＋ CloudBase 云同步（登录后合并，见 useCloudSync）。
 * 状态口径：draft=草稿，designing=设计中，checked/exported=已完成（已过印前 / 已导出）。
 * 封面只用真实设计稿渲染；没有设计稿时给统一的空白占位，不用随机图片凑数。
 * 能力：状态筛选 + 包装结构分类 + 搜索排序 + 批量管理（全选 / 批量删除，本地与云端同步）。
 * ============================================================ */
import React, { useMemo, useState } from 'react';
import { Empty, Modal, go, useHash } from '../ui';
import { useApp } from '../store';
import { useAuth } from '../cloud/auth';
import { useCloudSync } from '../cloud/useCloudSync';
import { DesignView } from '../components/visuals';
import { STRUCTURES } from '../engine/structure';
import { Icon } from '../components/icons';
import type { Project } from '../types';

type FilterId = 'all' | 'draft' | 'designing' | 'done';
type SortId = 'updated' | 'created' | 'name';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: '全部作品' },
  { id: 'draft', label: '草稿' },
  { id: 'designing', label: '设计中' },
  { id: 'done', label: '已完成' },
];
const SORTS: { id: SortId; label: string }[] = [
  { id: 'updated', label: '最近编辑' },
  { id: 'created', label: '最近创建' },
  { id: 'name', label: '名称排序' },
];

// 包装结构大类（盒类 / 袋类 / 标签类 …），由结构库的 group 字段自动汇总
const STRUCT_GROUPS = Array.from(new Set(STRUCTURES.map((s) => s.group)));
const groupOf = (p: Project) => STRUCTURES.find((s) => s.id === p.structure)?.group || '';

const STRUCT_NAME = (p: Project) => STRUCTURES.find((s) => s.id === p.structure)?.name || p.structure;
const statusLabel = (p: Project) => (p.status === 'draft' ? '草稿' : p.status === 'designing' ? '设计中' : '已完成');
const matchFilter = (p: Project, f: FilterId) =>
  f === 'all' ? true : f === 'done' ? (p.status === 'checked' || p.status === 'exported') : p.status === f;
const fmt = (t: number) => {
  const d = new Date(t); const now = Date.now();
  const diff = (now - t) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 复选框外观（线性风格，选中用深实底，不用整页橙）
const checkBoxStyle = (checked: boolean, right?: boolean): React.CSSProperties => ({
  position: 'absolute', top: 10, ...(right ? { right: 10 } : { left: 10 }), zIndex: 2,
  width: 22, height: 22,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: checked ? 'var(--v4-solid-bg)' : 'rgba(255,255,255,0.92)',
  border: `1px solid ${checked ? 'var(--v4-solid-bg)' : 'var(--v4-line-strong)'}`,
  color: 'var(--v4-solid-fg)',
});

export default function Workspace() {
  const { s, update, loadProject, deleteProject, duplicateProject } = useApp();
  const auth = useAuth();
  const sync = useCloudSync();
  const hash = useHash();
  const tab = new URLSearchParams(hash.split('?')[1] || '').get('tab');

  const [filter, setFilter] = useState<FilterId>('all');
  const [sort, setSort] = useState<SortId>('updated');
  const [q, setQ] = useState('');
  const [structGroup, setStructGroup] = useState<string>('all');
  const [confirmDel, setConfirmDel] = useState<Project | null>(null);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [renameTo, setRenameTo] = useState('');

  // 批量管理
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBatchDel, setConfirmBatchDel] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const filtered = s.projects.filter((p) => matchFilter(p, filter)
      && (structGroup === 'all' || groupOf(p) === structGroup)
      && (!kw || `${p.name} ${STRUCT_NAME(p)} ${p.brief.product} ${p.brief.brand}`.toLowerCase().includes(kw)));
    const sorted = [...filtered].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt);
    return sorted;
  }, [s.projects, filter, sort, q, structGroup]);

  const open = (p: Project) => {
    loadProject(p.id);
    // 新 AI 流程项目回到 /new 流程（按 workflow.stage 恢复到对应阶段）；旧手动项目进独立编辑器
    if (p.workflow) go('/new');
    else go(`/studio?id=${p.id}`);
  };
  const viewSchemes = (p: Project) => open(p);
  const preview3d = (p: Project) => open(p);

  const doRename = () => {
    if (!renaming) return;
    const name = renameTo.trim();
    if (name) update({ projects: s.projects.map((p) => p.id === renaming.id ? { ...p, name, updatedAt: Date.now() } : p) });
    setRenaming(null);
  };

  const doDelete = () => {
    if (!confirmDel) return;
    deleteProject(confirmDel.id);
    if (auth.user) void sync.removeOne(confirmDel.id);
    setConfirmDel(null);
  };

  /* ---------- 批量管理 ---------- */
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const visibleIds = list.map((p) => p.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const enterBatch = () => { setBatchMode(true); setSelectedIds(new Set()); };
  const exitBatch = () => { setBatchMode(false); setSelectedIds(new Set()); };

  const doBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBatchDeleting(true);
    try {
      // 先删云端（此时本地项目仍在、id 有效），再删本地，避免本地删除与自动同步竞态
      if (auth.user) await sync.removeMany(ids);
      // 本地逐个删除（函数式更新，连续调用安全）
      ids.forEach((id) => deleteProject(id));
      setConfirmBatchDel(false);
      setBatchMode(false);
      setSelectedIds(new Set());
    } finally {
      setBatchDeleting(false);
    }
  };

  const empty = s.projects.length === 0;

  return <div className="v4-page">
    <div className="v4-page-head">
      <div>
        <div className="v4-kicker">WORKSPACE</div>
        <h1 className="v4-h1">工作台</h1>
        <p className="v4-sub">你的每一个想法，都在这里留下作品。</p>
      </div>
      <div className="v4-tools">
        <button className="v4-btn-dark" onClick={() => go('/new')}>新建设计</button>
      </div>
    </div>

    {/* 云同步：登录后在这里集中操作（同步状态 / 立即双向同步 / 取回云端项目） */}
    <div className="v4-toolbar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
      <div className="v4-sec-note">
        {auth.user
          ? <>已登录 <strong>{auth.user.label}</strong> · {sync.state === 'ok'
              ? `已同步 ${sync.cloudCount ?? '—'} 个云端项目${sync.lastSync ? ` · 最近 ${new Date(sync.lastSync).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}`
              : sync.message || '待同步'}</>
          : '未登录 · 作品仅保存在此设备浏览器；登录后可云端同步、多端取回'}
      </div>
      {auth.user && <div style={{ display: 'flex', gap: 8 }}>
        <button className="v4-btn-line" onClick={() => void sync.downloadAll()}>取回云端项目</button>
        <button className="v4-btn-line" onClick={() => void sync.syncNow()}>{sync.state === 'syncing' ? '同步中…' : '立即双向同步'}</button>
      </div>}
    </div>

    {!empty && <>
      <div className="v4-toolbar">
        <div className="v4-filters">
          {FILTERS.map((f) => <button key={f.id} className={`v4-filter ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
            <span style={{ marginLeft: 6, color: 'var(--v4-ink-3)', fontSize: 11 }}>
              {s.projects.filter((p) => matchFilter(p, f.id)).length}
            </span>
          </button>)}
          {tab === 'favorites' && <span className="v4-tag" style={{ marginLeft: 8 }}>收藏视图</span>}
        </div>
        <div className="v4-tools">
          <select className="v4-select" value={structGroup} onChange={(e) => setStructGroup(e.target.value)} title="按包装结构分类">
            <option value="all">全部结构</option>
            {STRUCT_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <input className="v4-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索项目名称、结构、品牌" />
          <select className="v4-select" value={sort} onChange={(e) => setSort(e.target.value as SortId)}>
            {SORTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          {!batchMode && <button className="v4-btn-line" onClick={enterBatch} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Icon name="check" size={15} /> 批量管理
          </button>}
        </div>
      </div>

      {/* 批量操作条 */}
      {batchMode && <div className="v4-batch-bar" style={{
        display: 'flex', alignItems: 'center', gap: 16,
        background: 'var(--v4-surface)', border: '1px solid var(--v4-line)', padding: '12px 16px',
      }}>
        <button onClick={toggleSelectAll} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}>
          <span style={{
            width: 18, height: 18, flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--v4-r-sm)',
            background: allVisibleSelected ? 'var(--v4-solid-bg)' : 'transparent',
            border: `1.5px solid ${allVisibleSelected ? 'var(--v4-solid-bg)' : 'var(--v4-line-strong)'}`,
            color: 'var(--v4-solid-fg)',
            transition: 'all var(--v4-dur-fast) var(--v4-ease)',
          }}>
            {allVisibleSelected && <Icon name="check" size={12} strokeWidth={2.6} />}
          </span>
          <span style={{ fontSize: 13 }}>{allVisibleSelected ? '取消全选' : '全选'}</span>
        </button>
        <span style={{ fontSize: 13, color: 'var(--v4-ink-2)' }}>已选 {selectedIds.size} 项</span>
        <div style={{ flex: 1 }} />
        <button className="v4-btn-line" onClick={exitBatch}>完成</button>
        <button
          className="v4-btn-dark"
          disabled={selectedIds.size === 0 || batchDeleting}
          onClick={() => setConfirmBatchDel(true)}
          style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: selectedIds.size === 0 ? 0.5 : 1, background: selectedIds.size ? '#a33' : undefined }}
        >
          <Icon name="trash" size={15} /> {batchDeleting ? '删除中…' : '批量删除'}
        </button>
      </div>}

      <div className="v4-grid">
        {list.map((p) => {
          const checked = selectedIds.has(p.id);
          const onCover = () => (batchMode ? toggleSelect(p.id) : open(p));
          return <div className="v4-work" key={p.id} style={checked ? { outline: '1px solid var(--v4-solid-bg)', outlineOffset: 4 } : undefined}>
            <button className="v4-work-cover" onClick={onCover}>
              {p.design && p.design.faces.front
                ? <DesignView face={p.design.faces.front} />
                : <div className="v4-work-blank"><strong>LUNASOL</strong><span>{p.brief.product || '未命名产品'}</span></div>}
              {!batchMode && <span className="v4-work-status">{statusLabel(p)}</span>}
              {batchMode && <span style={checkBoxStyle(checked, true)}>
                {checked && <Icon name="check" size={13} strokeWidth={2.4} />}
              </span>}
            </button>
            <div className="v4-work-body">
              <button className="v4-work-name" onClick={onCover} style={{ textAlign: 'left' }}>{p.name}</button>
              <div className="v4-work-meta">
                <span>{STRUCT_NAME(p)}</span>
                <span>{p.brief.size.l}×{p.brief.size.w}{p.brief.size.h ? `×${p.brief.size.h}` : ''}mm</span>
                <span>{fmt(p.updatedAt)}</span>
              </div>
              {!batchMode && <div className="v4-work-actions">
                <button onClick={() => open(p)}>{p.design ? '继续编辑' : '继续填写'}</button>
                {p.design && <button onClick={() => viewSchemes(p)}>查看方案</button>}
                {p.design && <button onClick={() => preview3d(p)}>3D 预览</button>}
                {p.design && <button onClick={() => open(p)}>导出</button>}
                <button onClick={() => duplicateProject(p.id)}>复制</button>
                <button onClick={() => { setRenaming(p); setRenameTo(p.name); }}>重命名</button>
                <button className="danger" onClick={() => setConfirmDel(p)}>删除</button>
              </div>}
            </div>
          </div>;
        })}

        {list.length === 0 && <div className="v4-empty" style={{ gridColumn: '1 / -1' }}>
          <h3>这个筛选下没有作品</h3>
          <p>换一个状态或结构分类，或清空搜索词。</p>
        </div>}
      </div>
    </>}

    {empty && <div className="v4-empty">
      <div className="v4-empty-mark" aria-hidden>
        <svg viewBox="0 0 32 32" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M16 4.5 27 10v12L16 27.5 5 22V10L16 4.5Z" />
          <path d="M5 10l11 5.5L27 10" />
          <path d="M16 15.5v12" />
        </svg>
      </div>
      <h3>这里还没有作品</h3>
      <p>从一个想法开始，创建你的第一个包装。</p>
      <button className="v4-btn-dark" onClick={() => go('/new')}>开始设计</button>
    </div>}

    {/* 单个删除确认 */}
    <Modal open={!!confirmDel} title="删除这个项目？" onClose={() => setConfirmDel(null)}>
      <p className="modal-p">「{confirmDel?.name}」将从本机{confirmDel && auth.user ? '（并同步删除云端副本）' : ''}移除，此操作无法撤销。</p>
      <div className="modal-buttons">
        <button className="v4-btn-line" onClick={() => setConfirmDel(null)}>取消</button>
        <button className="v4-btn-dark" onClick={doDelete}>确认删除</button>
      </div>
    </Modal>

    {/* 批量删除确认 */}
    <Modal open={confirmBatchDel} title={`批量删除 ${selectedIds.size} 个项目？`} onClose={() => setConfirmBatchDel(false)}>
      <p className="modal-p">选中的 {selectedIds.size} 个项目将从本机{auth.user ? '（并同步删除云端副本）' : ''}移除，此操作无法撤销。</p>
      <div className="modal-buttons">
        <button className="v4-btn-line" onClick={() => setConfirmBatchDel(false)}>取消</button>
        <button className="v4-btn-dark" onClick={doBatchDelete}>{batchDeleting ? '删除中…' : '确认删除'}</button>
      </div>
    </Modal>

    <Modal open={!!renaming} title="重命名项目" onClose={() => setRenaming(null)}>
      <input className="v4-search" style={{ width: '100%' }} value={renameTo} onChange={(e) => setRenameTo(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') doRename(); }} autoFocus placeholder="项目名称" />
      <div className="modal-buttons">
        <button className="v4-btn-line" onClick={() => setRenaming(null)}>取消</button>
        <button className="v4-btn-dark" onClick={doRename}>保存</button>
      </div>
    </Modal>

  </div>;
}
