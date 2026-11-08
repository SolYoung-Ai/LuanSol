/* ============================================================
 * 积分 / 充值页（2026-11 改版）
 * ------------------------------------------------------------
 * 积分制：聊天免费、Seedream Flash 6/张、Pro 10/张
 *  - 新注册送 100 积分；包月 ¥299 = 3000 积分/月
 *  - 充值包：¥99=1000 / ¥199=2100 / ¥299=3500（支付未开放，先做卡片）
 *  - 底部：兑换码兑换入口
 *  - 不展示成本/毛利等内部经营数据
 * ============================================================ */
import React, { useState, useEffect } from 'react';
import { Button, Card, Notice, PageHead, SectionLabel, Tag, go } from '../ui';
import { useApp } from '../store';
import { useAuth } from '../cloud/auth';
import { useSubscription, CreditLog } from '../cloud/subscription';
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
  const { setToast } = useApp();
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  // 获取积分记录
  useEffect(() => {
    if (!a.user) return;
    setLogsLoading(true);
    sub.getCreditLogs(30).then((logs) => {
      setCreditLogs(logs);
      setLogsLoading(false);
    });
  }, [a.user, sub.usedLeft]);

  // 签到状态：从数据库读取（已登录用户）
  const today = new Date().toISOString().slice(0, 10);
  const { checkedToday, streak: checkinStreak, loading: checkinLoading } = sub.checkinState;

  const doCheckin = async () => {
    if (checkedToday || checkinLoading) return;
    if (!a.user) {
      setToast('请先登录再签到，积分会绑定到你的账号');
      go('/');
      return;
    }
    const r = await sub.doCheckin();
    setToast(r.message);
  };

  const left = sub.usedLeft;
  const pro = sub.isPro;

  const redeem = async () => {
    const code = redeemCode.trim().toUpperCase();
    if (!code || redeeming) return;
    setRedeeming(true); setRedeemMsg(null);
    const r = await sub.redeemCode(code);
    setRedeemMsg({ ok: r.ok, text: r.message });
    setRedeeming(false);
    if (r.ok) setRedeemCode('');
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

    {/* 限时活动 · 每日签到 */}
    <div style={{
      background: 'linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)',
      border: '1px solid #f0d060', borderRadius: 12, padding: '20px 24px',
      marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontSize: 12, color: '#a07020', letterSpacing: 1, marginBottom: 6 }}>限时活动 · LIMITED TIME</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>每日签到送积分，连续 10 天再加码</div>
        <div style={{ color: '#6b5520', fontSize: 14, lineHeight: 1.6 }}>
          每天签到 <Coin size={14} />10 积分，可叠加；每连续签到满 10 天，额外送 <Coin size={14} />100 积分。<strong>会员每天签到双倍（20 积分）</strong>，月签到最多 600 积分。
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: '#8a6d30' }}>
          已连续签到 <strong>{checkinStreak}</strong> 天
        </div>
      </div>
      <button
        className="v4-btn-dark"
        disabled={checkedToday}
        onClick={doCheckin}
        style={{ whiteSpace: 'nowrap', opacity: checkedToday ? 0.5 : 1 }}
      >
        {checkedToday ? '今日已签到 ✓' : !a.user ? '登录后签到' : '立即签到 +10'}
      </button>
    </div>

    {/* 当前积分余额 */}
    <Card className="pad-card sub-status-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <SectionLabel en={lang === 'en' ? '' : 'BALANCE'}>{t('我的积分', 'My credits')}</SectionLabel>
        {a.user && (
          <button
            onClick={() => { setLogsOpen(!logsOpen); if (!logsOpen) { setLogsLoading(true); sub.getCreditLogs(30).then((logs) => { setCreditLogs(logs); setLogsLoading(false); }); } }}
            style={{ fontSize: 12, color: '#0284c7', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {logsOpen ? '收起明细' : '明细'}
          </button>
        )}
      </div>
      {!a.user
        ? <Notice tone="warn">{t('登录后查看积分余额。', 'Sign in to view your credit balance.')}</Notice>
        : <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '12px 0' }}>
            <Coin size={36} />
            <strong style={{ fontSize: 40, lineHeight: 1 }}>{left ?? '…'}</strong>
            <span style={{ color: '#888' }}>{t('积分可用', 'credits available')}</span>
          </div>
          <div className="quota-bar"><span style={{ width: `${left == null ? 0 : Math.min(100, (left / Math.max(1, pro ? PRICING.proMonthlyQuota : PRICING.freeTrialUses)) * 100)}%` }} /></div>
          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Tag tone="green">{pro ? t(`会员 · ¥${PRICING.proMonthlyPriceRMB}/月`, `Member · ¥${PRICING.proMonthlyPriceRMB}/mo`) : t('免费版', 'Free')}</Tag>
            {pro && sub.sub?.period_end && <Tag>{t('有效期至', 'Valid until')} {new Date(sub.sub.period_end).toLocaleDateString()}</Tag>}
          </div>

          {/* 积分明细（展开） */}
          {logsOpen && (
            <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 16 }}>
              {logsLoading ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 14 }}>加载中...</div>
              ) : creditLogs.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 14 }}>暂无积分记录</div>
              ) : (
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {creditLogs.map((log) => {
                    const isConsume = log.change_type === 'consume';
                    return (
                    <div key={log.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 0', borderBottom: '1px solid #f5f5f5',
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{log.reason}</div>
                        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                          {new Date(log.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{
                        fontSize: 14, fontWeight: 600,
                        color: isConsume ? '#ef4444' : '#22c55e',
                      }}>
                        {isConsume ? '-' : '+'}{log.amount}
                      </div>
                    </div>
                  );})}
                </div>
              )}
            </div>
          )}
        </>}
    </Card>

    {/* 积分怎么花 */}
    <Card className="pad-card">
      <SectionLabel en={lang === 'en' ? '' : 'RATES'}>{t('积分单价', 'Credit rates')}</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <div style={{ padding: 14, background: 'var(--v4-ios-fill)', border: '1px solid var(--v4-glass-border)', borderRadius: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('对话', 'Chat')}</div>
          <div style={{ color: '#171717', fontSize: 15, fontWeight: 600 }}>{t('免费', 'Free')}</div>
          <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>DeepSeek / Kimi / Doubao-Seed / GLM</div>
        </div>
        <div style={{ padding: 14, background: 'var(--v4-ios-fill)', border: '1px solid var(--v4-glass-border)', borderRadius: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('图像 · Flash', 'Image · Flash')}</div>
          <div style={{ color: '#171717', fontSize: 15, fontWeight: 600 }}><Coin size={14} />{PRICING.costs.imageFlash} {t('/张', '/img')}</div>
          <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>Seedream 5.0 Flash · 快速出图</div>
        </div>
        <div style={{ padding: 14, background: 'var(--v4-glass-bg-strong)', border: '1px solid var(--v4-glass-border)', borderRadius: 10, boxShadow: 'var(--v4-glass-shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontWeight: 600 }}>{t('图像 · Pro', 'Image · Pro')}</span>
            <Tag tone="green">{t('精细', 'Pro')}</Tag>
          </div>
          <div style={{ color: '#171717', fontSize: 15, fontWeight: 600 }}><Coin size={14} />{PRICING.costs.imagePro} {t('/张', '/img')}</div>
          <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>Seedream 5.0 Pro · 高细节，仅比 Flash 多 4 积分</div>
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
        <div className="plan-name">{t('会员 · 每月特权', 'Member · Monthly')}</div>
        <div className="plan-price">¥{PRICING.proMonthlyPriceRMB}<span>/{t('月', 'mo')}</span></div>
        <ul className="plan-feats">
          <li><Coin size={14} />{t('每日签到双倍（20 积分/天，月签到最多 600）', 'Double daily check-in (20 credits/day, up to 600/mo)')}</li>
          <li>{t('全部对话模型解锁（DeepSeek / Kimi / Doubao-Seed / GLM）', 'All chat models unlocked')}</li>
          <li>{t('云端同步 + 历史版本', 'Cloud sync & version history')}</li>
          <li>{t('全部导出与印前能力（PDF / SVG / ZIP）', 'All export & prepress')}</li>
          <li>{t('优先客服响应', 'Priority support')}</li>
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
          <div key={p.price} style={{ padding: 16, background: 'var(--v4-ios-fill)', border: '1px solid var(--v4-glass-border)', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#999' }}>{p.tag}</div>
            <div style={{ fontSize: 28, fontWeight: 700, margin: '8px 0' }}>¥{p.price}</div>
            <div style={{ color: '#666' }}><Coin size={16} />{p.points}</div>
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
      <p style={{ color: '#999', fontSize: 12, marginBottom: 12 }}>
        内测测试码：LS-100（100 积分）、LS-200（200 积分）、LS-500（500 积分）
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
