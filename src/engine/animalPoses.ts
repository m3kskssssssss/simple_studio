import type { FigureVariant } from '../types';
import { ZERO, type ActionDef, type Pose } from './poseKeys';
import { quadSpec } from './animal';

/** Позы четвероногих. Значения каналов — см. комментарий в animal.ts. */

const S = Math.sin;
const C = Math.cos;
const PI = Math.PI;
const H = PI / 2;
const pos = (v: number) => Math.max(0, v);
const smoothBump = (x: number, a: number, b: number) => {
  const r = (b - a) * 0.3;
  const sm = (v: number) => {
    const c = Math.min(Math.max(v, 0), 1);
    return c * c * (3 - 2 * c);
  };
  return sm((x - a) / r) * sm((b - x) / r);
};

export const Q = (o: Partial<Pose>): Pose => ({ ...ZERO, ...o });

/** Сумма поз: складываем поверх базы. */
const plus = (a: Partial<Pose>, b: Partial<Pose>): Partial<Pose> => {
  const r: Partial<Pose> = { ...a };
  for (const k of Object.keys(b) as (keyof Pose)[]) r[k] = (r[k] ?? 0) + b[k]!;
  return r;
};

const isBig = (v: FigureVariant) => v === 'horse' || v === 'deer';

// ---------- походка ----------

/** Цикл шага; c — фаза в циклах (1 = полный шаг всеми ногами). */
export function quadGait(c: number, v: FigureVariant, run: boolean): Pose {
  const f = c * PI * 2;
  const sp = quadSpec(v);
  if (!run) {
    // четырёхтактный шаг: ЛЗ → ЛП → ПЗ → ПП
    const A = 0.32;
    const leg = (ph: number) => ({ a: -A * S(f + ph), k: 0.75 * pos(C(f + ph)) });
    const bl = leg(0), fl = leg(H), br = leg(PI), fr = leg(PI + H);
    return Q({
      lsx: fl.a, le: fl.k, rsx: fr.a, re: fr.k,
      lhx: bl.a, lk: bl.k * 0.8, rhx: br.a, rk: br.k * 0.8,
      y: -0.012 * sp.hipY * Math.abs(C(2 * f)),
      bz: 0.02 * S(f),
      tx: (isBig(v) ? 0.07 : 0.03) * S(2 * f + 0.6),
      hy: 0.04 * S(f),
      tw: 0.18 * S(f),
      tl: v === 'dog' ? 0.1 : 0,
    });
  }
  // галоп / рысь прыжками: передние вместе, задние вместе
  const A = 0.62;
  const fA = -A * S(f), bA = -A * S(f + PI);
  return Q({
    lsx: fA, rsx: -A * S(f + 0.35), le: 1.1 * pos(C(f)), re: 1.1 * pos(C(f + 0.35)),
    lhx: bA, rhx: -A * S(f + PI + 0.35), lk: 0.9 * pos(C(f + PI)), rk: 0.9 * pos(C(f + PI + 0.35)),
    bx: 0.09 * S(f + 0.4),
    y: 0.07 * sp.hipY * pos(S(f + H)) - 0.03 * sp.hipY,
    tx: -0.1 + 0.12 * S(f + 0.8),
    hx: -0.05,
    tl: v === 'horse' ? 0.4 : 0.25,
    tw: 0.08 * S(f),
    ear: v === 'horse' || v === 'deer' ? 0.6 : 0.3,
  });
}

/** Дыхание, взгляд, хвост и уши в покое. */
export function quadIdle(t: number, v: FigureVariant): Pose {
  const twitch = pos(S(t * 0.7)) ** 12;
  const tail =
    v === 'dog' ? 0.22 * S(t * 7) : v === 'cat' ? 0.5 * S(t * 0.9) + 0.15 * S(t * 2.3) : v === 'horse' ? 0.15 * S(t * 1.1) + 0.3 * twitch * S(t * 9) : 0.4 * twitch * S(t * 14);
  return Q({
    y: -0.004 * quadSpec(v).hipY * (1 + S(t * 2)),
    tx: 0.04 * S(t * 0.37),
    hy: 0.22 * S(t * 0.43),
    hx: 0.05 * S(t * 0.71),
    hz: 0.05 * S(t * 0.3),
    tw: tail,
    tl: v === 'dog' ? 0.15 : v === 'cat' ? 0.1 + 0.1 * S(t * 0.5) : 0,
    ear: 0.4 * twitch,
    jaw: v === 'dog' ? 0.12 + 0.04 * S(t * 9) : 0,
  });
}

// ---------- лёжа и сидя ----------

