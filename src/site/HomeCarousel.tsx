/* ============================================================
   首页重设计 · 3D 纸样旋转木马（/carousel）
   ------------------------------------------------------------
   参照的是一段 3D 旋转木马：灰底影棚、八张被揉皱的纸海报绕着
   中轴慢转，拖一下就能用手推着转。

   做法是真 3D，不是贴片：
   · 每张纸是真平面细分后的顶点位移（低频折痕 + 高频起皱）
   · 用 flatShading 出多面体质感，边缘随机压弯 → 纸才会「皱」
   · 每张纸的图文是 canvas 现画的（克重、压线、套准这些词是真行业词）
   · 影棚光：一盏方向光 + 半球光 + 地面接受投影（地面用径向 alpha 渐隐，
     和背景渐变接住，不留一条硬地平线）

   交互：默认自己慢转；按下拖动接管，松手带惯性，惯性衰减后回到慢转。
   尊重 prefers-reduced-motion：不自动转，只保留拖拽。
   ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import './carousel.css';
import { go } from '../ui';

type Card = { key: string; name: string; note: string; draw: (c: CanvasRenderingContext2D, w: number, h: number) => void };

const SERIF = '"Times New Roman", Georgia, serif';
const SANS = '"Helvetica Neue", Arial, sans-serif';

/** 八张纸：颜色与排版都按真实印前语言画，不画装饰图形 */
const CARDS: Card[] = [
  {
    key: 'paper', name: '纸样', note: '300 gsm · 单面',
    draw: (c, w, h) => {
      c.fillStyle = '#F3F0E6'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#0F2E27';
      c.font = `600 ${w * 0.19}px ${SERIF}`; c.fillText('Paper.', w * 0.09, h * 0.24);
      c.font = `600 ${w * 0.2}px ${SERIF}`; c.textAlign = 'right'; c.fillText('Holds.', w * 0.92, h * 0.8);
      c.textAlign = 'center';
      c.fillStyle = '#3D6B5C';
      c.font = `500 ${w * 0.035}px ${SANS}`;
      c.fillText('EVERY SHEET REMEMBERS.', w * 0.5, h * 0.5);
      c.fillText('EVERY CREASE IS A RECORD.', w * 0.5, h * 0.545);
      c.fillText('NOTHING IS WASTED.', w * 0.5, h * 0.59);
    },
  },
  {
    key: 'crease', name: '压线', note: '0.7 mm × 4',
    draw: (c, w, h) => {
      c.fillStyle = '#0C0B0A'; c.fillRect(0, 0, w, h);
      c.textAlign = 'left';
      for (let i = 0; i < 5; i++) {
        const g = 236 - i * 44;
        c.fillStyle = `rgb(${g},${g},${g - 4})`;
        c.font = `700 ${w * 0.2}px ${SANS}`;
        c.fillText('CREASE', w * 0.06, h * 0.26 + i * h * 0.145);
      }
    },
  },
  {
    key: 'takeoff', name: '起飞', note: '平面即可',
    draw: (c, w, h) => {
      c.fillStyle = '#C32A1B'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#F6F2EA';
      const cx = w * 0.5, cy = h * 0.46;
      c.beginPath();
      c.moveTo(cx - w * 0.26, cy + h * 0.08);
      c.lineTo(cx + w * 0.24, cy - h * 0.12);
      c.lineTo(cx + w * 0.24, cy + h * 0.06);
      c.lineTo(cx - w * 0.02, cy + h * 0.14);
      c.closePath(); c.fill();
      c.fillStyle = '#F0E7DE';
      c.font = `500 ${w * 0.04}px ${SANS}`;
      c.fillText('Take off from', w * 0.1, h * 0.88);
      c.fillText('any flat surface.', w * 0.1, h * 0.925);
      c.fillStyle = '#F0E7DE';
      c.font = `500 ${w * 0.03}px ${SANS}`; c.textAlign = 'right';
      c.fillText('01 / 07', w * 0.92, h * 0.13);
    },
  },
  {
    key: 'light', name: '轻一点', note: '120 gsm · 未涂布',
    draw: (c, w, h) => {
      c.fillStyle = '#F1EFE7'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#141210'; c.lineWidth = w * 0.008;
      c.beginPath();
      c.ellipse(w * 0.5, h * 0.44, w * 0.19, h * 0.2, 0.1, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(w * 0.44, h * 0.4, w * 0.008, 0, Math.PI * 2);
      c.arc(w * 0.56, h * 0.4, w * 0.008, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(w * 0.43, h * 0.47); c.quadraticCurveTo(w * 0.5, h * 0.53, w * 0.57, h * 0.47);
      c.stroke();
      c.font = `italic 500 ${w * 0.11}px ${SERIF}`;
      c.fillStyle = '#141210'; c.textAlign = 'center';
      c.fillText('keep it light', w * 0.5, h * 0.72);
    },
  },
  {
    key: 'soft', name: '暖时', note: '橙 · 单色印刷',
    draw: (c, w, h) => {
      c.fillStyle = '#F4571A'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#F5EDDF';
      c.beginPath(); c.arc(w * 0.5, h * 0.42, w * 0.26, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#F4571A'; c.lineWidth = w * 0.012;
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(w * 0.28, h * 0.405 + i * h * 0.028);
        c.bezierCurveTo(w * 0.4, h * 0.4 + i * h * 0.028, w * 0.6, h * 0.41 + i * h * 0.028, w * 0.72, h * 0.405 + i * h * 0.028);
        c.stroke();
      }
      c.fillStyle = '#F5EDDF';
      c.font = `italic 500 ${w * 0.13}px ${SERIF}`; c.textAlign = 'left';
      c.fillText('Soft Hours', w * 0.07, h * 0.86);
      c.font = `500 ${w * 0.03}px ${SANS}`; c.textAlign = 'right';
      c.fillText('08:12 — 18:40', w * 0.94, h * 0.1);
    },
  },
  {
    key: 'stock', name: '克重清单', note: '60 — 300 gsm',
    draw: (c, w, h) => {
      c.fillStyle = '#2A1D4C'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#D8CFF2';
      c.font = `500 ${w * 0.035}px ${SANS}`; c.textAlign = 'right';
      c.fillText('STOCK LIST', w * 0.93, h * 0.09);
      const gsm = ['60', '80', '90', '120', '160', '200', '300'];
      c.textAlign = 'left';
      gsm.forEach((g, i) => {
        c.fillStyle = i === gsm.length - 1 ? '#F3EFE3' : '#D8CFF2';
        c.font = `400 ${w * 0.115}px ${SERIF}`;
        c.fillText(`${g} gsm`, w * 0.1, h * 0.19 + i * h * 0.125);
      });
    },
  },
  {
    key: 'green', name: '墨绿', note: '专色 · 双面',
    draw: (c, w, h) => {
      c.fillStyle = '#12302A'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#7FD3B4';
      c.font = `600 ${w * 0.17}px ${SERIF}`; c.textAlign = 'left';
      c.fillText('Paper.', w * 0.08, h * 0.2);
      c.font = `500 ${w * 0.045}px ${SANS}`;
      c.fillText('每张纸都记得自己被折过。', w * 0.08, h * 0.3);
      c.font = `600 ${w * 0.17}px ${SERIF}`; c.textAlign = 'right';
      c.fillText('Holds.', w * 0.92, h * 0.82);
    },
  },
  {
    key: 'mm', name: '毫米制', note: 'LunaSol · 200×280×100',
    draw: (c, w, h) => {
      c.fillStyle = '#E8E5DB'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#14120E';
      c.font = `600 ${w * 0.115}px ${SANS}`; c.textAlign = 'left';
      c.fillText('LunaSol', w * 0.09, h * 0.2);
      c.fillStyle = '#F4571A';
      c.font = `500 ${w * 0.038}px ${SANS}`;
      c.fillText('PACKAGING STUDIO', w * 0.09, h * 0.25);
      c.fillStyle = '#14120E';
      const rows = [['正面', '200 × 280'], ['侧面', '100 × 280'], ['出血', '3 mm'], ['压线', '0.7 mm'], ['分辨率', '300 dpi']];
      rows.forEach((r, i) => {
        c.font = `400 ${w * 0.042}px ${SANS}`;
        c.fillText(r[0], w * 0.09, h * 0.45 + i * h * 0.095);
        c.textAlign = 'right';
        c.fillText(r[1], w * 0.91, h * 0.45 + i * h * 0.095);
        c.textAlign = 'left';
        c.fillStyle = '#B4AFA2';
        c.fillRect(w * 0.09, h * 0.472 + i * h * 0.095, w * 0.82, 1);
        c.fillStyle = '#14120E';
      });
    },
  },
];

/** 每张纸都要有一个稳定的随机种子：同一张纸每次看起来一样，八张之间不一样 */
/** 值噪声：随机取的四角插值，叠两个频率就得到不规则的皱 */
function vnoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  const xf = x - xi; const yf = y - yi;
  const h = (i: number, j: number) => {
    let n = (i * 374761393 + j * 668265263 + seed * 1013904223) | 0;
    n = (n ^ (n >> 13)) * 1274126177;
    n = n ^ (n >> 16);
    return ((n >>> 0) % 100000) / 100000;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  const u = sm(xf); const v = sm(yf);
  const a = h(xi, yi); const b = h(xi + 1, yi);
  const c = h(xi, yi + 1); const d = h(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function rndFactory(seed: number) {
  let s = seed || 1;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

function makeTexture(card: Card): HTMLCanvasElement {
  const w = 512;
  const h = 640;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.textBaseline = 'alphabetic';
  card.draw(c, w, h);
  return cv;
}

export default function HomeCarousel() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const nameRef = useRef(0);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};

    (async () => {
      const THREE = await import('three');
      if (disposed || !el) return;

      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      const STEP = (Math.PI * 2) / CARDS.length;
      const RADIUS = 10.2;
      const CW = 6.3;
      const CH = 7.9;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, el.clientWidth / el.clientHeight, 1, 200);
      // 卡片在半径 RADIUS 的圆上，镜头要再往外站一段才是真正的观看距离
      camera.position.set(0, 2.4, RADIUS + (window.innerWidth / window.innerHeight < 0.95 ? 26.5 : 20.4));
      camera.lookAt(0, 0.1, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);

      const hemi = new THREE.HemisphereLight(0xffffff, 0xb8b5ac, 1.55);
      scene.add(hemi);

      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(-8, 13, 11);
      scene.add(key);

      const fill = new THREE.DirectionalLight(0xe7ebf2, 0.55);
      fill.position.set(9, 3, 7);
      scene.add(fill);

      // 不铺真实地面：大平面接阴影会在画面里切出一条硬边界。
      // 每张纸下面垫一块径向渐隐的接触影，和参考里的柔影一致。
      const shadowCv = document.createElement('canvas');
      shadowCv.width = 256; shadowCv.height = 96;
      const s2d = shadowCv.getContext('2d')!;
      const sgrd = s2d.createRadialGradient(128, 48, 2, 128, 48, 126);
      sgrd.addColorStop(0, 'rgba(28,26,22,.55)');
      sgrd.addColorStop(0.45, 'rgba(28,26,22,.3)');
      sgrd.addColorStop(1, 'rgba(28,26,22,0)');
      s2d.fillStyle = sgrd;
      s2d.save(); s2d.translate(128, 48); s2d.scale(1, 0.34); s2d.translate(-128, -48);
      s2d.fillRect(0, 0, 256, 96); s2d.restore();
      const shadowTex = new THREE.CanvasTexture(shadowCv);
      const shadowMat = new THREE.MeshBasicMaterial({
        map: shadowTex, transparent: true, opacity: 0.26, depthWrite: false,
      });

      const group = new THREE.Group();
      group.position.y = 1.0;
      scene.add(group);

      const anim: { vel: number } = { vel: 0 };

      CARDS.forEach((card, i) => {
        const geo = new THREE.PlaneGeometry(CW, CH, 40, 48);
        const flat = geo.toNonIndexed();
        const rnd = rndFactory(i * 7919 + 13);

        // 两层值噪声：低频是大折痕，高频是纸纤维级的起皱；四角再轻微翘起
        const seed = i * 131 + 7;
        const pos = flat.attributes.position as any;
        for (let v = 0; v < pos.count; v++) {
          const x = pos.getX(v);
          const y = pos.getY(v);
          const u = x / CW + 0.5;
          const wv = y / CH + 0.5;
          const n1 = vnoise(u * 4.6, wv * 5.8, seed) - 0.5;
          const n2 = vnoise(u * 11.5, wv * 14.0, seed + 31) - 0.5;
          const n3 = vnoise(u * 24.0, wv * 29.0, seed + 77) - 0.5;
          // 一道斜向硬折痕：纸被对折过才会有的那条棱
          const ridge = 0.5 - Math.abs(vnoise((u * 0.7 + wv) * 2.1, seed + 41, seed + 3) - 0.5) * 3.2;
          let z = n1 * 0.52 + n2 * 0.2 + n3 * 0.06 + ridge * 0.16;
          // 中间微微鼓、四角往外翻：被手捏过的纸不会是一个平面
          z += (0.5 - Math.abs(wv - 0.5)) * 0.16 + (Math.abs(u - 0.5) * Math.abs(wv - 0.5)) * 0.5;
          pos.setZ(v, z * 0.6);
          pos.setX(v, x + vnoise(u * 6.2, wv * 7.1, seed + 5) * 0.1 - 0.05);
          pos.setY(v, y + vnoise(u * 7.3, wv * 6.4, seed + 9) * 0.1 - 0.05);
        }
        flat.computeVertexNormals();

        const tex = new THREE.CanvasTexture(makeTexture(card));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;

        const mat = new THREE.MeshStandardMaterial({
          map: tex, roughness: 0.94, metalness: 0, flatShading: true,
        });
        const mesh = new THREE.Mesh(flat, mat);
        const a = i * STEP;
        mesh.position.set(Math.sin(a) * RADIUS, 0, Math.cos(a) * RADIUS);
        mesh.rotation.y = a;
        mesh.rotation.z = (rnd() - 0.5) * 0.05;
        mesh.rotation.x = (rnd() - 0.5) * 0.04;
        group.add(mesh);

        // 接触影先不铺：远平面在低机位会连成一条横带

      });

      let angle = -STEP * 0.0;
      let dragging = false;
      let lastX = 0;
      const BASE = reduce ? 0 : 0.00055;

      const onDown = (e: PointerEvent) => {
        dragging = true;
        lastX = e.clientX;
        el.setPointerCapture?.(e.pointerId);
      };
      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        angle += dx * 0.0055;
        anim.vel = dx * 0.0055;
      };
      const onUp = () => { dragging = false; };
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      el.addEventListener('pointerleave', onUp);

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        angle += (e.deltaX + e.deltaY * 0.35) * 0.0016;
      };
      el.addEventListener('wheel', onWheel, { passive: false });

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft') angle += STEP * 0.25;
        if (e.key === 'ArrowRight') angle -= STEP * 0.25;
      };
      window.addEventListener('keydown', onKey);

      const clock = new THREE.Clock();
      const loop = () => {
        if (disposed) return;
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, clock.getDelta());
        if (!dragging) {
          angle += anim.vel + BASE * (dt / 0.016);
          anim.vel *= 0.945;
          if (Math.abs(anim.vel) < 0.0004) anim.vel = 0;
        }
        group.rotation.y = angle;

        const i = ((Math.round(-angle / STEP) % CARDS.length) + CARDS.length) % CARDS.length;
        if (i !== nameRef.current) {
          nameRef.current = i;
          setIdx(i);
        }
        renderer.render(scene, camera);
      };
      loop();

      const onResize = () => {
        if (!el) return;
        const w = el.clientWidth;
        const h = el.clientHeight;
        camera.aspect = w / h;
        camera.position.z = RADIUS + 20.4;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      cleanup = () => {
        window.removeEventListener('resize', onResize);
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.removeEventListener('pointerleave', onUp);
        el.removeEventListener('wheel', onWheel);
        window.removeEventListener('keydown', onKey);
        cancelAnimationFrame(raf);
        renderer.dispose();
        scene.traverse((o: any) => {
          o.geometry?.dispose?.();
          if (o.material) {
            o.material.map?.dispose?.();
            o.material.alphaMap?.dispose?.();
            o.material.dispose?.();
          }
        });
        if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement);
      };
    })();

    return () => { disposed = true; cleanup(); };
  }, []);

  // 手机版和桌面版共用同一套 DOM，只靠 CSS 换位置
  return <div className="cr-root">
    <div className="cr-canvas" ref={mountRef} tabIndex={0} role="region" aria-label="包装作品 · 3D 旋转展示" />
    <div className="cr-ledge" />

    <div className="cr-top">
      <a className="cr-logo" href="#/">Luna<b>Sol</b></a>
      <div className="cr-links">
        <a href="#/login">登录</a>
        <a className="cr-cta" href="#/studio">开始设计 →</a>
      </div>
    </div>

    <div className="cr-caption">
      <div className="cr-index">{String(idx + 1).padStart(2, '0')} <span>/ {String(CARDS.length).padStart(2, '0')}</span></div>
      <div className="cr-name">{CARDS[idx].name}</div>
      <div className="cr-note">{CARDS[idx].note}</div>
    </div>

    <div className="cr-hint">
      <span>拖动转动 · 每一张都能变成你的包装</span>
      <button className="cr-start" onClick={() => go('/studio')}>开始设计</button>
    </div>
  </div>;
}
