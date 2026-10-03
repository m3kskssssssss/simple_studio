import type { Actor, CameraView, MoveKey, Project, Prop, Scene } from '../types';
import type { FigureVariant } from '../types';
import { ACTION_MAP, CANE_R, actionFits, armR, idlePose, lerpPose, walkPose, wheelPushArms, type Pose } from './poses';
import { quadGait, quadIdle } from './animalPoses';
import { quadSpec } from './animal';
import { rigOf } from './variants';

export const DEFAULT_CAMERA: CameraView = {
  target: [0, 0.6, 0],
  azimuth: Math.PI / 4,
  elevation: Math.atan(1 / Math.SQRT2), // классическая изометрия ≈ 35.26°
  distance: 40,
  zoom: 1,
};

// ---------- время проекта ----------

export function totalDuration(p: Project) {
  return p.scenes.reduce((s, sc) => s + sc.duration, 0);
}

export function sceneStart(p: Project, id: string) {
  let t = 0;
  for (const s of p.scenes) {
    if (s.id === id) return t;
    t += s.duration;
  }
  return 0;
}

export interface SceneAt {
  scene: Scene;
  index: number;
  start: number;
  local: number;
}

/** Заглушка для проекта без сцен: пустой белый кадр нулевой длины. */
export const EMPTY_SCENE: Scene = Object.freeze({
  id: '__empty__',
  name: 'Нет сцен',
  duration: 0,
  background: '#ffffff',
  floor: '#ffffff',
  grid: true,
  transition: 'cut',
  actors: [],
  props: [],
  camera: DEFAULT_CAMERA,
  cameraKeys: [],
}) as Scene;

export function sceneAt(p: Project, t: number): SceneAt {
  let start = 0;
  for (let i = 0; i < p.scenes.length; i++) {
    const s = p.scenes[i];
    if (t < start + s.duration || i === p.scenes.length - 1) {
      return { scene: s, index: i, start, local: Math.min(Math.max(t - start, 0), s.duration) };
    }
    start += s.duration;
  }
  return { scene: EMPTY_SCENE, index: -1, start: 0, local: 0 };
}

// ---------- математика ----------

export const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
export const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
export function lerpAngle(a: number, b: number, w: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * w;
}

// ---------- персонаж ----------

export interface ActorState {
  x: number;
  y: number;
  z: number;
  ry: number;
  pose: Pose;
  /** Пройденный путь, м (колёса коляски). */
  odo: number;
}

const BLEND = 0.35;
const MOVE_EPS = 0.05;

interface Motion {
  x: number;
  y: number;
  z: number;
  ry: number;
  /** 0..1 — насколько персонаж «идёт» (для плавного перехода в шаг). */
  moving: number;
  speed: number;
  /** Пройденный путь в текущем сегменте (для фазы шага). */
  walked: number;
}

interface Keyed {
  keys?: MoveKey[];
  x: number;
  y: number;
  z: number;
  ry: number;
}

/**
 * Положение объекта с ключами движения в момент t.
 * face — поворачиваться по ходу; ease — плавный разгон/торможение в каждом отрезке (транспорт).
 */
function motionAt(a: Keyed, t: number, face: boolean, ease = false): Motion & { odo: number } {
  const keys = a.keys ?? [];
  if (keys.length === 0) return { x: a.x, y: a.y, z: a.z, ry: a.ry, moving: 0, speed: 0, walked: 0, odo: 0 };
  // пройденный путь до отрезка i — для вращения колёс
  const odoBefore = (i: number) => {
    let d = 0;
    for (let j = 0; j < i; j++) d += Math.hypot(keys[j + 1].x - keys[j].x, keys[j + 1].z - keys[j].z);
    return d;
  };
  if (t <= keys[0].t || keys.length === 1) {
    const k = keys[0];
    return { x: k.x, y: k.y, z: k.z, ry: k.ry, moving: 0, speed: 0, walked: 0, odo: 0 };
  }
  const last = keys[keys.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y, z: last.z, ry: last.ry, moving: 0, speed: 0, walked: 0, odo: odoBefore(keys.length - 1) };

  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const dt = Math.max(k1.t - k0.t, 1e-4);
  const lin = (t - k0.t) / dt;
  const w = ease ? smooth(lin) : lin;
  const dx = k1.x - k0.x;
  const dz = k1.z - k0.z;
  const dist = Math.hypot(dx, dz);
  const speed = dist / dt;
  const x = k0.x + dx * w;
  const z = k0.z + dz * w;
  const y = k0.y + (k1.y - k0.y) * w;
  let ry = lerpAngle(k0.ry, k1.ry, smooth(w));
  let moving = 0;
  if (face && speed > MOVE_EPS) {
    const ramp = Math.min(0.25, dt / 3);
    moving = smooth(Math.min(t - k0.t, k1.t - t) / ramp);
    const dir = Math.atan2(dx, dz);
    ry = lerpAngle(ry, dir, moving);
  }
  return { x, y, z, ry, moving, speed, walked: dist * w, odo: odoBefore(i) + dist * w };
}

