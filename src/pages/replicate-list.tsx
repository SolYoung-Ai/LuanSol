/* ============================================================
 * 复刻设计 · 记录（/replicate）
 * ------------------------------------------------------------
 * 这是与「包装设计」并列的另一个草稿箱：复刻是能中途停下来的活，
 * 没有记录页就只能一次做完，实际用起来做不了。
 *
 * 与包装设计的区别（刻意如此）：
 *   · 数据在 store 的 replicates 一列，不复用 Project；
 *   · 封面取第一张结果图，没有结果时取第一张素材/参考图；
 *   · 动作只有「继续复刻 / 复制 / 重命名 / 删除」，不做状态与结构分类——
 *     复刻的进度没有「设计中 / 已印前」这种阶段，硬塞只会多出一堆空筛选。
 * ============================================================ */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, go } from '../ui';
import { useApp, visibleReplicas } from '../store';
import { useLang } from '../i18n';
import { Icon } from '../components/icons';
import WorkMenu from '../components/WorkMenu';
import { kindById, kindName } from '../replicate/kinds';
import type { ReplicateProject } from '../types';
import '../replicate.css';

type FilterId = 'all' | 'done' | 'draft';
type SortId = 'updated' | 'created' | 'name';

const FILTERS: { id: FilterId; zh: string; en: string }[] = [
  { id: 'all', zh: '全部', en: 'All' },
  { id: 'done', zh: '已出图', en: 'Generated' },
  { id: 'draft', zh: '未出图', en: 'Not generated' },
];
const SORTS: { id: SortId; zh: string; en: string }[] = [
  { id: 'updated', zh: '最近编辑', en: 'Recently edited' },
  { id: 'created', zh: '最近创建', en: 'Recently created' },
  { id: 'name', zh: '名称排序', en: 'By name' },
];

