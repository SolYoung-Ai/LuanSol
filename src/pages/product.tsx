import React from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';
import MarketingFooter from '../components/MarketingFooter';

/* 产品页（V5）
 * 四段能力，全部对应真实存在的功能模块：
 * 创意生成（engine/design + concept 阶段）、拆解（workflow/analyzer + assembler）、
 * 编辑器（editor/*，图层/属性/历史）、刀版导出（engine/structure + export + prepress）。
 * 视觉里没有截图冒充界面，用的是同一套设计语言的界面示意与真实生成样本。
 * 支持范围写在页面底部，不把「能导出」说成「印厂可直接量产」。
 */

const ink = { stroke: 'var(--mk-ink)' } as React.CSSProperties;
const brand = { stroke: 'var(--mk-brand)' } as React.CSSProperties;
const faint = { stroke: 'var(--mk-sub)' } as React.CSSProperties;

function ConceptVisual() {
  return <div>
    <div className="mk-trio">
      {['./works/food.jpg', './works/beauty.jpg', './works/beverage.jpg'].map((src, i) => (
        <figure key={src}>
          <img src={src} alt="" loading="lazy" />
          <figcaption>{['A · 极简高级', 'B · 自然有机', 'C · 现代插画'][i]}</figcaption>
        </figure>
      ))}
    </div>
    <p className="mk-visual-note">THE SAME BRIEF, THREE DIRECTIONS · 真实生成样本</p>
  </div>;
}

function AnalyzeVisual() {
  return <svg viewBox="0 0 520 320" role="img" aria-label="设计元素拆解示意">
    <rect x="0" y="0" width="520" height="320" fill="none" />
    {/* 包装面 */}
    <rect x="60" y="30" width="190" height="260" rx="4" fill="var(--mk-workspace)" style={faint} />
    <rect x="78" y="52" width="154" height="120" rx="2" fill="#fff" style={faint} />
    <line x1="78" y1="196" x2="232" y2="196" style={faint} strokeWidth="1.4" />
    <line x1="78" y1="210" x2="196" y2="210" style={faint} strokeWidth="1.2" />
    <line x1="78" y1="222" x2="210" y2="222" style={faint} strokeWidth="1.2" />
    {/* 识别框 */}
    <rect x="72" y="46" width="166" height="132" fill="none" style={brand} strokeDasharray="5 4" strokeWidth="1.3" />
    <rect x="72" y="186" width="166" height="18" fill="none" style={brand} strokeDasharray="5 4" strokeWidth="1.3" />
    <rect x="72" y="206" width="130" height="24" fill="none" style={brand} strokeDasharray="5 4" strokeWidth="1.3" />
    <text x="72" y="40" fontSize="9" fill="var(--mk-brand)" letterSpacing="1">ILLUSTRATION</text>
    <text x="72" y="182" fontSize="9" fill="var(--mk-brand)" letterSpacing="1">PRODUCT NAME</text>
    <text x="72" y="244" fontSize="9" fill="var(--mk-brand)" letterSpacing="1">CLAIM</text>
    {/* 图层列表 */}
    <g transform="translate(300,34)">
      {[
        ['包装主体', 0], ['品牌信息', 1], ['视觉设计', 1], ['产品信息', 1], ['条码区域', 1],
      ].map(([label, group], i) => <g key={label as string} transform={`translate(0,${i * 40})`}>
        <rect x="0" y="0" width="180" height="30" rx="6" fill={i === 2 ? 'var(--mk-brand)' : 'var(--mk-card)'} opacity={i === 2 ? 0.1 : 1} style={faint} />
        <rect x="10" y="9" width="12" height="12" rx="2" fill="none" style={faint} />
        <text x="30" y="19" fontSize="10.5" fill="var(--mk-ink)" opacity={group ? 0.85 : 0.55}>{label as string}</text>
        {i === 2 && <circle cx="168" cy="15" r="3" fill="var(--mk-brand)" />}
      </g>)}
    </g>
    <path d="M258 106 C 276 106, 286 100, 300 66" fill="none" style={brand} strokeWidth="1.2" strokeDasharray="3 3" />
  </svg>;
}

