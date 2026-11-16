/* ============================================================
   包装视觉：纯 SVG 几何包装
   ------------------------------------------------------------
   站点不用位图（用户要求：全部不要图）。首页与能力页里的「作品」
   由这几个几何体拼出来：纸盒 / 铁罐 / 自立袋 / 易拉罐 / 广口罐。
   统一光位：左上打光 → 顶面最亮、正面次之、侧面压暗两档；
   统一落地：一枚径向渐变的椭圆当影子（不用 blur 滤镜，省渲染）。
   橙色只出现在一条带上——这是品牌色出现次数的上限。
   ============================================================ */
import React, { useId } from 'react';

export type PackKind = 'carton' | 'tin' | 'pouch' | 'can' | 'jar';

const C = {
  front: '#FFFDF9',
  frontDeep: '#F5EDDF',
  top: '#F4EBD9',
  side: '#E4D9C5',
  edge: '#D6CBB6',
  hair: '#CFC3AC',
  label: '#EFE4D0',
  brand: '#F47735',
};

interface Props {
  kind: PackKind;
  /** 渲染高度（px）；宽度按 200:260 比例自适应 */
  height?: number;
  /** 正面底色，用于同屏多件时拉开层次 */
  tint?: string;
  /** 是否带品牌橙带 */
  accent?: boolean;
  className?: string;
}

