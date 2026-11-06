import React from 'react';
import { Button, SectionLabel, go } from '../ui';
import { useApp } from '../store';
import { createEmptyBrief } from '../engine/brief';
import { createEmptyDraft } from '../v3/draft';
import { WIZARD_STEPS } from '../v3/steps';
import { PRICING } from '../cloud/plans';
import FallingBadge from '../components/FallingBadge';
import { useAuth } from '../cloud/auth';

export default function Home() {
  const { update } = useApp();
  const auth = useAuth();

  /** 从首页进入新的十步向导；第一步由用户在向导内选择形态 */
  const startWizard = () => {
    update({ draft: createEmptyDraft(), brief: createEmptyBrief(), chat: [], schemes: [], design: null, report: null, activeId: null });
    go('/wizard');
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
        <SectionLabel en="HOW IT WORKS">十步完成一个包装</SectionLabel>
        <h2>一条清晰的路径，<br />每一步只问你一件事。</h2>
        <p>选定形态与尺寸后，依次补充 Logo、人群、风格、配色与文案，最后导出可印刷文件。所有内容自动保存，随时返回修改。</p>
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
  </div>;
}
