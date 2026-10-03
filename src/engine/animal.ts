import * as THREE from 'three';
import type { FigureVariant } from '../types';
import type { Pose } from './poses';
import { cached, cylinder, group, mesh, rbox, sphere, type FigureRig } from './figure';

/**
 * Четвероногие: кошка, собака, лошадь, олень.
 * Смотрят в +Z. Каналы позы переиспользуются так:
 *  - y, bx, by, bz, bz2 — корпус (ось наклона — у задних ног, поэтому bx < 0 = встать на дыбы);
 *  - tx/ty/tz — шея (tx > 0 — опустить голову), hx/hy/hz — голова относительно шеи;
 *  - lsx/lsz/le, rsx/rsz/re — передние ноги (плечо и «запястье», > 0 — сгиб назад);
 *  - lhx/lhz/lk, rhx/rhz/rk — задние ноги;
 *  - tw — хвост вбок, tl — хвост вверх, ear — уши, jaw — пасть.
 */

interface LegSpec { upper: number; lower: number; rTop: number; rMid: number; rBot: number }
interface Spec {
  legs: LegSpec;
  /** Высота плечевого сустава. */
  hipY: number;
  frontZ: number;
  backZ: number;
  legX: number;
  foot: 'paw' | 'hoof';
  body: { r: number; len: number; y: number; z: number; sx: number; sy: number };
  neck: { y: number; z: number; len: number; rTop: number; rBot: number; angle: number; sx: number };
  /** Наклон головы вниз от горизонтали, рад. */
  headPitch: number;
  tail: { y: number; z: number; n: number; len: number; r0: number; r1: number; lift: number; curl: number; hair?: boolean };
}

const SPECS: Record<string, Spec> = {
  cat: {
    legs: { upper: 0.1, lower: 0.1, rTop: 0.03, rMid: 0.022, rBot: 0.019 },
    hipY: 0.2, frontZ: 0.13, backZ: -0.12, legX: 0.048, foot: 'paw',
    body: { r: 0.082, len: 0.2, y: 0.235, z: 0.005, sx: 0.82, sy: 0.92 },
    neck: { y: 0.26, z: 0.14, len: 0.07, rTop: 0.042, rBot: 0.05, angle: 0.45, sx: 1 },
    headPitch: -0.1,
    tail: { y: 0.26, z: -0.17, n: 6, len: 0.045, r0: 0.019, r1: 0.013, lift: 0.25, curl: 0.24 },
  },
  dog: {
    legs: { upper: 0.22, lower: 0.2, rTop: 0.05, rMid: 0.036, rBot: 0.033 },
    hipY: 0.42, frontZ: 0.24, backZ: -0.2, legX: 0.085, foot: 'paw',
    body: { r: 0.14, len: 0.34, y: 0.47, z: 0.01, sx: 0.8, sy: 0.95 },
    neck: { y: 0.52, z: 0.27, len: 0.15, rTop: 0.065, rBot: 0.085, angle: 0.5, sx: 0.9 },
    headPitch: 0.05,
    tail: { y: 0.53, z: -0.29, n: 5, len: 0.065, r0: 0.026, r1: 0.014, lift: 0.85, curl: 0.12 },
  },
  horse: {
    legs: { upper: 0.52, lower: 0.48, rTop: 0.1, rMid: 0.055, rBot: 0.045 },
    hipY: 1.0, frontZ: 0.5, backZ: -0.48, legX: 0.17, foot: 'hoof',
    body: { r: 0.3, len: 0.8, y: 1.2, z: 0.0, sx: 0.78, sy: 1 },
    neck: { y: 1.32, z: 0.6, len: 0.72, rTop: 0.11, rBot: 0.19, angle: 0.62, sx: 0.72 },
    headPitch: 0.95,
    tail: { y: 1.36, z: -0.74, n: 6, len: 0.13, r0: 0.055, r1: 0.05, lift: -0.95, curl: -0.08, hair: true },
  },
  deer: {
    legs: { upper: 0.42, lower: 0.38, rTop: 0.065, rMid: 0.032, rBot: 0.026 },
    hipY: 0.8, frontZ: 0.36, backZ: -0.33, legX: 0.11, foot: 'hoof',
    body: { r: 0.19, len: 0.52, y: 0.95, z: 0.0, sx: 0.76, sy: 1 },
    neck: { y: 1.03, z: 0.42, len: 0.46, rTop: 0.06, rBot: 0.095, angle: 0.32, sx: 0.85 },
    headPitch: 0.55,
    tail: { y: 1.02, z: -0.5, n: 2, len: 0.05, r0: 0.04, r1: 0.03, lift: 0.4, curl: 0.2 },
  },
};

