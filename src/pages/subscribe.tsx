/* ============================================================
 * 会员说明页
 * ------------------------------------------------------------
 * 三条硬规则（改动前务必读）：
 *  1. 支付未接入：页面只说明「即将开放」，前端不提供任何开通入口，
 *     也不出现「已开通」的假状态。旧激活码输入框已移除（任意字符串即可开通，属后门）。
 *  2. 价格与额度只从 src/cloud/plans.ts 读，界面不写死数字。
 *  3. 不向用户展示「按 token 算的推理成本 / 毛利」。成本是内部经营数据，
 *     摆在用户面前既不可读，也容易被理解成「你们很赚」。用户真正关心的是
 *     「这一次值多少钱、能干什么、什么时候不扣次数」——页面只回答这三个问题。
 * ============================================================ */
import React from 'react';
import { Button, Card, Notice, PageHead, SectionLabel, Tag, go } from '../ui';
import { useAuth } from '../cloud/auth';
import { useSubscription, remainingOf, isProActive } from '../cloud/subscription';
import { PRICING } from '../cloud/plans';
import { CLOUD_SITE_URL } from '../cloud/config';
import { useLang } from '../i18n';

/** 单次 AI 建议的折算单价（元）。纯算术，不掺任何成本口径。 */
const UNIT_PRICE = PRICING.proMonthlyPriceRMB / PRICING.proMonthlyQuota; // 0.665 → 展示 0.67
const PER_DAY = Math.round(PRICING.proMonthlyQuota / 30);                // 20 次/天（满月口径）
const DAYS = 30;

