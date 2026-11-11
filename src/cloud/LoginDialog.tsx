/* ============================================================
 * 登录 / 注册弹窗（自建 React UI，不是 CloudBase 托管登录页）
 * ------------------------------------------------------------
 * 控制台「身份认证 → 登录页」的品牌化与登录方式配置不会自动作用到本站，
 * 前端镜像放在 cloud/loginConfig.ts。改开关时两边必须同步。
 *
 * 当前配置（2026-11-09）：
 *   账户密码登录 ✅ / 邮箱验证码 ✅ / 短信验证码 ❌（用户因成本关闭）
 *   注册模式 = 自动注册并登录，不展示独立注册入口
 *   企业名称 = LunaSol
 *
 * 所有验证码只走邮箱：keys.emailTarget() 在数据层兜底，
 * 任何路径都不会构造 phone 参数，也就不会产生短信费用。
 * 失败一律原样展示服务端消息，不提供假登录。
 * ============================================================ */
import React, { useEffect, useState } from 'react';
import { Button, Modal, Notice, go } from '../ui';
import { useAuth, isEmail } from './auth';
import { humanizeAuthError } from './authErrors';
import { CLOUD_SITE_URL } from './config';
import { LOGIN_CONFIG, NO_SMS_HINT } from './loginConfig';

type Tab = 'password' | 'code';

/** 由配置常量生成主入口，控制台关掉的方式不会出现在界面上（含已关闭的短信）。 */
const TABS: { id: Tab; label: string }[] = [
  ...(LOGIN_CONFIG.methods.password ? [{ id: 'password' as Tab, label: '密码登录' }] : []),
  ...(LOGIN_CONFIG.methods.emailCode ? [{ id: 'code' as Tab, label: '邮箱验证码' }] : []),
];

/** 云端返回「邮箱还没账号」时的兜底：自动把注册表单展开，避免新用户被堵死。 */
const NEED_SIGNUP = /不存在|未注册|尚未注册|没有账号|not\s*found|not\s*exist|no\s*user|signup/i;

