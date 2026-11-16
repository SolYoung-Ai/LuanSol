/* ============================================================
   品牌开场动画 · 循环版
   ------------------------------------------------------------
   和首页那支 2.4 秒的开场是同一套构成：方形描边生长 → 橙色太阳
   弹出 → 一枚纸色圆压上去切出月牙（Luna）→ 字标逐字落位 → 副标浮出。
   区别只有两点：
     · 无限循环（每 7 秒一轮，末尾留 1 秒空白再重来）；
     · 不占满屏、不做淡出蒙层，只作为登录页左栏的一块「活画面」。
   纯 SVG + CSS：不加载视频、不拉字体、不用位图，也不会因为动画
   在后台标签页被节流而卡住（CSS 动画跟着合成器走）。
   系统开了「减少动态效果」时停在组装完成的静止画面。
   ============================================================ */
import React from 'react';
import { useLang } from '../i18n';

const LETTERS = ['L', 'u', 'n', 'a', 'S', 'o', 'l'];

export default function BrandLoop() {
  const { t } = useLang();
  return <div className="bl" role="img" aria-label="LunaSol">
    <svg className="bl-mark" viewBox="0 0 92 92" aria-hidden>
      <rect className="bl-sq" x="14" y="14" width="64" height="64" rx="7" />
      <circle className="bl-sun" cx="46" cy="46" r="17" />
      <circle className="bl-moon" cx="40" cy="41" r="17" />
    </svg>
    <div className="bl-word" aria-hidden>
      {LETTERS.map((ch, i) => <span key={i} className={`bl-l${i + 1}`}>{ch}</span>)}
    </div>
    <div className="bl-sub">{t('AI 包装设计工作室', 'AI Packaging Design Studio')}</div>
  </div>;
}
