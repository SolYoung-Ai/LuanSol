import React from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';
import MarketingFooter from '../components/MarketingFooter';

/** 关于页：一屏话说清楚，不写品牌故事、不堆口号。 */
export default function About() {
  const { t } = useLang();
  return <div className="mk">
    <div className="mk-wrap">
      <section className="mk-about">
        <p className="mk-eyebrow">ABOUT</p>
        <h1>{t('LunaSol 是一个专注于 AI 包装设计的创意工作室。',
          'LunaSol is a creative studio focused on AI packaging design.')}</h1>
        <p className="mk-about-lead">
          {t('我们希望降低包装设计的专业门槛——让每一个有想法的人，都能把创意转化为真正的产品包装，而不是停留在草图和想象里。',
            'We want to lower the barrier to packaging design, so anyone with an idea can turn it into real packaging instead of stopping at a sketch.')}
        </p>
        <div className="mk-about-grid">
          <div>
            <h4>{t('我们在做什么', 'What we do')}</h4>
            <p>{t('把需求理解、创意生成、元素拆解、可编辑设计与刀版输出连成一条完整的链路。',
              'We connect brief understanding, concept generation, decomposition, editable design and dieline output into one flow.')}</p>
          </div>
          <div>
            <h4>{t('为谁做', 'Who it is for')}</h4>
            <p>{t('没有设计团队的个人创业者、小商家和产品开发者——预算有限，但对包装有要求。',
              'Independent founders, small brands and product makers without a design team — limited budget, real standards.')}</p>
          </div>
          <div>
            <h4>{t('我们相信', 'What we believe')}</h4>
            <p>{t('专业的事交给系统，选择留给人。工具应该让人更敢开始，而不是先学会工具。',
              'Let the system do the professional work and leave the choices to people. Tools should help you start, not require study.')}</p>
          </div>
        </div>
      </section>

      <section className="mk-final">
        <h2>{t('有想法，就来试试。', 'Got an idea? Try it.')}</h2>
        <button className="mk-btn mk-btn--primary" onClick={() => go('/new?fresh=1')}>
          {t('开始设计', 'Start designing')} <span aria-hidden>→</span>
        </button>
      </section>
    </div>
    <MarketingFooter />
  </div>;
}
