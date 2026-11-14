/* ============================================================
 * 积分（纯积分制，iOS 液态玻璃版）
 * ------------------------------------------------------------
 * 全站只有一个计量单位：积分。没有会员、订阅、包月、有效期或续费。
 *  - 新注册送 PRICING.freeTrialUses 积分，每日签到 +10，积分永久有效
 *  - 对话免费；AI 生图按档位扣分，具体数字以 src/cloud/models.ts 为准
 *  - 积分包在线购买（Creem），或微信人工 / 兑换码
 *  - 登录后全部能力开放，印刷级导出、云端同步、历史版本都不额外收费
 * 视觉：与账户信息页同一套玻璃材质，靠圆角与间距分组，不画分割线。
 * ============================================================ */
import React, { useState, useEffect, useRef } from 'react';
import { go } from '../ui';
import { useApp } from '../store';
import { useAuth } from '../cloud/auth';
import { useSubscription, type CreditLog } from '../cloud/subscription';
import { startCheckout, payReturnFlag, clearPayReturnFlag, markPayKind, lastPayKind, clearPayKind } from '../cloud/pay';
import { PRICING, TEST_PACK, SHOW_TEST_PACK } from '../cloud/plans';
import { imageModelNote } from '../cloud/models';
import { IMAGE_MODELS, HYPER3D_COST } from '../cloud/models';
import { useLang } from '../i18n';
import { Icon } from '../components/icons';
import Coin from '../components/Coin';

/** 积分包标签的英文（PRICING 里只有中文标签，不为此改数据源） */
function packTagEn(points: number): string {
  const map: Record<number, string> = { 100: 'Trial', 1000: 'Starter', 2100: 'Popular', 3500: 'Best value' };
  return map[points] || String(points);
}

/** 线上可买的卡片：体验档在前（临时），正式三档在后。
 *  体验档不在 PRICING.creditsPacks 里，理由见 plans.ts 末尾注释。 */
const BUY_PACKS = SHOW_TEST_PACK
  ? [TEST_PACK, ...PRICING.creditsPacks]
  : [...PRICING.creditsPacks];

