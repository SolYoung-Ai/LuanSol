/* 3D 预览 Agent：基于真实包装结构生成多部件模型，并把每个面的平面稿独立映射上去。
 * 不是"把一张图贴在立方体上"：插舌盒有可开合翻盖、天地盖有上下两件、抽屉盒可抽拉、标签贴在瓶身曲面。 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import type { DesignDoc, Face, FaceId, StructureId, Dieline } from '../types';
import { faceSvg } from '../engine/design';
import { mockupSvg } from '../engine/export';
import { svgToDataUrl } from '../engine/utils';

export interface Viewer3DHandle { capture: () => string }
export type MaterialKind = 'matte' | 'gloss' | 'kraft';
export type BgKind = 'light' | 'warm' | 'dark';

interface Props {
  design: DesignDoc | null;
  structure: StructureId;
  size: { l: number; w: number; h: number };
  open: boolean;
  material: MaterialKind;
  background: BgKind;
  light: number;
  autoRotate: boolean;
  /** 真实刀模：3D 的墙高、面尺寸从这里读，不再按 size 猜 */
  dieline?: Dieline | null;
}

interface Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  key: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  rot: { x: number; y: number };
  auto: boolean;
  raf: number;
  ground: THREE.Mesh;
  fit: number;
}

/* SVG 作为图片加载时不允许再拉外部资源：项目里保存的是 CloudBase 素材 URL，
 * 直接塞进 <image href> 会变成碎图标。先 fetch 成 data URL 再生成贴图。
 * 素材服务器返回 access-control-allow-origin: *，且只用于屏幕预览，不导出。 */
const inlineCache = new Map<string, Promise<string>>();
function inlineImage(src: string): Promise<string> {
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return Promise.resolve(src);
  if (!inlineCache.has(src)) {
    inlineCache.set(src, (async () => {
      try {
        const res = await fetch(src, { mode: 'cors' });
        if (!res.ok) return src;
        const blob = await res.blob();
        return await new Promise<string>((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result || src));
          fr.onerror = () => resolve(src);
          fr.readAsDataURL(blob);
        });
      } catch { return src; }
    })());
  }
  return inlineCache.get(src)!;
}

async function inlineFaceImages(face: Face): Promise<Face> {
  const layers = await Promise.all(face.layers.map(async (l) => (
    l.type === 'image' && l.src ? { ...l, src: await inlineImage(l.src) } : l
  )));
  return { ...face, layers };
}

/* 贴图按长边 1024 重画一次：直接把 SVG 交给 TextureLoader，浏览器按毫米尺寸光栅化（140mm 只有 140px），
 * 放到 3D 里就是糊的。这里先画到 canvas 再当贴图，文字和细线才看得清。 */
function faceTexture(design: DesignDoc | null, id: FaceId, fallback: string): THREE.Texture {
  const face = design?.faces[id];
  if (!face) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d')!; ctx.fillStyle = fallback; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const long = 1024;
  const ratio = face.h / Math.max(1, face.w);
  const cw = ratio >= 1 ? long : Math.max(256, Math.round(long / ratio));
  const ch = ratio >= 1 ? Math.max(256, Math.round(long * ratio)) : long;
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const img = new Image();
  img.onload = () => { c.getContext('2d')!.drawImage(img, 0, 0, cw, ch); t.needsUpdate = true; URL.revokeObjectURL(img.src); };
  img.onerror = () => { URL.revokeObjectURL(img.src); };
  /* 素材转 data URL 后整段 SVG 可能有数 MB，再用 encodeURIComponent 拼 data:image/svg+xml 会超过浏览器上限，
   * 结果整张画布保持透明黑。Blob URL 没有长度限制，且同源，能稳定解码。 */
  void inlineFaceImages(face).then((ready) => { img.src = URL.createObjectURL(new Blob([faceSvg(ready)], { type: 'image/svg+xml' })); });
  return t;
}

function mat(map: THREE.Texture, kind: MaterialKind): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map, roughness: kind === 'gloss' ? 0.24 : kind === 'kraft' ? 0.95 : 0.72,
    metalness: kind === 'gloss' ? 0.08 : 0,
    color: kind === 'kraft' ? new THREE.Color('#efe2c8') : new THREE.Color('#ffffff'),
    side: THREE.DoubleSide,
  });
}

