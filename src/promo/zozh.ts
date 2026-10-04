// Ролик «7 привычек ЗОЖ» (9:16, 60 fps). Сборка проекта + экспорт по команде из puppeteer.
import type { ActionClip, Actor, AudioClip, CameraKey, FigureVariant, MoveKey, Overlay, Project, Prop, Scene, TextClip, Transition } from '../types';
import { newActor, newProp, newScene, uid } from '../project';
import { decodeAndCache, putAudioBlob, blobToBase64 } from '../audio/audio';
import { FrameRenderer, exportVideo } from '../export/exporter';
import { projectToFile } from '../projects';
import { variantDef } from '../engine/variants';

const PI = Math.PI;
const Q4 = PI / 4;
const E = PI / 2;
const W = -PI / 2;

// длительности озвучки по сценам (с), см. lines.json
const VO = [5.33, 5.3, 4.39, 5.68, 5.73, 4.19, 3.88, 4.92, 5.54, 5.51, 6.21];
const LEAD = 0.12;
const D = VO.map((v, i) => +(v + 0.2 + (i === VO.length - 1 ? 1.4 : 0)).toFixed(2));

const LINES: string[] = [
  'Хочешь больше сил и энергии каждый день? Вот семь простых привычек.',
  'Первая — сон. Ложись в одно и то же время и спи семь-восемь часов.',
  'Вторая — вода. Начинай утро со стакана воды.',
  'Третья — завтрак. Овощи, фрукты, белок — и поменьше сахара.',
  'Четвёртая — движение. Гуляй, ходи пешком, бери с собой собаку.',
  'Десять минут зарядки разгоняют тело и поднимают настроение.',
  'Двигаться может каждый — в любом возрасте и в любом теле.',
  'Пятая — меньше экранов. Убери телефон за час до сна.',
  'Шестая — отдых для головы. Дыши глубже и чаще выбирайся на природу.',
  'Седьмая — люди рядом. Общение и смех — лучшее лекарство.',
  'Начни с одной привычки уже сегодня. Подписывайся, чтобы не пропустить новые советы!',
];

const HEADS = ['7 ПРИВЫЧЕК\nЗДОРОВОЙ ЖИЗНИ', '1 · СОН', '2 · ВОДА', '3 · ЗАВТРАК', '4 · ДВИЖЕНИЕ', 'ЗАРЯДКА', 'ДЛЯ ВСЕХ', '5 · МЕНЬШЕ ЭКРАНОВ', '6 · ОТДЫХ', '7 · ЛЮДИ РЯДОМ', 'НАЧНИ СЕГОДНЯ'];

// ---------- помощники ----------

type PP = [kind: string, x: number, z: number, ry?: number, color?: string | null, scale?: number, y?: number];
const props = (list: PP[]): Prop[] => list.map(([kind, x, z, ry = 0, color = null, scale = 1, y = 0]) => newProp(kind, { x, z, ry, color, scale, y }));
const act = (type: string, start: number, duration: number, speed = 1): ActionClip => ({ id: uid(), type, start, duration, speed });
const K = (t: number, x: number, z: number, ry: number, y = 0): MoveKey => ({ id: uid(), t, x, y, z, ry });
function A(variant: FigureVariant, color: string | null, x: number, z: number, ry: number, actions: ActionClip[] = [], keys: MoveKey[] = [], extra: Partial<Actor> = {}): Actor {
  return newActor({ name: variantDef(variant).name, variant, color: color ?? variantDef(variant).color, x, z, ry, actions, keys, ...extra });
}
function C(t: number, tx: number, ty: number, tz: number, zoom: number, az: number, el: number): CameraKey {
  return { id: uid(), t, ease: 'smooth', target: [tx, ty, tz], azimuth: az, elevation: el, distance: 40, zoom };
}
function S(i: number, bg: string, floor: string, transition: Transition = 'cut'): Scene {
  return newScene(HEADS[i].replace('\n', ' '), { duration: D[i], background: bg, floor, grid: false, transition });
}

const HERO = '#e07a5f';
const FRIEND = '#3d5a80';
const MINT = '#2a9d8f';

