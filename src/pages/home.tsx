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
import { PRICING } from '../cloud/plans';

export default function Home() {
  const { s, update, newProject } = useApp();
  const { t } = useLang();
  const [confirmNew, setConfirmNew] = useState(false);

  /** 创建一个全新的真实项目（重置工程状态），再进入统一编辑器 */
  const beginFresh = () => {
    setConfirmNew(false);
    newProject();
    go('/studio');
  };

  /** 开始设计：进入 AI 原生新建设计流程（未登录由路由层要求登录）。
   *  fresh=1 表示从零开一份新草稿，不接着上一次没做完的草稿；
   *  未完成的草稿仍在工作台的「草稿」筛选里。 */
  const startWizard = () => {
    go('/new?fresh=1');
  };

  return <div className="v4-home">
    <div className="v4-home-mark" role="img" aria-label="LunaSol">
      <span className="hm-letter">L</span><span className="hm-letter">u</span><span className="hm-letter">n</span><span className="hm-letter">a</span><span className="hm-letter" style={{ color: '#e8783a' }}>S</span><span className="hm-letter" style={{ color: '#e8783a' }}>o</span><span className="hm-letter" style={{ color: '#e8783a' }}>l</span>
    </div>
    <div className="v4-home-sub">{t('人人都能成为设计师', 'Everyone can be a designer')}</div>
    {/* 一句话说明「这里是做什么的」：支付通道审核要求从公开页能看懂卖的是什么 */}
    <p className="v4-home-desc">
      {t(
        '输入一句需求，AI 生成可印刷的包装刀模与视觉稿。',
        'Describe what you need — AI generates print-ready packaging dielines and artwork.'
      )}
    </p>

    <div className="v4-home-cta">
      <button className="v4-start" onClick={startWizard}>
        {t('开始设计', 'Start designing')}
        <span className="v4-start-arrow" aria-hidden>→</span>
      </button>
    </div>

    {/* 价格必须在登录前就能看到：支付通道审核明确要求公开页展示积分价格。
        直接指向静态页 /pricing/，不用 hash 路由。
        数字一律从 PRICING 读——写死一个价格在这里，改价时必然漏掉首屏。 */}
    <a className="v4-home-price" href="./pricing/">
      {t(
        `无月费 · ${PRICING.creditsPacks[0].points} 积分 US$${PRICING.creditsPacks[0].priceUSD} · 注册送 ${PRICING.freeTrialUses} 积分`,
        `No monthly fee · ${PRICING.creditsPacks[0].points} credits US$${PRICING.creditsPacks[0].priceUSD} · ${PRICING.freeTrialUses} free credits on sign-up`
      )}
    </a>

    <Modal open={confirmNew} title={t('你有一份未完成的草稿', 'You have a draft in progress')} onClose={() => setConfirmNew(false)}>
      <p className="modal-p">{t(
        `当前草稿已完成 ${stepProgress(s.draft)} / ${WIZARD_STEPS.length} 步。点击「重新开始」会清空这份草稿并新建一个空项目，此操作无法撤销。`,
        `This draft is ${stepProgress(s.draft)} of ${WIZARD_STEPS.length} steps in. Starting over clears it and creates an empty project — this cannot be undone.`
      )}</p>
      <div className="modal-buttons">
        <button className="v4-btn-line" onClick={() => { setConfirmNew(false); go('/studio'); }}>{t('继续编辑草稿', 'Keep editing')}</button>
        <button className="v4-btn-dark" onClick={beginFresh}>{t('重新开始', 'Start over')}</button>
      </div>
    </Modal>
  </div>;
}
