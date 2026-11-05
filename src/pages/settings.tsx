import React, { useRef, useState } from 'react';
import { useApp } from '../store';
import { Button, Card, Field, Modal, Notice, PageHead, SectionLabel, Tag, Toggle, go } from '../ui';
import { DEFAULT_AI, aiConfigured, saveAI, testConnection } from '../engine/llm';
import { STRUCTURES } from '../engine/structure';
import { downloadBlob, formatDate } from '../engine/utils';
import type { AISettings, Project } from '../types';

/* ============================ 13. 个人设置 ============================ */
export function Settings() {
  const { s, update, setToast } = useApp();
  const [clearOpen, setClearOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<typeof s.settings>) => update({ settings: { ...s.settings, ...p } });
  const exportAll = () => {
    downloadBlob(new Blob([JSON.stringify({ app: 'LunaSol', version: 1, exportedAt: Date.now(), projects: s.projects, settings: s.settings }, null, 2)], { type: 'application/json' }), 'LunaSol-项目备份.json');
    setToast(`已备份 ${s.projects.length} 个项目`);
  };
  const importAll = (f?: File) => {
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const d = JSON.parse(String(fr.result));
        if (!Array.isArray(d.projects)) throw new Error('文件格式不正确');
        update({ projects: [...d.projects, ...s.projects] as Project[] });
        setToast(`已导入 ${d.projects.length} 个项目`);
      } catch (e) { setToast(`导入失败：${e instanceof Error ? e.message : e}`); }
    };
    fr.readAsText(f);
  };
  return <div className="page page-narrow">
    <PageHead kicker="SETTINGS / 13" title="个人设置" desc="LunaSol 默认面向完全不懂设计的用户。高级功能需要你主动开启。" />
    <div className="settings-grid">
      <Card className="pad-card"><SectionLabel en="BASIC">基础</SectionLabel>
        <Field label="称呼"><input value={s.settings.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="默认尺寸单位"><div className="seg">{(['mm', 'cm', 'inch'] as const).map((u) => <button key={u} className={s.settings.defaultUnit === u ? 'active' : ''} onClick={() => set({ defaultUnit: u })}>{u}</button>)}</div></Field>
        <Toggle label="高级模式" hint="开启后显示刀模、图层、文字属性、出血与高级渲染参数；默认关闭" checked={s.settings.advancedMode} onChange={(v) => set({ advancedMode: v })} />
        <Toggle label="自动保存" hint="设计修改会自动写入本机项目库" checked={s.settings.autoSave} onChange={(v) => set({ autoSave: v })} />
      </Card>
      <Card className="pad-card"><SectionLabel en="PRINT">印前默认</SectionLabel>
        <Field label="出血（mm）" hint="默认 3mm，可按印厂要求调整"><input type="number" min="1" max="8" step="0.5" value={s.settings.bleed} onChange={(e) => set({ bleed: Math.max(1, Math.min(8, Number(e.target.value))) })} /></Field>
        <Field label="输出分辨率（DPI）" hint="印刷常规 300 DPI"><div className="seg">{[150, 300, 600].map((d) => <button key={d} className={s.settings.printDpi === d ? 'active' : ''} onClick={() => set({ printDpi: d })}>{d}</button>)}</div></Field>
        <Notice tone="info">出血、DPI、CMYK、字体嵌入等由印前智能体在后台处理，普通模式下不会向用户暴露。</Notice>
        <Button variant="outline" onClick={() => go('/models')}>配置 AI 模型接口 <span aria-hidden>→</span></Button>
      </Card>
      <Card className="pad-card"><SectionLabel en="STORAGE">数据与存储</SectionLabel>
        <div className="kv"><span>存储方式</span><strong>{s.storage}</strong></div>
        <div className="kv"><span>项目数量</span><strong>{s.projects.length}</strong></div>
        <div className="kv"><span>已实现结构</span><strong>{STRUCTURES.length} 种</strong></div>
        <div className="detail-actions"><Button size="sm" variant="outline" onClick={exportAll}>导出全部项目</Button>
          <Button size="sm" variant="outline" onClick={() => importRef.current?.click()}>导入项目</Button>
          <Button size="sm" variant="ghost" onClick={() => setClearOpen(true)}>清空本地数据</Button></div>
        <input ref={importRef} type="file" accept="application/json" hidden onChange={(e) => importAll(e.target.files?.[0])} />
        <Notice tone="warn">项目保存在本机浏览器，不上传服务器。清除浏览器数据会一并删除项目，建议定期导出备份。</Notice>
      </Card>
    </div>
    <Modal open={clearOpen} title="清空本地数据" onClose={() => setClearOpen(false)}>
      <p className="modal-p">将删除本机保存的全部项目、设计稿与设置（不会删除已下载到电脑的文件）。此操作不可撤销。</p>
      <div className="modal-buttons"><Button variant="outline" onClick={() => setClearOpen(false)}>取消</Button>
        <Button onClick={() => { localStorage.removeItem('lunasol.state.v1'); try { indexedDB.deleteDatabase('lunasol-studio'); } catch { /* ignore */ } setClearOpen(false); setToast('已清空，正在重新载入'); setTimeout(() => location.reload(), 700); }}>确认清空</Button></div>
    </Modal>
  </div>;
}

