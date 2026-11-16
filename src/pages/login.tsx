/* ============================================================
 * /login —— LunaSol 2.0 独立登录 / 注册页
 * ------------------------------------------------------------
 * 布局参考：左侧深色品牌视觉（橙色粒子场）+ 右侧暖白表单，
 * 右上角是「登录 / 创建账户」切换——不是第三方托管页，全部自建。
 *
 * 认证能力严格对齐现有 CloudBase 实现（src/cloud/auth.tsx）：
 *   · 邮箱验证码登录（startCodeLogin → verifyCode）
 *   · 邮箱 + 密码登录（signInWithPassword）
 *   · 邮箱 + 密码注册（startSignup → verifyCode）
 *   · Google OAuth（signInWithGoogle，回跳后由 SDK 建会话）
 * 不做任何假登录：失败一律展示服务端可读文案。
 *
 * 登录成功后回到 ?next= 指定的原地（例如 /studio），不打断用户流程。
 * ============================================================ */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { go } from '../ui';
import { useAuth, isEmail } from '../cloud/auth';
import { humanizeAuthError } from '../cloud/authErrors';
import { LOGIN_CONFIG, NO_SMS_HINT, NO_SMS_HINT_EN } from '../cloud/loginConfig';
import { useLang } from '../i18n';
import BrandLoop from '../site/BrandLoop';

type Mode = 'in' | 'up';
type Step = 'email' | 'code' | 'password';

/** 云端返回「邮箱还没有账号」时的兜底：直接切到注册，不把新用户堵在登录页。 */
const NEED_SIGNUP = /不存在|未注册|尚未注册|没有账号|not\s*found|not\s*exist|no\s*user|signup/i;

/** 登录后回哪里：只接受站内 hash 路径，避免被构造成外链跳转。 */
function nextTarget(): string {
  const q = window.location.hash.split('?')[1] || '';
  const raw = new URLSearchParams(q).get('next') || '';
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/studio';
}

