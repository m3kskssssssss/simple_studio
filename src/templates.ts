import type { ActionClip, Actor, MoveKey, Prop, Scene } from './types';
import { newActor, newProp, newScene, uid } from './project';
import { DEFAULT_CAMERA } from './engine/evaluate';
import { CHARCOAL, MAROON, NAVY } from './engine/palette';

/** Шаблон сцены для библиотеки. */
export interface SceneTemplate {
  name: string;
  build: () => Scene;
}

const PI = Math.PI;
const E = PI / 2; // смотреть/ехать на +X
const W = -PI / 2; // на −X
const S = 0; // на +Z
const N = PI; // на −Z

type P = [kind: string, x: number, z: number, ry?: number, color?: string | null, scale?: number];
const props = (list: P[]): Prop[] =>
  list.map(([kind, x, z, ry = 0, color = null, scale = 1]) => newProp(kind, { x, z, ry, color, scale }));

const key = (t: number, x: number, z: number, ry: number, y = 0): MoveKey => ({ id: uid(), t, x, y, z, ry });
const act = (type: string, start: number, duration: number, speed = 1): ActionClip => ({ id: uid(), type, start, duration, speed });

function person(name: string, woman: boolean, color: string, x: number, z: number, ry: number, actions: ActionClip[] = [], keys: MoveKey[] = []): Actor {
  return newActor({ name, variant: woman ? 'woman' : 'man', color, x, z, ry, actions, keys });
}

function car(kind: string, x: number, z: number, ry: number, keys: MoveKey[] = [], color: string | null = null): Prop {
  return newProp(kind, { x, z, ry, color, keys });
}

function cam(t: number, tx: number, tz: number, zoom: number, az = PI / 4, el = DEFAULT_CAMERA.elevation) {
  return { id: uid(), t, ease: 'smooth' as const, ...DEFAULT_CAMERA, target: [tx, 0.6, tz] as [number, number, number], zoom, azimuth: az, elevation: el };
}

/**
 * Улица вдоль X от x0 до x1: дорога (с переходом в crosswalkAt) и тротуары по 4 м
 * (два ряда плит с каждой стороны, бордюр у проезжей части и у внешнего края).
 */
function boulevard(x0: number, x1: number, crosswalkAt: number | null): Prop[] {
  const out: P[] = [];
  for (let x = x0; x <= x1; x += 4) {
    out.push([x === crosswalkAt ? 'crosswalk' : 'road', x, 0]);
    out.push(['sidewalk', x, -3.5, S], ['sidewalk', x, -5.5, N]);
    out.push(['sidewalk', x, 3.5, N], ['sidewalk', x, 5.5, S]);
  }
  return props(out);
}

// ---------- простые интерьеры ----------

function propsOnly(name: string, list: P[], extra: Partial<Scene> = {}): SceneTemplate {
  return { name, build: () => ({ ...newScene(name, extra), props: props(list) }) };
}

