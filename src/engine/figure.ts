import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { FigureVariant } from '../types';
import type { Pose } from './poses';
import { rigOf, type RigKind } from './variants';
import { createAnimal } from './animal';

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

/** Собранная модель: корень и функция, раскладывающая позу по суставам. */
export interface FigureRig {
  root: THREE.Group;
  kind: RigKind;
  /** odo — пройденный путь, м (для колёс коляски). */
  apply: (p: Pose, odo: number) => void;
}

// ---------- кэш геометрии (общий для всех персонажей, не освобождается) ----------

const geoCache = new Map<string, THREE.BufferGeometry>();
export function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
export const rbox = (w: number, h: number, d: number, r = 0.035) =>
  cached(`rb:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * 0.999));
export const sphere = (r: number) => cached(`sp:${r}`, () => new THREE.SphereGeometry(r, 32, 24));
export const cylinder = (rt: number, rb: number, h: number, seg = 18) => cached(`cy:${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const torus = (r: number, t: number, arc = Math.PI * 2, seg = 40) => cached(`to:${r}:${t}:${arc}:${seg}`, () => new THREE.TorusGeometry(r, t, 10, seg, arc));

/** Усечённая 4-гранная пирамида с гранями по осям: полуширины сверху/снизу, высота, глубина. */
function taper(key: string, top: number, bottom: number, h: number, depth: number, y0: number): THREE.BufferGeometry {
  return cached(key, () => {
    let g: THREE.BufferGeometry = new THREE.CylinderGeometry(top * Math.SQRT2, bottom * Math.SQRT2, h, 4, 1);
    g.rotateY(Math.PI / 4);
    g.scale(1, 1, depth);
    g.translate(0, y0 + h / 2, 0);
    g = g.toNonIndexed();
    g.computeVertexNormals();
    return g;
  });
}
/** Лиф платья — от таза до плеч. */
const bodice = () => taper('bodice', 0.175, 0.215, DIM.torsoH + 0.02, 0.62, -0.02);
/** Юбка — висит от таза, при посадке ложится на бёдра. */
const skirt = (long: boolean) => (long ? taper('skirtL', 0.215, 0.275, 0.4, 0.62, -0.4) : taper('skirt', 0.215, 0.262, 0.25, 0.62, -0.25));

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function group(parent: THREE.Object3D, x = 0, y = 0, z = 0, order: THREE.EulerOrder = 'XYZ') {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.order = order;
  parent.add(g);
  return g;
}

const std = (color: string | THREE.Color, rough = 0.82, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const shade = (c: string, k: number) => new THREE.Color(c).multiplyScalar(k);

export function createFigure(variant: FigureVariant, color: string): FigureRig {
  const rig = rigOf(variant) === 'quad' ? createAnimal(variant, color) : createHuman(variant, color);
  rig.root.traverse((o) => (o.userData.isFigure = true));
  return rig;
}

// ---------- люди ----------

const _q = new THREE.Quaternion();
const _qRoot = new THREE.Quaternion();
const _qId = new THREE.Quaternion();

const WHEEL_R = 0.3;
const CASTER_R = 0.07;

function createHuman(variant: FigureVariant, color: string): FigureRig {
  const robot = variant === 'robot';
  const fat = variant === 'fat';
  const tall = variant === 'tall';
  const chair = variant === 'wheelchair';
  const old = variant === 'oldman' || variant === 'oldwoman';
  const woman = variant === 'woman' || variant === 'oldwoman';

  const mat = robot ? std(color, 0.32, { metalness: 0.65 }) : std(color);
  const joint = robot ? std('#2b3038', 0.45, { metalness: 0.5 }) : mat;

  const root = new THREE.Group();
  // base — то, что наклоняется целиком (коляска вместе с седоком), с осью на задних колёсах
  const base = group(root, 0, chair ? WHEEL_R : 0, chair ? -0.06 : 0, 'YXZ');
  const inner = group(base, 0, chair ? -WHEEL_R : 0, chair ? 0.06 : 0);
  if (tall) inner.scale.setScalar(1.13);
  const body = group(inner);
  const hips = group(body, 0, DIM.hipH, 0);
  const torso = group(hips, 0, 0, 0, 'YXZ');

  // --- таз и торс ---
  const hipW = fat ? 0.46 : woman ? 0.3 : tall ? 0.32 : robot ? 0.34 : 0.36;
  hips.add(mesh(rbox(hipW, robot ? 0.16 : 0.2, fat ? 0.3 : woman ? 0.2 : 0.23, 0.06), robot ? joint : mat));

  let skirtObj: THREE.Object3D | undefined;
  if (woman) {
    torso.add(mesh(bodice(), mat));
    skirtObj = group(hips);
    skirtObj.add(mesh(skirt(old), mat));
  } else if (fat) {
    torso.add(mesh(rbox(0.54, DIM.torsoH + 0.06, 0.34, 0.14), mat, 0, DIM.torsoH / 2 - 0.02, 0));
    const belly = mesh(sphere(0.25), mat, 0, 0.2, 0.06);
    belly.scale.set(1.04, 0.92, 0.92);
    torso.add(belly);
  } else if (robot) {
    torso.add(mesh(rbox(0.2, 0.16, 0.16, 0.04), joint, 0, 0.06, 0));
    torso.add(mesh(rbox(0.46, 0.44, 0.28, 0.07), mat, 0, 0.34, 0));
    torso.add(mesh(rbox(0.26, 0.16, 0.03, 0.02), joint, 0, 0.36, 0.14));
    const led = std('#7ff3ff', 0.3, { emissive: '#3fd8ff', emissiveIntensity: 1.6 });
    const red = std('#ff9a7a', 0.3, { emissive: '#ff4d2e', emissiveIntensity: 1.4 });
    torso.add(mesh(sphere(0.022), led, -0.07, 0.38, 0.155), mesh(sphere(0.022), red, 0, 0.38, 0.155), mesh(sphere(0.022), led, 0.07, 0.38, 0.155));
    for (let i = 0; i < 3; i++) torso.add(mesh(rbox(0.16, 0.012, 0.01, 0.004), joint, 0, 0.18 + i * 0.03, 0.142));
  } else {
    torso.add(mesh(rbox(tall ? 0.38 : 0.42, DIM.torsoH + 0.04, tall ? 0.22 : 0.25, 0.05), mat, 0, DIM.torsoH / 2 - 0.02, 0));
  }

  // --- шея и голова ---
  const head = group(torso, 0, DIM.torsoH, 0, 'YXZ');
  const hy = DIM.headR + 0.02;
  if (robot) {
    head.add(mesh(cylinder(0.05, 0.06, 0.1), joint, 0, 0.03, 0));
    head.add(mesh(rbox(0.36, 0.3, 0.32, 0.08), mat, 0, 0.2, 0.01));
    head.add(mesh(rbox(0.3, 0.11, 0.04, 0.04), std('#11151b', 0.15, { metalness: 0.3 }), 0, 0.22, 0.16));
    const eye = std('#aef9ff', 0.2, { emissive: '#35e0ff', emissiveIntensity: 2.2 });
    head.add(mesh(rbox(0.07, 0.035, 0.02, 0.012), eye, -0.07, 0.22, 0.18), mesh(rbox(0.07, 0.035, 0.02, 0.012), eye, 0.07, 0.22, 0.18));
    for (const s of [-1, 1]) head.add(mesh(cylinder(0.06, 0.06, 0.04), joint, s * 0.19, 0.2, 0, 0, 0, Math.PI / 2));
    head.add(mesh(cylinder(0.008, 0.008, 0.16, 8), joint, 0.08, 0.42, -0.04));
    head.add(mesh(sphere(0.026), std('#ffd0c4', 0.3, { emissive: '#ff5533', emissiveIntensity: 1.8 }), 0.08, 0.5, -0.04));
  } else {
    head.add(mesh(rbox(fat ? 0.14 : 0.1, 0.08, fat ? 0.14 : 0.1, 0.03), mat, 0, 0.01, 0));
    head.add(mesh(sphere(fat ? 0.23 : DIM.headR), mat, 0, hy, 0.01));
  }
  if (old) {
    // очки
    const frame = std('#1d1d1f', 0.4);
    for (const s of [-1, 1]) head.add(mesh(torus(0.042, 0.007), frame, s * 0.075, hy + 0.02, DIM.headR - 0.005));
    head.add(mesh(cylinder(0.006, 0.006, 0.06, 6), frame, 0, hy + 0.025, DIM.headR + 0.005, 0, 0, Math.PI / 2));
  }
  if (variant === 'oldman') {
    const capM = std(shade(color, 0.62), 0.9);
    const cap = mesh(sphere(0.228), capM, 0, hy + 0.06, -0.005);
    cap.scale.set(1, 0.52, 1.04);
    head.add(cap);
    head.add(mesh(rbox(0.24, 0.022, 0.11, 0.01), capM, 0, hy + 0.08, 0.22, 0.18, 0, 0));
    head.add(mesh(rbox(0.13, 0.032, 0.04, 0.014), std('#e6e6e6', 0.9), 0, hy - 0.075, DIM.headR - 0.01));
  }
  if (variant === 'oldwoman') {
    const hair = std('#d2d2d6', 0.9);
    const cap = mesh(sphere(0.232), hair, 0, hy + 0.03, -0.03);
    cap.scale.set(1, 0.84, 0.98);
    head.add(cap);
    head.add(mesh(sphere(0.085), hair, 0, hy + 0.17, -0.15));
  }

  // --- руки ---
  const shX = fat ? 0.3 : woman ? 0.19 : tall ? 0.22 : robot ? 0.27 : 0.24;
  const armW = fat ? 0.125 : woman ? 0.09 : tall ? 0.088 : robot ? 0.1 : 0.1;
  const makeArm = (side: 1 | -1) => {
    // плечевой шар крепится к торсу и закрывает стык при любом повороте руки
    torso.add(mesh(sphere(armW / 2 + (robot ? 0.03 : 0.012)), joint, side * shX, DIM.torsoH - 0.07, 0));
    const sh = group(torso, side * shX, DIM.torsoH - 0.07, 0, 'XZY');
    const el = group(sh, 0, -DIM.upper, 0);
    if (robot) {
      sh.add(mesh(cylinder(0.042, 0.038, DIM.upper - 0.02), mat, 0, -DIM.upper / 2, 0));
      el.add(mesh(sphere(0.052), joint));
      el.add(mesh(cylinder(0.038, 0.034, DIM.fore - 0.02), mat, 0, -DIM.fore / 2, 0));
      el.add(mesh(rbox(0.075, 0.09, 0.06, 0.02), joint, 0, -DIM.fore - 0.03, 0));
    } else {
      sh.add(mesh(rbox(armW, DIM.upper + 0.02, armW, 0.035), mat, 0, -DIM.upper / 2, 0));
      el.add(mesh(sphere(armW / 2 - 0.002), mat));
      el.add(mesh(rbox(armW - 0.01, DIM.fore + 0.02, armW - 0.01, 0.035), mat, 0, -DIM.fore / 2, 0));
      el.add(mesh(sphere(fat ? 0.066 : 0.058), mat, 0, -DIM.fore - 0.02, 0));
    }
    return [sh, el] as const;
  };
  const [shL, elL] = makeArm(1);
  const [shR, elR] = makeArm(-1);

  // --- ноги ---
  const legW = fat ? 0.17 : woman ? 0.115 : tall ? 0.125 : 0.14;
  const legX = fat ? 0.12 : woman ? 0.085 : 0.095;
  const makeLeg = (side: 1 | -1) => {
    const hp = group(hips, side * legX, 0, 0, 'XZY');
    const kn = group(hp, 0, -DIM.thigh, 0);
    if (robot) {
      hp.add(mesh(sphere(0.07), joint));
      hp.add(mesh(cylinder(0.055, 0.048, DIM.thigh - 0.04), mat, 0, -DIM.thigh / 2, 0));
      kn.add(mesh(sphere(0.06), joint));
      kn.add(mesh(cylinder(0.048, 0.055, DIM.shin - 0.06), mat, 0, -DIM.shin / 2 + 0.01, 0));
      kn.add(mesh(rbox(0.14, 0.07, 0.22, 0.03), joint, 0, -DIM.shin + 0.03, 0.035));
    } else {
      hp.add(mesh(sphere(legW / 2 + 0.005), mat));
      hp.add(mesh(rbox(legW, DIM.thigh + 0.02, legW + 0.01, 0.035), mat, 0, -DIM.thigh / 2, 0));
      kn.add(mesh(sphere(legW / 2), mat));
      kn.add(mesh(rbox(legW - 0.005, DIM.shin + 0.02, legW + 0.005, 0.035), mat, 0, -DIM.shin / 2 + 0.005, 0));
    }
    return [hp, kn] as const;
  };
  const [hipL, knL] = makeLeg(1);
  const [hipR, knR] = makeLeg(-1);

  // --- аксессуары, которые держат «вертикаль» ---
  let cane: THREE.Group | undefined;
  if (variant === 'oldman') {
    cane = group(elR, 0, -DIM.fore - 0.03, 0.01);
    const wood = std('#4a3326', 0.55);
    cane.add(mesh(cylinder(0.014, 0.014, 0.82, 10), wood, 0, -0.41, 0));
    cane.add(mesh(torus(0.05, 0.014, Math.PI, 16), wood, 0, 0, 0.05, 0, Math.PI / 2, 0));
    cane.add(mesh(cylinder(0.018, 0.018, 0.035, 10), std('#151515', 0.9), 0, -0.81, 0));
  }
  let bag: THREE.Group | undefined;
  if (variant === 'oldwoman') {
    bag = group(elL, 0.0, -0.06, 0.0);
    const leather = std('#3a2b25', 0.5);
    bag.add(mesh(torus(0.07, 0.008, Math.PI, 16), leather, 0.06, -0.07, 0, 0, Math.PI / 2, 0));
    bag.add(mesh(rbox(0.09, 0.17, 0.22, 0.03), leather, 0.06, -0.15, 0));
    bag.add(mesh(rbox(0.095, 0.03, 0.08, 0.01), std('#c9a84a', 0.3, { metalness: 0.6 }), 0.06, -0.075, 0));
  }

  // --- коляска ---
  const wheels: { g: THREE.Object3D; side: number; r: number }[] = [];
  if (chair) buildWheelchair(inner, wheels);

  const apply = (p: Pose, odo: number) => {
    base.rotation.set(p.rx, p.ry2, 0);
    body.position.set(0, p.y, p.bz2);
    body.rotation.set(p.bx, p.by, p.bz);
    torso.rotation.set(p.tx, p.ty, p.tz);
    head.rotation.set(p.hx, p.hy, p.hz);
    shL.rotation.set(p.lsx, p.lsy, p.lsz);
    elL.rotation.set(p.le, 0, 0);
    shR.rotation.set(p.rsx, p.rsy, p.rsz);
    elR.rotation.set(p.re, 0, 0);
    hipL.rotation.set(p.lhx, p.lhy, p.lhz);
    knL.rotation.set(p.lk, 0, 0);
    hipR.rotation.set(p.rhx, p.rhy, p.rhz);
    knR.rotation.set(p.rk, 0, 0);
    if (skirtObj) {
      // юбка следует за средним наклоном бёдер вперёд
      const f = Math.min(Math.max(-(p.lhx + p.rhx) / 2 / (Math.PI / 2), 0), 1.3);
      skirtObj.rotation.x = -f * (old ? 1.2 : 1.45);
      skirtObj.scale.set(1 + 0.1 * f, 1 - (old ? 0.45 : 0.25) * Math.min(f, 1), 1);
    }
    // трость и сумка висят отвесно, как бы ни двигалась рука
    if (cane || bag) {
      root.updateMatrixWorld(true);
      root.getWorldQuaternion(_qRoot);
      if (cane) {
        cane.quaternion.identity();
        cane.quaternion.copy(elR.getWorldQuaternion(_q).invert().multiply(_qRoot));
        if (p.grip) cane.quaternion.slerp(_qId.set(0, 0, 0, 1), p.grip);
      }
      if (bag) bag.quaternion.copy(elL.getWorldQuaternion(_q).invert().multiply(_qRoot));
    }
    for (const w of wheels) w.g.rotation.x = odo / w.r + p.whl + w.side * p.wd * (WHEEL_R / w.r);
  };

  return { root, kind: 'human', apply };
}

function buildWheelchair(g: THREE.Group, wheels: { g: THREE.Object3D; side: number; r: number }[]) {
  const frame = std('#4b5058', 0.3, { metalness: 0.7 });
  const cloth = std('#24272d', 0.9);
  const rubber = std('#141414', 0.85);
  const chrome = std('#c9cdd3', 0.2, { metalness: 0.9 });

  // сиденье и спинка
  g.add(mesh(rbox(0.46, 0.05, 0.44, 0.02), cloth, 0, 0.355, 0.04));
  g.add(mesh(rbox(0.44, 0.4, 0.035, 0.015), cloth, 0, 0.64, -0.21, -0.08, 0, 0));
  for (const s of [-1, 1]) {
    const x = s * 0.235;
    g.add(mesh(cylinder(0.014, 0.014, 0.62), frame, x, 0.62, -0.225, -0.08, 0, 0));
    g.add(mesh(cylinder(0.016, 0.016, 0.12), frame, x, 0.92, -0.29, Math.PI / 2 + 0.25, 0, 0));
    g.add(mesh(cylinder(0.021, 0.021, 0.08), rubber, x, 0.905, -0.345, Math.PI / 2 + 0.25, 0, 0));
    // боковая рама: сиденье → вилка переднего колеса → подножка
    g.add(mesh(cylinder(0.014, 0.014, 0.5), frame, x, 0.33, 0.04, Math.PI / 2, 0, 0));
    g.add(mesh(cylinder(0.014, 0.014, 0.26), frame, s * 0.225, 0.22, 0.32, -0.25, 0, 0));
    g.add(mesh(cylinder(0.012, 0.012, 0.3), frame, s * 0.16, 0.2, 0.37, 0.5, 0, 0));
    // переднее колёсико
    const cf = group(g, s * 0.215, CASTER_R, 0.33);
    cf.add(mesh(cylinder(CASTER_R, CASTER_R, 0.035, 18), rubber, 0, 0, 0, 0, 0, Math.PI / 2));
    cf.add(mesh(cylinder(0.03, 0.03, 0.04, 12), chrome, 0, 0, 0, 0, 0, Math.PI / 2));
    wheels.push({ g: cf, side: s, r: CASTER_R });
    g.add(mesh(rbox(0.012, 0.09, 0.05, 0.005), frame, s * 0.24, CASTER_R + 0.05, 0.33));
    // большое колесо: шина, обод, спицы, ободок для рук
    const w = group(g, s * 0.31, WHEEL_R, -0.06);
    w.add(mesh(torus(WHEEL_R - 0.018, 0.02, Math.PI * 2, 48), rubber, 0, 0, 0, 0, Math.PI / 2, 0));
    w.add(mesh(torus(WHEEL_R - 0.04, 0.007, Math.PI * 2, 48), chrome, 0, 0, 0, 0, Math.PI / 2, 0));
    w.add(mesh(torus(WHEEL_R - 0.045, 0.008, Math.PI * 2, 48), chrome, s * 0.035, 0, 0, 0, Math.PI / 2, 0));
    for (let k = 0; k < 6; k++) w.add(mesh(cylinder(0.004, 0.004, (WHEEL_R - 0.04) * 2, 5), chrome, 0, 0, 0, (k / 6) * Math.PI, 0, 0));
    w.add(mesh(cylinder(0.035, 0.035, 0.06, 16), frame, 0, 0, 0, 0, 0, Math.PI / 2));
    wheels.push({ g: w, side: s, r: WHEEL_R });
  }
  g.add(mesh(cylinder(0.012, 0.012, 0.62), frame, 0, WHEEL_R, -0.06, 0, 0, Math.PI / 2));
  // подножка
  g.add(mesh(rbox(0.34, 0.022, 0.13, 0.01), frame, 0, 0.045, 0.44));
}

/** Разложить позу по суставам модели. */
export function applyPose(rig: FigureRig, p: Pose, odo = 0) {
  rig.apply(p, odo);
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose();
  });
}