const HIND_HIP = -0.25;
const HIND_KNEE = 0.5;

const std = (color: string | THREE.Color, rough = 0.85, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });

/** Капсула вдоль Z. */
const capsuleZ = (r: number, len: number) =>
  cached(`capz:${r}:${len}`, () => new THREE.CapsuleGeometry(r, len, 10, 24).rotateX(Math.PI / 2));
const cone = (r: number, h: number, seg = 12) => cached(`cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg));

interface Ear { g: THREE.Group; rx: number; rz: number; kx: number; kz: number }

export function createAnimal(variant: FigureVariant, color: string): FigureRig {
  const sp = SPECS[variant] ?? SPECS.dog;
  const main = std(color);
  const light = std(new THREE.Color(color).lerp(new THREE.Color('#fff8ee'), variant === 'horse' ? 0.25 : 0.6));
  const dark = std('#1c1816', 0.6);
  const eyeM = std('#0d0d0f', 0.15);
  const hair = std(new THREE.Color(color).multiplyScalar(variant === 'horse' ? 0.35 : 0.75), 0.95);

  const root = new THREE.Group();
  // ось наклона корпуса — над задними ногами
  const body = group(root, 0, 0, sp.backZ);
  const trunk = group(body, 0, 0, -sp.backZ);

  // --- туловище ---
  const b = sp.body;
  const torsoM = mesh(capsuleZ(b.r, b.len), main, 0, b.y, b.z);
  torsoM.scale.set(b.sx, b.sy, 1);
  trunk.add(torsoM);
  if (variant === 'horse' || variant === 'deer') {
    // грудь и круп чуть объёмнее
    const chest = mesh(sphere(b.r * 0.98), main, 0, b.y - b.r * 0.08, b.z + b.len / 2 + b.r * 0.15);
    chest.scale.set(b.sx * 0.95, 1, 0.9);
    const rump = mesh(sphere(b.r * 1.02), main, 0, b.y + b.r * 0.05, b.z - b.len / 2 - b.r * 0.1);
    rump.scale.set(b.sx * 1.02, 1, 0.95);
    trunk.add(chest, rump);
  }
  if (variant === 'deer') {
    const patch = mesh(sphere(b.r * 0.7), light, 0, b.y + 0.02, b.z - b.len / 2 - b.r * 0.55);
    patch.scale.set(b.sx, 0.9, 0.5);
    trunk.add(patch);
  }
  if (variant === 'dog' || variant === 'cat') {
    const chest = mesh(sphere(b.r * 0.9), light, 0, b.y - b.r * 0.22, b.z + b.len / 2 + b.r * 0.15);
    chest.scale.set(b.sx * 0.9, 1, 0.75);
    trunk.add(chest);
  }

  // --- ноги ---
  const L = sp.legs;
  const hindY = sp.hipY * 0.969;
  const makeLeg = (x: number, z: number, hind: boolean) => {
    const hip = group(trunk, x, hind ? hindY : sp.hipY, z, 'XZY');
    const k = hind ? 1.25 : 1;
    hip.add(mesh(sphere(L.rTop * k), main));
    hip.add(mesh(cylinder(L.rTop * k, L.rMid, L.upper), main, 0, -L.upper / 2, 0));
    const knee = group(hip, 0, -L.upper, 0);
    knee.add(mesh(sphere(L.rMid * 1.02), main));
    knee.add(mesh(cylinder(L.rMid, L.rBot, L.lower), sp.foot === 'hoof' && variant === 'horse' ? main : main, 0, -L.lower / 2, 0));
    if (sp.foot === 'hoof') {
      knee.add(mesh(sphere(L.rBot * 1.25), main, 0, -L.lower + L.rBot * 1.6, 0));
      knee.add(mesh(cylinder(L.rBot * 1.15, L.rBot * 1.45, L.rBot * 2.2, 14), dark, 0, -L.lower + L.rBot * 0.5, 0.006));
    } else {
      const paw = mesh(sphere(L.rBot * 1.35), variant === 'cat' ? light : main, 0, -L.lower + L.rBot * 0.6, L.rBot * 0.5);
      paw.scale.set(1, 0.7, 1.35);
      knee.add(paw);
    }
    return [hip, knee] as const;
  };
  const [fl, flk] = makeLeg(sp.legX, sp.frontZ, false);
  const [fr, frk] = makeLeg(-sp.legX, sp.frontZ, false);
  const [bl, blk] = makeLeg(sp.legX * 1.05, sp.backZ, true);
  const [br, brk] = makeLeg(-sp.legX * 1.05, sp.backZ, true);

  // --- шея и голова ---
  const n = sp.neck;
  const neck = group(trunk, 0, n.y, n.z, 'YXZ');
  const neckM = mesh(cylinder(n.rTop, n.rBot, n.len + n.rBot * 0.6, 20), main, 0, n.len / 2 - n.rBot * 0.2, 0);
  neckM.scale.x = n.sx;
  neck.add(neckM);
  const head = group(neck, 0, n.len, 0, 'YXZ');
  const ears: Ear[] = [];
  let jaw: THREE.Group | undefined;
  const headBase = sp.headPitch - n.angle;

  const eyes = (x: number, y: number, z: number, r: number) => {
    for (const s of [-1, 1]) head.add(mesh(sphere(r), eyeM, s * x, y, z));
  };

  if (variant === 'cat') {
    const skull = mesh(sphere(0.074), main, 0, 0.02, 0.02);
    skull.scale.set(1.12, 0.95, 0.95);
    head.add(skull);
    const muzzle = mesh(sphere(0.034), light, 0, -0.008, 0.075);
    muzzle.scale.set(1.25, 0.85, 0.8);
    head.add(muzzle);
    head.add(mesh(sphere(0.011), std('#d98c8c', 0.5), 0, 0.012, 0.1));
    eyes(0.032, 0.03, 0.074, 0.012);
    for (const s of [-1, 1]) {
      const g = group(head, s * 0.045, 0.075, 0.0);
      g.add(mesh(cone(0.028, 0.06, 4), main, 0, 0.025, 0, 0, Math.PI / 4, 0));
      g.add(mesh(cone(0.016, 0.04, 4), std('#e8b0a8', 0.8), 0, 0.02, 0.006, 0, Math.PI / 4, 0));
      ears.push({ g, rx: -0.1, rz: -s * 0.3, kx: -0.8, kz: -s * 0.3 });
    }
    // усы
    const wh = std('#f4f1ea', 0.6);
    for (const s of [-1, 1]) for (const a of [-0.12, 0.08]) head.add(mesh(cylinder(0.0018, 0.0018, 0.09, 4), wh, s * 0.06, -0.008, 0.085, 0, 0, s * (Math.PI / 2 + a)));
  } else if (variant === 'dog') {
    const skull = mesh(sphere(0.1), main, 0, 0.03, 0);
    skull.scale.set(1, 0.95, 1.05);
    head.add(skull);
    head.add(mesh(rbox(0.1, 0.075, 0.14, 0.035), light, 0, -0.005, 0.1));
    head.add(mesh(sphere(0.024), dark, 0, 0.02, 0.17));
    jaw = group(head, 0, -0.03, 0.05);
    jaw.add(mesh(rbox(0.08, 0.03, 0.12, 0.014), light, 0, -0.012, 0.06));
    jaw.add(mesh(rbox(0.06, 0.006, 0.08, 0.003), std('#c45a5a', 0.6), 0, 0.004, 0.06));
    eyes(0.045, 0.06, 0.08, 0.016);
    const earM = std(new THREE.Color(color).multiplyScalar(0.7));
    for (const s of [-1, 1]) {
      const g = group(head, s * 0.085, 0.08, -0.01);
      g.add(mesh(rbox(0.03, 0.13, 0.08, 0.014), earM, s * 0.01, -0.06, 0));
      ears.push({ g, rx: 0, rz: s * 0.25, kx: 0, kz: s * 1.1 });
    }
  } else if (variant === 'horse') {
    head.add(mesh(rbox(0.21, 0.24, 0.26, 0.09), main, 0, 0.02, 0.04));
    const muzzle = mesh(rbox(0.17, 0.18, 0.36, 0.07), main, 0, -0.02, 0.28, 0.12, 0, 0);
    head.add(muzzle);
    head.add(mesh(rbox(0.175, 0.15, 0.1, 0.06), light, 0, -0.06, 0.44, 0.12, 0, 0));
    for (const s of [-1, 1]) head.add(mesh(sphere(0.018), dark, s * 0.05, -0.04, 0.49));
    jaw = group(head, 0, -0.11, 0.2);
    jaw.add(mesh(rbox(0.13, 0.05, 0.26, 0.025), main, 0, 0, 0.12, 0.12, 0, 0));
    eyes(0.105, 0.07, 0.09, 0.022);
    for (const s of [-1, 1]) {
      const g = group(head, s * 0.07, 0.13, -0.04);
      const e = mesh(cone(0.035, 0.12, 8), main, 0, 0.05, 0);
      e.scale.z = 0.6;
      g.add(e);
      ears.push({ g, rx: -0.15, rz: -s * 0.15, kx: -0.9, kz: -s * 0.4 });
    }
    // грива и чёлка
    const mane = mesh(rbox(0.06, n.len + 0.12, 0.12, 0.03), hair, 0, n.len / 2 + 0.02, -n.rTop * 0.85, 0.05, 0, 0);
    neck.add(mane);
    for (let i = 0; i < 4; i++) neck.add(mesh(rbox(0.07, 0.18, 0.05, 0.02), hair, (i % 2 ? 1 : -1) * 0.035, 0.1 + i * 0.17, -n.rTop * 1.25 - 0.04, -0.4, 0, (i % 2 ? 1 : -1) * 0.25));
    head.add(mesh(rbox(0.07, 0.16, 0.05, 0.02), hair, 0, 0.14, 0.13, 0.5, 0, 0));
  } else {
    // олень
    const skull = mesh(sphere(0.085), main, 0, 0.02, 0.0);
    skull.scale.set(0.95, 0.95, 1.05);
    head.add(skull);
    head.add(mesh(rbox(0.085, 0.085, 0.18, 0.04), main, 0, -0.01, 0.12, 0.1, 0, 0));
    head.add(mesh(rbox(0.075, 0.045, 0.06, 0.02), light, 0, -0.04, 0.17, 0.1, 0, 0));
    head.add(mesh(sphere(0.022), dark, 0, 0.0, 0.215));
    eyes(0.058, 0.04, 0.05, 0.015);
    for (const s of [-1, 1]) {
      const g = group(head, s * 0.06, 0.06, -0.03);
      const e = mesh(sphere(0.05), main, s * 0.05, 0.0, 0);
      e.scale.set(1.5, 0.45, 0.7);
      g.add(e);
      ears.push({ g, rx: 0, rz: s * 0.25, kx: -0.6, kz: s * 0.5 });
    }
    // рога: основной ствол и отростки
    const horn = std('#e9dcc2', 0.6);
    const tine = (parent: THREE.Object3D, len: number, r: number, rx: number, rz: number, x = 0, y = 0) => {
      const g = group(parent, x, y, 0);
      g.rotation.set(rx, 0, rz);
      g.add(mesh(cylinder(r * 0.6, r, len, 8), horn, 0, len / 2, 0));
      g.add(mesh(sphere(r * 0.6), horn, 0, len, 0));
      return g;
    };
    for (const s of [-1, 1]) {
      const a = tine(head, 0.2, 0.017, -0.45, -s * 0.55, s * 0.04, 0.08);
      const b2 = tine(a, 0.2, 0.014, 0.35, s * 0.25, 0, 0.19);
      tine(b2, 0.16, 0.011, 0.25, -s * 0.3, 0, 0.19);
      tine(a, 0.12, 0.011, 0.8, -s * 0.1, 0, 0.1);
      tine(b2, 0.12, 0.01, 0.9, s * 0.1, 0, 0.12);
    }
  }

  // --- хвост: цепочка звеньев, каждое сгибается чуть сильнее ---
  const t = sp.tail;
  const tailBase = group(trunk, 0, t.y, t.z, 'YXZ');
  const tailSegs: THREE.Group[] = [];
  let parent: THREE.Group = tailBase;
  for (let i = 0; i < t.n; i++) {
    const seg = group(parent, 0, i === 0 ? 0 : t.len, 0);
    const r0 = t.r0 + (t.r1 - t.r0) * (i / t.n);
    const r1 = t.r0 + (t.r1 - t.r0) * ((i + 1) / t.n);
    const m = t.hair ? hair : variant === 'deer' ? light : i === t.n - 1 && variant === 'dog' ? light : main;
    seg.add(mesh(cylinder(r1, r0, t.len * 1.05, 12), m, 0, t.len / 2, 0));
    seg.add(mesh(sphere(r1), m, 0, t.len, 0));
    tailSegs.push(seg);
    parent = seg;
  }

  const apply = (p: Pose) => {
    body.position.set(0, p.y, sp.backZ + p.bz2);
    body.rotation.set(p.bx, p.by, p.bz);
    neck.rotation.set(n.angle + p.tx, p.ty, p.tz);
    head.rotation.set(headBase + p.hx, p.hy, p.hz);
    fl.rotation.set(p.lsx, p.lsy, p.lsz);
    flk.rotation.x = p.le;
    fr.rotation.set(p.rsx, p.rsy, p.rsz);
    frk.rotation.x = p.re;
    bl.rotation.set(HIND_HIP + p.lhx, p.lhy, p.lhz);
    blk.rotation.x = HIND_KNEE + p.lk;
    br.rotation.set(HIND_HIP + p.rhx, p.rhy, p.rhz);
    brk.rotation.x = HIND_KNEE + p.rk;
    tailBase.rotation.set(-(Math.PI / 2 - t.lift - p.tl), p.tw, 0);
    for (let i = 1; i < tailSegs.length; i++) tailSegs[i].rotation.set(t.curl + p.tl * 0.12, 0, p.tw * 0.3);
    for (const e of ears) e.g.rotation.set(e.rx + e.kx * p.ear, 0, e.rz + e.kz * p.ear);
    if (jaw) jaw.rotation.x = p.jaw;
  };

  return { root, kind: 'quad', apply: (p) => apply(p) };
}

/** Габариты для поз: высота сустава и длина ноги. */
export function quadSpec(variant: FigureVariant) {
  const s = SPECS[variant] ?? SPECS.dog;
  return {
    hipY: s.hipY,
    hindY: s.hipY * 0.969,
    leg: s.legs.upper + s.legs.lower,
    /** Расстояние между передними и задними суставами. */
    len: s.frontZ - s.backZ,
    /** Высота низа туловища. */
    belly: s.body.y - s.body.r * s.body.sy,
    paw: s.legs.rBot,
  };
}
