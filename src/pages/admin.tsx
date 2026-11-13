/* ============================================================
 * 开发者管理页（仅内部管理员 solyoungwork@gmail.com 可见）
 * ------------------------------------------------------------
 * 纯积分制：只生成「积分码」，兑换后直接给账户加积分。
 * 历史遗留的会员码仍可在列表里看到；它们兑换时会由数据库函数
 * 折算成等值积分（见 20261114030000_pure_credits.sql），不会开通会员。
 * 数据表：public.lunasol_redeem_codes；写入受 RLS 保护。
 * ============================================================ */
import React, { useEffect, useState } from 'react';
import { Button, Card, PageHead, SectionLabel, Notice, go } from '../ui';
import { useAuth } from '../cloud/auth';
import { db } from '../cloud/sdk';
import { PRICING } from '../cloud/plans';
import { Icon } from '../components/icons';

interface RedeemCode {
  code: string;
  points: number;
  used: boolean;
  used_by?: string | null;
  created_at?: string;
  plan?: string;
  months?: number;
  days?: number;
}

const POINT_PRESETS = [100, 200, 300, 500, 1000];
const COUNT_PRESETS = [1, 5, 10];

/** 纯前端生成码：8 位大写字母数字，撞码由主键约束兜底（重复会插入失败并被跳过） */
function newCode(): string {
  const rand = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `LSP-${rand()}${rand()}`;
}

