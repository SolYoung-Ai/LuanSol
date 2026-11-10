/* 付费墙 / 登录引导弹窗：匿名用 AI 或超额时弹出。
 * 支付系统未接入：这里只解释额度与状态，不提供任何「输入激活码即开通」的入口。
 * 旧版激活输入框已移除——它背后的前端校验形同虚设（任意字符串都可开通）。 */
import React from 'react';
import { Button, Modal, Notice, Tag, go, useHash } from '../ui';
import { PRICING } from '../cloud/plans';

export type PaywallNeed = 'login' | 'subscribe';

export function PaywallModal({ open, reason, need = 'subscribe', onClose, onLogin }: {
  open: boolean;
  reason: string;
  need?: PaywallNeed;
  onClose: () => void;
  /** 保留接口签名，便于接入真实支付后复用；当前版本不开放任何前端开通入口。 */
  onActivate?: (code: string) => Promise<{ ok: boolean; message: string }>;
  onLogin?: () => void;
}) {
  // 已经在订阅方案页时，不再显示「查看订阅方案」按钮（点了也是回到当前页）
  const onPlansPage = useHash().split('?')[0] === '/subscribe';
  // 匿名用户：先引导登录，而不是直接抛登录框打断正在填的表单
  const needLogin = need === 'login';

  const planLine = <>
    <span>开通得 {PRICING.proMonthlyQuota} 积分</span>
    <span>DeepSeek / Kimi / Doubao-Seed 等多模型接入</span>
  </>;

  return <Modal open={open} title={needLogin ? '登录后即可使用 AI 建议' : '会员额度已用完'} onClose={onClose}>
    {reason && <Notice tone="warn">{reason}</Notice>}
    {needLogin ? <>
      <p className="modal-p">
        登录后即可在九步向导、需求汇总与在线编辑器中使用平台 AI。
        新注册用户有 <strong>{PRICING.freeTrialUses} 积分免费体验</strong>。
      </p>
      <div className="sub-summary">
        <Tag tone="green">免费体验 {PRICING.freeTrialUses} 积分</Tag>
        <span>会员开通得 {PRICING.proMonthlyQuota} 积分</span>
      </div>
      <div className="modal-buttons">
        <Button variant="dark" onClick={() => { onClose(); onLogin?.(); }}>立即登录</Button>
        {!onPlansPage && <Button variant="outline" onClick={() => { onClose(); go('/subscribe'); }}>查看会员说明</Button>}
        <Button variant="ghost" onClick={onClose}>稍后再说</Button>
      </div>
    </> : <>
      <div className="sub-summary">
        <Tag tone="green">会员已开放</Tag>
        {planLine}
      </div>
      <p className="modal-p">
        会员目前通过<strong>兑换码</strong>开通（支付通道接入前不产生扣费），兑换后立即生效。
        内置设计引擎、编辑、3D 预览、印前检查与导出不依赖会员，可继续使用。
      </p>
      <Notice tone="info">额度用完后，AI 建议会自动回退为内置设计引擎的结果，并如实标注「未调用 AI」。</Notice>
      <div className="modal-buttons">
        {!onPlansPage && <Button variant="dark" onClick={() => { onClose(); go('/subscribe'); }}>用兑换码开通</Button>}
        <Button variant="ghost" onClick={onClose}>知道了</Button>
      </div>
    </>}
  </Modal>;
}
