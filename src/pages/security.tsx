/* ============================================================
 * 账号安全
 * ------------------------------------------------------------
 * 改密 / 绑定邮箱全部走真实 CloudBase 接口，且强制身份验证：
 *  - 改密：先向注册邮箱发验证码（reauthenticate），
 *    再用「验证码 + 新密码」完成设置，不允许仅凭登录态直接改。
 *  - 绑定/换绑：向新邮箱发验证码，校验通过后生效。
 *  - 短信验证码已在控制台关闭（成本约 0.05 元/条），因此不再提供绑定手机入口；
 *    已绑定的手机号仍作为只读信息展示，不影响历史账号登录。
 * 失败原样展示服务端消息，不做假入口。
 * ============================================================ */
import React, { useState } from 'react';
import { Button, Card, Empty, Notice, PageHead, SectionLabel } from '../ui';
import { useAuth } from '../cloud/auth';
import { LoginDialog } from '../cloud/LoginDialog';
import { useApp } from '../store';
import { cloudConfigured, cloudOriginSupported, CLOUD_SITE_URL } from '../cloud/config';
import { Icon } from '../components/icons';

export default function Security() {
  const a = useAuth();
  const { setToast } = useApp();
  const [loginOpen, setLoginOpen] = useState(false);

  // 改密两步：验证码 + 新密码 + 确认密码
  const [pwdNonce, setPwdNonce] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');

  // 绑定/换绑：短信已停用，只允许邮箱
  const linkKind = 'email' as const;
  const [linkTarget, setLinkTarget] = useState('');
  const [linkCode, setLinkCode] = useState('');

  if (!cloudConfigured) {
    return <div className="page page-narrow">
      <PageHead kicker="SECURITY" title="账号安全" desc="当前构建未接入云服务。" />
      <Notice tone="warn">未配置 CloudBase，账号安全功能不可用。</Notice>
    </div>;
  }

  if (!a.user) {
    return <div className="page page-narrow">
      <PageHead kicker="SECURITY" title="账号安全" />
      <Empty title="请先登录" desc="登录后才能管理绑定方式与密码。"
        action={<Button onClick={() => setLoginOpen(true)}>登录 / 注册</Button>} />
      <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} onDone={(m) => setToast(m)} />
    </div>;
  }

  const startPwd = async () => {
    const r = await a.startPasswordChange();
    setToast(r.message);
  };

  const submitPwd = async () => {
    if (pwdNew !== pwdConfirm) { setToast('两次输入的新密码不一致'); return; }
    const r = await a.confirmPasswordChange(pwdNonce, pwdNew);
    setToast(r.message);
    if (r.ok) { setPwdNonce(''); setPwdNew(''); setPwdConfirm(''); }
  };

  const sendLinkCode = async () => {
    const r = await a.startLink(linkKind, linkTarget);
    setToast(r.message);
  };

  const submitLink = async () => {
    const r = await a.verifyLink(linkCode);
    setToast(r.message);
    if (r.ok) { setLinkTarget(''); setLinkCode(''); }
  };

  return <div className="page page-narrow">
    <PageHead kicker="SECURITY" title="账号安全" desc="管理绑定方式与登录密码。" />

    {!cloudOriginSupported() && <Notice tone="warn">
      当前域名不在 CloudBase 安全域名白名单内，登录与账号操作会被浏览器拦截，请在正式站点操作：
      <a className="inline-link" href={CLOUD_SITE_URL} target="_blank" rel="noreferrer">打开正式站点 →</a>
    </Notice>}

    <Card className="pad-card">
      <SectionLabel en="BINDINGS">当前绑定</SectionLabel>
      <div className="acct-row"><span>登录账号</span><strong>{a.user.account || '—'}</strong></div>
      <div className="acct-row"><span>邮箱</span><strong>{a.user.email || '未绑定'}</strong></div>
      <div className="acct-row"><span>手机号</span><strong>{a.user.phone || '未绑定'}</strong></div>
    </Card>

    <Card className="pad-card">
      <SectionLabel en="PASSWORD">登录密码</SectionLabel>
      {!a.reauthPending ? <>
        <p style={{ margin: '0 0 12px', color: '#888', fontSize: 13, lineHeight: 1.7 }}>
          设置或修改密码前，需要先验证注册邮箱。点下方按钮后，验证码会发送到已绑定的邮箱。
        </p>
        <div className="acct-actions" style={{ marginTop: 4 }}>
          <Button size="sm" onClick={startPwd} disabled={a.busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="lock" size={14} /> {a.busy ? '发送中…' : '验证身份并设置密码'}
          </Button>
        </div>
      </> : <>
        <p className="modal-p">身份验证码已发送到注册邮箱，请填写验证码并设置新密码。</p>
        <label className="field"><span className="field-label">身份验证码</span>
          <input className="input" inputMode="numeric" autoComplete="one-time-code" value={pwdNonce}
            onChange={(e) => setPwdNonce(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="6 位数字" /></label>
        <label className="field"><span className="field-label">新密码</span>
          <input className="input" type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)}
            autoComplete="new-password" placeholder="至少 8 位" /></label>
        <label className="field"><span className="field-label">确认新密码</span>
          <input className="input" type="password" value={pwdConfirm} onChange={(e) => setPwdConfirm(e.target.value)}
            autoComplete="new-password" /></label>
        <div className="acct-actions" style={{ marginTop: 12 }}>
          <Button size="sm" onClick={submitPwd} disabled={a.busy || !pwdNonce || !pwdNew}>{a.busy ? '提交中…' : '确认修改'}</Button>
          <Button size="sm" variant="ghost" onClick={a.cancelPasswordChange}>取消</Button>
        </div>
      </>}
    </Card>

    <Card className="pad-card">
      <SectionLabel en="LINK EMAIL">绑定 / 换绑邮箱</SectionLabel>
      {!a.linkPending ? <>
        <label className="field"><span className="field-label">邮箱地址</span>
          <input className="input" value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)}
            inputMode="email" type="email" autoComplete="email" placeholder="you@example.com" /></label>
        <p className="modal-hint">短信验证码已停用，暂不提供手机号绑定；已绑定的手机号仍可用于密码登录。</p>
        <div className="acct-actions" style={{ marginTop: 12 }}>
          <Button size="sm" onClick={sendLinkCode} disabled={a.busy || !linkTarget.trim()}>{a.busy ? '发送中…' : '发送验证码'}</Button>
        </div>
      </> : <>
        <p className="modal-p">验证码已发送到 <strong>{a.linkPending.target}</strong>。</p>
        <label className="field"><span className="field-label">验证码</span>
          <input className="input" inputMode="numeric" value={linkCode}
            onChange={(e) => setLinkCode(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="6 位数字" /></label>
        <div className="acct-actions" style={{ marginTop: 12 }}>
          <Button size="sm" onClick={submitLink} disabled={a.busy || linkCode.length < 4}>{a.busy ? '校验中…' : '完成绑定'}</Button>
          <Button size="sm" variant="ghost" onClick={a.cancelLink}>取消</Button>
        </div>
      </>}
    </Card>

    <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} onDone={(m) => setToast(m)} />
  </div>;
}
