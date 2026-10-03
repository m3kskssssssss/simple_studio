import * as THREE from 'three';
import { PROP_MAP } from './props';
import { applyPose, createFigure, disposeObject } from './figure';
import { restPose } from './evaluate';
import type { FigureVariant } from '../types';

/**
 * Превью моделей для библиотеки: один offscreen-рендерер снимает объект
 * в изометрии на светлом фоне и кэширует картинку (dataURL).
 */
const SIZE = 192;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let cam: THREE.OrthographicCamera;
let sun: THREE.DirectionalLight;
let floor: THREE.Mesh;
const cache = new Map<string, string>();

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9e9e9');
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9c9c9', 1.5));
  const fill = new THREE.DirectionalLight('#ffffff', 0.7);
  fill.position.set(6, 5, 8);
  scene.add(fill);
  sun = new THREE.DirectionalLight('#ffffff', 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.ShadowMaterial({ opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
}

function shoot(obj: THREE.Object3D): string {
  if (!renderer) init();
  scene.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  // проекция углов бокса на экран изометрической камеры → подбор масштаба
  const dir = new THREE.Vector3(1, Math.tan(Math.atan(1 / Math.SQRT2)) * Math.SQRT2, 1).normalize();
  cam.position.copy(center).addScaledVector(dir, 30);
  cam.lookAt(center);
  cam.updateMatrixWorld();
  const inv = cam.matrixWorldInverse;
  let half = 0.01;
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
        half = Math.max(half, Math.abs(p.x), Math.abs(p.y));
      }
  half *= 1.12;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.updateProjectionMatrix();
  const r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 1);
  sun.position.set(center.x + 2.5 * r, 10 * r, center.z - 6 * r);
  sun.target.position.set(center.x, 0, center.z);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -2 * r;
  sc.right = sc.top = 2 * r;
  sc.near = 0.1;
  sc.far = 30 * r;
  sc.updateProjectionMatrix();
  renderer!.render(scene, cam);
  const url = renderer!.domElement.toDataURL('image/png');
  scene.remove(obj);
  return url;
}

export function propThumb(kind: string, color?: string | null): string {
  const def = PROP_MAP[kind];
  if (!def) return '';
  const c = color ?? def.color;
  const key = `p:${kind}:${c}`;
  let url = cache.get(key);
  if (!url) {
    const obj = def.build(c);
    obj.rotation.y = kind === 'tv' || kind === 'sofa' ? -0.3 : 0;
    url = shoot(obj);
    disposeObject(obj);
    obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    cache.set(key, url);
  }
  return url;
}

export function figureThumb(variant: FigureVariant, color: string): string {
  const key = `f:${variant}:${color}`;
  let url = cache.get(key);
  if (!url) {
    const rig = createFigure(variant, color);
    // животных — в профиль, людей — лицом
    rig.root.rotation.y = Math.PI / 4 + (rig.kind === 'quad' ? 1.15 : 0);
    applyPose(rig, restPose(variant, 0.8));
    url = shoot(rig.root);
    disposeObject(rig.root);
    cache.set(key, url);
  }
  return url;
}

/** Мини-сцена из нескольких декораций (для шаблонов). */
export function groupThumb(key: string, items: { kind: string; x: number; z: number; ry?: number; color?: string | null }[]): string {
  let url = cache.get('g:' + key);
  if (!url) {
    const g = new THREE.Group();
    for (const it of items) {
      const def = PROP_MAP[it.kind];
      if (!def) continue;
      const o = def.build(it.color ?? def.color);
      o.position.set(it.x, 0, it.z);
      o.rotation.y = it.ry ?? 0;
      g.add(o);
    }
    if (!items.length) g.add(new THREE.Mesh(new THREE.BoxGeometry(2, 0.001, 2), new THREE.MeshBasicMaterial({ visible: false })));
    url = shoot(g);
    disposeObject(g);
    g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    cache.set('g:' + key, url);
  }
  return url;
}
