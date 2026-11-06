/* ============================================================
 * 开发者管理页（仅 solyoungwork@gmail.com 可见）
 * ------------------------------------------------------------
 *  - 创建兑换码：自定义额度（100/200/300/自定义）
 *  - 查看已创建兑换码列表
 *  - 作废兑换码
 *  - 后端待云函数加 NoSQL 路由，当前为前端 UI 骨架
 * ============================================================ */
import React, { useState, useEffect } from 'react';
import { Button, Card, PageHead, SectionLabel, Notice, go } from '../ui';
import { useAuth } from '../cloud/auth';
import { db } from '../cloud/sdk';

interface RedeemCode {
  code: string;
  points: number;
  used: boolean;
  used_by?: string | null;
  created_at?: string;
}

export default function Admin() {
  const auth = useAuth();
  const [points, setPoints] = useState(100);
  const [customPoints, setCustomPoints] = useState('');
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const d = await db();
    if (d) {
      const r = await d.from('lunasol_redeem_codes').select('code,points,used,used_by,created_at').order('created_at', { ascending: false });
      if (r.data) setCodes(r.data as RedeemCode[]);
    }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  if (auth.user?.email !== 'solyoungwork@gmail.com') {
    return <div className="page page-narrow">
      <Notice tone="warn">无权限：此页面仅内部管理员可见。</Notice>
      <Button onClick={() => go('/')}>回到首页</Button>
    </div>;
  }

  const actualPoints = customPoints ? parseInt(customPoints, 10) || 0 : points;

  const create = async () => {
    if (actualPoints <= 0) { setMessage({ ok: false, text: '请输入有效积分额度' }); return; }
    const code = `LS-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const d = await db();
    if (!d) { setMessage({ ok: false, text: '数据库未连接' }); return; }
    await d.from('lunasol_redeem_codes').insert({ code, points: actualPoints, used: false });
    setMessage({ ok: true, text: `已创建兑换码 ${code}（${actualPoints} 积分）` });
    setCustomPoints('');
    void load();
  };

  const revoke = async (code: string) => {
    const d = await db();
    if (!d) return;
    await d.from('lunasol_redeem_codes').update({ used: true, used_by: 'revoked' }).eq('code', code);
    setMessage({ ok: true, text: `已作废 ${code}` });
    void load();
  };

  const presets = [100, 200, 300, 500, 1000];

  return <div className="page page-narrow">
    <PageHead kicker="DEV" title="开发者管理" desc="创建兑换码、查看使用记录。仅管理员可见。" />

    <Card className="pad-card">
      <SectionLabel>创建兑换码</SectionLabel>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {presets.map((p) => (
          <button
            key={p}
            className={`v4-btn-line ${points === p && !customPoints ? 'v4-btn-dark' : ''}`}
            onClick={() => { setPoints(p); setCustomPoints(''); }}
          >
            {p} 积分
          </button>
        ))}
        <input
          className="luna-input"
          style={{ width: 120 }}
          placeholder="自定义"
          value={customPoints}
          onChange={(e) => setCustomPoints(e.target.value.replace(/\D/g, ''))}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="accent" onClick={create}>生成兑换码</Button>
      </div>
      {message && <div style={{ marginTop: 12 }}><Notice tone={message.ok ? 'success' : 'warn'}>{message.text}</Notice></div>}
    </Card>

    <Card className="pad-card">
      <SectionLabel>已创建兑换码（{codes.length}）</SectionLabel>
      {loading ? <p style={{ color: '#999' }}>加载中…</p>
        : codes.length === 0
        ? <p style={{ color: '#999' }}>暂无兑换码</p>
        : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: 8 }}>兑换码</th>
                <th style={{ textAlign: 'left', padding: 8 }}>积分</th>
                <th style={{ textAlign: 'left', padding: 8 }}>状态</th>
                <th style={{ textAlign: 'left', padding: 8 }}>创建时间</th>
                <th style={{ textAlign: 'left', padding: 8 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.code} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: 8, fontFamily: 'monospace' }}>{c.code}</td>
                  <td style={{ padding: 8 }}>{c.points}</td>
                  <td style={{ padding: 8 }}>
                    {c.used
                      ? (c.used_by && c.used_by !== 'revoked' ? <span style={{ color: '#999' }}>已使用</span> : <span style={{ color: 'red' }}>已作废</span>)
                      : <span style={{ color: 'green' }}>可用</span>}
                  </td>
                  <td style={{ padding: 8, color: '#999', fontSize: 12 }}>{c.created_at ? new Date(c.created_at).toLocaleString() : '-'}</td>
                  <td style={{ padding: 8 }}>
                    {!c.used && (
                      <button className="v4-btn-line" onClick={() => revoke(c.code)}>作废</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
      <p style={{ color: '#999', fontSize: 12, marginTop: 12 }}>
        兑换码已存储在云端数据库，所有用户可实时使用。
      </p>
    </Card>
  </div>;
}