/** Комната: стены сзади (−Z) и слева (−X). */
function room(wall: string, withWindow = true): PP[] {
  return [
    [withWindow ? 'window_wall' : 'wall', -1.5, -3, 0, wall],
    ['wall', 1.5, -3, 0, wall],
    ['wall', -3, -1.5, E, wall],
    ['wall', -3, 1.5, E, wall],
  ];
}

// ---------- сцены ----------

function bedroom(night: boolean): PP[] {
  return [
    ...room(night ? '#c9c3dd' : '#f4e6d4'),
    ['bed', -1.3, -1.8, 0, night ? '#3d5a80' : '#e9c46a'],
    ['nightstand', -2.45, -2.55],
    ['wardrobe', -2.62, 1.0, E, '#e8dcc8'],
    ['round_rug', 0.7, 0.4, 0, night ? '#7b6fa3' : '#e9c46a', 0.9],
    ['monstera', 1.1, -2.45],
    ['picture', -1.3, -2.9],
    ['wall_clock', -2.92, -0.4, E],
    ['pet_bed', 1.6, 1.2, 0, '#b56576'],
    ['lamp', 2.3, -2.4, -0.7, '#e9c46a'],
  ];
}

function scenes(): Scene[] {
  const out: Scene[] = [];

  // 0 — утро, потягивается
  {
    const s = S(0, '#fde8d7', '#f3e3cf', 'fade-black');
    s.props = props(bedroom(false));
    s.actors = [
      A('woman', HERO, 0.5, 0.2, Q4, [act('stretch', 0, 2.9), act('wave', 2.9, D[0] - 2.9)]),
      A('cat', null, 1.6, 1.2, Q4 + 0.6, [act('q_sleep', 0, 2.2), act('cat_stretch', 2.2, 3.0), act('cat_tail', 5.2, 1)]),
    ];
    s.cameraKeys = [C(0, 0.6, 1.0, 0.3, 2.1, Q4 - 0.3, 0.42), C(D[0], 0.0, 0.85, -0.2, 1.3, Q4 + 0.12, 0.55)];
    out.push(s);
  }
  // 1 — ночь, сон
  {
    const s = S(1, '#141a33', '#262c48', 'fade-black');
    s.props = props(bedroom(true));
    s.actors = [
      A('woman', HERO, -1.3, -1.81, 0, [act('lie', 0, D[1])], [], { y: 0.5 }),
      A('cat', '#8d8d8d', 1.6, 1.2, -0.4, [act('q_sleep', 0, D[1])]),
    ];
    s.cameraKeys = [C(0, -1.0, 0.5, -1.4, 1.45, Q4 - 0.45, 0.85), C(D[1], -1.1, 0.5, -1.6, 1.85, Q4 + 0.2, 0.7)];
    out.push(s);
  }
  // 2 — кухня, вода
  {
    const s = S(2, '#dff3f1', '#f2ede4', 'fade-white');
    s.props = props([
      ...room('#e6f2ef'),
      ['kitchen', 0.3, -2.6, 0, '#7fb7be'],
      ['fridge', -2.4, -2.55],
      ['bottle', 0.95, -2.45, 0, '#7fc4e8', 1, 0.9],
      ['fruit_bowl', -0.45, -2.5, 0, null, 1, 0.9],
      ['cactus', 1.35, -2.6, 0, null, 0.9, 0.9],
      ['monstera', 2.2, -1.9],
      ['round_rug', 0.3, -0.6, 0, '#a8dadc', 0.7],
    ]);
    s.actors = [A('woman', HERO, 0.3, -1.35, Q4, [act('drink', 0.05, 3.0), act('nod', 3.05, D[2] - 3.05)])];
    s.cameraKeys = [C(0, 0.3, 1.3, -1.35, 2.5, Q4 + 0.35, 0.28), C(D[2], 0.25, 1.05, -1.5, 1.75, Q4 - 0.05, 0.4)];
    out.push(s);
  }
  // 3 — завтрак
  {
    const s = S(3, '#fff2dc', '#f1e6d2');
    s.props = props([
      ...room('#f6ead6'),
      ['kitchen', 0.6, -2.6, 0, '#e9c46a'],
      ['table', 0, 0, 0, '#f4f1ea'],
      ['chair', -0.35, -0.6, 0, '#bc6c25'],
      ['chair', 0.35, 0.6, PI, '#bc6c25'],
      ['fruit_bowl', 0, 0, 0, null, 1.2, 0.77],
      ['mug', -0.42, -0.18, 0.4, MINT, 1, 0.77],
      ['mug', 0.42, 0.18, -2.4, '#e76f51', 1, 0.77],
      ['tulips', 0.48, -0.22, 0, '#e76f51', 0.45, 0.77],
      ['monstera', -2.3, -2.3],
      ['picture', 2.0, -2.9],
    ]);
    s.actors = [
      A('woman', HERO, -0.35, -0.6, 0, [act('sit_chair', 0, D[3])]),
      A('man', FRIEND, 0.35, 0.6, PI, [act('sit_chair', 0, D[3])]),
      A('dog', null, 1.15, 0.15, -1.9, [act('dog_beg', 0, 3.2), act('dog_wag', 3.2, D[3] - 3.2)]),
    ];
    s.cameraKeys = [C(0, 0.2, 0.75, 0, 1.55, Q4 - 0.55, 0.55), C(D[3], 0.2, 0.75, 0, 1.95, Q4 + 0.35, 0.45)];
    out.push(s);
  }
  // 4 — прогулка в парке с собакой
  {
    const s = S(4, '#e4f3e6', '#bcd99a', 'fade-white');
    const d = D[4];
    s.props = props([
      ['sidewalk', -8, 0, 0, '#e6dfd2'], ['sidewalk', -4, 0, 0, '#e6dfd2'], ['sidewalk', 0, 0, 0, '#e6dfd2'], ['sidewalk', 4, 0, 0, '#e6dfd2'], ['sidewalk', 8, 0, 0, '#e6dfd2'],
      ['oak', -6, -3.4], ['birch', -2.2, -3.6], ['apple_tree', 1.6, -3.4], ['pine', 5.5, -3.9], ['birch', 8.5, -3.2, 1],
      ['hedge', -3.8, -1.7, 0, null, 0.8], ['bench', 0.2, -1.65], ['streetlight', -1.4, -1.45, 0], ['streetlight', 6.0, -1.45, 0],
      ['flower_bed', -4.4, 2.4, 0, '#e76f51', 0.8], ['tulips', 2.4, 1.6, 0, '#f4a261'], ['grass', -1.2, 1.7], ['grass', 4.6, 1.9], ['rocks', 7.0, 2.0, 0, null, 0.6],
      ['trash_can', 1.3, -1.45], ['bush', 3.2, -1.9], ['bush', -7.5, -1.8],
    ]);
    const x0 = -3.6, x1 = 3.9;
    s.actors = [
      A('woman', HERO, x0, 0, E, [], [K(0, x0, 0.05, E), K(d, x1, 0.05, E)]),
      A('dog', null, x0 + 0.4, 0.75, E, [], [K(0, x0 + 0.4, 0.75, E), K(d, x1 + 0.4, 0.75, E)]),
      A('oldman', null, 5.2, -0.7, W, [], [K(0, 5.2, -0.7, W), K(d, 1.4, -0.7, W)]),
      A('cat', '#3a3a3a', 0.6, -1.6, 0.3, [act('q_sit', 0, d)]),
    ];
    s.cameraKeys = [C(0, x0 + 0.5, 0.8, 0, 1.3, 0.38, 0.38), C(d, x1 + 0.3, 0.8, 0, 1.3, 0.6, 0.42)];
    out.push(s);
  }
  // 5 — зарядка на лужайке
  {
    const s = S(5, '#e6f4ff', '#c4e2a4');
    const d = D[5];
    s.props = props([
      ['rug', 0, 0.9, Q4, '#f4a261', 0.42], ['rug', -1.4, -0.2, Q4, '#2a9d8f', 0.42], ['rug', 1.4, -0.2, Q4, '#e9c46a', 0.42], ['rug', 0, -1.3, Q4, '#e76f51', 0.42],
      ['oak', -3.5, -3.5], ['pine', 0.2, -4.4], ['birch', 3.2, -3.2], ['hedge', -1.5, -2.6, 0, null, 0.9], ['bush', 2.6, 1.8], ['flower_bed', -2.9, 1.9, 0, '#9b5de5', 0.7],
      ['bottle', 0.6, 1.4, 0, '#7fc4e8'], ['towel', -0.7, 1.45, 0.3, '#f1faee'],
    ]);
    s.actors = [
      A('woman', HERO, 0, 0.9, Q4, [act('jump', 0, d, 1.1)]),
      A('fat', null, -1.4, -0.2, Q4, [act('squat', 0, d)]),
      A('tall', null, 1.4, -0.2, Q4, [act('stretch', 0, d)]),
      A('man', FRIEND, 0, -1.3, Q4, [act('kick', 0, d)]),
      A('dog', '#d9a066', 1.5, 1.4, Q4 + 0.8, [act('q_jump', 0, d)]),
    ];
    s.cameraKeys = [C(0, 0, 0.8, -0.1, 1.15, Q4 - 0.55, 0.3), C(d, 0, 0.8, -0.1, 1.25, Q4 + 0.45, 0.38)];
    out.push(s);
  }
  // 6 — двигаться может каждый: площадь с фонтаном
  {
    const s = S(6, '#fdf0e3', '#e7dfd1');
    const d = D[6];
    s.props = props([
      ['fountain', 0.2, -2.6], ['planter', -3.0, -2.2], ['planter', 3.4, -2.2], ['bollards', -1.6, 2.4, 0, null, 0.9], ['street_clock', 3.6, -1.8],
      ['oak', -5, -4.5], ['birch', 5.2, -4.2], ['tulips', -3.2, 0.9, 0, '#e63946'], ['flower_bed', 4.6, -0.4, 0, '#f4a261', 0.6],
    ]);
    s.actors = [
      A('wheelchair', null, -3.0, 1.5, E, [], [K(0, -3.0, 1.5, E), K(d, 1.8, 1.5, E)]),
      A('oldwoman', null, -2.2, 0.2, E, [], [K(0, -2.2, 0.2, E), K(d, 0.2, 0.2, E)]),
      A('tall', null, 3.8, -0.8, W, [], [K(0, 3.8, -0.8, W), K(d, -6.0, -0.8, W)]),
      A('fat', null, 2.3, -0.5, -2.4, [act('wave', 0, d)]),
    ];
    s.cameraKeys = [C(0, -0.8, 0.8, 0.3, 1.05, Q4 + 0.1, 0.44), C(d, 0.6, 0.8, 0.4, 1.2, Q4 - 0.15, 0.4)];
    out.push(s);
  }
  // 7 — вечер, телефон
  {
    const s = S(7, '#2b2d42', '#4a4e69', 'fade-black');
    const d = D[7];
    s.props = props([
      ...room('#cbc0d3'),
      ['sofa', -1.9, -0.8, E, '#6d597a'],
      ['tv', 2.3, -0.8, W],
      ['bookshelf', 0.9, -2.75, 0, '#7f5539'],
      ['lamp', -2.35, -2.35, 0.7, '#e9c46a'],
      ['round_rug', 0.1, -0.7, 0, '#b56576', 0.9],
      ['coffee_table', -0.6, -0.8, E],
      ['floor_vase', 2.4, -2.5],
      ['pet_bed', 1.4, 1.0, 0, '#e5989b'],
      ['wall_clock', -0.9, -2.92],
    ]);
    s.actors = [
      A('woman', HERO, 0.4, 0.15, Q4, [act('phone', 0, 2.4), act('stretch', 2.45, d - 2.45)]),
      A('cat', '#d9893b', 1.4, 1.0, 0.8, [act('q_sleep', 0, d)]),
    ];
    s.cameraKeys = [C(0, 0.4, 1.15, 0.1, 2.1, Q4 + 0.25, 0.4), C(d, 0.2, 1.0, -0.2, 1.5, Q4 - 0.15, 0.5)];
    out.push(s);
  }
  // 8 — природа на закате
  {
    const s = S(8, '#f7cfb0', '#b7d495', 'fade-white');
    const d = D[8];
    s.props = props([
      ['pond', 1.6, -1.5],
      ['birch', -2.2, -3.2], ['birch', 0.4, -4.0, 1], ['birch', 3.8, -3.4, 2], ['pine', -4.2, -2.0], ['pine', 5.6, -1.4], ['oak', -5.5, -4.8],
      ['rocks', 3.4, 0.4, 0, null, 0.7], ['grass', -0.4, 1.5], ['grass', 2.2, 1.2], ['grass', -3.4, 0.6], ['tulips', -2.6, 1.6, 0, '#f4a261', 0.8], ['stump', -3.0, -0.6], ['log', 0.2, 2.2, 0.4],
      ['round_rug', -1.2, 0.3, 0, '#e9c46a', 0.5],
    ]);
    s.actors = [
      A('woman', HERO, -1.2, 0.3, 0.95, [act('sit_floor', 0, d)]),
      A('deer', null, -3.0, -1.7, 0.7, [act('horse_graze', 0, d)]),
      A('deer', '#b07d48', 4.2, -2.4, -1.1, [act('deer_alert', 0, d)], [], { scale: 0.85 }),
    ];
    s.cameraKeys = [C(0, 0.2, 0.7, -0.6, 0.85, Q4 - 0.25, 0.42), C(d, -0.6, 0.6, -0.3, 1.18, Q4 + 0.15, 0.34)];
    out.push(s);
  }
  // 9 — друзья у кафе
  {
    const s = S(9, '#fff0e3', '#e8ddcf');
    const d = D[9];
    s.props = props([
      ['cafe_set', 1.9, -1.6, 0.3, '#e76f51'],
      ['kiosk', 3.8, -3.6, -0.2, '#2a9d8f'],
      ['advert_column', -3.8, -3.2],
      ['bench', -2.6, -1.6],
      ['planter', -4.4, -0.6],
      ['birch', -1.0, -4.4], ['oak', 6.2, -2.0],
      ['bicycle', 0.0, -2.8, 1.2, '#e63946'],
      ['tulips', -1.4, 2.0, 0, '#e63946', 0.8],
    ]);
    s.actors = [
      A('woman', HERO, -0.55, 0.25, 0.9, [act('laugh', 0, 2.6), act('talk', 2.6, d - 2.6)]),
      A('man', FRIEND, 0.55, 0.65, -2.2, [act('talk', 0, 2.6), act('laugh', 2.6, d - 2.6)]),
      A('woman', MINT, -0.15, 1.35, 2.8, [act('clap', 0, 1.8), act('laugh', 1.8, d - 1.8)]),
      A('oldman', null, -2.95, -1.6, 0, [act('sit_chair', 0, d)]),
      A('oldwoman', null, -2.25, -1.6, 0, [act('sit_chair', 0, d)]),
      A('dog', null, 1.0, 1.6, -2.6, [act('dog_wag', 0, d)]),
    ];
    s.cameraKeys = [C(0, -0.4, 1.0, 0.2, 1.55, Q4 + 0.45, 0.4), C(d, -0.6, 0.95, 0.0, 1.25, Q4 - 0.25, 0.48)];
    out.push(s);
  }
  // 10 — финал: все вместе
  {
    const s = S(10, '#ffe6d2', '#d4ecb8', 'fade-white');
    const d = D[10];
    s.props = props([
      ['fountain', 0, -4.2], ['oak', -4.5, -4.2], ['birch', 4.2, -4.6], ['pine', -6.2, -1.8], ['apple_tree', 6.0, -1.6],
      ['flower_bed', -3.6, 2.4, 0, '#e76f51', 0.8], ['flower_bed', 3.8, 2.2, 0, '#9b5de5', 0.8], ['hedge', -2.4, -2.6, 0, null, 0.8], ['hedge', 2.4, -2.6, 0, null, 0.8],
    ]);
    const cast: [FigureVariant, string | null, number, number, string, number?][] = [
      ['woman', HERO, 0, 0.6, 'cheer'],
      ['man', FRIEND, 1.0, 0.2, 'wave'],
      ['woman', MINT, -1.0, 0.2, 'clap'],
      ['fat', null, 2.0, -0.4, 'dance'],
      ['tall', null, -2.0, -0.4, 'wave'],
      ['wheelchair', null, 2.9, -1.2, 'wc_spin'],
      ['oldman', null, -2.9, -1.2, 'old_cane'],
      ['oldwoman', null, -1.6, -1.6, 'clap'],
      ['robot', null, 1.5, -1.7, 'robot_dance'],
      ['dog', null, 0.7, 1.6, 'dog_wag'],
      ['cat', null, -0.8, 1.6, 'cat_tail'],
      ['horse', null, -3.4, -3.0, 'horse_neigh'],
      ['deer', null, 3.6, -3.0, 'deer_alert'],
    ];
    s.actors = cast.map(([v, c, x, z, a]) => A(v, c, x, z, Q4 + 0.1 - x * 0.06, [act(a, 0, d)]));
    s.cameraKeys = [C(0, 0, 1.0, 0.3, 1.55, Q4, 0.4), C(3.6, 0, 1.0, -0.4, 0.95, Q4 + 0.2, 0.5), C(d, 0, 1.0, -0.6, 0.82, Q4 + 0.32, 0.56)];
    out.push(s);
  }
  return out;
}

