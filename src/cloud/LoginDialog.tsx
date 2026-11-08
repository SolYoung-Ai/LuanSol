/* ============================================================
 * 登录 / 注册弹窗
 * ------------------------------------------------------------
 * 全部调用真实 CloudBase 接口：密码登录、手机号或邮箱验证码注册、
 * 验证码免密登录、退出。任何失败都原样展示服务端消息。
 * 没有配置云环境、或当前域名不在 CloudBase 白名单时，明确告知并给出口，
 * 不提供「假登录」。
 * ============================================================ */
import React, { useEffect, useState } from 'react';
import { Button, Modal, Notice, go } from '../ui';
import { useAuth } from './auth';
import { CLOUD_SITE_URL } from './config';

type Tab = 'password' | 'signup' | 'code';
const TABS: { id: Tab; label: string }[] = [
  { id: 'password', label: '密码登录' },
  { id: 'signup', label: '注册账号' },
  { id: 'code', label: '验证码登录' },
];

export function LoginDialog({ open, onClose, onDone }: {
  open: boolean;
  onClose: () => void;
  onDone?: (message: string) => void;
}) {
  const a = useAuth();
  const [tab, setTab] = useState<Tab>('password');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) { setMsg(null); setCode(''); setPassword(''); setConfirmPassword(''); a.cancelCode(); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 出现提示（尤其错误）时自动滚动到可见区，避免手机端提示落在视口外看似「没反应」
  useEffect(() => {
    if (!msg) return;
    const el = document.querySelector('.login-msg');
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [msg]);

  // 登录/注册成功后直接关闭弹窗：不再弹「账号」面板（已登录信息页已能查看），
  // 用户留在原地继续干活。
  const done = (text: string) => { setMsg({ ok: true, text }); onDone?.(text); onClose(); };

  const submitPassword = async () => {
    const r = await a.signInWithPassword(account, password);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) done(r.message);
  };

  const sendSignup = async () => {
    if (password !== confirmPassword) {
      setMsg({ ok: false, text: '两次输入的密码不一致，请重新确认' });
      return;
    }
    const r = await a.startSignup(account, password);
    setMsg({ ok: r.ok, text: r.message });
  };

  const sendCode = async () => {
    const r = await a.startCodeLogin(account);
    setMsg({ ok: r.ok, text: r.message });
  };

  const verify = async () => {
    const r = await a.verifyCode(code);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) done(r.message);
  };

  return <Modal open={open} title={a.user ? '账号' : '登录 LunaSol'} onClose={onClose}>
    {!a.configured && <Notice tone="warn">当前构建没有配置 CloudBase 环境变量，登录不可用。项目会继续保存在本机浏览器，全站功能照常使用。</Notice>}
    {a.configured && !a.originOk && <Notice tone="warn">
      当前是 GitHub Pages 镜像域名，不在 CloudBase 安全域名白名单内（当前套餐无法追加），登录请求会被浏览器拦截。
      设计、AI 与本机保存都能正常用；要登录并同步云端，请到正式站点
      <a className="inline-link" href={CLOUD_SITE_URL} target="_blank" rel="noreferrer">打开正式站点 →</a>
      （首次访问需点一次「确定访问」）。
    </Notice>}

    {a.user ? <div className="acct-box">
      <p className="modal-p">已登录为 <strong>{a.user.label}</strong>{a.user.account ? `（${a.user.account}）` : ''}</p>
      <div className="acct-actions">
        <Button variant="outline" onClick={() => { onClose(); go('/account'); }}>查看我的账户</Button>
        <Button onClick={async () => { const r = await a.signOut(); setMsg({ ok: r.ok, text: r.message }); }}>退出登录</Button>
      </div>
    </div> : <>
      {a.pending ? <>
        <p className="modal-p">验证码已发送到 <strong>{a.pending.target}</strong>。{a.pending.kind === 'signup' ? '填写后完成注册并自动登录。' : '填写后免密登录。'}</p>
        <label className="field"><span className="field-label">验证码</span>
          <input className="input" inputMode="numeric" autoComplete="one-time-code" value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="6 位数字" /></label>
        <div className="modal-buttons">
          <Button variant="ghost" onClick={() => { a.cancelCode(); setMsg(null); setCode(''); }}>返回</Button>
          <Button disabled={a.busy || code.length < 4} onClick={verify}>{a.busy ? '校验中…' : '验证并登录'}</Button>
        </div>
      </> : <>
        {/* 微信登录：当前环境未配置微信 provider，按钮会必然失败，故先不展示。
            等控制台开通微信登录并配好回调域名后再放回来（代码见 auth.signInWithWechat）。 */}
        <p className="modal-hint">用手机号或邮箱注册 / 登录。没有账号时先选「注册账号」，验证码通过后会自动登录。</p>

        <div className="seg login-tabs">{TABS.map((t) => <button key={t.id} className={tab === t.id ? 'active' : ''}
          onClick={() => { setTab(t.id); setMsg(null); }}>{t.label}</button>)}</div>

        <label className="field"><span className="field-label">{tab === 'signup' || tab === 'code' ? '手机号或邮箱' : '账号（用户名 / 手机号 / 邮箱）'}</span>
          <input className="input" value={account} onChange={(e) => setAccount(e.target.value)}
            autoComplete="username" placeholder={tab === 'password' ? '用户名，例如 lunasol_user' : '手机号或邮箱'} /></label>

        {tab !== 'code' && <label className="field"><span className="field-label">密码</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
            placeholder={tab === 'signup' ? '至少 8 位' : '你的登录密码'}
            onKeyDown={(e) => { if (e.key === 'Enter' && tab === 'password') void submitPassword(); }} /></label>}

        {tab === 'signup' && <label className="field"><span className="field-label">确认密码</span>
          <input className="input" type="password" value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password" placeholder="再次输入密码" /></label>}

        {tab === 'signup' && <p className="modal-hint">注册需要手机号或邮箱：手机号走短信验证码，邮箱走邮件验证码。用户名可在注册后用于密码登录。</p>}
        {tab === 'code' && <p className="modal-hint">已注册的手机号或邮箱可以用验证码免密登录，不需要记密码。</p>}

        <div className="modal-buttons">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          {tab === 'password' && <Button disabled={a.busy} onClick={submitPassword}>{a.busy ? '登录中…' : '登录'}</Button>}
          {tab === 'signup' && <Button disabled={a.busy} onClick={sendSignup}>{a.busy ? '发送中…' : '发送验证码'}</Button>}
          {tab === 'code' && <Button disabled={a.busy} onClick={sendCode}>{a.busy ? '发送中…' : '发送验证码'}</Button>}
        </div>
      </>}

      {msg && <div className={`login-msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}
      {a.error && a.error !== msg?.text && <div className="login-msg bad">{a.error}</div>}
      <p className="modal-foot">账号由 CloudBase 云开发身份服务托管；登录后项目会按账号隔离保存在云端数据库里。</p>
    </>}
  </Modal>;
}
