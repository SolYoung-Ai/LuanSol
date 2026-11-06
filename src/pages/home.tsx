import React, { useState } from 'react';
import { Button, SectionLabel, Modal, go } from '../ui';
import { useApp } from '../store';
import { createEmptyBrief } from '../engine/brief';
import { createEmptyDraft } from '../v3/draft';
import { WIZARD_STEPS, stepProgress } from '../v3/steps';
import { PRICING } from '../cloud/plans';
import FallingBadge from '../components/FallingBadge';
import { useAuth } from '../cloud/auth';

export default function Home() {
  const { s, update } = useApp();
  const auth = useAuth();
  const [confirmNew, setConfirmNew] = useState(false);

  /** 从首页进入新的九步向导；第一步由用户在向导内选择形态 */
  const beginFresh = () => {
    setConfirmNew(false);
    update({ draft: createEmptyDraft(), brief: createEmptyBrief(), chat: [], schemes: [], design: null, report: null, activeId: null });
    go('/wizard');
  };

  /** 已有进度的草稿会被清空，属于不可撤销操作：先确认，别让用户误点丢数据 */
  const startWizard = () => {
    if (stepProgress(s.draft) > 0) { setConfirmNew(true); return; }
    beginFresh();
  };

  return <div className="home home-min">
    {/* ---------------- 极简首屏：掉落的工牌 + 开始设计 ---------------- */}
    <section className="hero-min">
      <div className="hero-eyebrow">LUNASOL · AI PACKAGING DESIGN STUDIO</div>
      <FallingBadge name={auth.user?.label || 'Sol.Young'} online={!!auth.user} />
      <div className="hero-cta">
        <Button size="lg" onClick={startWizard}>开始设计 <span aria-hidden>→</span></Button>
      </div>
      <p className="hero-caption">从尺寸到印刷文件，AI 全程引导，零设计经验也能完成。</p>
    </section>

    {/* ---------------- 设计流程 ---------------- */}
    <section className="section section-flow-min" id="flow">
      <div className="flow-min-head">
        <SectionLabel en="HOW IT WORKS">九步完成一个包装</SectionLabel>
        <h2>一条清晰的路径，<br />每一步只问你一件事。</h2>
        <p>选定形态与尺寸后，依次补充 Logo、人群、产品类型、主色、风格、配色与文案，最后导出可印刷文件。所有内容自动保存，随时返回修改。</p>
        <Button variant="outline" onClick={startWizard}>进入创作流程 <span aria-hidden>→</span></Button>
      </div>
      <ol className="flow-min-steps">
        {WIZARD_STEPS.map((s, i) => <li className="flow-min-step" key={s.id}>
          <span className="flow-min-num">{String(i + 1).padStart(2, '0')}</span>
          <span className="flow-min-name">{s.short}</span>
        </li>)}
      </ol>
      <p className="flow-min-note">新用户免费体验 {PRICING.freeTrialUses} 次 AI，模型由平台统一接入（GPT-4o 与 DeepSeek-V3），你无需也无法自行配置。</p>
    </section>

    <Modal open={confirmNew} title="你有一份未完成的草稿" onClose={() => setConfirmNew(false)}>
      <p className="modal-p">
        当前草稿已完成 {stepProgress(s.draft)} / {WIZARD_STEPS.length} 步。点击「重新开始」会清空这份草稿并新建一个空项目，此操作无法撤销。
      </p>
      <p className="modal-p">想保留现有内容，可以直接回到草稿继续。</p>
      <div className="modal-buttons">
        <Button variant="outline" onClick={() => { setConfirmNew(false); go('/wizard'); }}>继续编辑草稿</Button>
        <Button onClick={beginFresh}>重新开始</Button>
      </div>
    </Modal>
  </div>;
}