// ---------- текст и стикеры ----------

/** Перенос по словам: не длиннее n символов в строке. */
function wrap(s: string, n = 24) {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > n) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

function texts(starts: number[]): TextClip[] {
  const out: TextClip[] = [];
  LINES.forEach((line, i) => {
    const st = starts[i];
    // субтитры по предложениям, время — пропорционально длине
    const parts = line.match(/[^.?!]+[.?!]*/g)!.map((x) => x.trim()).filter(Boolean);
    const total = parts.reduce((a, p) => a + p.length, 0);
    let t = st + LEAD;
    const speech = VO[i];
    parts.forEach((p, k) => {
      const dur = (p.length / total) * speech;
      const end = k === parts.length - 1 ? st + D[i] - 0.02 : t + dur;
      out.push({
        id: uid(), text: wrap(p), start: t, duration: end - t, style: 'caption', position: 'bottom', color: '#ffffff', size: 0.95,
        font: 'Montserrat', bold: true, bg: '#101014', bgOpacity: 0.62, anim: 'fade', x: 0.5, y: 0.8, track: 2,
      });
      t = end;
    });
    // заголовок сцены
    const big = i === 0 || i === 10;
    out.push({
      id: uid(), text: HEADS[i], start: st + 0.05, duration: D[i] - 0.1, style: 'plain', position: 'top', color: '#ffffff', size: big ? 1.05 : 1.0,
      font: 'Unbounded', bold: true, stroke: '#1d1d1f', strokeWidth: 1.4, shadow: true, anim: 'pop', x: 0.5, y: big ? 0.15 : 0.12, track: 1,
    });
  });
  // финальный призыв
  const last = starts[10];
  out.push({
    id: uid(), text: 'ПОДПИШИСЬ ❤', start: last + 3.4, duration: D[10] - 3.45, style: 'plain', position: 'center', color: '#ffffff', size: 1.25,
    font: 'Russo One', bold: true, stroke: '#e63946', strokeWidth: 2.2, shadow: true, anim: 'pop', x: 0.5, y: 0.62, track: 3,
  });
  return out;
}

