/* ============================================================
   首页（2.0）
   ------------------------------------------------------------
   三屏 + 收尾：
     1. 主标题 + 唯一橙色主按钮 + 右侧作品台（几何包装，无位图）
     2. 「每一个好产品，都值得拥有好包装」四类包装
     3. 「从想法到成品，只需要三个步骤」01/02/03
     4. 收尾 CTA
   规则：整页只有两个动作——开始设计（→ /studio）与看 Product。
   不写「九大功能」「百万用户」这类自证式文案。
   ============================================================ */
import React from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';
import { PRICING } from '../cloud/plans';
import PackArt from '../site/PackArt';

function Arrow() {
  return <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
    <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

const CATS: { zh: string; en: string; kind: Parameters<typeof PackArt>[0]['kind']; tint?: string }[] = [
  { zh: '茶叶', en: 'Tea', kind: 'tin' },
  { zh: '食品', en: 'Food', kind: 'pouch', tint: '#FDF8F0' },
  { zh: '美妆', en: 'Beauty', kind: 'jar', tint: '#FFFCF7' },
  { zh: '饮品', en: 'Drinks', kind: 'can', tint: '#F7F2E9' },
];

export default function SiteHome() {
  const { t } = useLang();
  const start = () => go('/studio');

  return <div className="site-page">
    {/* ---------------- 首屏 ---------------- */}
    <section className="site-hero">
      <div className="site-wrap site-hero-in">
        <div className="site-hero-copy">
          <span className="site-eyebrow">AI Packaging Design Studio</span>
          <h1 className="site-h1">{t('好包装，', 'Great packaging ')}<br />{t('从一个想法开始。', 'starts with an idea.')}</h1>
          <p className="site-en">Your Idea. Your Packaging.</p>
          <p className="site-lead">
            {t('无需设计经验，让 AI 帮你完成从产品创意到包装设计的全过程。',
              'No design experience needed — AI takes you from a product idea to a finished packaging design.')}
          </p>
          <div className="site-hero-cta">
            <button className="site-btn" onClick={start}>
              {t('开始吧！设计师', 'Start designing')}<Arrow />
            </button>
          </div>
          <p className="site-hero-note">
            {t(`注册即送 ${PRICING.freeTrialUses} 积分 · 无需信用卡`, `${PRICING.freeTrialUses} credits on sign-up · no card required`)}
          </p>
        </div>

        <div className="site-stage">
          <div className="site-stage-inner">
            <div className="site-stage-grid" aria-hidden />
            <div className="site-stage-packs">
              <PackArt kind="tin" height={150} tint="#FEFAF3" />
              <PackArt kind="carton" height={286} />
              <PackArt kind="can" height={170} />
            </div>
            <div className="site-stage-cap">
              <span>Concept 01</span>
              <b>{t('茶叶 · 食品 · 饮品', 'Tea · Food · Drinks')}</b>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* ---------------- 第二屏：品类 ---------------- */}
    <section className="site-sec">
      <div className="site-wrap">
        <div className="site-sec-head">
          <h2 className="site-h2">{t('每一个好产品，', 'Every good product ')}<br />{t('都值得拥有好包装。', 'deserves good packaging.')}</h2>
          <p>{t('从一罐茶到一瓶饮料，包装是产品最先被看见的那一面。同一个系统，覆盖不同材质与结构。',
            'From a tin of tea to a bottle of drink — packaging is the first thing people see. One system, many materials and structures.')}</p>
        </div>

        <div className="site-cats">
          {CATS.map((c) => <div className="site-cat" key={c.zh}>
            <div className="site-cat-art">
              <PackArt kind={c.kind} height={214} tint={c.tint} />
            </div>
            <div className="site-cat-meta">
              <div>
                <div className="site-cat-name">{t(c.zh, c.en)}</div>
                <span className="site-cat-en">{c.en}</span>
              </div>
              <span className="site-cat-dot" aria-hidden />
            </div>
          </div>)}
        </div>
      </div>
    </section>

    {/* ---------------- 第三屏：三步 ---------------- */}
    <section className="site-sec">
      <div className="site-wrap">
        <div className="site-sec-head">
          <h2 className="site-h2">{t('从想法到成品，', 'From idea to finished, ')}<br />{t('只需要三个步骤。', 'in three steps.')}</h2>
        </div>

        <div className="site-steps">
          <div className="site-step">
            <span className="site-step-n">01</span>
            <h3 className="site-h3">{t('告诉我们你的产品。', 'Tell us about your product.')}</h3>
            <p>{t('一句话描述产品、口味与受众，或直接贴一段文案。不需要 Brief，不需要设计术语。',
              'One sentence about the product, flavour and audience — or paste your copy. No brief, no design jargon.')}</p>
          </div>
          <div className="site-step">
            <span className="site-step-n">02</span>
            <h3 className="site-h3">{t('AI 创造包装方向。', 'AI creates the directions.')}</h3>
            <p>{t('一次给出多套版式、结构与配色方向，可反复重来，直到某一版对味。',
              'Several layout, structure and colour directions at once. Rerun as often as you like until one feels right.')}</p>
          </div>
          <div className="site-step">
            <span className="site-step-n">03</span>
            <h3 className="site-h3">{t('编辑并完成设计。', 'Edit and finish it.')}</h3>
            <p>{t('在画布上改文字、换素材、调结构，最后导出可印刷的刀版与效果图。',
              'Edit type, swap imagery, adjust structure — then export print-ready dielines and visuals.')}</p>
          </div>
        </div>
      </div>
    </section>

    {/* ---------------- 收尾 ---------------- */}
    <section className="site-cta">
      <div className="site-wrap">
        <h2>{t('现在，开始创造你的包装。', 'Now, go make your packaging.')}</h2>
        <button className="site-btn" onClick={start}>
          {t('开始吧！设计师', 'Start designing')}<Arrow />
        </button>
        <p>{t('免费注册 · 送 ' + PRICING.freeTrialUses + ' 积分 · 只为真正出图付费', `Free to join · ${PRICING.freeTrialUses} credits included · pay only when you generate`)}</p>
      </div>
    </section>
  </div>;
}
