/* ============================================================
 * 会员说明页：免费 / 会员对比、当前真实状态、成本测算
 * ------------------------------------------------------------
 *  - 支付系统尚未接入：页面只说明「即将开放」，不提供任何前端开通入口；
 *    旧版的激活码输入框已移除（前端无法校验，任意字符串都能开通，属于后门）；
 *  - 所有价格与额度数字都来自 src/cloud/plans.ts（唯一权威来源），界面不写死；
 *  - 当前状态、剩余次数来自 useSubscription 的真实数据。
 * ============================================================ */
import React, { useMemo } from 'react';
import { Button, Card, Notice, PageHead, SectionLabel, Tag, go } from '../ui';
import { useAuth } from '../cloud/auth';
import { useSubscription, remainingOf, isProActive } from '../cloud/subscription';
import { PRICING, buildPlanCalc, planSummaryText } from '../cloud/plans';
import { CLOUD_SITE_URL } from '../cloud/config';

export default function Subscribe() {
  const a = useAuth();
  const sub = useSubscription();

  const calc = useMemo(() => buildPlanCalc(), []);
  const summary = useMemo(() => planSummaryText(), []);

  const left = sub.usedLeft ?? (sub.sub ? remainingOf(sub.sub) : 0);
  const pro = isProActive(sub.sub);

  return <div className="page subscribe-page">
    <PageHead kicker="MEMBERSHIP" title="会员说明"
      desc="平台统一接入 DeepSeek，模型与密钥都在服务端，你不需要也无法自己配置。会员开通通道尚未上线，当前不扣费。" />

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
          <li>平台统一接入 DeepSeek（服务端持有密钥）</li>
          <li>云端同步与多端取回</li>
          <li>全部导出与印前能力</li>
          <li>优先体验新 AI 能力</li>
        </ul>
        {pro
          ? <Button variant="outline" onClick={() => go('/account')}>已是会员</Button>
          : <Button variant="accent" disabled onClick={() => {}}>即将开放</Button>}
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

    {/* 开通状态：如实说明，不放任何前端开通入口 */}
    {!pro && <Card className="pad-card activation-card">
      <SectionLabel en="STATUS">会员开通状态</SectionLabel>
      <p className="acct-msg">
        会员开通通道尚未上线：真实价格、权益与扣款将以服务端支付回调为准。
        当前<strong>不会扣费</strong>，也不会出现任何「已开通」的假状态。
        内置设计引擎、在线编辑、3D 预览、印前检查与文件导出都不依赖会员，可继续使用。
      </p>
      <div className="activation-row">
        <Button variant="accent" disabled>即将开放</Button>
        <Button variant="ghost" onClick={() => go('/account')}>查看我的额度</Button>
      </div>
      {!a.user && <Notice tone="warn">请先登录，登录后系统会自动记录你的真实额度。</Notice>}
    </Card>}

    {!sub.metered && <Notice tone="warn">当前为 GitHub Pages 镜像，无法订阅（体验版无法追加安全域名）。请在正式站点 {CLOUD_SITE_URL} 登录并订阅。</Notice>}
  </div>;
}