/** Лечь: туловище на земле, передние лапы вперёд, задние подогнуты. */
function liePose(v: FigureVariant): Partial<Pose> {
  const sp = quadSpec(v);
  const y = -sp.belly + 0.012 * sp.hipY + 0.01;
  const jy = sp.hipY + y; // высота плеча над землёй
  const front = isBig(v)
    ? { lsx: -0.9, le: 2.5, rsx: -0.6, re: 2.6 } // крупные подгибают передние под грудь
    : (() => {
        const a = Math.asin(Math.min(0.95, Math.max(0, (jy - sp.paw) / sp.leg)));
        return { lsx: -(H - a), le: 0.1, rsx: -(H - a) + 0.12, re: 0.15 };
      })();
  return {
    y,
    ...front,
    lsz: 0.1, rsz: -0.1,
    lhx: -1.15, lk: 2.15, rhx: -1.15, rk: 2.15,
    lhz: 0.25, rhz: -0.25,
    tx: isBig(v) ? -0.15 : 0.05,
  };
}

/** Угол, на который поднимается перед при посадке (кошка, собака). */
function sitAngle(v: FigureVariant) {
  const sp = quadSpec(v);
  const target = 0.3 * sp.hipY;
  let b = 0.5;
  for (let i = 0; i < 30; i++) {
    const h = sp.hindY * C(b) + sp.hipY * (1 - C(b)) - sp.len * S(b);
    b += (h - target) / (sp.len * 2);
  }
  return Math.min(1.2, Math.max(0.2, b));
}

function sitPose(v: FigureVariant): Partial<Pose> {
  const sp = quadSpec(v);
  const b = sitAngle(v);
  const y = sp.hipY * (1 - C(b)) - sp.len * S(b);
  return {
    bx: -b,
    y,
    lsx: b, rsx: b, le: 0, re: 0,
    lsz: 0.04, rsz: -0.04,
    // бёдра вдоль земли вперёд, голень сложена
    lhx: -1.35 + b + 0.25, rhx: -1.35 + b + 0.25,
    lk: 2.2, rk: 2.2,
    lhz: 0.3, rhz: -0.3,
    tx: b * 0.55,
    hx: b * 0.25,
  };
}

// ---------- действия ----------

const ALL: FigureVariant[] = ['cat', 'dog', 'horse', 'deer'];
const SMALL: FigureVariant[] = ['cat', 'dog'];

const q = (d: Omit<ActionDef, 'rig'>): ActionDef => ({ rig: 'quad', only: ALL, ...d });