export interface PropState {
  x: number;
  y: number;
  z: number;
  ry: number;
  /** Пройденный путь, м. */
  odo: number;
}

export function evaluateProp(p: Prop, t: number, vehicle: boolean): PropState {
  if (!vehicle || !p.keys?.length) return { x: p.x, y: p.y, z: p.z, ry: p.ry, odo: 0 };
  const m = motionAt(p, t, true, true);
  return { x: m.x, y: m.y, z: m.z, ry: m.ry, odo: m.odo };
}

function basePose(a: Actor, t: number, m: Motion): Pose {
  const v = a.variant;
  if (rigOf(v) === 'quad') {
    const idle = quadIdle(t, v);
    if (m.moving <= 0) return idle;
    const h = quadSpec(v).hipY;
    const run = m.speed > Math.max(1.2, h * 3);
    const cycle = m.walked / (run ? h * 4.2 : h * 2.4);
    return lerpPose(idle, quadGait(cycle, v, run), m.moving);
  }
  if (v === 'wheelchair') {
    // руки на ободах; на ходу — толчки (один на ~0.9 м)
    const idle = { ...idlePose(t), ...wheelPushArms(0.25, 0) };
    if (m.moving <= 0) return idle as Pose;
    return lerpPose(idle as Pose, { ...idlePose(t), ...wheelPushArms(m.walked / 0.9) } as Pose, m.moving);
  }
  const old = v === 'oldman' || v === 'oldwoman';
  let idle = idlePose(t);
  if (v === 'oldman') idle = { ...idle, ...armR(CANE_R) };
  if (m.moving <= 0) return idle;
  const run = !old && m.speed > 2.4;
  const cycle = run ? m.walked / 3.4 : m.walked / (old ? 0.9 : 1.25);
  let walk = walkPose(cycle, run);
  if (old) {
    walk = lerpPose(idle, walk, 0.6);
    if (v === 'oldman') walk = { ...walk, ...armR({ ...CANE_R, sx: CANE_R.sx! - 0.15 * Math.sin(cycle * Math.PI * 1.8) }) };
  }
  if (v === 'fat') walk = { ...walk, bz: walk.bz + 0.05 * Math.sin(cycle * Math.PI * 1.8) };
  return lerpPose(idle, walk, m.moving);
}

const LEG_KEYS = ['y', 'by', 'lhx', 'lhy', 'lhz', 'lk', 'rhx', 'rhy', 'rhz', 'rk'] as const;
const QUAD_LEG_KEYS = ['y', 'bx', 'bz', 'lsx', 'lsz', 'le', 'rsx', 'rsz', 're', 'lhx', 'lhz', 'lk', 'rhx', 'rhz', 'rk'] as const;

function actionPose(type: string, t: number, speed: number, a: Actor, now: number, m: Motion): Pose {
  const def = ACTION_MAP[type];
  // анимация от другой модели (сменили фигуру) — просто стоим
  if (!def || !actionFits(def, a.variant)) return basePose(a, now, m);
  const p = def.fn(Math.max(0, t) * speed, a.variant);
  // жесты и эмоции — только верх тела: на ходу ноги продолжают шагать
  if (m.moving > 0 && def.group !== 'Позы' && def.group !== 'Движение') {
    const walk = basePose(a, now, m);
    for (const k of rigOf(a.variant) === 'quad' ? QUAD_LEG_KEYS : LEG_KEYS) p[k] = p[k] + (walk[k] - p[k]) * m.moving;
  }
  return p;
}

