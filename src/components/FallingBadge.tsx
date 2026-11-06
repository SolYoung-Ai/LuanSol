import React, { useEffect, useRef } from 'react';

interface Props {
  name?: string;
  subtitle?: string;
  online?: boolean;
}

/* 工牌尺寸（较参考图缩小） */
const BW = 150; // 宽
const BH = 206; // 高
const REST = 250; // 挂点到工牌中心的静止距离
const HOLE_DX = 18; // 挂孔相对中心水平偏移
const HOLE_DY = 14; // 挂孔相对工牌顶部偏移
const ANCHOR_DX = 42; // 顶部两挂绳锚点相对中心水平偏移

/** 掉落的工牌：弹簧掉落 + 钟摆摆动 + 鼠标视差倾斜，纯 rAF 物理模拟。 */
export default function FallingBadge({ name = 'Sol.Young', subtitle = 'AI PACKAGING STUDIO', online = true }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const leftRef = useRef<SVGLineElement>(null);
  const rightRef = useRef<SVGLineElement>(null);
  const clipRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const stage = stageRef.current!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W = stage.clientWidth;
    let H = stage.clientHeight;

    // 物理状态
    let dist = reduce ? REST : 0; // 掉落弹簧位移
    let vel = 0;
    let theta = reduce ? 0 : 0.12; // 钟摆角
    let omega = 0;
    let mouseX = 0;
    let tiltX = 0;
    let tiltY = 0;
    let t = 0;

    const K = 46; // 掉落弹簧刚度
    const DAMP = 7.2; // 掉落阻尼（欠阻尼 → 1~2 次回弹）
    const STIFF = 21; // 钟摆跟随刚度
    const DT = 4.2; // 钟摆阻尼
    const MAXT = 0.3; // 最大摆角

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      mouseX = ((e.clientX - r.left) / r.width) * 2 - 1;
    };
    const onResize = () => { W = stage.clientWidth; H = stage.clientHeight; };
    if (!reduce) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('resize', onResize);
    }

    const rot = (lx: number, ly: number, a: number) => {
      const c = Math.cos(a), s = Math.sin(a);
      return { x: lx * c - ly * s, y: lx * s + ly * c };
    };

    const render = () => {
      const px = W / 2;
      const py = 0; // 掉落枢轴在舞台顶部
      const bcx = px + Math.sin(theta) * dist;
      const bcy = py + Math.cos(theta) * dist;
      const tl = rot(-BW / 2 + HOLE_DX, -BH / 2 + HOLE_DY, theta);
      const tr = rot(BW / 2 - HOLE_DX, -BH / 2 + HOLE_DY, theta);
      const clip = rot(0, -BH / 2 + HOLE_DY, theta);
      const tlw = { x: bcx + tl.x, y: bcy + tl.y };
      const trw = { x: bcx + tr.x, y: bcy + tr.y };
      const clipw = { x: bcx + clip.x, y: bcy + clip.y };

      const aL = { x: px - ANCHOR_DX, y: 2 };
      const aR = { x: px + ANCHOR_DX, y: 2 };

      if (cardRef.current) {
        cardRef.current.style.transform =
          `translate(${bcx}px, ${bcy}px) translate(-50%, -50%) rotate(${(theta * 180) / Math.PI}deg)`;
      }
      if (innerRef.current) {
        innerRef.current.style.transform = `perspective(720px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
      }
      if (svgRef.current) {
        svgRef.current.setAttribute('viewBox', `0 0 ${W} ${H}`);
      }
      if (leftRef.current) {
        leftRef.current.setAttribute('x1', String(aL.x)); leftRef.current.setAttribute('y1', String(aL.y));
        leftRef.current.setAttribute('x2', String(tlw.x)); leftRef.current.setAttribute('y2', String(tlw.y));
      }
      if (rightRef.current) {
        rightRef.current.setAttribute('x1', String(aR.x)); rightRef.current.setAttribute('y1', String(aR.y));
        rightRef.current.setAttribute('x2', String(trw.x)); rightRef.current.setAttribute('y2', String(trw.y));
      }
      if (clipRef.current) {
        clipRef.current.setAttribute('cx', String(clipw.x)); clipRef.current.setAttribute('cy', String(clipw.y));
      }
    };

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      t += dt;

      // 掉落：弹簧趋向静止距离，附带轻微回弹
      const acc = K * (REST - dist) - DAMP * vel;
      vel += acc * dt;
      dist += vel * dt;

      // 钟摆：跟随鼠标目标角 + 极轻微空闲摆动
      const target = Math.max(-MAXT, Math.min(MAXT, mouseX * 0.24));
      const idle = Math.sin(t * 0.9) * 0.01;
      const aTheta = (target + idle - theta) * STIFF - omega * DT;
      omega += aTheta * dt;
      theta += omega * dt;

      // 鼠标 3D 视差倾斜
      tiltY += (mouseX * 8 - tiltY) * 0.08;
      tiltX += (mouseX * -2 - tiltX) * 0.08;

      render();
      raf = requestAnimationFrame(frame);
    };

    if (reduce) render();
    else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div className="badge-stage" ref={stageRef} aria-hidden>
      <svg className="badge-lanyard" ref={svgRef} preserveAspectRatio="none">
        <line ref={leftRef} className="lanyard-strap" />
        <line ref={rightRef} className="lanyard-strap" />
        <circle ref={clipRef} className="lanyard-clip" r="5.5" />
      </svg>
      <div className="badge-card" ref={cardRef}>
        <div className="badge-inner" ref={innerRef}>
          <div className="badge-top">
            <span className="badge-id">DESIGNER ID</span>
            <span className="badge-brand">LUNASOL</span>
          </div>
          <div className="badge-photo">
            <div className="badge-avatar">{name.slice(0, 2).toUpperCase()}</div>
          </div>
          <div className="badge-name">{name}</div>
          <div className="badge-status"><i className="badge-dot" />{online ? 'ONLINE' : 'OFFLINE'}</div>
          <div className="badge-sub">{subtitle}</div>
          <div className="badge-barcode" aria-hidden>
            {Array.from({ length: 34 }).map((_, i) => (
              <span key={i} style={{ width: (i % 3 === 0 ? 2 : i % 2 === 0 ? 1 : 3) + 'px' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