function stickers(starts: number[]): Overlay[] {
  const st = (sticker: string, sc: number, at: number, dur: number, x: number, y: number, scale: number, anim: Overlay['anim'], color?: string, rotation = 0): Overlay => ({
    id: uid(), type: 'sticker', sticker, color, start: starts[sc] + at, duration: dur, offset: 0, x, y, scale, rotation, opacity: 1, volume: 0, anim, track: 0,
  });
  return [
    st('e27', 0, 0.3, D[0] - 0.4, 0.83, 0.26, 0.14, 'pulse'),
    st('e22', 1, 0.4, D[1] - 0.5, 0.72, 0.3, 0.16, 'bounce'),
    st('sparkle', 2, 0.8, D[2] - 1, 0.75, 0.33, 0.12, 'pulse', '#7fdcff'),
    st('check', 3, 2.6, D[3] - 2.7, 0.82, 0.3, 0.13, 'pop'),
    st('e14', 5, 0.3, D[5] - 0.4, 0.8, 0.22, 0.13, 'wiggle'),
    st('e12', 6, 0.5, D[6] - 0.6, 0.18, 0.24, 0.13, 'bounce'),
    st('e34', 7, 0.3, D[7] - 0.4, 0.78, 0.31, 0.15, 'pop'),
    st('cross', 7, 2.4, D[7] - 2.5, 0.78, 0.31, 0.17, 'pop', '#e63946'),
    st('e29', 8, 0.5, D[8] - 0.6, 0.2, 0.25, 0.12, 'spin'),
    st('heart', 9, 1.0, D[9] - 1.1, 0.8, 0.27, 0.12, 'pulse', '#e63946'),
    st('heart', 10, 3.5, D[10] - 3.6, 0.25, 0.52, 0.1, 'bounce', '#ff6b8a', -0.3),
    st('heart', 10, 3.7, D[10] - 3.8, 0.76, 0.5, 0.12, 'bounce', '#e63946', 0.25),
    st('e20', 10, 0.4, 3.0, 0.82, 0.25, 0.13, 'pop'),
  ];
}

