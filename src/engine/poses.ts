import { ZERO, POSE_KEYS, type ActionDef, type Pose } from './poseKeys';
import { ANIMAL_ACTIONS } from './animalPoses';
import type { FigureVariant } from '../types';
import { rigOf } from './variants';

export { POSE_KEYS, ZERO };
export type { ActionDef, Pose, PoseKey } from './poseKeys';

const REST: Pose = { ...ZERO };
REST.lsz = 0.07;
REST.rsz = -0.07;
REST.le = -0.08;
REST.re = -0.08;

type Partial2 = Partial<Pose> & { arms?: Arm; legs?: Leg };
export interface Arm { sx?: number; sy?: number; sz?: number; e?: number }
interface Leg { hx?: number; hy?: number; hz?: number; k?: number }

/** Собрать позу; arms/legs задают обе стороны симметрично (в левосторонней записи). */
export function P(o: Partial2): Pose {
  const p = { ...REST };
  if (o.arms) Object.assign(p, armL(o.arms), armR(o.arms));
  if (o.legs) Object.assign(p, legL(o.legs), legR(o.legs));
  for (const k of POSE_KEYS) if (o[k] !== undefined) p[k] = o[k]!;
  return p;
}
export function armL(a: Arm): Partial<Pose> {
  const r: Partial<Pose> = {};
  if (a.sx !== undefined) r.lsx = a.sx;
  if (a.sy !== undefined) r.lsy = a.sy;
  if (a.sz !== undefined) r.lsz = a.sz;
  if (a.e !== undefined) r.le = a.e;
  return r;
}
/** Правая рука в левосторонней записи (зеркалим y и z). */
export function armR(a: Arm): Partial<Pose> {
  const r: Partial<Pose> = {};
  if (a.sx !== undefined) r.rsx = a.sx;
  if (a.sy !== undefined) r.rsy = -a.sy;
  if (a.sz !== undefined) r.rsz = -a.sz;
  if (a.e !== undefined) r.re = a.e;
  return r;
}
export function legL(l: Leg): Partial<Pose> {
  const r: Partial<Pose> = {};
  if (l.hx !== undefined) r.lhx = l.hx;
  if (l.hy !== undefined) r.lhy = l.hy;
  if (l.hz !== undefined) r.lhz = l.hz;
  if (l.k !== undefined) r.lk = l.k;
  return r;
}
export function legR(l: Leg): Partial<Pose> {
  const r: Partial<Pose> = {};
  if (l.hx !== undefined) r.rhx = l.hx;
  if (l.hy !== undefined) r.rhy = -l.hy;
  if (l.hz !== undefined) r.rhz = -l.hz;
  if (l.k !== undefined) r.rk = l.k;
  return r;
}

export function lerpPose(a: Pose, b: Pose, w: number): Pose {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const r = {} as Pose;
  for (const k of POSE_KEYS) r[k] = a[k] + (b[k] - a[k]) * w;
  return r;
}

const S = Math.sin;
const C = Math.cos;
const PI = Math.PI;
const H = PI / 2;
const pos = (v: number) => Math.max(0, v);

// --- фрагменты поз ---
const HAND_ON_HIP_L: Arm = { sx: 0.15, sy: -1.35, sz: 0.62, e: -1.75 };
const SIT_FLOOR_Y = 0.1 - 0.78;

/** Цикл шага, t — «время ходьбы» (≈1.8 шага/с). */
export function walkPose(t: number, run = false): Pose {
  const f = t * PI * 2 * (run ? 1.45 : 0.9);
  const s = S(f);
  const legA = run ? 0.85 : 0.52;
  const knee = (ph: number) => (run ? 0.35 + 1.15 * pos(S(ph)) : 0.1 + 0.65 * pos(S(ph)));
  return P({
    y: (run ? 0.07 : 0.03) * Math.abs(C(f)) - (run ? 0.07 : 0.02),
    tx: run ? 0.24 : 0.06,
    hx: run ? -0.12 : -0.03,
    by: 0.08 * s,
    ty: -0.13 * s, // корпус закручивается против таза
    tz: 0.03 * C(f),
    hy: 0.06 * s,
    hz: -0.02 * C(f),
    lhx: -legA * s,
    rhx: legA * s,
    lk: knee(f + 0.3 * PI),
    rk: knee(f + 1.3 * PI),
    lsx: (run ? 0.8 : 0.5) * s,
    rsx: -(run ? 0.8 : 0.5) * s,
    lsz: 0.1 + 0.04 * pos(s),
    rsz: -0.1 - 0.04 * pos(-s),
    le: run ? -1.55 : -0.25 - 0.45 * pos(-s),
    re: run ? -1.55 : -0.25 - 0.45 * pos(s),
  });
}

/** Перенос веса с ноги на ногу и дыхание — основа «живых» стоек. */
function stance(t: number, amt = 1): Partial<Pose> {
  const w = S(t * 0.9) * amt;
  const br = S(t * 2.1);
  return {
    bz: 0.025 * w,
    tz: -0.035 * w,
    hz: 0.03 * w,
    tx: 0.015 * br,
    hx: 0.02 * S(t * 0.8 + 1),
    hy: 0.07 * S(t * 0.43),
    ...legL({ hz: 0.03 + 0.03 * w, k: 0.04 + 0.08 * pos(-w) }),
    ...legR({ hz: 0.03 - 0.03 * w, k: 0.04 + 0.08 * pos(w) }),
  };
}

