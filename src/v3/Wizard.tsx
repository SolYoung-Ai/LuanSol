/* ============================================================
 * 九步向导外壳：进度、单步聚焦、返回不丢数据、自动保存、版本快照
 * ============================================================ */
import React, { useEffect } from 'react';
import { useApp } from '../store';
import { Button, go } from '../ui';
import { WIZARD_STEPS, stepDone, stepProgress } from './steps';
import { STEP_BODIES, type StepProps } from './stepBodies';
import { PackagePreview } from './Preview';
import { dimensionComplete, structureReady, FORM_META } from './draft';
import { Note } from './controls';
import { AIAssist } from '../ai/AIAssist';
import { aiEnabled, aiStatusLabel } from '../engine/llm';

export default function Wizard() {
  const { s, patchDraft, saveProject, setToast, syncProject } = useApp();
  const d = s.draft;
  const i = Math.max(0, Math.min(WIZARD_STEPS.length - 1, d.step || 0));
  const step = WIZARD_STEPS[i];
  const Body = STEP_BODIES[i];
  const done = stepDone(d, i);
  const progress = stepProgress(d);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [i]);

  const navigate = (to: number) => {
    const t = Math.max(0, Math.min(WIZARD_STEPS.length - 1, to));
    patchDraft((x) => ({ step: t, visited: x.visited.includes(t) ? x.visited : [...x.visited, t] }));
  };

  const skip = () => {
    patchDraft((x) => ({ skipped: x.skipped.includes(i) ? x.skipped : [...x.skipped, i] }));
    setToast(`已跳过「${step.short}」，之后随时可以回来补`);
    navigate(i + 1);
  };

  const next = () => {
    if (i === 0) {
      const c = dimensionComplete(d);
      if (!c.ok) { setToast(`还需要完善：${c.missing.slice(0, 3).join('、')}`); return; }
      // 结构参数按真实数据判定，不再要求用户额外点一次「确认结构参数」——
      // 否则会出现「参数都填好了却仍然被拦住」的假死状态。
      if (!structureReady(d)) { setToast('结构补充参数还不完整，请把「结构补充参数」里的数值填完再继续'); return; }
    }
    if (i === 3 && !(d.product_category.type || d.product_category.custom)) { setToast('请选择或填写产品类型'); return; }
    if (i === 4 && !d.primary_color) { setToast('请先选择主颜色'); return; }
    if (i === 5 && !d.style_id) { setToast('请先选择一个设计风格'); return; }
    if (i === 8 && !(d.copy_content.brandName || d.copy_content.productName)) { setToast('请至少填写品牌名称或产品名称'); return; }
    if (i === WIZARD_STEPS.length - 1) { go('/review'); return; }
    navigate(i + 1);
  };

  const stash = () => {
    const name = `${d.copy_content.brandName || FORM_META[d.package_type].label} · ${d.copy_content.productName || d.product_category.type || '设计草稿'}`;
    saveProject(name); syncProject();
    setToast('草稿已保存到「我的工作台」，浏览器自动保存');
  };

  const snapshot = () => {
    patchDraft((x) => ({ snapshots: [...x.snapshots, { at: Date.now(), label: `第 ${i + 1} 步 · ${step.short}`, data: JSON.stringify(d) }].slice(-12) }));
    setToast('已保存当前版本快照');
  };

  const restore = (idx: number) => {
    const snap = d.snapshots[idx];
    if (!snap) return;
    try {
      const parsed = JSON.parse(snap.data);
      patchDraft({ ...parsed, step: i, savedAt: Date.now() });
      setToast(`已恢复：${snap.label}`);
    } catch { setToast('该快照无法读取'); }
  };

  const props: StepProps = { d, set: patchDraft, ai: s.ai, toast: setToast };

  return <div className="page v3-wizard">
    {/* ---------------- 进度 ---------------- */}
    <div className="v3-wizard-head">
      <div className="v3-wizard-kicker"><span>{step.kicker}</span><span className="v3-wizard-kicker-right">
        <span className={`v3-ai-pill ${aiEnabled(s.ai) ? 'on' : ''}`}>{aiStatusLabel(s.ai)}</span>
        <span>{progress} / {WIZARD_STEPS.length} 已完成</span>
        {s.settings.autoSave && <span className="v3-autosave">· 已自动保存</span>}
      </span></div>
      <div className="v3-progress">{WIZARD_STEPS.map((s, k) => <button key={s.id}
        className={`v3-progress-seg ${k === i ? 'current' : ''} ${stepDone(d, k) ? 'done' : ''} ${d.visited.includes(k) ? 'visited' : ''}`}
        onClick={() => d.visited.includes(k) && navigate(k)} title={`${String(k + 1).padStart(2, '0')} ${s.short}`}>
        <span>{String(k + 1).padStart(2, '0')}</span>
      </button>)}</div>
      <div className="v3-progress-labels">{WIZARD_STEPS.map((s, k) => <span key={s.id} className={k === i ? 'current' : ''}>{s.short}</span>)}</div>
    </div>

    <div className="v3-wizard-grid">
      <div className="v3-wizard-main">
        <header className="v3-step-head">
          <h1>{step.title}</h1>
          <p>{step.desc}</p>
        </header>
        <div className="v3-step-body"><Body {...props} /></div>
        {/* AI 贯穿每一步：同一个任务层，后台接入后自动从本地建议切换为真实模型 */}
        <AIAssist step={i} d={d} set={patchDraft} ai={s.ai} toast={setToast} />
        <footer className="v3-step-foot">
          <div className="v3-foot-left">
            <Button variant="outline" disabled={i === 0} onClick={() => navigate(i - 1)}>← 上一步</Button>
            <button className="v3-link" onClick={stash}>保存草稿</button>
            <button className="v3-link" onClick={snapshot}>保存版本</button>
          </div>
          <div className="v3-foot-right">
            {step.optional && !done && <button className="v3-link" onClick={skip}>跳过这步</button>}
            <Button onClick={next}>{i === WIZARD_STEPS.length - 1 ? '查看需求汇总' : `${step.mainLabel} →`}</Button>
          </div>
        </footer>
        {!done && step.optional && <Note>这一步可以跳过；系统会在缺少信息时使用中性推荐，且不会替你编造法定信息。</Note>}
        {d.snapshots.length > 0 && <div className="v3-snapshots">
          <strong>版本快照</strong>
          {d.snapshots.slice(-4).map((sn, k) => <button key={sn.at} className="v3-link" onClick={() => restore(d.snapshots.length - Math.min(4, d.snapshots.length) + k)}>{sn.label} · {new Date(sn.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</button>)}
        </div>}
      </div>
      <aside className="v3-wizard-aside"><PackagePreview d={d} /></aside>
    </div>
  </div>;
}
