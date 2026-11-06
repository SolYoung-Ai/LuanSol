/* ============================================================
 * LunaSol 品牌加载态
 * ------------------------------------------------------------
 * 全站唯一的「加载中」表达：LunaSol 字标从左到右被橙色填满，
 * 填到 Sol 三个字母时逐个轻跳一下，然后整块淡出（由调用方卸载）。
 *
 * 为什么不用转圈：
 *   转圈是「系统在忙」，字标填充是「品牌在准备」。对一个月费制的设计产品来说，
 *   加载态是品牌露出的一部分，不该交给一个通用 spinner。
 *
 * 进度为什么是模拟的：
 *   Suspense 的懒加载没有真实百分比可读，所以这里给的是「确定会走完的动画进度」，
 *   不对外宣称任何真实加载百分比——它不是进度条读数，是等待时的节奏。
 *   真正有真实进度的场景（AI 调用、导出）继续用各自的真实状态，不冒充。
 * ============================================================ */
import React, { useEffect, useState } from 'react';

const WORD = 'LunaSol'.split('');
const SOL_FROM = 4; // S / o / l 的起始索引：填到这三个字母时逐字轻跳

export function LunaLoader({ hint }: { hint?: string }) {
  const [p, setP] = useState(0);

  useEffect(() => {
    // 尊重系统的「减少动效」偏好：直接给到 100%，不做跳动
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setP(1); return; }
    let raf = 0;
    const dur = 1150;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      setP(1 - Math.pow(1 - k, 3)); // easeOutCubic：起手快、收尾稳
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const n = WORD.length;

  return <div className="luna-loader" role="status" aria-live="polite" aria-label={hint || '加载中'}>
    <div className="luna-loader-word" aria-hidden>
      {WORD.map((ch, i) => {
        // 每个字母自己的填充比例：0 未开始 / 1 已填满；中间值是「正在被填」
        const f = Math.max(0, Math.min(1, p * n - i));
        const jumped = f >= 1 && i >= SOL_FROM;
        return <span
          key={`${ch}-${i}`}
          className={`luna-letter${jumped ? ' jumped' : ''}`}
          style={{ ['--f' as string]: `${f * 100}%`, animationDelay: `${(i - SOL_FROM) * 90}ms` }}
        >{ch}</span>;
      })}
    </div>
    {hint && <div className="luna-loader-hint">{hint}</div>}
  </div>;
}
