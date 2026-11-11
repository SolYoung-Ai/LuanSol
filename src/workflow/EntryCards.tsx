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
import { useLang } from '../i18n';
import { Icon } from '../components/icons';
import type { IconName } from '../components/icons';

/** 双语片段。常量在模块加载时求值，拿不到当前语言，
 *  所以这里存两份、渲染时再挑——不能在常量里直接调 t()。 */
type L = { zh: string; en: string };

interface Choice {
  mode: CreationMode;
  icon: IconName;
  kicker: L;
  title: L;
  desc: L;
  points: L[];
}

export const CHOICES: Choice[] = [
  {
    mode: 'referenceStyle',
    icon: 'image',
    kicker: { zh: '我有方向', en: 'I have a direction' },
    title: { zh: '我有参考图 / 设计方向', en: 'I have references' },
    desc: {
      zh: '手上有喜欢的包装图、品牌规范，或已经想清楚风格。',
      en: 'You already have packaging you like, brand guidelines, or a clear idea of the style.',
    },
    points: [
      { zh: '上传参考图，AI 按你的方向落地', en: 'Upload references — AI follows your direction' },
      { zh: '可以指定配色、插画元素与卖点', en: 'Specify colors, illustration elements and selling points' },
    ],
  },
  {
    mode: 'fromScratch',
    icon: 'spark',
    kicker: { zh: '从零开始', en: 'From scratch' },
    title: { zh: '我没有，从零开始', en: 'Start from nothing' },
    desc: {
      zh: '只有一个产品，还没有任何设计想法，交给 AI 构思。',
      en: 'You have a product but no design ideas yet — let AI propose the direction.',
    },
    points: [
      { zh: '描述产品，AI 帮你定调', en: 'Describe the product and AI sets the tone' },
      { zh: '同样可补充信息让方向更准', en: 'Add more details any time to sharpen the result' },
    ],
  },
];

/** 选一条路：有当前工作流就改它的 mode 并推进到「确认需求」，
 *  否则复用空白 entry 草稿 / 新建一个带工作流的项目。 */
export function useEntryPick() {
  const { s, createWorkflowProject, patchWorkflow, loadProject, setToast } = useApp();
  const { t } = useLang();
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
      setToast(e instanceof Error ? e.message : t('创建项目失败，请重试', 'Could not create the project. Please try again.'));
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
  const { lang, t } = useLang();
  const L = (v: { zh: string; en: string }) => (lang === 'en' ? v.en : v.zh);
  return <div className="wf-choice-grid">
    {CHOICES.map((c) => (
      <button
        key={c.mode}
        className="wf-choice"
        onClick={() => onPick(c.mode)}
        disabled={!!busy}
      >
        <span className="wf-choice-icon"><Icon name={c.icon} size={24} /></span>
        <span className="wf-choice-kicker">{L(c.kicker)}</span>
        <span className="wf-choice-title">{L(c.title)}</span>
        <span className="wf-choice-desc">{L(c.desc)}</span>
        <span className="wf-choice-points">
          {c.points.map((p) => (
            <span key={p.zh} className="wf-choice-point"><Icon name="check" size={13} />{L(p)}</span>
          ))}
        </span>
        <span className="wf-choice-cta">
          {busy === c.mode ? t('正在准备…', 'Preparing…') : t('选择这条路', 'Choose this path')} <Icon name="chevronRight" size={15} />
        </span>
      </button>
    ))}
  </div>;
}