/** Google 官方四色 G */
function GoogleMark({ size = 17 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z" />
    <path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8 41.1 15.4 46 24 46z" />
    <path fill="#FBBC05" d="M11.8 28.2c-.5-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2.1 20.4 2.1 24s.9 6.9 2.4 9.9l7.3-5.7z" />
    <path fill="#EA4335" d="M24 10.8c3.3 0 6.2 1.1 8.5 3.4l6.3-6.3C35 4.3 30 2 24 2 15.4 2 8 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z" />
  </svg>;
}

/** 左侧品牌视觉：整块白底上循环播放首页那支品牌开场动画。
 *  这一版把包装静物、橙色晨光、橙色山峰微标全部撤掉了——
 *  2.0 的 logo 只有一个：Luna 黑 + Sol 橙的字标，任何位置都不再出现图形微标。 */
function BrandField() {
  return <div className="lg-visual" aria-hidden>
    <div className="lg-v-loop"><BrandLoop /></div>
  </div>;
}

export default function Login() {
  const a = useAuth();
  const { t, lang } = useLang();
  const next = useMemo(nextTarget, []);
  const [mode, setMode] = useState<Mode>(() =>
    /(^|&)mode=signup/.test(window.location.hash.split('?')[1] || '') ? 'up' : 'in');
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [left, setLeft] = useState(0);          // 重发倒计时（秒）
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  /* 已登录（含 Google 回跳后 SDK 建好会话）→ 直接回原地，不再让人看表单 */
  useEffect(() => {
    if (a.user && a.ready) {
      const id = window.setTimeout(() => go(next), done ? 520 : 180);
      return () => window.clearTimeout(id);
    }
  }, [a.user, a.ready, done, next]);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  const startCountdown = () => {
    setLeft(45);
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      setLeft((n) => {
        if (n <= 1) { if (timer.current) window.clearInterval(timer.current); return 0; }
        return n - 1;
      });
    }, 1000);
  };

  const say = (r: { ok: boolean; message: string }, fallback: string) => {
    const text = r.ok ? r.message : (humanizeAuthError(r.message, fallback, lang) || fallback);
    setMsg({ ok: r.ok, text });
    return r.ok;
  };

  const reset = (m: Mode) => {
    setMode(m); setStep('email'); setMsg(null); setCode('');
    setPassword(''); setConfirm(''); a.cancelCode();
  };

  const onContinue = async () => {
    if (!isEmail(email.trim())) {
      setMsg({ ok: false, text: t(`请输入正确的邮箱地址。${NO_SMS_HINT}`, `Enter a valid email address. ${NO_SMS_HINT_EN}`) });
      return;
    }
    if (mode === 'up') { setStep('password'); setMsg(null); return; }
    const r = await a.startCodeLogin(email.trim());
    if (!r.ok && NEED_SIGNUP.test(r.message)) {
      setMode('up'); setStep('password');
      setMsg({ ok: false, text: t('这个邮箱还没有账号，设置一个密码即可创建。', 'No account for this email yet — set a password to create one.') });
      return;
    }
    if (say(r, t('验证码发送失败，请稍后重试', 'Could not send the code — please try again'))) {
      setStep('code'); setCode(''); startCountdown();
    }
  };

  const onVerify = async () => {
    const r = await a.verifyCode(code);
    if (say(r, t('验证码校验失败，请重新发送', 'Code verification failed — request a new code'))) {
      setDone(true);
      setMsg({ ok: true, text: r.message });
    }
  };

  const onPasswordSignIn = async () => {
    const r = await a.signInWithPassword(email.trim(), password);
    if (say(r, t('登录失败，请检查邮箱与密码', 'Sign-in failed — check your email and password'))) { setDone(true); }
  };

  const onSignup = async () => {
    if (password.length < 8) { setMsg({ ok: false, text: t('密码至少 8 位', 'Passwords must be at least 8 characters') }); return; }
    if (password !== confirm) { setMsg({ ok: false, text: t('两次输入的密码不一致', 'The two passwords do not match') }); return; }
    const r = await a.startSignup(email.trim(), password);
    if (say(r, t('注册失败，请稍后重试', 'Sign-up failed — please try again'))) {
      setStep('code'); setCode(''); startCountdown();
    }
  };

  const onResend = async () => {
    if (left > 0 || a.busy) return;
    const r = mode === 'up'
      ? await a.startSignup(email.trim(), password)
      : await a.startCodeLogin(email.trim());
    if (say(r, t('发送失败，请稍后重试', 'Could not send — please try again'))) startCountdown();
  };

  const onGoogle = async () => {
    const r = await a.signInWithGoogle();
    if (!r.ok) setMsg({ ok: false, text: r.message });
  };

  const busy = a.busy;
  const title = mode === 'in' ? t('登录', 'Sign in') : t('创建账户', 'Create account');

  return <div className="lg">
    <BrandField />

    <section className="lg-panel">
      <header className="lg-top">
        <a className="lg-brand" href="#/" onClick={(e) => { e.preventDefault(); go('/'); }}>
          <span className="lg-brand-name">Luna<i>Sol</i></span>
        </a>
        <div className="lg-toggle" role="tablist" aria-label={t('登录或创建账户', 'Sign in or create account')}>
          <button role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'is-on' : ''}
            onClick={() => reset('in')}>{t('登录', 'Sign in')}</button>
          <button role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'is-on' : ''}
            onClick={() => reset('up')}>{t('创建账户', 'Create account')}</button>
        </div>
      </header>

      <div className="lg-form">
        <h1 className="lg-h1">{title}</h1>

        {!a.configured && <p className="lg-msg is-warn">
          {t('当前构建未配置云端环境变量，登录不可用；项目仍会保存在本机浏览器。',
            'This build has no cloud environment configured, so signing in is unavailable. Projects still save in this browser.')}
        </p>}
        {a.configured && !a.originOk && <p className="lg-msg is-warn">
          {t('当前域名不在云端安全域名白名单内，登录会被浏览器拦截，请使用正式站点。',
            'This domain is not in the cloud allowed-origin list, so sign-in will be blocked. Please use the official site.')}
        </p>}

        {step === 'email' && <>
          {LOGIN_CONFIG.methods.google && <>
            <button type="button" className="lg-oauth" disabled={busy} onClick={onGoogle}>
              <GoogleMark />
              <span>{t('使用 Google 账号继续', 'Continue with Google')}</span>
            </button>
            <div className="lg-or"><i /><span>{t('或', 'or')}</span><i /></div>
          </>}

          <label className="lg-label" htmlFor="lg-email">{t('邮箱地址', 'Email address')}</label>
          <input id="lg-email" className="lg-input" type="email" inputMode="email" autoComplete="email"
            spellCheck={false} value={email} placeholder={t('请输入您的电子邮件地址', 'Enter your email address')}
            onChange={(e) => { setEmail(e.target.value); setMsg(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void onContinue(); }} />

          <button className="lg-primary" disabled={busy || !email.trim()} onClick={onContinue}>
            {busy ? t('处理中…', 'Working…') : t('继续', 'Continue')}<span aria-hidden>→</span>
          </button>

          <p className="lg-hint">
            {mode === 'in'
              ? <>{t('还没有账号？在上方切换到', 'New here? Pick')} <button onClick={() => reset('up')}>{t('创建账户', 'Create account')}</button>{t('。', ' above.')}</>
              : <>{t('已有账号？在上方切换到', 'Already registered? Pick')} <button onClick={() => reset('in')}>{t('登录', 'Sign in')}</button>{t('。', ' above.')}</>}
          </p>
          {mode === 'in' && LOGIN_CONFIG.methods.password &&
            <p className="lg-hint"><button onClick={() => { setStep('password'); setMsg(null); }}>
              {t('改用邮箱 + 密码登录', 'Use email and password instead')}
            </button></p>}
        </>}

        {step === 'password' && <>
          {mode === 'up' ? <>
            <p className="lg-sub">{t('为', 'For')} <strong>{email}</strong>{t(' 设置密码，之后也能用它登录。', ' — set a password you can sign in with later.')}</p>
            <label className="lg-label" htmlFor="lg-pw">{t('设置密码', 'Password')}</label>
            <input id="lg-pw" className="lg-input" type="password" autoComplete="new-password" value={password}
              placeholder={t('至少 8 位', 'At least 8 characters')}
              onChange={(e) => { setPassword(e.target.value); setMsg(null); }} />
            <label className="lg-label" htmlFor="lg-pw2">{t('确认密码', 'Confirm password')}</label>
            <input id="lg-pw2" className="lg-input" type="password" autoComplete="new-password" value={confirm}
              placeholder={t('再次输入密码', 'Enter the password again')}
              onChange={(e) => { setConfirm(e.target.value); setMsg(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void onSignup(); }} />
            <button className="lg-primary" disabled={busy || !password || !confirm} onClick={onSignup}>
              {busy ? t('处理中…', 'Working…') : t('创建账户', 'Create account')}<span aria-hidden>→</span>
            </button>
          </> : <>
            <p className="lg-sub">{t('用注册时的邮箱和密码登录。', 'Sign in with the email and password you registered with.')}</p>
            <label className="lg-label" htmlFor="lg-email2">{t('邮箱地址', 'Email address')}</label>
            <input id="lg-email2" className="lg-input" type="email" inputMode="email" autoComplete="email"
              spellCheck={false} value={email} placeholder={t('请输入您的电子邮件地址', 'Enter your email address')}
              onChange={(e) => { setEmail(e.target.value); setMsg(null); }} />
            <label className="lg-label" htmlFor="lg-pw">{t('密码', 'Password')}</label>
            <input id="lg-pw" className="lg-input" type="password" autoComplete="current-password" value={password}
              placeholder={t('你的登录密码', 'Your password')}
              onChange={(e) => { setPassword(e.target.value); setMsg(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && password) void onPasswordSignIn(); }} />
            <button className="lg-primary" disabled={busy || !password || !email.trim()} onClick={onPasswordSignIn}>
              {busy ? t('登录中…', 'Signing in…') : t('登录', 'Sign in')}<span aria-hidden>→</span>
            </button>
          </>}
          <p className="lg-hint">
            {mode === 'up'
              ? <button onClick={() => reset('in')}>{t('已有账号？去登录', 'Already have an account? Sign in')}</button>
              : <button onClick={() => { setStep('email'); setMsg(null); setPassword(''); }}>{t('改用邮箱验证码登录', 'Use an email code instead')}</button>}
          </p>
        </>}

        {step === 'code' && <>
          <p className="lg-sub">{t('验证码已发送至', 'We sent a code to')} <strong>{email}</strong></p>
          <label className="lg-label" htmlFor="lg-code">{t('邮箱验证码', 'Email code')}</label>
          <input id="lg-code" className="lg-input lg-code" inputMode="numeric" autoComplete="one-time-code"
            value={code} placeholder="000000" maxLength={8}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 8)); setMsg(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && code.length >= 4) void onVerify(); }} />
          <button className="lg-primary" disabled={busy || code.length < 4} onClick={onVerify}>
            {busy ? t('校验中…', 'Verifying…') : t('验证并继续', 'Verify and continue')}<span aria-hidden>→</span>
          </button>
          <p className="lg-hint">
            <button disabled={left > 0 || busy} onClick={onResend}>
              {left > 0 ? t(`${left} 秒后可重新发送`, `Resend in ${left}s`) : t('重新发送验证码', 'Resend code')}
            </button>
            {' · '}
            <button onClick={() => { setStep('email'); setMsg(null); a.cancelCode(); }}>{t('返回', 'Back')}</button>
          </p>
        </>}

        {msg && <p className={`lg-msg ${msg.ok ? 'is-ok' : 'is-bad'}`}>{msg.text}</p>}
        {a.error && a.error !== msg?.text && <p className="lg-msg is-bad">{a.error}</p>}

        <p className="lg-legal">
          {t('继续即表示你已阅读并同意', 'By continuing you agree to the')}
          <a href="./terms/">{t('《服务条款》', 'Terms of Service')}</a>
          {t('与', 'and')}
          <a href="./privacy/">{t('《隐私说明》', 'Privacy Notice')}</a>
        </p>
      </div>

      <footer className="lg-foot">
        <span className="lg-foot-word">Luna<i>Sol</i></span>
        <span className="lg-foot-help">
          {t('需要帮助？', 'Need help?')} <a href="mailto:hello@solyoung.top">hello@solyoung.top</a>
        </span>
      </footer>
    </section>
  </div>;
}