// ---------- проект ----------

export function buildProject(): Project {
  const sc = scenes();
  const starts: number[] = [];
  let t = 0;
  for (const s of sc) {
    starts.push(t);
    t += s.duration;
  }
  const total = t;
  const audioAssets = [
    ...VO.map((d, i) => ({ id: 'vo' + i, name: `Голос ${i + 1}`, duration: d })),
    { id: 'music', name: 'Спокойная музыка', duration: 66 },
  ];
  const audioClips: AudioClip[] = [
    ...VO.map((d, i) => ({ id: uid(), assetId: 'vo' + i, name: `Голос ${i + 1}`, start: starts[i] + LEAD, offset: 0, duration: d, volume: 1, fadeIn: 0, fadeOut: 0.05, track: 0 })),
    { id: uid(), assetId: 'music', name: 'Спокойная музыка', start: 0, offset: 0, duration: total, volume: 0.2, fadeIn: 1.2, fadeOut: 2.5, track: 1 },
  ];
  return {
    version: 1,
    name: 'ЗОЖ — 7 привычек',
    aspect: '9:16',
    frameBands: null,
    fps: 60,
    scenes: sc,
    texts: texts(starts),
    audioAssets,
    audioClips,
    mediaAssets: [],
    overlays: stickers(starts),
    filters: [{ id: uid(), filter: 'vignette', start: 0, duration: total, amount: 0.35, track: 0 }],
  };
}

