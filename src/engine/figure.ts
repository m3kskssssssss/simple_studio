import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { FigureVariant } from '../types';
import type { Pose } from './poses';

/** Размеры человечка (высота ≈ 1.8). */
export const DIM = {
  thigh: 0.38,
  shin: 0.38,
  hipH: 0.78,
  torsoH: 0.58,
  upper: 0.3,
  fore: 0.28,
  headR: 0.22,
};

export interface FigureRig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  shL: THREE.Group;
  elL: THREE.Group;
  shR: THREE.Group;
  elR: THREE.Group;
  hipL: THREE.Group;
  knL: THREE.Group;
  hipR: THREE.Group;
  knR: THREE.Group;
  skirt?: THREE.Object3D;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function rbox(w: number, h: number, d: number, r = 0.035): THREE.BufferGeometry {
  const key = `rb:${w}:${h}:${d}:${r}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 3, r);
    geoCache.set(key, g);
  }
  return g;
}
function sphere(r: number): THREE.BufferGeometry {
  const key = `sp:${r}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(r, 32, 24);
    geoCache.set(key, g);
  }
  return g;
}
/** Усечённая 4-гранная пирамида с гранями по осям: полуширины сверху/снизу, высота, глубина. */
function taper(key: string, top: number, bottom: number, h: number, depth: number, y0: number): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(top * Math.SQRT2, bottom * Math.SQRT2, h, 4, 1);
    g.rotateY(Math.PI / 4);
    g.scale(1, 1, depth);
    g.translate(0, y0 + h / 2, 0);
    g = g.toNonIndexed();
    g.computeVertexNormals();
    geoCache.set(key, g);
  }
  return g;
}
/** Лиф платья — от таза до плеч. */
const bodice = () => taper('bodice', 0.175, 0.215, DIM.torsoH + 0.02, 0.62, -0.02);
/** Юбка — висит от таза, при посадке ложится на бёдра. */
const skirt = () => taper('skirt', 0.215, 0.262, 0.25, 0.62, -0.25);

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function group(parent: THREE.Object3D, x = 0, y = 0, z = 0, order: THREE.EulerOrder = 'XYZ') {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.order = order;
  parent.add(g);
  return g;
}

export function createFigure(variant: FigureVariant, color: string): FigureRig {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0 });
  const woman = variant === 'woman';

  const root = new THREE.Group();
  const body = group(root);
  const hips = group(body, 0, DIM.hipH, 0);
  const torso = group(hips, 0, 0, 0, 'YXZ');
  // таз: связывает торс и бёдра при наклонах и посадке
  hips.add(mesh(rbox(woman ? 0.3 : 0.36, 0.2, woman ? 0.2 : 0.23, 0.06), mat, 0, 0.0, 0));

  let skirtObj: THREE.Object3D | undefined;
  if (woman) {
    torso.add(mesh(bodice(), mat));
    skirtObj = group(hips);
    skirtObj.add(mesh(skirt(), mat));
  } else {
    torso.add(mesh(rbox(0.42, DIM.torsoH + 0.04, 0.25, 0.05), mat, 0, DIM.torsoH / 2 - 0.02, 0));
  }

  // шея + голова
  const head = group(torso, 0, DIM.torsoH, 0, 'YXZ');
  head.add(mesh(rbox(0.1, 0.08, 0.1, 0.03), mat, 0, 0.01, 0));
  head.add(mesh(sphere(DIM.headR), mat, 0, DIM.headR + 0.02, 0.01));

  // руки
  const shX = woman ? 0.19 : 0.24;
  const armW = woman ? 0.09 : 0.1;
  const makeArm = (side: 1 | -1) => {
    // плечевой шар крепится к торсу и закрывает стык при любом повороте руки
    torso.add(mesh(sphere(armW / 2 + 0.012), mat, side * shX, DIM.torsoH - 0.07, 0));
    const sh = group(torso, side * shX, DIM.torsoH - 0.07, 0, 'XZY');
    sh.add(mesh(rbox(armW, DIM.upper + 0.02, armW, 0.035), mat, 0, -DIM.upper / 2, 0));
    const el = group(sh, 0, -DIM.upper, 0);
    el.add(mesh(sphere(armW / 2 - 0.002), mat));
    el.add(mesh(rbox(armW - 0.01, DIM.fore + 0.02, armW - 0.01, 0.035), mat, 0, -DIM.fore / 2, 0));
    el.add(mesh(sphere(0.058), mat, 0, -DIM.fore - 0.02, 0));
    return [sh, el] as const;
  };
  const [shL, elL] = makeArm(1);
  const [shR, elR] = makeArm(-1);

  // ноги
  const legW = woman ? 0.115 : 0.14;
  const legX = woman ? 0.085 : 0.095;
  const makeLeg = (side: 1 | -1) => {
    const hp = group(hips, side * legX, 0, 0, 'XZY');
    hp.add(mesh(sphere(legW / 2 + 0.005), mat));
    hp.add(mesh(rbox(legW, DIM.thigh + 0.02, legW + 0.01, 0.035), mat, 0, -DIM.thigh / 2, 0));
    const kn = group(hp, 0, -DIM.thigh, 0);
    kn.add(mesh(sphere(legW / 2), mat));
    kn.add(mesh(rbox(legW - 0.005, DIM.shin + 0.02, legW + 0.005, 0.035), mat, 0, -DIM.shin / 2 + 0.005, 0));
    return [hp, kn] as const;
  };
  const [hipL, knL] = makeLeg(1);
  const [hipR, knR] = makeLeg(-1);

  root.traverse((o) => (o.userData.isFigure = true));
  return { root, body, torso, head, shL, elL, shR, elR, hipL, knL, hipR, knR, skirt: skirtObj };
}

export function applyPose(rig: FigureRig, p: Pose) {
  rig.body.position.set(0, p.y, p.bz2);
  rig.body.rotation.set(p.bx, p.by, p.bz);
  rig.torso.rotation.set(p.tx, p.ty, p.tz);
  rig.head.rotation.set(p.hx, p.hy, p.hz);
  rig.shL.rotation.set(p.lsx, p.lsy, p.lsz);
  rig.elL.rotation.set(p.le, 0, 0);
  rig.shR.rotation.set(p.rsx, p.rsy, p.rsz);
  rig.elR.rotation.set(p.re, 0, 0);
  rig.hipL.rotation.set(p.lhx, p.lhy, p.lhz);
  rig.knL.rotation.set(p.lk, 0, 0);
  rig.hipR.rotation.set(p.rhx, p.rhy, p.rhz);
  rig.knR.rotation.set(p.rk, 0, 0);
  if (rig.skirt) {
    // юбка следует за средним наклоном бёдер вперёд
    const f = Math.min(Math.max(-(p.lhx + p.rhx) / 2 / (Math.PI / 2), 0), 1.3);
    rig.skirt.rotation.x = -f * 1.45;
    rig.skirt.scale.set(1 + 0.1 * f, 1 - 0.25 * Math.min(f, 1), 1);
  }
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose();
  });
}
