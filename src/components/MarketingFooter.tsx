import React from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';

/** 营销页统一页脚：只保留品牌一句话 + 三个站内入口 + 法务与联系方式。 */
export default function MarketingFooter() {
  const { t } = useLang();
  return <footer className="mk-foot">
    <div className="mk-wrap">
      <div className="mk-foot-top">
        <div className="mk-foot-brand">
          <div className="mk-foot-logo">Luna<em>Sol</em></div>
          <p className="mk-foot-desc">
            {t('AI 包装设计工作室。让每一个有想法的人，都能把创意变成真正的产品包装。',
              'An AI packaging design studio, helping anyone turn an idea into real product packaging.')}
          </p>
        </div>
        <div className="mk-foot-cols">
          <div className="mk-foot-col">
            <span>{t('站点', 'SITE')}</span>
            <a href="#/" onClick={(e) => { e.preventDefault(); go('/'); }}>{t('首页', 'Home')}</a>
            <a href="#/product" onClick={(e) => { e.preventDefault(); go('/product'); }}>{t('产品', 'Product')}</a>
            <a href="#/about" onClick={(e) => { e.preventDefault(); go('/about'); }}>{t('关于', 'About')}</a>
          </div>
          <div className="mk-foot-col">
            <span>{t('条款', 'LEGAL')}</span>
            <a href="./terms/">{t('用户协议', 'Terms')}</a>
            <a href="./privacy/">{t('隐私政策', 'Privacy')}</a>
            <a href="./aup/">{t('可接受使用', 'Acceptable use')}</a>
          </div>
          <div className="mk-foot-col">
            <span>{t('联系', 'CONTACT')}</span>
            <a href="./contact/">{t('联系我们', 'Contact')}</a>
            <a href="mailto:hello@lunasol.studio">hello@lunasol.studio</a>
          </div>
        </div>
      </div>
      <div className="mk-foot-bottom">
        <span>© {new Date().getFullYear()} LunaSol Studio</span>
        <span>{t('案例图由 AI 生成，仅作风格示例', 'Case images are AI-generated style samples')}</span>
      </div>
    </div>
  </footer>;
}
