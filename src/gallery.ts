// Отладочная страница: контактный лист поз (/gallery.html?t=0.4&az=0.78)
import * as THREE from 'three';
import { SceneRuntime, makeCamera, applyView } from './engine/runtime';
import { ACTIONS as ALL } from './engine/poses';
import { DEFAULT_CAMERA } from './engine/evaluate';
import { NAVY, MAROON } from './engine/palette';
import type { Scene } from './types';

const params = new URLSearchParams(location.search);
const t = Number(params.get('t') ?? 0.4);
const az = Number(params.get('az') ?? Math.PI / 4);
const el = Number(params.get('el') ?? DEFAULT_CAMERA.elevation);
const variant = (params.get('v') ?? 'mix') as string;
const only = params.get('ids')?.split(',');
const ACTIONS = only ? ALL.filter((a) => only.includes(a.id)) : ALL;
const zoom = Number(params.get('z') ?? 3.4);
const cols = Number(params.get('cols') ?? 7), cw = Number(params.get('cw') ?? 228), ch = Number(params.get('ch') ?? 250);
const rows = Math.ceil(ACTIONS.length / cols);
const W = cols * cw, H = rows * ch;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const rt = new SceneRuntime();
const cam = makeCamera(cw / ch);
const scene: Scene = {
  id: 's', name: 's', duration: 10, background: '#fff', floor: '#fff', grid: true, transition: 'cut',
  actors: [], props: [], camera: { ...DEFAULT_CAMERA, azimuth: az, elevation: el, target: [0, 0.8, 0], zoom }, cameraKeys: [],
};
const label = document.createElement('div');
label.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;font:12px sans-serif';
document.body.appendChild(label);
ACTIONS.forEach((a, i) => {
  const r = Math.floor(i / cols), c = i % cols;
  const woman = variant === 'woman' || (variant === 'mix' && i % 2 === 1);
  scene.actors = [{
    id: 'a', name: 'a', variant: woman ? 'woman' : 'man', color: woman ? MAROON : NAVY,
    accessory: 'none', scale: 1, x: 0, y: 0, z: 0, ry: Math.PI / 4,
    keys: [], actions: [{ id: 'x', type: a.id, start: 0, duration: 100, speed: 1 }], autoWalk: true,
  }];
  rt.sync(scene, t, {});
  applyView(cam, scene.camera);
  const y = H - (r + 1) * ch;
  renderer.setViewport(c * cw, y, cw, ch);
  renderer.setScissor(c * cw, y, cw, ch);
  renderer.render(rt.scene, cam);
  const d = document.createElement('span');
  d.textContent = a.id;
  d.style.cssText = `position:absolute;left:${c * cw + 4}px;top:${r * ch + 4}px`;
  label.appendChild(d);
});
(window as any).__done = true;
