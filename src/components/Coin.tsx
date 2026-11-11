/* ============================================================
 * LS 硬币图标（积分单位）
 * ------------------------------------------------------------
 * 以前多处各写一份（积分页内联、侧栏写成一个灰色的小写字母「LS」），
 * 同一个「积分」在两处长得不一样。收敛到这里：金色硬币 + 虚线内圈 + LS 字样，
 * 侧栏、积分页、以及以后任何要标积分单位的地方都引这个组件。
 * ============================================================ */
import React from 'react';

export default function Coin({ size = 18, title }: { size?: number; title?: string }) {
  // 小尺寸（<18px）下虚线内圈会糊成一圈噪点，LS 也缩到看不清：
  // 这时只画实心金币 + 放大字重，保证「金币」和「LS」都还认得出来。
  const small = size < 18;
  return <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    style={{ flex: 'none', display: 'block' }}
  >
    {title ? <title>{title}</title> : null}
    <circle cx="12" cy="12" r="11" fill="#f5c451" stroke="#d4a027" strokeWidth={small ? 2 : 1.5} />
    {!small && <circle cx="12" cy="12" r="8" fill="none" stroke="#d4a027" strokeWidth="1" strokeDasharray="1.5 1.5" />}
    <text
      x="12"
      y={small ? 15.6 : 15.5}
      textAnchor="middle"
      fontSize={small ? 10.5 : 9}
      fontWeight="700"
      fill="#7a5a10"
      fontFamily="Arial"
      letterSpacing={small ? '-0.1' : undefined}
    >LS</text>
  </svg>;
}