function EditorVisual() {
  return <svg viewBox="0 0 520 320" role="img" aria-label="编辑器界面示意">
    {/* 左栏 */}
    <rect x="8" y="12" width="118" height="296" rx="8" fill="var(--mk-workspace)" style={faint} />
    {[0, 1, 2, 3, 4, 5].map((i) => <g key={i}>
      <rect x="18" y={30 + i * 32} width="10" height="10" rx="2" fill="none" style={faint} />
      <rect x="34" y={32 + i * 32} width={68 - (i % 2) * 16} height="6" rx="3" fill="var(--mk-sub)" opacity="0.35" />
    </g>)}
    {/* 画布 */}
    <rect x="140" y="12" width="248" height="296" rx="8" fill="var(--mk-card)" style={faint} />
    <rect x="190" y="52" width="148" height="212" rx="3" fill="#fff" style={faint} />
    <rect x="204" y="70" width="120" height="86" fill="var(--mk-workspace)" />
    <rect x="204" y="170" width="86" height="7" rx="3" fill="var(--mk-ink)" opacity="0.8" />
    <rect x="204" y="184" width="58" height="5" rx="2.5" fill="var(--mk-sub)" opacity="0.5" />
    {/* 选中框与控制点 */}
    <rect x="200" y="64" width="128" height="98" fill="none" style={brand} strokeWidth="1.2" />
    {[[200, 64], [328, 64], [200, 162], [328, 162]].map(([x, y]) => <rect key={`${x}${y}`} x={x - 3} y={y - 3} width="6" height="6" fill="#fff" style={brand} strokeWidth="1.2" />)}
    {/* 右栏 */}
    <rect x="402" y="12" width="110" height="296" rx="8" fill="var(--mk-workspace)" style={faint} />
    <text x="414" y="34" fontSize="9" fill="var(--mk-sub)" letterSpacing="1">TEXT</text>
    {[0, 1, 2, 3].map((i) => <g key={i}>
      <rect x="414" y={44 + i * 34} width="86" height="22" rx="5" fill="var(--mk-card)" style={faint} />
      <rect x="422" y={52 + i * 34} width={46 - i * 8} height="5" rx="2.5" fill="var(--mk-sub)" opacity="0.4" />
    </g>)}
    <text x="414" y="212" fontSize="9" fill="var(--mk-sub)" letterSpacing="1">COLOUR</text>
    {['#191919', 'var(--mk-brand)', '#C9C3B6', '#8FA48C'].map((c, i) => <circle key={c} cx={424 + i * 22} cy="232" r="7" fill={c} />)}
  </svg>;
}

function DielineVisual() {
  return <svg viewBox="0 0 520 320" role="img" aria-label="刀版展开示意">
    {/* 展开面 */}
    <g transform="translate(60,44)">
      <rect x="0" y="0" width="120" height="90" fill="var(--mk-workspace)" style={ink} strokeWidth="1.2" />
      <rect x="120" y="0" width="120" height="90" fill="var(--mk-workspace)" style={ink} strokeWidth="1.2" />
      <rect x="240" y="0" width="120" height="90" fill="var(--mk-workspace)" style={ink} strokeWidth="1.2" />
      {/* 糊口 */}
      <rect x="360" y="0" width="26" height="90" fill="none" style={ink} strokeWidth="1.2" />
      {/* 上下摇盖 */}
      <rect x="120" y="-34" width="120" height="34" fill="none" style={ink} strokeWidth="1.2" />
      <rect x="120" y="90" width="120" height="34" fill="none" style={ink} strokeWidth="1.2" />
      {/* 压痕线 */}
      <line x1="120" y1="0" x2="120" y2="90" style={brand} strokeWidth="1.1" strokeDasharray="4 4" />
      <line x1="240" y1="0" x2="240" y2="90" style={brand} strokeWidth="1.1" strokeDasharray="4 4" />
      <line x1="360" y1="0" x2="360" y2="90" style={brand} strokeWidth="1.1" strokeDasharray="4 4" />
      <line x1="120" y1="0" x2="240" y2="0" style={brand} strokeWidth="1.1" strokeDasharray="4 4" />
      <line x1="120" y1="90" x2="240" y2="90" style={brand} strokeWidth="1.1" strokeDasharray="4 4" />
      {/* 正面内容 */}
      <rect x="140" y="20" width="80" height="44" fill="#fff" opacity="0.7" />
      <rect x="140" y="72" width="52" height="5" rx="2.5" fill="var(--mk-ink)" opacity="0.55" />
      {/* 尺寸标注 */}
      <line x1="0" y1="146" x2="360" y2="146" style={faint} strokeWidth="1" />
      <line x1="0" y1="140" x2="0" y2="152" style={faint} strokeWidth="1" />
      <line x1="360" y1="140" x2="360" y2="152" style={faint} strokeWidth="1" />
      <text x="150" y="164" fontSize="10" fill="var(--mk-sub)">1 8 0 mm</text>
    </g>
    <g transform="translate(60,262)">
      <line x1="0" y1="0" x2="22" y2="0" style={ink} strokeWidth="1.4" />
      <text x="30" y="4" fontSize="10" fill="var(--mk-sub)">刀切线 CUT</text>
      <line x1="140" y1="0" x2="162" y2="0" style={brand} strokeWidth="1.4" strokeDasharray="4 4" />
      <text x="170" y="4" fontSize="10" fill="var(--mk-sub)">压痕线 FOLD</text>
      <line x1="286" y1="0" x2="308" y2="0" style={faint} strokeWidth="1" />
      <text x="316" y="4" fontSize="10" fill="var(--mk-sub)">出血 / 安全区</text>
    </g>
  </svg>;
}

