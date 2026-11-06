/* ============================================================
 * 积分 / 充值页（2026-11 改版）
 * ------------------------------------------------------------
 *  - 积分制：聊天 1/轮、Seedream Flash 4/张、Lite 7/张、Pro 10/张
 *  - 新注册送 100 积分；包月 ¥299 = 3000 积分/月
 *  - 充值包：¥99=1000 / ¥199=2100 / ¥299=3500（支付未开放，先做卡片）
 *  - 底部：兑换码兑换入口
 *  - 不展示成本/毛利等内部经营数据
 * ============================================================ */
import React, { useState } from 'react';
import { Button, Card, Notice, PageHead, SectionLabel, Tag, go } from '../ui';
import { useAuth } from '../cloud/auth';
import { useSubscription } from '../cloud/subscription';
import { PRICING } from '../cloud/plans';
import { useLang } from '../i18n';

/** LS 硬币图标（内联 SVG） */
const Coin = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ verticalAlign: '-3px', marginRight: 4 }}>
    <circle cx="12" cy="12" r="11" fill="#f5c451" stroke="#d4a027" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="8" fill="none" stroke="#d4a027" strokeWidth="1" strokeDasharray="1.5 1.5" />
    <text x="12" y="15.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#7a5a10" fontFamily="Arial">LS</text>
  </svg>
);

