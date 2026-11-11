import React, { useRef, useState } from 'react';
import { useApp } from '../store';
import { Button, Card, Modal, Notice, PageHead, SectionLabel, Tag, Toggle } from '../ui';
import { aiEnabled, aiStatusLabel, aiMode, saveAI, testConnection } from '../engine/llm';
import { aiCapabilitySummary, getAIRunLog, clearAIRunLog } from '../ai/provider';
import { CLOUD, deepSeekReady } from '../cloud/config';
import { PRICING } from '../cloud/plans';
import { STRUCTURES } from '../engine/structure';
import { downloadBlob, formatDate } from '../engine/utils';
import { useLang } from '../i18n';
import { migrateProject } from '../migrations';
import type { AISettings, Project } from '../types';

/* ============================ 13. 个人设置 ============================ */
export function Settings() {
  const { s, update, setToast } = useApp();
  const { lang, t } = useLang();
  const [clearOpen, setClearOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<typeof s.settings>) => update({ settings: { ...s.settings, ...p } });
  const exportAll = () => {
    downloadBlob(new Blob([JSON.stringify({ app: 'LunaSol', version: 1, exportedAt: Date.now(), projects: s.projects, settings: s.settings }, null, 2)], { type: 'application/json' }), 'LunaSol-projects-backup.json');
    setToast(t(`已备份 ${s.projects.length} 个项目`, `Backed up ${s.projects.length} projects`));
  };
  const importAll = (f?: File) => {
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const d = JSON.parse(String(fr.result));
        if (!Array.isArray(d.projects)) throw new Error(t('文件格式不正确', 'That file is not in the right format'));
        // 备份文件可能是旧版本导出的（缺 themeColors 等新字段），导入前统一迁移
        update({ projects: [...d.projects.map((p: Project) => migrateProject(p)), ...s.projects] as Project[] });
        setToast(t(`已导入 ${d.projects.length} 个项目`, `Imported ${d.projects.length} projects`));
      } catch (e) { setToast(t(`导入失败：${e instanceof Error ? e.message : e}`, `Import failed: ${e instanceof Error ? e.message : e}`)); }
    };
    fr.readAsText(f);
  };
  return <div className="page page-narrow">
    <PageHead kicker="SETTINGS / 13" title={t('个人设置', 'Settings')} desc={t('LunaSol 默认面向完全不懂设计的用户。高级功能需要你主动开启。', 'LunaSol is built for people with no design background. Advanced features stay off until you turn them on.')} />
    <div className="settings-grid">
      <Card className="pad-card"><SectionLabel en="BASIC">{t('基础', 'Basics')}</SectionLabel>
        <label className="field"><span className="field-label">{t('称呼', 'Display name')}</span><input value={s.settings.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="field"><span className="field-label">{t('默认尺寸单位', 'Default size unit')}</span><div className="seg">{(['mm', 'cm', 'inch'] as const).map((u) => <button key={u} className={s.settings.defaultUnit === u ? 'active' : ''} onClick={() => set({ defaultUnit: u })}>{u}</button>)}</div></label>
        <Toggle label={t('高级模式', 'Advanced mode')} hint={t('开启后显示刀模、图层、文字属性、出血与高级渲染参数；默认关闭', 'Shows dielines, layers, text properties, bleed and advanced render settings. Off by default.')} checked={s.settings.advancedMode} onChange={(v) => set({ advancedMode: v })} />
        <Toggle label={t('自动保存', 'Auto-save')} hint={t('设计修改会自动写入本机项目库', 'Edits are written straight into this device\'s project library')} checked={s.settings.autoSave} onChange={(v) => set({ autoSave: v })} />
      </Card>
      <Card className="pad-card"><SectionLabel en="PRINT">{t('印前默认', 'Prepress defaults')}</SectionLabel>
        <label className="field"><span className="field-label">{t('出血（mm）', 'Bleed (mm)')}</span><input type="number" min="1" max="8" step="0.5" value={s.settings.bleed} onChange={(e) => set({ bleed: Math.max(1, Math.min(8, Number(e.target.value))) })} /></label>
        <label className="field"><span className="field-label">{t('输出分辨率（DPI）', 'Output resolution (DPI)')}</span><div className="seg">{[150, 300, 600].map((d) => <button key={d} className={s.settings.printDpi === d ? 'active' : ''} onClick={() => set({ printDpi: d })}>{d}</button>)}</div></label>
        <Notice tone="info">{t('出血、DPI、CMYK、字体嵌入等由印前智能体在后台处理，普通模式下不会向用户暴露。', 'Bleed, DPI, CMYK and font embedding are handled by the prepress agent in the background — normal mode never asks you about them.')}</Notice>
      </Card>
      <Card className="pad-card"><SectionLabel en="STORAGE">{t('数据与存储', 'Data & storage')}</SectionLabel>
        <div className="kv"><span>{t('存储方式', 'Storage')}</span><strong>{s.storage}</strong></div>
        <div className="kv"><span>{t('项目数量', 'Projects')}</span><strong>{s.projects.length}</strong></div>
        <div className="kv"><span>{t('已实现结构', 'Structures available')}</span><strong>{t(`${STRUCTURES.length} 种`, `${STRUCTURES.length}`)}</strong></div>
        <div className="detail-actions"><Button size="sm" variant="outline" onClick={exportAll}>{t('导出全部项目', 'Export all projects')}</Button>
          <Button size="sm" variant="outline" onClick={() => importRef.current?.click()}>{t('导入项目', 'Import projects')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setClearOpen(true)}>{t('清空本地数据', 'Clear local data')}</Button></div>
        <input ref={importRef} type="file" accept="application/json" hidden onChange={(e) => importAll(e.target.files?.[0])} />
        <Notice tone="warn">{t('项目保存在本机浏览器，不上传服务器。清除浏览器数据会一并删除项目，建议定期导出备份。', 'Projects live in this browser and are not uploaded to a server. Clearing browser data deletes them too, so export a backup now and then.')}</Notice>
      </Card>
    </div>
    <Modal open={clearOpen} title={t('清空本地数据', 'Clear local data')} onClose={() => setClearOpen(false)}>
      <p className="modal-p">{t('将删除本机保存的全部项目、设计稿与设置（不会删除已下载到电脑的文件）。此操作不可撤销。', 'Every project, design and setting stored on this device will be deleted (files already downloaded to your computer are untouched). This cannot be undone.')}</p>
      <div className="modal-buttons"><Button variant="outline" onClick={() => setClearOpen(false)}>{t('取消', 'Cancel')}</Button>
        <Button onClick={() => { localStorage.removeItem('lunasol.state.v1'); try { indexedDB.deleteDatabase('lunasol-studio'); } catch { /* ignore */ } setClearOpen(false); setToast(t('已清空，正在重新载入', 'Cleared — reloading')); setTimeout(() => location.reload(), 700); }}>{t('确认清空', 'Clear everything')}</Button></div>
    </Modal>
  </div>;
}

