import * as THREE from 'three';
import { add, box, cyl, lathe, mat, rbox, shade } from './geo';
import { CHARCOAL, MAROON, NAVY, WHITE } from './palette';
import type { PropDef } from './props';

const ASPHALT = '#4b4e54';
const GLASS = '#26303d';

// ---------- автомобили ----------

/** Колесо в собственной группе: группа крутится вокруг X при езде. */
function wheel(g: THREE.Group, x: number, z: number, r: number, w: number, wheels: THREE.Object3D[]) {
  const wg = new THREE.Group();
  wg.position.set(x, r, z);
  add(wg, cyl(r, r, w, 22), mat('#1c1c1c', 0.9), 0, 0, 0, 0, 0, Math.PI / 2);
  const side = Math.sign(x);
  add(wg, cyl(r * 0.55, r * 0.55, 0.02, 16), mat('#b9b9b9', 0.35, { metalness: 0.4 }), side * (w / 2 + 0.005), 0, 0, 0, 0, Math.PI / 2);
  // спица — чтобы было видно вращение
  add(wg, box(0.025, r * 1.0, 0.07), mat('#6a6a6a', 0.5), side * (w / 2 + 0.015), 0, 0);
  g.add(wg);
  wheels.push(wg);
}

function lights(g: THREE.Group, front: number, back: number, y: number, x: number) {
  const head = mat('#fff7dc', 0.3, { emissive: '#fff1c0', emissiveIntensity: 0.7 });
  const tail = mat('#c0282e', 0.4, { emissive: '#a01218', emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    add(g, rbox(0.34, 0.12, 0.05, 0.02), head, s * x, y, front);
    add(g, rbox(0.3, 0.1, 0.05, 0.02), tail, s * x, y + 0.02, back);
  }
}

function mirrors(g: THREE.Group, c: string, x: number, y: number, z: number) {
  for (const s of [-1, 1]) add(g, rbox(0.14, 0.09, 0.08, 0.02), mat(c, 0.45), s * x, y, z);
}

function carBody(c: string) {
  return mat(c, 0.35, { metalness: 0.15 });
}

const sedan = (c: string) => {
  const g = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const body = carBody(c);
  add(g, rbox(1.76, 0.52, 3.9, 0.16), body, 0, 0.55, 0);
  // капот и багажник чуть ниже линии окон
  add(g, rbox(1.6, 0.1, 1.0, 0.05), body, 0, 0.82, 1.35);
  add(g, rbox(1.6, 0.1, 0.8, 0.05), body, 0, 0.82, -1.5);
  // салон: стекло по кругу и крыша
  add(g, rbox(1.5, 0.44, 1.95, 0.14), mat(GLASS, 0.15), 0, 1.03, -0.12);
  add(g, rbox(1.54, 0.07, 1.5, 0.05), body, 0, 1.25, -0.15);
  add(g, box(1.52, 0.4, 0.07), body, 0, 1.03, -0.12); // средняя стойка
  add(g, rbox(1.8, 0.16, 0.12, 0.05), mat(CHARCOAL, 0.6), 0, 0.38, 1.96);
  add(g, rbox(1.8, 0.16, 0.12, 0.05), mat(CHARCOAL, 0.6), 0, 0.38, -1.96);
  lights(g, 1.95, -1.95, 0.62, 0.6);
  mirrors(g, c, 0.86, 0.95, 0.75);
  for (const [x, z] of [[-0.82, 1.25], [0.82, 1.25], [-0.82, -1.25], [0.82, -1.25]]) wheel(g, x, z, 0.34, 0.24, wheels);
  g.userData.wheels = wheels;
  g.userData.wheelR = 0.34;
  return g;
};

const hatchback = (c: string) => {
  const g = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const body = carBody(c);
  add(g, rbox(1.7, 0.55, 3.4, 0.18), body, 0, 0.57, 0);
  add(g, rbox(1.56, 0.12, 0.9, 0.06), body, 0, 0.85, 1.15);
  add(g, rbox(1.5, 0.55, 2.2, 0.16), mat(GLASS, 0.15), 0, 1.1, -0.45);
  add(g, rbox(1.54, 0.08, 1.95, 0.05), body, 0, 1.38, -0.5);
  add(g, box(1.52, 0.5, 0.07), body, 0, 1.1, -0.3);
  add(g, rbox(1.4, 0.4, 0.05, 0.03), body, 0, 1.08, -1.55); // задняя дверь
  add(g, rbox(1.74, 0.16, 0.12, 0.05), mat(CHARCOAL, 0.6), 0, 0.38, 1.71);
  add(g, rbox(1.74, 0.16, 0.12, 0.05), mat(CHARCOAL, 0.6), 0, 0.38, -1.71);
  lights(g, 1.7, -1.7, 0.66, 0.58);
  mirrors(g, c, 0.83, 0.98, 0.6);
  for (const [x, z] of [[-0.8, 1.08], [0.8, 1.08], [-0.8, -1.08], [0.8, -1.08]]) wheel(g, x, z, 0.32, 0.22, wheels);
  g.userData.wheels = wheels;
  g.userData.wheelR = 0.32;
  return g;
};

const pickup = (c: string) => {
  const g = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const body = carBody(c);
  add(g, rbox(1.86, 0.6, 4.6, 0.14), body, 0, 0.72, 0);
  add(g, rbox(1.7, 0.14, 1.2, 0.06), body, 0, 1.05, 1.6);
  // кабина впереди
  add(g, rbox(1.66, 0.55, 1.45, 0.14), mat(GLASS, 0.15), 0, 1.3, 0.35);
  add(g, rbox(1.7, 0.08, 1.2, 0.05), body, 0, 1.6, 0.3);
  add(g, box(1.68, 0.5, 0.07), body, 0, 1.3, 0.4);
  // открытый кузов сзади
  const bed = mat(shade(c, 0.85), 0.5);
  add(g, box(1.7, 0.04, 2.1), mat('#2a2a2a', 0.9), 0, 1.03, -1.2);
  for (const s of [-1, 1]) add(g, rbox(0.08, 0.36, 2.15, 0.03), bed, s * 0.89, 1.2, -1.2);
  add(g, rbox(1.86, 0.36, 0.08, 0.03), bed, 0, 1.2, -2.27);
  add(g, rbox(1.86, 0.36, 0.08, 0.03), bed, 0, 1.2, -0.17);
  add(g, rbox(1.96, 0.2, 0.14, 0.05), mat('#9a9a9a', 0.4, { metalness: 0.4 }), 0, 0.45, 2.3);
  add(g, rbox(1.96, 0.2, 0.14, 0.05), mat(CHARCOAL, 0.6), 0, 0.45, -2.3);
  lights(g, 2.3, -2.3, 0.85, 0.66);
  mirrors(g, c, 0.95, 1.25, 0.95);
  for (const [x, z] of [[-0.86, 1.45], [0.86, 1.45], [-0.86, -1.45], [0.86, -1.45]]) wheel(g, x, z, 0.4, 0.28, wheels);
  g.userData.wheels = wheels;
  g.userData.wheelR = 0.4;
  return g;
};

// ---------- улица ----------

function roadBase(g: THREE.Group, c: string) {
  const a = add(g, box(4, 0.04, 5), mat(c, 0.95), 0, 0.02, 0);
  a.castShadow = false;
}

export const STREET_PROPS: PropDef[] = [
  { kind: 'sedan', label: 'Седан', icon: '🚗', cat: 'Транспорт', color: NAVY, radius: 2.1, vehicle: true, build: sedan },
  { kind: 'hatchback', label: 'Хэтчбек', icon: '🚙', cat: 'Транспорт', color: MAROON, radius: 1.8, vehicle: true, build: hatchback },
  { kind: 'pickup', label: 'Пикап', icon: '🛻', cat: 'Транспорт', color: '#4a6a5a', radius: 2.4, vehicle: true, build: pickup },
  {
    kind: 'road', label: 'Дорога', icon: '🛣️', cat: 'Улица', color: ASPHALT, radius: 2.4,
    build: (c) => {
      const g = new THREE.Group();
      roadBase(g, c);
      const paint = mat('#f1f1f1', 0.6);
      for (const x of [-1.25, 1.25]) add(g, box(1.1, 0.005, 0.12), paint, x, 0.043, 0);
      for (const z of [-2.3, 2.3]) add(g, box(4, 0.005, 0.1), paint, 0, 0.043, z);
      return g;
    },
  },
  {
    kind: 'crosswalk', label: 'Пешеходный переход', icon: '🦓', cat: 'Улица', color: ASPHALT, radius: 2.4,
    build: (c) => {
      const g = new THREE.Group();
      roadBase(g, c);
      const paint = mat('#f1f1f1', 0.6);
      for (let z = -2.0; z <= 2.01; z += 0.8) add(g, box(2.4, 0.005, 0.42), paint, 0, 0.043, z);
      for (const z of [-2.3, 2.3]) {
        add(g, box(0.6, 0.005, 0.1), paint, -1.7, 0.043, z);
        add(g, box(0.6, 0.005, 0.1), paint, 1.7, 0.043, z);
      }
      return g;
    },
  },
  {
    kind: 'parking', label: 'Парковочное место', icon: '🅿️', cat: 'Улица', color: ASPHALT, radius: 2.2,
    build: (c) => {
      const g = new THREE.Group();
      const a = add(g, box(3, 0.04, 5.5), mat(c, 0.95), 0, 0.02, 0);
      a.castShadow = false;
      const paint = mat('#f1f1f1', 0.6);
      for (const x of [-1.45, 1.45]) add(g, box(0.1, 0.005, 4.6), paint, x, 0.043, -0.35);
      add(g, rbox(1.6, 0.05, 0.2, 0.02), mat('#9a9a9a', 0.9), 0, 0.045, -2.45);
      return g;
    },
  },
  {
    kind: 'sidewalk', label: 'Тротуар', icon: '⬜', cat: 'Улица', color: '#c9c9c9', radius: 2.1,
    build: (c) => {
      const g = new THREE.Group();
      const s = add(g, box(4, 0.12, 2), mat(c, 0.95), 0, 0.06, 0);
      s.castShadow = false;
      add(g, box(4, 0.14, 0.14), mat(shade(c, 0.82), 0.9), 0, 0.07, 0.95);
      for (const x of [-1.5, -0.5, 0.5, 1.5]) add(g, box(0.02, 0.005, 1.86), mat(shade(c, 0.88)), x + 0.5, 0.122, -0.05);
      add(g, box(4, 0.005, 0.02), mat(shade(c, 0.88)), 0, 0.122, -0.05);
      return g;
    },
  },
  {
    kind: 'streetlight', label: 'Фонарь', icon: '🏮', cat: 'Улица', color: CHARCOAL, radius: 0.4,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.5);
      add(g, cyl(0.12, 0.15, 0.3, 12), m, 0, 0.15, 0);
      add(g, cyl(0.05, 0.065, 3.6, 12), m, 0, 1.9, 0);
      add(g, cyl(0.035, 0.035, 0.95, 8), m, 0, 3.62, 0.42, Math.PI / 2 - 0.12, 0, 0);
      add(g, rbox(0.26, 0.12, 0.5, 0.04), m, 0, 3.68, 0.92);
      add(g, box(0.2, 0.02, 0.42), mat('#fff7dc', 0.3, { emissive: '#fff1c0', emissiveIntensity: 0.8 }), 0, 3.615, 0.92);
      return g;
    },
  },
  {
    kind: 'traffic_light', label: 'Светофор', icon: '🚦', cat: 'Улица', color: CHARCOAL, radius: 0.4,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.5);
      add(g, cyl(0.05, 0.06, 3.0, 10), m, 0, 1.5, 0);
      add(g, rbox(0.32, 0.86, 0.24, 0.05), m, 0, 2.75, 0.1);
      const on = (col: string, k: number) => mat(col, 0.3, { emissive: col, emissiveIntensity: k });
      add(g, cyl(0.08, 0.08, 0.03, 16), on('#d93a3a', 0.9), 0, 3.0, 0.23, Math.PI / 2, 0, 0);
      add(g, cyl(0.08, 0.08, 0.03, 16), on('#5a4a1a', 0.1), 0, 2.75, 0.23, Math.PI / 2, 0, 0);
      add(g, cyl(0.08, 0.08, 0.03, 16), on('#1f4a2a', 0.1), 0, 2.5, 0.23, Math.PI / 2, 0, 0);
      add(g, rbox(0.2, 0.3, 0.14, 0.03), m, 0.0, 1.1, 0.1);
      return g;
    },
  },
  {
    kind: 'house', label: 'Дом', icon: '🏠', cat: 'Улица', color: '#e8e2d9', radius: 2.6,
    build: (c) => {
      const g = new THREE.Group();
      const wall = mat(c, 0.95);
      add(g, box(4, 2.8, 3.4), wall, 0, 1.4, 0);
      add(g, box(4.08, 0.25, 3.48), mat(shade(c, 0.8), 0.9), 0, 0.125, 0);
      // двускатная крыша
      const tri = new THREE.Shape([new THREE.Vector2(-2.3, 0), new THREE.Vector2(2.3, 0), new THREE.Vector2(0, 1.45)]);
      const roof = new THREE.ExtrudeGeometry(tri, { depth: 3.8, bevelEnabled: false });
      roof.translate(0, 0, -1.9);
      add(g, roof, mat(MAROON, 0.8), 0, 2.8, 0);
      add(g, box(0.4, 0.9, 0.4), mat(shade(MAROON, 0.8), 0.8), 1.1, 3.6, -0.6);
      // фасад (+z): дверь и окна
      add(g, box(0.9, 1.9, 0.08), mat(NAVY, 0.6), -0.9, 0.95 + 0.25, 1.72);
      add(g, cyl(0.04, 0.04, 0.03, 10), mat('#c9a84a', 0.3), -0.6, 1.15, 1.77, Math.PI / 2, 0, 0);
      for (const x of [0.8]) {
        add(g, box(1.2, 1.0, 0.06), mat(GLASS, 0.15), x, 1.55, 1.71);
        add(g, box(1.3, 0.08, 0.14), mat(WHITE, 0.6), x, 1.0, 1.75);
        add(g, box(0.05, 1.0, 0.08), mat(WHITE, 0.6), x, 1.55, 1.74);
      }
      for (const z of [-0.6, 0.8]) add(g, box(0.06, 0.9, 0.9), mat(GLASS, 0.15), 2.01, 1.6, z);
      add(g, box(1.3, 0.12, 0.8), mat('#9a9a9a'), -0.9, 0.06, 2.1);
      return g;
    },
  },
  {
    kind: 'apartment', label: 'Многоэтажка', icon: '🏢', cat: 'Улица', color: '#d6d3cf', radius: 3,
    build: (c) => {
      const g = new THREE.Group();
      add(g, box(5, 7.6, 4), mat(c, 0.95), 0, 3.8, 0);
      add(g, box(5.1, 0.3, 4.1), mat(shade(c, 0.8)), 0, 7.65, 0);
      add(g, box(5.04, 0.4, 4.04), mat(shade(c, 0.75)), 0, 0.2, 0);
      const glass = mat(GLASS, 0.15);
      const sill = mat(WHITE, 0.6);
      for (let f = 0; f < 3; f++) {
        const y = 2.0 + f * 2.35;
        for (const x of [-1.8, -0.6, 0.6, 1.8]) {
          if (f === 0 && Math.abs(x) < 1) continue;
          add(g, box(0.8, 1.15, 0.06), glass, x, y, 2.01);
          add(g, box(0.92, 0.07, 0.16), sill, x, y - 0.62, 2.05);
        }
        for (const z of [-1.2, 0, 1.2]) add(g, box(0.06, 1.15, 0.7), glass, 2.51, y, z);
        add(g, box(5.02, 0.08, 4.02), mat(shade(c, 0.9)), 0, y - 1.05, 0);
      }
      // подъезд
      add(g, box(1.3, 2.1, 0.08), mat(GLASS, 0.15), 0, 1.25, 2.02);
      add(g, box(0.05, 2.1, 0.1), mat(CHARCOAL), 0, 1.25, 2.04);
      add(g, box(1.8, 0.1, 0.9), mat(CHARCOAL, 0.5), 0, 2.5, 2.4);
      return g;
    },
  },
  {
    kind: 'shop', label: 'Магазин', icon: '🏪', cat: 'Улица', color: '#ececec', radius: 2.6,
    build: (c) => {
      const g = new THREE.Group();
      add(g, box(4.5, 3.2, 3.4), mat(c, 0.95), 0, 1.6, 0);
      add(g, box(4.56, 0.2, 3.46), mat(shade(c, 0.8)), 0, 3.25, 0);
      add(g, box(3.0, 1.6, 0.06), mat(GLASS, 0.12), -0.5, 1.25, 1.71);
      add(g, box(0.9, 2.0, 0.06), mat(GLASS, 0.12), 1.55, 1.05, 1.71);
      add(g, box(0.05, 2.0, 0.1), mat(CHARCOAL), 1.55, 1.05, 1.74);
      add(g, box(4.5, 0.55, 0.12), mat(CHARCOAL, 0.6), 0, 2.7, 1.74);
      add(g, box(2.6, 0.3, 0.02), mat(WHITE, 0.4, { emissive: '#ffffff', emissiveIntensity: 0.25 }), 0, 2.7, 1.81);
      // полосатый навес
      for (let i = 0; i < 9; i++) {
        const a = add(g, box(0.5, 0.04, 1.0), mat(i % 2 ? WHITE : MAROON, 0.8), -2.0 + i * 0.5, 2.25, 2.1);
        a.rotation.x = 0.35;
      }
      return g;
    },
  },
  {
    kind: 'bus_stop', label: 'Остановка', icon: '🚏', cat: 'Улица', color: CHARCOAL, radius: 1.7,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.5);
      for (const x of [-1.45, 1.45]) for (const z of [-0.6, 0.6]) add(g, box(0.07, 2.4, 0.07), m, x, 1.2, z);
      add(g, rbox(3.2, 0.1, 1.5, 0.03), m, 0, 2.45, 0);
      const glass = new THREE.MeshStandardMaterial({ color: '#c7d5e2', roughness: 0.1, transparent: true, opacity: 0.35 });
      const back = add(g, box(2.9, 1.8, 0.03), glass, 0, 1.25, -0.6);
      back.castShadow = false;
      add(g, box(0.03, 1.8, 1.2), glass, -1.45, 1.25, 0).castShadow = false;
      add(g, rbox(2.2, 0.06, 0.4, 0.02), mat('#7a5a3f'), 0, 0.46, -0.35);
      for (const x of [-0.9, 0.9]) add(g, box(0.05, 0.44, 0.3), m, x, 0.22, -0.35);
      add(g, cyl(0.035, 0.035, 2.8, 8), m, 1.9, 1.4, 0.5);
      add(g, rbox(0.5, 0.5, 0.04, 0.02), mat('#3a6aa8', 0.5), 1.9, 2.55, 0.5);
      add(g, box(0.3, 0.3, 0.045), mat(WHITE, 0.5), 1.9, 2.55, 0.5);
      return g;
    },
  },
  {
    kind: 'hydrant', label: 'Гидрант', icon: '🧯', cat: 'Улица', color: MAROON, radius: 0.25,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.45);
      add(g, lathe([[0.16, 0], [0.16, 0.06], [0.11, 0.08], [0.11, 0.55], [0.13, 0.57], [0.13, 0.62], [0.08, 0.7], [0.03, 0.74], [0, 0.75]], 20), m);
      for (const s of [-1, 1]) add(g, cyl(0.045, 0.045, 0.12, 12), m, s * 0.15, 0.42, 0, 0, 0, Math.PI / 2);
      add(g, cyl(0.06, 0.06, 0.1, 12), m, 0, 0.42, 0.13, Math.PI / 2, 0, 0);
      return g;
    },
  },
  {
    kind: 'road_sign', label: 'Дорожный знак', icon: '⛔', cat: 'Улица', color: '#d93a3a', radius: 0.3,
    build: (c) => {
      const g = new THREE.Group();
      add(g, cyl(0.03, 0.03, 2.4, 8), mat('#9a9a9a', 0.4, { metalness: 0.4 }), 0, 1.2, 0);
      add(g, cyl(0.32, 0.32, 0.03, 32), mat(c, 0.5), 0, 2.3, 0.03, Math.PI / 2, 0, 0);
      add(g, cyl(0.26, 0.26, 0.032, 32), mat(WHITE, 0.5), 0, 2.3, 0.032, Math.PI / 2, 0, 0);
      add(g, box(0.36, 0.08, 0.035), mat(c, 0.5), 0, 2.3, 0.04);
      return g;
    },
  },
  {
    kind: 'fence', label: 'Забор', icon: '🚧', cat: 'Улица', color: '#efefef', radius: 1.1,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.8);
      for (let i = 0; i < 9; i++) {
        const x = -0.96 + i * 0.24;
        add(g, box(0.12, 0.95, 0.04), m, x, 0.475, 0);
        add(g, new THREE.ConeGeometry(0.085, 0.1, 4), m, x, 1.0, 0, 0, Math.PI / 4, 0);
      }
      for (const y of [0.25, 0.75]) add(g, box(2.1, 0.08, 0.04), mat(shade(c, 0.88)), 0, y, -0.04);
      return g;
    },
  },
  {
    kind: 'bush', label: 'Куст', icon: '🌿', cat: 'Улица', color: '#5d8a52', radius: 0.6,
    build: (c) => {
      const g = new THREE.Group();
      const blob = (r: number, x: number, y: number, z: number, k: number) =>
        add(g, new THREE.IcosahedronGeometry(r, 1), new THREE.MeshStandardMaterial({ color: shade(c, k), roughness: 0.95, flatShading: true }), x, y, z, x, z, 0);
      blob(0.45, 0, 0.38, 0, 1);
      blob(0.33, 0.38, 0.3, 0.1, 1.12);
      blob(0.32, -0.35, 0.28, -0.08, 0.9);
      blob(0.28, 0.05, 0.62, -0.12, 1.06);
      return g;
    },
  },
];