export default function Subscribe() {
  const a = useAuth();
  const sub = useSubscription();
  const { lang, t } = useLang();
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const left = sub.usedLeft ?? PRICING.freeTrialUses;
  const pro = sub.isPro;

  const redeem = async () => {
    const code = redeemCode.trim().toUpperCase();
    if (!code || redeeming) return;
    setRedeeming(true); setRedeemMsg(null);
    // TODO: 接云函数 /redeem 路由校验兑换码并加积分
    // 当前先做前端 UI，后端待云函数加 NoSQL 路由
    setTimeout(() => {
      setRedeeming(false);
      setRedeemMsg({ ok: false, text: '兑换码系统正在接入，请稍后再试' });
    }, 600);
  };

  return <div className="page subscribe-page">
    <PageHead
      kicker="CREDITS"
      title={t('积分与充值', 'Credits & Recharge')}
      desc={t(
        '聊天和生图都消耗积分。新用户注册送 100 积分，用完后充值或订阅会员。',
        'Chat and image generation spend credits. New signups get 100 free credits.'
      )}
    />

    {/* 当前积分余额 */}
    <Card className="pad-card sub-status-card">
      <SectionLabel en={lang === 'en' ? '' : 'BALANCE'}>{t('我的积分', 'My credits')}</SectionLabel>
      {!a.user
        ? <Notice tone="warn">{t('登录后查看积分余额。', 'Sign in to view your credit balance.')}</Notice>
        : <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '12px 0' }}>
            <Coin size={36} />
            <strong style={{ fontSize: 40, lineHeight: 1 }}>{left}</strong>
            <span style={{ color: '#888' }}>{t('积分可用', 'credits available')}</span>
          </div>
          <div className="quota-bar"><span style={{ width: `${Math.min(100, (left / Math.max(1, pro ? PRICING.proMonthlyQuota : PRICING.freeTrialUses)) * 100)}%` }} /></div>
          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Tag tone="green">{pro ? t(`会员 · ¥${PRICING.proMonthlyPriceRMB}/月`, `Member · ¥${PRICING.proMonthlyPriceRMB}/mo`) : t('免费版', 'Free')}</Tag>
            {pro && sub.sub?.period_end && <Tag>{t('有效期至', 'Valid until')} {new Date(sub.sub.period_end).toLocaleDateString()}</Tag>}
          </div>
        </>}
    </Card>

    {/* 积分怎么花 */}
    <Card className="pad-card">
      <SectionLabel en={lang === 'en' ? '' : 'RATES'}>{t('积分单价', 'Credit rates')}</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <div style={{ padding: 12, background: '#fafafa', borderRadius: 8 }}>
          <div style={{ fontWeight: 600 }}>{t('对话', 'Chat')}</div>
          <div style={{ color: '#666', fontSize: 13 }}><Coin size={14} />≈{PRICING.costs.chat} {t('/轮', '/round')}</div>
          <div style={{ color: '#999', fontSize: 12 }}>DeepSeek / Kimi / Doubao-Seed</div>
        </div>
        <div style={{ padding: 12, background: '#fafafa', borderRadius: 8 }}>
          <div style={{ fontWeight: 600 }}>{t('图像 · Flash', 'Image · Flash')}</div>
          <div style={{ color: '#666', fontSize: 13 }}><Coin size={14} />≈{PRICING.costs.imageFlash} {t('/张', '/img')}</div>
          <div style={{ color: '#999', fontSize: 12 }}>Seedream 5.0 Flash</div>
        </div>
        <div style={{ padding: 12, background: '#fafafa', borderRadius: 8 }}>
          <div style={{ fontWeight: 600 }}>{t('图像 · Lite', 'Image · Lite')}</div>
          <div style={{ color: '#666', fontSize: 13 }}><Coin size={14} />≈{PRICING.costs.imageLite} {t('/张', '/img')}</div>
          <div style={{ color: '#999', fontSize: 12 }}>Seedream 5.0 Lite</div>
        </div>
        <div style={{ padding: 12, background: '#fafafa', borderRadius: 8 }}>
          <div style={{ fontWeight: 600 }}>{t('图像 · Pro', 'Image · Pro')}</div>
          <div style={{ color: '#666', fontSize: 13 }}><Coin size={14} />≈{PRICING.costs.imagePro} {t('/张', '/img')}</div>
          <div style={{ color: '#999', fontSize: 12 }}>Seedream 5.0 Pro</div>
        </div>
      </div>
      <p style={{ color: '#999', fontSize: 12, marginTop: 12 }}>
        {t('实际消耗以模型调用为准；不同文本/图像模型成本略有差异，按上限扣减。', 'Actual usage depends on the model; rates are approximate upper bounds.')}
      </p>
    </Card>

    {/* 会员包月 */}
    <div className="plan-grid">
      <Card className="pad-card plan-card">
        <div className="plan-name">{t('免费版', 'Free')}</div>
        <div className="plan-price">¥0</div>
        <ul className="plan-feats">
          <li><Coin size={14} />{PRICING.freeTrialUses} {t('积分（注册即送）', 'credits, granted at signup')}</li>
          <li>{t('内置设计引擎', 'Built-in design engine')}</li>
          <li>{t('本机保存项目', 'Local projects')}</li>
        </ul>
      </Card>

      <Card className="pad-card plan-card plan-card-pro">
        <div className="plan-badge">{t('推荐', 'Recommended')}</div>
        <div className="plan-name">{t('会员', 'Member')}</div>
        <div className="plan-price">¥{PRICING.proMonthlyPriceRMB}<span>/{t('月', 'mo')}</span></div>
        <ul className="plan-feats">
          <li><Coin size={14} />{PRICING.proMonthlyQuota} {t('积分/月', 'credits/month')}</li>
          <li>{t('DeepSeek 对话 + Seedream 生图', 'DeepSeek chat + Seedream images')}</li>
          <li>{t('云端同步', 'Cloud sync')}</li>
          <li>{t('全部导出与印前能力', 'All export & prepress')}</li>
        </ul>
        {pro
          ? <Button variant="outline" onClick={() => go('/account')}>{t('已是会员', 'Current plan')}</Button>
          : <Button variant="accent" disabled>{t('即将开放', 'Coming soon')}</Button>}
      </Card>
    </div>

    {/* 充值包 */}
    <Card className="pad-card">
      <SectionLabel en={lang === 'en' ? '' : 'TOP-UP'}>{t('充值积分包', 'Top-up packs')}</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {PRICING.recharge.map((p) => (
          <div key={p.price} style={{ padding: 16, border: '2px solid #eee', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#999' }}>{p.tag}</div>
            <div style={{ fontSize: 28, fontWeight: 700, margin: '8px 0' }}>¥{p.price}</div>
            <div style={{ color: '#666' }}><Coin size={16} />{p.points}</div>
            <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>≈ {Math.round(p.points / (p.price / 100))} {t('积分/元', 'credits/yuan')}</div>
            <Button variant="outline" size="sm" disabled style={{ marginTop: 10 }}>{t('即将开放', 'Coming soon')}</Button>
          </div>
        ))}
      </div>
      <p style={{ color: '#999', fontSize: 12, marginTop: 12 }}>
        {t('支付系统接入中，充值包将以实际支付回调为准。', 'Checkout is not live yet; top-up will be confirmed by payment callback.')}
      </p>
    </Card>

    {/* 兑换码 */}
    <Card className="pad-card">
      <SectionLabel en={lang === 'en' ? '' : 'REDEEM'}>{t('兑换码', 'Redeem code')}</SectionLabel>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 12 }}>
        {t('如果你有兑换码（线下活动、邀请奖励等），在此输入兑换积分。', 'Have a code from an event or invite? Enter it here.')}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="luna-input"
          value={redeemCode}
          onChange={(e) => setRedeemCode(e.target.value)}
          placeholder={t('输入兑换码，如 LS-XXXX', 'Enter code, e.g. LS-XXXX')}
          style={{ flex: 1 }}
        />
        <Button variant="accent" disabled={!redeemCode.trim() || redeeming} onClick={() => void redeem()}>
          {redeeming ? t('兑换中…', 'Redeeming…') : t('兑换', 'Redeem')}
        </Button>
      </div>
      {redeemMsg && (
        <div style={{ marginTop: 12 }}><Notice tone={redeemMsg.ok ? 'success' : 'warn'}>{redeemMsg.text}</Notice></div>
      )}
    </Card>
  </div>;
}
