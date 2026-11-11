/* ============================================================
 * 创作入口（工作台 Step 01）—— 与首页共用同一套卡片
 * ------------------------------------------------------------
 *  A. 我有参考图 / 设计方向 → 进入「确认需求」，按参考图落地
 *  B. 我没有，从零开始     → 进入「确认需求」，AI 帮你构思
 * 两条路径都落到同一个确认需求页，区别只在初始 mode 与提示文案，
 * 不制造「选了没反应」的死路。项目在点击时真实创建。
 * ============================================================ */
import React from 'react';
import { useLang } from '../i18n';
import { EntryCards, useEntryPick } from './EntryCards';

export default function CreationEntry() {
  const { t } = useLang();
  const { busy, pick } = useEntryPick();

  return (
    <div className="wf-page">
      <div className="wf-head">
        <div className="wf-kicker">{t('STEP 01 · 创作入口', 'STEP 01 · Start')}</div>
        <h1 className="wf-title">{t('开始创造你的包装', 'Create your packaging')}</h1>
        <p className="wf-sub">
          {t('先告诉我你手上有什么 —— 有方向，还是从零开始？',
            'First, tell me what you already have — a direction, or nothing at all?')}
        </p>
      </div>

      <EntryCards busy={busy} onPick={pick} />

      <p className="wf-foot-note">
        {t('不确定选哪个？先选「从零开始」，在下一步补充产品信息即可。',
          'Not sure? Pick “Start from nothing” — you can add product details on the next step.')}
      </p>
    </div>
  );
}