export function idlePose(t: number): Pose {
  const br = S(t * 2.1);
  return P({
    ...stance(t),
    lsz: 0.09 + 0.02 * br,
    rsz: -0.09 - 0.02 * br,
    lsx: 0.03 * S(t * 0.9),
    rsx: -0.03 * S(t * 0.9),
    le: -0.12,
    re: -0.12,
  });
}

const sitFloorLegs: Partial<Pose> = {
  ...legL({ hx: -1.4, hy: 1.35, hz: 0.75, k: 2.5 }),
  ...legR({ hx: -1.4, hy: 1.35, hz: 0.75, k: 2.5 }),
};

/** Отскок на каждую долю: 0..1, резкий удар и мягкое возвращение. */
const hit = (t: number, period: number) => {
  const p = (t % period) / period;
  return Math.exp(-p * 6);
};

/** Плавный «горб» 0→1→0 на отрезке [a, b]. */
const smoothBump = (x: number, a: number, b: number) => {
  const r = (b - a) * 0.35;
  const sm = (v: number) => {
    const c = Math.min(Math.max(v, 0), 1);
    return c * c * (3 - 2 * c);
  };
  return sm((x - a) / r) * sm((b - x) / r);
};

/** Присед без отрыва стоп: бедро вперёд на θ, колено 2θ, таз опускается. */
const crouch = (th: number): Partial<Pose> => ({
  y: 0.76 * (Math.cos(th) - 1),
  ...legL({ hx: -th, hz: 0.06, k: 2 * th }),
  ...legR({ hx: -th, hz: 0.06, k: 2 * th }),
});

