/* ============================================================
   Product 页
   ------------------------------------------------------------
   三个能力，一条主线：生成 → 拆解 → 编辑与输出。
   刻意不做成 SaaS 功能列表（四宫格图标 + 三行说明）：每一段都是
   一个「作品画面 + 一句结论」，靠留白和编号推进，而不是靠卡片堆叠。
   画面同样全是 SVG 几何，不引入位图。
   ============================================================ */
import React from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';
import PackArt, { Dieline } from '../site/PackArt';

function Cap({ no, title, desc, points, art, flip }: {
  no: string; title: string; desc: string; points: string[]; art: React.ReactNode; flip?: boolean;
}) {
  return <div className={`site-cap ${flip ? 'is-flip' : ''}`}>
    <div className="site-cap-art">{art}</div>
    <div className="site-cap-body">
      <span className="site-cap-no"><b>{no}</b></span>
      <h2 className="site-h2">{title}</h2>
      <p>{desc}</p>
      <ul className="site-cap-list">
        {points.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </div>
  </div>;
}

export default function ProductPage() {
  const { t } = useLang();

  return <div className="site-page">
    <section className="site-phero">
      <div className="site-wrap">
        <span className="site-eyebrow">Product</span>
        <h1 className="site-h1">{t('三个能力，', 'Three capabilities, ')}<br />{t('把包装设计从头做完。', 'from first idea to print file.')}</h1>
        <p className="site-lead">
          {t('不用在五个工具之间来回搬文件：创意、结构、版面与输出在同一条流程里完成。',
            'No more moving files between five tools — concept, structure, artwork and output live in one flow.')}
        </p>
      </div>
    </section>

    <div className="site-wrap">
      <Cap
        no={t('01 · 生成', '01 · Generate')}
        title={t('AI 创意生成', 'AI concept generation')}
        desc={t('写下产品、口味与受众，AI 给出多套包装方向——结构、配色、版面一起成型，不是拼贴出来的参考图。',
          'Describe the product, flavour and audience. AI returns several packaging directions with structure, colour and layout resolved together — not a mood board.')}
        points={[
          t('一句话需求就能出图，不需要写 Brief', 'One sentence is enough — no brief required'),
          t('一次多套方向，同一主题可反复重来', 'Several directions at once, rerun anytime'),
          t('每套方向都能继续往下深挖', 'Every direction can be pushed further'),
        ]}
        art={<div className="site-figure">
          <div className="site-figure-grid" aria-hidden />
          <div className="site-trio">
            <PackArt kind="carton" height={196} tint="#FBF5EC" />
            <PackArt kind="carton" height={232} />
            <PackArt kind="carton" height={196} tint="#F5EEE3" accent={false} />
          </div>
          <span className="site-figure-tag">{t('三套方向', 'THREE DIRECTIONS')}</span>
        </div>}
      />

      <Cap
        flip
        no={t('02 · 拆解', '02 · Unfold')}
        title={t('智能包装拆解', 'Packaging unfold')}
        desc={t('把包装拆成结构：盒型、展开面、折线与出血。看到的不再是一张效果图，而是能交给印厂的刀版。',
          'Turn packaging into structure: box type, panels, folds and bleed. What you see is not a render but a dieline you can hand to a printer.')}
        points={[
          t('展开面与折线按真实几何生成', 'Panels and folds generated from real geometry'),
          t('出血、粘口与尺寸标注一并给出', 'Bleed, glue tabs and dimensions included'),
          t('结构可调，版面随之重排', 'Change the structure — artwork reflows'),
        ]}
        art={<div className="site-figure">
          <div className="site-figure-grid" aria-hidden />
          <Dieline width={430} />
          <span className="site-figure-tag">DIELINE · 1:1</span>
        </div>}
      />

      <Cap
        no={t('03 · 输出', '03 · Output')}
        title={t('自由编辑与刀版输出', 'Edit freely, export print-ready')}
        desc={t('文字、配色、素材逐层可改。改到满意为止，再导出 PDF、PNG 或印刷级刀版文件。',
          'Edit type, colour and imagery layer by layer. When it feels right, export PDF, PNG or a print-ready dieline.')}
        points={[
          t('版面逐元素可编辑，不是不可改的成品图', 'Every element stays editable — no flattened output'),
          t('导出的刀版带出血与折线', 'Exports carry bleed and fold marks'),
          t('效果图与印刷文件分开导出', 'Visuals and print files export separately'),
        ]}
        art={<div className="site-figure is-tall">
          <div className="site-figure-grid" aria-hidden />
          <PackArt kind="carton" height={338} />
          <span className="site-chip site-chip-a">PDF · 300 dpi</span>
          <span className="site-chip site-chip-b">{t('刀版 1:1', 'DIELINE 1:1')}</span>
          <span className="site-figure-tag">EXPORT</span>
        </div>}
      />
    </div>

    <section className="site-cta">
      <div className="site-wrap">
        <h2>{t('先做一版，再决定要不要继续。', 'Make one version first. Decide after.')}</h2>
        <button className="site-btn" onClick={() => go('/studio')}>
          {t('开始吧！设计师', 'Start designing')}
          <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
            <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <p>{t('不需要设计经验，也不需要先买软件。', 'No design experience, no software to buy.')}</p>
      </div>
    </section>
  </div>;
}