export default function Credits() {
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
  const redeemRef = useRef<HTMLInputElement>(null);
  /** 三档积分包各有各的按钮，用 'credits:2100' 这种 key 区分谁在转圈 */
  const [payingKey, setPayingKey] = useState<string | null>(null);
  const [payMsg, setPayMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const paying = payingKey !== null;

  /** 购买积分的对公微信号，点一下复制 */
  const WX_ID = 'soyo-ang';
  const copyWx = async () => {
    try {
      await navigator.clipboard.writeText(WX_ID);
      setToast(t(`已复制微信号 ${WX_ID}`, `WeChat ID copied: ${WX_ID}`));
    } catch {
      const ta = document.createElement('textarea');
      ta.value = WX_ID;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setToast(t(`已复制微信号 ${WX_ID}`, `WeChat ID copied: ${WX_ID}`)); }
      catch { setToast(t(`微信号：${WX_ID}`, `WeChat ID: ${WX_ID}`)); }
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
      setToast(t('请先登录再签到，积分会绑定到你的账号', 'Sign in to check in — credits are tied to your account.'));
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
  // 已使用百分比与左侧栏账号卡同一个来源（sub.usage），两处永远一致
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

  // 从 Creem 收银台回跳：webhook 到账有几秒延迟，轮询数据库最多约 24 秒，
  // 拿到真实积分明细再收工——否则用户会看到「已付款但余额没变」，以为钱白花了。
  useEffect(() => {
    const flag = payReturnFlag();
    if (!flag.returned || !a.user) return;
    let cancelled = false;
    let tries = 0;
    setPayMsg({ ok: true, text: t('支付已完成，正在确认积分到账…', 'Payment complete — confirming your credits…') });
    const tick = async () => {
      if (cancelled) return;
      tries += 1;
      // 到账标志是「近 15 分钟有一条 recharge 明细」，比对比余额更可靠：
      // 页面重载后拿不到付款前的余额，而明细是幂等的。
      const logs = await sub.getCreditLogs(8);
      if (cancelled) return;
      const fresh = logs.some((l) => l.change_type === 'recharge'
        && Date.now() - Date.parse(l.created_at) < 15 * 60 * 1000);
      if (fresh) {
        await sub.refresh();
        clearPayReturnFlag(); clearPayKind();
        setPayMsg({ ok: true, text: t('积分已到账，余额已更新。', 'Credits added — your balance is updated.') });
        return;
      }
      if (tries >= 8) {
        setPayMsg({
          ok: false,
          text: t('暂未收到积分到账确认。若已扣款，通常 1 分钟内到账，稍后刷新即可；超过 10 分钟仍未到账请联系客服。',
            'Credits not confirmed yet. If you were charged, they normally arrive within a minute — refresh shortly. Contact us if it takes more than 10 minutes.'),
        });
        return;
      }
      window.setTimeout(() => void tick(), 3000);
    };
    void tick();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.user?.id]);

  const doPay = async (points: number) => {
    if (!a.user) {
      setToast(t('请先登录再购买，积分会记到你的账号', 'Sign in before buying — credits go to your account.'));
      go('/account');
      return;
    }
    if (paying) return;
    const key = `credits:${points}`;
    setPayingKey(key); setPayMsg(null);
    markPayKind(lastPayKind());
    const r = await startCheckout({ uid: a.user.id, email: a.user.email, name: a.user.label, points });
    if (!r.ok) { setPayingKey(null); setPayMsg({ ok: false, text: r.message }); return; }
    // 不复位 payingKey：用户可能点浏览器返回，按钮维持「确认中」比闪回可点更诚实
    window.location.href = r.url;
  };

  return <div className="gl-page gl-credits">
    <header className="gl-head">
      <span className="gl-kicker">CREDITS</span>
      <h1 className="gl-title">{t('积分', 'Credits')}</h1>
      <p className="gl-sub">
        {t(`一个数字用到底：AI 生图按档位扣积分，其余功能登录后全部可用。新用户注册送 ${PRICING.freeTrialUses} 积分，每天签到再加 10。`,
          `One number for everything: AI image generation spends credits per tier, and every other feature is included after sign-in. New accounts start with ${PRICING.freeTrialUses} credits, plus 10 for each daily check-in.`)}
      </p>
    </header>

    {/* ---------- 每日签到 ---------- */}
    <section className="gl-hero">
      <div className="gl-hero-main">
        <div className="gl-hero-kicker">LIMITED TIME · {t('每日签到', 'DAILY CHECK-IN')}</div>
        <div className="gl-hero-title">{t('每天签到送积分', 'Check in daily for credits')}</div>
        <div className="gl-hero-text">
          {t('每天签到 ', 'Check in for ')}<strong>+10</strong>{t(' 积分，没有上限，积分永久有效。', ' credits a day, with no cap — credits never expire.')}
        </div>
        <div className="gl-hero-streak">{a.user
          ? <>{t('已连续签到 ', 'Streak: ')}<strong>{checkinStreak}</strong>{t(' 天', ' days')}</>
          : <>{t('登录后签到，积分会记在你的账号上', 'Sign in to check in — credits go to your account')}</>}</div>
      </div>
      <button className={`gl-btn ${checkedToday ? 'gl-btn-soft' : ''}`} disabled={checkedToday || checkinLoading} onClick={() => void doCheckin()}>
        {checkedToday
          ? t('今日已签到', 'Checked in today')
          : !a.user
            ? t('登录后签到', 'Sign in to check in')
            : t('立即签到 +10', 'Check in +10')}
        {checkedToday && <Icon name="check" size={14} />}
      </button>
    </section>

    {/* ---------- 余额 ---------- */}
    <section className="gl-card">
      <div className="gl-label">
        {t('我的积分', 'My credits')} <em>BALANCE</em>
        {a.user && <button className="gl-inline-link" style={{ marginLeft: 'auto' }} onClick={toggleLogs}>
          {logsOpen ? t('收起明细', 'Hide history') : t('查看明细', 'View history')}
        </button>}
      </div>

      {!a.user ? <div className="gl-empty">
        {t('登录后查看积分余额。', 'Sign in to view your credit balance.')}
        <div style={{ marginTop: 12 }}>
          <button className="gl-btn gl-btn-sm" onClick={() => go('/account')}>{t('去登录', 'Sign in')}</button>
        </div>
      </div> : <>
        <div className="gl-balance">
          <Coin size={34} />
          <span className="gl-balance-num">{left ?? '…'}</span>
          <span className="gl-balance-unit">{t('积分可用', 'credits available')}</span>
        </div>
        <div className="gl-bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="gl-bar-cap">
          <span>{t('已使用', 'Used')} {pct}%</span>
          {usage && <span>{t('可用 ', '')}{usage.left} {t('积分', 'credits')}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="gl-pill on">{t('积分永久有效', 'Credits never expire')}</span>
          <span className="gl-pill gl-pill-accent">{t('对话不扣积分', 'Chat costs no credits')}</span>
        </div>
        <p className="gl-note" style={{ marginTop: 10 }}>
          {t('积分来自注册赠送、每日签到、兑换码和单独购买的积分包；只有 AI 生图会消耗积分，扣费以实际成功返回的图为准，失败不扣。编辑、3D 预览、印前检查、印刷级导出与云端同步都不额外收费。',
            'Credits come from the sign-up gift, daily check-ins, redeem codes and separately purchased packs. Only AI image generation spends them, and you are charged only for images that actually come back. Editing, 3D preview, prepress checks, print-grade export and cloud sync are all included.')}
        </p>

        {logsOpen && <div className="gl-logs">
          {logsLoading ? <div className="gl-empty">{t('加载中…', 'Loading…')}</div>
            : creditLogs.length === 0 ? <div className="gl-empty">{t('还没有积分记录', 'No credit history yet')}</div>
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
      <div className="gl-label">{t('积分怎么花', 'Where credits go')} <em>RATES</em></div>
      <div className="gl-rates">
        <div className="gl-rate">
          <div className="gl-rate-top"><strong>{t('对话', 'Chat')}</strong></div>
          <div className="gl-rate-num">{t('免费', 'Free')}</div>
          <div className="gl-rate-note">
            {t('Luna AI 对话、AI 设计建议都不扣积分', 'Luna AI chat and AI design suggestions spend no credits')}
          </div>
        </div>
        {IMAGE_MODELS.filter((m) => m.provider === 'ark').map((m) => (
          <div className={`gl-rate ${m.id === 'pro' ? 'hi' : ''}`} key={m.id}>
            <div className="gl-rate-top">
              <strong>{m.id === 'flash' ? t('图像 · 快速', 'Image · Fast') : t('图像 · 精细', 'Image · Fine')}</strong>
              {m.id === 'pro' && <span className="gl-pill">{t('更清晰', 'Sharper')}</span>}
            </div>
            <div className="gl-rate-num">
              <Coin size={14} />{m.cost} {t('/ 张', '/ image')}
            </div>
            <div className="gl-rate-note">{m.label} · {imageModelNote(m, lang)}</div>
          </div>
        ))}
        {IMAGE_MODELS.filter((m) => m.provider === 'bai').map((m) => (
          <div className={`gl-rate ${m.id === 'gpt2-ref' ? 'hi' : ''}`} key={m.id}>
            <div className="gl-rate-top">
              <strong>{m.id === 'gpt2-text' ? t('GPT Image 2 · 文字', 'GPT Image 2 · text') : t('GPT Image 2 · 输入图', 'GPT Image 2 · image')}</strong>
              <span className="gl-pill">{t('旗舰', 'Flagship')}</span>
            </div>
            <div className="gl-rate-num"><Coin size={14} />{m.cost} / 张</div>
            <div className="gl-rate-note">{imageModelNote(m, lang)}</div>
          </div>
        ))}
        <div className="gl-rate">
          <div className="gl-rate-top"><strong>{t('3D · Hyper3D-Gen2', '3D · Hyper3D-Gen2')}</strong><span className="gl-pill">{t('即将开放', 'Soon')}</span></div>
          <div className="gl-rate-num"><Coin size={14} />{HYPER3D_COST} {t('/ 次', '/ run')}</div>
          <div className="gl-rate-note">
            {t('文/图生 3D 模型（.glb），先在编辑器里用', 'Text- or image-to-3D (.glb), used inside the editor')}
          </div>
        </div>
      </div>
      <p className="gl-note">
        {t(`方案页第一次是一批出 3 张，按 Seedream 快速档只扣 ${PRICING.costs.imageFlash} 积分；单张重新生成才按所选档位逐张计。GPT Image 2 分两档：只用文字描述 ${PRICING.costs.imageGpt2Text} 积分，带参考图改图 ${PRICING.costs.imageGpt2Ref} 积分。`,
          `The concepts page renders a batch of 3 for ${PRICING.costs.imageFlash} credits at the Seedream Fast tier; regenerating a single image is charged per image at the tier you pick. GPT Image 2 has two tiers: ${PRICING.costs.imageGpt2Text} credits for text-only, ${PRICING.costs.imageGpt2Ref} for reference-based editing.`)}
      </p>
    </section>

    {/* ---------- 充值包 ---------- */}
    <section className="gl-card">
      <div className="gl-label">{t('购买积分包', 'Credit packs')} <em>TOP-UP</em></div>
      <div className="gl-packs">
        {BUY_PACKS.map((p) => (
          <div className={`gl-pack${p.points === 2100 ? ' hot' : ''}`} key={p.points}>
            <div className="gl-pack-tag">{t(p.tag, packTagEn(p.points))} · {t('在线可买', 'available online')}</div>
            <div className="gl-pack-price">US${p.priceUSD}</div>
            <div className="gl-pack-points"><Coin size={14} />{t(`${p.points} 积分`, `${p.points} credits`)}</div>
            <button className="gl-btn gl-btn-sm" disabled={paying} onClick={() => void doPay(p.points)}>
              {payingKey === `credits:${p.points}`
                ? t('正在前往支付…', 'Opening checkout…')
                : t('立即购买', 'Buy now')}
            </button>
          </div>
        ))}
      </div>
      {payMsg && <div style={{ marginTop: 12 }}>
        <span className={`gl-pill ${payMsg.ok ? '' : 'gl-pill-accent'}`}>{payMsg.text}</span>
      </div>}
      <p className="gl-note">
        {t('支持 Visa / Mastercard / Apple Pay / Google Pay 在线支付，付款后积分自动到账；中国内地用户可走微信人工或兑换码。积分永久有效，没有月费，也不需要续费。',
          'Pay online with Visa / Mastercard / Apple Pay / Google Pay — credits arrive automatically. Mainland China users can use WeChat or a redeem code. Credits never expire, with no monthly fee and nothing to renew.')}
      </p>
      <button className="gl-btn gl-btn-soft gl-btn-sm" style={{ marginTop: 10 }} onClick={goRedeem}>
        {t('用兑换码充值', 'Top up with a code')}
      </button>
    </section>

    {/* ---------- 兑换码 ---------- */}
    <section className="gl-card">
      <div className="gl-label">{t('兑换码', 'Redeem code')} <em>REDEEM</em></div>
      <p className="gl-sub" style={{ fontSize: 13, marginBottom: 14 }}>
        {t('中国内地用户购买积分请联系微信', 'Mainland China: message us on WeChat')}{' '}
        <button className="gl-wx" onClick={() => void copyWx()} title={t('点击复制微信号', 'Click to copy the WeChat ID')}>
          {WX_ID}<Icon name="copy" size={11} />
        </button>
        {' '}{t('获取兑换码。', 'to get a redeem code.')}
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

      <div className="gl-code-price">
        <div className="gl-code-price-head">{t('中国内地兑换码价格 · CNY', 'Mainland China redeem-code prices · CNY')}</div>
        <div className="gl-code-tags">
          {PRICING.creditsPacks.map((p) => (
            <span className="gl-code-tag" key={p.points}>
              <em>{t(`${p.points} 积分`, `${p.points} credits`)}</em>
              <strong>¥{p.priceRMB}</strong>
            </span>
          ))}
          <span className="gl-code-note">
            {t(`自定义 ¥1 = ${PRICING.customPointsPerRMB} 积分`, `Custom ¥1 = ${PRICING.customPointsPerRMB} credits`)}
          </span>
        </div>
      </div>
    </section>
  </div>;
}
