/* ============================================================
   品牌开场动画 · 循环版
   ------------------------------------------------------------
   和首页那支 2.5 秒的开场是同一套构成：黑圆从右上压下来落位 →
   橙圆从左侧滑出压上去（就是「橙圆压黑圆」的新标志）→ 字标逐字
   落位 → 副标浮出。
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
    <svg className="bl-mark" viewBox="0 0 64 64" aria-hidden>
      <circle className="bl-black" cx="37" cy="35" r="21.5" />
      <circle className="bl-orange" cx="27" cy="29" r="21.5" />
    </svg>
    <div className="bl-word" aria-hidden>
      {LETTERS.map((ch, i) => <span key={i} className={`bl-l${i + 1}`}>{ch}</span>)}
    </div>
    <div className="bl-sub">{t('人人都能成为设计师', 'Everyone can be a designer')}</div>
  </div>;
}
