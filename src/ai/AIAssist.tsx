/* 十步流程中统一的 AI 助手卡片。
 * 每一步都有：状态徽标、可补充的自然语言输入、建议列表、逐条采纳。
 * 后台接入 GPT 前后，这个组件的代码和交互完全不变。 */
import React, { useMemo, useState } from 'react';
import { aiEnabled, aiStatusLabel } from '../engine/llm';
import { buildAIContext } from './context';
import { runAITask, aiResultToast } from './provider';
import { AI_TASKS, TASK_FOR_STEP } from './tasks';
import type { AISettings } from '../types';
import type { AISuggestion, AITaskResult, DraftPatch } from './types';
import type { ProjectDraft } from '../v3/draft';

export function AIAssist({ step, d, set, ai, toast }: {
  step: number;
  d: ProjectDraft;
  set: DraftPatch;
  ai: AISettings;
  toast: (s: string) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AITaskResult | null>(null);
  const [adopted, setAdopted] = useState<string | null>(null);
  const task = useMemo(() => AI_TASKS[TASK_FOR_STEP(step)], [step]);
  const configured = aiEnabled(ai);

  const run = async () => {
    setBusy(true); setAdopted(null);
    const r = await runAITask(task.id, buildAIContext(d, note), ai);
    setResult(r); setBusy(false);
    toast(aiResultToast(r, 'AI 建议已生成，采纳后才会写入项目', '已生成建议（本地设计引擎）'));
  };

  const adopt = (s: AISuggestion) => {
    task.adopt(s, set);
    setAdopted(s.id);
    toast('已采用建议并写入当前步骤，可在上方继续修改');
  };

  const stateText = busy ? '正在生成建议…'
    : result?.source === 'ai' ? 'AI 已接入 · 建议已生成'
      : result?.source === 'fallback' ? 'AI 未通过 · 已回退本地建议'
        : result?.source === 'paywall' ? '额度不足 · 已暂停 AI 调用'
          : aiStatusLabel(ai);

  return <section className={`ai-assist ${configured ? 'ai-assist-on' : ''}`} aria-label="本步骤 AI 助手">
    <div className="ai-assist-head">
      <span className="ai-assist-badge"><i /> AI 助手</span>
      <span className={`ai-assist-state ${configured ? 'on' : 'off'}`}>{stateText}</span>
    </div>
    <div className="ai-assist-body">
      <div className="ai-assist-intro">
        <h4>{task.title}</h4>
        <p>{task.hint}</p>
      </div>
      <div className="ai-assist-ask">
        <input value={note} onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void run(); }}
          placeholder="补充一句你的想法（可选），例如：想做得更清淡一些" aria-label="给 AI 补充想法" />
        <button className="btn btn-dark btn-sm" disabled={busy} onClick={() => void run()}>
          {busy ? '生成中…' : result ? '重新获取建议' : '获取建议'}
        </button>
      </div>
      {result && <>
        <div className={`ai-assist-note ai-assist-note-${result.source}`}>{result.note}</div>
        <div className="ai-suggestions">
          {result.suggestions.map((s) => {
            const applicable = Boolean(s.value && typeof s.value === 'object' && Object.keys(s.value as object).length > 0);
            return <div className={`ai-sug ${adopted === s.id ? 'adopted' : ''}`} key={s.id}>
              <div className="ai-sug-text"><strong>{s.title}</strong><p>{s.detail}</p></div>
              {applicable && <button className="ai-sug-btn" onClick={() => adopt(s)}>{adopted === s.id ? '✓ 已采纳' : '采用'}</button>}
            </div>;
          })}
        </div>
        {adopted && <p className="ai-assist-foot">建议已写入本步骤字段；品牌名、产品名等你已确认的内容始终由你掌握，AI 不会自动改写。</p>}
      </>}
      {!configured && !result && <p className="ai-assist-foot">现在由内置设计引擎给出确定性建议。你在后台接入模型后，这里会自动切换为真实 AI，十步流程与操作方式不变。</p>}
    </div>
  </section>;
}
