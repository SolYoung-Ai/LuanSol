/* 积分不足 / 登录引导弹窗。
 * 纯积分制（2026-11-14）：没有会员、订阅、有效期或续费，
 * 被拦截时只做两件事——引导登录，或引导获取积分。 */
import React from 'react';
import { Button, Modal, Notice, Tag, go, useHash } from '../ui';
import { PRICING } from '../cloud/plans';
import { useLang } from '../i18n';

export type PaywallNeed = 'login' | 'credits';

export function PaywallModal({ open, reason, need = 'credits', onClose, onLogin }: {
  open: boolean;
  reason: string;
  need?: PaywallNeed;
  onClose: () => void;
  onLogin?: () => void;
}) {
  const { t } = useLang();
  const here = useHash().split('?')[0];
  const onCreditsPage = here === '/credits' || here === '/subscribe';
  const needLogin = need === 'login';

  const title = needLogin
    ? t('登录后即可使用 AI 建议', 'Sign in to use AI suggestions')
    : t('积分不足', 'Out of credits');

  return <Modal open={open} title={title} onClose={onClose}>
    {reason && <Notice tone="warn">{reason}</Notice>}
    {needLogin ? <>
      <p className="modal-p">
        {t('登录后即可在九步向导、需求汇总与在线编辑器中使用平台 AI。新注册用户有 ', 'Sign in to use platform AI in the wizard, the requirements summary and the online editor. New accounts get ')}
        <strong>{t(`${PRICING.freeTrialUses} 积分免费体验`, `${PRICING.freeTrialUses} free credits`)}</strong>{t('。', '.')}
      </p>
      <div className="sub-summary">
        <Tag tone="green">{t(`免费体验 ${PRICING.freeTrialUses} 积分`, `${PRICING.freeTrialUses} free credits`)}</Tag>
        <span>{t('AI 生图按档位扣积分，余额用完可购买积分包或每日签到', 'AI image generation spends credits per tier — buy a pack or check in daily when you run low')}</span>
      </div>
      <div className="modal-buttons">
        <Button variant="dark" onClick={() => { onClose(); onLogin?.(); }}>{t('立即登录', 'Sign in now')}</Button>
        {!onCreditsPage && <Button variant="outline" onClick={() => { onClose(); go('/credits'); }}>{t('了解积分', 'About credits')}</Button>}
        <Button variant="ghost" onClick={onClose}>{t('稍后再说', 'Maybe later')}</Button>
      </div>
    </> : <>
      <div className="sub-summary">
        <Tag tone="green">{t('每天签到 +10 积分', '+10 credits for daily check-in')}</Tag>
        <span>{t('积分包：1000 / 2100 / 3500 三档，永久有效', 'Credit packs: 1000 / 2100 / 3500, never expire')}</span>
      </div>
      <p className="modal-p">
        {t('LunaSol 只用一个数字计量：积分余额。AI 生图按档位扣分，内置设计引擎、编辑、3D 预览、印前检查、印刷级导出与云端同步都不额外收费，也不扣积分。', 'LunaSol uses one number: your credit balance. AI image generation spends credits per tier. The built-in design engine, editor, 3D preview, prepress checks, print-grade export and cloud sync are all included and spend no credits.')}
      </p>
      <Notice tone="info">{t('积分用完后，AI 建议会回退为内置设计引擎的结果，并如实标注「未调用 AI」。', 'When you run out of credits, AI suggestions fall back to the built-in engine and are labelled “AI not called”.')}</Notice>
      <div className="modal-buttons">
        {!onCreditsPage && <Button variant="dark" onClick={() => { onClose(); go('/credits'); }}>{t('去获取积分', 'Get credits')}</Button>}
        {onCreditsPage && <Button variant="dark" onClick={onClose}>{t('去看上方积分包', 'See the packs above')}</Button>}
        <Button variant="ghost" onClick={onClose}>{t('稍后再说', 'Maybe later')}</Button>
      </div>
    </>}
  </Modal>;
}