export const ANIMAL_ACTIONS: ActionDef[] = [
  // общие
  q({ id: 'q_walk', label: 'Шаг на месте', icon: '🐾', group: 'Движение', duration: 2, fn: (t, v) => quadGait(t * (isBig(v) ? 0.8 : 1.1), v, false) }),
  q({ id: 'q_run', label: 'Бег на месте', icon: '💨', group: 'Движение', duration: 2, fn: (t, v) => quadGait(t * (isBig(v) ? 1.6 : 2.4), v, true) }),
  q({
    id: 'q_jump', label: 'Прыжок', icon: '⤴️', group: 'Движение', duration: 1.6,
    fn: (t, v) => {
      const sp = quadSpec(v);
      const p = (t % 1.6) / 1.6;
      const crouch = smoothBump(p, 0, 0.35);
      const air = p > 0.28 && p < 0.8 ? S(((p - 0.28) / 0.52) * PI) : 0;
      return Q({
        y: -0.18 * sp.hipY * crouch + 0.9 * sp.hipY * air,
        bx: -0.25 * crouch + 0.2 * air * (p > 0.55 ? 1 : -1),
        lsx: -1.0 * air + 0.3 * crouch, rsx: -1.0 * air + 0.3 * crouch, le: 1.4 * air + 0.5 * crouch, re: 1.4 * air + 0.5 * crouch,
        lhx: 0.7 * air - 0.35 * crouch, rhx: 0.7 * air - 0.35 * crouch, lk: 0.6 * crouch - 0.3 * air, rk: 0.6 * crouch - 0.3 * air,
        tx: -0.15 * air, tl: 0.5 * air, ear: 0.5 * air,
      });
    },
  }),
  q({
    id: 'q_look', label: 'Оглядеться', icon: '👀', group: 'Движение', duration: 3,
    fn: (t, v) => Q({ ...quadIdle(t, v), tx: -0.25, ty: 0.55 * S(t * 1.4), hy: 0.45 * S(t * 1.4 - 0.3), hx: -0.1, ear: 0.4 + 0.3 * S(t * 2.8) }),
  }),
  q({
    id: 'q_sniff', label: 'Нюхать землю', icon: '👃', group: 'Жесты', duration: 3,
    fn: (t, v) => {
      const sp = quadSpec(v);
      const big = isBig(v);
      return Q({
        tx: big ? 0.75 : 0.95, hx: big ? 0.35 : 0.5,
        ty: 0.3 * S(t * 1.1), hy: 0.2 * S(t * 2.2),
        hz: 0.05 * S(t * 11),
        lsx: -0.12, rsx: -0.12, le: 0.25, re: 0.25,
        y: -0.04 * sp.hipY,
        tw: v === 'dog' ? 0.35 * S(t * 9) : 0.1 * S(t * 1.5),
        tl: v === 'dog' ? 0.25 : 0,
      });
    },
  }),
  q({
    id: 'q_sit', label: 'Сидеть', icon: '🐕', group: 'Позы', duration: 4, only: SMALL,
    fn: (t, v) => Q({ ...sitPose(v), hy: 0.3 * S(t * 0.45), hz: 0.06 * S(t * 0.3), tw: v === 'dog' ? 0.25 * S(t * 6) : 0.9, tl: -0.55, ear: 0.3 * pos(S(t * 0.8)) ** 10, jaw: v === 'dog' ? 0.12 : 0 }),
  }),
  q({
    id: 'q_lie', label: 'Лежать', icon: '🛏️', group: 'Позы', duration: 4,
    fn: (t, v) => Q({ ...liePose(v), hy: 0.35 * S(t * 0.4), hx: 0.1, tw: 0.9 + 0.15 * S(t * 0.8), tl: -0.6, ear: 0.3 * pos(S(t * 0.6)) ** 10 }),
  }),
  q({
    id: 'q_sleep', label: 'Спать', icon: '💤', group: 'Позы', duration: 4,
    fn: (t, v) => {
      const lie = liePose(v);
      const br = S(t * 1.6);
      return Q({ ...lie, y: lie.y! + 0.004 * quadSpec(v).hipY * br, tx: isBig(v) ? 0.5 : 0.85, ty: isBig(v) ? 0.6 : 0.9, hx: 0.25, hz: 0.25, tw: 1.3, tl: -0.7, ear: -0.3 });
    },
  }),

  // кошка
  q({
    id: 'cat_wash', label: 'Умываться', icon: '😺', group: 'Особые', duration: 3, only: ['cat'],
    fn: (t) => {
      const lick = S(t * 9);
      const base = sitPose('cat');
      return Q(plus(base, { lsx: -1.9, le: 2.1 + 0.25 * lick, lsz: -0.35, hx: 0.25 + 0.15 * lick, hy: 0.35, tx: 0.15, tw: 1.1, tl: -0.55, hz: 0.2 }));
    },
  }),
  q({
    id: 'cat_stretch', label: 'Потянуться', icon: '🐈', group: 'Особые', duration: 3, only: ['cat'],
    fn: (t) => {
      const k = smoothBump(t % 3, 0.1, 2.9);
      return Q({ bx: 0.45 * k, y: -0.02 * k, lsx: -1.1 * k, rsx: -1.15 * k, le: 0.1, re: 0.1, lhx: -0.25 * k, rhx: -0.25 * k, tx: -0.35 * k, hx: -0.3 * k, tl: 1.2 * k, tw: 0.1 * S(t * 2), ear: -0.4 * k });
    },
  }),
  q({
    id: 'cat_hiss', label: 'Шипеть', icon: '😾', group: 'Особые', duration: 2.5, only: ['cat'],
    fn: (t) => {
      const sh = S(t * 25) * 0.5 + 0.5;
      return Q({ y: 0.045 + 0.004 * sh, lsx: 0.15, rsx: 0.15, lhx: 0.2, rhx: 0.2, lk: -0.35, rk: -0.35, tx: 0.45, hx: -0.25, hy: 0.4, tl: 1.5, tw: 0.08 * S(t * 30), ear: -1.0, bz: 0.04 });
    },
  }),
  q({
    id: 'cat_pounce', label: 'Охотиться', icon: '🐁', group: 'Особые', duration: 3, only: ['cat'],
    fn: (t) => {
      const p = (t % 3) / 3;
      const wig = p < 0.65 ? S(t * 18) : 0;
      const leap = p > 0.65 && p < 0.92 ? S(((p - 0.65) / 0.27) * PI) : 0;
      const low = p < 0.65 ? smoothBump(p, 0, 1.3) : 1 - leap;
      return Q({
        y: -0.07 * low + 0.12 * leap,
        lsx: -0.5 * low - 1.0 * leap, rsx: -0.5 * low - 1.0 * leap, le: 1.2 * low + 0.6 * leap, re: 1.2 * low + 0.6 * leap,
        lhx: -0.45 * low + 0.8 * leap, rhx: -0.45 * low + 0.8 * leap, lk: 0.9 * low, rk: 0.9 * low,
        bz: 0.05 * wig, tx: -0.25 * low, hx: -0.15, tw: 0.3 * wig + 0.4 * S(t * 3), tl: -0.3 * low + 0.4 * leap, ear: 0.3,
      });
    },
  }),
  q({
    id: 'cat_tail', label: 'Махать хвостом', icon: '〰️', group: 'Особые', duration: 3, only: ['cat'],
    fn: (t) => Q({ ...sitPose('cat'), tw: 1.0 * S(t * 3.2), tl: -0.2 + 0.25 * S(t * 1.6), hy: 0.25 * S(t * 0.5), ear: 0.25 * pos(S(t * 1.1)) }),
  }),

  // собака
  q({
    id: 'dog_wag', label: 'Вилять хвостом', icon: '🐶', group: 'Особые', duration: 3, only: ['dog'],
    fn: (t) => {
      const w = S(t * 16);
      return Q({ tw: 0.7 * w, tl: 0.45, bz: 0.04 * w, by: 0.07 * w, tx: -0.1, hx: -0.1, hz: 0.12 * S(t * 2), jaw: 0.25 + 0.05 * S(t * 12), ear: 0.3, y: 0.01 * Math.abs(S(t * 8)) });
    },
  }),
  q({
    id: 'dog_bark', label: 'Лаять', icon: '🗯️', group: 'Особые', duration: 2.4, only: ['dog'],
    fn: (t) => {
      const b = Math.exp(-((t % 0.6) / 0.6) * 7);
      return Q({ jaw: 0.6 * b + 0.05, tx: -0.25 + 0.15 * b, hx: -0.25 * b, lsx: -0.18, rsx: -0.18, lhx: 0.15, rhx: 0.15, y: -0.02 - 0.02 * b, bx: 0.04 * b, tl: 0.6, tw: 0.25 * S(t * 14), ear: 0.5 * b });
    },
  }),
  q({
    id: 'dog_beg', label: 'Служить', icon: '🥺', group: 'Особые', duration: 3, only: ['dog'],
    fn: (t) => {
      const sp = quadSpec('dog');
      const b = 1.15;
      const paw = S(t * 6);
      return Q({
        bx: -b, y: sp.hipY * (1 - C(b)) - sp.len * S(b) + 0.035,
        lsx: -0.2 + 0.15 * paw, rsx: -0.2 - 0.15 * paw, le: 2.0, re: 2.0, lsz: 0.08, rsz: -0.08,
        lhx: -1.35 + b + 0.25, rhx: -1.35 + b + 0.25, lk: 2.2, rk: 2.2, lhz: 0.3, rhz: -0.3,
        tx: 0.75, hx: 0.25 + 0.05 * S(t * 2), hz: 0.25 * S(t * 1.3), tw: 0.4 * S(t * 12), tl: -0.9, ear: 0.4, jaw: 0.2,
      });
    },
  }),
  q({
    id: 'dog_dig', label: 'Копать', icon: '🕳️', group: 'Особые', duration: 2.5, only: ['dog'],
    fn: (t) => {
      const d = S(t * 14);
      return Q({ bx: 0.25, y: -0.04, lsx: -0.4 + 0.45 * d, rsx: -0.4 - 0.45 * d, le: 0.9 + 0.6 * pos(d), re: 0.9 + 0.6 * pos(-d), lhx: -0.3, rhx: -0.3, lk: 0.3, rk: 0.3, tx: 0.55, hx: 0.25, tl: 0.6, tw: 0.3 * S(t * 7) });
    },
  }),
  q({
    id: 'dog_play', label: 'Игривая поза', icon: '🎾', group: 'Особые', duration: 3, only: ['dog'],
    fn: (t) => {
      const bounce = pos(S(t * 4)) ** 2;
      return Q({ bx: 0.42, y: -0.03 + 0.03 * bounce, lsx: -1.25, rsx: -1.25, le: 0.2, re: 0.2, lhx: -0.35, rhx: -0.35, tx: -0.45, hx: -0.2, hz: 0.3 * S(t * 2), tw: 0.7 * S(t * 15), tl: 0.7, jaw: 0.3, ear: 0.4 });
    },
  }),
  q({
    id: 'dog_howl', label: 'Выть', icon: '🌕', group: 'Особые', duration: 3.5, only: ['dog'],
    fn: (t) => {
      const k = smoothBump(t % 3.5, 0.2, 3.3);
      return Q({ ...sitPose('dog'), tx: -0.2 - 0.25 * k, hx: -0.9 * k, jaw: 0.35 * k + 0.04 * S(t * 20) * k, ear: -0.4 * k, tw: 0.9, tl: -0.6 });
    },
  }),

  // лошадь
  q({
    id: 'horse_rear', label: 'На дыбы', icon: '🐎', group: 'Особые', duration: 2.6, only: ['horse'],
    fn: (t) => {
      const k = smoothBump(t % 2.6, 0.1, 2.5);
      const kick = S(t * 9) * k;
      return Q({ bx: -0.95 * k, y: -0.05 * k, lhx: 0.75 * k, rhx: 0.75 * k, lk: 0.25 * k, rk: 0.25 * k, lsx: -0.9 * k + 0.35 * kick, rsx: -0.9 * k - 0.35 * kick, le: 1.7 * k, re: 1.7 * k, tx: 0.55 * k, hx: -0.2 * k, jaw: 0.3 * k, ear: -0.8 * k, tl: -0.4 * k, tw: 0.2 * S(t * 5) });
    },
  }),
  q({
    id: 'horse_graze', label: 'Пастись', icon: '🌾', group: 'Особые', duration: 4, only: ['horse', 'deer'],
    fn: (t, v) => {
      const chew = S(t * 8);
      const deer = v === 'deer';
      return Q({ tx: deer ? 1.05 : 1.2, hx: deer ? 0.15 : 0.1, ty: 0.15 * S(t * 0.5), hy: 0.1 * S(t * 0.9), jaw: 0.08 * pos(chew), lsx: -0.18, le: 0.1, rsx: 0.05, lhx: 0.03, tw: 0.25 * S(t * 1.3), ear: 0.25 * pos(S(t * 0.9)) ** 8 });
    },
  }),
  q({
    id: 'horse_neigh', label: 'Ржать', icon: '📣', group: 'Особые', duration: 2.4, only: ['horse'],
    fn: (t) => {
      const k = smoothBump(t % 2.4, 0.1, 2.3);
      const sh = S(t * 22) * k;
      return Q({ tx: -0.35 * k, hx: -0.45 * k, hy: 0.15 * sh, hz: 0.12 * sh, jaw: 0.45 * k, ear: -0.6 * k, lsx: -0.15 * k, le: 0.4 * k, tl: 0.3 * k, tw: 0.2 * sh });
    },
  }),
  q({
    id: 'horse_stomp', label: 'Бить копытом', icon: '🦶', group: 'Особые', duration: 2.4, only: ['horse', 'deer'],
    fn: (t) => {
      const p = (t % 0.8) / 0.8;
      const lift = smoothBump(p, 0, 0.6);
      return Q({ ...quadIdle(t, 'horse'), lsx: -0.55 * lift, le: 1.3 * lift, tx: 0.2, hx: 0.15, ear: 0.3, tw: 0.4 * S(t * 4) });
    },
  }),

  // олень
  q({
    id: 'deer_alert', label: 'Насторожиться', icon: '🦌', group: 'Особые', duration: 3, only: ['deer'],
    fn: (t) => {
      const flick = pos(S(t * 2.3)) ** 6;
      return Q({ tx: -0.45, hx: -0.25, hy: 0.35 * Math.round(S(t * 0.9) * 2) / 2, ear: 0.6 + 0.6 * flick, tl: 0.9 + 0.3 * flick, tw: 0.4 * flick * S(t * 20), y: 0.01, lsx: -0.06 });
    },
  }),
  q({
    id: 'deer_leap', label: 'Прыжок', icon: '🌿', group: 'Особые', duration: 1.8, only: ['deer', 'horse'],
    fn: (t, v) => {
      const sp = quadSpec(v);
      const p = (t % 1.8) / 1.8;
      const air = p > 0.2 && p < 0.8 ? S(((p - 0.2) / 0.6) * PI) : 0;
      const pre = smoothBump(p, 0, 0.3);
      const pitch = air * C(((p - 0.2) / 0.6) * PI);
      return Q({
        y: 0.75 * sp.hipY * air - 0.12 * sp.hipY * pre,
        bx: -0.35 * pitch - 0.2 * pre,
        lsx: -0.6 * air, rsx: -0.6 * air, le: 2.2 * air, re: 2.2 * air,
        lhx: 0.55 * air, rhx: 0.55 * air, lk: 0.4 * air + 0.4 * pre, rk: 0.4 * air + 0.4 * pre,
        tx: -0.2 * air, ear: 0.6, tl: 0.8 * air,
      });
    },
  }),
];
