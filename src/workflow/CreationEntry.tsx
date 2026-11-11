/* ============================================================
 * 创作入口（工作台 Step 01）—— 与首页共用同一套卡片
 * ------------------------------------------------------------
 *  A. 我有参考图 / 设计方向 → 进入「确认需求」，按参考图落地
 *  B. 我没有，从零开始     → 进入「确认需求」，AI 帮你构思
 * 两条路径都落到同一个确认需求页，区别只在初始 mode 与提示文案，
 * 不制造「选了没反应」的死路。项目在点击时真实创建。
 * ============================================================ */
import React from 'react';
import { EntryCards, useEntryPick } from './EntryCards';

export default function CreationEntry() {
  const { busy, pick } = useEntryPick();

  return (
    <div className="wf-page">
      <div className="wf-head">
        <div className="wf-kicker">STEP 01 · 创作入口</div>
        <h1 className="wf-title">开始创造你的包装</h1>
        <p className="wf-sub">先告诉我你手上有什么 —— 有方向，还是从零开始？</p>
      </div>

      <EntryCards busy={busy} onPick={pick} />

      <p className="wf-foot-note">不确定选哪个？先选「从零开始」，在下一步补充产品信息即可。</p>
    </div>
  );
}
