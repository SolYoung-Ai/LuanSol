import React, { useEffect, useState } from 'react';
import { Modal, go } from '../ui';
import { useApp } from '../store';
import { useAuth } from '../cloud/auth';
import { WIZARD_STEPS, stepProgress } from '../v3/steps';
import { useLang } from '../i18n';
import { PRICING } from '../cloud/plans';
import MarketingFooter from '../components/MarketingFooter';

/* 首页（V5 · 营销页）
 * ------------------------------------------------------------
 * 目标：让第一次来的人三秒内知道「这里能把产品想法变成包装」，
 * 并且只有一个主行动——开始设计。作品区承担说服力，步骤区承担解释，
 * 其余一律删掉。所有案例图明确标注为「AI 生成示例」，不冒充客户作品。
 */

type Work = {
  img: string;
  cat: string;
  name: string;
  style: string;
  desc: string;
  alt: string;
};

const WORKS: Work[] = [
  {
    img: './works/food.jpg',
    cat: 'FOOD',
    name: '野秋 · 山楂陈皮茶',
    style: '东方美学',
    desc: '纸盒结构，米白底色配一条陶土色横带，主视觉只用一枚手绘山楂。适合小批量茶饮品牌，印刷工艺简单、成本可控。',
    alt: '米白茶盒与牛皮纸袋的包装案例',
  },
  {
    img: './works/beauty.jpg',
    cat: 'BEAUTY',
    name: 'Morrow · 修护精华',
    style: '极简现代',
    desc: '磨砂玻璃瓶配米色硬盒，正面几乎不排字，靠留白和材质建立高级感。适合客单价较高的护肤线。',
    alt: '磨砂玻璃精华瓶与米色硬盒的包装案例',
  },
  {
    img: './works/beverage.jpg',
    cat: 'BEVERAGE',
    name: 'Field Notes · 气泡茶',
    style: '清新活力',
    desc: '透明瓶身 + 奶油色标签，瓶盖用低饱和鼠尾草绿呼应，冷柜里辨识度高，又不喧哗。',
    alt: '玻璃瓶与铝罐的饮品包装案例',
  },
  {
    img: './works/lifestyle.jpg',
    cat: 'LIFESTYLE',
    name: 'Lantern · 香氛蜡烛',
    style: '自然有机',
    desc: '陶罐外包一层肌理纸，方形皂盒同色系呼应，天然麻布做陈列。适合生活方式类小品牌整套开发。',
    alt: '陶罐蜡烛与方形皂盒的包装案例',
  },
  {
    img: './works/hero.jpg',
    cat: 'GIFT',
    name: 'Studio Set · 综合礼盒',
    style: '高端奢华',
    desc: '同一套视觉语言同时落在纸盒、玻璃瓶与自立袋上，形成可延展的系列感——这是包装设计里最值钱的部分。',
    alt: '纸盒、玻璃瓶与自立袋组合的礼盒案例',
  },
];

