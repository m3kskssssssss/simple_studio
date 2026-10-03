// Отладочная страница: контактный лист поз (/gallery.html?t=0.4&az=0.78)
import * as THREE from 'three';
import { PROPS } from './engine/props';
import { propThumb } from './engine/thumbs';
import { SceneRuntime, makeCamera, applyView } from './engine/runtime';
import { ACTIONS as ALL } from './engine/poses';
import { DEFAULT_CAMERA } from './engine/evaluate';
import { NAVY, MAROON } from './engine/palette';
import type { FigureVariant, Scene } from './types';
import { variantDef } from './engine/variants';
import { actionFits } from './engine/poses';

const params = new URLSearchParams(location.search);

// props=all|кат — листы превью декораций
if (params.has('props')) {
  const want = params.get('props');
  const list = PROPS.filter((p) => want === 'all' || (p.cat ?? 'Дом') === want || want!.split(',').includes(p.kind));
  document.body.style.cssText = 'margin:0;display:flex;flex-wrap:wrap;font:11px sans-serif;background:#fff';
  for (const p of list) {
    const d = document.createElement('div');
    d.style.cssText = 'width:200px;text-align:center';
    d.innerHTML = `<img src="${propThumb(p.kind)}" width=192 height=192><br>${p.kind}`;
    document.body.appendChild(d);
  }
  (window as any).__done = true;
  throw new Error('props sheet');
}
const t = Number(params.get('t') ?? 0.4);
const az = Number(params.get('az') ?? Math.PI / 4);
const el = Number(params.get('el') ?? DEFAULT_CAMERA.elevation);
const variant = (params.get('v') ?? 'mix') as string;
const only = params.get('ids')?.split(',');
// vs=cat:6:0.2,dog — вариант[:зум[:высота цели]]
const vsRaw = params.get('vs')?.split(',').map((x) => x.split(':'));
const vs = vsRaw?.map((x) => x[0] as FigureVariant);
const act1 = params.get('a');
const ACTIONS0 = (only ? ALL.filter((a) => only.includes(a.id)) : ALL).filter((a) => variant === 'mix' || actionFits(a, variant as FigureVariant));
const zoom = Number(params.get('z') ?? 3.4);
const cols = Number(params.get('cols') ?? 7), cw = Number(params.get('cw') ?? 228), ch = Number(params.get('ch') ?? 250);
// vs=cat,dog — строка вариантов в одной анимации (a=...) или в покое
const ACTIONS = vs ? vs.map((v) => ({ id: act1 ?? '', v })) : ACTIONS0.map((a) => ({ id: a.id, v: undefined as FigureVariant | undefined }));
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
  actors: [], props: [], camera: { ...DEFAULT_CAMERA, azimuth: az, elevation: el, target: [0, Number(params.get('ty') ?? 0.8), 0], zoom }, cameraKeys: [],
};
const label = document.createElement('div');
label.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;font:12px sans-serif';
document.body.appendChild(label);
ACTIONS.forEach((a, i) => {
  const r = Math.floor(i / cols), c = i % cols;
  const vv = a.v ?? ((variant === 'mix' ? (i % 2 ? 'woman' : 'man') : variant) as FigureVariant);
  scene.actors = [{
    id: 'a', name: 'a', variant: vv, color: vv === 'man' ? NAVY : vv === 'woman' ? MAROON : variantDef(vv).color,
    accessory: 'none', scale: 1, x: 0, y: 0, z: 0, ry: Math.PI / 4,
    keys: [], actions: a.id ? [{ id: 'x', type: a.id, start: 0, duration: 100, speed: 1 }] : [], autoWalk: true,
  }];
  const cell = vsRaw?.[i];
  scene.camera = { ...scene.camera, zoom: cell?.[1] ? +cell[1] : zoom, target: [0, cell?.[2] ? +cell[2] : Number(params.get('ty') ?? 0.8), 0] };
  rt.sync(scene, t, {});
  applyView(cam, scene.camera);
  const y = H - (r + 1) * ch;
  renderer.setViewport(c * cw, y, cw, ch);
  renderer.setScissor(c * cw, y, cw, ch);
  renderer.render(rt.scene, cam);
  const d = document.createElement('span');
  d.textContent = a.id || a.v || '';
  d.style.cssText = `position:absolute;left:${c * cw + 4}px;top:${r * ch + 4}px`;
  label.appendChild(d);
});
(window as any).__done = true;