export default function Product() {
  const { t } = useLang();
  return <div className="mk">
    <div className="mk-wrap">
      <section className="mk-about" style={{ paddingBottom: 0 }}>
        <p className="mk-eyebrow">PRODUCT</p>
        <h1>{t('把包装设计，拆成几步人人能做的事。', 'Packaging design, broken into steps anyone can do.')}</h1>
        <p className="mk-about-lead">
          {t('LunaSol 不是一个生图工具。它从一句需求开始，生成可比较的方向，再把图拆成真正能编辑的图层，最后给出可交付的刀版文件。',
            'LunaSol is not an image generator. It starts from a brief, produces comparable directions, splits the artwork into truly editable layers, and ends with deliverables your printer can inspect.')}
        </p>
      </section>

      <section className="mk-sec" style={{ borderTop: 'none' }}>
        <div className="mk-feature">
          <div>
            <p className="mk-eyebrow" style={{ marginBottom: 0 }}>01 — CONCEPT</p>
            <h3>{t('AI 包装创意', 'AI packaging concepts')}</h3>
            <p>{t('回答几个问题，AI 把它整理成专业 Brief，再生成三个真正不同的设计方向——配色、构图、材质语言都不一样，方便你比较而不是挑颜色。',
              'Answer a few questions; AI turns them into a proper brief and generates three genuinely different directions — different palette, composition and material language.')}</p>
            <ul>
              <li>{t('同一需求，三个可比较的方向', 'Three comparable directions from one brief')}</li>
              <li>{t('每个方向带设计理念与配色说明', 'Each direction comes with a rationale and palette')}</li>
              <li>{t('不满意可单独重生成，按次计费', 'Regenerate any direction, charged per run')}</li>
            </ul>
          </div>
          <div className="mk-feature-visual"><ConceptVisual /></div>
        </div>

        <div className="mk-feature">
          <div>
            <p className="mk-eyebrow" style={{ marginBottom: 0 }}>02 — DECOMPOSE</p>
            <h3>{t('智能设计拆解', 'Intelligent decomposition')}</h3>
            <p>{t('选定的方案不会作为一张死图进编辑器。系统识别插画、标题、卖点、Logo、底色等区域，把它们重建为独立图层；文字重新排成可编辑文本，而不是图片里的字。',
              'A chosen concept does not enter the editor as a flat image. The system detects illustration, headline, claims, logo and base colour, then rebuilds them as separate layers — text becomes real editable text.')}</p>
            <ul>
              <li>{t('分区识别 + 边界定位', 'Region detection with bounding boxes')}</li>
              <li>{t('文字重建、图形矢量化、素材透明化', 'Text rebuilt, shapes vectorised, assets cut out')}</li>
              <li>{t('拆解结果与原稿并排校验', 'Side-by-side check against the original')}</li>
            </ul>
          </div>
          <div className="mk-feature-visual"><AnalyzeVisual /><p className="mk-visual-note">LAYER STRUCTURE · 界面示意</p></div>
        </div>

        <div className="mk-feature">
          <div>
            <p className="mk-eyebrow" style={{ marginBottom: 0 }}>03 — EDIT</p>
            <h3>{t('可视化编辑', 'Visual editing')}</h3>
            <p>{t('三栏工作台：图层、画布、属性。改文字、换图片、调颜色、拖动位置，每一步都能撤销。不满意某一块，直接让 AI 只改那一块。',
              'A three-panel workspace: layers, canvas, properties. Edit text, swap images, adjust colour and position, with full undo. Want one element changed? Ask AI to change only that element.')}</p>
            <ul>
              <li>{t('图层显示、锁定、排序、重命名', 'Show, lock, reorder and rename layers')}</li>
              <li>{t('文字 / 图片 / 图形各自的属性面板', 'Dedicated panels for text, image and shape')}</li>
              <li>{t('自动保存到账号，换设备继续', 'Autosaved to your account, continue anywhere')}</li>
            </ul>
          </div>
          <div className="mk-feature-visual"><EditorVisual /><p className="mk-visual-note">WORKSPACE LAYOUT · 界面示意</p></div>
        </div>

        <div className="mk-feature">
          <div>
            <p className="mk-eyebrow" style={{ marginBottom: 0 }}>04 — DELIVER</p>
            <h3>{t('包装文件输出', 'Packaging file output')}</h3>
            <p>{t('按包装结构和真实尺寸算出展开稿：刀切线、压痕线、糊口、出血各自分层。正面的设计自动映射到对应面，导出 PNG / SVG / PDF。',
              'Dielines are computed from structure and real dimensions: cut, fold, glue flap and bleed are separate layers. Artwork maps to each panel automatically. Export PNG / SVG / PDF.')}</p>
            <ul>
              <li>{t('插舌盒、天地盖、标签等标准结构', 'Standard structures: tuck-end, lid & base, labels')}</li>
              <li>{t('尺寸参数化，改一个数整张重算', 'Parameterised: change one dimension, all recalculates')}</li>
              <li>{t('导出前预检尺寸、文字与分辨率', 'Preflight checks size, text and resolution')}</li>
            </ul>
          </div>
          <div className="mk-feature-visual"><DielineVisual /><p className="mk-visual-note">DIELINE · 参数化展开示意</p></div>
        </div>
      </section>

      <section className="mk-sec" style={{ paddingTop: 0 }}>
        <div className="mk-sec-head"><h2>{t('支持范围，写清楚。', 'Scope, stated plainly.')}</h2></div>
        <div className="mk-about-grid">
          <div>
            <h4>{t('已支持', 'Available')}</h4>
            <p>{t('三种方向生成、元素拆解、图层编辑、标准纸盒与标签刀版、PNG / SVG / PDF 导出、项目云端保存。',
              'Concept generation, decomposition, layer editing, standard carton and label dielines, PNG/SVG/PDF export, cloud project storage.')}</p>
          </div>
          <div>
            <h4>{t('按标准输出', 'Standards')}</h4>
            <p>{t('刀版几何由程序按尺寸计算，不靠模型猜。线条规范（刀切/压痕颜色、出血值）可在导出时按印厂要求调整。',
              'Dieline geometry is computed, not guessed. Cut/fold colours and bleed can be adjusted to your printer’s spec on export.')}</p>
          </div>
          <div>
            <h4>{t('仍需人工确认', 'Needs human check')}</h4>
            <p>{t('本系统目前不提供 CMYK 分色、专色与字体完整嵌入。正式量产前请让印厂核对尺寸、色彩与材质。',
              'CMYK separation, spot colours and full font embedding are not currently provided. Have your printer verify size, colour and stock before mass production.')}</p>
          </div>
        </div>
      </section>

      <section className="mk-final">
        <h2>{t('先做一个方向看看。', 'Try one direction first.')}</h2>
        <button className="mk-btn mk-btn--primary" onClick={() => go('/new?fresh=1')}>
          {t('开始设计', 'Start designing')} <span aria-hidden>→</span>
        </button>
      </section>
    </div>
    <MarketingFooter />
  </div>;
}
