/* 付费墙 / 登录引导弹窗：匿名用 AI 或超额时弹出。
 * 支付系统上线前，用「激活码」占位开通会员，后续替换为支付成功回调。 */
import React, { useState } from 'react';
import { Button, Modal, Notice, Tag, go, useHash } from '../ui';
import { PRICING } from '../cloud/plans';

export type PaywallNeed = 'login' | 'subscribe';

export function PaywallModal({ open, reason, need = 'subscribe', onClose, onActivate, onLogin }: {
  open: boolean;
  reason: string;
  need?: PaywallNeed;
  onClose: () => void;
  onActivate: (code: string) => Promise<{ ok: boolean; message: string }>;
  onLogin?: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // 已经在订阅方案页时，不再显示「查看订阅方案」按钮（点了也是回到当前页）
  const onPlansPage = useHash().split('?')[0] === '/subscribe';
  // 匿名用户：先引导登录，而不是直接抛登录框打断正在填的表单
  const needLogin = need === 'login';

  const activate = async () => {
    setBusy(true); setMsg(null);
    const r = await onActivate(code.trim());
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) setCode('');
  };

  return <Modal open={open} title={needLogin ? '登录后即可使用 AI 建议' : '需要订阅会员'} onClose={onClose}>
    {reason && <Notice tone="warn">{reason}</Notice>}
    {needLogin ? <>
      <p className="modal-p">
        登录后即可在十步向导、需求汇总与在线编辑器中使用平台 AI。
        新注册用户有 <strong>{PRICING.freeTrialUses} 次免费体验</strong>，
        订阅会员后每月 <strong>{PRICING.proMonthlyQuota} 次</strong>统一 AI 调用配额。
      </p>
      <div className="sub-summary">
        <Tag tone="green">¥{PRICING.proMonthlyPriceRMB}/月</Tag>
        <span>每月 {PRICING.proMonthlyQuota} 次 AI 调用</span>
        <span>GPT-4o + DeepSeek-V3 平台模型</span>
      </div>
      <div className="modal-buttons">
        <Button variant="dark" onClick={() => { onClose(); onLogin?.(); }}>立即登录</Button>
        {!onPlansPage && <Button variant="outline" onClick={() => { onClose(); go('/subscribe'); }}>查看订阅方案</Button>}
        <Button variant="ghost" onClick={onClose}>稍后再说</Button>
      </div>
    </> : <>
      <div className="sub-summary">
        <Tag tone="green">¥{PRICING.proMonthlyPriceRMB}/月</Tag>
        <span>每月 {PRICING.proMonthlyQuota} 次 AI 调用</span>
        <span>GPT-4o + DeepSeek-V3 平台模型</span>
      </div>
      <p className="modal-p">订阅后即可在十步向导、需求汇总、在线编辑器中无限制调用平台 AI，并享受云端同步与全部导出能力。</p>
      <div className="modal-buttons">
        {!onPlansPage && <Button variant="dark" onClick={() => { onClose(); go('/subscribe'); }}>查看订阅方案</Button>}
        <Button variant="ghost" onClick={onClose}>稍后再说</Button>
      </div>
      <div className="activation-box">
        <div className="activation-head">已有激活码？（支付系统上线前的内测开通方式）</div>
        <div className="activation-row">
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="输入激活码" />
          <Button size="sm" disabled={busy || !code.trim()} onClick={activate}>{busy ? '开通中…' : '激活'}</Button>
        </div>
        {msg && <div className={`login-msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}
      </div>
    </>}
  </Modal>;
}