export default function Subscribe() {
  const a = useAuth();
  const sub = useSubscription();
  const { lang, t } = useLang();

  const left = sub.usedLeft ?? (sub.sub ? remainingOf(sub.sub) : 0);
  const pro = isProActive(sub.sub);

  return <div className="page subscribe-page">
    <PageHead
      kicker="MEMBERSHIP"
      title={t('会员说明', 'Membership')}
      desc={t(
        '平台统一接入 DeepSeek，模型与密钥都在服务端，你不需要也无法自己配置。会员开通通道尚未上线，当前不扣费。',
        'LunaSol runs DeepSeek behind our own server; the key never reaches your browser. Checkout is not live yet — nothing is charged today.'
      )}
    />

    {/* 当前状态 */}
    <Card className="pad-card sub-status-card">
      <SectionLabel en={lang === 'en' ? '' : 'YOUR PLAN'}>{t('当前状态', 'Your plan')}</SectionLabel>
      {!a.user
        ? <Notice tone="warn">{t(
            `尚未登录。登录后系统会为你自动开通 ${PRICING.freeTrialUses} 次免费体验；订阅会员后可享每月 ${PRICING.proMonthlyQuota} 次 AI 调用。`,
            `You are not signed in. Signing in grants ${PRICING.freeTrialUses} free AI calls; members get ${PRICING.proMonthlyQuota} calls per month.`
          )}</Notice>
        : pro ? <>
          <div className="sub-status-row"><span>{t('套餐', 'Plan')}</span><Tag tone="green">{t(`会员 · ¥${PRICING.proMonthlyPriceRMB}/月`, `Member · ¥${PRICING.proMonthlyPriceRMB}/mo`)}</Tag></div>
          <div className="sub-status-row"><span>{t('有效期至', 'Valid until')}</span><strong>{sub.sub?.period_end ? new Date(sub.sub.period_end).toLocaleDateString() : '—'}</strong></div>
          <div className="sub-status-row"><span>{t('本月剩余', 'Remaining this month')}</span><strong>{left} / {PRICING.proMonthlyQuota} {t('次', 'calls')}</strong></div>
          <div className="quota-bar"><span style={{ width: `${PRICING.proMonthlyQuota ? (left / PRICING.proMonthlyQuota) * 100 : 0}%` }} /></div>
          <Button variant="outline" size="sm" onClick={() => go('/account')}>{t('在账户页管理', 'Manage in account')}</Button>
        </>
        : <>
          <div className="sub-status-row"><span>{t('套餐', 'Plan')}</span><Tag>{t('免费体验', 'Free trial')}</Tag></div>
          <div className="sub-status-row"><span>{t('剩余', 'Remaining')}</span><strong>{left} / {PRICING.freeTrialUses} {t('次', 'calls')}</strong></div>
          <div className="quota-bar free"><span style={{ width: `${PRICING.freeTrialUses ? (left / PRICING.freeTrialUses) * 100 : 0}%` }} /></div>
          <p className="acct-msg">{t(
            `免费体验用完后可订阅会员，每月 ${PRICING.proMonthlyQuota} 次 AI 调用。`,
            `When the trial runs out, membership gives you ${PRICING.proMonthlyQuota} AI calls a month.`
          )}</p>
        </>}
    </Card>

    {/* 会员价值：只讲「一次多少钱、能干什么、什么时候不扣」 */}
    <Card className="pad-card value-card">
      <SectionLabel en={lang === 'en' ? '' : 'WHAT YOU PAY FOR'}>{t('这一次，到底值多少', 'What one call is worth')}</SectionLabel>

      <div className="value-stats">
        <div className="value-stat">
          <strong>¥{UNIT_PRICE.toFixed(2)}</strong>
          <span>{t('单次 AI 建议', 'per AI suggestion')}</span>
        </div>
        <div className="value-stat">
          <strong>{PRICING.proMonthlyQuota}</strong>
          <span>{t('次 / 月', 'calls / month')}</span>
        </div>
        <div className="value-stat">
          <strong>{PER_DAY}</strong>
          <span>{t('次 / 天（摊到 30 天）', 'calls a day, across 30 days')}</span>
        </div>
      </div>

      {/* 把 600 次摊成 30 天的刻度：不是装饰，是让「600」有一个能看见的形状 */}
      <div className="value-scale" aria-hidden>
        {Array.from({ length: DAYS }).map((_, i) => <i key={i} />)}
      </div>
      <p className="value-scale-note">{t(
        `每一格 = 一天，可以做完 ${PER_DAY} 次 AI 建议。一整月 ${PRICING.proMonthlyQuota} 次。`,
        `Each tick is one day of ${PER_DAY} suggestions — ${PRICING.proMonthlyQuota} across a full month.`
      )}</p>
      <p className="value-scale-note">{t(
        `单价是这样算出来的：¥${PRICING.proMonthlyPriceRMB} ÷ ${PRICING.proMonthlyQuota} 次 = ${(PRICING.proMonthlyPriceRMB / PRICING.proMonthlyQuota).toFixed(3)}，按分四舍五入为 ¥${UNIT_PRICE.toFixed(2)}。`,
        `Unit price = ¥${PRICING.proMonthlyPriceRMB} ÷ ${PRICING.proMonthlyQuota} = ${(PRICING.proMonthlyPriceRMB / PRICING.proMonthlyQuota).toFixed(3)}, rounded to ¥${UNIT_PRICE.toFixed(2)}.`
      )}</p>

      <div className="value-rules">
        <div className="value-rule">
          <strong>{t('一次 = 一次真实的 AI 调用', 'One call = one real model run')}</strong>
          <span>{t(
            '在九步向导里点一次「获取建议」并成功返回，才计 1 次。失败回退到内置引擎时不计次。',
            'One "Get suggestions" that actually returns from the model counts as one. Fallbacks to the built-in engine are not counted.'
          )}</span>
        </div>
        <div className="value-rule">
          <strong>{t('不按秒计费，也不看输入长短', 'No metering by seconds or prompt length')}</strong>
          <span>{t(
            '不论你上传多少 Logo、写多长的产品描述，一次建议都算 1 次——成本波动由平台承担。',
            'Uploads and long briefs do not change the count: one suggestion is one call, whatever it carries.'
          )}</span>
        </div>
        <div className="value-rule">
          <strong>{t('设计引擎、编辑、3D、印前、导出全部不计次', 'Design engine, editing, 3D, prepress, export are free')}</strong>
          <span>{t(
            '这些能力是本地确定性计算，不消耗模型额度。额度只用于真的向模型提问。',
            'Those run deterministically on your device. Quota is only spent when we actually ask the model.'
          )}</span>
        </div>
        <div className="value-rule">
          <strong>{t('按月刷新，未用完不结转', 'Resets monthly, unused calls do not roll over')}</strong>
          <span>{t(
            `每个计费周期开始时额度重置为 ${PRICING.proMonthlyQuota} 次，不做累积。`,
            `At the start of each billing period the balance returns to ${PRICING.proMonthlyQuota}.`
          )}</span>
        </div>
      </div>

      <p className="value-foot">{t(
        `换个角度：600 次够你把 30 个包装方向各打磨 20 轮，单次 ¥${UNIT_PRICE.toFixed(2)}。`,
        `Put another way: ${PRICING.proMonthlyQuota} calls is 30 packaging directions, each refined 20 times, at ¥${UNIT_PRICE.toFixed(2)} a call.`
      )}</p>
    </Card>

    {/* 套餐对比 */}
    <div className="plan-grid">
      <Card className="pad-card plan-card">
        <div className="plan-name">{t('免费体验', 'Free trial')}</div>
        <div className="plan-price">¥0</div>
        <ul className="plan-feats">
          <li>{t(`${PRICING.freeTrialUses} 次 AI 调用（新注册自动获得）`, `${PRICING.freeTrialUses} AI calls, granted at signup`)}</li>
          <li>{t('内置确定性设计引擎（不调用大模型）', 'Built-in deterministic design engine')}</li>
          <li>{t('本机保存项目', 'Projects saved on this device')}</li>
          <li>{t('基础导出能力', 'Core export formats')}</li>
        </ul>
        <Button variant="outline" disabled={!a.user} onClick={() => go('/account')}>{a.user ? t('查看我的额度', 'View my quota') : t('登录后获得', 'Available after sign-in')}</Button>
      </Card>

      <Card className="pad-card plan-card plan-card-pro">
        <div className="plan-badge">{t('推荐', 'Recommended')}</div>
        <div className="plan-name">{t('会员', 'Member')}</div>
        <div className="plan-price">¥{PRICING.proMonthlyPriceRMB}<span>/{t('月', 'mo')}</span></div>
        <ul className="plan-feats">
          <li>{t(`每月 ${PRICING.proMonthlyQuota} 次 AI 调用（统一额度）`, `${PRICING.proMonthlyQuota} AI calls every month`)}</li>
          <li>{t('平台统一接入 DeepSeek（服务端持有密钥）', 'DeepSeek runs server-side, key never exposed')}</li>
          <li>{t('云端同步与多端取回', 'Cloud sync across devices')}</li>
          <li>{t('全部导出与印前能力', 'All export and prepress features')}</li>
          <li>{t('优先体验新 AI 能力', 'Early access to new AI features')}</li>
        </ul>
        {pro
          ? <Button variant="outline" onClick={() => go('/account')}>{t('已是会员', 'Current plan')}</Button>
          : <Button variant="accent" disabled onClick={() => {}}>{t('即将开放', 'Coming soon')}</Button>}
      </Card>
    </div>

    {/* 开通状态：如实说明，不放任何前端开通入口 */}
    {!pro && <Card className="pad-card activation-card">
      <SectionLabel en={lang === 'en' ? '' : 'STATUS'}>{t('会员开通状态', 'Checkout status')}</SectionLabel>
      <p className="acct-msg">{t(
        '会员开通通道尚未上线：真实价格、权益与扣款将以服务端支付回调为准。当前不会扣费，也不会出现任何「已开通」的假状态。内置设计引擎、在线编辑、3D 预览、印前检查与文件导出都不依赖会员，可继续使用。',
        'Checkout is not live yet: price, entitlements and payment will be confirmed by a server-side callback. Nothing is charged today and no fake "active" state is shown. The design engine, editor, 3D preview, prepress and exports do not require membership.'
      )}</p>
      <div className="activation-row">
        <Button variant="accent" disabled>{t('即将开放', 'Coming soon')}</Button>
        <Button variant="ghost" onClick={() => go('/account')}>{t('查看我的额度', 'View my quota')}</Button>
      </div>
      {!a.user && <Notice tone="warn">{t('请先登录，登录后系统会自动记录你的真实额度。', 'Sign in first — your real quota is recorded once you do.')}</Notice>}
    </Card>}

    {!sub.metered && <Notice tone="warn">{t(
      `当前为 GitHub Pages 镜像，无法订阅（体验版无法追加安全域名）。请在正式站点 ${CLOUD_SITE_URL} 登录并订阅。`,
      `This is the GitHub Pages mirror, where sign-in and subscription are unavailable. Use the primary site at ${CLOUD_SITE_URL}.`
    )}</Notice>}
  </div>;
}