/* ============================ 14. AI 模型（平台托管） ============================ */
export function ModelConfig() {
  const { s, update, setToast } = useApp();
  const { lang, t } = useLang();
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
    setToast(m === 'off'
      ? t('已切换到内置设计引擎（关闭平台 AI）', 'Switched to the built-in design engine (platform AI off)')
      : t('已启用平台 AI，全站建议即时生效', 'Platform AI enabled — suggestions site-wide take effect immediately'));
  };
  const test = async () => {
    setTesting(true);
    const r = await testConnection(ai);
    const next = { ...ai, lastTest: r };
    saveAI(next); update({ ai: next });
    setTesting(false);
    setToast(r.ok ? t('连接测试通过', 'Connection test passed') : t(`连接失败：${r.message.slice(0, 60)}`, `Connection failed: ${r.message.slice(0, 60)}`));
  };

  return <div className="page page-narrow">
    <PageHead kicker="AI MODELS / 14" title={t('AI 模型', 'AI models')} desc={t('AI 由 LunaSol 平台统一接入并托管密钥，你无需、也不能配置任何模型或 API Key。下方仅展示接入状态与开关。', 'AI is provided and key-managed entirely by LunaSol. You neither need nor can configure any model or API key — this page only shows status and the on/off switch.')} />
    <div className="model-status">
      <div><span className={`status-dot ${enabled ? ai.lastTest?.ok ? 'on' : 'pending' : 'off'}`} />
        <strong>{enabled
          ? (mode === 'proxy' ? t('平台 AI 已启用', 'Platform AI enabled') : ai.lastTest?.ok ? t('已连接', 'Connected') : t('已配置，未验证连接', 'Configured, connection not verified'))
          : t('未启用 AI 接入', 'AI not enabled')}</strong>
        <p>{enabled
          ? (ai.lastTest ? `${ai.lastTest.message} · ${formatDate(ai.lastTest.at)}` : t('点击「测试连接」验证接口可用性', 'Use “Test connection” to verify the endpoint'))
          : t('当前每一步由内置设计引擎给出确定性建议，界面明确标注「未调用 AI」，基础创作与导出不受影响。', 'Every step currently uses deterministic suggestions from the built-in engine. The UI marks it as “AI not called”, and core design and export are unaffected.')}</p></div>
      <Tag tone={enabled ? 'green' : 'plain'}>{aiStatusLabel(ai, lang === 'en')}</Tag>
    </div>

    <Card className="pad-card"><SectionLabel en="PLATFORM MODELS">{t('平台模型（托管）', 'Platform models (hosted)')}</SectionLabel>
      <p className="ai-caps-intro">{t('LunaSol 在腾讯云开发 CloudBase 部署后台代理，', 'LunaSol runs a backend proxy on CloudBase, and ')}<strong>{t('所有厂商 API Key 只保存在云函数环境变量', 'every vendor API key lives only in cloud-function environment variables')}</strong>{t('，前端不接触任何密钥。文本能力由平台统一路由，已接入 DeepSeek、Kimi、Doubao-Seed、GLM 等多款模型；生图接入 Doubao-Seedream 与 GPT Image 2（文字输入 / 输入图两档），用户可在 Luna 里切换；3D 建模预留 Hyper3D-Gen2。', '. The frontend never touches a key. Text runs through a single platform router covering DeepSeek, Kimi, Doubao-Seed and GLM; image generation uses Doubao-Seedream and GPT Image 2 (text-to-image and image-to-image), switchable inside Luna; 3D modelling is reserved for Hyper3D-Gen2.')}</p>
      <div className="kv"><span>{t('文本模型', 'Text models')}</span><strong>{t('DeepSeek-V4.1-Flash（默认）· DeepSeek-V4.1-Flash 经济版 · DeepSeek-V4-pro · Kimi-K3.1-Pro · Doubao-Seed-2.1-lite/turbo · GLM-5.3-Flash（服务端代理，会员共用每日 ¥1 额度）', 'DeepSeek-V4.1-Flash (default) · DeepSeek-V4.1-Flash Eco · DeepSeek-V4-pro · Kimi-K3.1-Pro · Doubao-Seed-2.1-lite/turbo · GLM-5.3-Flash (server proxy, members share a ¥1 daily budget)')}</strong></div>
      <div className="kv"><span>{t('生图模型', 'Image models')}</span><strong>{t('Doubao-Seedream 5.0 Flash / Pro · GPT Image 2 文字输入 / 输入图（服务端代理）', 'Doubao-Seedream 5.0 Flash / Pro · GPT Image 2 text-to-image / image-to-image (server proxy)')}</strong></div>
      <div className="kv"><span>{t('3D 模型', '3D model')}</span><strong>{t(`Hyper3D-Gen2（${PRICING.costs.hyper3d} 积分/次，编辑器中开放）`, `Hyper3D-Gen2 (${PRICING.costs.hyper3d} credits per run, available in the editor)`)}</strong></div>
      <div className="kv"><span>{t('后台', 'Backend')}</span><strong>{t('CloudBase HTTP 云函数', 'CloudBase HTTP cloud function')} · {CLOUD.region}</strong></div>
      <div className="kv"><span>{t('当前状态', 'Current status')}</span><strong>{enabled ? t('已启用平台 AI', 'Platform AI enabled') : t('已关闭，使用内置设计引擎', 'Off — using the built-in design engine')}</strong></div>
      <Toggle label={t('启用平台 AI', 'Enable platform AI')} hint={t('开启后九步向导由平台大模型提供建议；关闭后改用内置确定性设计引擎（不调用大模型）', 'When on, the wizard takes suggestions from platform models; when off it uses the built-in deterministic engine and never calls a model')} checked={enabled} onChange={(v) => setMode(v ? 'proxy' : 'off')} />
      {!deepSeekReady && enabled && <Notice tone="warn">{t('当前构建未配置平台代理地址，开启后也无法实际调用；请在正式站点使用。', 'This build has no platform proxy URL configured, so nothing can actually be called. Please use the official site.')}</Notice>}
      <div className="model-actions"><Button disabled={!enabled || !deepSeekReady} onClick={test}>{testing ? t('测试中…', 'Testing…') : t('测试连接', 'Test connection')}</Button></div>
      <Notice tone="info">{t('代理网关按来源域名与令牌校验，并设有 QPS 限制；生图按 Flash / Pro 档位扣积分。', 'The proxy validates origin and token and applies a QPS limit; image runs deduct credits by Flash / Pro tier.')}</Notice>
    </Card>

    <Card className="pad-card"><SectionLabel en="AI IN THE FLOW">{t('AI 已融入哪些环节', 'Where AI is used')}</SectionLabel>
      <p className="ai-caps-intro">{t(`共 ${caps.total} 个能力点（${caps.steps} 个向导步骤 + ${caps.global} 个全局节点）。每个能力点都已定义输入上下文、输出结构、合规约束与本地回退；平台接好模型后，流程与界面代码一行都不用改。`, `${caps.total} capability points (${caps.steps} wizard steps + ${caps.global} global nodes). Each one defines its input context, output shape, compliance constraints and local fallback, so wiring a model needs no changes to the flow or UI code.`)}</p>
      <div className="ai-cap-grid">{caps.list.map((c) => <div className="ai-cap" key={c.id}>
        <span>{typeof c.step === 'number' ? `STEP ${String(c.step + 1).padStart(2, '0')}` : c.step === 'review' ? t('需求汇总', 'Requirements summary') : t('在线编辑器', 'Online editor')}</span>
        <strong>{lang === 'en' ? c.titleEn : c.title}</strong><em>{t(`${c.constraints} 条合规约束`, `${c.constraints} compliance rules`)}</em>
      </div>)}</div>
      <Button variant="ghost" onClick={() => setDocOpen(true)}>{t('查看后台接入契约', 'View the backend contract')} <span aria-hidden>→</span></Button>
    </Card>

    <Card className="pad-card"><SectionLabel en="RUN LOG">{t('最近调用记录', 'Recent calls')}</SectionLabel>
      <div className="ai-runlog" data-tick={logTick}>
        {runs.length ? runs.map((r) => <div className="ai-run" key={`${r.at}-${r.taskId}`}>
          <span className={`ai-run-src ai-run-${r.source}`}>{r.source === 'ai' ? 'AI' : r.source === 'fallback' ? t('回退', 'Fallback') : r.source === 'paywall' ? t('额度', 'Quota') : t('本地', 'Local')}</span>
          <strong>{r.taskId}</strong><em>{new Date(r.at).toLocaleTimeString(lang === 'en' ? 'en-US' : 'zh-CN')} · {r.durationMs}ms · {r.mode}</em>
          <p>{r.note}</p>
        </div>) : <p className="ai-runlog-empty">{t('还没有调用记录。进入九步向导，在任意一步点「获取建议」即可看到这里记录来源、耗时与回退原因。', 'No calls recorded yet. Open the wizard and hit “Get suggestions” at any step — source, duration and fallback reason will show up here.')}</p>}
      </div>
      <div className="model-actions"><Button variant="ghost" onClick={() => { clearAIRunLog(); setLogTick((n) => n + 1); setToast(t('调用记录已清空', 'Call log cleared')); }}>{t('清空记录', 'Clear log')}</Button></div>
    </Card>

    <Card className="pad-card"><SectionLabel en="NO KEY MODE">{t('没有启用平台 AI 时', 'When platform AI is off')}</SectionLabel>
      <div className="nokey-grid">{(lang === 'en'
        ? ['Create projects manually', 'Nine-step local suggestions', 'Built-in colour and style picks', 'Edit text and upload images', 'Save and restore projects', 'PDF / SVG / PNG / DXF export']
        : ['手动创建项目', '九步本地建议', '内置配色与风格推荐', '编辑文字与上传图片', '保存与恢复项目', 'PDF / SVG / PNG / DXF 导出']).map((x) => <span key={x}>✓ {x}</span>)}</div>
      <Notice tone="info">{t('内置引擎是确定性的程序化设计，界面会标注「未调用 AI」；只有真正调用模型并通过合规校验后，才会显示 AI 结果。调用失败会如实回退，绝不冒充。', 'The built-in engine is deterministic and procedural, and the UI marks it as “AI not called”. Only real model output that passes compliance checks is shown as AI; failures fall back honestly and are never disguised.')}</Notice>
    </Card>

    <Modal open={docOpen} title={t('后台接入契约', 'Backend contract')} onClose={() => setDocOpen(false)} wide>
      <div className="doc-body">
        <h4>{t('一、平台统一接入（用户无需配置）', '1. One platform integration (no setup for users)')}</h4><p>{t('模型由 LunaSol 平台在云端代理中托管，文本能力统一走 ', 'Models are hosted by the LunaSol platform inside a cloud proxy; text runs through a single ')}<strong>DeepSeek</strong>{t('，由后台决定具体模型。', ' route, and the backend picks the concrete model. ')}<strong>{t('前端不暴露、也不允许用户配置任何厂商 API Key 或自定义模型。', 'The frontend exposes no vendor API key and does not allow custom models.')}</strong>{t('图像生成不由 DeepSeek 提供，因此图像能力走站内插画与素材，不伪装成 AI 出图。', ' Image generation is not provided by DeepSeek, so image work uses on-site illustration and assets rather than pretending to be AI output.')}</p>
        <h4>{t('二、文字接口', '2. Text endpoint')}</h4><p>POST <code>{CLOUD.aiBaseUrl || t('（平台代理地址）', '(platform proxy URL)')}/chat/completions</code>{t('。请求体是标准 OpenAI 兼容格式 ', '. The body is standard OpenAI-compatible ')}<code>messages / temperature / response_format</code>{t('，', ', and ')}<code>model</code>{t('由平台决定。返回 ', ' is decided by the platform. It returns ')}<code>choices[0].message.content</code>{t('，内容为一个 JSON 对象。', ', whose content is a JSON object.')}</p>
        <h4>{t('三、输出结构与合规校验', '3. Output shape and compliance checks')}</h4><p>{t('所有流程节点统一返回 ', 'Every flow node returns ')}<code>&#123;"suggestions":[&#123;"title","detail","value"&#125;]&#125;</code>{t('，每个节点的 ', '; the ')}<code>value</code>{t(' 结构不同，详见 ', ' shape differs per node — see ')}<code>src/ai/tasks.ts</code>{t('。模型输出会先经过结构校验与合规校验：编造配料 / 功效 / 认证、生成商品条码数字、发明不存在的风格、在「不需要插画」时添加图案，都会被拦截并回退本地建议。', '. Output passes structural and compliance checks first: invented ingredients, claims or certifications, fabricated barcode digits, non-existent styles, or motifs where no illustration is needed are all blocked and fall back to local suggestions.')}</p>
        <h4>{t('四、替换 / 扩展传输实现', '4. Replacing or extending the transport')}</h4><p>{t('若后续要在代理中新增模型或换厂商，只需在云函数 ', 'To add a model or switch vendors later, only the model whitelist and routing in the ')}<code>lunasol-ai</code>{t(' 中调整模型白名单与路由，前端流程与界面代码不用改；如需替换前端传输实现，可调用一次 ', ' cloud function change — no flow or UI code does. To swap the frontend transport, call ')}<code>registerAITransport(fn)</code>{t('。', ' once.')}</p>
        <h4>{t('五、错误处理与安全', '5. Error handling and security')}</h4><p>{t('60s 超时（图像 120s）、可配置重试、失败或校验不通过自动回退内置引擎并在调用记录里留痕，不会把模拟结果伪装成 AI 输出。代理令牌是静态站点的共享访问令牌，不是厂商密钥；按用户额度管控由订阅系统（见订阅页）在网关层启用登录态鉴权实现。', '60s timeout (120s for images), configurable retries, and automatic fallback to the built-in engine with a trace in the call log — mock results are never passed off as AI output. The proxy token is a shared access token for a static site, not a vendor key; per-user quota control is enforced at the gateway with signed-in authentication by the subscription system (see the subscription page).')}</p>
      </div>
    </Modal>
  </div>;
}
