/* ============================================================
 * 账户信息（原「个人资料」+「账号安全」合并页）
 * ------------------------------------------------------------
 * 一页管完：头像 / 昵称 / 生日、登录密码、绑定换绑邮箱。
 * 交互按 iOS 设置页组织：分组玻璃卡 + 可展开的行，默认看不到一堆
 * 输入框与分割线；点开某行才出现对应编辑区。
 *
 * 云端项目列表不在这里重复：工作台已经是项目的唯一入口，
 * 两处各放一份列表只会让「取回 / 删除」出现两套口径。
 *
 * 所有写操作仍是真实 CloudBase 接口，且改密强制二次身份验证：
 *  - 改密：先向注册邮箱发验证码（reauthenticate），再「验证码 + 新密码」提交。
 *  - 换绑：向新邮箱发验证码，校验通过后生效。
 *  - 短信验证码已在控制台关闭（成本约 0.05 元/条），不提供绑定手机入口。
 * 失败原样展示服务端消息，不做假入口。
 * ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { Notice, go } from '../ui';
import { useLang } from '../i18n';
import { useAuth } from '../cloud/auth';
import { useProfile } from '../cloud/profile';
import { useSubscription } from '../cloud/subscription';
import { LoginDialog } from '../cloud/LoginDialog';
import { cloudConfigured, cloudOriginSupported, CLOUD_SITE_URL } from '../cloud/config';
import { Icon, type IconName } from '../components/icons';

/** Creem 的客户自助门户：用购买时的邮箱登录即可查订单、下载发票、取消续费。
 *  条款里承诺「可在账户页取消续费」，所以这里必须给出真实可点的入口——
 *  由我们代客点「取消」既做不到也说不清，交给 MoR 的自助门户最稳。 */
const CREEM_PORTAL = 'https://creem.io/my-orders/login';

type Panel = 'profile' | 'password' | 'email' | null;

/** 分组里的一个图标胶囊：颜色由 CSS 变量控制，浅深色自动适配 */
function Ico({ name }: { name: IconName }) {
  return <span className="ag-ico"><Icon name={name} size={17} /></span>;
}