export default function Admin() {
  const auth = useAuth();
  const isAdmin = !!auth.user && auth.user.email === PRICING.adminEmail;

  const [points, setPoints] = useState(300);
  const [customPoints, setCustomPoints] = useState('');
  const [count, setCount] = useState(1);

  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const d = await db();
    if (d) {
      const r = await d.from('lunasol_redeem_codes')
        .select('code,points,used,used_by,created_at,plan,months,days')
        .order('created_at', { ascending: false });
      if (r.error) setMessage({ ok: false, text: `读取兑换码失败：${r.error.message || '未知错误'}` });
      else setCodes((r.data || []) as RedeemCode[]);
    }
    setLoading(false);
  };
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  if (!isAdmin) {
    return <div className="page page-narrow">
      <Notice tone="warn">无权限：此页面仅内部管理员可见。</Notice>
      <div style={{ marginTop: 16 }}><Button onClick={() => go('/')}>回到首页</Button></div>
    </div>;
  }

  const pointsValue = customPoints ? parseInt(customPoints, 10) || 0 : points;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ ok: true, text: `已复制 ${text}` });
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setMessage({ ok: true, text: `已复制 ${text}` }); }
      catch { setMessage({ ok: false, text: '复制失败，请手动选中复制' }); }
      document.body.removeChild(ta);
    }
  };

  const create = async () => {
    if (creating) return;
    if (pointsValue <= 0) { setMessage({ ok: false, text: '请输入有效积分额度' }); return; }
    const d = await db();
    if (!d) { setMessage({ ok: false, text: '数据库未连接' }); return; }

    setCreating(true);
    setMessage(null);
    setCreated([]);
    const okCodes: string[] = [];
    const errs: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = newCode();
      const r = await d.from('lunasol_redeem_codes').insert({
        code,
        points: pointsValue,
        plan: 'points',
        months: 0,
        days: 0,
        used: false,
      });
      if (r.error) errs.push(r.error.message || '插入失败');
      else okCodes.push(code);
    }

    setCreating(false);
    setCreated(okCodes);
    if (okCodes.length) {
      setMessage({ ok: true, text: `已生成 ${okCodes.length} 张积分码（每张 ${pointsValue} 积分）` });
      void load();
    } else {
      setMessage({ ok: false, text: `生成失败：${errs[0] || '未知错误'}` });
    }
  };

  const revoke = async (code: string) => {
    const d = await db();
    if (!d) return;
    const r = await d.from('lunasol_redeem_codes').update({ used: true, used_by: 'revoked' }).eq('code', code);
    setMessage(r.error ? { ok: false, text: `作废失败：${r.error.message || ''}` } : { ok: true, text: `已作废 ${code}` });
    void load();
  };

  const isLegacyMember = (c: RedeemCode) => c.plan === 'pro_monthly';
  const quotaOf = (c: RedeemCode) => {
    if (!isLegacyMember(c)) return `${c.points} 积分`;
    // 历史会员码兑换时由数据库函数折算成积分，这里按等价口径展示
    const pts = c.months ? c.months * 300 : (c.days || 1) * 10;
    return `${pts} 积分（历史会员码折算）`;
  };
  const statusOf = (c: RedeemCode) =>
    !c.used ? '可用' : c.used_by && c.used_by !== 'revoked' ? '已使用' : '已作废';

  return <div className="page page-narrow adm-page">
    <PageHead kicker="DEV" title="开发者管理" desc="生成积分码、查看使用情况。仅管理员可见。" />

    <Card className="pad-card">
      <SectionLabel>生成积分码</SectionLabel>
      <p className="adm-summary" style={{ marginTop: 0, marginBottom: 14 }}>
        纯积分制：所有兑换码都只发放积分，没有会员、有效期或续费。用户兑换后积分立即到账且永久有效。
      </p>

      <div className="adm-field">
        <div className="adm-field-label">每张额度</div>
        <div className="adm-chips">
          {POINT_PRESETS.map((v) => {
            const on = points === v && !customPoints;
            return <button
              key={v}
              className={`adm-chip ${on ? 'on' : ''}`}
              onClick={() => { setPoints(v); setCustomPoints(''); }}
            >
              {on && <Icon name="check" size={12} />}
              {v} 积分
            </button>;
          })}
          <input
            className="luna-input adm-custom"
            inputMode="numeric"
            placeholder="自定义积分"
            value={customPoints}
            onChange={(e) => setCustomPoints(e.target.value.replace(/\D/g, ''))}
          />
        </div>
      </div>

      <div className="adm-field">
        <div className="adm-field-label">生成数量</div>
        <div className="adm-chips">
          {COUNT_PRESETS.map((n) => <button
            key={n}
            className={`adm-chip ${count === n ? 'on' : ''}`}
            onClick={() => setCount(n)}
          >
            {count === n && <Icon name="check" size={12} />}
            {n} 张
          </button>)}
        </div>
      </div>

      <div className="adm-actions">
        <Button variant="accent" onClick={() => void create()} disabled={creating}>
          {creating ? '生成中…' : '生成积分码'}
        </Button>
        <span className="adm-summary">将生成 {count} 张 · 每张 {pointsValue} 积分</span>
      </div>

      {message && <div style={{ marginTop: 14 }}><Notice tone={message.ok ? 'success' : 'warn'}>{message.text}</Notice></div>}

      {created.length > 0 && <div className="adm-created">
        <div className="adm-created-head">
          <strong>本次生成（{created.length}）</strong>
          <button className="adm-mini" onClick={() => void copy(created.join('\n'))}>复制全部</button>
        </div>
        <div className="adm-created-list">
          {created.map((c) => <button key={c} className="adm-created-code" onClick={() => void copy(c)} title="点击复制">
            {c}<Icon name="copy" size={12} />
          </button>)}
        </div>
      </div>}
    </Card>

    <Card className="pad-card">
      <SectionLabel>已创建兑换码（{codes.length}）</SectionLabel>
      {loading ? <p className="adm-empty">加载中…</p>
        : codes.length === 0 ? <p className="adm-empty">暂无兑换码</p>
          : <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>兑换码</th>
                  <th>额度</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => <tr key={c.code}>
                  <td className="mono">{c.code}</td>
                  <td>{quotaOf(c)}</td>
                  <td>
                    <span className={`adm-status ${!c.used ? 'ok' : statusOf(c) === '已使用' ? 'used' : 'revoked'}`}>
                      {statusOf(c)}
                    </span>
                  </td>
                  <td className="mono light">{c.created_at ? new Date(c.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>
                    <div className="adm-row-ops">
                      <button className="adm-mini" onClick={() => void copy(c.code)}>复制</button>
                      {!c.used && <button className="adm-mini danger" onClick={() => void revoke(c.code)}>作废</button>}
                    </div>
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>}
      <p className="adm-tip">
        兑换码存在云端数据库，用户兑换时由数据库函数一次性占用，重复兑换会被拒绝；积分到账后写入积分明细，永久有效。
      </p>
    </Card>
  </div>;
}
