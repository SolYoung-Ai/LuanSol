/* ============================================================
   About 页
   ------------------------------------------------------------
   只讲一句主张 + 三条判断。不写品牌编年史，不写「我们的使命是……」。
   版式上靠一句大字领起，下面三列小字，最后一句收束。
   ============================================================ */
import React from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';

export default function AboutPage() {
  const { t } = useLang();
  return <div className="site-page">
    <section className="site-about">
      <div className="site-wrap">
        <span className="site-eyebrow">About</span>
        {/* 断行是刻意的：橙色短语必须整段起一行，否则会在「专业设计 / 师」处裂开 */}
        <p className="site-about-lead">
          {t('包装设计，不该是', 'Packaging design should not be')}
          <br />
          <em>{t('专业设计师的专属能力。', 'a designers-only skill.')}</em>
        </p>
        <p className="site-lead" style={{ maxWidth: '48ch' }}>
          {t('包装本该是产品的一部分，而不是最后才想起来的一道工序。我们用 AI 把调研、方向、结构、版面这些原本需要一整个团队的步骤压缩到一个人可以完成的范围里。',
            'Packaging should be part of the product, not the last-minute chore. AI compresses the research, directions, structure and layout that used to take a whole team into something one person can finish.')}
        </p>

        <div className="site-about-grid">
          <div className="site-about-item">
            <h3 className="site-h3">{t('为没有设计经验的人做', 'Built for non-designers')}</h3>
            <p>{t('你只需要知道自己的产品是什么、卖给谁。剩下的判断，AI 给方向，你来选。',
              'You only need to know what you sell and who buys it. AI offers directions; you choose.')}</p>
          </div>
          <div className="site-about-item">
            <h3 className="site-h3">{t('面向真实生产', 'Aimed at real production')}</h3>
            <p>{t('不是好看的示意图。展开面、折线、出血与尺寸都按印刷要求给出，能直接进厂。',
              'Not a pretty mock-up. Panels, folds, bleed and dimensions follow print requirements, ready for production.')}</p>
          </div>
          <div className="site-about-item">
            <h3 className="site-h3">{t('保持简单', 'Keep it simple')}</h3>
            <p>{t('不做会员等级、不做复杂的套餐，也不把功能藏起来。只按实际出图计费。',
              'No membership tiers, no maze of plans, no hidden features. You pay for what you generate.')}</p>
          </div>
        </div>

        <p className="site-about-quote">
          {t('让每一个有产品想法的人，都能够创造属于自己的包装。',
            'So that anyone with a product idea can create packaging of their own.')}
        </p>

        <div className="site-hero-cta" style={{ marginTop: 44 }}>
          <button className="site-btn" onClick={() => go('/studio')}>
            {t('开始吧！设计师', 'Start designing')}
            <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
              <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="site-btn-ghost" onClick={() => go('/product')}>{t('看看能做什么', 'See what it does')}</button>
        </div>
      </div>
    </section>
  </div>;
}
