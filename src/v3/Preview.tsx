/* 实时包装预览：明确的「设计草稿 / 占位预览」，不冒充已完成的 AI 生成结果 */
import React from 'react';
import type { ProjectDraft } from './draft';
import { FORM_META } from './draft';
import { styleById } from './styles';
import { WIZARD_STEPS, stepDone, stepProgress } from './steps';

function shapePath(form: string): React.ReactNode {
  switch (form) {
    case 'label': return <>
      <rect x="62" y="60" width="196" height="216" rx="8" className="pv-face" />
      <rect x="72" y="70" width="176" height="196" rx="4" className="pv-inner" />
    </>;
    case 'pouch': return <>
      <path d="M66 66 H254 V268 Q160 286 66 268 Z" className="pv-face" />
      <path d="M66 66 H254 M66 78 H254" className="pv-edge" />
    </>;
    case 'bottle': return <>
      <path d="M128 58 H192 V88 Q192 100 206 112 Q224 128 224 158 V264 Q224 278 210 278 H110 Q96 278 96 264 V158 Q96 128 114 112 Q128 100 128 88 Z" className="pv-face" />
      <rect x="96" y="150" width="128" height="96" className="pv-inner" />
    </>;
    case 'gift': return <>
      <path d="M60 104 L160 70 L260 104 L160 138 Z" className="pv-top" />
      <path d="M60 104 L160 138 L160 278 L60 244 Z" className="pv-face" />
      <path d="M160 138 L260 104 L260 244 L160 278 Z" className="pv-side" />
      <path d="M160 70 V278 M60 104 L60 244 M260 104 L260 244" className="pv-edge" />
    </>;
    case 'custom': return <>
      <rect x="62" y="72" width="196" height="204" className="pv-face pv-dashed" />
      <path d="M62 72 H258 V276 H62 Z" className="pv-edge" />
    </>;
    default: return <>
      <path d="M62 104 L160 72 L258 104 L160 136 Z" className="pv-top" />
      <path d="M62 104 L160 136 L160 276 L62 244 Z" className="pv-face" />
      <path d="M160 136 L258 104 L258 244 L160 276 Z" className="pv-side" />
      <path d="M160 136 V276" className="pv-edge" />
    </>;
  }
}

export function PackagePreview({ d, compact = false }: { d: ProjectDraft; compact?: boolean }) {
  const pal = d.color_palette;
  const bg = pal?.bg || '#f7f6f2';
  const primary = pal?.primary || d.primary_color || '#d9d6cf';
  const accent = pal?.accent || '#c8a86b';
  const ink = pal?.ink || '#1d1d1b';
  const style = styleById(d.style_id);
  const logo = d.brand_logo?.src || (d.logo_svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(d.logo_svg)}` : '');
  const brand = d.copy_content.brandName || d.logo_ai_spec.brandName;
  const product = d.copy_content.productName || d.product_category.type || d.product_category.custom;
  const showIllustration = d.illustration_type && d.illustration_type !== 'none';
  const progress = stepProgress(d);

  return <div className={`pv ${compact ? 'pv-compact' : ''}`}>
    <div className="pv-head">
      <span className="pv-kicker">LIVE PREVIEW</span>
      <span className="pv-state">设计草稿 · 尚未生成</span>
    </div>
    <div className="pv-canvas" style={{ background: '#fbfaf8' }}>
      <svg viewBox="0 0 320 340" className="pv-svg" role="img" aria-label="包装设计草稿预览">
        <defs>
          <linearGradient id="pvShade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity="0.10" /><stop offset="1" stopColor="#000" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <ellipse cx="160" cy="298" rx="112" ry="10" fill="#000" opacity="0.06" />
        <g style={{ ['--pv-bg' as string]: bg, ['--pv-primary' as string]: primary, ['--pv-ink' as string]: ink }}>
          <g className="pv-shape">{shapePath(d.package_type)}</g>
          {/* 主色带 */}
          <rect x="78" y="150" width="164" height="5" fill={primary} opacity="0.85" />
          {/* 插画占位：只有用户选了图案才出现 */}
          {showIllustration && <g>
            <rect x="86" y="170" width="148" height="62" fill="none" stroke={accent} strokeWidth="1" strokeDasharray="4 4" opacity="0.8" />
            <text x="160" y="205" textAnchor="middle" fontSize="9" fill={ink} opacity="0.55">
              {d.illustration_type === 'line' ? '线稿区域' : '插画区域'}{style ? ` · ${style.style_name}` : ''}
            </text>
          </g>}
          {/* Logo */}
          {logo && <image href={logo} x="112" y="88" width="96" height="46" preserveAspectRatio="xMidYMid meet" />}
          {!logo && brand && <text x="160" y="120" textAnchor="middle" fontSize="17" fontWeight="500" letterSpacing="2" fill={ink}>{brand.slice(0, 12)}</text>}
          {!logo && !brand && <text x="160" y="120" textAnchor="middle" fontSize="12" fill={ink} opacity="0.28">BRAND LOGO</text>}
          {/* 产品名 */}
          {product && <text x="160" y="248" textAnchor="middle" fontSize="13" letterSpacing="1.5" fill={ink}>{product.slice(0, 16)}</text>}
          {d.copy_content.tagline && <text x="160" y="264" textAnchor="middle" fontSize="8" fill={ink} opacity="0.6">{d.copy_content.tagline.slice(0, 24)}</text>}
          {/* 条码占位 */}
          {d.barcode_asset.needed && <g>
            <rect x="128" y="212" width="64" height="16" fill="#fff" stroke={ink} strokeWidth="0.5" opacity="0.8" />
            {Array.from({ length: 14 }).map((_, i) => <rect key={i} x={131 + i * 4.4} y="214" width={i % 3 === 0 ? 1.6 : 0.8} height="12" fill="#111" opacity="0.8" />)}
          </g>}
        </g>
      </svg>
      <div className="pv-watermark">占位预览 · 完成生成后显示真实设计稿</div>
    </div>
    <div className="pv-meta">
      <div><span>包装形态</span><strong>{FORM_META[d.package_type]?.label || '—'}</strong></div>
      <div><span>尺寸</span><strong>{d.package_dimensions.known ? (() => { const v = d.package_dimensions.values; return `${v.l || 0} × ${v.w || 0}${v.h ? ` × ${v.h}` : ''} mm`; })() : '待确认'}</strong></div>
      <div><span>风格</span><strong>{style?.style_name || '未选择'}</strong></div>
      <div><span>主色</span><strong className="pv-color"><i style={{ background: primary }} />{primary || '未选择'}</strong></div>
    </div>
    {!compact && <div className="pv-progress">
      <div className="pv-progress-top"><span>需求完成度</span><strong>{progress} / {WIZARD_STEPS.length}</strong></div>
      <div className="pv-progress-bar"><i style={{ width: `${progress / WIZARD_STEPS.length * 100}%` }} /></div>
      <div className="pv-progress-list">{WIZARD_STEPS.map((s, i) => <span key={s.id} className={stepDone(d, i) ? 'done' : ''}>{String(i + 1).padStart(2, '0')} {s.short}</span>)}</div>
    </div>}
  </div>;
}
