/* ============================================================
 * 创作入口（第一步）：两个选择，决定接下来的路径。
 * ------------------------------------------------------------
 *  A. 我有参考图 / 设计方向 → 进入「确认需求」，按参考图落地
 *  B. 我没有，从零开始     → 进入「确认需求」，AI 帮你构思
 * 两条路径都落到同一个确认需求页，区别只在初始 mode 与提示文案，
 * 不制造「选了没反应」的死路。项目在点击时真实创建。
 * ============================================================ */
import React, { useState } from 'react';
import type { CreationMode } from '../types';
import { emptyProductInfo } from '../types';
import { useApp } from '../store';
import { Icon } from '../components/icons';
import type { IconName } from '../components/icons';

interface Choice {
  mode: CreationMode;
  icon: IconName;
  kicker: string;
  title: string;
  desc: string;
  points: string[];
}

const CHOICES: Choice[] = [
  {
    mode: 'referenceStyle',
    icon: 'image',
    kicker: '我有方向',
    title: '我有参考图 / 设计方向',
    desc: '手上有喜欢的包装图、品牌规范，或已经想清楚风格。',
    points: ['上传参考图，AI 按你的方向落地', '可以指定配色、插画元素与卖点'],
  },
  {
    mode: 'fromScratch',
    icon: 'spark',
    kicker: '从零开始',
    title: '我没有，从零开始',
    desc: '只有一个产品，还没有任何设计想法，交给 AI 构思。',
    points: ['描述产品，AI 帮你定调', '同样可补充信息让方向更准'],
  },
];

export default function CreationEntry() {
  const { s, createWorkflowProject, patchWorkflow, loadProject, setToast } = useApp();
  const [busy, setBusy] = useState<CreationMode | null>(null);

  const pick = (mode: CreationMode) => {
    if (busy) return;
    setBusy(mode);
    try {
      // 从步骤条回到创作入口时，改的是当前项目，不清空已有方案与设计稿
      const current = s.projects.find((p) => p.id === s.activeId);
      if (current?.workflow) {
        patchWorkflow(current.id, { mode, stage: 'requirements' });
        return;
      }
      // 优先复用已有的空白 entry 草稿，避免重复点击堆出多个空项目
      const existing = s.projects.find(
        (p) => p.workflow && p.workflow.stage === 'entry' && p.design === null,
      );
      if (existing) {
        if (existing.id !== s.activeId) loadProject(existing.id);
        patchWorkflow(existing.id, { mode, stage: 'requirements' });
      } else {
        createWorkflowProject({ mode, productInfo: emptyProductInfo(), referenceImages: [] });
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : '创建项目失败，请重试');
      setBusy(null);
    }
  };

  return (
    <div className="wf-page">
      <div className="wf-head">
        <div className="wf-kicker">STEP 01 · 创作入口</div>
        <h1 className="wf-title">开始创造你的包装</h1>
        <p className="wf-sub">先告诉我你手上有什么 —— 有方向，还是从零开始？</p>
      </div>

      <div className="wf-choice-grid">
        {CHOICES.map((c) => (
          <button
            key={c.mode}
            className="wf-choice"
            onClick={() => pick(c.mode)}
            disabled={!!busy}
          >
            <span className="wf-choice-icon"><Icon name={c.icon} size={24} /></span>
            <span className="wf-choice-kicker">{c.kicker}</span>
            <span className="wf-choice-title">{c.title}</span>
            <span className="wf-choice-desc">{c.desc}</span>
            <span className="wf-choice-points">
              {c.points.map((p) => (
                <span key={p} className="wf-choice-point"><Icon name="check" size={13} />{p}</span>
              ))}
            </span>
            <span className="wf-choice-cta">
              {busy === c.mode ? '正在准备…' : '选择这条路'} <Icon name="chevronRight" size={15} />
            </span>
          </button>
        ))}
      </div>

      <p className="wf-foot-note">不确定选哪个？先选「从零开始」，在下一步补充产品信息即可。</p>
    </div>
  );
}
