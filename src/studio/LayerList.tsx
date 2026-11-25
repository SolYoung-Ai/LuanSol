/* ============================================================
   Studio 2.0 阶段二 — 图层列表
   ------------------------------------------------------------
   列表顺序 = 数组顺序的倒序（最上面的图层排在前面），
   这个数组同时是 SVG 渲染顺序、刀模/3D 贴图顺序、PDF 导出顺序，
   所以「图层里看到的上下」和「导出叠放」永远是同一份数据。
   ============================================================ */
import React, { useState } from 'react';
import { useLang } from '../i18n';
import { Icon } from '../components/icons';
import type { DesignEl, StudioDesign } from './types';

interface Props {
  design: StudioDesign;
  faceKey: string;
  els: DesignEl[];           // 已按绘制顺序（底 → 顶）
  sel: string[];
  onSelect: (ids: string[]) => void;
  onPatch: (ids: string[], p: Partial<DesignEl>, key: string) => void;
  onOrder: (a: 'front' | 'back' | 'up' | 'down') => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onGroup: () => void;
  onUngroup: () => void;
}

export default function LayerList({
  design, faceKey, els, sel, onSelect, onPatch, onOrder, onDuplicate, onDelete, onGroup, onUngroup,
}: Props) {
  const { t } = useLang();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const picked = els.filter((e) => sel.includes(e.id));
  const hasGroup = picked.some((e) => e.groupId);
  const topFirst = [...els].reverse();

  const labelOf = (e: DesignEl) =>
    (e.name || (e.kind === 'text' ? (e.text || '').slice(0, 12) : e.kind === 'sticker' ? t('图片', 'Image') : t('形状', 'Shape'))).slice(0, 18);

  return <div className="st-layers">
    <div className="st-layers-head">
      <b>{t('图层', 'Layers')}</b>
      <em>{els.length}</em>
    </div>

    <div className="st-layers-body">
      {!topFirst.length && <p className="st-layers-empty">{t('这一面还没有对象。用顶部工具加文字、形状或图片。', 'No objects on this face yet.')}</p>}
      {topFirst.map((e) => {
        const active = sel.includes(e.id);
        return <div
          key={e.id}
          className={`st-layer-row ${active ? 'is-sel' : ''} ${e.visible === false ? 'is-hidden' : ''}`}
          onClick={(ev) => onSelect(ev.shiftKey ? (active ? sel.filter((id) => id !== e.id) : [...sel, e.id]) : [e.id])}
        >
          <span className="st-layer-ico">
            <Icon name={e.kind === 'text' ? 'text' : e.kind === 'sticker' ? 'image' : 'square'} size={13} />
          </span>
          {renaming === e.id
            ? <input
              className="st-layer-rename"
              autoFocus
              value={draft}
              onClick={(ev) => ev.stopPropagation()}
              onChange={(ev) => setDraft(ev.target.value.slice(0, 40))}
              onBlur={() => { onPatch([e.id], { name: draft }, 'name'); setRenaming(null); }}
              onKeyDown={(ev) => {
                ev.stopPropagation();
                if (ev.key === 'Enter') { onPatch([e.id], { name: draft }, 'name'); setRenaming(null); }
                if (ev.key === 'Escape') setRenaming(null);
              }}
            />
            : <span
              className="st-layer-name"
              title={e.name || labelOf(e)}
              onDoubleClick={(ev) => { ev.stopPropagation(); setRenaming(e.id); setDraft(e.name || labelOf(e)); }}
            >{labelOf(e)}
              {e.groupId && <i className="st-layer-tag">{t('组', 'G')}</i>}
              {e.locked && <Icon name="lock" size={10} />}
            </span>}
          <button
            className="st-layer-eye"
            title={e.visible === false ? t('显示', 'Show') : t('隐藏', 'Hide')}
            onClick={(ev) => { ev.stopPropagation(); onPatch([e.id], { visible: e.visible === false }, 'visible'); }}
          >
            <Icon name={e.visible === false ? 'eyeOff' : 'eye'} size={13} />
          </button>
          <button
            className={`st-layer-eye ${e.locked ? 'is-on' : ''}`}
            title={e.locked ? t('解锁', 'Unlock') : t('锁定', 'Lock')}
            onClick={(ev) => { ev.stopPropagation(); onPatch([e.id], { locked: !e.locked }, 'locked'); }}
          >
            <Icon name={e.locked ? 'lock' : 'unlock'} size={13} />
          </button>
        </div>;
      })}
    </div>

    <div className="st-layers-foot">
      <button disabled={!picked.length} onClick={() => onOrder('up')} title={t('上移', 'Up')}><Icon name="chevronUp" size={13} /></button>
      <button disabled={!picked.length} onClick={() => onOrder('down')} title={t('下移', 'Down')}><Icon name="chevronDown" size={13} /></button>
      <button disabled={!picked.length} onClick={() => onOrder('front')} title={t('置顶', 'Front')}><Icon name="layers" size={13} /></button>
      <button disabled={!picked.length} onClick={() => onOrder('back')} title={t('置底', 'Back')}><Icon name="layers" size={13} /></button>
      <span className="st-layers-div" />
      <button disabled={!picked.length} onClick={onDuplicate} title={t('复制', 'Duplicate')}><Icon name="copy" size={13} /></button>
      <button disabled={picked.length < 2 || hasGroup} onClick={onGroup} title={t('组合', 'Group')}><Icon name="shape" size={13} /></button>
      <button disabled={!hasGroup} onClick={onUngroup} title={t('取消组合', 'Ungroup')}><Icon name="grid" size={13} /></button>
      <button disabled={!picked.length} onClick={onDelete} className="is-danger" title={t('删除', 'Delete')}><Icon name="trash" size={13} /></button>
    </div>
    <p className="st-layers-note">{t('双击名字重命名。顺序与画布、刀模、3D、导出同步。', 'Double-click to rename. Order matches canvas, die-line, 3D and export.')}</p>
    <span hidden>{faceKey}{design.bg}</span>
  </div>;
}
