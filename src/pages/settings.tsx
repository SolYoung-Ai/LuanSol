import React, { useRef, useState } from 'react';
import { useApp } from '../store';
import { Button, Card, Modal, Notice, PageHead, SectionLabel, Tag, Toggle } from '../ui';
import { aiEnabled, aiStatusLabel, aiMode, saveAI, testConnection } from '../engine/llm';
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
        <label className="field"><span className="field-label">称呼</span><input value={s.settings.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="field"><span className="field-label">默认尺寸单位</span><div className="seg">{(['mm', 'cm', 'inch'] as const).map((u) => <button key={u} className={s.settings.defaultUnit === u ? 'active' : ''} onClick={() => set({ defaultUnit: u })}>{u}</button>)}</div></label>
        <Toggle label="高级模式" hint="开启后显示刀模、图层、文字属性、出血与高级渲染参数；默认关闭" checked={s.settings.advancedMode} onChange={(v) => set({ advancedMode: v })} />
        <Toggle label="自动保存" hint="设计修改会自动写入本机项目库" checked={s.settings.autoSave} onChange={(v) => set({ autoSave: v })} />
      </Card>
      <Card className="pad-card"><SectionLabel en="PRINT">印前默认</SectionLabel>
        <label className="field"><span className="field-label">出血（mm）</span><input type="number" min="1" max="8" step="0.5" value={s.settings.bleed} onChange={(e) => set({ bleed: Math.max(1, Math.min(8, Number(e.target.value))) })} /></label>
        <label className="field"><span className="field-label">输出分辨率（DPI）</span><div className="seg">{[150, 300, 600].map((d) => <button key={d} className={s.settings.printDpi === d ? 'active' : ''} onClick={() => set({ printDpi: d })}>{d}</button>)}</div></label>
        <Notice tone="info">出血、DPI、CMYK、字体嵌入等由印前智能体在后台处理，普通模式下不会向用户暴露。</Notice>
        <Button variant="outline" onClick={() => { window.location.hash = '/models'; window.scrollTo({ top: 0 }); }}>配置 AI 模型 <span aria-hidden>→</span></Button>
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

/* ============================ 14. AI 模型（平台托管） ============================ */
export function ModelConfig() {
  const { s, update, setToast } = useApp();
  const [docOpen, setDocOpen] = useState(false);
  const [logTick, setLogTick] = useState(0);
  const [testing, setTesting] = useState(false);
  const ai = s.ai;
  const enabled = aiEnabled(ai);
  const mode = aiMode(ai);
  const caps = aiCapabilitySummary();
  const runs = getAIRunLog().slice(0, 8);

  const setMode = (m: AISettings['mode']) => {
    const next = { ...ai, mode: m, lastTest: null };
    saveAI(next); update({ ai: next });
    setToast(m === 'off' ? '已切换到内置设计引擎（关闭平台 AI）' : '已启用平台 AI，全站建议即时生效');
  };
  const test = async () => {
    setTesting(true);
    const r = await testConnection(ai);
    const next = { ...ai, lastTest: r };
    saveAI(next); update({ ai: next });
    setTesting(false);
    setToast(r.ok ? '连接测试通过' : `连接失败：${r.message.slice(0, 60)}`);
  };

  return <div className="page page-narrow">
    <PageHead kicker="AI MODELS / 14" title="AI 模型" desc="AI 由 LunaSol 平台统一接入并托管密钥，你无需、也不能配置任何模型或 API Key。下方仅展示接入状态与开关。" />
    <div className="model-status">
      <div><span className={`status-dot ${enabled ? ai.lastTest?.ok ? 'on' : 'pending' : 'off'}`} />
        <strong>{enabled ? (mode === 'proxy' ? '平台 AI 已启用' : ai.lastTest?.ok ? '已连接' : '已配置，未验证连接') : '未启用 AI 接入'}</strong>
        <p>{enabled ? (ai.lastTest ? `${ai.lastTest.message} · ${formatDate(ai.lastTest.at)}` : '点击「测试连接」验证接口可用性') : '当前每一步由内置设计引擎给出确定性建议，界面明确标注「未调用 AI」，基础创作与导出不受影响。'}</p></div>
      <Tag tone={enabled ? 'green' : 'plain'}>{aiStatusLabel(ai)}</Tag>
    </div>

    <Card className="pad-card"><SectionLabel en="PLATFORM MODELS">平台模型（托管）</SectionLabel>
      <p className="ai-caps-intro">LunaSol 已在腾讯云开发 CloudBase 国内站部署后台代理，<strong>GPT / DeepSeek 密钥只保存在云函数环境变量</strong>，前端不接触任何厂商 API Key，也不允许自行接入模型。文本模型由平台在 GPT-4o 与 DeepSeek-V3 之间自动调度。</p>
      <div className="kv"><span>文本模型</span><strong>GPT-4o / DeepSeek-V3（平台自动调度）</strong></div>
      <div className="kv"><span>后台</span><strong>CloudBase HTTP 云函数 · {CLOUD.region}</strong></div>
      <div className="kv"><span>当前状态</span><strong>{enabled ? '已启用平台 AI' : '已关闭，使用内置设计引擎'}</strong></div>
      <Toggle label="启用平台 AI" hint="开启后十步向导由平台大模型提供建议；关闭后改用内置确定性设计引擎（不调用大模型）" checked={enabled} onChange={(v) => setMode(v ? 'proxy' : 'off')} />
      {!deepSeekReady && enabled && <Notice tone="warn">当前构建未配置平台代理地址，开启后也无法实际调用；请在正式站点使用。</Notice>}
      <div className="model-actions"><Button disabled={!enabled || !deepSeekReady} onClick={test}>{testing ? '测试中…' : '测试连接'}</Button></div>
      <Notice tone="info">当前平台只接入文本模型，不提供图像生成；涉及插画的步骤会使用内置矢量模板，并明确标注「非 AI 图像生成」，不会伪造插画。代理网关按来源域名与令牌校验，并设有 QPS 限制。</Notice>
    </Card>

    <Card className="pad-card"><SectionLabel en="AI IN THE FLOW">AI 已融入哪些环节</SectionLabel>
      <p className="ai-caps-intro">共 {caps.total} 个能力点（{caps.steps} 个向导步骤 + {caps.global} 个全局节点）。每个能力点都已定义输入上下文、输出结构、合规约束与本地回退；平台接好模型后，流程与界面代码一行都不用改。</p>
      <div className="ai-cap-grid">{caps.list.map((t) => <div className="ai-cap" key={t.id}>
        <span>{typeof t.step === 'number' ? `STEP ${String(t.step + 1).padStart(2, '0')}` : t.step === 'review' ? '需求汇总' : '在线编辑器'}</span>
        <strong>{t.title}</strong><em>{t.constraints} 条合规约束</em>
      </div>)}</div>
      <Button variant="ghost" onClick={() => setDocOpen(true)}>查看后台接入契约 <span aria-hidden>→</span></Button>
    </Card>

    <Card className="pad-card"><SectionLabel en="RUN LOG">最近调用记录</SectionLabel>
      <div className="ai-runlog" data-tick={logTick}>
        {runs.length ? runs.map((r) => <div className="ai-run" key={`${r.at}-${r.taskId}`}>
          <span className={`ai-run-src ai-run-${r.source}`}>{r.source === 'ai' ? 'AI' : r.source === 'fallback' ? '回退' : r.source === 'paywall' ? '额度' : '本地'}</span>
          <strong>{r.taskId}</strong><em>{new Date(r.at).toLocaleTimeString('zh-CN')} · {r.durationMs}ms · {r.mode}</em>
          <p>{r.note}</p>
        </div>) : <p className="ai-runlog-empty">还没有调用记录。进入十步向导，在任意一步点「获取建议」即可看到这里记录来源、耗时与回退原因。</p>}
      </div>
      <div className="model-actions"><Button variant="ghost" onClick={() => { clearAIRunLog(); setLogTick((n) => n + 1); setToast('调用记录已清空'); }}>清空记录</Button></div>
    </Card>

    <Card className="pad-card"><SectionLabel en="NO KEY MODE">没有启用平台 AI 时</SectionLabel>
      <div className="nokey-grid">{['手动创建项目', '十步本地建议', '内置配色与风格推荐', '编辑文字与上传图片', '保存与恢复项目', 'PDF / SVG / PNG / DXF 导出'].map((x) => <span key={x}>✓ {x}</span>)}</div>
      <Notice tone="info">内置引擎是确定性的程序化设计，界面会标注「未调用 AI」；只有真正调用模型并通过合规校验后，才会显示 AI 结果。调用失败会如实回退，绝不冒充。</Notice>
    </Card>

    <Modal open={docOpen} title="后台接入契约" onClose={() => setDocOpen(false)} wide>
      <div className="doc-body">
        <h4>一、平台统一接入（用户无需配置）</h4><p>模型由 LunaSol 平台在云端代理中托管，文本模型在 <strong>GPT-4o</strong> 与 <strong>DeepSeek-V3</strong> 之间自动调度。<strong>前端不暴露、也不允许用户配置任何厂商 API Key 或自定义模型。</strong></p>
        <h4>二、文字接口</h4><p>POST <code>{CLOUD.aiBaseUrl || '（平台代理地址）'}/chat/completions</code>。请求体是标准 OpenAI 兼容格式 <code>messages / temperature / response_format</code>，<code>model</code> 由平台决定。返回 <code>choices[0].message.content</code>，内容为一个 JSON 对象。</p>
        <h4>三、输出结构与合规校验</h4><p>所有流程节点统一返回 <code>&#123;"suggestions":[&#123;"title","detail","value"&#125;]&#125;</code>，每个节点的 <code>value</code> 结构不同，详见 <code>src/ai/tasks.ts</code>。模型输出会先经过结构校验与合规校验：编造配料 / 功效 / 认证、生成商品条码数字、发明不存在的风格、在「不需要插画」时添加图案，都会被拦截并回退本地建议。</p>
        <h4>四、替换 / 扩展传输实现</h4><p>若后续要在代理中新增模型或换厂商，只需在云函数 <code>lunasol-ai</code> 中调整模型白名单与路由，前端流程与界面代码不用改；如需替换前端传输实现，可调用一次 <code>registerAITransport(fn)</code>。</p>
        <h4>五、错误处理与安全</h4><p>60s 超时（图像 120s）、可配置重试、失败或校验不通过自动回退内置引擎并在调用记录里留痕，不会把模拟结果伪装成 AI 输出。代理令牌是静态站点的共享访问令牌，不是厂商密钥；按用户额度管控由订阅系统（见订阅页）在网关层启用登录态鉴权实现。</p>
      </div>
    </Modal>
  </div>;
}
