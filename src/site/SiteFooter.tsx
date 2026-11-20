/* ============================================================
   公开站点页脚
   ------------------------------------------------------------
   旧站在 2.0 之前没有页脚（都塞进帮助页）。品牌站点需要一个安静
   的收尾，同时支付通道审核要求条款 / 隐私 / 价格能从公开页直接点到。
   法务链接必须是真实静态地址（./terms/ 之类），不能改成 #/terms——
   审核会直接请求那个路径。
   右侧那组「积分价格 / 帮助与反馈 / 邮箱」已按要求撤掉：
   页脚只留字标与一行版权 + 法务链接，价格与帮助在账户菜单里。
   ============================================================ */
import React from 'react';
import { useLang } from '../i18n';

export default function SiteFooter() {
  const { t } = useLang();
  return <footer className="site-foot">
    <div className="site-wrap">
      <div className="site-foot-in">
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
    </div>
  </footer>;
}
