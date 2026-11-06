import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import { Button, Card, Empty, Field, Modal, Notice, PageHead, SectionLabel, Spinner, StepBar, Tag, Toggle, go } from '../ui';
import { DesignView, DielineView } from '../components/visuals';
import { aiEnhanceBrief, briefScore, createEmptyBrief, nextQuestion, parseUtterance, STYLE_PRESETS } from '../engine/brief';
import { aiConfigured, llmImage } from '../engine/llm';
import { buildDieline, recommendStructures, STRUCTURES, structureById } from '../engine/structure';
import { FONTS, SCHEME_META, addImageLayer, allLayers, buildSchemes, cloneDesign, fitText, makeShape, makeText } from '../engine/design';
import { aiModify, applyPatch, localIntent, versionLabel } from '../engine/modify';
import { spreadSvg } from '../engine/export';
import type { DesignDoc, FaceId, ImageLayer, Layer, ShapeKind, StructureId, TextLayer } from '../types';
import { FLOW_STEPS } from '../data';
import { clamp, downloadBlob, formatDate, hexToRgb, uid } from '../engine/utils';
import { styleById, styleByName } from '../v3/styles';

const FACE_LABEL: Record<FaceId, string> = { front: '正面', back: '背面', left: '左侧', right: '右侧', top: '顶面' };

