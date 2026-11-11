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
import { LOGIN_CONFIG, NO_SMS_HINT, NO_SMS_HINT_EN } from './loginConfig';
import { useLang } from '../i18n';

type Tab = 'password' | 'code';

/** 由配置常量生成主入口，控制台关掉的方式不会出现在界面上（含已关闭的短信）。 */
/** 标签文案存双语：模块加载时拿不到当前语言 */
const TABS: { id: Tab; zh: string; en: string }[] = [
  ...(LOGIN_CONFIG.methods.password ? [{ id: 'password' as Tab, zh: '密码登录', en: 'Password' }] : []),
  ...(LOGIN_CONFIG.methods.emailCode ? [{ id: 'code' as Tab, zh: '邮箱验证码', en: 'Email code' }] : []),
];

/** 云端返回「邮箱还没账号」时的兜底：自动把注册表单展开，避免新用户被堵死。 */
const NEED_SIGNUP = /不存在|未注册|尚未注册|没有账号|not\s*found|not\s*exist|no\s*user|signup/i;

/** Google 官方四色 G：登录按钮上必须用这个，不要用单色占位图标 */
function GoogleMark({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z" />
    <path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8 41.1 15.4 46 24 46z" />
    <path fill="#FBBC05" d="M11.8 28.2c-.5-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2.1 20.4 2.1 24s.9 6.9 2.4 9.9l7.3-5.7z" />
    <path fill="#EA4335" d="M24 10.8c3.3 0 6.2 1.1 8.5 3.4l6.3-6.3C35 4.3 30 2 24 2 15.4 2 8 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z" />
  </svg>;
}

export function LoginDialog({ open, onClose, onDone }: {
  open: boolean;
  onClose: () => void;
  onDone?: (message: string) => void;
}) {
  const a = useAuth();
  const { lang, t } = useLang();
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
  const report = (r: { ok: boolean; message: string }, fallback = t('操作失败，请稍后重试', 'Something went wrong. Please try again.')) => {
    const text = r.ok ? r.message : (humanizeAuthError(r.message, fallback, lang) || fallback);
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
    const text = report(r, t('登录失败，请检查网络后重试', 'Sign-in failed — check your network and try again'));
    if (r.ok) done(text);
  };

  const sendSignup = async () => {
    if (!isEmail(account)) { setMsg({ ok: false, text: t(`请输入正确的邮箱地址。${NO_SMS_HINT}`, `Enter a valid email address. ${NO_SMS_HINT_EN}`) }); return; }
    if (password !== confirmPassword) {
      setMsg({ ok: false, text: t('两次输入的密码不一致，请重新确认', 'The two passwords do not match — please re-enter') });
      return;
    }
    const r = await a.startSignup(account, password);
    report(r, t('注册失败，请稍后重试', 'Sign-up failed — please try again'));
  };

  const sendCode = async () => {
    if (!isEmail(account)) { setMsg({ ok: false, text: t(`请输入正确的邮箱地址。${NO_SMS_HINT}`, `Enter a valid email address. ${NO_SMS_HINT_EN}`) }); return; }
    const r = await a.startCodeLogin(account);
    if (!r.ok && NEED_SIGNUP.test(r.message)) {
      setShowSignup(true);
      setMsg({ ok: false, text: t('这个邮箱还没有账号，请在下方设置密码完成注册。', 'This email has no account yet — set a password below to sign up.') });
      return;
    }
    report(r, t('验证码发送失败，请稍后重试', 'Could not send the code — please try again'));
  };

  const verify = async () => {
    const r = await a.verifyCode(code);
    const text = report(r, t('验证码校验失败，请重新发送', 'Code verification failed — request a new code'));
    if (r.ok) done(text);
  };

  const brand = LOGIN_CONFIG.brand;
  const emailField = showSignup || tab === 'code';

  return <Modal open={open} title={a.user ? t('账号', 'Account') : t('登录', 'Sign in')} onClose={onClose}>
    {!a.user && <div className="login-brand">
      <img src={brand.logo} alt="" />
      <div>
        <div className="login-brand-name">{brand.name}</div>
        <span className="login-brand-tag">{t(brand.tagline, 'Everyone can be a designer')}</span>
      </div>
    </div>}

    {!a.configured && <Notice tone="warn">{t('当前构建没有配置 CloudBase 环境变量，登录不可用。项目会继续保存在本机浏览器，全站功能照常使用。', 'This build has no CloudBase environment configured, so signing in is unavailable. Projects keep saving in this browser and the rest of the site works as usual.')}</Notice>}
    {a.configured && !a.originOk && <Notice tone="warn">
      {t('当前域名不在 CloudBase 安全域名白名单内，登录请求会被浏览器拦截。设计、AI 与本机保存都能正常使用；要登录并同步云端，请到正式站点',
        'This domain is not in the CloudBase allowed-origin list, so sign-in requests will be blocked. Design, AI and local saving all still work; to sign in and sync to the cloud, use the official site')}
      <a className="inline-link" href={CLOUD_SITE_URL} target="_blank" rel="noreferrer">{t('打开正式站点 →', 'Open the official site →')}</a>
    </Notice>}

    {a.user ? <div className="acct-box">
      <p className="modal-p">{t('已登录为', 'Signed in as')} <strong>{a.user.label}</strong>{a.user.account ? ` (${a.user.account})` : ''}</p>
      <div className="acct-actions">
        <Button variant="outline" onClick={() => { onClose(); go('/account'); }}>{t('查看我的账户', 'View my account')}</Button>
        <Button onClick={async () => { const r = await a.signOut(); setMsg({ ok: r.ok, text: r.message }); }}>{t('退出登录', 'Sign out')}</Button>
      </div>
    </div> : <>
      {a.pending ? <>
        <p className="modal-p">{t('验证码已发送到', 'We sent a code to')} <strong>{a.pending.target}</strong>。{a.pending.kind === 'signup' ? t('填写后完成注册并自动登录。', 'Enter it to finish signing up — you will be signed in automatically.') : t('填写后免密登录。', 'Enter it to sign in without a password.')}</p>
        <label className="field"><span className="field-label">{t('邮箱验证码', 'Email code')}</span>
          <input className="input" inputMode="numeric" autoComplete="one-time-code" value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder={t('6 位数字', '6 digits')} /></label>
        <div className="modal-buttons">
          <Button variant="ghost" onClick={() => { a.cancelCode(); setMsg(null); setCode(''); }}>{t('返回', 'Back')}</Button>
          <Button disabled={a.busy || code.length < 4} onClick={verify}>{a.busy ? t('校验中…', 'Verifying…') : t('验证并登录', 'Verify and sign in')}</Button>
        </div>
      </> : <>
        {/* 微信登录：当前环境未配置微信 provider，按钮会必然失败，故先不展示。
            等控制台开通微信登录并配好回调域名后再放回来（代码见 auth.signInWithWechat）。 */}
        <p className="modal-hint">{t('用邮箱验证码登录，首次使用会自动创建账号；已设置密码也可直接登录。', 'Sign in with an email code — first use creates the account automatically. If you have set a password you can use that instead.')}</p>

        {TABS.length > 1 && <div className="seg login-tabs">{TABS.map((x) => <button key={x.id}
          className={tab === x.id && !showSignup ? 'active' : ''}
          onClick={() => { setTab(x.id); setShowSignup(false); setMsg(null); }}>{lang === 'en' ? x.en : x.zh}</button>)}</div>}

        <label className="field"><span className="field-label">{emailField ? t('邮箱地址', 'Email address') : t('账号（邮箱 / 用户名 / 已绑定手机号）', 'Account (email / username / linked phone)')}</span>
          <input className="input" value={account} onChange={(e) => setAccount(e.target.value)}
            type={emailField ? 'email' : 'text'} inputMode={emailField ? 'email' : 'text'}
            autoComplete="email" placeholder={emailField ? 'you@example.com' : t('邮箱或用户名', 'Email or username')} /></label>

        {(tab === 'password' || showSignup) && <label className="field"><span className="field-label">{showSignup ? t('设置密码', 'Set a password') : t('密码', 'Password')}</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={showSignup ? 'new-password' : 'current-password'}
            placeholder={showSignup ? t('至少 8 位', 'At least 8 characters') : t('你的登录密码', 'Your password')}
            onKeyDown={(e) => { if (e.key === 'Enter' && tab === 'password' && !showSignup) void submitPassword(); }} /></label>}

        {showSignup && <label className="field"><span className="field-label">{t('确认密码', 'Confirm password')}</span>
          <input className="input" type="password" value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password" placeholder={t('再次输入密码', 'Enter the password again')} /></label>}

        {showSignup && <p className="modal-hint">{t('注册验证码只发到邮箱；设置密码后可同时用「邮箱 + 密码」登录。', 'The sign-up code only goes to your email. Once you set a password you can also sign in with email and password.')}</p>}
        {!showSignup && tab === 'code' && <p className="modal-hint">{t('验证码会发送到邮箱；未注册的邮箱将自动创建账号，不需要单独注册。', 'The code is sent to your email. An unregistered email gets an account created automatically — no separate sign-up needed.')}</p>}

        <div className="modal-buttons">
          <Button variant="ghost" onClick={onClose}>{t('取消', 'Cancel')}</Button>
          {showSignup
            ? <Button disabled={a.busy} onClick={sendSignup}>{a.busy ? t('发送中…', 'Sending…') : t('注册并登录', 'Sign up and sign in')}</Button>
            : tab === 'password'
              ? <Button disabled={a.busy} onClick={submitPassword}>{a.busy ? t('登录中…', 'Signing in…') : t('登录', 'Sign in')}</Button>
              : <Button disabled={a.busy} onClick={sendCode}>{a.busy ? t('发送中…', 'Sending…') : t('发送邮箱验证码', 'Send email code')}</Button>}
        </div>

        {/* 社交登录：控制台「Google Web 端」已启用，跳转授权后由 SDK 用回跳的 code 建会话 */}
        {LOGIN_CONFIG.methods.google && <>
          <div className="login-or"><span>{t('或', 'or')}</span></div>
          <button type="button" className="login-oauth" disabled={a.busy}
            onClick={async () => { const r = await a.signInWithGoogle(); if (!r.ok) setMsg({ ok: false, text: r.message }); }}>
            <GoogleMark />
            <span>{t('使用 Google 账号登录', 'Continue with Google')}</span>
          </button>
        </>}

        {!showSignup && LOGIN_CONFIG.register.enabled && LOGIN_CONFIG.register.mode === 'auto' &&
          <p className="login-secondary">{t('想用密码登录？', 'Prefer a password?')}<button onClick={() => { setTab('code'); setShowSignup(true); setMsg(null); }}>{t('设置密码 / 注册账号', 'Set a password / sign up')}</button></p>}
        {showSignup && <p className="login-secondary"><button onClick={() => { setShowSignup(false); setMsg(null); }}>{t('← 返回登录', '← Back to sign in')}</button></p>}
      </>}

      {msg && <div className={`login-msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}
      {a.error && a.error !== msg?.text && <div className="login-msg bad">{a.error}</div>}
      {/* 注册就要收集邮箱、并在云端保存项目，属于个人信息处理：
          这句小字 + 两个可点的说明页，是「告知—同意」里最低限度的那一半。
          不做勾选框：本项目用邮箱验证码/密码直接登录，勾选框反而更容易被无视。 */}
      <p className="login-legal">
        {t('继续即表示你已阅读并同意', 'By continuing you confirm you have read and agree to the')}
        <button onClick={() => { onClose(); window.location.href = './terms/'; }}>{t('《服务条款》', 'Terms of Service')}</button>
        {t('与', 'and')}
        <button onClick={() => { onClose(); window.location.href = './privacy/'; }}>{t('《隐私说明》', 'Privacy Notice')}</button>
      </p>
      <p className="modal-foot">{t('账号由 CloudBase 云开发身份服务托管；短信验证码已停用，验证码仅通过邮箱发送。登录后项目按账号隔离保存在云端。', 'Accounts are hosted by CloudBase identity services. SMS codes are disabled, so codes only go out by email. Once signed in, projects are stored in the cloud, isolated per account.')}</p>
    </>}
  </Modal>;
}
