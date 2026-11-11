/* ============================================================
 * 首页 = 两条路的入口
 * ------------------------------------------------------------
 * 按需求把之前那套「对话 + 工作台 + 审美市场」的聚合页撤掉，
 * 这一屏只留两张卡：有方向 / 从零开始。
 * 点哪张就在工作台里建（或切到）对应路径，然后直接进 STEP 02 确认需求。
 * 卡片与 /new 的 STEP 01 用的是同一个组件，文案与行为不会分叉。
 * ============================================================ */
import React, { useEffect } from 'react';
import { go } from '../ui';
import { EntryCards, useEntryPick } from '../workflow/EntryCards';

export default function Start() {
  const { busy, pick } = useEntryPick();

  // 整屏页：隐藏页脚与全局「返回」，避免屏幕下方多出一排与导航重复的链接
  useEffect(() => {
    document.body.classList.add('on-start');
    return () => { document.body.classList.remove('on-start'); };
  }, []);

  const choose = (mode: Parameters<typeof pick>[0]) => {
    const ok = pick(mode);
    if (ok) go('/new');
  };

  return <div className="hp-start">
    <div className="hp-start-inner">
      <EntryCards busy={busy} onPick={choose} />
      <p className="hp-start-note">不确定选哪个？先选「从零开始」，下一步补充产品信息即可。</p>
    </div>
  </div>;
}
