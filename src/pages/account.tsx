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
import { Notice } from '../ui';
import { useAuth } from '../cloud/auth';
import { useProfile } from '../cloud/profile';
import { LoginDialog } from '../cloud/LoginDialog';
import { cloudConfigured, cloudOriginSupported, CLOUD_SITE_URL } from '../cloud/config';
import { Icon, type IconName } from '../components/icons';

type Panel = 'profile' | 'password' | 'email' | null;

/** 分组里的一个图标胶囊：颜色由 CSS 变量控制，浅深色自动适配 */
function Ico({ name }: { name: IconName }) {
  return <span className="ag-ico"><Icon name={name} size={17} /></span>;
}

export default function Account() {
  const a = useAuth();
  const profile = useProfile();
  const { setToast } = useApp();
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
      setToast('个人资料已保存（云端同步）');
    } catch (e) {
      setToast('保存失败：' + ((e as Error).message || '未知错误'));
    } finally {
      setSaving(false);
    }
  };

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

  return <div className="page page-narrow ag-page">
    <input ref={avatarFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickAvatar} />

    <header className="ag-head">
      <span className="ag-kicker">ACCOUNT</span>
      <h1>账户信息</h1>
      <p>资料、密码与邮箱，都在这里。</p>
    </header>

    {!cloudConfigured && <Notice tone="warn">未配置 CloudBase 环境变量，登录与云同步不可用。</Notice>}
    {cloudConfigured && !cloudOriginSupported() && <Notice tone="warn">
      当前是 GitHub Pages 镜像域名，CloudBase 认证接口只对白名单来源放行。
      <a className="inline-link" href={CLOUD_SITE_URL} target="_blank" rel="noreferrer">去正式站点操作 →</a>
    </Notice>}

    {!a.user ? (
      <section className="ag-card ag-guest">
        <span className="ag-guest-ico"><Icon name="user" size={26} /></span>
        <h2>登录后管理账户信息</h2>
        <p>登录后可修改头像与称呼、设置密码、换绑邮箱。项目管理在工作台。</p>
        <button className="ag-btn" onClick={() => setLoginOpen(true)}>登录 / 注册</button>
      </section>
    ) : <>
      {/* ---------- 身份卡 ---------- */}
      <section className="ag-card ag-identity">
        <button className="ag-avatar" onClick={() => avatarFileRef.current?.click()} title="点击更换头像">
          {avatarUrl
            ? <img src={avatarUrl} alt="头像" />
            : <span>{initial}</span>}
          <span className="ag-avatar-edit"><Icon name="edit" size={13} /></span>
        </button>
        <div className="ag-identity-text">
          <strong>{a.user.label}</strong>
          <span>{a.user.account || '本地账号'}</span>
        </div>
        <span className="ag-pill">已登录</span>
      </section>

      {/* ---------- 个人资料 ---------- */}
      <div className="ag-group-label">个人资料</div>
      <section className="ag-card ag-group">
        <button className={`ag-row ${panel === 'profile' ? 'open' : ''}`} onClick={() => toggle('profile')}>
          <Ico name="user" />
          <span className="ag-row-main"><strong>头像与称呼</strong><small>更换照片、修改昵称与生日</small></span>
          <Icon name="chevronRight" size={16} className="ag-chev" />
        </button>
        {panel === 'profile' && <div className="ag-panel">
          <div className="ag-avatar-row">
            <button className="ag-avatar ag-avatar-sm" onClick={() => avatarFileRef.current?.click()} title="点击更换头像">
              {avatarUrl ? <img src={avatarUrl} alt="头像" /> : <span>{initial}</span>}
            </button>
            <span className="ag-row-main"><strong>个人头像</strong><small>点击更换，自动压缩为 128 × 128</small></span>
          </div>
          <div className="ag-fields">
            <label className="ag-field"><span>称呼</span>
              <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="例如：Sol Young" /></label>
            <label className="ag-field"><span>生日</span>
              <input type="date" value={birthday} onChange={(e) => setBirthdayLocal(e.target.value)} /></label>
          </div>
          <div className="ag-actions">
            <button className="ag-btn" onClick={() => void saveProfile()} disabled={saving}>{saving ? '保存中…' : '保存资料'}</button>
          </div>
        </div>}
      </section>

      {/* ---------- 登录与安全 ---------- */}
      <div className="ag-group-label">登录与安全</div>
      <section className="ag-card ag-group">
        <div className="ag-row ag-row-static">
          <Ico name="shield" />
          <span className="ag-row-main"><strong>登录账号</strong><small>{a.user.account || '—'}</small></span>
          <span className="ag-value">{a.user.email ? '邮箱已验证' : '邮箱未绑定'}</span>
        </div>
        {a.user.phone && <div className="ag-row ag-row-static">
          <Ico name="message" />
          <span className="ag-row-main"><strong>手机号</strong><small>历史绑定，仅作只读展示</small></span>
          <span className="ag-value">{a.user.phone}</span>
        </div>}

        <button className={`ag-row ${panel === 'password' ? 'open' : ''}`} onClick={() => toggle('password')}>
          <Ico name="key" />
          <span className="ag-row-main"><strong>登录密码</strong><small>修改前先验证注册邮箱</small></span>
          <Icon name="chevronRight" size={16} className="ag-chev" />
        </button>
        {panel === 'password' && <div className="ag-panel">
          {!a.reauthPending ? <>
            <p className="ag-hint">设置或修改密码前，需要先验证注册邮箱。点下方按钮后，验证码会发送到已绑定的邮箱。</p>
            <div className="ag-actions">
              <button className="ag-btn" onClick={() => void startPwd()} disabled={a.busy}>
                {a.busy ? '发送中…' : '验证身份并设置密码'}
              </button>
            </div>
          </> : <>
            <p className="ag-hint">身份验证码已发送到注册邮箱，请填写验证码并设置新密码。</p>
            <div className="ag-fields ag-fields-single">
              <label className="ag-field"><span>身份验证码</span>
                <input inputMode="numeric" autoComplete="one-time-code" value={pwdNonce}
                  onChange={(e) => setPwdNonce(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="6 位数字" /></label>
              <label className="ag-field"><span>新密码</span>
                <input type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)}
                  autoComplete="new-password" placeholder="至少 8 位" /></label>
              <label className="ag-field"><span>确认新密码</span>
                <input type="password" value={pwdConfirm} onChange={(e) => setPwdConfirm(e.target.value)}
                  autoComplete="new-password" /></label>
            </div>
            <div className="ag-actions">
              <button className="ag-btn" onClick={() => void submitPwd()} disabled={a.busy || !pwdNonce || !pwdNew}>
                {a.busy ? '提交中…' : '确认修改'}
              </button>
              <button className="ag-btn-quiet" onClick={a.cancelPasswordChange}>取消</button>
            </div>
          </>}
        </div>}

        <button className={`ag-row ${panel === 'email' ? 'open' : ''}`} onClick={() => toggle('email')}>
          <Ico name="mail" />
          <span className="ag-row-main"><strong>绑定 / 换绑邮箱</strong><small>当前：{a.user.email || '未绑定'}</small></span>
          <Icon name="chevronRight" size={16} className="ag-chev" />
        </button>
        {panel === 'email' && <div className="ag-panel">
          {!a.linkPending ? <>
            <div className="ag-fields ag-fields-single">
              <label className="ag-field"><span>新邮箱地址</span>
                <input value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)}
                  inputMode="email" type="email" autoComplete="email" placeholder="you@example.com" /></label>
            </div>
            <p className="ag-hint">短信验证码已停用，暂不提供手机号绑定；已绑定的手机号仍可用于密码登录。</p>
            <div className="ag-actions">
              <button className="ag-btn" onClick={() => void sendLinkCode()} disabled={a.busy || !linkTarget.trim()}>
                {a.busy ? '发送中…' : '发送验证码'}
              </button>
            </div>
          </> : <>
            <p className="ag-hint">验证码已发送到 <strong>{a.linkPending.target}</strong>。</p>
            <div className="ag-fields ag-fields-single">
              <label className="ag-field"><span>验证码</span>
                <input inputMode="numeric" value={linkCode}
                  onChange={(e) => setLinkCode(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="6 位数字" /></label>
            </div>
            <div className="ag-actions">
              <button className="ag-btn" onClick={() => void submitLink()} disabled={a.busy || linkCode.length < 4}>
                {a.busy ? '校验中…' : '完成绑定'}
              </button>
              <button className="ag-btn-quiet" onClick={a.cancelLink}>取消</button>
            </div>
          </>}
        </div>}
      </section>

      <button className="ag-signout" onClick={async () => {
        const r = await a.signOut();
        setToast(r.message);
      }}><Icon name="logOut" size={15} /> 退出登录</button>
    </>}

    <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)}
      onDone={(m) => { setToast(m); }} />
  </div>;
}
