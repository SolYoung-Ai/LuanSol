/* ============================================================
   Studio 2.0 — 工作台三栏外壳
   ------------------------------------------------------------
   需求采集与编辑器共用同一条顶栏和同一套三栏骨架：
     左：目录 / 图层 / 素材   中：内容   右：Luna AI
   差别只在中间那块：采集阶段是无缝页面，编辑器阶段是画布。
   ============================================================ */
import React from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';
import { Icon } from '../components/icons';

export type MobileView = 'left' | 'canvas' | 'ai';

export interface FrameProps {
  backTo: string;
  backLabel: string;
  title: React.ReactNode;
  save?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: { id: string; label: string }[];
  tab?: string;
  onTab?: (id: string) => void;
  left: React.ReactNode;
  leftFoot?: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
  view: MobileView;
  onView: (v: MobileView) => void;
  panelLabel: string;
  /** flow = 采集（中间无纸无边距），design = 画布 */
  mode?: 'flow' | 'design';
}

export function Frame(p: FrameProps) {
  const { t } = useLang();
  return <div className={`st-ed st-ed-v-${p.view} ${p.mode === 'design' ? 'st-ed-mode-design' : 'st-ed-mode-flow'}`}>
    <header className="st-ed-top">
      <div className="st-ed-top-l">
        <button className="st-ed-back" onClick={() => go(p.backTo)} aria-label={p.backLabel}>
          <Icon name="chevronLeft" size={16} />
          <span>{p.backLabel}</span>
        </button>
        <div className="st-ed-brand">Luna<i>Sol</i><em>{t('包装工作台', 'Workbench')}</em></div>
      </div>

      <div className="st-ed-top-c">
        <div className="st-ed-name">{p.title}</div>
        {p.save}
      </div>

      <div className="st-ed-top-r">{p.actions}</div>
    </header>

    <div className="st-ed-switch" role="tablist" aria-label={t('视图', 'View')}>
      <button className={p.view === 'left' ? 'on' : ''} onClick={() => p.onView('left')} role="tab">{p.panelLabel}</button>
      <button className={p.view === 'canvas' ? 'on' : ''} onClick={() => p.onView('canvas')} role="tab">
        {p.mode === 'design' ? t('画布', 'Canvas') : t('内容', 'Brief')}
      </button>
      <button className={p.view === 'ai' ? 'on' : ''} onClick={() => p.onView('ai')} role="tab">Luna AI</button>
    </div>

    <div className="st-ed-body">
      <aside className="st-ed-left">
        {!!p.tabs?.length && <div className="st-ed-tabs" role="tablist">
          {p.tabs.map((x) => <button
            key={x.id}
            role="tab"
            aria-selected={p.tab === x.id}
            className={p.tab === x.id ? 'on' : ''}
            onClick={() => p.onTab?.(x.id)}
          >{x.label}</button>)}
        </div>}
        <div className="st-ed-pane">{p.left}</div>
        {p.leftFoot && <div className="st-ed-left-foot">{p.leftFoot}</div>}
      </aside>

      <main className="st-ed-canvas">{p.center}</main>

      <aside className="st-ed-right">{p.right}</aside>
    </div>
  </div>;
}

export function Booting({ text }: { text: string }) {
  return <div className="st-ed-boot">
    <span className="st-spin" aria-hidden />
    {text}
  </div>;
}
