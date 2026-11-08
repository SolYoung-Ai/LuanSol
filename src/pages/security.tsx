/* ============================================================
 * 账号安全
 * ------------------------------------------------------------
 * 绑定邮箱 / 手机号（验证码真流程）+ 修改密码（旧密码真校验）。
 * 全部调用 CloudBase auth SDK 真实接口，失败原样展示，不做假入口。
 * ============================================================ */
import React, { useState } from 'react';
import { Button, Card, Empty, Notice, PageHead, SectionLabel } from '../ui';
import { useAuth } from '../cloud/auth';
import { LoginDialog } from '../cloud/LoginDialog';
import { useApp } from '../store';
import { cloudConfigured, cloudOriginSupported, CLOUD_SITE_URL } from '../cloud/config';

export default function Security() {
  const a = useAuth();
  const { setToast } = useApp();
  const [loginOpen, setLoginOpen] = useState(false);

  // 设置密码
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

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

  const submitChangePwd = async () => {
    if (newPwd !== confirmPwd) { setToast('两次输入的新密码不一致'); return; }
    const r = await a.changePassword(newPwd);
    setToast(r.message);
    if (r.ok) { setNewPwd(''); setConfirmPwd(''); }
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
      <SectionLabel en="SET PASSWORD">设置登录密码</SectionLabel>
      <p style={{ margin: '0 0 12px', color: '#888', fontSize: 13 }}>手机验证码登录后可设置密码，下次用手机号+密码登录。</p>
      <label className="field"><span className="field-label">新密码</span>
        <input className="input" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" placeholder="至少 8 位" /></label>
      <label className="field"><span className="field-label">确认新密码</span>
        <input className="input" type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} autoComplete="new-password" /></label>
      <div className="acct-actions" style={{ marginTop: 12 }}>
        <Button size="sm" onClick={submitChangePwd} disabled={a.busy || !newPwd}>{a.busy ? '提交中…' : '设置密码'}</Button>
      </div>
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
          <Button size="sm" variant="ghost" onClick={() => { setLinkCode(''); }}>取消</Button>
        </div>
      </>}
    </Card>

    <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} onDone={(m) => setToast(m)} />
  </div>;
}
