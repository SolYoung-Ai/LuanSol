/* ============================================================
 * 账号安全
 * ------------------------------------------------------------
 * 改密 / 绑定邮箱 / 手机全部走真实 CloudBase 接口，且强制身份验证：
 *  - 改密：先向注册邮箱或手机发验证码（reauthenticate），
 *    再用「验证码 + 新密码」完成设置，不允许仅凭登录态直接改。
 *  - 绑定/换绑：向新邮箱或手机发验证码，校验通过后生效。
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

  // 绑定/换绑
  const [linkKind, setLinkKind] = useState<'email' | 'phone'>('email');
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
      当前是 GitHub Pages 镜像，安全域名未放行，请在正式站点操作：
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
          设置或修改密码前，需要先验证注册时使用的邮箱或手机号。点下方按钮后，验证码会发送到已绑定的邮箱或手机。
        </p>
        <div className="acct-actions" style={{ marginTop: 4 }}>
          <Button size="sm" onClick={startPwd} disabled={a.busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="lock" size={14} /> {a.busy ? '发送中…' : '验证身份并设置密码'}
          </Button>
        </div>
      </> : <>
        <p className="modal-p">身份验证码已发送到注册邮箱或手机，请填写验证码并设置新密码。</p>
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
      <SectionLabel en="LINK NEW">绑定 / 换绑</SectionLabel>
      <div className="seg login-tabs" style={{ marginBottom: 12 }}>
        <button className={linkKind === 'email' ? 'active' : ''} onClick={() => { setLinkKind('email'); setLinkCode(''); }}>绑定邮箱</button>
        <button className={linkKind === 'phone' ? 'active' : ''} onClick={() => { setLinkKind('phone'); setLinkCode(''); }}>绑定手机</button>
      </div>
      {!a.linkPending ? <>
        <label className="field"><span className="field-label">{linkKind === 'email' ? '邮箱地址' : '手机号'}</span>
          <input className="input" value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)}
            inputMode={linkKind === 'phone' ? 'numeric' : 'email'}
            placeholder={linkKind === 'email' ? 'you@example.com' : '11 位手机号'} /></label>
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
