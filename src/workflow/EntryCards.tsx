/* ============================================================
 * 创作入口：两条路的选择卡片（首页与 /new 共用同一份）
 * ------------------------------------------------------------
 * 首页只放这两张卡，点下去就等于在工作台里选定路径并进入「确认需求」。
 * 为了不让两处的文案、顺序、点击行为各写一套，这里把
 *   · CHOICES   —— 卡片内容
 *   · useEntryPick —— 选路后的建稿/切阶段逻辑
 *   · EntryCards   —— 纯展示
 * 全部收在这一个文件里，谁用谁 import。
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

export const CHOICES: Choice[] = [
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

/** 选一条路：有当前工作流就改它的 mode 并推进到「确认需求」，
 *  否则复用空白 entry 草稿 / 新建一个带工作流的项目。 */
export function useEntryPick() {
  const { s, createWorkflowProject, patchWorkflow, loadProject, setToast } = useApp();
  const [busy, setBusy] = useState<CreationMode | null>(null);

  const pick = (mode: CreationMode): CreationMode | null => {
    if (busy) return null;
    setBusy(mode);
    try {
      // 从步骤条回到创作入口时，改的是当前项目，不清空已有方案与设计稿
      const current = s.projects.find((p) => p.id === s.activeId);
      if (current?.workflow) {
        patchWorkflow(current.id, { mode, stage: 'requirements' });
        return mode;
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
      return mode;
    } catch (e) {
      setToast(e instanceof Error ? e.message : '创建项目失败，请重试');
      setBusy(null);
      return null;
    }
  };

  return { busy, pick };
}

/** 纯展示的两张卡片。onPick 决定点下去之后去哪。 */
export function EntryCards({ busy, onPick }: {
  busy?: CreationMode | null;
  onPick: (mode: CreationMode) => void;
}) {
  return <div className="wf-choice-grid">
    {CHOICES.map((c) => (
      <button
        key={c.mode}
        className="wf-choice"
        onClick={() => onPick(c.mode)}
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
  </div>;
}
