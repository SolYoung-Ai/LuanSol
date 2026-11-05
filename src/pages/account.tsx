/* ============================================================
 * 账户页：真实登录态、云同步状态、云端项目列表
 * ------------------------------------------------------------
 * 所有数据都来自 CloudBase（auth.getSession / PG 查询），
 * 没有登录时明确显示「本地保存」，不伪造云端数据。
 * ============================================================ */
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../store';
import { Button, Card, Empty, Notice, PageHead, SectionLabel, Tag, go } from '../ui';
import { useAuth } from '../cloud/auth';
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
    go('/projects');
  };

  if (!cloudConfigured) {
    return <div className="page page-narrow">
      <PageHead kicker="ACCOUNT" title="账户" desc="当前构建没有接入云服务，所有项目保存在本机浏览器。" />
      <Notice tone="warn">未配置 <code>VITE_CLOUDBASE_*</code> 环境变量，登录与云同步不可用。项目仍会自动保存在本机，也可导出 JSON 备份。</Notice>
    </div>;
  }

  return <div className="page">
    <PageHead kicker="ACCOUNT" title="账户与云端项目"
      desc="登录后项目按账号隔离保存在 CloudBase 云端数据库，换设备登录即可取回。"
      right={a.user
        ? <Button variant="outline" onClick={() => setLoginOpen(true)}>账号设置</Button>
        : <Button onClick={() => setLoginOpen(true)}>登录 / 注册</Button>} />

    {!cloudOriginSupported() && <Notice tone="warn">
      当前是 GitHub Pages 镜像域名，CloudBase 认证接口只对白名单来源放行（体验版无法通过 API 追加安全域名），
      所以这里不能登录。设计与 AI 照常可用，项目保存在本机浏览器。
      <a className="inline-link" href={CLOUD_SITE_URL} target="_blank" rel="noreferrer">去正式站点登录 →</a>
    </Notice>}

    {!a.user ? <Empty title="还没有登录"
      desc="不登录也能完整使用 LunaSol，项目保存在本机浏览器。登录后可以把项目同步到云端，并在其他设备取回。"
      action={<Button onClick={() => setLoginOpen(true)}>登录或注册账号</Button>} /> : <>
      <div className="acct-grid">
        <Card className="pad-card"><SectionLabel en="IDENTITY">账号</SectionLabel>
          <div className="acct-row"><span>显示名</span><strong>{a.user.label}</strong></div>
          <div className="acct-row"><span>用户 ID</span><code className="acct-uid">{a.user.id}</code></div>
          {a.user.account && <div className="acct-row"><span>登录账号</span><strong>{a.user.account}</strong></div>}
          <div className="acct-row"><span>环境</span><code className="acct-uid">{CLOUD.envId} · {CLOUD.region}</code></div>
          <div className="acct-actions">
            <Button variant="ghost" size="sm" onClick={async () => { const r = await a.signOut(); setToast(r.message); }}>退出登录</Button>
          </div>
        </Card>

        <Card className="pad-card"><SectionLabel en="CLOUD SYNC">云同步</SectionLabel>
          <div className="acct-row"><span>状态</span><strong>
            {sync.state === 'syncing' ? '同步中…' : sync.state === 'ok' ? '已同步' : sync.state === 'error' ? '同步失败' : '待同步'}
          </strong></div>
          <div className="acct-row"><span>最近同步</span><strong>{sync.lastSync ? timeLabel(new Date(sync.lastSync).toISOString()) : '—'}</strong></div>
          <div className="acct-row"><span>云端项目</span><strong>{sync.cloudCount ?? (rows ? rows.length : '—')} 个</strong></div>
          <div className="acct-row"><span>本机项目</span><strong>{s.projects.length} 个</strong></div>
          <p className={`acct-msg ${sync.state === 'error' ? 'bad' : ''}`}>{sync.message}</p>
          <div className="acct-actions">
            <Button size="sm" onClick={() => { void sync.syncNow(); }}>立即双向同步</Button>
            <Button size="sm" variant="outline" onClick={() => { void sync.downloadAll(); }}>取回云端项目</Button>
          </div>
        </Card>
      </div>

      <Card className="pad-card cloud-list-card">
        <SectionLabel en="CLOUD PROJECTS">云端项目</SectionLabel>
        {listError && <Notice tone="warn">{listError}</Notice>}
        {!rows ? (listError ? null : <p className="acct-msg">正在读取云端列表…</p>) : rows.length === 0
          ? <p className="acct-msg">云端还没有项目。在「我的作品」里打开一个项目并保存，或在上面点「立即双向同步」把本机项目上传。</p>
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
        <p className="modal-foot">数据隔离由数据库行级权限（RLS）保证：每行 owner_id 必须等于当前登录用户 ID，越权查询会被数据库拒绝。</p>
      </Card>
    </>}

    <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)}
      onDone={(m) => { setToast(m); void refresh(); }} />
  </div>;
}
