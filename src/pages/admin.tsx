/* ============================================================
 * 开发者管理页（仅内部管理员 solyoungwork@gmail.com 可见）
 * ------------------------------------------------------------
 *  - 生成「积分码」和「会员码」：会员码兑换后直接开通 / 顺延会员
 *  - 支持批量生成 + 复制，列表里能看清类型、额度与使用状态
 *  - 作废未使用的码
 * 数据表：public.lunasol_redeem_codes（plan / months 为 2026-11 新增）
 * 写入受 RLS 保护：只有管理员邮箱能 INSERT / SELECT。
 * ============================================================ */
import React, { useEffect, useState } from 'react';
import { Button, Card, PageHead, SectionLabel, Notice, go } from '../ui';
import { useAuth } from '../cloud/auth';
import { db } from '../cloud/sdk';
import { PRICING } from '../cloud/plans';
import { Icon } from '../components/icons';

type CodeKind = 'points' | 'pro_monthly';

interface RedeemCode {
  code: string;
  points: number;
  used: boolean;
  used_by?: string | null;
  created_at?: string;
  plan?: string;
  months?: number;
}

const POINT_PRESETS = [100, 200, 300, 500, 1000];
const MONTH_PRESETS = [1, 3, 6, 12];
const COUNT_PRESETS = [1, 5, 10];

/** 纯前端生成码：8 位大写字母数字，撞码由主键约束兜底（重复会插入失败并被跳过） */
function newCode(kind: CodeKind): string {
  const rand = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${kind === 'pro_monthly' ? 'LSV' : 'LSP'}-${rand()}${rand()}`;
}

export default function Admin() {
  const auth = useAuth();
  const isAdmin = !!auth.user && auth.user.email === PRICING.adminEmail;

  const [kind, setKind] = useState<CodeKind>('points');
  const [points, setPoints] = useState(300);
  const [customPoints, setCustomPoints] = useState('');
  const [months, setMonths] = useState(1);
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
        .select('code,points,used,used_by,created_at,plan,months')
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
  const summary = kind === 'points'
    ? `${count} 张 · 每张 ${pointsValue} 积分`
    : `${count} 张 · 每张开通 ${months} 个月会员`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ ok: true, text: `已复制 ${text}` });
    } catch {
      // 非 https / 无剪贴板权限时退回选中式复制
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
    if (kind === 'points' && pointsValue <= 0) { setMessage({ ok: false, text: '请输入有效积分额度' }); return; }
    if (kind === 'pro_monthly' && months <= 0) { setMessage({ ok: false, text: '请输入有效会员月数' }); return; }
    const d = await db();
    if (!d) { setMessage({ ok: false, text: '数据库未连接' }); return; }

    setCreating(true);
    setMessage(null);
    setCreated([]);
    const okCodes: string[] = [];
    const errs: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = newCode(kind);
      const r = await d.from('lunasol_redeem_codes').insert({
        code,
        points: kind === 'points' ? pointsValue : 0,
        plan: kind,
        months: kind === 'pro_monthly' ? months : 0,
        used: false,
      });
      if (r.error) errs.push(r.error.message || '插入失败');
      else okCodes.push(code);
    }

    setCreating(false);
    setCreated(okCodes);
    if (okCodes.length) {
      setMessage({
        ok: true,
        text: kind === 'points'
          ? `已生成 ${okCodes.length} 张积分码（每张 ${pointsValue} 积分）`
          : `已生成 ${okCodes.length} 张会员码（每张 ${months} 个月）`,
      });
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

  const typeOf = (c: RedeemCode) => (c.plan === 'pro_monthly' ? '会员码' : '积分码');
  const quotaOf = (c: RedeemCode) => (c.plan === 'pro_monthly' ? `${c.months || 1} 个月` : `${c.points} 积分`);
  const statusOf = (c: RedeemCode) =>
    !c.used ? '可用' : c.used_by && c.used_by !== 'revoked' ? '已使用' : '已作废';

  return <div className="page page-narrow adm-page">
    <PageHead kicker="DEV" title="开发者管理" desc="生成积分码 / 会员码、查看使用情况。仅管理员可见。" />

    <Card className="pad-card">
      <SectionLabel>生成兑换码</SectionLabel>

      {/* 类型选择：两个大按钮，选中态用实底 + 勾选，避免「点了不知道选了哪个」 */}
      <div className="adm-mode">
        <button className={`adm-mode-btn ${kind === 'points' ? 'on' : ''}`} onClick={() => { setKind('points'); setCreated([]); }}>
          <span className="adm-mode-name"><Icon name="spark" size={15} />积分码</span>
          <span className="adm-mode-desc">兑换后给账户加积分</span>
          {kind === 'points' && <span className="adm-mode-check"><Icon name="check" size={13} /></span>}
        </button>
        <button className={`adm-mode-btn ${kind === 'pro_monthly' ? 'on' : ''}`} onClick={() => { setKind('pro_monthly'); setCreated([]); }}>
          <span className="adm-mode-name"><Icon name="shield" size={15} />会员码</span>
          <span className="adm-mode-desc">兑换后直接开通 / 顺延会员</span>
          {kind === 'pro_monthly' && <span className="adm-mode-check"><Icon name="check" size={13} /></span>}
        </button>
      </div>

      <div className="adm-field">
        <div className="adm-field-label">{kind === 'points' ? '每张额度' : '每张开通时长'}</div>
        <div className="adm-chips">
          {(kind === 'points' ? POINT_PRESETS : MONTH_PRESETS).map((v) => {
            const on = kind === 'points' ? points === v && !customPoints : months === v;
            return <button
              key={v}
              className={`adm-chip ${on ? 'on' : ''}`}
              onClick={() => {
                if (kind === 'points') { setPoints(v); setCustomPoints(''); }
                else setMonths(v);
              }}
            >
              {on && <Icon name="check" size={12} />}
              {kind === 'points' ? `${v} 积分` : `${v} 个月`}
            </button>;
          })}
          {kind === 'points' && <input
            className="luna-input adm-custom"
            inputMode="numeric"
            placeholder="自定义积分"
            value={customPoints}
            onChange={(e) => setCustomPoints(e.target.value.replace(/\D/g, ''))}
          />}
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
          {creating ? '生成中…' : kind === 'points' ? '生成积分码' : '生成会员码'}
        </Button>
        <span className="adm-summary">将生成 {summary}</span>
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
                  <th>类型</th>
                  <th>额度</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => <tr key={c.code}>
                  <td className="mono">{c.code}</td>
                  <td>{typeOf(c)}</td>
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
        会员码兑换后会员立即生效；已是会员的会在原有效期上顺延。兑换码存在云端数据库，用户兑换时由数据库函数一次性占用，重复兑换会被拒绝。
      </p>
    </Card>
  </div>;
}