export const ACTIONS: ActionDef[] = [
  // ---------- Движение ----------
  { id: 'walk', label: 'Шаг на месте', icon: '🚶', group: 'Движение', duration: 2, fn: (t) => walkPose(t) },
  { id: 'run', label: 'Бег на месте', icon: '🏃', group: 'Движение', duration: 2, fn: (t) => walkPose(t, true) },
  {
    id: 'jump', label: 'Прыжки', icon: '⤴️', group: 'Движение', duration: 2,
    fn: (t) => {
      const p = (t % 1.1) / 1.1;
      if (p < 0.28) {
        // присед-замах
        const c = S((p / 0.28) * PI);
        return P({ y: -0.18 * c, tx: 0.35 * c, hx: -0.1 * c, legs: { hx: -0.6 * c, k: 1.15 * c }, arms: { sx: 0.75 * c, sz: 0.1, e: -0.35 } });
      }
      const a = (p - 0.28) / 0.72;
      const h = S(PI * a);
      const land = a > 0.85 ? S(((a - 0.85) / 0.15) * PI) : 0;
      return P({
        y: 0.62 * h - 0.08 * land,
        tx: -0.12 * h + 0.2 * land,
        legs: { hx: -0.15 * h - 0.3 * land, k: 1.55 * h + 0.5 * land },
        arms: { sz: 0.3 + 2.3 * h, sx: -0.2 * h, e: -0.3 * h },
        hx: -0.22 * h,
      });
    },
  },
  {
    id: 'dance', label: 'Танец', icon: '🕺', group: 'Движение', duration: 4,
    fn: (t) => {
      const b = t * PI * 2;
      const bounce = Math.abs(S(b));
      const phrase = Math.floor(t / 2) % 2; // меняем движение каждые 2 с
      const sway = S(b / 2);
      const base: Partial<Pose> = {
        y: 0.05 * bounce - 0.06,
        by: 0.3 * sway,
        bz: 0.05 * sway,
        tz: 0.12 * sway,
        ty: -0.15 * sway,
        hz: -0.15 * sway,
        hx: -0.08 + 0.1 * bounce,
        ...legL({ hx: -0.3 * pos(sway), hz: 0.12, k: 0.3 + 0.45 * pos(sway) + 0.2 * bounce }),
        ...legR({ hx: -0.3 * pos(-sway), hz: 0.12, k: 0.3 + 0.45 * pos(-sway) + 0.2 * bounce }),
      };
      if (phrase === 0)
        // руки по очереди вверх
        return P({
          ...base,
          ...armL({ sx: -0.3, sz: 1.3 + 1.1 * sway, e: -1.1 + 0.5 * pos(sway) }),
          ...armR({ sx: -0.3, sz: 1.3 - 1.1 * sway, e: -1.1 + 0.5 * pos(-sway) }),
        });
      // руки «крутят» перед собой
      return P({
        ...base,
        ...armL({ sx: -1.0 + 0.45 * S(b), sy: -0.6, sz: 0.25 + 0.2 * C(b), e: -1.4 }),
        ...armR({ sx: -1.0 - 0.45 * S(b), sy: -0.6, sz: 0.25 - 0.2 * C(b), e: -1.4 }),
      });
    },
  },
  {
    id: 'turn', label: 'Оглядеться', icon: '👀', group: 'Движение', duration: 3,
    fn: (t) => {
      const look = S(t * 1.6);
      return P({ ...stance(t), hy: 0.9 * look, ty: 0.25 * S(t * 1.6 - 0.35), hx: -0.08 * Math.abs(look), ...armL({ sz: 0.1, e: -0.15 }), ...armR({ sz: 0.1, e: -0.15 }) });
    },
  },

  // ---------- Жесты ----------
  {
    id: 'wave', label: 'Помахать', icon: '👋', group: 'Жесты', duration: 2,
    fn: (t) => {
      const w = S(t * 10);
      return P({
        ...stance(t, 0.6),
        ...armR({ sx: -0.3, sy: 1.4, sz: 1.5 + 0.1 * w, e: -1.45 - 0.45 * w }),
        ...armL({ sz: 0.12, sx: 0.05 * S(t * 3), e: -0.2 }),
        tz: 0.05 + 0.03 * w,
        hz: -0.1 + 0.04 * S(t * 3),
        hy: -0.15,
        y: 0.015 * Math.abs(S(t * 5)),
      });
    },
  },
  {
    id: 'cheer', label: 'Ура!', icon: '🙌', group: 'Жесты', duration: 2,
    fn: (t) => {
      const h = hit(t, 0.5);
      const alt = S(t * PI * 2);
      return P({
        y: 0.08 * h - 0.03,
        ...armL({ sz: 2.45 + 0.2 * alt + 0.15 * h, sx: -0.15, e: -0.2 - 0.3 * h }),
        ...armR({ sz: 2.45 - 0.2 * alt + 0.15 * h, sx: -0.15, e: -0.2 - 0.3 * h }),
        legs: { k: 0.15 + 0.35 * (1 - h), hx: -0.1 * (1 - h) },
        hx: -0.3 + 0.1 * h,
        tx: -0.08,
        tz: 0.06 * alt,
      });
    },
  },
  {
    id: 'point', label: 'Указать', icon: '👉', group: 'Жесты', duration: 2,
    fn: (t) => {
      const jab = Math.exp(-((t % 1.2) / 1.2) * 5);
      return P({
        ...stance(t, 0.5),
        ...armR({ sx: -1.5 + 0.12 * jab, sz: 0.25, e: -0.25 * jab }),
        ...armL(HAND_ON_HIP_L),
        ty: -0.18,
        tx: 0.08 + 0.08 * jab,
        hy: -0.28,
        hx: 0.08 * jab,
      });
    },
  },
  {
    id: 'clap', label: 'Хлопать', icon: '👏', group: 'Жесты', duration: 2,
    fn: (t) => {
      const c = 0.5 + 0.5 * S(t * 13);
      const h = hit(t, 0.5);
      return P({
        ...stance(t, 0.4),
        arms: { sx: -1.05 - 0.1 * h, sy: -0.9, sz: 0.06 + 0.24 * c, e: -1.05 },
        y: 0.025 * h - 0.02,
        legs: { k: 0.12 + 0.12 * (1 - h) },
        hx: -0.08 + 0.06 * h,
      });
    },
  },
  {
    id: 'talk', label: 'Говорить', icon: '💬', group: 'Жесты', duration: 3,
    fn: (t) => P({
      ...stance(t, 0.8),
      ...armR({ sx: -0.6 + 0.25 * S(t * 3), sy: -0.4 + 0.3 * S(t * 1.7), sz: 0.2 + 0.1 * S(t * 2.2), e: -1.3 + 0.35 * S(t * 4.1) }),
      ...armL({ sx: -0.35 + 0.22 * S(t * 2.3 + 1), sy: -0.3, sz: 0.18 + 0.08 * S(t * 1.9), e: -1.0 + 0.3 * S(t * 3.3) }),
      hx: 0.06 * S(t * 5) - 0.03,
      hy: 0.18 * S(t * 1.3),
      hz: 0.06 * S(t * 0.9),
      ty: 0.12 * S(t * 1.1),
      tx: 0.04 + 0.03 * S(t * 2.6),
    }),
  },
  {
    id: 'phone', label: 'В телефоне', icon: '📱', group: 'Жесты', duration: 3,
    fn: (t) => {
      const tap = 0.06 * pos(S(t * 9)) * pos(S(t * 1.3));
      return P({
        ...stance(t, 0.5),
        ...armR({ sx: -0.55, sy: -0.9, sz: 0.12, e: -1.6 - tap }),
        ...armL({ sx: -0.35, sy: -0.6, sz: 0.1, e: -1.3 }),
        hx: 0.45 + 0.04 * S(t * 2),
        hz: 0.06 * S(t * 0.7),
        tx: 0.06,
      });
    },
  },
  {
    id: 'shrug', label: 'Пожать плечами', icon: '🤷', group: 'Жесты', duration: 1.6,
    fn: (t) => {
      const k = S(Math.min(t / 1.6, 1) * PI);
      const kk = Math.min(1, k * 1.4);
      return P({ ...stance(t, 0.3), arms: { sx: -0.4 * kk, sy: 0.95 * kk, sz: 0.25 + 0.25 * kk, e: -1.45 * kk }, hz: 0.2 * k, hx: -0.08 * k, tx: -0.05 * k, y: 0.015 * k });
    },
  },
  {
    id: 'bow', label: 'Поклон', icon: '🙇', group: 'Жесты', duration: 2,
    fn: (t) => {
      const k = S(Math.min(t / 2, 1) * PI);
      return P({ tx: 0.8 * k, hx: 0.25 * k, ...armL({ sx: -0.15 * k, sz: 0.06, e: -0.15 }), ...armR({ sx: -0.7 * k, sy: -0.8 * k, sz: 0.1, e: -1.2 * k }), legs: { k: 0.08 * k } });
    },
  },
  {
    id: 'nod', label: 'Кивать', icon: '🙂', group: 'Жесты', duration: 1.5,
    fn: (t) => P({ ...stance(t, 0.4), hx: 0.12 + 0.2 * S(t * 7), tx: 0.04 + 0.03 * S(t * 7), y: -0.01 * pos(S(t * 7)) }),
  },

  // ---------- Эмоции ----------
  {
    id: 'hips', label: 'Руки в боки', icon: '💁', group: 'Эмоции', duration: 3,
    fn: (t) => P({
      ...stance(t, 1.3),
      arms: HAND_ON_HIP_L,
      hy: 0.25 * S(t * 0.8),
      hx: -0.08,
      tx: -0.04,
      // притоптывает
      ...legR({ hz: 0.05, hx: -0.12 * pos(S(t * 5)), k: 0.18 * pos(S(t * 5)) }),
    }),
  },
  {
    id: 'cross', label: 'Скрестить руки', icon: '🙅', group: 'Эмоции', duration: 3,
    fn: (t) => P({
      ...stance(t, 1.2),
      ...armL({ sx: -0.3, sy: -1.15, sz: 0.25, e: -1.85 }),
      ...armR({ sx: -0.45, sy: -1.2, sz: 0.28, e: -1.7 }),
      hx: -0.1 + 0.03 * S(t),
      hz: 0.12 * S(t * 0.6),
      hy: -0.2 + 0.1 * S(t * 0.5),
      tx: -0.05,
    }),
  },
  {
    id: 'think', label: 'Задуматься', icon: '🤔', group: 'Эмоции', duration: 3,
    fn: (t) => P({
      ...stance(t, 0.7),
      ...armR({ sx: -0.75, sy: -0.55, sz: 0.1, e: -2.35 + 0.08 * pos(S(t * 6)) }),
      ...armL({ sx: -0.35, sy: -1.25, sz: 0.2, e: -1.6 }),
      hx: 0.18 + 0.04 * S(t * 0.9),
      hz: -0.15 + 0.06 * S(t * 0.7),
      hy: 0.15 * S(t * 0.4),
    }),
  },
  {
    id: 'scratch', label: 'Почесать голову', icon: '😕', group: 'Эмоции', duration: 2,
    fn: (t) => P({
      ...stance(t, 0.5),
      ...armR({ sx: -0.6, sy: 1.5, sz: 1.55, e: -2.0 + 0.2 * S(t * 14) }),
      hz: -0.2 + 0.04 * S(t * 3),
      hx: 0.15,
      tz: 0.06,
      ...armL({ sz: 0.12, e: -0.3 }),
    }),
  },
  {
    id: 'facepalm', label: 'Фейспалм', icon: '🤦', group: 'Эмоции', duration: 2,
    fn: (t) => P({ ...stance(t, 0.4), ...armR({ sx: -1.1, sy: -0.5, sz: 0.05, e: -2.2 }), hx: 0.35, hy: 0.15 * S(t * 4), tx: 0.12 + 0.04 * S(t * 1.5), ...armL({ sz: 0.08, e: -0.1 }) }),
  },
  {
    id: 'sad', label: 'Грустить', icon: '😞', group: 'Эмоции', duration: 3,
    fn: (t) => {
      const sigh = pos(S(t * 1.2)) ** 3;
      return P({ ...stance(t * 0.6, 0.5), hx: 0.5 - 0.12 * sigh, tx: 0.16 - 0.08 * sigh, hy: 0.1 * S(t * 0.4), arms: { sx: -0.1, sz: 0.03, e: -0.12 }, y: -0.01 });
    },
  },
  {
    id: 'laugh', label: 'Смеяться', icon: '😂', group: 'Эмоции', duration: 2,
    fn: (t) => {
      const sh = S(t * 15);
      return P({
        tx: -0.2 + 0.1 * sh + 0.15 * pos(S(t * 2)),
        hx: -0.35 + 0.1 * sh,
        tz: 0.05 * S(t * 2.5),
        ...armL({ sx: -0.55, sy: -1.0, sz: 0.2, e: -1.5 }),
        ...armR({ sx: -0.3 + 0.15 * sh, sy: -0.4, sz: 0.25, e: -1.2 }),
        legs: { k: 0.1 + 0.08 * Math.abs(sh) },
        y: -0.01 * Math.abs(sh),
      });
    },
  },

  // ---------- Позы ----------
  {
    id: 'sit_floor', label: 'Сидеть по-турецки', icon: '🧘', group: 'Позы', duration: 4,
    fn: (t) => P({
      y: SIT_FLOOR_Y,
      ...sitFloorLegs,
      arms: { sx: -0.65, sy: -0.3, sz: 0.28, e: -0.55 },
      tx: 0.06 + 0.03 * S(t * 1.9),
      tz: 0.05 * S(t * 0.7),
      hy: 0.3 * S(t * 0.5),
      hz: 0.06 * S(t * 0.9),
    }),
  },
  {
    id: 'sit_hug', label: 'Обнять колени', icon: '🫂', group: 'Позы', duration: 4,
    fn: (t) => P({
      y: SIT_FLOOR_Y,
      legs: { hx: -2.35, hz: 0.12, k: 2.45 },
      tx: 0.38 + 0.08 * S(t * 1.6),
      bx: 0.04 * S(t * 1.6),
      hx: 0.15 + 0.08 * S(t * 1.6 + 0.5),
      hy: 0.1 * S(t * 0.4),
      arms: { sx: -1.15, sy: -0.75, sz: 0.05, e: -0.85 },
    }),
  },
  {
    id: 'sit_lean', label: 'Сидеть, опираясь', icon: '🏖️', group: 'Позы', duration: 4,
    fn: (t) => P({
      y: SIT_FLOOR_Y,
      ...legL({ hx: -1.5, hz: 0.12, k: 0.15 }),
      ...legR({ hx: -2.0 + 0.12 * S(t * 2.5), hz: 0.1 + 0.08 * S(t * 2.5), k: 1.8 }),
      tx: -0.42,
      hx: 0.1 + 0.05 * S(t * 0.8),
      hy: 0.35 * S(t * 0.45),
      arms: { sx: 0.75, sz: 0.25, e: 0 },
    }),
  },
  {
    id: 'sit_chair', label: 'Сидеть на стуле', icon: '🪑', group: 'Позы', duration: 4,
    fn: (t) => P({
      y: -0.33,
      ...legL({ hx: -H, hz: 0.06, k: H + 0.2 * S(t * 2.4) }),
      ...legR({ hx: -H, hz: 0.06, k: H - 0.2 * S(t * 2.4) }),
      arms: { sx: -0.55, sy: -0.25, sz: 0.1, e: -0.95 },
      tx: 0.04 + 0.03 * S(t * 1.9),
      hy: 0.25 * S(t * 0.5),
      hz: 0.05 * S(t * 0.8),
    }),
  },
  {
    id: 'kneel', label: 'На колено', icon: '🧎', group: 'Позы', duration: 3,
    fn: (t) => P({
      y: -0.335,
      ...legL({ hx: -H, hz: 0.06, k: H }),
      ...legR({ hx: 0.05, hz: 0.06, k: H }),
      tx: 0.12 + 0.03 * S(t * 1.8),
      ...armL({ sx: -0.95, sy: -0.4, sz: 0.1, e: -0.7 }),
      ...armR({ sx: -0.75, sy: -0.55, sz: 0.1, e: -2.35 + 0.06 * S(t * 3) }),
      hx: 0.2,
      hz: 0.08 * S(t * 0.7),
    }),
  },
  {
    id: 'lie', label: 'Лежать', icon: '🛌', group: 'Позы', duration: 4,
    fn: (t) => P({
      bx: -H, y: 0.13, bz2: 0.85,
      tx: 0.025 * S(t * 1.5),
      hy: 0.15 * S(t * 0.3),
      arms: { sz: 0.14 + 0.02 * S(t * 1.5), e: -0.1 },
      ...legR({ hx: -0.25 * pos(S(t * 0.4)), k: 0.5 * pos(S(t * 0.4)) }),
    }),
  },
  {
    id: 'stand', label: 'Стоять ровно', icon: '🧍', group: 'Позы', duration: 2,
    fn: (t) => P({ ...stance(t, 0.3), arms: { sz: 0.08, e: -0.1 } }),
  },
  // ---------- новые ----------
  {
    id: 'hail', label: 'Ловить машину', icon: '🙋', group: 'Жесты', duration: 2.5,
    fn: (t) => {
      const w = S(t * 7);
      return P({
        ...stance(t, 0.5),
        ...armR({ sx: -2.2, sz: 0.45, sy: 0.3, e: -0.15 - 0.15 * w }),
        ...armL({ sz: 0.1, e: -0.15 }),
        tz: 0.08,
        tx: 0.06,
        hy: -0.35 + 0.08 * S(t * 1.2),
        hx: -0.05,
        y: 0.02 * pos(w),
      });
    },
  },
  {
    id: 'watch', label: 'Смотреть на часы', icon: '⌚', group: 'Жесты', duration: 2.5,
    fn: (t) => {
      // поднять руку, посмотреть, опустить; нетерпеливо постукивать ногой
      const k = smoothBump(t % 2.5, 0.3, 2.1);
      return P({
        ...stance(t, 0.6),
        ...armL({ sx: -0.15 - 0.55 * k, sy: -1.25 * k, sz: 0.1 + 0.15 * k, e: -0.1 - 1.65 * k }),
        ...armR({ sz: 0.1, e: -0.15 }),
        hx: 0.38 * k,
        hy: 0.3 * k,
        ...legR({ hz: 0.05, hx: -0.1 * pos(S(t * 6)), k: 0.15 * pos(S(t * 6)) }),
      });
    },
  },
  {
    id: 'salute', label: 'Отдать честь', icon: '🫡', group: 'Жесты', duration: 2,
    fn: (t) => {
      const k = Math.min(1, t / 0.3);
      return P({
        ...armR({ sx: -0.55 * k, sy: 1.5 * k, sz: 0.1 + 1.45 * k, e: -0.1 - 2.15 * k }),
        ...armL({ sz: 0.04, e: 0 }),
        hx: -0.1,
        tx: -0.03 + 0.008 * S(t * 2),
        legs: { hz: 0.01 },
      });
    },
  },
  {
    id: 'hug', label: 'Обнять', icon: '🤗', group: 'Жесты', duration: 3,
    fn: (t) => {
      const sway = S(t * 1.6);
      return P({
        ...stance(t, 0.3),
        arms: { sx: -1.3, sy: -0.95, sz: 0.25, e: -1.25 - 0.08 * sway },
        tx: 0.12,
        tz: 0.07 * sway,
        hz: 0.22 + 0.05 * sway,
        hx: 0.05,
        y: -0.01,
      });
    },
  },
  {
    id: 'stretch', label: 'Потянуться', icon: '🙆', group: 'Движение', duration: 3,
    fn: (t) => {
      const k = smoothBump(t % 3, 0.2, 2.6);
      const side = S(t * 1.4) * k;
      return P({
        arms: { sx: -0.25 * k, sz: 0.1 + 2.65 * k, e: -0.1 - 0.5 * k },
        tz: 0.22 * side,
        tx: -0.12 * k,
        hx: -0.3 * k,
        hz: 0.1 * side,
        y: 0.03 * k,
        legs: { hz: 0.03 },
      });
    },
  },
  {
    id: 'squat', label: 'Приседать', icon: '🏋️', group: 'Движение', duration: 3.2,
    fn: (t) => {
      const k = 0.5 - 0.5 * C((t / 1.6) * PI * 2);
      return P({
        ...crouch(1.15 * k),
        tx: 0.55 * k,
        hx: -0.35 * k,
        arms: { sx: -1.5 * k, sz: 0.12, e: -0.1 },
      });
    },
  },
  {
    id: 'kick', label: 'Пнуть', icon: '⚽', group: 'Движение', duration: 1.6,
    fn: (t) => {
      const p = (t % 1.6) / 1.6;
      // замах назад → удар вперёд → возврат
      const back = smoothBump(p, 0.0, 0.35);
      const fwd = p > 0.3 ? smoothBump(p, 0.3, 0.75) : 0;
      return P({
        ...legR({ hx: 0.45 * back - 1.35 * fwd, hz: 0.05, k: 1.1 * back + 0.15 * fwd }),
        ...legL({ hz: 0.06, k: 0.15 * (back + fwd) }),
        tx: -0.25 * fwd + 0.1 * back,
        ...armL({ sx: -0.7 * fwd, sz: 0.35 + 0.3 * fwd, e: -0.4 }),
        ...armR({ sx: 0.6 * fwd, sz: 0.35 + 0.2 * fwd, e: -0.3 }),
        hx: 0.2 * fwd,
        y: -0.03 * (back + fwd),
      });
    },
  },
  {
    id: 'guitar', label: 'Гитара', icon: '🎸', group: 'Движение', duration: 4,
    fn: (t) => {
      const strum = S(t * 13);
      const bang = Math.abs(S(t * PI * 2));
      return P({
        ...armL({ sx: -1.0, sy: -0.35, sz: 0.65, e: -0.55 + 0.1 * S(t * 2.3) }),
        ...armR({ sx: -0.45, sy: -1.15, sz: 0.12, e: -1.35 + 0.35 * strum }),
        hx: 0.1 + 0.2 * bang,
        tx: 0.05 + 0.08 * bang,
        ty: -0.25,
        hy: 0.2,
        ...crouch(0.18 + 0.12 * bang),
        ...legL({ hz: 0.15, hx: -0.18 - 0.12 * bang, k: 0.36 + 0.24 * bang }),
      });
    },
  },
  {
    id: 'angry', label: 'Злиться', icon: '😠', group: 'Эмоции', duration: 2.4,
    fn: (t) => {
      const stomp = hit(t, 0.8);
      return P({
        ...armL({ sx: 0.25, sz: 0.35 + 0.05 * stomp, e: -1.0 - 0.3 * stomp }),
        ...armR({ sx: 0.25, sz: 0.35 + 0.05 * stomp, e: -1.0 - 0.3 * stomp }),
        ...legR({ hz: 0.08, hx: -0.45 * (1 - stomp) * pos(S((t % 0.8) / 0.8 * PI)), k: 0.7 * (1 - stomp) * pos(S((t % 0.8) / 0.8 * PI)) }),
        ...legL({ hz: 0.08, k: 0.08 }),
        tx: 0.18 + 0.06 * stomp,
        hx: 0.1 + 0.1 * stomp,
        hy: 0.15 * S(t * 9) * stomp,
        y: -0.03 * stomp,
      });
    },
  },
  {
    id: 'cry', label: 'Плакать', icon: '😭', group: 'Эмоции', duration: 3,
    fn: (t) => {
      const sob = pos(S(t * 9)) * (0.6 + 0.4 * pos(S(t * 1.3)));
      return P({
        ...stance(t * 0.5, 0.3),
        arms: { sx: -1.25, sy: -0.45, sz: 0.08, e: -2.25 - 0.05 * sob },
        hx: 0.42 + 0.05 * sob,
        tx: 0.15 + 0.06 * sob,
        y: -0.015 * sob,
      });
    },
  },
];

