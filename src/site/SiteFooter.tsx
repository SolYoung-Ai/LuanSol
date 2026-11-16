/* ============================================================
   公开站点页脚
   ------------------------------------------------------------
   旧站在 2.0 之前没有页脚（都塞进帮助页）。品牌站点需要一个安静
   的收尾，同时支付通道审核要求条款 / 隐私 / 价格能从公开页直接点到，
   所以这里放最少的几条。法务链接必须是真实静态地址（./terms/ 之类），
   不能改成 #/terms——审核会直接请求那个路径。
   ============================================================ */
import React from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';
import { PRICING } from '../cloud/plans';
import { SiteLogo } from './SiteNav';

export default function SiteFooter() {
  const { t } = useLang();
  return <footer className="site-foot">
    <div className="site-wrap">
      <div className="site-foot-in">
        <div className="site-foot-brand">
          {/* 页脚只留字标：副标与「从一个想法……」这类小字已经去掉，
              品牌层不再自证口号，留白本身就是语气 */}
          <SiteLogo />
        </div>
        <div className="site-foot-links">
          <a href="./pricing/">{t('积分价格', 'Pricing')}</a>
          <button onClick={() => go('/help')}>{t('帮助与反馈', 'Help')}</button>
          <a href={`mailto:${PRICING.supportEmail}`}>{PRICING.supportEmail}</a>
        </div>
      </div>
      <div className="site-foot-legal">
        <span>© 2026 LunaSol</span>
        <span>
          <a href="./terms/">{t('服务条款', 'Terms')}</a>
          {' · '}
          <a href="./privacy/">{t('隐私说明', 'Privacy')}</a>
          {' · '}
          <a href="./aup/">{t('使用规范', 'Acceptable use')}</a>
        </span>
      </div>
    </div>
  </footer>;
}