const fmt = (ts: number, tr: (zh: string, en: string) => string) => {
  const d = new Date(ts);
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return tr('刚刚', 'just now');
  if (diff < 3600) return tr(`${Math.floor(diff / 60)} 分钟前`, `${Math.floor(diff / 60)} min ago`);
  if (diff < 86400) return tr(`${Math.floor(diff / 3600)} 小时前`, `${Math.floor(diff / 3600)} h ago`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function ReplicateList() {
  const { s, deleteReplicate, renameReplicate, duplicateReplicate } = useApp();
  const { lang, t } = useLang();

  const [filter, setFilter] = useState<FilterId>('all');
  const [sort, setSort] = useState<SortId>('updated');
  const [q, setQ] = useState('');
  const [confirmDel, setConfirmDel] = useState<ReplicateProject | null>(null);
  const [renaming, setRenaming] = useState<ReplicateProject | null>(null);
  const [renameTo, setRenameTo] = useState('');

  /* 所有复刻草稿（只保留真的传过图 / 出过图的） */
  const all = useMemo(() => visibleReplicas(s.replicates), [s.replicates]);

  /* 这一页唯一能去的地方就是复刻工作区：挂上就把那块 chunk 取回来。
     否则第一次点「新建复刻」时还要现拉 JS，中间会闪一整屏加载字标，
     看起来就是「点了一下没反应，然后突然跳过去」。 */
  useEffect(() => { void import('./replicate'); }, []);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const filtered = all.filter((r) => {
      const done = r.items.length > 0;
      if (filter === 'done' && !done) return false;
      if (filter === 'draft' && done) return false;
      if (!kw) return true;
      const k = kindById(r.kind);
      return `${r.name} ${k ? `${k.name.zh} ${k.name.en}` : ''} ${r.extra}`.toLowerCase().includes(kw);
    });
    return [...filtered].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name, lang === 'en' ? 'en' : 'zh-CN')
        : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt);
  }, [all, filter, sort, q, lang]);

  const open = (r: ReplicateProject) => go(`/replicate/edit?id=${r.id}`);

  const doRename = () => {
    if (!renaming) return;
    const name = renameTo.trim();
    if (name) renameReplicate(renaming.id, name);
    setRenaming(null);
  };

  const empty = all.length === 0;

  return <div className="v4-page">
    <div className="v4-page-head">
      <div>
        <div className="v4-kicker">RECREATE</div>
        <h1 className="v4-h1">{t('记录', 'Records')}</h1>
        <p className="v4-sub">{t('复刻设计的所有记录都在这里；没做完的那条也存着，随时接着做。', 'Every recreation lives here — including the ones you have not finished yet.')}</p>
      </div>
      <div className="v4-tools" style={{ display: 'flex', gap: 10 }}>
        {/* 模型库：参考图已经备好，用户只要上传自己的素材——比从零传两张图快得多 */}
        <button className="v4-btn-line" onClick={() => go('/replicate/models')}>{t('浏览模型', 'Browse models')}</button>
        <button className="v4-btn-dark" onClick={() => go('/replicate/new')}>{t('新建复刻', 'New recreation')}</button>
      </div>
    </div>

    {/* 存档位置说清楚：复刻草稿在本机浏览器，不进包装设计的云端项目表 */}
    <div className="v4-toolbar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
      <div className="v4-sec-note">
        {t('记录保存在此设备（含图片）；单条的输入图与结果都会原样保留。',
          'Records live in this browser, images included — every input and take is kept.')}
      </div>
    </div>

    {!empty && <>
      <div className="v4-toolbar">
        <div className="v4-filters">
          {FILTERS.map((f) => <button key={f.id} className={`v4-filter ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
            {lang === 'en' ? f.en : f.zh}
            <span style={{ marginLeft: 6, color: 'var(--v4-ink-3)', fontSize: 11 }}>
              {all.filter((r) => f.id === 'all' ? true : f.id === 'done' ? r.items.length > 0 : r.items.length === 0).length}
            </span>
          </button>)}
        </div>
        <div className="v4-tools">
          <input className="v4-search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('搜索名称、类型、提示词', 'Search name, format or prompt')} />
          <select className="v4-select" value={sort} onChange={(e) => setSort(e.target.value as SortId)}>
            {SORTS.map((x) => <option key={x.id} value={x.id}>{lang === 'en' ? x.en : x.zh}</option>)}
          </select>
        </div>
      </div>

      <div className="v4-grid">
        {list.map((r) => {
          const k = kindById(r.kind);
          const cover = r.items[0]?.src || r.mats[0]?.src || r.refs[0]?.src;
          return <div className="v4-work" key={r.id}>
            <button className="v4-work-cover" onClick={() => open(r)}>
              {cover
                ? <img className="rep-cover" src={cover} alt="" />
                : <div className="v4-work-blank"><strong>LUNASOL</strong><span>{t('还没有出图', 'No images yet')}</span></div>}
              <span className="v4-work-status">{k ? kindName(k, lang) : t('复刻', 'Recreate')}</span>
              {r.items.length > 0 && <span className="rep-work-n">{r.items.length}</span>}
            </button>
            <div className="v4-work-body">
              <button className="v4-work-name" onClick={() => open(r)} style={{ textAlign: 'left' }}>{r.name}</button>
              <div className="v4-work-meta">
                <span>{r.refs.length + r.mats.length} {t('张输入图', 'inputs')}</span>
                <span>{r.ratio}</span>
                <span>{fmt(r.updatedAt, t)}</span>
              </div>
              <div className="v4-work-foot">
                {/* 封面上已经写了类型，这里换成「出没出图」——
                    同一个词写两遍等于浪费一行位置 */}
                <span className="v4-work-pill">{r.items.length
                  ? t(`${r.items.length} 张结果`, `${r.items.length} takes`)
                  : t('未出图', 'No takes yet')}</span>
                <WorkMenu
                  label={t('更多操作', 'More actions')}
                  items={[
                    { label: r.items.length ? t('继续复刻', 'Keep recreating') : t('继续设置', 'Keep setting up'), onClick: () => open(r) },
                    { label: t('复制一份', 'Duplicate'), onClick: () => duplicateReplicate(r.id) },
                    { label: t('重命名', 'Rename'), onClick: () => { setRenaming(r); setRenameTo(r.name); } },
                    { label: t('删除', 'Delete'), onClick: () => setConfirmDel(r), danger: true },
                  ]}
                />
              </div>
            </div>
          </div>;
        })}

        {list.length === 0 && <div className="v4-empty" style={{ gridColumn: '1 / -1' }}>
          <h3>{t('这个筛选下没有记录', 'Nothing under this filter')}</h3>
          <p>{t('换一个筛选，或清空搜索词。', 'Try another filter, or clear the search.')}</p>
        </div>}
      </div>
    </>}

    {empty && <div className="v4-empty">
      <div className="v4-empty-mark" aria-hidden>
        <Icon name="copy" size={26} />
      </div>
      <h3>{t('这里还没有记录', 'No records yet')}</h3>
      <p>{t('上传参考图和自己的素材图，选好类型，一次给你三张。', 'Add a reference and your own assets, pick a format, and get three takes.')}</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="v4-btn-line" onClick={() => go('/replicate/models')}>{t('先看模型库', 'Browse models')}</button>
        <button className="v4-btn-dark" onClick={() => go('/replicate/new')}>{t('从零开始', 'Start from scratch')}</button>
      </div>
    </div>}

    <Modal open={!!confirmDel} title={t('删除这条记录？', 'Delete this record?')} onClose={() => setConfirmDel(null)}>
      <p className="modal-p">{t(
        `「${confirmDel?.name}」会连同上传的图和已生成的方案一起删掉，此操作无法撤销。`,
        `“${confirmDel?.name}” will be deleted along with its uploaded images and generated takes. This cannot be undone.`,
      )}</p>
      <div className="modal-buttons">
        <button className="v4-btn-line" onClick={() => setConfirmDel(null)}>{t('取消', 'Cancel')}</button>
        <button className="v4-btn-dark" onClick={() => { if (confirmDel) deleteReplicate(confirmDel.id); setConfirmDel(null); }}>
          {t('确认删除', 'Delete')}
        </button>
      </div>
    </Modal>

    <Modal open={!!renaming} title={t('重命名记录', 'Rename record')} onClose={() => setRenaming(null)}>
      <input className="v4-search" style={{ width: '100%' }} value={renameTo} onChange={(e) => setRenameTo(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') doRename(); }} autoFocus placeholder={t('名称', 'Name')} />
      <div className="modal-buttons">
        <button className="v4-btn-line" onClick={() => setRenaming(null)}>{t('取消', 'Cancel')}</button>
        <button className="v4-btn-dark" onClick={doRename}>{t('保存', 'Save')}</button>
      </div>
    </Modal>
  </div>;
}
