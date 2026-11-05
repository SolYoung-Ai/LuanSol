import React, { useRef, useState } from 'react';
import { useApp } from '../store';
import { Button, Card, Field, Modal, Notice, PageHead, SectionLabel, Tag, Toggle, go } from '../ui';
import { DEFAULT_AI, aiEnabled, aiStatusLabel, aiMode, saveAI, testConnection, applyDeepSeekProxy, isDeepSeekProxy } from '../engine/llm';
import { aiCapabilitySummary, getAIRunLog, clearAIRunLog } from '../ai/provider';
import { CLOUD, deepSeekReady } from '../cloud/config';
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
  const [logTick, setLogTick] = useState(0);
  const set = (p: Partial<AISettings>) => setDraft((x) => ({ ...x, ...p }));
  const enabled = aiEnabled(draft);
  const mode = aiMode(draft);
  const caps = aiCapabilitySummary();
  const runs = getAIRunLog().slice(0, 8);
  const save = () => { saveAI(draft); update({ ai: draft }); setToast('AI 配置已保存到本机浏览器，全站 AI 能力即时切换'); };
  const test = async () => {
    saveAI(draft); setTesting(true);
    const r = await testConnection(draft);
    const next = { ...draft, lastTest: r };
    setDraft(next); saveAI(next); update({ ai: next });
    setTesting(false); setToast(r.ok ? '连接测试通过' : `连接失败：${r.message.slice(0, 60)}`);
  };
  return <div className="page page-narrow">
    <PageHead kicker="AI MODELS / 14" title="AI 模型配置中心" desc="AI 已融入十步创作流程的每一个决策点。这里只配置接入方式：后台代理由服务端保管密钥，前端填一个地址即可全站生效。" />
    <div className="model-status">
      <div><span className={`status-dot ${enabled ? draft.lastTest?.ok ? 'on' : 'pending' : 'off'}`} />
        <strong>{enabled ? (mode === 'proxy' ? '后台代理已启用' : draft.lastTest?.ok ? '已连接' : '已配置，未验证连接') : '未启用 AI 接入'}</strong>
        <p>{enabled ? draft.lastTest ? `${draft.lastTest.message} · ${formatDate(draft.lastTest.at)}` : '点击「测试连接」验证接口可用性' : '当前每一步由内置设计引擎给出确定性建议，界面明确标注「未调用 AI」，基础创作与导出不受影响。'}</p></div>
      <Tag tone={enabled ? 'green' : 'plain'}>{aiStatusLabel(draft)}</Tag>
    </div>
    {deepSeekReady && <Card className="pad-card"><SectionLabel en="DEEPSEEK / CLOUDBASE">已部署的后台模型</SectionLabel>
      <p className="ai-caps-intro">LunaSol 已在腾讯云开发 CloudBase 国内站部署后台代理，<strong>DeepSeek API Key 只保存在云函数环境变量</strong>。前端使用公开的网关地址与代理令牌，十步向导、需求汇总与编辑器共用同一套 AI 能力层，无需改动流程即可切换模型。</p>
      <div className="kv"><span>模型服务</span><strong>DeepSeek（OpenAI 兼容接口）</strong></div>
      <div className="kv"><span>后台</span><strong>CloudBase HTTP 云函数 · {CLOUD.region}</strong></div>
      <div className="kv"><span>当前状态</span><strong>{isDeepSeekProxy(draft) ? '已启用，可直接获取 AI 建议' : '未启用，点击下方按钮一键切换'}</strong></div>
      <div className="model-actions">
        <Button onClick={() => { const n = applyDeepSeekProxy(draft); setDraft(n); saveAI(n); update({ ai: n }); setToast('已切换到 DeepSeek 后台代理，全站 AI 能力即时生效'); }}>一键接入 DeepSeek <span aria-hidden>→</span></Button>
        <Button variant="outline" onClick={test} disabled={testing || !isDeepSeekProxy(draft)}>{testing ? '测试中…' : '测试真实模型调用'}</Button>
      </div>
      <Notice tone="info">DeepSeek 目前只提供文本模型，不提供图像生成；开启「AI 图像生成」会如实报错并回退，不会伪造插画。代理网关按来源域名与令牌校验，并设有 QPS 限制。</Notice>
    </Card>}
    <div className="settings-grid">
      <Card className="pad-card"><SectionLabel en="CONNECTION">接入方式</SectionLabel>
        <Field label="AI 接入模式" hint="后台代理模式由你的服务端保管模型密钥，前端不需要也不应该保存厂商 Key">
          <div className="seg">{(['off', 'browser', 'proxy'] as const).map((m) => <button key={m}
            className={mode === m ? 'active' : ''} onClick={() => set({ mode: m })}>
            {{ off: '关闭', browser: '浏览器直连', proxy: '后台代理' }[m]}</button>)}</div>
        </Field>
        <Field label="Base URL" hint={mode === 'proxy' ? '你的后台代理地址，例如 https://api.yourdomain.com/v1' : 'OpenAI 兼容地址，例如 https://api.openai.com/v1'}>
          <input value={draft.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder={mode === 'proxy' ? 'https://your-backend.example.com/v1' : 'https://api.openai.com/v1'} /></Field>
        {mode === 'browser' && <Field label="API Key" hint="仅保存在当前浏览器，不写入源码，不上传到任何 LunaSol 服务器"><div className="pwd-row"><input type={showPwd ? 'text' : 'password'} value={draft.apiKey} onChange={(e) => set({ apiKey: e.target.value })} placeholder="sk-..." /><button className="link-btn" onClick={() => setShowPwd(!showPwd)}>{showPwd ? '隐藏' : '显示'}</button></div></Field>}
        {mode === 'proxy' && <>
          <Notice tone="success">厂商密钥留在后台。前端不会发送 <code>Authorization: Bearer</code> 厂商 Key，也不会把它写进浏览器存储；模型名可留空由后台决定。</Notice>
          <Field label="代理鉴权令牌（可选）" hint="如后台需要简单鉴权，会以 X-LunaSol-Token 头发送；这不是模型厂商密钥">
            <input type={showPwd ? 'text' : 'password'} value={draft.proxyToken} onChange={(e) => set({ proxyToken: e.target.value })} placeholder="可留空" /></Field>
        </>}
        <Field label="文字模型" hint={mode === 'proxy' ? '留空则由后台决定模型；填写后由代理转发也可' : 'OpenAI 兼容模型名'}><input value={draft.textModel} onChange={(e) => set({ textModel: e.target.value })} placeholder="gpt-4o-mini" /></Field>
        <Field label={`温度 ${draft.temperature}`}><input type="range" min="0" max="1.4" step="0.1" value={draft.temperature} onChange={(e) => set({ temperature: Number(e.target.value) })} /></Field>
        <Field label="失败重试次数"><div className="seg">{[0, 1, 2, 3].map((r) => <button key={r} className={draft.retries === r ? 'active' : ''} onClick={() => set({ retries: r })}>{r}</button>)}</div></Field>
      </Card>
      <Card className="pad-card"><SectionLabel en="IMAGE MODEL">图像模型</SectionLabel>
        <Toggle label="启用 AI 图像生成" hint="启用后，方案页可调用真实图像模型生成原创插画素材" checked={draft.imageEnabled} onChange={(v) => set({ imageEnabled: v })} />
        <Field label="图像模型名"><input value={draft.imageModel} onChange={(e) => set({ imageModel: e.target.value })} placeholder="gpt-image-1" /></Field>
        <Notice tone="warn">纯静态前端无法安全隐藏第三方 API Key。正式上线建议用「后台代理」模式：密钥留在服务端，前端只发请求地址。浏览器直连模式仅适合个人本机使用。</Notice>
        <div className="model-actions"><Button onClick={test} disabled={testing || !enabled}>{testing ? '测试中…' : '测试连接'}</Button>
          <Button variant="outline" onClick={save}>保存配置</Button>
          <Button variant="ghost" onClick={() => { setDraft({ ...DEFAULT_AI }); setToast('已恢复默认值（尚未保存）'); }}>恢复默认</Button></div>
      </Card>
    </div>
    <Card className="pad-card"><SectionLabel en="AI IN THE FLOW">AI 已融入哪些环节</SectionLabel>
      <p className="ai-caps-intro">共 {caps.total} 个能力点（{caps.steps} 个向导步骤 + {caps.global} 个全局节点）。每个能力点都已定义输入上下文、输出结构、合规约束与本地回退；后台接好模型后，流程与界面代码一行都不用改。</p>
      <div className="ai-cap-grid">{caps.list.map((t) => <div className="ai-cap" key={t.id}>
        <span>{typeof t.step === 'number' ? `STEP ${String(t.step + 1).padStart(2, '0')}` : t.step === 'review' ? '需求汇总' : '在线编辑器'}</span>
        <strong>{t.title}</strong><em>{t.constraints} 条合规约束</em>
      </div>)}</div>
      <Button variant="ghost" onClick={() => setDocOpen(true)}>查看后台接入契约 <span aria-hidden>→</span></Button>
    </Card>
    <Card className="pad-card"><SectionLabel en="RUN LOG">最近调用记录</SectionLabel>
      <div className="ai-runlog" data-tick={logTick}>
        {runs.length ? runs.map((r) => <div className="ai-run" key={`${r.at}-${r.taskId}`}>
          <span className={`ai-run-src ai-run-${r.source}`}>{r.source === 'ai' ? 'AI' : r.source === 'fallback' ? '回退' : '本地'}</span>
          <strong>{r.taskId}</strong><em>{new Date(r.at).toLocaleTimeString('zh-CN')} · {r.durationMs}ms · {r.mode}</em>
          <p>{r.note}</p>
        </div>) : <p className="ai-runlog-empty">还没有调用记录。进入十步向导，在任意一步点「获取建议」即可看到这里记录来源、耗时与回退原因。</p>}
      </div>
      <div className="model-actions"><Button variant="ghost" onClick={() => { clearAIRunLog(); setLogTick((n) => n + 1); setToast('调用记录已清空'); }}>清空记录</Button></div>
    </Card>
    <Card className="pad-card"><SectionLabel en="NO KEY MODE">没有接入 AI 时</SectionLabel>
      <div className="nokey-grid">{['手动创建项目', '十步本地建议', '内置配色与风格推荐', '编辑文字与上传图片', '保存与恢复项目', 'PDF / SVG / PNG / DXF 导出'].map((x) => <span key={x}>✓ {x}</span>)}</div>
      <Notice tone="info">内置引擎是确定性的程序化设计，界面会标注「未调用 AI」；只有真正调用模型并通过合规校验后，才会显示 AI 结果。调用失败会如实回退，绝不冒充。</Notice>
    </Card>
    <Modal open={docOpen} title="后台接入契约" onClose={() => setDocOpen(false)} wide>
      <div className="doc-body">
        <h4>一、推荐方式：后台代理</h4><p>在上方切到「后台代理」，<code>Base URL</code> 填你的服务地址即可，<strong>前端不需要 API Key</strong>。你的服务端负责保管 GPT 密钥、转发请求、控制额度与审计。文字模型名可留空，由后台决定。</p>
        <h4>二、文字接口</h4><p>POST <code>{draft.baseUrl.replace(/\/$/, '')}/chat/completions</code>。请求体是标准 OpenAI 兼容格式 <code>messages / temperature / response_format:&#123;"type":"json_object"&#125;</code>，<code>model</code> 可省略。返回 <code>choices[0].message.content</code>，内容为一个 JSON 对象。</p>
        <p>浏览器直连模式会带 <code>Authorization: Bearer &lt;API Key&gt;</code>；后台代理模式不带厂商 Key，如填写了代理令牌则带 <code>X-LunaSol-Token</code>。</p>
        <h4>三、图像接口（可选）</h4><p>POST <code>{draft.baseUrl.replace(/\/$/, '')}/images/generations</code>，Body 使用 <code>model / prompt / n:1 / size / response_format</code>，支持返回 <code>b64_json</code> 或图片 URL。</p>
        <h4>四、输出结构与合规校验</h4><p>所有流程节点统一返回 <code>&#123;"suggestions":[&#123;"title","detail","value"&#125;]&#125;</code>，每个节点的 <code>value</code> 结构不同，详见 <code>src/ai/tasks.ts</code>。模型输出会先经过结构校验与合规校验：编造配料 / 功效 / 认证、生成商品条码数字、发明不存在的风格、在「不需要插画」时添加图案，都会被拦截并回退本地建议。</p>
        <h4>五、替换传输实现</h4><p>如果你的后台不是 OpenAI 兼容协议，只需调用一次 <code>registerAITransport(fn)</code>（<code>src/ai/provider.ts</code>）换成自己的请求函数；任务定义、流程、界面、采纳动作全部不用改。</p>
        <h4>六、已部署的 DeepSeek 后台代理</h4><p>本项目已在腾讯云开发 CloudBase 国内站（{CLOUD.region}）部署 HTTP 云函数 <code>lunasol-ai</code>：函数从环境变量读取 <code>DEEPSEEK_API_KEY</code> 并转发 <code>/chat/completions</code>，同时校验 <code>X-LunaSol-Token</code>、限制模型白名单、去掉图像接口（返回 501）。前端只配置网关路径与代理令牌，不接触厂商密钥。更换模型只需改云函数环境变量与代理地址，流程与界面代码不用改。</p>
        <h4>七、错误处理与安全</h4><p>60s 超时（图像 120s）、可配置重试、失败或校验不通过自动回退内置引擎并在调用记录里留痕，不会把模拟结果伪装成 AI 输出。代理令牌是静态站点的共享访问令牌，不是厂商密钥；如需按用户额度管控，应在网关启用 CloudBase 登录态鉴权。请不要在公开前端代码里硬编码任何厂商 API Key。</p>
      </div>
    </Modal>
  </div>;
}
