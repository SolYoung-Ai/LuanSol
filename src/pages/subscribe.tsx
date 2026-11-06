/* ============================================================
 * 订阅方案页：免费 / 会员对比、当前状态、成本测算、开通（激活码占位）
 * ------------------------------------------------------------
 *  - 支付系统尚未接入：开通走「激活码」占位，后续替换为支付成功回调；
 *  - 所有价格与额度数字都来自 src/cloud/plans.ts（唯一权威来源），界面不写死；
 *  - 当前状态、剩余次数、续费入口来自 useSubscription。
 * ============================================================ */
import React, { useMemo, useRef, useState } from 'react';
import { Button, Card, Notice, PageHead, SectionLabel, Tag, go } from '../ui';
import { useAuth } from '../cloud/auth';
import { useSubscription, remainingOf, isProActive } from '../cloud/subscription';
import { PRICING, buildPlanCalc, planSummaryText } from '../cloud/plans';
import { CLOUD_SITE_URL } from '../cloud/config';

export default function Subscribe() {
  const a = useAuth();
  const sub = useSubscription();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const actRef = useRef<HTMLDivElement>(null);

  /** 支付系统还没上线，主按钮不应该点了只提示「请输入激活码」。
   *  这里直接把用户带到激活码输入框并聚焦，减少一步猜测。 */
  const focusActivation = () => {
    actRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => codeRef.current?.focus(), 320);
  };

  const calc = useMemo(() => buildPlanCalc(), []);
  const summary = useMemo(() => planSummaryText(), []);

  const activate = async () => {
    if (!a.user) { setMsg({ ok: false, text: '请先登录后再订阅会员' }); return; }
    if (!code.trim()) { setMsg({ ok: false, text: '请输入激活码' }); return; }
    setBusy(true); setMsg(null);
    const r = await sub.activate(code.trim());
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) { setCode(''); void sub.refresh(); }
  };

  const left = sub.usedLeft ?? (sub.sub ? remainingOf(sub.sub) : 0);
  const pro = isProActive(sub.sub);

  return <div className="page subscribe-page">
    <PageHead kicker="PLANS" title="订阅方案"
      desc="平台统一接入 GPT-4o 与 DeepSeek-V3，你只管用，模型与密钥都在我们这边，你无法（也不需要）自己配置。" />

    {/* 当前状态 */}
    <Card className="pad-card sub-status-card">
      <SectionLabel en="YOUR PLAN">当前状态</SectionLabel>
      {!a.user ? <Notice tone="warn">尚未登录。登录后系统会为你自动开通 {PRICING.freeTrialUses} 次免费体验；订阅会员后可享每月 {PRICING.proMonthlyQuota} 次 AI 调用。</Notice>
        : pro ? <>
          <div className="sub-status-row"><span>套餐</span><Tag tone="green">会员 · ¥{PRICING.proMonthlyPriceRMB}/月</Tag></div>
          <div className="sub-status-row"><span>有效期至</span><strong>{sub.sub?.period_end ? new Date(sub.sub.period_end).toLocaleDateString('zh-CN') : '—'}</strong></div>
          <div className="sub-status-row"><span>本月剩余</span><strong>{left} / {PRICING.proMonthlyQuota} 次</strong></div>
          <div className="quota-bar"><span style={{ width: `${PRICING.proMonthlyQuota ? (left / PRICING.proMonthlyQuota) * 100 : 0}%` }} /></div>
          <Button variant="outline" size="sm" onClick={() => go('/account')}>在账户页管理</Button>
        </>
        : <>
          <div className="sub-status-row"><span>套餐</span><Tag>免费体验</Tag></div>
          <div className="sub-status-row"><span>剩余</span><strong>{left} / {PRICING.freeTrialUses} 次</strong></div>
          <div className="quota-bar free"><span style={{ width: `${PRICING.freeTrialUses ? (left / PRICING.freeTrialUses) * 100 : 0}%` }} /></div>
          <p className="acct-msg">免费体验用完后可订阅会员，每月 {PRICING.proMonthlyQuota} 次 AI 调用。</p>
        </>}
    </Card>

    {/* 套餐对比 */}
    <div className="plan-grid">
      <Card className="pad-card plan-card">
        <div className="plan-name">免费体验</div>
        <div className="plan-price">¥0</div>
        <ul className="plan-feats">
          <li>{PRICING.freeTrialUses} 次 AI 调用（新注册自动获得）</li>
          <li>内置确定性设计引擎（不调用大模型）</li>
          <li>本机保存项目</li>
          <li>基础导出能力</li>
        </ul>
        <Button variant="outline" disabled={!a.user} onClick={() => go('/account')}>{a.user ? '查看我的额度' : '登录后获得'}</Button>
      </Card>

      <Card className="pad-card plan-card plan-card-pro">
        <div className="plan-badge">推荐</div>
        <div className="plan-name">会员</div>
        <div className="plan-price">¥{PRICING.proMonthlyPriceRMB}<span>/月</span></div>
        <ul className="plan-feats">
          <li>每月 {PRICING.proMonthlyQuota} 次 AI 调用（统一额度）</li>
          <li>GPT-4o + DeepSeek-V3 平台模型自动调度</li>
          <li>云端同步与多端取回</li>
          <li>全部导出与印前能力</li>
          <li>优先体验新 AI 能力</li>
        </ul>
        {pro
          ? <Button variant="outline" onClick={() => go('/account')}>已是会员</Button>
          : <Button variant="accent" disabled={!a.user} onClick={focusActivation}>{busy ? '开通中…' : '立即订阅会员'}</Button>}
      </Card>
    </div>

    {/* 成本测算（给用户看的透明度） */}
    <Card className="pad-card plan-calc">
      <SectionLabel en="HOW IT WORKS">¥{PRICING.proMonthlyPriceRMB} 包月，能调多少次 AI？</SectionLabel>
      <p className="plan-calc-note">我们按官方价测算，把「包月 399 对应多少次」讲清楚。以下为理论值与配额成本，便于你理解定价逻辑。</p>
      <div className="calc-table">
        <div className="calc-row calc-head"><span>模型</span><span>单次成本</span><span>¥{PRICING.proMonthlyPriceRMB} 全用理论上限</span><span>会员 {PRICING.proMonthlyQuota} 次成本</span></div>
        {calc.rows.map((r) => <div className="calc-row" key={r.model}>
          <span>{r.label}</span>
          <span>¥{r.costPerCall.toFixed(3)}</span>
          <span>≈ {r.maxCalls.toLocaleString('zh-CN')} 次</span>
          <span>≈ ¥{r.quotaCost.toFixed(0)}（占 {Math.round(r.quotaRatio * 100)}%）</span>
        </div>)}
      </div>
      <pre className="plan-summary">{summary}</pre>
    </Card>

    {/* 开通（支付上线前的激活码占位） */}
    {!pro && <div ref={actRef}><Card className="pad-card activation-card">
      <SectionLabel en="ACTIVATE">订阅会员（支付上线前的内测开通）</SectionLabel>
      <p className="acct-msg">正式支付系统上线前，会员通过「激活码」开通：输入后即时获得每月 {PRICING.proMonthlyQuota} 次额度。后续会平滑替换为微信 / 支付宝支付回调，不影响已开通用户。</p>
      <div className="activation-row">
        <input ref={codeRef} className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="输入激活码" disabled={!a.user}
          onKeyDown={(e) => { if (e.key === 'Enter' && code.trim() && !busy) void activate(); }} />
        <Button variant="accent" size="sm" disabled={busy || !code.trim() || !a.user} onClick={activate}>{busy ? '开通中…' : '开通会员'}</Button>
      </div>
      {msg && <div className={`login-msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}
      {!a.user && <Notice tone="warn">请先点击右上角「登录」再订阅。</Notice>}
    </Card></div>}

    {!sub.metered && <Notice tone="warn">当前为 GitHub Pages 镜像，无法订阅（体验版无法追加安全域名）。请在正式站点 {CLOUD_SITE_URL} 登录并订阅。</Notice>}
  </div>;
}