/** Особенности телосложения поверх любой позы. */
function applyVariant(v: FigureVariant, p: Pose): Pose {
  switch (v) {
    case 'wheelchair':
      // сидит: ноги и таз неподвижны
      return { ...p, y: -0.33, bx: 0, by: 0, bz: 0, bz2: 0, lhx: -Math.PI / 2, lhy: 0, lhz: 0.06, lk: Math.PI / 2 - 0.05, rhx: -Math.PI / 2, rhy: 0, rhz: -0.06, rk: Math.PI / 2 - 0.05 };
    case 'oldman':
    case 'oldwoman': {
      // сутулость; лёжа — не нужна
      const k = Math.max(0, 1 - Math.abs(p.bx));
      return { ...p, tx: p.tx + 0.22 * k, hx: p.hx - 0.16 * k, lk: p.lk + 0.1 * k, rk: p.rk + 0.1 * k, lhx: p.lhx - 0.05 * k, rhx: p.rhx - 0.05 * k, y: p.y - 0.012 * k };
    }
    case 'fat':
      return { ...p, lsz: p.lsz + 0.16, rsz: p.rsz - 0.16, lhz: p.lhz + 0.04, rhz: p.rhz - 0.04 };
    default:
      return p;
  }
}

/** Поза покоя модели (для превью). */
export function restPose(v: FigureVariant, t: number): Pose {
  const m: Motion = { x: 0, y: 0, z: 0, ry: 0, moving: 0, speed: 0, walked: 0 };
  return applyVariant(v, basePose({ variant: v } as Actor, t, m));
}

export function evaluateActor(a: Actor, t: number): ActorState {
  const m = motionAt(a, t, a.autoWalk);
  const acts = a.actions;

  let cur: Pose;
  let segStart = -Infinity;
  let active = -1;
  for (let i = 0; i < acts.length; i++) {
    const c = acts[i];
    if (t >= c.start && t < c.start + c.duration) active = i;
  }
  if (active >= 0) {
    const c = acts[active];
    cur = actionPose(c.type, t - c.start, c.speed, a, t, m);
    segStart = c.start;
  } else {
    cur = basePose(a, t, m);
    for (const c of acts) {
      const end = c.start + c.duration;
      if (end <= t && end > segStart) segStart = end;
    }
  }

  const since = t - segStart;
  if (since < BLEND) {
    // что было непосредственно до начала сегмента
    let prev: Pose | null = null;
    for (let i = 0; i < acts.length; i++) {
      if (i === active) continue;
      const c = acts[i];
      if (c.start < segStart && c.start + c.duration >= segStart - 1e-3) {
        prev = actionPose(c.type, Math.min(t, c.start + c.duration) - c.start, c.speed, a, t, m);
      }
    }
    if (!prev) prev = basePose(a, t, m);
    cur = lerpPose(prev, cur, smooth(since / BLEND));
  }

  return { x: m.x, y: m.y, z: m.z, ry: m.ry, pose: applyVariant(a.variant, cur), odo: m.odo };
}

// ---------- камера ----------

export function evaluateCamera(s: Scene, t: number): CameraView {
  const keys = s.cameraKeys;
  if (keys.length === 0) return s.camera;
  if (t <= keys[0].t) return keys[0];
  const last = keys[keys.length - 1];
  if (t >= last.t) return last;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  let w = (t - a.t) / Math.max(b.t - a.t, 1e-4);
  if (b.ease === 'smooth') w = smooth(w);
  const l = (x: number, y: number) => x + (y - x) * w;
  return {
    target: [l(a.target[0], b.target[0]), l(a.target[1], b.target[1]), l(a.target[2], b.target[2])],
    azimuth: lerpAngle(a.azimuth, b.azimuth, w),
    elevation: l(a.elevation, b.elevation),
    distance: l(a.distance, b.distance),
    zoom: Math.exp(l(Math.log(a.zoom), Math.log(b.zoom))),
  };
}
