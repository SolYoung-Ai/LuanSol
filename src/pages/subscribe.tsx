/* ============================================================
 * 积分与充值（iOS 液态玻璃版）
 * ------------------------------------------------------------
 * 积分制：对话免费；Seedream Flash 6 / Pro 12；GPT Image 2 文字 60→42、改图 65→46（上线七折）；
 * 具体数字以 src/cloud/models.ts 的 cost 为准，页面不另写一份；
 * Hyper3D-Gen2 21（3D 生成，暂未开放入口）
 *  - 新注册送 PRICING.freeTrialUses 积分
 *  - 每日签到 +10（会员双倍 +20/天，会员月上限 600）；已取消「连续 10 天额外 +100」
 *  - 会员已开放：主通道 Creem（US$5/月，卡 / Apple Pay / Google Pay）；
 *    中国内地走兑换码（¥28/月）或微信人工——两条通道价格是分开定的，不要互相折算。
 * 视觉：与账户信息页同一套玻璃材质，靠圆角与间距分组，不画分割线。
 * 所有数字都从 PRICING 读，不在页面里写死。
 * ============================================================ */
import React, { useState, useEffect, useRef } from 'react';
import { go } from '../ui';
import { useApp } from '../store';
import { useAuth } from '../cloud/auth';
import { useSubscription, getSubscription, isProActive, type CreditLog } from '../cloud/subscription';
import { startCheckout, payReturnFlag, clearPayReturnFlag, markPayKind, lastPayKind, clearPayKind, type PayKind } from '../cloud/pay';
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
  /** Creem 结账：跳转收银台前按钮进入 loading；回跳后轮询确认开通结果。
   *  payingKind 区分是「会员」还是「哪一档积分包」在跳转（'pro' / 'credits:2100'），
   *  三档各有各的按钮，不能共用一个 'credits' 让三个按钮同时转圈。 */
  const [payingKind, setPayingKind] = useState<string | null>(null);
  /** kind 一并存在消息里：回跳后 payingKind 已随页面重载丢失，只靠它会把
   *  「积分到账」提示渲染到会员卡下面。 */
  const [payMsg, setPayMsg] = useState<{ ok: boolean; text: string; kind: PayKind } | null>(null);
  const paying = payingKind !== null;

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

  // 从 Creem 收银台回跳：webhook 到账有几秒延迟，这里轮询数据库最多约 24 秒，
  // 拿到真实会员状态 / 积分余额再收工——否则用户会看到「已付款但余额没变」，以为钱白花了。
  useEffect(() => {
    const flag = payReturnFlag();
    const uid = a.user?.id;
    if (!flag.returned || !uid) return;
    const kind = lastPayKind();
    let cancelled = false;
    let tries = 0;
    setPayMsg({
      ok: true,
      kind,
      text: kind === 'credits' ? '支付已完成，正在确认积分到账…' : '支付已完成，正在确认订单…',
    });
    const tick = async () => {
      if (cancelled) return;
      tries += 1;
      if (kind === 'credits') {
        // 积分包的到账标志是「近 15 分钟有一条 recharge 明细」，比对比余额更可靠：
        // 页面重载后拿不到付款前的余额，而明细是幂等的。
        const logs = await sub.getCreditLogs(8);
        if (cancelled) return;
        const fresh = logs.some((l) => l.change_type === 'recharge'
          && Date.now() - Date.parse(l.created_at) < 15 * 60 * 1000);
        if (fresh) {
          await sub.refresh();
          clearPayReturnFlag(); clearPayKind();
          setPayMsg({ ok: true, kind: 'credits', text: '积分已到账，余额已更新。' });
          return;
        }
      } else {
        const got = await getSubscription(uid);
        if (cancelled) return;
        if (got.ok && isProActive(got.data)) {
          await sub.refresh();
          clearPayReturnFlag(); clearPayKind();
          setPayMsg({ ok: true, kind: 'pro', text: '会员已开通，有效期见上方。' });
          return;
        }
      }
      if (tries >= 8) {
        setPayMsg({
          ok: false,
          kind,
          text: kind === 'credits'
            ? '暂未收到积分到账确认。若已扣款，通常 1 分钟内到账，稍后刷新即可；超过 10 分钟仍未到账请联系客服。'
            : '暂未收到支付确认。若已扣款，通常 1 分钟内到账，稍后刷新即可；超过 10 分钟仍未开通请联系客服。',
        });
        return;
      }
      window.setTimeout(() => void tick(), 3000);
    };
    void tick();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.user?.id]);

  const doPay = async (kind: PayKind, points?: number) => {
    if (!a.user) {
      setToast(kind === 'credits' ? '请先登录再购买，积分会记到你的账号' : '请先登录再开通，会员会绑定到你的账号');
      go('/account');
      return;
    }
    if (paying) return;
    const key = kind === 'credits' ? `credits:${points || 0}` : 'pro';
    setPayingKind(key); setPayMsg(null);
    markPayKind(kind);
    const r = await startCheckout({ uid: a.user.id, email: a.user.email, kind, points });
    if (!r.ok) { setPayingKind(null); setPayMsg({ ok: false, kind, text: r.message }); return; }
    // 不复位 payingKind：用户可能点浏览器返回，按钮维持「确认中」比闪回可点更诚实
    window.location.href = r.url;
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
            {pro ? `会员 · US$${PRICING.proMonthlyPriceUSD}/月` : t('免费版', 'Free')}
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
          <div className="gl-rate-note">DeepSeek-V4.1-Flash 免费不限；会员模型按每日额度计，都不扣积分</div>
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
        <div className="gl-plan-price">{t('免费', 'Free')}</div>
        <ul className="gl-plan-feats">
          <li><Icon name="check" size={13} />{PRICING.freeTrialUses} 积分（注册即送）</li>
          <li><Icon name="check" size={13} />四步创作流程与编辑器</li>
          <li><Icon name="check" size={13} />印前检查与 PNG / JPG 预览图</li>
          <li><Icon name="check" size={13} />本机保存项目（IndexedDB）</li>
          <li><Icon name="check" size={13} />每日签到 +10</li>
        </ul>
        {/* 免费卡上的状态必须跟真实方案一致：会员用户看着免费卡写「当前方案」会以为没开通成功 */}
        <button className="gl-btn gl-btn-soft" disabled>{pro ? t('已升级会员', 'Upgraded') : t('当前方案', 'Current plan')}</button>
      </section>

      <section className="gl-plan gl-plan-pro">
        <span className="gl-plan-flag">推荐</span>
        <div className="gl-plan-name">{t('会员 · 每月特权', 'Member · Monthly')}</div>
        <div className="gl-plan-price">US${PRICING.proMonthlyPriceUSD}<span> {t('/月', '/mo')}</span></div>
        <ul className="gl-plan-feats">
          <li><Icon name="check" size={13} />签到双倍（+20/天，月上限 600）</li>
          <li><Icon name="check" size={13} />全部对话模型解锁</li>
          <li><Icon name="check" size={13} />GPT Image 2 生图模型开放（旗舰出图 / 参考图改图）</li>
          <li><Icon name="check" size={13} />云端同步 + 历史版本</li>
          <li><Icon name="check" size={13} />印刷级文件导出（PDF / SVG / DXF / ZIP）</li>
        </ul>
        {pro
          ? <button className="gl-btn gl-btn-soft" onClick={() => go('/account')}>{t('已是会员', 'Current plan')}</button>
          : <>
            <button className="gl-btn" disabled={paying} onClick={() => void doPay('pro')}>
              {payingKind === 'pro' ? t('正在前往支付…', 'Redirecting…') : `立即开通 · US$${PRICING.proMonthlyPriceUSD}${t('/月', '/mo')}`}
            </button>
            <button className="gl-btn gl-btn-soft" style={{ marginTop: 8 }} onClick={goRedeem}>
              {t('兑换码开通', 'Activate with code')}
            </button>
          </>}
        {payMsg && payMsg.kind === 'pro' && <div style={{ marginTop: 10 }}>
          <span className={`gl-pill ${payMsg.ok ? '' : 'gl-pill-accent'}`}>{payMsg.text}</span>
        </div>}
        <p className="gl-plan-note">
          {pro
            ? '会员权益已生效，到期自动续费；不想续费可在 Creem 收据里的客户门户取消。'
            : '支持 Visa / Mastercard / Apple Pay / Google Pay。中国内地用户可用兑换码开通。'}
        </p>
      </section>
    </div>

    {/* ---------- 充值包 ---------- */}
    <section className="gl-card">
      <div className="gl-label">充值积分包 <em>TOP-UP</em></div>
      <div className="gl-packs">
        {PRICING.creditsPacks.map((p) => (
          <div className={`gl-pack${p.points === 2100 ? ' hot' : ''}`} key={p.points}>
            <div className="gl-pack-tag">{p.tag} · 在线可买</div>
            <div className="gl-pack-price">US${p.priceUSD}</div>
            <div className="gl-pack-points"><Coin size={14} />{p.points} 积分</div>
            <button className="gl-btn gl-btn-sm" disabled={paying} onClick={() => void doPay('credits', p.points)}>
              {payingKind === `credits:${p.points}` ? '正在前往支付…' : '立即购买'}
            </button>
          </div>
        ))}
      </div>
      {payMsg && payMsg.kind === 'credits' && <div style={{ marginTop: 12 }}>
        <span className={`gl-pill ${payMsg.ok ? '' : 'gl-pill-accent'}`}>{payMsg.text}</span>
      </div>}
      <p className="gl-note">
        支持 Visa / Mastercard / Apple Pay / Google Pay 在线支付，付款后积分自动到账；
        中国内地用户可走微信人工或兑换码。积分永久有效，不随会员到期清零。
      </p>
    </section>

    {/* ---------- 兑换码 ---------- */}
    <section className="gl-card">
      <div className="gl-label">兑换码 <em>REDEEM</em></div>
      <p className="gl-sub" style={{ fontSize: 13, marginBottom: 14 }}>
        中国内地用户获取会员/积分请联系微信{' '}
        <button className="gl-wx" onClick={() => void copyWx()} title="点击复制微信号">
          {WX_ID}<Icon name="copy" size={11} />
        </button>
        {' '}购买兑换码。
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

      {/* 兑换码价格表：中国内地用户问得最多的就是「多少钱多少积分」，
          写在兑换入口下面比让他们加微信问一句更省事。数字全部来自 PRICING。 */}
      <div className="gl-code-price">
        <div className="gl-code-price-head">中国内地兑换码价格 · CNY</div>
        <div className="gl-code-price-row">
          <span>LunaSol 标准会员</span><strong>¥{PRICING.proMonthlyPriceCodeRMB} / 月</strong>
        </div>
        {PRICING.creditsPacks.map((p) => (
          <div className="gl-code-price-row" key={p.points}>
            <span>{p.points} 积分</span><strong>¥{p.priceRMB}</strong>
          </div>
        ))}
        <div className="gl-code-price-row">
          <span>自定义积分</span><strong>¥1 = {PRICING.customPointsPerRMB} 积分</strong>
        </div>
      </div>
    </section>
  </div>;
}