export const TEMPLATES: SceneTemplate[] = [
  { name: 'Пустая', build: () => newScene('Сцена') },
  propsOnly('Спальня', [['bed', -2.6, -1.8], ['plant', -0.4, -3], ['lamp', 1.2, -2.8, -0.6], ['beanbag', 2.6, -1.4], ['books', -3, 1.6, 0.3], ['mug', -2.6, 1.9], ['wall', -0.5, -3.6], ['rug', 0.3, 0.4, 0, '#e3ded8']]),
  propsOnly('Гостиная', [['sofa', 0, -2.4], ['tv', 0, 2.6, PI], ['rug', 0, 0], ['plant', -2.2, -2.8], ['lamp', 2.1, -2.6, -0.5], ['window_wall', 0, -3.4], ['pizza', 0.5, 0.3, 0.2]]),
  propsOnly('Офис', [['table', -1.4, -1.4], ['chair', -1.4, -0.7, PI], ['laptop', -1.4, -1.5], ['table', 1.6, -1.4], ['chair', 1.6, -0.7, PI], ['laptop', 1.6, -1.5], ['plant', 3.2, -2.6], ['bin', 0.1, -2.1], ['door', -3.4, -2.6], ['wall', 0, -2.8], ['bottle', 1.9, -1.3]]),
  propsOnly('Парк', [['tree', -3, -2.5], ['tree', 3.4, -3], ['tree', -4.2, 2], ['bench', 0, -2.2], ['bin', 1.3, -2.4], ['tree', 2.8, 2.8]], { floor: '#eef3ec', background: '#f4f8f3', grid: false }),

  // ---------- большая улица ----------
  // Планировка: дорога вдоль X (полосы z = +1.25 на восток, z = −1.25 на запад),
  // тротуары по 4 м с обеих сторон, дома на севере, бульвар на юге.
  {
    name: 'Улица',
    build: () => {
      const s = newScene('Улица', { duration: 12, floor: '#e7e7e4', background: '#e7e7e4', grid: false });
      s.props = [
        ...boulevard(-18, 18, 2),
        ...props([
          ['apartment', -11.5, -8.7], ['shop', -4.2, -8.4], ['house', 3.6, -8.4], ['apartment', 11, -8.7, 0, '#cfcac4'],
          ['streetlight', -14, -2.85], ['streetlight', -6, -2.85], ['streetlight', 8, -2.85], ['streetlight', -2, 2.85, N], ['streetlight', 12, 2.85, N],
          ['traffic_light', 0.4, -2.85], ['traffic_light', 3.6, 2.85, N],
          ['hydrant', -9, 2.78], ['road_sign', 9.5, 2.95, N], ['bin', -12.5, 6.9], ['bin', 6.5, -2.95],
          ['tree', -15, 6.9, 0, null, 0.85], ['tree', -9, 6.9, 1, null, 0.8], ['tree', -1.5, 6.9, 2, null, 0.85], ['tree', 5.5, 6.9, 0.5, null, 0.8], ['tree', 13, 6.9, 1.5, null, 0.85],
          ['bench', -5.5, 6.75, N], ['bench', 9.5, 6.75, N],
          ['bush', -16.6, -6.1], ['bush', -7.4, -6.1], ['bush', 6.8, -6.1], ['bush', 15.2, -6.1],
        ]),
        // две машины на восток с интервалом, одна на запад
        car('sedan', -22, 1.25, E, [key(0, -22, 1.25, E), key(7, 44, 1.25, E)]),
        car('pickup', -30, 1.25, E, [key(3, -30, 1.25, E), key(9.6, 30, 1.25, E)], '#4a6a5a'),
        car('hatchback', 22, -1.25, W, [key(1.5, 22, -1.25, W), key(8, -22, -1.25, W)]),
      ];
      s.actors = [
        // идёт по тротуару, ждёт, пока проедут машины, и переходит по зебре
        person('Она', true, MAROON, -15, -4.4, E, [act('watch', 6.2, 1.5), act('hug', 10.4, 1.6)], [
          key(0, -15, -4.4, E), key(5.4, 1.4, -4.4, E), key(6.1, 1.7, -3.15, S), key(7.8, 1.7, -3.15, S), key(10.3, 1.7, 3.05, S), key(10.4, 1.7, 3.05, 1.33),
        ]),
        // ждёт её на другой стороне
        person('Он', false, NAVY, 2.62, 3.3, N, [act('phone', 0, 6.5), act('wave', 7.6, 2.2), act('hug', 10.4, 1.6)], [key(0, 2.62, 3.3, N), key(10.2, 2.62, 3.3, N), key(10.4, 2.62, 3.3, -1.82)]),
        // бежит по дальнему ряду бульвара
        person('Бегун', false, CHARCOAL, 17, 5.5, W, [], [key(0.5, 17, 5.5, W), key(8.5, -17, 5.5, W)]),
        // болтают у магазина
        person('Подруга', true, NAVY, -5, -5.85, E - 0.2, [act('talk', 0, 4.5), act('laugh', 4.5, 2.2), act('talk', 6.7, 5.3)]),
        person('Друг', false, MAROON, -3.95, -5.85, W + 0.2, [act('laugh', 0.6, 2), act('cross', 2.6, 3), act('nod', 5.6, 2.4), act('shrug', 8, 1.6), act('laugh', 9.6, 2.4)]),
        newActor({ name: 'На скамейке', variant: 'woman', color: '#4a6a5a', x: -5.5, z: 6.7, ry: N, actions: [act('sit_chair', 0, 12)] }),
        person('Зарядка', false, '#7d8899', 10.8, 4.3, N + 0.4, [act('stretch', 0, 4), act('squat', 4, 8)]),
      ];
      s.cameraKeys = [cam(0, -7, -0.5, 0.5, PI / 4 - 0.15), cam(5.5, -1, 0, 0.56, PI / 4), cam(12, 2.2, 0.2, 0.7, PI / 4 + 0.15)];
      return s;
    },
  },

  // ---------- автобусная остановка ----------
  {
    name: 'Остановка',
    build: () => {
      const s = newScene('Остановка', { duration: 10, floor: '#e7e7e4', background: '#e7e7e4', grid: false });
      s.props = [
        ...boulevard(-18, 18, null),
        ...props([
          ['bus_stop', 0, 4.6, N],
          ['shop', -6, -8.4], ['house', 1, -8.4, 0, '#dcd6cc'], ['apartment', 8.5, -8.7],
          ['streetlight', -10, -2.85], ['streetlight', -2, -2.85], ['streetlight', 6, -2.85], ['streetlight', -8, 2.85, N], ['streetlight', 8, 2.85, N],
          ['tree', -12, 6.9, 0, null, 0.85], ['tree', -5.5, 6.9, 1, null, 0.8], ['tree', 5.5, 6.9, 2, null, 0.8], ['tree', 12, 6.9, 0.5, null, 0.85],
          ['bin', 2.6, 5.0], ['hydrant', -13, 2.78], ['bush', -3.4, -6.1], ['bush', 4.6, -6.1],
        ]),
        // хэтчбек подъезжает к остановке, ждёт и уезжает
        car('hatchback', -22, 1.25, E, [key(0, -22, 1.25, E), key(4, -0.5, 1.25, E), key(6.6, -0.5, 1.25, E), key(10.5, 22, 1.25, E)]),
        // встречные машины с большим интервалом
        car('sedan', 22, -1.25, W, [key(0.4, 22, -1.25, W), key(6.4, -44, -1.25, W)], '#7d8899'),
        car('pickup', 30, -1.25, W, [key(5.4, 30, -1.25, W), key(10.8, -30, -1.25, W)], CHARCOAL),
      ];
      s.actors = [
        person('Ждёт', true, MAROON, -2.4, 3.4, N, [act('watch', 0, 3.6), act('cheer', 3.9, 1.5), act('talk', 5.4, 4.6)]),
        newActor({ name: 'На лавке', variant: 'man', color: CHARCOAL, x: 0.6, z: 4.92, ry: N, actions: [act('sit_chair', 0, 10)] }),
        // бежит к остановке вдоль бордюра, перед навесом
        person('Пассажир', false, NAVY, 13, 3.35, W, [act('hail', 2.8, 1.3), act('wave', 4.1, 1.6), act('talk', 5.7, 4.3)], [key(0, 13, 3.35, W), key(2.6, 1.0, 3.3, W), key(2.8, 1.0, 3.3, N - 0.5)]),
        // опоздал: машина уже уехала
        person('Опоздал', false, '#4a6a5a', -16, 3.35, E, [act('facepalm', 7.9, 1.6), act('sad', 9.5, 0.5)], [key(3.6, -16, 3.35, E), key(7.8, -4.4, 3.35, E)]),
        // прохожая на той стороне
        person('Прохожая', true, NAVY, 12, -4.5, W, [], [key(0, 12, -4.5, W), key(9.6, -13, -4.5, W)]),
        person('Курит у дома', false, MAROON, 1.4, -5.9, S + 0.3, [act('phone', 0, 5), act('turn', 5, 2.5), act('phone', 7.5, 2.5)]),
      ];
      s.cameraKeys = [cam(0, -1.5, 1.2, 0.72, PI / 4 - 0.3), cam(10, 0.8, 1.6, 0.86, PI / 4 + 0.2)];
      return s;
    },
  },

  // ---------- двор с парковкой ----------
  {
    name: 'Двор',
    build: () => {
      const s = newScene('Двор', { duration: 10, floor: '#e3e7e0', background: '#e3e7e0', grid: false });
      const stalls = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5];
      s.props = [
        // подъездная дорога и ряд парковочных мест
        ...props([-14, -10, -6, -2, 2, 6, 10].map((x): P => ['road', x, 3.5])),
        ...props(stalls.map((x): P => ['parking', x, -1.75])),
        ...props([-8, -4, 0, 4, 8].map((x): P => ['sidewalk', x, -5.5, N])),
        ...props([
          ['apartment', -6, -8.7], ['house', 3, -8.4], ['house', 12.6, -3.2, W, '#e3dccf'],
          ['fence', -9, 8.6], ['fence', -7, 8.6], ['fence', -5, 8.6], ['fence', -3, 8.6], ['fence', -1, 8.6], ['fence', 1, 8.6], ['fence', 3, 8.6], ['fence', 5, 8.6], ['fence', 7, 8.6], ['fence', 9, 8.6],
          ['bench', -6.5, 7.6, N], ['bin', -4.8, 7.8], ['tree', -10.5, 7.2, 0, null, 0.8], ['tree', 10.5, 7.2, 1, null, 0.8],
          ['bush', 1.2, 7.9], ['bush', 8.6, 7.9], ['streetlight', 0, 6.4, N], ['box', 11, 7.3, 0.3],
        ]),
        car('pickup', -4.5, -1.55, N),
        car('sedan', -1.5, -1.6, N, [], '#b5873a'),
        // заезжает во двор и паркуется на свободное место
        car('hatchback', -22, 4.0, E, [key(0, -22, 4.0, E), key(4.2, 1.6, 4.0, E), key(5.4, 4.5, 1.6, 2.3), key(6.6, 4.5, -1.6, N)]),
      ];
      s.actors = [
        // беседа на свободном месте парковки
        person('Рассказчик', false, NAVY, -8.1, -1.4, E, [act('talk', 0, 3), act('point', 3, 1.6), act('laugh', 4.6, 2.4), act('talk', 7, 3)]),
        person('Слушает', true, MAROON, -6.95, -1.25, W, [act('laugh', 0.4, 2.2), act('hips', 2.6, 2.4), act('cheer', 5, 2), act('nod', 7, 3)]),
        // на газоне у забора
        person('Футбол', false, CHARCOAL, -2.5, 7.0, 0.8, [act('kick', 0.5, 9.5)]),
        person('Зарядка', true, '#4a6a5a', 6.2, 7.0, -0.9, [act('stretch', 0, 3.5), act('squat', 3.5, 6.5)]),
        newActor({ name: 'Бабушка', variant: 'woman', color: '#7d8899', x: -6.5, z: 7.55, ry: N, actions: [act('sit_chair', 0, 10)] }),
        // выходит из подъезда и идёт встречать машину
        person('Сосед', false, MAROON, -6, -6.1, S, [act('wave', 6.7, 2.1), act('cheer', 8.8, 1.2)], [key(0.8, -6, -6.1, S), key(1.6, -6, -4.9, S), key(6.0, 6.1, -4.9, E), key(6.5, 6.1, -4.9, W + 0.5)]),
      ];
      s.cameraKeys = [cam(0, -3.5, 0.8, 0.58, PI / 4 + 0.35), cam(10, 1.5, 0.2, 0.7, PI / 4 - 0.2)];
      return s;
    },
  },
];