function disposeGroup(g: THREE.Group) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const x of mats) { const mm = x as THREE.MeshStandardMaterial; if (mm.map) mm.map.dispose(); mm.dispose(); }
  });
}

function buildModel(p: Props): THREE.Group {
  const g = new THREE.Group();
  const plain = p.design?.palette.bg || '#f3eee4';
  const primary = p.design?.palette.primary || '#20463a';
  const scale = 120 / Math.max(p.size.l, p.size.w, p.size.h, 1);
  const L = p.size.l * scale, W = p.size.w * scale, H = p.size.h * scale;
  const tex = (id: FaceId) => faceTexture(p.design, id, plain);
  const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(primary), roughness: 0.8, side: THREE.DoubleSide });
  const bottom = new THREE.MeshStandardMaterial({ color: new THREE.Color(plain), roughness: 0.9, side: THREE.DoubleSide });

  const box = (l: number, h: number, w: number, y = 0, frontTex = true) => {
    const maps: THREE.Material[] = [
      mat(tex('right'), p.material), mat(tex('left'), p.material), mat(tex('top'), p.material),
      bottom, frontTex ? mat(tex('front'), p.material) : side, mat(tex('back'), p.material),
    ];
    const m = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), maps);
    m.position.y = y; m.castShadow = true; m.receiveShadow = true;
    return m;
  };

  if (p.structure === 'labelRect' || p.structure === 'labelRound') {
    /* 标签按真实尺寸包上去：弧长 = 面宽，高度 = 面高。
     * 瓶身半径由标签宽度反算，保证包裹角 ≤ 360°；不再把高度压到 bodyH*0.94 造成比例失真。 */
    const fw = (p.design?.faces.front?.w || p.size.l) * scale;
    const fh = (p.design?.faces.front?.h || p.size.w * 0.9) * scale;
    const minR = fw / (Math.PI * 2) + 0.4;
    const r = Math.max(12, L * 0.42, minR);
    const bodyH = Math.max(70, fh * 1.35, H);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, bodyH, 64),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(plain), roughness: 0.35, metalness: 0.05 }));
    body.castShadow = true; g.add(body);
    const shoulderH = bodyH * 0.13, capH = bodyH * 0.19;
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.52, r, shoulderH, 64),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(plain), roughness: 0.35 }));
    shoulder.position.y = bodyH / 2 + shoulderH / 2; g.add(shoulder);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.54, r * 0.54, capH, 64),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(primary), roughness: 0.5 }));
    cap.position.y = bodyH / 2 + shoulderH + capH / 2; cap.castShadow = true; g.add(cap);

    if (p.structure === 'labelRound') {
      // 圆标是平面贴纸：按真实直径贴在盖面，不环绕瓶身
      const rad = Math.min(fw, fh) / 2;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(rad, 64),
        new THREE.MeshStandardMaterial({ map: tex('front'), roughness: p.material === 'gloss' ? 0.3 : 0.8, side: THREE.DoubleSide }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = bodyH / 2 + shoulderH + capH + 0.25;
      g.add(disc);
    } else {
      const theta = Math.min(Math.PI * 2, Math.max(0.6, fw / r));
      const label = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.8, r + 0.8, fh, 96, 1, true, -theta / 2, theta),
        new THREE.MeshStandardMaterial({ map: tex('front'), roughness: p.material === 'gloss' ? 0.3 : 0.8, side: THREE.DoubleSide }),
      );
      label.position.y = -bodyH * 0.02; g.add(label);
    }
    g.position.y = 0;
  } else if (p.structure === 'topBottom') {
    // 直接读刀模真实面板：底墙/盖墙/底盒外尺寸/盖盒外尺寸，不用比例猜
    const baseSheet = p.dieline?.sheets.find((s) => s.id === 'tb-base');
    const lidSheet = p.dieline?.sheets.find((s) => s.id === 'tb-lid');
    const baseFront = baseSheet?.rects.find((r) => r.face === 'front');
    const baseTop = baseSheet?.rects.find((r) => r.label === '底盒·主面');
    const lidTop = lidSheet?.rects.find((r) => r.face === 'top');
    const lidFront = lidSheet?.rects.find((r) => r.face === 'front');
    const baseH = (baseFront?.h || p.size.h * 0.7) * scale;
    const lidH = (lidFront?.h || p.size.h * 0.3) * scale;
    const baseL = (baseFront?.w || p.size.l) * scale;
    const baseW = (baseTop?.h || p.size.w) * scale;
    const lidL = (lidTop?.w || p.size.l + 2.4) * scale;
    const lidW = (lidTop?.h || p.size.w + 2.4) * scale;
    const base = box(baseL, baseH, baseW, -baseH / 2);
    g.add(base);
    const lid = box(lidL, lidH, lidW, baseH / 2 + (p.open ? 42 : lidH / 2));
    lid.name = 'lid'; g.add(lid);
  } else if (p.structure === 'drawer') {
    const inner = box(L - 5, H * 0.86, W - 5, 0);
    inner.name = 'inner';
    inner.position.z = p.open ? W * 0.72 : 0;
    g.add(inner);
    const sleeve = box(L + 4, H, W + 3, 0, false);
    const mats = sleeve.material as THREE.Material[];
    mats.forEach((m) => { const mm = m as THREE.MeshStandardMaterial; mm.transparent = true; mm.opacity = 0.42; });
    sleeve.name = 'sleeve'; g.add(sleeve);
  } else if (p.structure === 'pouch') {
    const front = box(L, H, Math.max(12, W * 0.6), 0);
    g.add(front);
    const gusset = new THREE.Mesh(new THREE.BoxGeometry(L, 8, W), side);
    gusset.position.y = -H / 2 - 4; gusset.castShadow = true; g.add(gusset);
    const seal = new THREE.Mesh(new THREE.BoxGeometry(L, 7, 3), side);
    seal.position.y = H / 2 + 3; g.add(seal);
  } else {
    // 插舌盒：盒身 + 独立可开合顶盖
    g.add(box(L, H, W, 0));
    const pivot = new THREE.Group();
    pivot.name = 'flapPivot';
    pivot.position.set(0, H / 2, -W / 2);
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(L, W), mat(tex('top'), p.material));
    flap.rotation.x = -Math.PI / 2;
    flap.position.set(0, 0.4, W / 2);
    flap.castShadow = true;
    pivot.add(flap);
    pivot.rotation.x = p.open ? -0.95 : 0;
    g.add(pivot);
  }

  const bb = new THREE.Box3().setFromObject(g);
  g.position.y -= (bb.min.y + bb.max.y) / 2;
  return g;
}


