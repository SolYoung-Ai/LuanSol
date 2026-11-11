/* ============================================================
 * 积分与充值（iOS 液态玻璃版）
 * ------------------------------------------------------------
 * 积分制：对话免费；Seedream Flash 6 / Pro 10；GPT Image 2 文字输入 86 / 输入图 93；
 * Hyper3D-Gen2 21（3D 生成，暂未开放入口）
 *  - 新注册送 PRICING.freeTrialUses 积分
 *  - 每日签到 +10（会员双倍 +20/天，会员月上限 600）；已取消「连续 10 天额外 +100」
 *  - 会员已开放，但支付通道未接入，当前只能用兑换码开通
 *  - 购买积分走人工：加微信 soyo-ang（点一下自动复制）
 * 视觉：与账户信息页同一套玻璃材质，靠圆角与间距分组，不画分割线。
 * 所有数字都从 PRICING 读，不在页面里写死。
 * ============================================================ */
import React, { useState, useEffect, useRef } from 'react';
import { go } from '../ui';
import { useApp } from '../store';
import { useAuth } from '../cloud/auth';
import { useSubscription, type CreditLog } from '../cloud/subscription';
import { PRICING } from '../cloud/plans';
import { IMAGE_MODELS, HYPER3D_COST } from '../cloud/models';
import { useLang } from '../i18n';
import { Icon } from '../components/icons';
import Coin from '../components/Coin';

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
  /** 兑换码输入框：会员卡的「用兑换码开通」要滚到这里并聚焦 */
  const redeemRef = useRef<HTMLInputElement>(null);

  /** 购买积分的对公微信号，点一下复制 */
  const WX_ID = 'soyo-ang';
  const copyWx = async () => {
    try {
      await navigator.clipboard.writeText(WX_ID);
      setToast(`已复制微信号 ${WX_ID}`);
    } catch {
      // 非 https / 无剪贴板权限时退回选中式复制
      const ta = document.createElement('textarea');
      ta.value = WX_ID;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setToast(`已复制微信号 ${WX_ID}`); }
      catch { setToast(`微信号：${WX_ID}`); }
      document.body.removeChild(ta);
    }
  };

  const goRedeem = () => {
    redeemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => redeemRef.current?.focus(), 420);
  };

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
  // 已使用百分比与左侧栏账号卡同一个来源（sub.usage），两处永远一致；
  // 分母默认 1000，用户近期充过积分则换成该次充值量。
  const usage = sub.usage;
  const pct = usage?.pct ?? 0;

  const redeem = async () => {
    const code = redeemCode.trim().toUpperCase();
    if (!code || redeeming) return;
    setRedeeming(true); setRedeemMsg(null);
    const r = await sub.redeemCode(code);
    setRedeemMsg({ ok: r.ok, text: r.message });
    setRedeeming(false);
    if (r.ok) setRedeemCode('');
  };

  return <div className="gl-page gl-credits">
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
        <div className="gl-hero-title">每天签到送积分</div>
        <div className="gl-hero-text">
          每天签到 <strong>+10</strong> 积分，会员双倍（<strong>+20</strong>/天，月上限 600 积分）。
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
        <div className="gl-bar-cap">
          <span>{t('已使用', 'Used')} {pct}%</span>
          {usage && <span>{usage.used} / {usage.bucket} {t('积分', 'credits')}</span>}
        </div>
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
          <div className="gl-rate-note">DeepSeek-V4.1-Flash 免费不限；会员模型按每日 ¥1 额度计，都不扣积分</div>
        </div>
        {IMAGE_MODELS.filter((m) => m.provider === 'ark').map((m) => (
          <div className={`gl-rate ${m.id === 'pro' ? 'hi' : ''}`} key={m.id}>
            <div className="gl-rate-top">
              <strong>{m.id === 'flash' ? t('图像 · 快速', 'Image · Fast') : t('图像 · 精细', 'Image · Fine')}</strong>
              {m.id === 'pro' && <span className="gl-pill">{t('更清晰', 'Sharper')}</span>}
            </div>
            <div className="gl-rate-num"><Coin size={14} />{m.cost} / 张</div>
            <div className="gl-rate-note">{m.label} · {m.note}</div>
          </div>
        ))}
        {IMAGE_MODELS.filter((m) => m.provider === 'bai').map((m) => (
          <div className={`gl-rate ${m.id === 'gpt2-ref' ? 'hi' : ''}`} key={m.id}>
            <div className="gl-rate-top">
              <strong>{m.id === 'gpt2-text' ? t('GPT Image 2 · 文字', 'GPT Image 2 · text') : t('GPT Image 2 · 输入图', 'GPT Image 2 · image')}</strong>
              <span className="gl-pill">{t('旗舰', 'Flagship')}</span>
            </div>
            <div className="gl-rate-num"><Coin size={14} />{m.cost} / 张</div>
            <div className="gl-rate-note">{m.note}</div>
          </div>
        ))}
        <div className="gl-rate">
          <div className="gl-rate-top"><strong>{t('3D · Hyper3D-Gen2', '3D · Hyper3D-Gen2')}</strong><span className="gl-pill">{t('即将开放', 'Soon')}</span></div>
          <div className="gl-rate-num"><Coin size={14} />{HYPER3D_COST} / 次</div>
          <div className="gl-rate-note">文/图生 3D 模型（.glb），先在编辑器里用</div>
        </div>
      </div>
      <p className="gl-note">
        方案页第一次是一批出 3 张，按 Seedream 快速档只扣 {PRICING.costs.imageFlash} 积分；单张重新生成才按所选档位逐张计。
        GPT Image 2 分两档：只用文字描述 {PRICING.costs.imageGpt2Text} 积分，带参考图改图 {PRICING.costs.imageGpt2Ref} 积分。
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
          <li><Icon name="check" size={13} />印前检查与 PNG / JPG 预览图</li>
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
          <li><Icon name="check" size={13} />GPT Image 2 生图模型开放（旗舰出图 / 参考图改图）</li>
          <li><Icon name="check" size={13} />云端同步 + 历史版本</li>
          <li><Icon name="check" size={13} />印刷级文件导出（PDF / SVG / DXF / ZIP）</li>
        </ul>
        {pro
          ? <button className="gl-btn gl-btn-soft" onClick={() => go('/account')}>{t('已是会员', 'Current plan')}</button>
          : <button className="gl-btn" onClick={goRedeem}>{t('用兑换码开通', 'Activate with code')}</button>}
        <p className="gl-plan-note">
          {pro
            ? '会员权益已生效，到期后可用兑换码续期。'
            : '会员已开放，支付通道接入前仅支持兑换码开通。'}
        </p>
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
      <p className="gl-note">支付系统未开放，暂不支持自助购买；购买方式见下方「兑换码」。</p>
    </section>

    {/* ---------- 兑换码 ---------- */}
    <section className="gl-card">
      <div className="gl-label">兑换码 <em>REDEEM</em></div>
      <p className="gl-sub" style={{ fontSize: 13, marginBottom: 14 }}>
        有兑换码（内测、活动、邀请奖励）就在这里兑换，积分立即到账。
      </p>
      <div className="gl-redeem">
        <input
          ref={redeemRef}
          className="gl-input"
          value={redeemCode}
          onChange={(e) => setRedeemCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void redeem(); }}
          placeholder={t('输入兑换码', 'Enter your code')}
        />
        <button className="gl-btn" disabled={!redeemCode.trim() || redeeming} onClick={() => void redeem()}>
          {redeeming ? t('兑换中…', 'Redeeming…') : t('兑换', 'Redeem')}
        </button>
      </div>
      {redeemMsg && <div style={{ marginTop: 12 }}>
        <span className={`gl-pill ${redeemMsg.ok ? '' : 'gl-pill-accent'}`}>{redeemMsg.text}</span>
      </div>}
      <p className="gl-note">
        支付系统未开放，购买积分可以联系微信{' '}
        <button className="gl-wx" onClick={() => void copyWx()} title="点击复制微信号">
          {WX_ID}<Icon name="copy" size={11} />
        </button>
        ，测试期间所有积分 5 折，并赠送 2 个月标准会员。
      </p>
    </section>
  </div>;
}