export default function Account() {
  const a = useAuth();
  const profile = useProfile();
  const sub = useSubscription();
  const { setToast } = useApp();
  const { lang, t } = useLang();
  const [loginOpen, setLoginOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));

  /* ---- 个人资料 ---- */
  const [nick, setNick] = useState('');
  const [avatar, setAvatar] = useState('');
  const [birthday, setBirthdayLocal] = useState('');
  const [saving, setSaving] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  /* ---- 改密（验证码 + 新密码 + 确认） ---- */
  const [pwdNonce, setPwdNonce] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');

  /* ---- 绑定 / 换绑：短信已停用，只允许邮箱 ---- */
  const [linkTarget, setLinkTarget] = useState('');
  const [linkCode, setLinkCode] = useState('');

  const onPickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // 压缩到 128x128，转 base64
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        setAvatar(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!a.user) return;
    setNick(a.user.label === a.user.id ? '' : a.user.label);
    setAvatar(profile.profile?.avatar_url || a.user.avatarUrl || '');
    setBirthdayLocal(profile.profile?.birthday || '');
  }, [a.user?.id, a.user?.label, a.user?.avatarUrl, profile.profile?.avatar_url, profile.profile?.birthday]);

  const saveProfile = async () => {
    if (!a.user) return;
    setSaving(true);
    try {
      await profile.updateAvatar(avatar.trim());
      await profile.updateBirthday(birthday);
      const r = await a.updateProfile({ nickName: nick.trim() || undefined });
      if (!r.ok) { setToast(r.message); return; }
      setToast(t('个人资料已保存（云端同步）', 'Profile saved and synced to the cloud.'));
    } catch (e) {
      setToast(t('保存失败：', 'Save failed: ') + ((e as Error).message || t('未知错误', 'unknown error')));
    } finally {
      setSaving(false);
    }
  };

  const startPwd = async () => {
    const r = await a.startPasswordChange();
    setToast(r.message);
  };
  const submitPwd = async () => {
    if (pwdNew !== pwdConfirm) { setToast(t('两次输入的新密码不一致', 'The two new passwords do not match.')); return; }
    const r = await a.confirmPasswordChange(pwdNonce, pwdNew);
    setToast(r.message);
    if (r.ok) { setPwdNonce(''); setPwdNew(''); setPwdConfirm(''); }
  };
  const sendLinkCode = async () => {
    const r = await a.startLink('email', linkTarget);
    setToast(r.message);
  };
  const submitLink = async () => {
    const r = await a.verifyLink(linkCode);
    setToast(r.message);
    if (r.ok) { setLinkTarget(''); setLinkCode(''); }
  };

  const avatarUrl = avatar.trim();
  const initial = (a.user?.label || '?').slice(0, 1).toUpperCase();

  /* 订阅状态只读 sub 上下文，和左侧账号卡、订阅页同一个来源，不另算一份。 */
  const isPro = sub.isPro;
  const periodEndRaw = sub.sub?.period_end || '';
  const periodEnd = periodEndRaw
    ? new Date(periodEndRaw).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-CN',
      { year: 'numeric', month: '2-digit', day: '2-digit' })
    : '';

  return <div className="page page-narrow ag-page">
    <input ref={avatarFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickAvatar} />

    <header className="ag-head">
      <span className="ag-kicker">ACCOUNT</span>
      <h1>{t('账户信息', 'Account')}</h1>
      <p>{t('资料、密码与邮箱，都在这里。', 'Profile, password and email — all in one place.')}</p>
    </header>

    {!cloudConfigured && <Notice tone="warn">
      {t('未配置 CloudBase 环境变量，登录与云同步不可用。', 'CloudBase environment variables are missing, so sign-in and cloud sync are unavailable.')}
    </Notice>}
    {cloudConfigured && !cloudOriginSupported() && <Notice tone="warn">
      {t('当前是 GitHub Pages 镜像域名，CloudBase 认证接口只对白名单来源放行。',
        'This is the GitHub Pages mirror domain; the CloudBase auth API only allows whitelisted origins.')}
      <a className="inline-link" href={CLOUD_SITE_URL} target="_blank" rel="noreferrer">
        {t('去正式站点操作 →', 'Use the main site →')}
      </a>
    </Notice>}

    {!a.user ? (
      <section className="ag-card ag-guest">
        <span className="ag-guest-ico"><Icon name="user" size={26} /></span>
        <h2>{t('登录后管理账户信息', 'Sign in to manage your account')}</h2>
        <p>{t('登录后可修改头像与称呼、设置密码、换绑邮箱。项目管理在工作台。',
          'Once signed in you can change your avatar and name, set a password and swap your email. Projects live in the workspace.')}</p>
        <button className="ag-btn" onClick={() => setLoginOpen(true)}>{t('登录 / 注册', 'Sign in')}</button>
      </section>
    ) : <>
      {/* ---------- 身份卡 ---------- */}
      <section className="ag-card ag-identity">
        {/* 身份卡上的头像只作展示：这里选完文件不会落库（保存入口在下面「头像与称呼」里），
            所以不给点击、也不挂笔形角标，避免「改了没保存上」的错觉 */}
        <div className="ag-avatar">
          {avatarUrl
            ? <img src={avatarUrl} alt={t('头像', 'Avatar')} />
            : <span>{initial}</span>}
        </div>
        <div className="ag-identity-text">
          <strong>{a.user.label}</strong>
          <span>{a.user.account || t('本地账号', 'Local account')}</span>
        </div>
        <span className="ag-pill">{t('已登录', 'Signed in')}</span>
      </section>

      {/* ---------- 个人资料 ---------- */}
      <div className="ag-group-label">{t('个人资料', 'Profile')}</div>
      <section className="ag-card ag-group">
        <button className={`ag-row ${panel === 'profile' ? 'open' : ''}`} onClick={() => toggle('profile')}>
          <Ico name="user" />
          <span className="ag-row-main">
            <strong>{t('头像与称呼', 'Avatar & name')}</strong>
            <small>{t('更换照片、修改昵称与生日', 'Change your photo, display name and birthday')}</small>
          </span>
          <Icon name="chevronRight" size={16} className="ag-chev" />
        </button>
        {panel === 'profile' && <div className="ag-panel">
          <div className="ag-avatar-row">
            <button className="ag-avatar ag-avatar-sm" onClick={() => avatarFileRef.current?.click()}
              title={t('点击更换头像', 'Click to change your avatar')}>
              {avatarUrl ? <img src={avatarUrl} alt={t('头像', 'Avatar')} /> : <span>{initial}</span>}
            </button>
            <span className="ag-row-main">
              <strong>{t('个人头像', 'Avatar')}</strong>
              <small>{t('点击更换，自动压缩为 128 × 128', 'Click to change — resized to 128 × 128 automatically')}</small>
            </span>
          </div>
          <div className="ag-fields">
            <label className="ag-field"><span>{t('称呼', 'Display name')}</span>
              <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder={t('例如：Sol Young', 'e.g. Sol Young')} /></label>
            <label className="ag-field"><span>{t('生日', 'Birthday')}</span>
              <input type="date" value={birthday} onChange={(e) => setBirthdayLocal(e.target.value)} /></label>
          </div>
          <div className="ag-actions">
            <button className="ag-btn" onClick={() => void saveProfile()} disabled={saving}>
              {saving ? t('保存中…', 'Saving…') : t('保存资料', 'Save profile')}
            </button>
          </div>
        </div>}
      </section>

      {/* ---------- 订阅与账单 ---------- */}
      <div className="ag-group-label">{t('订阅与账单', 'Subscription & billing')}</div>
      <section className="ag-card ag-group">
        <div className="ag-row ag-row-static">
          <Ico name="badge" />
          <span className="ag-row-main">
            <strong>{isPro ? t('会员已开通', 'Membership active') : t('当前为免费版', 'On the free plan')}</strong>
            <small>{isPro
              ? (periodEnd
                ? t(`有效期至 ${periodEnd}，到期自动续费`, `Valid until ${periodEnd}, renews automatically`)
                : t('有效期见订阅页', 'See the plans page for the expiry date'))
              : t('会员解锁全部对话模型、云端同步与印刷级导出',
                'Membership unlocks all chat models, cloud sync and print-ready export')}</small>
          </span>
          <span className="ag-value">{periodEnd && isPro ? periodEnd : '—'}</span>
        </div>

        <button className="ag-row" onClick={() => go('/subscribe')}>
          <Ico name="spark" />
          <span className="ag-row-main">
            <strong>{isPro ? t('续费 / 购买积分包', 'Renew / buy credits') : t('订阅会员', 'Subscribe')}</strong>
            <small>{t('在线支付，开通后立即生效；没有海外卡可用兑换码或微信',
              'Pay online — active immediately. No overseas card? Use a redeem code or WeChat.')}</small>
          </span>
          <Icon name="chevronRight" size={16} className="ag-chev" />
        </button>

        {/* 支付由 Creem 作为记录商户（MoR）处理，订单、发票与退订都在它的自助门户里。
            我们这边不存卡号，也就不该假装能在站内「一键取消」——把真实入口给出来。 */}
        <button className="ag-row" onClick={() => window.open(CREEM_PORTAL, '_blank', 'noopener,noreferrer')}>
          <Ico name="cloud" />
          <span className="ag-row-main">
            <strong>{t('订单、发票与取消续费', 'Orders, invoices & cancellation')}</strong>
            <small>{t('用付款时的邮箱登录 Creem 自助门户；取消后权益保留到当期结束',
              'Sign in to the Creem portal with your payment email; after cancelling, access runs to the end of the period')}</small>
          </span>
          <Icon name="chevronRight" size={16} className="ag-chev" />
        </button>
      </section>

      {/* ---------- 登录与安全 ---------- */}
      <div className="ag-group-label">{t('登录与安全', 'Sign-in & security')}</div>
      <section className="ag-card ag-group">
        <div className="ag-row ag-row-static">
          <Ico name="shield" />
          <span className="ag-row-main">
            <strong>{t('登录账号', 'Sign-in account')}</strong><small>{a.user.account || '—'}</small>
          </span>
          <span className="ag-value">{a.user.email ? t('邮箱已验证', 'Email verified') : t('邮箱未绑定', 'No email')}</span>
        </div>
        {a.user.phone && <div className="ag-row ag-row-static">
          <Ico name="message" />
          <span className="ag-row-main">
            <strong>{t('手机号', 'Phone')}</strong>
            <small>{t('历史绑定，仅作只读展示', 'Legacy binding — shown read-only')}</small>
          </span>
          <span className="ag-value">{a.user.phone}</span>
        </div>}

        <button className={`ag-row ${panel === 'password' ? 'open' : ''}`} onClick={() => toggle('password')}>
          <Ico name="key" />
          <span className="ag-row-main">
            <strong>{t('登录密码', 'Password')}</strong>
            <small>{t('修改前先验证注册邮箱', 'Verify your registered email first')}</small>
          </span>
          <Icon name="chevronRight" size={16} className="ag-chev" />
        </button>
        {panel === 'password' && <div className="ag-panel">
          {!a.reauthPending ? <>
            <p className="ag-hint">
              {t('设置或修改密码前，需要先验证注册邮箱。点下方按钮后，验证码会发送到已绑定的邮箱。',
                'Before setting or changing a password you must verify your registered email. The code is sent to the address on file.')}
            </p>
            <div className="ag-actions">
              <button className="ag-btn" onClick={() => void startPwd()} disabled={a.busy}>
                {a.busy ? t('发送中…', 'Sending…') : t('验证身份并设置密码', 'Verify and set password')}
              </button>
            </div>
          </> : <>
            <p className="ag-hint">
              {t('身份验证码已发送到注册邮箱，请填写验证码并设置新密码。',
                'A verification code was sent to your registered email. Enter it and choose a new password.')}
            </p>
            <div className="ag-fields ag-fields-single">
              <label className="ag-field"><span>{t('身份验证码', 'Verification code')}</span>
                <input inputMode="numeric" autoComplete="one-time-code" value={pwdNonce}
                  onChange={(e) => setPwdNonce(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder={t('6 位数字', '6 digits')} /></label>
              <label className="ag-field"><span>{t('新密码', 'New password')}</span>
                <input type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)}
                  autoComplete="new-password" placeholder={t('至少 8 位', 'At least 8 characters')} /></label>
              <label className="ag-field"><span>{t('确认新密码', 'Confirm new password')}</span>
                <input type="password" value={pwdConfirm} onChange={(e) => setPwdConfirm(e.target.value)}
                  autoComplete="new-password" /></label>
            </div>
            <div className="ag-actions">
              <button className="ag-btn" onClick={() => void submitPwd()} disabled={a.busy || !pwdNonce || !pwdNew}>
                {a.busy ? t('提交中…', 'Submitting…') : t('确认修改', 'Confirm change')}
              </button>
              <button className="ag-btn-quiet" onClick={a.cancelPasswordChange}>{t('取消', 'Cancel')}</button>
            </div>
          </>}
        </div>}

        <button className={`ag-row ${panel === 'email' ? 'open' : ''}`} onClick={() => toggle('email')}>
          <Ico name="mail" />
          <span className="ag-row-main">
            <strong>{t('绑定 / 换绑邮箱', 'Bind / change email')}</strong>
            <small>{t('当前：', 'Current: ')}{a.user.email || t('未绑定', 'none')}</small>
          </span>
          <Icon name="chevronRight" size={16} className="ag-chev" />
        </button>
        {panel === 'email' && <div className="ag-panel">
          {!a.linkPending ? <>
            <div className="ag-fields ag-fields-single">
              <label className="ag-field"><span>{t('新邮箱地址', 'New email address')}</span>
                <input value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)}
                  inputMode="email" type="email" autoComplete="email" placeholder="you@example.com" /></label>
            </div>
            <p className="ag-hint">
              {t('短信验证码已停用，暂不提供手机号绑定；已绑定的手机号仍可用于密码登录。',
                'SMS codes are disabled, so phone binding is unavailable; an existing phone number can still be used to sign in with a password.')}
            </p>
            <div className="ag-actions">
              <button className="ag-btn" onClick={() => void sendLinkCode()} disabled={a.busy || !linkTarget.trim()}>
                {a.busy ? t('发送中…', 'Sending…') : t('发送验证码', 'Send code')}
              </button>
            </div>
          </> : <>
            <p className="ag-hint">
              {t('验证码已发送到', 'Code sent to')} <strong>{a.linkPending.target}</strong>.
            </p>
            <div className="ag-fields ag-fields-single">
              <label className="ag-field"><span>{t('验证码', 'Code')}</span>
                <input inputMode="numeric" value={linkCode}
                  onChange={(e) => setLinkCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder={t('6 位数字', '6 digits')} /></label>
            </div>
            <div className="ag-actions">
              <button className="ag-btn" onClick={() => void submitLink()} disabled={a.busy || linkCode.length < 4}>
                {a.busy ? t('校验中…', 'Verifying…') : t('完成绑定', 'Complete binding')}
              </button>
              <button className="ag-btn-quiet" onClick={a.cancelLink}>{t('取消', 'Cancel')}</button>
            </div>
          </>}
        </div>}
      </section>

      <button className="ag-signout" onClick={async () => {
        const r = await a.signOut();
        setToast(r.message);
      }}><Icon name="logOut" size={15} /> {t('退出登录', 'Sign out')}</button>
    </>}

    <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)}
      onDone={(m) => { setToast(m); }} />
  </div>;
}
