/* ============================================================
 * 站点页脚（只出现在帮助与反馈页的最后一屏）
 * ------------------------------------------------------------
 * 以前它是每个页面正文卡底下的一条白条：滚到底才看到，卡内滚动时
 * 还会和卡片圆角、点阵底打架，用户明确说「滑下来看到这个很不好看」。
 * 现在从全站壳体里撤掉，内容整块挪到帮助页末尾，做成一张普通的内容卡——
 * 需要找条款、价格、联系我们的人，本来就会先来帮助页。
 *
 * 两点不能删：
 *  1) 法务与价格必须是**真实静态地址**（./terms/ 这类），不能是 #/terms
 *     这种 hash 路由——支付通道审核会直接请求路径，hash 在他们眼里不存在。
 *  2) 法务页目前只有中文版，英文界面下直接链过去，不做半截翻译。
 * ============================================================ */
import React from 'react';
import { Logo, go } from '../ui';
import { useLang } from '../i18n';
import { PRICING } from '../cloud/plans';

export default function SiteFooter() {
  const { t } = useLang();

  const site: { label: string; path: string }[] = [
    { label: t('开始设计', 'Start designing'), path: '/start' },
    { label: t('包装设计', 'Packaging'), path: '/workspace' },
    { label: t('复刻设计', 'Recreate'), path: '/replicate' },
    { label: t('模版库', 'Templates'), path: '/replicate/templates' },
    { label: t('积分说明', 'Credits'), path: '/credits' },
  ];

  const legal: { label: string; href: string }[] = [
    { label: t('价格', 'Pricing'), href: './pricing/' },
    { label: t('服务条款', 'Terms'), href: './terms/' },
    { label: t('隐私说明', 'Privacy'), href: './privacy/' },
    { label: t('使用规范', 'Acceptable use'), href: './aup/' },
    { label: t('联系我们', 'Contact'), href: './contact/' },
  ];

  return <section className="gl-card sf-card" aria-label={t('站点信息', 'Site information')}>
    <div className="sf-head">
      <div className="sf-brand"><Logo compact /><span>AI PACKAGING DESIGN STUDIO</span></div>
      <span className="sf-copy">© 2026 LunaSol · {t('从想法，到一件作品', 'From an idea to a finished piece')}</span>
    </div>

    <div className="sf-cols">
      <div className="sf-col">
        <h4>{t('站内', 'In the studio')}</h4>
        {site.map((l) => <button key={l.path} className="sf-link" onClick={() => go(l.path)}>{l.label}</button>)}
      </div>
      <div className="sf-col">
        <h4>{t('价格与条款', 'Pricing & terms')}</h4>
        {legal.map((l) => <a key={l.href} className="sf-link" href={l.href}>{l.label}</a>)}
      </div>
      <div className="sf-col">
        <h4>{t('联系', 'Contact')}</h4>
        <a className="sf-link" href={`mailto:${PRICING.supportEmail}`}>{PRICING.supportEmail}</a>
        <span className="sf-note">{t('工作日内回复 · 时区 UTC+8', 'Replies on business days · UTC+8')}</span>
      </div>
    </div>

    <p className="sf-legalnote">
      {t('付款由 Creem 处理并作为记录商户；一次性购买，不会自动续费。法务页面为中文，英文版正在补。',
        'Payments are processed by Creem as merchant of record; one-time purchase, never auto-renewed. Legal pages are in Chinese for now.')}
    </p>
  </section>;
}
