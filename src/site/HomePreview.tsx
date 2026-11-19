/* ============================================================
   首页重设计 · 预览版（/preview）
   ------------------------------------------------------------
   左边一句话加一个输入框，右边那行大字跟着左边实时长出来。
   页面只有一屏，不滚，不放任何图形，靠排版的次序和动效说话。

   动效全部是「有信息含义的动作」，不含装饰性动画：
   1) 开场：标题两行浮起、由虚到实
   2) 右侧逐字落下
   3) 橙色光标闪，等于「在等你输入」
   4) 示例自己打字（三樱椒 → 素白研 → 明前龙井 → 白桃气泡）
   5) 换示例时尺寸行同步淡换
   6) 底部结构名缓慢横移
   用户一旦自己敲字，自动演示立刻停，页面交给他。
   prefers-reduced-motion 下全部落到静态。
   ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import './preview.css';
import { go } from '../ui';

const DEMOS = [
  { name: '三樱椒', line: 'stand-up pouch · 140 × 40 × 210 mm' },
  { name: '素白研', line: 'bottle label · 62 × 62 × 180 mm' },
  { name: '明前龙井', line: 'tuck-end box · 200 × 280 × 100 mm' },
  { name: '白桃气泡', line: 'stand-up pouch · 120 × 40 × 190 mm' },
];
const STRUCTS = ['插舌盒', '自立袋', '瓶身标签', '天地盖', '手提袋'];

function Arrow() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 12h15" /><path d="M13 6l6 6-6 6" />
  </svg>;
}

export default function HomePreview() {
  // ?still：只在截图/无动效环境使用，页面本身照常播放
  const still = typeof window !== 'undefined' && window.location.hash.includes('still');
  const [chars, setChars] = useState<string[]>(still ? DEMOS[0].name.split('') : ['三']);
  const [line, setLine] = useState(DEMOS[0].line);
  const [lineOut, setLineOut] = useState(false);
  const [value, setValue] = useState(still ? DEMOS[0].name : '三');
  // 用户一旦输入，就停下自动演示，不再跟他抢输入框
  const manual = useRef(false);

  useEffect(() => {
    const reduce = still || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setChars(DEMOS[0].name.split(''));
      setValue(DEMOS[0].name);
      return;
    }
    let alive = true;
    const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

    (async () => {
      let i = 0;
      await sleep(700);
      while (alive) {
        if (manual.current) return;
        const d = DEMOS[i % DEMOS.length];
        if (i > 0) {
          setLineOut(true);
          await sleep(160);
        }
        if (!alive) return;
        setLine(d.line);
        setLineOut(false);
        setChars([]);
        await sleep(90);
        for (let k = 1; k <= d.name.length; k++) {
          if (!alive || manual.current) return;
          setChars(d.name.slice(0, k).split(''));
          setValue(d.name.slice(0, k));
          await sleep(120);
        }
        await sleep(2200);
        if (!alive || manual.current) return;
        setChars([]);
        setValue('');
        await sleep(560);
        i++;
      }
    })();

    return () => { alive = false; };
  }, [still]);

  return <div className={`pv-root${still ? ' pv-still' : ''}`}>
    <div className="pv-glow" />
    <div className="pv-veil" />

    <div className="pv-wrap">
      <div className="pv-top">
        <a className="pv-logo" href="#/">Luna<b>Sol</b></a>
        <div className="pv-r">
          <a href="#/login">登录</a>
          <a className="pv-go" href="#/studio">开始设计 →</a>
        </div>
      </div>

      <div className="pv-stage">
        <div>
          <div className="pv-eyebrow">Packaging, in the browser</div>
          <h1 className="pv-h1">
            <span>写个名字，</span>
            <span>包装就有了。</span>
          </h1>

          <div className="pv-ask">
            <div className="pv-field">
              <span className="pv-lead">我想做</span>
              <input
                value={value}
                placeholder="输入产品名"
                aria-label="产品名"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  manual.current = true;
                  const v = e.target.value;
                  setValue(v);
                  setChars(v ? v.split('') : []);
                  if (!v) setLine(`${DEMOS[0].line}`);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') go('/studio'); }}
              />
            </div>
            <button className="pv-btn" aria-label="开始设计" onClick={() => go('/studio')}>
              <Arrow />
            </button>
          </div>

          <div className="pv-meta">
            <span>版面、3D、刀板、印刷文件，一次给齐</span>
            <i className="pv-dot" />
            <span>不用装软件</span>
          </div>
        </div>

        <div className="pv-spec">
          <div className="pv-rule" />
          <div className="pv-wordbox">
            <div className="pv-word">
              {chars.map((c, idx) => <i key={idx}>{c}</i>)}
            </div>
            <span className="pv-caret" />
          </div>
          <div className={`pv-specline${lineOut ? ' is-out' : ''}`}>{line}</div>
          <div className="pv-vtag">live preview</div>
        </div>
      </div>

      <div className="pv-marquee">
        <div className="pv-track">
          {[0, 1, 2, 3, 4].map((g) => STRUCTS.map((s) => (
            <React.Fragment key={`${g}-${s}`}>
              <span>{s}</span><b>·</b>
            </React.Fragment>
          )))}
        </div>
      </div>

      <div className="pv-foot">
        <div className="pv-items">
          <div><em>01</em><span>版面</span></div>
          <div><em>02</em><span>3D</span></div>
          <div><em>03</em><span>刀板</span></div>
          <div><em>04</em><span>导出</span></div>
        </div>
        <div>每个字都按毫米排 · © 2026 LunaSol</div>
      </div>
    </div>
  </div>;
}