export default function PackArt({ kind, height = 240, tint, accent = true, className }: Props) {
  const uid = useId().replace(/[:]/g, '');
  const sh = `sh-${uid}`;
  const face = `fc-${uid}`;
  const width = (height * 200) / 260;
  const body = tint || C.front;

  const defs = <defs>
    <radialGradient id={sh} cx="50%" cy="50%" r="50%">
      <stop offset="0%" stopColor="#4d4436" stopOpacity="0.26" />
      <stop offset="62%" stopColor="#4d4436" stopOpacity="0.08" />
      <stop offset="100%" stopColor="#4d4436" stopOpacity="0" />
    </radialGradient>
    {/* 正面的纵向渐变：上亮下暗一档，白纸上才有体积 */}
    <linearGradient id={face} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={body} />
      <stop offset="100%" stopColor={C.frontDeep} />
    </linearGradient>
  </defs>;

  const common = {
    width,
    height,
    viewBox: '0 0 200 260',
    fill: 'none',
    className,
    role: 'img' as const,
    'aria-hidden': true,
    focusable: 'false' as const,
  };

  if (kind === 'carton') {
    return <svg {...common}>
      {defs}
      <ellipse cx="100" cy="244" rx="56" ry="8" fill={`url(#${sh})`} />
      {/* 顶面（最亮） */}
      <path d="M50 78 L73 58 L151 58 L128 78 Z" fill={C.top} stroke={C.edge} strokeWidth="1.2" strokeLinejoin="round" />
      {/* 右侧面（最暗） */}
      <path d="M128 78 L151 58 L151 220 L128 240 Z" fill={C.side} stroke={C.edge} strokeWidth="1.2" strokeLinejoin="round" />
      {/* 正面 */}
      <path d="M50 78 H128 V240 H50 Z" fill={`url(#${face})`} stroke={C.edge} strokeWidth="1.2" strokeLinejoin="round" />
      {/* 正面左上角的高光边 */}
      <path d="M52 80 V238" stroke="#ffffff" strokeWidth="2" opacity="0.55" />
      {accent && <>
        <path d="M50 166 H128 V176 H50 Z" fill={C.brand} />
        <path d="M128 166 L151 146 V156 L128 176 Z" fill={C.brand} opacity="0.8" />
      </>}
      {/* 版面示意：细线代替文字，不写真实文案，避免被当成成品稿 */}
      <g stroke={C.hair} strokeWidth="2.4" strokeLinecap="round">
        <path d="M63 104 h32" />
        <path d="M63 117 h46" />
        <path d="M63 130 h18" />
        <path d="M63 202 h34" />
      </g>
      <circle cx="116" cy="107" r="4.5" fill={C.brand} opacity={accent ? 0.95 : 0.3} />
      {/* 底部的折边阴影 */}
      <path d="M50 232 H128 V240 H50 Z" fill="#000" opacity="0.035" />
    </svg>;
  }

  if (kind === 'tin') {
    return <svg {...common}>
      {defs}
      <ellipse cx="100" cy="238" rx="48" ry="8" fill={`url(#${sh})`} />
      {/* 罐身 */}
      <path d="M66 104 H134 V226 A34 9 0 0 1 66 226 Z" fill={`url(#${face})`} stroke={C.edge} strokeWidth="1.2" />
      <path d="M68 106 V224" stroke="#ffffff" strokeWidth="2" opacity="0.55" />
      <path d="M130 106 V224" stroke="#8f846e" strokeWidth="2" opacity="0.10" />
      {/* 底部弧 */}
      <path d="M66 226 A34 9 0 0 0 134 226" fill={C.side} stroke={C.edge} strokeWidth="1.2" />
      {/* 罐盖：比罐身宽一圈，这是铁罐最好认的特征 */}
      <path d="M58 104 V96 A42 11 0 0 1 142 96 V104 A42 11 0 0 1 58 104 Z" fill={C.top} stroke={C.edge} strokeWidth="1.2" />
      <ellipse cx="100" cy="96" rx="42" ry="11" fill={C.top} stroke={C.edge} strokeWidth="1.2" />
      <ellipse cx="100" cy="96" rx="32" ry="7.5" fill="none" stroke={C.hair} strokeWidth="1.2" />
      <path d="M100 88.5 V103.5" stroke={C.hair} strokeWidth="1.2" opacity="0.7" />
      {/* 标签区 */}
      <path d="M66 138 H134 V196 H66 Z" fill={C.label} />
      {accent && <path d="M66 190 H134 V199 H66 Z" fill={C.brand} />}
      <g stroke={C.hair} strokeWidth="2.4" strokeLinecap="round">
        <path d="M82 154 h36" />
        <path d="M88 167 h24" />
      </g>
      <circle cx="100" cy="216" r="6" fill="none" stroke={C.hair} strokeWidth="1.3" opacity="0.7" />
    </svg>;
  }

  if (kind === 'pouch') {
    return <svg {...common}>
      {defs}
      <ellipse cx="100" cy="240" rx="54" ry="8" fill={`url(#${sh})`} />
      {/* 袋身：底部比顶部宽，站得住的自立袋就是这个形状 */}
      <path
        d="M60 98 H140 A8 8 0 0 1 148 106 L154 214 A12 12 0 0 1 142 228 H58 A12 12 0 0 1 46 214 L52 106 A8 8 0 0 1 60 98 Z"
        fill={`url(#${face})`}
        stroke={C.edge}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M56 100 L50 220" stroke="#ffffff" strokeWidth="2" opacity="0.5" />
      <path d="M144 100 L150 220" stroke="#8f846e" strokeWidth="2" opacity="0.09" />
      {/* 底部折边（站脚） */}
      <path d="M46 212 L154 212 L154 218 A12 12 0 0 1 142 228 H58 A12 12 0 0 1 46 218 Z" fill="#000" opacity="0.05" />
      <path d="M48 212 H152" stroke={C.edge} strokeWidth="1.1" />
      {/* 上封边：锯齿状热封纹 */}
      <path d="M64 80 H136 V98 H64 Z" fill={C.top} stroke={C.edge} strokeWidth="1.2" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path key={i} d={`M${67 + i * 10.5} 80 V98`} stroke={C.hair} strokeWidth="1" opacity="0.6" />
      ))}
      {accent && <path d="M50 148 H150 V160 H50 Z" fill={C.brand} />}
      <g stroke={C.hair} strokeWidth="2.4" strokeLinecap="round">
        <path d="M72 118 h46" />
        <path d="M72 131 h28" />
      </g>
      <circle cx="100" cy="186" r="11" fill="none" stroke={C.hair} strokeWidth="1.3" opacity="0.7" />
    </svg>;
  }

  if (kind === 'can') {
    return <svg {...common}>
      {defs}
      <ellipse cx="100" cy="240" rx="40" ry="7" fill={`url(#${sh})`} />
      <path d="M70 94 H130 A8 8 0 0 1 138 102 V226 A8 8 0 0 1 130 234 H70 A8 8 0 0 1 62 226 V102 A8 8 0 0 1 70 94 Z" fill={`url(#${face})`} stroke={C.edge} strokeWidth="1.2" />
      <ellipse cx="100" cy="94" rx="31" ry="8" fill={C.top} stroke={C.edge} strokeWidth="1.2" />
      <ellipse cx="100" cy="94" rx="21" ry="5" fill="none" stroke={C.hair} strokeWidth="1.2" />
      <ellipse cx="100" cy="234" rx="31" ry="8" fill={C.side} stroke={C.edge} strokeWidth="1.2" />
      <path d="M64 100 V228" stroke="#ffffff" strokeWidth="2" opacity="0.5" />
      <path d="M134 100 V228" stroke="#8f846e" strokeWidth="2" opacity="0.09" />
      {accent && <path d="M62 118 H138 V127 H62 Z" fill={C.brand} />}
      {/* 标签区 */}
      <path d="M62 146 H138 V200 H62 Z" fill={C.label} />
      <g stroke={C.hair} strokeWidth="2.4" strokeLinecap="round">
        <path d="M84 160 h32" />
        <path d="M88 173 h24" />
        <path d="M92 186 h16" />
      </g>
    </svg>;
  }

  /* jar：广口罐，盖子明显比罐身窄，肩线露出来 */
  return <svg {...common}>
    {defs}
    <ellipse cx="100" cy="240" rx="46" ry="8" fill={`url(#${sh})`} />
    <path d="M58 126 H142 V214 A18 18 0 0 1 124 232 H76 A18 18 0 0 1 58 214 Z" fill={`url(#${face})`} stroke={C.edge} strokeWidth="1.2" />
    <path d="M60 130 V212" stroke="#ffffff" strokeWidth="2" opacity="0.55" />
    <path d="M140 132 V210" stroke="#8f846e" strokeWidth="2" opacity="0.09" />
    {/* 盖：窄一圈 + 顶面 */}
    <path d="M78 88 H122 A5 5 0 0 1 127 93 V126 H73 V93 A5 5 0 0 1 78 88 Z" fill={C.top} stroke={C.edge} strokeWidth="1.2" />
    <ellipse cx="100" cy="88" rx="24" ry="6.5" fill={C.top} stroke={C.edge} strokeWidth="1.2" />
    {accent && <path d="M73 121 H127 V127 H73 Z" fill={C.brand} />}
    {/* 标签 */}
    <path d="M58 142 H142 V200 H58 Z" fill={C.label} />
    <g stroke={C.hair} strokeWidth="2.4" strokeLinecap="round">
      <path d="M80 158 h40" />
      <path d="M86 171 h28" />
    </g>
    <circle cx="100" cy="212" r="7" fill="none" stroke={C.hair} strokeWidth="1.3" opacity="0.6" />
  </svg>;
}

