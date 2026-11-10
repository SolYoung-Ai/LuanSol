/* ============================================================
 * 积分与充值（iOS 液态玻璃版）
 * ------------------------------------------------------------
 * 积分制：对话免费；Seedream Flash 6/张、Pro 10/张
 *  - 新注册送 PRICING.freeTrialUses 积分
 *  - 每日签到 +10（会员双倍），连续 10 天额外 +100，月上限 600
 *  - 充值包与会员：支付未开通，如实展示「即将开放」
 *  - 兑换码是当前唯一真实发放通道，保留入口
 * 视觉：与账户信息页同一套玻璃材质，靠圆角与间距分组，不画分割线。
 * 所有数字都从 PRICING 读，不在页面里写死。
 * ============================================================ */
import React, { useState, useEffect } from 'react';
import { go } from '../ui';
import { useApp } from '../store';
import { useAuth } from '../cloud/auth';
import { useSubscription, type CreditLog } from '../cloud/subscription';
import { PRICING } from '../cloud/plans';
import { useLang } from '../i18n';
import { Icon } from '../components/icons';

/** LS 硬币图标（内联 SVG） */
const Coin = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flex: 'none' }}>
    <circle cx="12" cy="12" r="11" fill="#f5c451" stroke="#d4a027" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="8" fill="none" stroke="#d4a027" strokeWidth="1" strokeDasharray="1.5 1.5" />
    <text x="12" y="15.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#7a5a10" fontFamily="Arial">LS</text>
  </svg>
);

