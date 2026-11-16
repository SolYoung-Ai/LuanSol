/* ============================================================
   Studio 空壳（阶段 1）
   ------------------------------------------------------------
   这个阶段只交付「路由 + 入口 + 空壳」：首页所有「开始吧！设计师」
   都指向这里，下一阶段才接启动弹窗与真正的设计流程。
   刻意不渲染旧版编辑器：旧流程的交互与新版信息架构不兼容，
   提前打开只会让用户以为 2.0 只是换了个皮。
   ============================================================ */
import React from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';

export default function StudioShell() {
  const { t } = useLang();
  return <div className="site-studio">
    <div className="site-studio-bar">
      <div className="site-crumb">
        Studio <span aria-hidden> / </span> <b>{t('新建设计', 'New design')}</b>
      </div>
      <button className="site-btn-ghost" onClick={() => go('/')}>{t('返回首页', 'Back home')}</button>
    </div>

    <div className="site-studio-canvas">
      <div className="site-stage-grid" aria-hidden />
      <div className="site-studio-inner">
        <span className="site-studio-phase">{t('阶段 1 · 空壳', 'Phase 1 · shell')}</span>
        <h1>{t('设计工作台正在搭建。', 'The studio is being built.')}</h1>
        <p>{t('这个入口已经接好，下一阶段会把启动弹窗与设计流程放进来。在那之前，这里不会打开旧版编辑器。',
          'The route is wired up. The launch dialog and design flow arrive in the next phase — until then this page will not open the legacy editor.')}</p>
        <button className="site-btn-ghost" onClick={() => go('/product')}>{t('先看看能做什么', 'See what it does')}</button>
      </div>
    </div>
  </div>;
}