/* ------------------------------------------------------------
   刀版图：展开面 + 虚线折线 + 尺寸刻度
   能力 02「智能包装拆解」用它，比再放一个盒子更能说明问题。
   ------------------------------------------------------------ */
export function Dieline({ width = 420, className }: { width?: number; className?: string }) {
  const height = (width * 220) / 420;
  return <svg
    width={width}
    height={height}
    viewBox="0 0 420 220"
    fill="none"
    className={className}
    role="img"
    aria-label="Packaging dieline"
  >
    {/* 裁切线：粘口 + 侧/正/侧/背 四联 + 上下摇盖 */}
    <g stroke="#191919" strokeWidth="1.5" strokeLinejoin="round" opacity="0.86">
      <path d="M62 74 H118 H228 H284 H394 V174 H284 H228 H118 H62 Z" />
      <path d="M48 84 L62 74 V174 L48 164 Z" />
      <path d="M118 74 V44 H228 V74" />
      <path d="M284 74 V44 H394 V74" />
      <path d="M118 174 V204 H228 V174" />
      <path d="M284 174 V204 H394 V174" />
    </g>
    {/* 折线：虚线 */}
    <g stroke="#b3a893" strokeWidth="1.2" strokeDasharray="4 4">
      <path d="M62 74 V174" />
      <path d="M118 74 V174" />
      <path d="M228 74 V174" />
      <path d="M284 74 V174" />
      <path d="M118 74 H394" />
      <path d="M118 174 H394" />
    </g>
    {/* 正面版面示意 */}
    <g stroke="#cfc3ac" strokeWidth="1.8" strokeLinecap="round">
      <path d="M140 96 h28" />
      <path d="M140 106 h18" />
      <path d="M140 140 h52" />
    </g>
    <rect x="176" y="92" width="40" height="64" fill="#F47735" opacity="0.12" />
    <path d="M176 92 h40" stroke="#F47735" strokeWidth="1.6" opacity="0.6" />
    {/* 尺寸线 */}
    <g stroke="#bfb39d" strokeWidth="1">
      <path d="M118 212 H228" />
      <path d="M118 208 V216" />
      <path d="M228 208 V216" />
      <path d="M62 34 H394" />
      <path d="M62 30 V38" />
      <path d="M394 30 V38" />
    </g>
    <g fill="#9d9488" fontSize="8.5" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" letterSpacing="0.08em">
      <text x="146" y="221">W 110 MM</text>
      <text x="176" y="30">BLEED 3 MM</text>
    </g>
  </svg>;
}