/* ============================ 1. AI 包装创作中心 ============================ */
export function Create() {
  const { s, update, patchBrief, addChat, setToast, saveProject } = useApp();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const brief = s.brief;
  const configured = aiConfigured(s.ai);
  const q = nextQuestion(brief);
  const score = briefScore(brief);

  useEffect(() => {
    if (s.chat.length === 0) addChat({
      role: 'ai', kind: 'question', text: '告诉我，你想做什么包装？简单描述你的想法，剩下的交给 LunaSol。',
      options: ['我想做一个茶叶包装礼盒', '我想做咖啡自立袋', '我想做产品标签', '我还没想好，帮我推荐'],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [s.chat.length]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    addChat({ role: 'user', text });
    setInput('');
    const { brief: nb, detected } = parseUtterance(brief, text);
    update({ brief: nb });
    if (detected.length) addChat({ role: 'ai', kind: 'note', text: `已记下 ${detected.join('；')}。` });
    if (/我直接输入名字|我自己写|手动输入/.test(text)) { addChat({ role: 'ai', kind: 'question', text: '好的，直接在下方输入品牌名就行，比如「品牌叫山隐茶集」。' }); return; }
    const nq = nextQuestion(nb);
    if (nq) addChat({ role: 'ai', kind: 'question', text: nq.question, options: nq.options });
    else addChat({ role: 'ai', kind: 'result', text: '信息足够了。我会先整理成一份你能看懂的设计需求，确认后再给出三套不同方向。' });
  };

  const fillDefaults = () => {
    const nb = { ...brief };
    if (!nb.packType) nb.packType = 'box';
    if (!nb.size.l) nb.size = { l: 200, w: 150, h: 80 };
    if (!nb.brand) nb.brand = '山隐茶集';
    if (!nb.product) nb.product = '茶叶';
    if (!nb.category) nb.category = '茶饮';
    if (!nb.style) nb.style = '现代东方';
    if (!nb.colors.length) nb.colors = ['#f3eee4', '#20463a', '#c8a86b'];
    patchBrief(nb);
    addChat({ role: 'ai', kind: 'result', text: '好的，我按「山隐茶集 · 东方极简茶叶礼盒」补齐了缺失信息。你可以继续修改，也可以直接进入需求确认。' });
    setToast('已用推荐设置补齐需求');
  };

  const enhance = async () => {
    if (!configured) { go('/models'); return; }
    setBusy(true);
    const r = await aiEnhanceBrief(brief, s.ai);
    update({ brief: r.brief });
    addChat({ role: 'ai', kind: 'note', text: r.message });
    setBusy(false);
  };

  const onRef = (f: File | undefined) => {
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      patchBrief({ referenceImage: String(fr.result), referenceName: f.name, packType: 'custom', size: { l: 0, w: 0, h: 0 } });
      addChat({ role: 'user', text: `上传参考图：${f.name}` });
      addChat({ role: 'ai', kind: 'question', text: '收到参考图。照片只能作为视觉参考，不能据此推断精确生产结构。请告诉我实际的长 × 宽 × 高，以及你想用的盒型。', options: ['200 × 150 × 80mm', '帮我推荐常见尺寸', '用插舌盒', '用天地盖盒'] });
      setRefOpen(false);
      setToast('参考图已加入项目，关键尺寸与结构仍需你确认');
    };
    fr.readAsDataURL(f);
  };

  const reqRows: [string, string][] = [
    ['产品 / 品类', brief.product ? `${brief.product}${brief.category ? ` · ${brief.category}` : ''}` : '待补充'],
    ['包装形式', { box: '包装盒', label: '产品标签', pouch: '袋装包装', custom: '自定义包装', '': '待补充' }[brief.packType] || '待补充'],
    ['成品尺寸', brief.size.l ? `${brief.size.l} × ${brief.size.w}${brief.size.h ? ` × ${brief.size.h}` : ''} mm` : '待补充'],
    ['品牌名称', brief.brand || '待补充'],
    ['设计风格', brief.style || '待补充'],
    ['配色方向', brief.colors.length ? brief.colors.join(' / ') : '待补充'],
    ['图案元素', brief.motif || 'AI 自由发挥'],
    ['包装结构', structureById(brief.structure).name],
  ];

  return <div className="page page-narrow">
    <StepBar steps={FLOW_STEPS} current={0} />
    <PageHead kicker="AI CREATION CENTER / 01" title="告诉我，你想做什么包装？" desc="简单描述你的想法，剩下的交给 LunaSol。一次只问一个问题。" />
    <div className="create-grid">
      <div className="chat-panel">
        <div className="chat-scroll">
          {s.chat.map((m) => <div key={m.id} className={`chat-msg ${m.role}`}>
            {m.role === 'ai' && <div className="chat-avatar">L</div>}
            <div className="chat-bubble">
              <div className="chat-text">{m.text}</div>
              {m.options && <div className="chat-options">{m.options.map((o) => <button key={o} onClick={() => send(o)}>{o}</button>)}</div>}
            </div>
          </div>)}
          <div ref={bottomRef} />
        </div>
        <div className="chat-quick">
          {['我想做一个茶叶包装盒，尺寸 200 × 150 × 80mm', '品牌叫山隐茶集', '简约高级，米白和深绿', '20cm × 15cm × 8cm'].map((t) => <button key={t} onClick={() => send(t)}>{t}</button>)}
        </div>
        <div className="chat-input">
          <textarea value={input} placeholder="例如：我想做一个茶叶包装礼盒，米白和深绿，简约高级，品牌叫山隐茶集…"
            onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} rows={2} />
          <Button onClick={() => send(input)} disabled={!input.trim() || busy}>发送 <span aria-hidden>↗</span></Button>
        </div>
        <div className="chat-foot">
          <span>{configured ? '已连接平台 AI（DeepSeek · 服务端代理）' : '当前为内置解析（未启用平台 AI），不会伪装成 AI 生成'}</span>
          <button className="link-btn" onClick={enhance}>{busy ? <Spinner label="AI 整理中" /> : configured ? '让 AI 深度理解' : '启用平台 AI →'}</button>
        </div>
      </div>

      <aside className="req-panel">
        <div className="req-head"><div><SectionLabel en="LIVE BRIEF">AI 已理解的需求</SectionLabel></div><strong>{score}%</strong></div>
        <div className="progress"><span style={{ width: `${score}%` }} /></div>
        <div className="req-rows">{reqRows.map(([k, v]) => <div className="req-row" key={k}><span>{k}</span><strong className={v === '待补充' ? 'muted' : ''}>{v}</strong></div>)}</div>
        {brief.referenceImage && <div className="ref-thumb"><img src={brief.referenceImage} alt="包装参考图" /><span>{brief.referenceName}</span></div>}
        <div className="req-actions">
          <Button variant="outline" onClick={() => setRefOpen(true)}>上传参考图</Button>
          <Button variant="ghost" onClick={fillDefaults}>AI 帮我补齐</Button>
        </div>
        <Notice tone="info">启用平台 AI 后，AI 会直接理解整段对话；未启用时使用内置中文解析，功能同样可用。</Notice>
        <div className="req-bottom">
          <Button size="lg" disabled={!!q} onClick={() => { saveProject(); go('/brief'); }}>查看需求分析 <span aria-hidden>→</span></Button>
          {q && <p>{q.hint}</p>}
        </div>
      </aside>
    </div>
    <Modal open={refOpen} title="上传现有包装照片 / 参考文件" onClose={() => setRefOpen(false)}>
      <p className="modal-p">LunaSol 只把照片作为视觉参考，<strong>不会仅凭一张照片推断精确生产结构</strong>。上传后请确认关键尺寸与盒型，系统才会生成刀模。</p>
      <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={(e) => onRef(e.target.files?.[0])} />
      <div className="modal-buttons"><Button onClick={() => fileRef.current?.click()}>选择图片</Button></div>
    </Modal>
  </div>;
}

/* ============================ 2. AI 设计需求分析 ============================ */
export function BriefPage() {
  const { s, update, patchBrief, addChat, setToast, saveProject, dieline } = useApp();
  const [unit, setUnit] = useState<'mm' | 'cm' | 'inch'>(s.settings.defaultUnit);
  const [busy, setBusy] = useState(false);
  const [showDieline, setShowDieline] = useState(false);
  const b = s.brief;
  const factor = unit === 'mm' ? 1 : unit === 'cm' ? 0.1 : 1 / 25.4;
  const rec = recommendStructures(b.product, b.packType, b.size);
  const preset = STYLE_PRESETS.find((p) => p.id === b.style) || STYLE_PRESETS[0];

  const setDim = (k: 'l' | 'w' | 'h', v: number) => patchBrief({ size: { ...b.size, [k]: Math.max(0, Number((v / factor).toFixed(1))) } });
  const enhance = async () => {
    if (!aiConfigured(s.ai)) { go('/models'); return; }
    setBusy(true); const r = await aiEnhanceBrief(b, s.ai); update({ brief: r.brief }); addChat({ role: 'ai', kind: 'note', text: r.message }); setBusy(false);
    setToast(r.applied ? 'AI 已更新需求' : r.message);
  };
  const proceed = () => {
    update({ schemes: buildSchemes(b, styleById(s.draft?.style_id || '') || styleByName(b.style)), report: null });
    saveProject(); go('/schemes');
  };

  return <div className="page page-narrow">
    <StepBar steps={FLOW_STEPS} current={1} />
    <PageHead kicker="DESIGN BRIEF / 02" title="确认一下，就按这个方向设计？" desc="AI 已把你的描述整理成结构化需求。所有建议都不会覆盖你明确指定的内容。"
      right={<Button variant="outline" onClick={() => go('/create')}>我想修改一下</Button>} />
    <div className="brief-grid">
      <Card className="brief-card">
        <div className="brief-card-head"><span>DESIGN DIRECTION</span><Tag tone="green">{b.style || 'AI 推荐风格'}</Tag></div>
        <h2>{b.brand || '未命名品牌'}<em>{b.product || '包装设计'}</em></h2>
        <div className="brief-swatches">{[b.colors[0] || preset.palette[0], b.colors[1] || preset.palette[1], b.colors[2] || preset.palette[2]].map((c, i) => <div key={i} style={{ background: c }}><span>{c}</span></div>)}</div>
        <div className="brief-rows">
          {([['产品品类', b.category || '按描述自动判断'], ['包装形式', { box: '包装盒', label: '产品标签', pouch: '袋装包装', custom: '自定义包装' }[b.packType] || '待定'],
          ['视觉风格', b.style || preset.id], ['图案元素', b.motif || 'AI 自由发挥'], ['目标人群', b.audience || '大众消费'],
          ['使用场景', b.scene || '日常 / 零售'], ['材质偏好', b.material || '按印厂常规'], ['包装文字', `${(b.tagline ? 1 : 0) + (b.spec ? 1 : 0) + b.extraText.length} 条已提供，其余用占位符提示`]] as [string, string][]).map(([k, v]) =>
            <div key={k} className="brief-row"><span>{k}</span><strong>{v}</strong></div>)}
        </div>
        <div className="brief-suggest">
          <div className="brief-suggest-title">AI 自动补全的设计建议</div>
          <p>推荐「{preset.id}」方向：{preset.desc}；采用留白式构图与中英文结合的字体层级，正面突出品牌与产品名，侧面放简要说明，背面放详细产品信息。</p>
          <div className="chips">{preset.id && [preset.desc.slice(0, 8), '留白构图', '中英混排', '5mm 安全边距'].map((x) => <span className="chip static" key={x}>{x}</span>)}</div>
        </div>
      </Card>

      <div className="brief-side">
        <Card className="pad-card">
          <SectionLabel en="SIZE">成品尺寸</SectionLabel>
          <div className="unit-row"><span>单位</span><div className="seg">{(['mm', 'cm', 'inch'] as const).map((u) => <button key={u} className={unit === u ? 'active' : ''} onClick={() => setUnit(u)}>{u}</button>)}</div></div>
          <div className="size-inputs">
            {(['l', 'w', 'h'] as const).map((k) => <Field key={k} label={k === 'l' ? (b.packType === 'label' ? '宽度' : '长度') : k === 'w' ? (b.packType === 'pouch' ? '侧边折角' : '宽度 / 高度') : '高度'}>
              <input type="number" min="0" step="0.1" value={Number((b.size[k] * factor).toFixed(2))} onChange={(e) => setDim(k, Number(e.target.value))} />
            </Field>)}
          </div>
          <div className="size-readout">实际计算：{b.size.l} × {b.size.w}{b.size.h ? ` × ${b.size.h}` : ''} mm</div>
          {b.referenceImage && <Notice tone="warn">已上传参考图，但刀模只会按上方尺寸与所选结构生成。</Notice>}
        </Card>

        <Card className="pad-card">
          <div className="card-title-row"><SectionLabel en="STRUCTURE">推荐包装结构</SectionLabel><Button variant="ghost" onClick={() => setShowDieline(true)}>看展开图 ↗</Button></div>
          <div className="struct-list">{rec.map((id, i) => {
            const st = structureById(id as StructureId);
            return <button key={id} className={`struct-opt ${b.structure === id ? 'selected' : ''}`} onClick={() => patchBrief({ structure: id as StructureId })}>
              <span className="struct-idx">0{i + 1}</span><span className="struct-name"><strong>{st.name}</strong><em>{st.desc}</em></span>
              <span className="struct-meta"><span>适用 {st.use}</span><span>难度 {'●'.repeat(st.difficulty)}{'○'.repeat(3 - st.difficulty)}</span></span>
            </button>;
          })}</div>
          <Button variant="ghost" onClick={() => { patchBrief({ structure: rec[0] as StructureId }); setToast(`已推荐「${structureById(rec[0] as StructureId).name}」`); }}>帮我推荐</Button>
        </Card>
      </div>
    </div>
    <div className="brief-bottom">
      <div><strong>就按这个方向设计</strong><p>点击后 AI 会一次生成三套明显不同的设计方向。</p></div>
      <div className="brief-bottom-actions"><Button variant="outline" onClick={enhance} disabled={busy}>{busy ? <Spinner label="AI 整理中" /> : 'AI 深度理解'}</Button>
        <Button size="lg" onClick={proceed}>就按这个方向设计 <span aria-hidden>→</span></Button></div>
    </div>
    <Modal open={showDieline} title="包装结构展开图（按真实尺寸计算）" onClose={() => setShowDieline(false)} wide>
      <div className="dieline-modal-grid">{dieline.sheets.map((sh) => <div key={sh.id}><div className="dieline-cap">{sh.name} · {sh.width} × {sh.height} mm</div><DielineView sheet={sh} dieline={dieline} showArtwork={false} /></div>)}</div>
      <div className="legend"><span><i className="lg-cut" />裁切线</span><span><i className="lg-crease" />压痕线</span><span><i className="lg-bleed" />出血线</span><span><i className="lg-safe" />安全区</span></div>
    </Modal>
  </div>;
}

/* ============================ 3. AI 设计方案展示 ============================ */
export function Schemes() {
  const { s, update, setToast, saveProject, addChat, dieline } = useApp();
  const [detail, setDetail] = useState<number | null>(null);
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const configured = aiConfigured(s.ai);
  useEffect(() => { if (!s.schemes.length && s.brief.brand) update({ schemes: buildSchemes(s.brief, styleById(s.draft?.style_id || '') || styleByName(s.brief.style)) }); }, []); // eslint-disable-line

  const choose = (d: DesignDoc) => {
    update({ design: cloneDesign(d) });
    saveProject(`${s.brief.brand || 'LunaSol'} · ${SCHEME_META[d.scheme].title}`);
    addChat({ role: 'ai', kind: 'result', text: `已选择「${SCHEME_META[d.scheme].title}」方向，进入工作台后可以继续用对话修改。` });
    go('/editor');
  };
  const regenerate = () => { update({ schemes: buildSchemes(s.brief, styleById(s.draft?.style_id || '') || styleByName(s.brief.style)) }); setToast('已按当前风格配置重新生成三套方向'); };
  const genImage = async (i: number) => {
    if (!s.ai.imageEnabled || !configured) { setToast('请先在「平台模型」里启用图像生成'); go('/models'); return; }
    setBusyIdx(i);
    try {
      const b = s.brief;
      const img = await llmImage(`Original packaging illustration, no text, no logo: ${b.product || 'product'}, ${b.style || 'modern minimal'}, motif ${b.motif || 'abstract nature'}, colors ${(b.colors.length ? b.colors : ['#f3eee4', '#20463a']).join(' ')}, flat editorial vector style, clean background`, s.ai);
      const schemes = s.schemes.map((d, j) => j === i ? addImageLayer(d, 'front', img) : d);
      update({ schemes });
      setToast('真实 AI 插画素材已作为独立图层加入正面');
    } catch (e) { setToast(`图像生成失败：${e instanceof Error ? e.message : e}`); }
    setBusyIdx(null);
  };

  if (!s.schemes.length) return <div className="page page-narrow"><Empty title="还没有设计方案" desc="先用九步向导整理尺寸、风格与文案，再生成三个设计方向。" action={<Button onClick={() => go('/wizard')}>开始九步设计</Button>} /></div>;

  return <div className="page">
    <StepBar steps={FLOW_STEPS} current={2} />
    <PageHead kicker="THREE DIRECTIONS / 03" title="三套明显不同的设计方向" desc="每套都包含正 / 背 / 侧 / 顶的完整分层设计稿。文字独立可编辑，不是一张图片。"
      right={<Button variant="outline" onClick={regenerate}>重新生成</Button>} />
    <div className="scheme-grid">
      {s.schemes.map((d, i) => <Card key={d.id} className="scheme-card">
        <div className="scheme-top"><span>{SCHEME_META[d.scheme].en}</span><span>0{i + 1}</span></div>
        <button className="scheme-preview" onClick={() => setDetail(i)}><DesignView face={d.faces.front!} /></button>
        <div className="scheme-body">
          <h3>{SCHEME_META[d.scheme].title}</h3><p>{SCHEME_META[d.scheme].desc}</p>
          <div className="scheme-swatches">{[d.palette.bg, d.palette.primary, d.palette.accent, d.palette.ink].map((c, k) => <i key={k} style={{ background: c }} />)}</div>
          <div className="scheme-tags">{SCHEME_META[d.scheme].tags.map((t) => <Tag key={t}>{t}</Tag>)}</div>
          <div className="scheme-actions">
            <Button onClick={() => choose(d)}>选择这个方向 <span aria-hidden>→</span></Button>
            <Button variant="ghost" onClick={() => setDetail(i)}>看展开稿</Button>
          </div>
          <button className="scheme-ai" onClick={() => genImage(i)} disabled={busyIdx === i}>
            {busyIdx === i ? <Spinner label="AI 生成插画中" /> : configured && s.ai.imageEnabled ? '✦ 用 AI 生成真实插画素材' : '✦ 启用图像生成后可生成真实素材'}
          </button>
        </div>
      </Card>)}
    </div>
    <Notice tone="info">未配置图像模型时，方案中的插画由 LunaSol 内置矢量素材引擎生成（原创、可编辑、无限分辨率）；配置后才会调用真实图像模型，并作为独立图层加入设计稿。</Notice>
    <Modal open={detail !== null} title={detail !== null ? `${SCHEME_META[s.schemes[detail].scheme].title} · 完整设计稿` : ''} onClose={() => setDetail(null)} wide>
      {detail !== null && <div className="scheme-detail">
        <div className="scheme-detail-faces">{Object.entries(s.schemes[detail].faces).map(([k, f]) => <div key={k}><span>{FACE_LABEL[k as FaceId]}</span><DesignView face={f!} /></div>)}</div>
        <div className="scheme-detail-net"><span>平面展开稿</span><DielineView sheet={dieline.sheets[0]} dieline={dieline} design={s.schemes[detail]} /></div>
        <p className="rationale">{s.schemes[detail].rationale}</p>
        <Button onClick={() => { choose(s.schemes[detail]); setDetail(null); }}>选择这个方向 <span aria-hidden>→</span></Button>
      </div>}
    </Modal>
  </div>;
}

/* ============================ 4. 智能包装设计工作台 ============================ */
export function Editor() {
  const { s, update, setToast, addChat, addVersion, restoreVersion, syncProject, patchBrief } = useApp();
  const design = s.design;
  const [faceId, setFaceId] = useState<FaceId>('front');
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'simple' | 'advanced'>(s.settings.advancedMode ? 'advanced' : 'simple');
  const [chatText, setChatText] = useState('');
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<DesignDoc[]>(design ? [cloneDesign(design)] : []);
  const [hi, setHi] = useState(0);
  const [editorChat, setEditorChat] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const face = design?.faces[faceId] || null;
  const layer = face?.layers.find((l) => l.id === selected) || null;
  const project = s.projects.find((p) => p.id === s.activeId);

  useEffect(() => { if (!design) return; setHist([cloneDesign(design)]); setHi(0); }, [design?.id]); // eslint-disable-line
  useEffect(() => { if (design) syncProject(); }, [design]); // eslint-disable-line

  if (!design) return <div className="page page-narrow"><Empty title="还没有选中设计方案" desc="先选一套 AI 方案，再进入工作台编辑。" action={<Button onClick={() => go('/schemes')}>查看方案</Button>} /></div>;

  const commit = (next: DesignDoc, label: string) => {
    update({ design: next });
    const h = [...hist.slice(0, hi + 1), cloneDesign(next)].slice(-40);
    setHist(h); setHi(h.length - 1);
    addVersion(label);
    syncProject();
  };
  const undo = () => { if (hi <= 0) return; const k = hi - 1; setHi(k); update({ design: cloneDesign(hist[k]) }); };
  const redo = () => { if (hi >= hist.length - 1) return; const k = hi + 1; setHi(k); update({ design: cloneDesign(hist[k]) }); };

  const mutateLayer = (id: string, p: Partial<Layer>) => {
    const next = cloneDesign(design);
    const f = next.faces[faceId]; if (!f) return;
    const l = f.layers.find((x) => x.id === id); if (!l) return;
    Object.assign(l, p);
    if (l.type === 'text') fitText(l as TextLayer);
    commit(next, `调整「${l.name}」`);
  };
  const removeLayer = (id: string) => {
    const next = cloneDesign(design); const f = next.faces[faceId]; if (!f) return;
    f.layers = f.layers.filter((l) => l.id !== id); setSelected(null); commit(next, '删除图层');
  };
  const addLayer = (kind: 'text' | 'rect' | 'circle' | 'mountain' | 'line') => {
    const next = cloneDesign(design); const f = next.faces[faceId]; if (!f) return;
    if (kind === 'text') f.layers.push(makeText('新文字', '双击右侧修改文字', 'custom', { x: 10, y: f.h * 0.5, w: f.w - 20, h: 12 }, { fontSize: 12 }));
    else f.layers.push(makeShape('新图形', kind as ShapeKind, { x: f.w * 0.2, y: f.h * 0.25, w: f.w * 0.6, h: f.h * 0.4 }, { fill: design.palette.primary }));
    commit(next, '添加图层'); setAddOpen(false);
  };
  const uploadImage = (file?: File) => {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      const src = String(fr.result); const im = new Image();
      im.onload = () => {
        const next = cloneDesign(design); const f = next.faces[faceId]; if (!f) return;
        const l: ImageLayer = { id: uid('ly'), name: file.name, x: f.w * 0.1, y: f.h * 0.2, w: f.w * 0.8, h: f.h * 0.6, rotation: 0, opacity: 1, locked: false, type: 'image', src, naturalW: im.naturalWidth, naturalH: im.naturalHeight, fit: 'cover' };
        f.layers.push(l); commit(next, '上传图片'); setAddOpen(false); setToast('图片已加入，印前检查会计算有效 DPI');
      };
      im.src = src;
    };
    fr.readAsDataURL(file);
  };
  const doModify = async (text: string) => {
    if (!text.trim()) return;
    setEditorChat((c) => [...c, { role: 'user', text }]); setChatText(''); setBusy(true);
    let ops, note;
    if (aiConfigured(s.ai)) { const r = await aiModify(text, design, s.ai); ops = r.ops; note = r.note; }
    else { ops = localIntent(text); note = '内置规则已完成局部修改（未配置 AI 模型）'; }
    const r = applyPatch(design, ops);
    commit(r.design, versionLabel(text));
    setEditorChat((c) => [...c, { role: 'ai', text: `${note}：${r.changes.join('；')}。已生成新的历史版本，锁定的内容没有被改动。` }]);
    setBusy(false);
  };
  const changeMode = (m: 'simple' | 'advanced') => { setMode(m); patchBrief({}); update({ settings: { ...s.settings, advancedMode: m === 'advanced' } }); };

  const quickPrompts = ['把包装改成更简约一点', '品牌名字放大一些', '背景换成米白色', '插画更有东方韵味', '正面不要这么多文字', '背面增加产品介绍', '字体换成宋体'];

  return <div className="page page-wide">
    <StepBar steps={FLOW_STEPS} current={3} />
    <div className="editor-head">
      <div><div className="kicker">DESIGN STUDIO / 04</div><h1>智能包装设计工作台</h1><p>{design.name} · {s.brief.size.l} × {s.brief.size.w} × {s.brief.size.h} mm</p></div>
      <div className="editor-head-actions">
        <div className="seg">{(['simple', 'advanced'] as const).map((m) => <button key={m} className={mode === m ? 'active' : ''} onClick={() => changeMode(m)}>{m === 'simple' ? '普通编辑' : '高级编辑'}</button>)}</div>
        <Button variant="outline" onClick={() => go('/preview')}>3D 预览 <span aria-hidden>→</span></Button>
        <Button onClick={() => go('/prepress')}>印前检查 <span aria-hidden>→</span></Button>
      </div>
    </div>
    <div className="editor-grid">
      <aside className="editor-left">
        <div className="panel-title">包装面</div>
        <div className="face-tabs">{Object.keys(design.faces).map((k) => <button key={k} className={faceId === k ? 'active' : ''} onClick={() => { setFaceId(k as FaceId); setSelected(null); }}>{FACE_LABEL[k as FaceId]}</button>)}</div>
        <div className="panel-title row"><span>图层</span><button className="icon-btn" onClick={() => setAddOpen(true)} title="添加图层">＋</button></div>
        <div className="layer-list">{face?.layers.map((l, i) => <div key={l.id} className={`layer-item ${selected === l.id ? 'active' : ''} ${l.hidden ? 'hidden-layer' : ''}`} onClick={() => setSelected(l.id)}>
          <span className="layer-icon">{l.type === 'text' ? 'T' : l.type === 'image' ? '▣' : '◆'}</span>
          <span className="layer-name">{l.name}<em>{l.type === 'text' ? (l as TextLayer).role : l.type === 'shape' ? l.shape : `${(l as ImageLayer).naturalW}px`}</em></span>
          <button className={`lock-btn ${l.locked ? 'on' : ''}`} title={l.locked ? '已锁定，AI 不会修改' : '锁定此元素'} onClick={(e) => { e.stopPropagation(); mutateLayer(l.id, { locked: !l.locked }); }}>{l.locked ? '🔒' : '🔓'}</button>
        </div>)}</div>
        <div className="undo-row"><Button variant="ghost" onClick={undo} disabled={hi <= 0}>↶ 撤销</Button><Button variant="ghost" onClick={redo} disabled={hi >= hist.length - 1}>↷ 重做</Button></div>
        <div className="panel-title">历史版本</div>
        <div className="version-list">{(project?.versions || []).slice(-6).reverse().map((v) => <button key={v.id} onClick={() => { restoreVersion(v.id); setToast('已恢复历史版本'); }}><span>{v.label}</span><em>{formatDate(v.at)}</em></button>)}</div>
      </aside>

      <main className="editor-canvas">
        <div className="canvas-bar"><span>画布 · {FACE_LABEL[faceId]} · {face?.w} × {face?.h} mm</span>
          <span className="canvas-tip">{mode === 'advanced' ? '点击选中元素，拖动可移动；右侧调整属性' : '普通模式：在右侧用一句话描述修改'}</span></div>
        <div className="canvas-stage">{face && <DesignView face={face} interactive selectedId={selected} onSelect={setSelected}
          onMove={mode === 'advanced' ? (id, x, y) => mutateLayer(id, { x, y }) : undefined}
          showSafe={s.settings.advancedMode} safe={5} />}
          <div className="canvas-shadow" /></div>
        <div className="canvas-foot"><span>文字均为独立可编辑图层 · 平面稿修改会同步到 3D 预览</span><Button variant="ghost" onClick={() => { const svg = spreadSvg(design, buildDieline(s.brief.structure, s.brief.size, s.settings.bleed, 5, s.brief.structureExtra), 0, false); downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${design.name}-展开稿.svg`); }}>下载当前展开稿 SVG</Button></div>
      </main>

      <aside className="editor-right">
        {mode === 'simple' ? <>
          <div className="panel-title">用一句话修改</div>
          <div className="mini-chat">{editorChat.length === 0 && <div className="mini-empty">试着说：「把包装改成更简约一点」<br />AI 只修改相关元素，不会重做整张包装。</div>}
            {editorChat.map((m, i) => <div key={i} className={`mini-msg ${m.role}`}>{m.text}</div>)}</div>
          <div className="quick-prompts">{quickPrompts.map((p) => <button key={p} onClick={() => doModify(p)}>{p}</button>)}</div>
          <div className="mini-input"><textarea rows={2} value={chatText} placeholder="描述你想改的地方…" onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doModify(chatText); } }} />
            <Button onClick={() => doModify(chatText)} disabled={!chatText.trim() || busy}>{busy ? <Spinner label="修改中" /> : '修改'}</Button></div>
          <Notice tone="info">{aiConfigured(s.ai) ? '已连接平台 AI，AI 会输出局部修改补丁。' : '当前使用内置规则解析修改意图；启用平台 AI 后由 AI 生成修改补丁。'}</Notice>
          <div className="lock-summary">已锁定 {allLayers(design).filter((l) => l.locked).length} 个元素 · 锁定的品牌名、产品名与图案不会被修改</div>
        </> : <>
          <div className="panel-title">元素属性</div>
          {!layer ? <div className="mini-empty">在画布上点选一个元素，即可调整字体、字号、颜色、位置与图层顺序。</div> : <div className="props">
            <Field label="名称"><input value={layer.name} onChange={(e) => mutateLayer(layer.id, { name: e.target.value })} /></Field>
            {layer.type === 'text' && <>
              <Field label="文字内容"><textarea rows={3} value={(layer as TextLayer).text} onChange={(e) => mutateLayer(layer.id, { text: e.target.value, placeholder: false } as Partial<TextLayer>)} /></Field>
              <Field label="字体"><select value={(layer as TextLayer).fontFamily} onChange={(e) => mutateLayer(layer.id, { fontFamily: e.target.value } as Partial<TextLayer>)}>{FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></Field>
              <Field label={`字号 ${(layer as TextLayer).fontSize.toFixed(1)} pt`}><input type="range" min="5" max="72" step="0.5" value={(layer as TextLayer).fontSize} onChange={(e) => mutateLayer(layer.id, { fontSize: Number(e.target.value) } as Partial<TextLayer>)} /></Field>
              <Field label="字重"><select value={(layer as TextLayer).fontWeight} onChange={(e) => mutateLayer(layer.id, { fontWeight: Number(e.target.value) } as Partial<TextLayer>)}>{[300, 400, 500, 600, 700, 800].map((w) => <option key={w} value={w}>{w}</option>)}</select></Field>
              <Field label="对齐"><div className="seg">{(['left', 'center', 'right'] as const).map((a) => <button key={a} className={(layer as TextLayer).align === a ? 'active' : ''} onClick={() => mutateLayer(layer.id, { align: a } as Partial<TextLayer>)}>{a === 'left' ? '左' : a === 'center' ? '中' : '右'}</button>)}</div></Field>
              <Field label="文字颜色"><input type="color" value={(layer as TextLayer).color} onChange={(e) => mutateLayer(layer.id, { color: e.target.value } as Partial<TextLayer>)} /></Field>
            </>}
            {layer.type === 'shape' && <Field label="填充颜色"><input type="color" value={(layer as Extract<Layer, { type: 'shape' }>).fill} onChange={(e) => mutateLayer(layer.id, { fill: e.target.value } as Partial<Layer>)} /></Field>}
            <div className="prop-grid">{(['x', 'y', 'w', 'h'] as const).map((k) => <Field key={k} label={{ x: 'X mm', y: 'Y mm', w: '宽 mm', h: '高 mm' }[k]}><input type="number" step="0.5" value={Number(layer[k].toFixed(1))} onChange={(e) => mutateLayer(layer.id, { [k]: Number(e.target.value) } as Partial<Layer>)} /></Field>)}</div>
            <Field label={`不透明度 ${Math.round(layer.opacity * 100)}%`}><input type="range" min="0.05" max="1" step="0.05" value={layer.opacity} onChange={(e) => mutateLayer(layer.id, { opacity: Number(e.target.value) })} /></Field>
            <Field label="旋转"><input type="range" min="-180" max="180" step="1" value={layer.rotation} onChange={(e) => mutateLayer(layer.id, { rotation: Number(e.target.value) })} /></Field>
            <Toggle label="锁定元素" hint="锁定后 AI 不会修改它" checked={layer.locked} onChange={(v) => mutateLayer(layer.id, { locked: v })} />
            <Toggle label="隐藏元素" checked={!!layer.hidden} onChange={(v) => mutateLayer(layer.id, { hidden: v })} />
            <div className="prop-buttons"><Button variant="ghost" onClick={() => { const next = cloneDesign(design); const f = next.faces[faceId]!; const i = f.layers.findIndex((l) => l.id === layer.id); if (i > 0) { [f.layers[i - 1], f.layers[i]] = [f.layers[i], f.layers[i - 1]]; commit(next, '上移图层'); } }}>上移一层</Button>
              <Button variant="ghost" onClick={() => { const next = cloneDesign(design); const f = next.faces[faceId]!; const i = f.layers.findIndex((l) => l.id === layer.id); if (i < f.layers.length - 1) { [f.layers[i + 1], f.layers[i]] = [f.layers[i], f.layers[i + 1]]; commit(next, '下移图层'); } }}>下移一层</Button>
              <Button variant="outline" onClick={() => removeLayer(layer.id)}>删除元素</Button></div>
          </div>}
        </>}
      </aside>
    </div>
    <Modal open={addOpen} title="添加元素" onClose={() => setAddOpen(false)}>
      <div className="add-grid">
        {([['text', '文字', 'T'], ['rect', '色块', '▣'], ['circle', '圆形', '◯'], ['mountain', '山水插画', '⛰'], ['line', '分隔线', '—']] as const).map(([k, label, icon]) =>
          <button key={k} onClick={() => addLayer(k as 'text' | 'rect' | 'circle' | 'mountain' | 'line')}><span>{icon}</span>{label}</button>)}
        <button onClick={() => imgRef.current?.click()}><span>⬆</span>上传图片</button>
      </div>
      <input ref={imgRef} type="file" accept="image/*" hidden onChange={(e) => uploadImage(e.target.files?.[0])} />
    </Modal>
  </div>;
}