// ---------- особые: коляска, пожилые, робот, толстяк, высокий ----------

/** Руки на ободах колёс; g — фаза толчка 0..1. */
export function wheelPushArms(g: number, amt = 1): Partial<Pose> {
  const c = C(g * PI * 2);
  const s = S(g * PI * 2);
  const arm: Arm = { sx: -0.15 + 0.45 * c * amt, sy: -0.2, sz: 0.3 + 0.04 * s, e: -0.75 + 0.35 * pos(-c) * amt };
  return { ...armL(arm), ...armR(arm), tx: 0.1 + 0.12 * pos(-c) * amt, hx: -0.05 - 0.08 * pos(-c) * amt };
}

export const CANE_R: Arm = { sx: -0.32, sy: 0, sz: 0.12, e: -0.45 };

ACTIONS.push(
  {
    id: 'wc_push', label: 'Катиться на месте', icon: '♿', group: 'Особые', duration: 3, only: ['wheelchair'],
    fn: (t) => P({ ...wheelPushArms(t * 0.9), whl: t * 3.2, hy: 0.15 * S(t * 0.6) }),
  },
  {
    id: 'wc_wheelie', label: 'На задних колёсах', icon: '🛞', group: 'Особые', duration: 3, only: ['wheelchair'],
    fn: (t) => {
      const k = smoothBump(t % 3, 0.15, 2.85);
      const bal = 0.05 * S(t * 3.1) * k;
      return P({ rx: -0.42 * k + bal, ...wheelPushArms(0.15, 0.3), tx: 0.18 * k, hx: -0.15 * k, whl: -bal * 2, ...armR({ sx: -0.1, sz: 0.32, e: -0.7 - 0.2 * S(t * 3.1) }) });
    },
  },
  {
    id: 'wc_spin', label: 'Кружиться', icon: '🌀', group: 'Особые', duration: 3, only: ['wheelchair'],
    fn: (t) => {
      const a = t * 2.4;
      return P({ ry2: a, wd: a * 0.55, ...armL({ sx: -0.05, sz: 0.3, e: -0.7 - 0.25 * S(t * 6) }), ...armR({ sx: -2.4, sz: 0.35, e: -0.2 }), hx: -0.25, tz: -0.08, hz: 0.1 });
    },
  },
  {
    id: 'old_cane', label: 'Грозить тростью', icon: '🦯', group: 'Особые', duration: 2.5, only: ['oldman'],
    fn: (t) => {
      const sh = S(t * 11);
      return P({ ...stance(t, 0.3), grip: 1, ...armR({ sx: -2.1 + 0.18 * sh, sy: 0.2, sz: 0.25, e: -0.55 - 0.25 * sh }), ...armL({ sx: 0.1, sz: 0.15, e: -0.3 }), hx: -0.2 + 0.06 * sh, tx: -0.05, hz: 0.06 * S(t * 3), y: -0.01 });
    },
  },
  {
    id: 'old_back', label: 'Болит спина', icon: '😩', group: 'Особые', duration: 3, only: ['oldman', 'oldwoman'],
    fn: (t) => {
      const ow = pos(S(t * 1.6)) ** 2;
      return P({ ...stance(t * 0.6, 0.3), ...armL({ sx: 0.55, sy: -1.2, sz: 0.4, e: -1.6 }), ...armR({ sx: 0.55, sy: -1.2, sz: 0.4, e: -1.6 }), tx: 0.3 + 0.08 * ow, tz: 0.06 * S(t * 0.8), hx: -0.25 - 0.1 * ow, hz: 0.1 * ow, legs: { k: 0.12 } });
    },
  },
  {
    id: 'old_scold', label: 'Отчитывать', icon: '☝️', group: 'Особые', duration: 2.5, only: ['oldwoman', 'oldman'],
    fn: (t) => {
      const w = S(t * 9);
      return P({ ...stance(t, 0.4), ...armR({ sx: -1.0, sy: 0.6, sz: 0.55, e: -1.55 + 0.2 * w }), ...armL(HAND_ON_HIP_L), tx: 0.12, hx: 0.05 + 0.05 * S(t * 4.5), hz: 0.12 * S(t * 2.2), ty: -0.12 });
    },
  },
  {
    id: 'robot_dance', label: 'Робо-танец', icon: '🤖', group: 'Особые', duration: 4, only: ['robot'],
    fn: (t) => {
      // движения рывками: фаза «защёлкивается» на долях
      const beat = Math.floor(t * 4);
      const step = (n: number) => [0, 1, 0, -1][(beat + n) % 4];
      const a = step(0), b = step(1);
      return P({
        ...armL({ sx: -H * pos(a), sz: 0.1 + H * pos(-a), e: -H * pos(b) }),
        ...armR({ sx: -H * pos(-a), sz: 0.1 + H * pos(a), e: -H * pos(-b) }),
        hy: 0.5 * b, ty: 0.25 * a, tz: 0.1 * b,
        ...crouch(0.2 + 0.12 * Math.abs(a)),
      });
    },
  },
  {
    id: 'robot_scan', label: 'Сканировать', icon: '📡', group: 'Особые', duration: 3, only: ['robot'],
    fn: (t) => P({ arms: { sz: 0.12, e: -0.15 }, hy: 1.3 * S(t * 1.4), hx: 0.12 * S(t * 4.3), ty: 0.3 * S(t * 1.4 - 0.4), ...armR({ sx: -1.45, sz: 0.1, sy: 1.6 * S(t * 1.4), e: -0.1 }) }),
  },
  {
    id: 'robot_glitch', label: 'Сбой', icon: '⚡', group: 'Особые', duration: 2.5, only: ['robot'],
    fn: (t) => {
      const j = (k: number) => S(Math.floor(t * 14) * 12.9898 + k * 78.233) * 0.5;
      return P({ ...stance(t, 0.2), hy: 0.6 * j(1), hz: 0.5 * j(2), hx: 0.3 * j(3), tz: 0.15 * j(4), ...armL({ sx: -0.8 * pos(j(5)) - 0.1, sz: 0.2 + 0.6 * pos(j(6)), e: -1.2 * pos(j(7)) }), ...armR({ sx: -0.6 * pos(j(8)), sz: 0.15 + 0.5 * pos(j(9)), e: -1.0 * pos(j(10)) }), legs: { k: 0.15 * pos(j(11)) } });
    },
  },
  {
    id: 'robot_off', label: 'Выключиться', icon: '🔌', group: 'Особые', duration: 3, only: ['robot'],
    fn: (t) => {
      const k = smoothBump(t, 0.2, 5.6) * (t < 2.9 ? 1 : 1);
      const d = Math.min(1, Math.max(0, (t - 0.3) / 0.9));
      const e = d * d;
      return P({ tx: 0.55 * e, hx: 0.7 * e, arms: { sx: -0.3 * e, sz: 0.06, e: -0.1 }, ...crouch(0.35 * e), hz: 0.1 * e * k });
    },
  },
  {
    id: 'fat_belly', label: 'Погладить живот', icon: '😋', group: 'Особые', duration: 3, only: ['fat'],
    fn: (t) => {
      const r = t * 4;
      return P({ ...stance(t, 0.6), ...armR({ sx: -0.55 + 0.12 * S(r), sy: -0.9, sz: 0.4 + 0.08 * C(r), e: -1.25 }), ...armL({ sx: -0.35, sy: -1.0, sz: 0.38, e: -1.1 }), tx: -0.12, hx: -0.15 + 0.05 * S(t * 2), hz: 0.12 * S(t * 1.1) });
    },
  },
  {
    id: 'tall_reach', label: 'Достать сверху', icon: '🙌', group: 'Особые', duration: 3, only: ['tall'],
    fn: (t) => {
      const k = smoothBump(t % 3, 0.2, 2.8);
      const f = S(t * 8) * k;
      return P({ ...armR({ sx: -2.9 * k, sz: 0.15, e: -0.1 - 0.25 * f }), ...armL({ sz: 0.1 + 0.2 * k, e: -0.2 }), hx: -0.45 * k, tx: -0.08 * k, y: 0.05 * k, tz: 0.05 * k });
    },
  },
);

/** Сидящий в коляске не ходит ногами и не садится на пол. */
const NO_CHAIR = ['walk', 'run', 'jump', 'squat', 'kick', 'sit_floor', 'sit_hug', 'sit_lean', 'sit_chair', 'kneel', 'lie', 'stand'];
for (const a of ACTIONS) if (NO_CHAIR.includes(a.id)) a.not = ['wheelchair'];

ACTIONS.push(...ANIMAL_ACTIONS);

export const ACTION_MAP: Record<string, ActionDef> = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
export const ACTION_GROUPS = ['Особые', 'Жесты', 'Эмоции', 'Движение', 'Позы'] as const;

/** Подходит ли анимация к модели. */
export function actionFits(a: ActionDef, v: FigureVariant) {
  return (a.rig ?? 'human') === rigOf(v) && (!a.only || a.only.includes(v)) && !a.not?.includes(v);
}
export const actionsFor = (v: FigureVariant) => ACTIONS.filter((a) => actionFits(a, v));
