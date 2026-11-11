/* 付费墙 / 登录引导弹窗：匿名用 AI 或超额时弹出。
 * 2026-11-11 Creem 审核通过，支付通道已正式开放：这里的主动作是「去订阅页下单」，
 * 兑换码只是国内用户的备选通道。
 * 旧的「输入激活码即开通」输入框不会回来——它背后的前端校验形同虚设。 */
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

  /* 会员不含固定积分包：积分只有「每日签到 / 充值 / 兑换码」三个来源。
     以前这里写「开通得 3000 积分」，用户开通后发现余额不是这么来的，说不清。 */
  const planLine = <>
    <span>签到双倍（每日 +20 积分，月上限 600）</span>
    <span>全部对话模型 · 云端同步 · 印刷级导出</span>
  </>;

  // 标题跟着原因走：点「切换对话模型」被拦时还说「额度已用完」会让人以为积分没了
  const title = needLogin
    ? '登录后即可使用 AI 建议'
    : /用完|已过期|不足/.test(reason) ? '会员额度已用完' : '开通会员，解锁全部能力';

  return <Modal open={open} title={title} onClose={onClose}>
    {reason && <Notice tone="warn">{reason}</Notice>}
    {needLogin ? <>
      <p className="modal-p">
        登录后即可在九步向导、需求汇总与在线编辑器中使用平台 AI。
        新注册用户有 <strong>{PRICING.freeTrialUses} 积分免费体验</strong>。
      </p>
      <div className="sub-summary">
        <Tag tone="green">免费体验 {PRICING.freeTrialUses} 积分</Tag>
        <span>会员：签到双倍 + 全部功能解锁（不含固定积分包）</span>
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
        会员 <strong>US${PRICING.proMonthlyPriceUSD}/月</strong>，用银行卡 / Apple Pay / Google Pay 在线订阅，
        开通后立即生效，随时可取消续费。
        会员<strong>不含固定积分包</strong>，积分来自每日签到（会员双倍）、积分包购买或兑换码。
        内置设计引擎、编辑、3D 预览、印前检查与 PNG / JPG 预览图不依赖会员；
        印刷级文件导出（PDF / SVG / DXF / ZIP）、云端跨设备同步与全部历史版本为会员权益。
      </p>
      <Notice tone="info">额度用完后，AI 建议会自动回退为内置设计引擎的结果，并如实标注「未调用 AI」。</Notice>
      <div className="modal-buttons">
        {!onPlansPage && <Button variant="dark" onClick={() => { onClose(); go('/subscribe'); }}>订阅会员 · US${PRICING.proMonthlyPriceUSD}/月</Button>}
        {onPlansPage && <Button variant="dark" onClick={onClose}>去看上方套餐</Button>}
        <Button variant="ghost" onClick={onClose}>稍后再说</Button>
      </div>
    </>}
  </Modal>;
}