// ---------- управление из puppeteer ----------

const g = window as unknown as Record<string, unknown>;
const project = buildProject();
g.__project = project;
g.__duration = project.scenes.reduce((a, s) => a + s.duration, 0);

g.loadAudio = async (id: string, b64: string, mime: string) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  await putAudioBlob(id, blob);
  await decodeAndCache(id, blob);
};

let result: Blob | null = null;
g.progress = 0;
g.runExport = async (fps = 60) => {
  const ac = new AbortController();
  const r = await exportVideo(project, { width: 1080, height: 1920, fps }, (f) => (g.progress = f), ac.signal);
  result = r.blob;
  return { size: r.blob.size, ext: r.ext };
};
g.projectFile = async () => {
  result = await projectToFile(project);
  return result.size;
};
/** Кусок результата в base64 (для передачи в node). */
g.chunk = async (from: number, len: number) => {
  const s = await blobToBase64(result!.slice(from, from + len));
  return s.slice(s.indexOf(',') + 1);
};

// превью одного кадра
let fr: FrameRenderer | null = null;
g.frame = async (t: number, w = 540, h = 960) => {
  fr ??= new FrameRenderer(project, w, h);
  await fr.render(t);
  return fr.out.toDataURL('image/jpeg', 0.85);
};
g.__done = true;
