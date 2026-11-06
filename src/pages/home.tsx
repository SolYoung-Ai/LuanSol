/* ============================================================
 * 首页（开始）
 * ------------------------------------------------------------
 * V4 规则：首页只回答一个问题——「这里是做包装设计的，从这里开始」。
 * 因此只保留：品牌标识 + 一个「开始设计」入口。
 * 不展示功能清单、不展示统计数字、不堆多个 CTA、不放九步说明。
 * 唯一保留的交互是「已有草稿时先确认」——这是防止用户误点丢数据的必要保护。
 * ============================================================ */
import React, { useState } from 'react';
import { Modal, go } from '../ui';
import { useApp } from '../store';
import { createEmptyBrief } from '../engine/brief';
import { createEmptyDraft } from '../v3/draft';
import { WIZARD_STEPS, stepProgress } from '../v3/steps';
import { useLang } from '../i18n';

export default function Home() {
  const { s, update } = useApp();
  const { t } = useLang();
  const [confirmNew, setConfirmNew] = useState(false);

  /** 从首页进入新的九步向导；第一步由用户在向导内选择形态 */
  const beginFresh = () => {
    setConfirmNew(false);
    update({ draft: createEmptyDraft(), brief: createEmptyBrief(), chat: [], schemes: [], design: null, report: null, activeId: null });
    go('/luna');
  };

  /** 已有进度的草稿会被清空，属于不可撤销操作：先确认，别让用户误点丢数据 */
  const startWizard = () => {
    if (stepProgress(s.draft) > 0) { setConfirmNew(true); return; }
    beginFresh();
  };

  return <div className="v4-home">
    <div className="v4-home-mark" role="img" aria-label="LunaSol">
      <span className="hm-letter">L</span><span className="hm-letter">u</span><span className="hm-letter">n</span><span className="hm-letter">a</span><span className="hm-letter" style={{ color: '#e8783a' }}>S</span><span className="hm-letter" style={{ color: '#e8783a' }}>o</span><span className="hm-letter" style={{ color: '#e8783a' }}>l</span>
    </div>
    <div className="v4-home-sub">AI PACKAGING DESIGN STUDIO</div>

    <div className="v4-home-cta">
      <button className="v4-start" onClick={startWizard}>
        {t('开始设计', 'Start designing')}
        <span className="v4-start-arrow" aria-hidden>→</span>
      </button>
    </div>

    <Modal open={confirmNew} title={t('你有一份未完成的草稿', 'You have a draft in progress')} onClose={() => setConfirmNew(false)}>
      <p className="modal-p">{t(
        `当前草稿已完成 ${stepProgress(s.draft)} / ${WIZARD_STEPS.length} 步。点击「重新开始」会清空这份草稿并新建一个空项目，此操作无法撤销。`,
        `This draft is ${stepProgress(s.draft)} of ${WIZARD_STEPS.length} steps in. Starting over clears it and creates an empty project — this cannot be undone.`
      )}</p>
      <div className="modal-buttons">
        <button className="v4-btn-line" onClick={() => { setConfirmNew(false); go('/wizard'); }}>{t('继续编辑草稿', 'Keep editing')}</button>
        <button className="v4-btn-dark" onClick={beginFresh}>{t('重新开始', 'Start over')}</button>
      </div>
    </Modal>
  </div>;
}