export default function Home({ onLogin }: { onLogin: () => void }) {
  const { t } = useLang();
  const { s, newProject } = useApp();
  const auth = useAuth();
  const [active, setActive] = useState<Work | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const beginFresh = () => { setConfirmNew(false); newProject(); go('/new?fresh=1'); };

  /** 主行动：未登录先登录（登录后停在原页，不丢选择），登录了就进需求收集。 */
  const startDesign = () => {
    if (!auth.user) { onLogin(); return; }
    if (stepProgress(s.draft) > 0) { setConfirmNew(true); return; }
    go('/new?fresh=1');
  };

  return <div className="mk">
    <div className="mk-wrap">
      {/* ---------- Hero ---------- */}
      <section className="mk-hero">
        <div>
          <p className="mk-eyebrow">AI Packaging Design Studio</p>
          <h1>{t('好包装，', 'Great packaging ')}<br />{t('从一个想法开始。', 'starts with an idea.')}</h1>
          <p className="mk-hero-en">Your Idea. Your Packaging.</p>
          <p className="mk-hero-sub">
            {t('无需设计经验，让 AI 帮你把产品创意变成完整包装设计。',
              'No design experience needed. Let AI turn your product idea into finished packaging.')}
          </p>
          <div className="mk-hero-cta">
            <button className="mk-btn mk-btn--primary" onClick={startDesign}>
              {t('开始吧！设计师', 'Start designing')} <span aria-hidden>→</span>
            </button>
            <a className="mk-btn mk-btn--ghost" href="#works">{t('看看我们能做什么', 'See what we can do')}</a>
          </div>
          <p className="mk-note">
            {t(`注册送 ${PRICING.freeTrialUses} 积分 · 无需信用卡 · 设计可导出印刷文件`,
              `${PRICING.freeTrialUses} free credits on sign-up · No card required · Print-ready export`)}
          </p>
        </div>
        <figure className="mk-hero-visual">
          <img src="./works/hero.jpg" alt={t('LunaSol 生成的包装设计示例', 'Packaging design example by LunaSol')} />
          <figcaption>{t('AI 生成示例 · 综合礼盒', 'AI-generated example · Studio set')}</figcaption>
        </figure>
      </section>

      {/* ---------- 作品 ---------- */}
      <section className="mk-sec" id="works">
        <div className="mk-sec-head">
          <h2>{t('每一个好产品，都值得拥有好包装。', 'Every good product deserves good packaging.')}</h2>
          <p>{t('案例与灵感展示 · AI 生成', 'CASE STUDIES & INSPIRATION · AI GENERATED')}</p>
        </div>
        <div className="mk-works">
          {WORKS.map((w) => <button key={w.name} className="mk-card" onClick={() => setActive(w)} aria-label={w.name}>
            <span className="mk-card-img"><img src={w.img} alt={w.alt} loading="lazy" /></span>
            <span className="mk-card-body">
              <span>
                <span className="mk-card-cat">{w.cat}</span>
                <span className="mk-card-name" style={{ display: 'block', marginTop: 6 }}>{w.name}</span>
              </span>
              <span className="mk-card-style">{w.style}</span>
            </span>
          </button>)}
        </div>
      </section>

      {/* ---------- 三步 ---------- */}
      <section className="mk-sec">
        <div className="mk-sec-head">
          <h2>{t('从想法，到完整包装。', 'From idea to finished packaging.')}</h2>
          <p>{t('HOW IT WORKS', 'HOW IT WORKS')}</p>
        </div>
        <div className="mk-steps">
          <div className="mk-step">
            <div className="mk-step-no">01 — TELL US</div>
            <h3>{t('告诉 AI 你的产品是什么', 'Tell AI about your product')}</h3>
            <p>{t('不用写提示词。选产品类型、包装形式、风格和颜色，几个问题就够。',
              'No prompts to write. Pick a category, a pack format, a style and colours. That is all we need.')}</p>
          </div>
          <div className="mk-step">
            <div className="mk-step-no">02 — CREATE</div>
            <h3>{t('AI 帮你探索设计方向', 'AI explores design directions')}</h3>
            <p>{t('一次生成三个真正不同的方向，不是同一张图换三种颜色。',
              'Three genuinely different directions at once — not one design recoloured three times.')}</p>
          </div>
          <div className="mk-step">
            <div className="mk-step-no">03 — MAKE IT YOURS</div>
            <h3>{t('编辑、完善并导出', 'Edit, refine and export')}</h3>
            <p>{t('文字、图片、颜色都能改，最后导出带刀版的印刷文件。',
              'Adjust text, images and colours, then export print files with dielines.')}</p>
          </div>
        </div>
      </section>

      {/* ---------- 结尾 CTA ---------- */}
      <section className="mk-final">
        <h2>{t('你的下一个好设计，现在就开始。', 'Your next good design starts now.')}</h2>
        <button className="mk-btn mk-btn--primary" onClick={startDesign}>
          {t('开始设计', 'Start designing')} <span aria-hidden>→</span>
        </button>
      </section>
    </div>

    <MarketingFooter />

    {/* 作品大图 */}
    {active && <div className="mk-lightbox" onClick={() => setActive(null)} role="dialog" aria-modal="true">
      <button className="mk-lightbox-close" onClick={() => setActive(null)} aria-label={t('关闭', 'Close')}>×</button>
      <div className="mk-lightbox-box" onClick={(e) => e.stopPropagation()}>
        <img src={active.img} alt={active.alt} />
        <div className="mk-lightbox-meta">
          <div className="mk-card-cat">{active.cat} · {active.style}</div>
          <h3 style={{ marginTop: 8 }}>{active.name}</h3>
          <p>{active.desc}</p>
        </div>
      </div>
    </div>}

    <Modal open={confirmNew} title={t('你有一份未完成的草稿', 'You have a draft in progress')}
      onClose={() => setConfirmNew(false)}>
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