/* ============================ 14. AI 模型配置中心 ============================ */
export function ModelConfig() {
  const { s, update, setToast } = useApp();
  const [draft, setDraft] = useState<AISettings>(s.ai);
  const [testing, setTesting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const set = (p: Partial<AISettings>) => setDraft({ ...draft, ...p });
  const save = () => { saveAI(draft); update({ ai: draft }); setToast('AI 配置已保存到本机浏览器'); };
  const test = async () => {
    saveAI(draft); setTesting(true);
    const r = await testConnection(draft);
    const next = { ...draft, lastTest: r };
    setDraft(next); saveAI(next); update({ ai: next });
    setTesting(false); setToast(r.ok ? '连接测试通过' : `连接失败：${r.message.slice(0, 60)}`);
  };
  return <div className="page page-narrow">
    <PageHead kicker="AI MODELS / 14" title="AI 模型配置中心" desc="接入你自己的 OpenAI 兼容接口。未配置时，网站仍可手动创作、编辑、保存与基础导出。" />
    <div className="model-status">
      <div><span className={`status-dot ${aiConfigured(draft) ? draft.lastTest?.ok ? 'on' : 'pending' : 'off'}`} />
        <strong>{aiConfigured(draft) ? draft.lastTest?.ok ? '已连接' : '已配置，未验证连接' : '未配置 AI 模型'}</strong>
        <p>{aiConfigured(draft) ? draft.lastTest ? `${draft.lastTest.message} · ${formatDate(draft.lastTest.at)}` : '点击「测试连接」验证接口可用性' : '当前使用内置中文解析与原创矢量素材，所有基础功能可用。'}</p></div>
      <Tag tone={aiConfigured(draft) ? 'green' : 'plain'}>{aiConfigured(draft) ? 'AI 功能已启用' : '内置基础引擎'}</Tag>
    </div>
    <div className="settings-grid">
      <Card className="pad-card"><SectionLabel en="CONNECTION">接口连接</SectionLabel>
        <Field label="Base URL" hint="OpenAI 兼容地址，例如 https://api.openai.com/v1 或你自己的代理地址"><input value={draft.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" /></Field>
        <Field label="API Key" hint="仅保存在当前浏览器，不写入源码，不上传到任何 LunaSol 服务器"><div className="pwd-row"><input type={showPwd ? 'text' : 'password'} value={draft.apiKey} onChange={(e) => set({ apiKey: e.target.value })} placeholder="sk-..." /><button className="link-btn" onClick={() => setShowPwd(!showPwd)}>{showPwd ? '隐藏' : '显示'}</button></div></Field>
        <Field label="文字模型"><input value={draft.textModel} onChange={(e) => set({ textModel: e.target.value })} placeholder="gpt-4o-mini" /></Field>
        <Field label={`温度 ${draft.temperature}`}><input type="range" min="0" max="1.4" step="0.1" value={draft.temperature} onChange={(e) => set({ temperature: Number(e.target.value) })} /></Field>
        <Field label="失败重试次数"><div className="seg">{[0, 1, 2, 3].map((r) => <button key={r} className={draft.retries === r ? 'active' : ''} onClick={() => set({ retries: r })}>{r}</button>)}</div></Field>
      </Card>
      <Card className="pad-card"><SectionLabel en="IMAGE MODEL">图像模型</SectionLabel>
        <Toggle label="启用 AI 图像生成" hint="启用后，方案页可调用真实图像模型生成原创插画素材" checked={draft.imageEnabled} onChange={(v) => set({ imageEnabled: v })} />
        <Field label="图像模型名"><input value={draft.imageModel} onChange={(e) => set({ imageModel: e.target.value })} placeholder="gpt-image-1" /></Field>
        <Notice tone="warn">静态网站无法安全隐藏第三方 API Key。密钥只放在你自己的浏览器里，请求由浏览器直连你配置的接口。团队共用密钥请自建服务端代理。</Notice>
        <div className="model-actions"><Button onClick={test} disabled={testing || !aiConfigured(draft)}>{testing ? '测试中…' : '测试连接'}</Button>
          <Button variant="outline" onClick={save}>保存配置</Button>
          <Button variant="ghost" onClick={() => { setDraft({ ...DEFAULT_AI }); setToast('已恢复默认值（尚未保存）'); }}>恢复默认</Button></div>
      </Card>
    </div>
    <Card className="pad-card"><SectionLabel en="MODES">三种接入方式</SectionLabel>
      <div className="mode-grid">
        <div><strong>本地直连</strong><p>浏览器直接请求你填写的 Base URL。成本最低，适合个人使用，密钥只在本机。</p></div>
        <div><strong>用户自有代理</strong><p>把 Base URL 指向自己的服务端代理，由代理保管密钥，适合小团队。</p></div>
        <div><strong>可选安全网关</strong><p>未来可接入统一网关做额度、审计与密钥轮换；当前版本不依赖任何虚构后端。</p></div>
      </div>
      <Button variant="ghost" onClick={() => setDocOpen(true)}>查看接口说明 <span aria-hidden>→</span></Button>
    </Card>
    <Card className="pad-card"><SectionLabel en="NO KEY MODE">没有 API Key 时</SectionLabel>
      <div className="nokey-grid">{['手动创建项目', '内置基础方案生成', '编辑文字与上传图片', '手动排版与图层管理', '保存与恢复项目', '基础 PDF / SVG / DXF 导出'].map((x) => <span key={x}>✓ {x}</span>)}</div>
      <Notice tone="info">内置引擎是确定性的程序化设计，不会被标注成「AI 生成」；只有配置模型并调用成功后，界面才会显示真实 AI 结果。</Notice>
    </Card>
    <Modal open={docOpen} title="AI 接口说明" onClose={() => setDocOpen(false)} wide>
      <div className="doc-body">
        <h4>文字模型</h4><p>POST <code>{draft.baseUrl.replace(/\/$/, '')}/chat/completions</code>，Header <code>Authorization: Bearer &lt;API Key&gt;</code>，Body 使用标准 <code>model / messages / temperature</code>。需求理解与对话修改会要求模型返回 JSON。</p>
        <h4>图像模型</h4><p>POST <code>{draft.baseUrl.replace(/\/$/, '')}/images/generations</code>，Body 使用 <code>model / prompt / n:1 / size / response_format</code>。支持返回 <code>b64_json</code> 或图片 URL。</p>
        <h4>错误处理</h4><p>60s 超时（图像 120s）、可配置重试、失败自动回退到内置引擎并在界面明确提示，不会把模拟结果伪装成 AI 输出。</p>
        <h4>安全</h4><p>不要在任何公开前端代码里硬编码密钥；不要把生产密钥填进不可信的第三方站点。LunaSol 是纯静态站点，没有任何自有后端接收你的密钥。</p>
      </div>
    </Modal>
  </div>;
}
