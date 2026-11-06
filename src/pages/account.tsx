/* ============================================================
 * 个人资料页
 * ------------------------------------------------------------
 * 只保留用户关心的三件事：头像、昵称、生日。
 * 技术信息（用户 ID、环境、登录账号）、订阅额度、云同步操作
 * 都已经挪到别处：订阅看 /subscribe，云同步在工作台。
 * ============================================================ */
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../store';
import { Button, Card, Empty, Notice, PageHead, SectionLabel, go } from '../ui';
import { useAuth, getBirthday, setBirthday } from '../cloud/auth';
import { LoginDialog } from '../cloud/LoginDialog';
import { useCloudSync } from '../cloud/useCloudSync';
import { listProjects, pullProject, projectIdOf, timeLabel, type CloudMeta } from '../cloud/projects';
import { CLOUD, cloudConfigured, cloudOriginSupported, CLOUD_SITE_URL } from '../cloud/config';

export default function Account() {
  const a = useAuth();
  const { s, mergeCloudProjects, loadProject, setToast } = useApp();
  const sync = useCloudSync();
  const [loginOpen, setLoginOpen] = useState(false);
  const [rows, setRows] = useState<CloudMeta[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 昵称 / 头像 / 生日编辑态
  const [nick, setNick] = useState('');
  const [avatar, setAvatar] = useState('');
  const [birthday, setBirthdayLocal] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!a.user) return;
    setNick(a.user.label === a.user.id ? '' : a.user.label);
    setAvatar(a.user.avatarUrl);
    setBirthdayLocal(getBirthday(a.user.id));
  }, [a.user?.id, a.user?.label, a.user?.avatarUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    if (!a.user) { setRows(null); setListError(null); return; }
    const r = await listProjects();
    if (r.ok) { setRows(r.data); setListError(null); } else { setRows(null); setListError(r.message); }
  }, [a.user]);

  useEffect(() => { void refresh(); }, [refresh, a.user?.id, sync.lastSync]);

  const pull = async (id: string) => {
    setBusyId(id);
    const r = await pullProject(id);
    setBusyId(null);
    if (!r.ok) { setToast(r.message); return; }
    mergeCloudProjects([r.data]);
    loadProject(r.data.id);
    setToast(`已取回「${r.data.name}」`);
    go('/workspace');
  };

  const saveProfile = async () => {
    if (!a.user) return;
    setSaving(true);
    const r = await a.updateProfile({
      nickName: nick.trim() || undefined,
      avatarUrl: avatar.trim() || undefined,
    });
    setSaving(false);
    if (!r.ok) { setToast(r.message); return; }
    setBirthday(a.user.id, birthday);
    setToast('个人资料已保存');
  };

  if (!cloudConfigured) {
    return <div className="page page-narrow">
      <PageHead kicker="ACCOUNT" title="个人资料" desc="当前构建没有接入云服务。" />
      <Notice tone="warn">未配置 CloudBase 环境变量，登录与云同步不可用。</Notice>
    </div>;
  }

  return <div className="page">
    <PageHead kicker="ACCOUNT" title="个人资料"
      desc="你的头像、称呼和生日。账号安全（绑定邮箱 / 手机 / 改密码）在「账号设置」里。"
      right={a.user
        ? <Button variant="outline" onClick={() => go('/security')}>账号设置</Button>
        : <Button onClick={() => setLoginOpen(true)}>登录 / 注册</Button>} />

    {!cloudOriginSupported() && <Notice tone="warn">
      当前是 GitHub Pages 镜像域名，CloudBase 认证接口只对白名单来源放行。
      <a className="inline-link" href={CLOUD_SITE_URL} target="_blank" rel="noreferrer">去正式站点登录 →</a>
    </Notice>}

    {!a.user ? <Empty title="还没有登录"
      desc="登录后才能开始设计、同步项目、保存你的个人资料。"
      action={<Button onClick={() => setLoginOpen(true)}>登录或注册账号</Button>} /> : <>
      <div className="acct-grid">
        <Card className="pad-card">
          <SectionLabel en="PROFILE">个人资料</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            {avatar.trim()
              ? <img src={avatar.trim()} alt="头像" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />
              : <div className="v4-avatar" style={{ width: 56, height: 56, fontSize: 22 }}>{(a.user.label || '?').slice(0, 1).toUpperCase()}</div>}
            <div>
              <div style={{ fontWeight: 600 }}>{a.user.label}</div>
              <div style={{ fontSize: 12, color: 'var(--v4-ink-3, #888)' }}>{a.user.account || '本地账号'}</div>
            </div>
          </div>

          <label className="field"><span className="field-label">头像图片链接</span>
            <input className="input" value={avatar} onChange={(e) => setAvatar(e.target.value)}
              placeholder="粘贴图片 URL（可空，空则显示首字母）" /></label>
          <label className="field"><span className="field-label">称呼</span>
            <input className="input" value={nick} onChange={(e) => setNick(e.target.value)}
              placeholder="例如：Sol Young" /></label>
          <label className="field"><span className="field-label">生日</span>
            <input className="input" type="date" value={birthday} onChange={(e) => setBirthdayLocal(e.target.value)} /></label>

          <div className="acct-actions" style={{ marginTop: 16 }}>
            <Button size="sm" onClick={saveProfile} disabled={saving}>{saving ? '保存中…' : '保存资料'}</Button>
            <Button size="sm" variant="ghost" onClick={async () => { const r = await a.signOut(); setToast(r.message); }}>退出登录</Button>
          </div>
        </Card>

        <Card className="pad-card">
          <SectionLabel en="SECURITY">账号安全</SectionLabel>
          <div className="acct-row"><span>登录方式</span><strong>{a.user.account || '—'}</strong></div>
          <div className="acct-actions" style={{ marginTop: 16 }}>
            <Button size="sm" variant="outline" onClick={() => go('/security')}>绑定邮箱 / 手机 / 修改密码</Button>
          </div>
          <p className="acct-msg">订阅与额度在 <a className="inline-link" href="#/subscribe">会员说明</a>；云同步操作在 <a className="inline-link" href="#/workspace">工作台</a>。</p>
        </Card>
      </div>

      <Card className="pad-card cloud-list-card">
        <SectionLabel en="CLOUD PROJECTS">云端项目</SectionLabel>
        {listError && <Notice tone="warn">{listError}</Notice>}
        {!rows ? (listError ? null : <p className="acct-msg">正在读取云端列表…</p>) : rows.length === 0
          ? <p className="acct-msg">云端还没有项目。在工作台打开一个项目并保存，会自动同步上去。</p>
          : <div className="cloud-list">{rows.map((r) => <div className="cloud-item" key={r.id}>
            <div className="cloud-item-main">
              <strong>{r.title || '未命名包装项目'}</strong>
              <span>{timeLabel(r.updated_at)} · {projectIdOf(r.id)}</span>
            </div>
            <div className="cloud-item-actions">
              <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => void pull(r.id)}>
                {busyId === r.id ? '取回中…' : '取回到本机'}</Button>
              <Button size="sm" variant="ghost" onClick={async () => {
                const ok = await sync.removeOne(r.id);
                if (ok) void refresh();
              }}>删除云端</Button>
            </div>
          </div>)}</div>}
      </Card>
    </>}

    <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)}
      onDone={(m) => { setToast(m); void refresh(); }} />
  </div>;
}
