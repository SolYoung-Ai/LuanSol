/* 3D 预览 Agent：基于真实包装结构生成多部件模型，并把每个面的平面稿独立映射上去。
 * 不是"把一张图贴在立方体上"：插舌盒有可开合翻盖、天地盖有上下两件、抽屉盒可抽拉、标签贴在瓶身曲面。 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import type { DesignDoc, FaceId, StructureId } from '../types';
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
}

function faceTexture(design: DesignDoc | null, id: FaceId, fallback: string): THREE.Texture {
  const face = design?.faces[id];
  if (!face) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d')!; ctx.fillStyle = fallback; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const t = new THREE.TextureLoader().load(svgToDataUrl(faceSvg(face)));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
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
    const r = Math.max(20, L * 0.42), bodyH = Math.max(90, H * 1.15);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, bodyH, 64),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(plain), roughness: 0.35, metalness: 0.05 }));
    body.castShadow = true; g.add(body);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r, 16, 64),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(plain), roughness: 0.35 }));
    shoulder.position.y = bodyH / 2 + 8; g.add(shoulder);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.47, r * 0.47, 24, 64),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(primary), roughness: 0.5 }));
    cap.position.y = bodyH / 2 + 28; cap.castShadow = true; g.add(cap);
    const theta = p.structure === 'labelRound' ? Math.PI * 2 : Math.PI * 1.35;
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(r + 0.8, r + 0.8, Math.min(bodyH * 0.62, W * 1.6), 64, 1, true, -theta / 2, theta),
      new THREE.MeshStandardMaterial({ map: tex('front'), roughness: p.material === 'gloss' ? 0.3 : 0.8, side: THREE.DoubleSide }),
    );
    label.position.y = -bodyH * 0.06; g.add(label);
    g.position.y = 0;
  } else if (p.structure === 'topBottom') {
    const baseH = H * 0.72, lidH = H * 0.3;
    const base = box(L, baseH, W, -baseH / 2);
    g.add(base);
    const lid = box(L + 3, lidH, W + 3, baseH / 2 + (p.open ? 42 : lidH / 2));
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
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-140, 70, -110);
    scene.add(ambient, key, fill);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.ShadowMaterial({ opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -70; ground.receiveShadow = true;
    scene.add(ground);
    const group = new THREE.Group(); scene.add(group);
    const eng: Engine = { renderer, scene, camera, group, key, ambient, rot: { x: -0.08, y: -0.42 }, auto: false, raf: 0 };
    engine.current = eng;

    const resize = () => {
      const w = host.clientWidth || 600, h = host.clientHeight || 480;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
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
    const wheel = (e: WheelEvent) => { e.preventDefault(); camera.position.z = Math.max(130, Math.min(560, camera.position.z + e.deltaY * 0.25)); };
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
  }, [props.design, props.structure, props.size.l, props.size.w, props.size.h, props.open, props.material]);

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