export default function Subscribe() {
  const a = useAuth();
  const sub = useSubscription();
  const { t } = useLang();
  const { setToast } = useApp();
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    if (!a.user) return;
    setLogsLoading(true);
    void sub.getCreditLogs(30).then((logs) => {
      setCreditLogs(logs);
      setLogsLoading(false);
    });
  }, [a.user, sub.usedLeft]);

  const { checkedToday, streak: checkinStreak, loading: checkinLoading } = sub.checkinState;

  const doCheckin = async () => {
    if (checkedToday || checkinLoading) return;
    if (!a.user) {
      setToast('请先登录再签到，积分会绑定到你的账号');
      go('/account');
      return;
    }
    const r = await sub.doCheckin();
    setToast(r.message);
  };

  const toggleLogs = () => {
    const next = !logsOpen;
    setLogsOpen(next);
    if (next) {
      setLogsLoading(true);
      void sub.getCreditLogs(30).then((logs) => {
        setCreditLogs(logs);
        setLogsLoading(false);
      });
    }
  };

  const left = sub.usedLeft;
  const pro = sub.isPro;
  const cap = Math.max(1, pro ? PRICING.proMonthlyQuota : PRICING.freeTrialUses);
  const pct = left == null ? 0 : Math.min(100, (left / cap) * 100);

  const redeem = async () => {
    const code = redeemCode.trim().toUpperCase();
    if (!code || redeeming) return;
    setRedeeming(true); setRedeemMsg(null);
    const r = await sub.redeemCode(code);
    setRedeemMsg({ ok: r.ok, text: r.message });
    setRedeeming(false);
    if (r.ok) setRedeemCode('');
  };

  return <div className="gl-page">
    <header className="gl-head">
      <span className="gl-kicker">CREDITS</span>
      <h1 className="gl-title">积分与充值</h1>
      <p className="gl-sub">
        对话免费，只有生图消耗积分。新用户注册送 {PRICING.freeTrialUses} 积分，每天签到还能再加。
      </p>
    </header>

    {/* ---------- 每日签到 ---------- */}
    <section className="gl-hero">
      <div className="gl-hero-main">
        <div className="gl-hero-kicker">LIMITED TIME · 每日签到</div>
        <div className="gl-hero-title">每天签到送积分，连续 10 天再加码</div>
        <div className="gl-hero-text">
          每天签到 <strong>+10</strong> 可叠加；连续满 10 天额外 <strong>+100</strong>。
          会员双倍（<strong>+20</strong>/天），月上限 600 积分。
        </div>
        <div className="gl-hero-streak">{a.user
          ? <>已连续签到 <strong>{checkinStreak}</strong> 天</>
          : <>登录后签到，积分会记在你的账号上</>}</div>
      </div>
      <button className={`gl-btn ${checkedToday ? 'gl-btn-soft' : ''}`} disabled={checkedToday || checkinLoading} onClick={() => void doCheckin()}>
        {checkedToday ? '今日已签到' : !a.user ? '登录后签到' : `立即签到 +${pro ? 20 : 10}`}
        {checkedToday && <Icon name="check" size={14} />}
      </button>
    </section>

    {/* ---------- 余额 ---------- */}
    <section className="gl-card">
      <div className="gl-label">
        {t('我的积分', 'My credits')} <em>BALANCE</em>
        {a.user && <button className="gl-inline-link" style={{ marginLeft: 'auto' }} onClick={toggleLogs}>
          {logsOpen ? '收起明细' : '查看明细'}
        </button>}
      </div>

      {!a.user ? <div className="gl-empty">
        {t('登录后查看积分余额。', 'Sign in to view your credit balance.')}
        <div style={{ marginTop: 12 }}><button className="gl-btn gl-btn-sm" onClick={() => go('/account')}>去登录</button></div>
      </div> : <>
        <div className="gl-balance">
          <Coin size={34} />
          <span className="gl-balance-num">{left ?? '…'}</span>
          <span className="gl-balance-unit">{t('积分可用', 'credits available')}</span>
        </div>
        <div className="gl-bar"><i style={{ width: `${pct}%` }} /></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`gl-pill ${pro ? 'on' : ''}`}>
            {pro ? `会员 · ¥${PRICING.proMonthlyPriceRMB}/月` : t('免费版', 'Free')}
          </span>
          {pro && sub.sub?.period_end && <span className="gl-pill">
            有效期至 {new Date(sub.sub.period_end).toLocaleDateString()}
          </span>}
          <span className="gl-pill gl-pill-accent">对话不扣积分</span>
        </div>

        {logsOpen && <div className="gl-logs">
          {logsLoading ? <div className="gl-empty">加载中…</div>
            : creditLogs.length === 0 ? <div className="gl-empty">还没有积分记录</div>
              : creditLogs.map((log) => {
                const isConsume = log.change_type === 'consume';
                return <div className="gl-log" key={log.id}>
                  <div className="gl-log-main">
                    <strong>{log.reason}</strong>
                    <small>{new Date(log.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
                  </div>
                  <div className={`gl-log-amt ${isConsume ? 'minus' : 'plus'}`}>
                    {isConsume ? '−' : '+'}{log.amount}
                  </div>
                </div>;
              })}
        </div>}
      </>}
    </section>

    {/* ---------- 积分单价 ---------- */}
    <section className="gl-card">
      <div className="gl-label">积分怎么花 <em>RATES</em></div>
      <div className="gl-rates">
        <div className="gl-rate">
          <div className="gl-rate-top"><strong>{t('对话', 'Chat')}</strong></div>
          <div className="gl-rate-num">免费</div>
          <div className="gl-rate-note">DeepSeek / Kimi / Doubao-Seed / GLM</div>
        </div>
        <div className="gl-rate">
          <div className="gl-rate-top"><strong>{t('图像 · Flash', 'Image · Flash')}</strong></div>
          <div className="gl-rate-num"><Coin size={14} />{PRICING.costs.imageFlash} / 张</div>
          <div className="gl-rate-note">Seedream 5.0 Flash · 快速出图</div>
        </div>
        <div className="gl-rate hi">
          <div className="gl-rate-top"><strong>{t('图像 · Pro', 'Image · Pro')}</strong><span className="gl-pill">精细</span></div>
          <div className="gl-rate-num"><Coin size={14} />{PRICING.costs.imagePro} / 张</div>
          <div className="gl-rate-note">Seedream 5.0 Pro · 仅多 {(PRICING.costs.imagePro - PRICING.costs.imageFlash)} 积分</div>
        </div>
      </div>
      <p className="gl-note">
        方案页第一次是一批出 3 张，按 Flash 档只扣 {PRICING.costs.imageFlash} 积分；单张重新生成才按所选档位逐张计。
        扣费以实际成功返回的图为准，失败不扣。
      </p>
    </section>

    {/* ---------- 免费 / 会员 ---------- */}
    <div className="gl-plans">
      <section className="gl-plan">
        <div className="gl-plan-name">{t('免费版', 'Free')}</div>
        <div className="gl-plan-price">¥0</div>
        <ul className="gl-plan-feats">
          <li><Icon name="check" size={13} />{PRICING.freeTrialUses} 积分（注册即送）</li>
          <li><Icon name="check" size={13} />四步创作流程与编辑器</li>
          <li><Icon name="check" size={13} />本机保存项目（IndexedDB）</li>
          <li><Icon name="check" size={13} />每日签到 +10</li>
        </ul>
        <button className="gl-btn gl-btn-soft" disabled>{pro ? '当前方案' : '默认方案'}</button>
      </section>

      <section className="gl-plan gl-plan-pro">
        <span className="gl-plan-flag">推荐</span>
        <div className="gl-plan-name">{t('会员 · 每月特权', 'Member · Monthly')}</div>
        <div className="gl-plan-price">¥{PRICING.proMonthlyPriceRMB}<span>/月</span></div>
        <ul className="gl-plan-feats">
          <li><Icon name="check" size={13} />签到双倍（+20/天，月上限 600）</li>
          <li><Icon name="check" size={13} />全部对话模型解锁</li>
          <li><Icon name="check" size={13} />云端同步 + 历史版本</li>
          <li><Icon name="check" size={13} />全部导出与印前能力（PDF / SVG / ZIP）</li>
        </ul>
        {pro
          ? <button className="gl-btn gl-btn-soft" onClick={() => go('/account')}>{t('已是会员', 'Current plan')}</button>
          : <button className="gl-btn gl-btn-soft" disabled>{t('即将开放', 'Coming soon')}</button>}
      </section>
    </div>

    {/* ---------- 充值包 ---------- */}
    <section className="gl-card">
      <div className="gl-label">充值积分包 <em>TOP-UP</em></div>
      <div className="gl-packs">
        {PRICING.recharge.map((p) => <div className={`gl-pack ${p.tag === '热门' ? 'hot' : ''}`} key={p.price}>
          <div className="gl-pack-tag">{p.tag}</div>
          <div className="gl-pack-price">¥{p.price}</div>
          <div className="gl-pack-points"><Coin size={14} />{p.points} 积分</div>
        </div>)}
      </div>
      <p className="gl-note">支付通道接入中，开放后以支付成功回调为准。在此之前可以用兑换码。</p>
    </section>

    {/* ---------- 兑换码 ---------- */}
    <section className="gl-card">
      <div className="gl-label">兑换码 <em>REDEEM</em></div>
      <p className="gl-sub" style={{ fontSize: 13, marginBottom: 14 }}>
        有兑换码（内测、活动、邀请奖励）就在这里兑换，积分立即到账。
      </p>
      <div className="gl-redeem">
        <input
          className="gl-input"
          value={redeemCode}
          onChange={(e) => setRedeemCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void redeem(); }}
          placeholder={t('输入兑换码，如 LS-500', 'Enter code, e.g. LS-500')}
        />
        <button className="gl-btn" disabled={!redeemCode.trim() || redeeming} onClick={() => void redeem()}>
          {redeeming ? t('兑换中…', 'Redeeming…') : t('兑换', 'Redeem')}
        </button>
      </div>
      {redeemMsg && <div style={{ marginTop: 12 }}>
        <span className={`gl-pill ${redeemMsg.ok ? '' : 'gl-pill-accent'}`}>{redeemMsg.text}</span>
      </div>}
      <p className="gl-note">
        兑换码由管理员发放，分为「积分码」和「会员码」两种：积分码兑换后积分立即到账；
        会员码兑换后会员立即生效，已开通的会在原有效期上顺延。兑换码由管理员统一发放，请勿在公开渠道传播。
      </p>
    </section>
  </div>;
}