export function LoginDialog({ open, onClose, onDone }: {
  open: boolean;
  onClose: () => void;
  onDone?: (message: string) => void;
}) {
  const a = useAuth();
  const [tab, setTab] = useState<Tab>(TABS[0]?.id ?? 'code');
  const [showSignup, setShowSignup] = useState(false);
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) {
      setMsg(null); setCode(''); setPassword(''); setConfirmPassword('');
      setShowSignup(false); setTab(TABS[0]?.id ?? 'code');
      a.cancelCode();
    } else {
      // 打开时清掉上一次残留的后台错误：旧会话恢复失败之类的东西
      // 与这次登录无关，留着只会让人以为「还没操作就出错了」。
      a.clearError();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 统一整理返回文案：成功原样，失败翻成中文，内部噪音兜底成一句人话 */
  const report = (r: { ok: boolean; message: string }, fallback = '操作失败，请稍后重试') => {
    const text = r.ok ? r.message : (humanizeAuthError(r.message, fallback) || fallback);
    setMsg({ ok: r.ok, text });
    return text;
  };

  // 出现提示（尤其错误）时自动滚动到可见区，避免手机端提示落在视口外看似「没反应」
  useEffect(() => {
    if (!msg) return;
    const el = document.querySelector('.login-msg');
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [msg]);

  // 登录/注册成功后直接关闭弹窗，用户留在原地继续干活。
  const done = (text: string) => { setMsg({ ok: true, text }); onDone?.(text); onClose(); };

  const submitPassword = async () => {
    const r = await a.signInWithPassword(account, password);
    const text = report(r, '登录失败，请检查网络后重试');
    if (r.ok) done(text);
  };

  const sendSignup = async () => {
    if (!isEmail(account)) { setMsg({ ok: false, text: `请输入正确的邮箱地址。${NO_SMS_HINT}` }); return; }
    if (password !== confirmPassword) {
      setMsg({ ok: false, text: '两次输入的密码不一致，请重新确认' });
      return;
    }
    const r = await a.startSignup(account, password);
    report(r, '注册失败，请稍后重试');
  };

  const sendCode = async () => {
    if (!isEmail(account)) { setMsg({ ok: false, text: `请输入正确的邮箱地址。${NO_SMS_HINT}` }); return; }
    const r = await a.startCodeLogin(account);
    if (!r.ok && NEED_SIGNUP.test(r.message)) {
      setShowSignup(true);
      setMsg({ ok: false, text: '这个邮箱还没有账号，请在下方设置密码完成注册。' });
      return;
    }
    report(r, '验证码发送失败，请稍后重试');
  };

  const verify = async () => {
    const r = await a.verifyCode(code);
    const text = report(r, '验证码校验失败，请重新发送');
    if (r.ok) done(text);
  };

  const brand = LOGIN_CONFIG.brand;
  const emailField = showSignup || tab === 'code';

  return <Modal open={open} title={a.user ? '账号' : '登录'} onClose={onClose}>
    {!a.user && <div className="login-brand">
      <img src={brand.logo} alt="" />
      <div>
        <div className="login-brand-name">{brand.name}</div>
        <span className="login-brand-tag">{brand.tagline}</span>
      </div>
    </div>}

    {!a.configured && <Notice tone="warn">当前构建没有配置 CloudBase 环境变量，登录不可用。项目会继续保存在本机浏览器，全站功能照常使用。</Notice>}
    {a.configured && !a.originOk && <Notice tone="warn">
      当前域名不在 CloudBase 安全域名白名单内，登录请求会被浏览器拦截。
      设计、AI 与本机保存都能正常使用；要登录并同步云端，请到正式站点
      <a className="inline-link" href={CLOUD_SITE_URL} target="_blank" rel="noreferrer">打开正式站点 →</a>
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
        <label className="field"><span className="field-label">邮箱验证码</span>
          <input className="input" inputMode="numeric" autoComplete="one-time-code" value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="6 位数字" /></label>
        <div className="modal-buttons">
          <Button variant="ghost" onClick={() => { a.cancelCode(); setMsg(null); setCode(''); }}>返回</Button>
          <Button disabled={a.busy || code.length < 4} onClick={verify}>{a.busy ? '校验中…' : '验证并登录'}</Button>
        </div>
      </> : <>
        {/* 微信登录：当前环境未配置微信 provider，按钮会必然失败，故先不展示。
            等控制台开通微信登录并配好回调域名后再放回来（代码见 auth.signInWithWechat）。 */}
        <p className="modal-hint">用邮箱验证码登录，首次使用会自动创建账号；已设置密码也可直接登录。</p>

        {TABS.length > 1 && <div className="seg login-tabs">{TABS.map((t) => <button key={t.id}
          className={tab === t.id && !showSignup ? 'active' : ''}
          onClick={() => { setTab(t.id); setShowSignup(false); setMsg(null); }}>{t.label}</button>)}</div>}

        <label className="field"><span className="field-label">{emailField ? '邮箱地址' : '账号（邮箱 / 用户名 / 已绑定手机号）'}</span>
          <input className="input" value={account} onChange={(e) => setAccount(e.target.value)}
            type={emailField ? 'email' : 'text'} inputMode={emailField ? 'email' : 'text'}
            autoComplete="email" placeholder={emailField ? 'you@example.com' : '邮箱或用户名'} /></label>

        {(tab === 'password' || showSignup) && <label className="field"><span className="field-label">{showSignup ? '设置密码' : '密码'}</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={showSignup ? 'new-password' : 'current-password'}
            placeholder={showSignup ? '至少 8 位' : '你的登录密码'}
            onKeyDown={(e) => { if (e.key === 'Enter' && tab === 'password' && !showSignup) void submitPassword(); }} /></label>}

        {showSignup && <label className="field"><span className="field-label">确认密码</span>
          <input className="input" type="password" value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password" placeholder="再次输入密码" /></label>}

        {showSignup && <p className="modal-hint">注册验证码只发到邮箱；设置密码后可同时用「邮箱 + 密码」登录。</p>}
        {!showSignup && tab === 'code' && <p className="modal-hint">验证码会发送到邮箱；未注册的邮箱将自动创建账号，不需要单独注册。</p>}

        <div className="modal-buttons">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          {showSignup
            ? <Button disabled={a.busy} onClick={sendSignup}>{a.busy ? '发送中…' : '注册并登录'}</Button>
            : tab === 'password'
              ? <Button disabled={a.busy} onClick={submitPassword}>{a.busy ? '登录中…' : '登录'}</Button>
              : <Button disabled={a.busy} onClick={sendCode}>{a.busy ? '发送中…' : '发送邮箱验证码'}</Button>}
        </div>

        {!showSignup && LOGIN_CONFIG.register.enabled && LOGIN_CONFIG.register.mode === 'auto' &&
          <p className="login-secondary">想用密码登录？<button onClick={() => { setTab('code'); setShowSignup(true); setMsg(null); }}>设置密码 / 注册账号</button></p>}
        {showSignup && <p className="login-secondary"><button onClick={() => { setShowSignup(false); setMsg(null); }}>← 返回登录</button></p>}
      </>}

      {msg && <div className={`login-msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}
      {a.error && a.error !== msg?.text && <div className="login-msg bad">{a.error}</div>}
      {/* 注册就要收集邮箱、并在云端保存项目，属于个人信息处理：
          这句小字 + 两个可点的说明页，是「告知—同意」里最低限度的那一半。
          不做勾选框：本项目用邮箱验证码/密码直接登录，勾选框反而更容易被无视。 */}
      <p className="login-legal">
        继续即表示你已阅读并同意
        <button onClick={() => { onClose(); go('/terms'); }}>《服务条款》</button>
        与
        <button onClick={() => { onClose(); go('/privacy'); }}>《隐私说明》</button>
      </p>
      <p className="modal-foot">账号由 CloudBase 云开发身份服务托管；短信验证码已停用，验证码仅通过邮箱发送。登录后项目按账号隔离保存在云端。</p>
    </>}
  </Modal>;
}
