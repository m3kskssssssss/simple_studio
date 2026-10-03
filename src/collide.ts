import * as THREE from 'three';
import type { Actor, Prop, Scene } from './types';
import { PROP_MAP } from './engine/props';
import { evaluateActor, evaluateProp } from './engine/evaluate';

/**
 * Проверка сцены на пересечения во времени: люди, машины и «твёрдые» декорации.
 * Используется отладочной страницей /check.html и при разработке шаблонов.
 */

/** По этим предметам можно ходить и ездить. */
const FLAT = new Set(['road', 'crosswalk', 'sidewalk', 'parking', 'rug', 'towel', 'pizza', 'phone', 'books', 'laptop', 'headphones', 'mug']);
/** На этом можно сидеть/лежать — сидящий персонаж с ним не сталкивается. */
const SEATS = new Set(['bench', 'chair', 'sofa', 'bus_stop', 'bed', 'beanbag']);
const SIT_ACTIONS = new Set(['sit_floor', 'sit_hug', 'sit_lean', 'sit_chair', 'lie', 'kneel']);

const R_ACTOR = 0.26;

interface Box2 { cx: number; cz: number; hx: number; hz: number }
interface OBB extends Box2 { rot: number }

const rectCache = new Map<string, Box2[]>();
const hullCache = new Map<string, Box2>();

/** Прямоугольники «ног» модели у земли (локальные координаты). */
function groundRects(kind: string): Box2[] {
  let r = rectCache.get(kind);
  if (r) return r;
  const def = PROP_MAP[kind];
  const obj = def.build(def.color);
  obj.updateMatrixWorld(true);
  r = [];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const b = new THREE.Box3().setFromObject(m);
    if (b.min.y > 1.1 || b.max.y < 0.06) return; // высоко над головой или плоское
    r!.push({ cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2, hx: (b.max.x - b.min.x) / 2, hz: (b.max.z - b.min.z) / 2 });
  });
  rectCache.set(kind, r);
  return r;
}

/** Общий габарит модели (для машин). */
function hull(kind: string): Box2 {
  let h = hullCache.get(kind);
  if (h) return h;
  const def = PROP_MAP[kind];
  const obj = def.build(def.color);
  const b = new THREE.Box3().setFromObject(obj);
  // зеркала не считаем
  h = { cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2, hx: (b.max.x - b.min.x) / 2 - 0.08, hz: (b.max.z - b.min.z) / 2 };
  hullCache.set(kind, h);
  return h;
}

function place(b: Box2, x: number, z: number, ry: number, s: number): OBB {
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  const lx = b.cx * s;
  const lz = b.cz * s;
  return { cx: x + lx * c + lz * sn, cz: z - lx * sn + lz * c, hx: b.hx * s, hz: b.hz * s, rot: ry };
}

function axes(o: OBB): [number, number][] {
  const c = Math.cos(o.rot);
  const s = Math.sin(o.rot);
  return [[c, -s], [s, c]];
}

function circleHits(px: number, pz: number, r: number, o: OBB) {
  const [u, v] = axes(o);
  const dx = px - o.cx;
  const dz = pz - o.cz;
  const lx = dx * u[0] + dz * u[1];
  const lz = dx * v[0] + dz * v[1];
  const qx = Math.max(-o.hx, Math.min(o.hx, lx));
  const qz = Math.max(-o.hz, Math.min(o.hz, lz));
  return Math.hypot(lx - qx, lz - qz) < r;
}

function obbHits(a: OBB, b: OBB) {
  const ax = axes(a);
  const bx = axes(b);
  const dx = b.cx - a.cx;
  const dz = b.cz - a.cz;
  for (const n of [...ax, ...bx]) {
    const proj = (o: OBB, ox: [number, number][]) => o.hx * Math.abs(ox[0][0] * n[0] + ox[0][1] * n[1]) + o.hz * Math.abs(ox[1][0] * n[0] + ox[1][1] * n[1]);
    if (Math.abs(dx * n[0] + dz * n[1]) > proj(a, ax) + proj(b, bx)) return false;
  }
  return true;
}

export interface Hit {
  t: number;
  a: string;
  b: string;
}

const nameOf = (p: Prop) => `${PROP_MAP[p.kind]?.label ?? p.kind}#${p.id.slice(0, 3)}`;

function sitting(a: Actor, t: number) {
  return a.actions.some((c) => t >= c.start && t < c.start + c.duration && SIT_ACTIONS.has(c.type));
}

/** Все пересечения в сцене (первое время для каждой пары). */
export function checkScene(s: Scene, step = 0.05): Hit[] {
  const hits = new Map<string, Hit>();
  const hit = (t: number, a: string, b: string) => {
    const k = a < b ? a + '|' + b : b + '|' + a;
    if (!hits.has(k)) hits.set(k, { t: Math.round(t * 100) / 100, a, b });
  };
  const vehicles = s.props.filter((p) => PROP_MAP[p.kind]?.vehicle);
  const solids = s.props.filter((p) => PROP_MAP[p.kind] && !PROP_MAP[p.kind].vehicle && !FLAT.has(p.kind));
  const solidRects = solids.map((p) => ({ p, rects: groundRects(p.kind).map((r) => place(r, p.x, p.z, p.ry, p.scale)) }));

  for (let t = 0; t < s.duration - 1e-6; t += step) {
    const cars = vehicles.map((p) => {
      const st = evaluateProp(p, t, true);
      return { p, o: place(hull(p.kind), st.x, st.z, st.ry, p.scale) };
    });
    const people = s.actors.map((a) => ({ a, st: evaluateActor(a, t), sit: sitting(a, t) }));

    // машины
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) if (obbHits(cars[i].o, cars[j].o)) hit(t, nameOf(cars[i].p), nameOf(cars[j].p));
      for (const sr of solidRects) if (sr.rects.some((r) => obbHits(cars[i].o, r))) hit(t, nameOf(cars[i].p), nameOf(sr.p));
    }
    // люди
    for (let i = 0; i < people.length; i++) {
      const P = people[i];
      const r = R_ACTOR * P.a.scale;
      for (let j = i + 1; j < people.length; j++) {
        const Q = people[j];
        if (Math.hypot(P.st.x - Q.st.x, P.st.z - Q.st.z) < r + R_ACTOR * Q.a.scale) hit(t, P.a.name, Q.a.name);
      }
      for (const c of cars) if (circleHits(P.st.x, P.st.z, r, c.o)) hit(t, P.a.name, nameOf(c.p));
      for (const sr of solidRects) {
        if (P.sit && SEATS.has(sr.p.kind)) continue;
        if (sr.rects.some((o) => circleHits(P.st.x, P.st.z, r, o))) hit(t, P.a.name, nameOf(sr.p));
      }
    }
  }
  return [...hits.values()].sort((a, b) => a.t - b.t);
}