/* 取景：按包围盒算相机距离，保证上下左右都留余量；地面贴到模型最底部，避免穿模。 */
function fitView(camera: THREE.PerspectiveCamera, group: THREE.Group, ground: THREE.Mesh): number {
  const bb = new THREE.Box3().setFromObject(group);
  const dim = bb.getSize(new THREE.Vector3());
  const fov = (camera.fov * Math.PI) / 180;
  const aspect = Math.max(0.3, camera.aspect || 1);
  const needV = (dim.y / 2) / Math.tan(fov / 2);
  const needH = (dim.x / 2) / Math.tan(fov / 2) / aspect;
  const radius = Math.max(dim.x, dim.z) * 0.5;
  const fit = Math.max(80, Math.round(Math.max(needV, needH, radius / Math.tan(fov / 2)) * 1.55));
  camera.position.set(0, dim.y * 0.16, fit);
  camera.lookAt(0, 0, 0);
  ground.position.y = bb.min.y - 1.5;
  return fit;
}

/** 先探测 WebGL，避免在无 GPU / 禁用 WebGL 的环境里让 three.js 抛出控制台错误。 */
function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch { return false; }
}

const Viewer3D = forwardRef<Viewer3DHandle, Props>((props, ref) => {
  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const propsRef = useRef(props);
  const [webglFailed, setWebglFailed] = useState(false);
  propsRef.current = props;

  useImperativeHandle(ref, () => ({ capture: () => engine.current?.renderer.domElement.toDataURL('image/png') || '' }), []);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    if (!webglAvailable()) { setWebglFailed(true); return; }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    } catch {
      setWebglFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f7f6f2');
    const camera = new THREE.PerspectiveCamera(34, 1, 1, 2000);
    camera.position.set(0, 46, 270);
    camera.lookAt(0, 0, 0);
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(120, 190, 170); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    /* 默认平行光的阴影相机只有 ±5 个单位，模型高 120 → 地面只收到一小块投影（屏幕上那块莫名其妙的四边形）。 */
    key.shadow.camera.left = -180; key.shadow.camera.right = 180;
    key.shadow.camera.top = 180; key.shadow.camera.bottom = -180;
    key.shadow.camera.near = 1; key.shadow.camera.far = 900;
    key.shadow.camera.updateProjectionMatrix();
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-140, 70, -110);
    scene.add(ambient, key, fill);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.ShadowMaterial({ opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -70; ground.receiveShadow = true;
    scene.add(ground);
    const group = new THREE.Group(); scene.add(group);
    const eng: Engine = { renderer, scene, camera, group, key, ambient, rot: { x: -0.08, y: -0.42 }, auto: false, raf: 0, ground, fit: 270 };
    engine.current = eng;

    const resize = () => {
      const w = host.clientWidth || 600, h = host.clientHeight || 480;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      if (eng) eng.fit = fitView(camera, eng.group, ground);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(host);

    let dragging = false, px = 0, py = 0;
    const el = renderer.domElement;
    const down = (e: PointerEvent) => { dragging = true; px = e.clientX; py = e.clientY; el.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      eng.rot.y += (e.clientX - px) * 0.008;
      eng.rot.x = Math.max(-0.65, Math.min(0.65, eng.rot.x + (e.clientY - py) * 0.005));
      px = e.clientX; py = e.clientY;
    };
    const up = () => { dragging = false; };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const lo = Math.max(60, eng.fit * 0.55), hi = Math.min(900, eng.fit * 2.4);
      camera.position.z = Math.max(lo, Math.min(hi, camera.position.z + e.deltaY * 0.25 * (eng.fit / 270)));
    };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });

    const tick = () => {
      eng.raf = requestAnimationFrame(tick);
      if (eng.auto && !dragging) eng.rot.y += 0.0035;
      eng.group.rotation.set(eng.rot.x, eng.rot.y, 0);
      renderer.render(scene, camera);
    };
    tick();
    return () => {
      cancelAnimationFrame(eng.raf); ro.disconnect();
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('wheel', wheel);
      disposeGroup(eng.group); renderer.dispose(); el.remove(); engine.current = null;
    };
  }, []);

  // 结构 / 设计稿 / 尺寸 / 开合 / 材质变化 → 重建模型（贴图与设计稿同步）
  useEffect(() => {
    const e = engine.current; if (!e) return;
    const old = e.group;
    const next = buildModel(props);
    e.scene.remove(old); disposeGroup(old);
    e.scene.add(next); e.group = next;

    /* 模型归一化到长边 120，但高瘦瓶在固定相机距离下会顶出画面，这里每次重建都重新取景。 */
    e.fit = fitView(e.camera, next, e.ground);
    e.renderer.render(e.scene, e.camera);
  }, [props.design, props.structure, props.size.l, props.size.w, props.size.h, props.open, props.material, props.dieline]);

  // 背景 / 光照 / 自动旋转（无需重建模型）
  useEffect(() => {
    const e = engine.current; if (!e) return;
    e.scene.background = new THREE.Color({ light: '#f7f6f2', warm: '#efe9dd', dark: '#1e1e1c' }[props.background]);
    e.key.intensity = 1.15 * props.light; e.ambient.intensity = 0.85 * props.light;
    e.auto = props.autoRotate;
  }, [props.background, props.light, props.autoRotate]);

  return <div ref={mount} className="viewer3d">
    {webglFailed && <div className="webgl-fallback">
      <img src={props.design ? svgToDataUrl(mockupSvg(props.design)) : ''} alt="包装立体效果图（2D 降级预览）" />
      <p>当前浏览器未启用 WebGL，已切换为 2D 立体效果图预览。平面稿与印刷文件不受影响。</p>
    </div>}
  </div>;
});
Viewer3D.displayName = 'Viewer3D';
export default Viewer3D;
