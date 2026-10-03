import * as THREE from 'three';
import { CHARCOAL, LIGHT_GRAY, MAROON, NAVY, STONE, WHITE } from './palette';

export interface PropDef {
  kind: string;
  label: string;
  icon: string;
  color: string;
  /** Радиус для выделения на полу. */
  radius: number;
  /** Раздел библиотеки (по умолчанию «Дом»). */
  cat?: PropCat;
  /** Транспорт: может ездить по ключам, колёса крутятся. */
  vehicle?: boolean;
  build: (color: string) => THREE.Group;
}

export type PropCat = 'Дом' | 'Улица' | 'Природа' | 'Транспорт';
export const PROP_CATS: PropCat[] = ['Дом', 'Природа', 'Улица', 'Транспорт'];

import { add, box, cyl, lathe, mat, mix, rbox, shade } from './geo';
import { STREET_PROPS } from './streetProps';
import { DECOR_PROPS } from './decorProps';

/** Лист растения: вытянутая форма, изогнутая дугой. */
function leafGeometry(len: number, width: number, bend: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(width, len * 0.25, width * 0.9, len * 0.75, 0, len);
  s.bezierCurveTo(-width * 0.9, len * 0.75, -width, len * 0.25, 0, 0);
  const g = new THREE.ShapeGeometry(s, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const x = p.getX(i);
    // дуга вдоль длины + желобок поперёк
    p.setZ(i, -bend * (y / len) ** 2 * len + Math.abs(x) * 0.35);
  }
  g.computeVertexNormals();
  return g;
}

export const PROPS: PropDef[] = [
  {
    kind: 'bed', label: 'Кровать', icon: '🛏️', color: NAVY, radius: 1.3,
    build: (c) => {
      const g = new THREE.Group();
      const frame = mat(CHARCOAL, 0.6);
      const cloth = mat(c, 0.95);
      const sheet = mat(WHITE, 0.95);
      for (const [x, z] of [[-0.68, -1.0], [0.68, -1.0], [-0.68, 1.0], [0.68, 1.0]]) add(g, box(0.07, 0.24, 0.07), frame, x, 0.12, z);
      add(g, rbox(1.44, 0.1, 2.08, 0.02), frame, 0, 0.27, 0);
      // изголовье
      add(g, rbox(1.46, 0.9, 0.08, 0.03), frame, 0, 0.52, -1.04);
      add(g, rbox(1.3, 0.5, 0.03, 0.015), mat(shade(CHARCOAL, 1.25), 0.7), 0, 0.68, -0.995);
      // матрас, одеяло с отворотом, подушки
      add(g, rbox(1.38, 0.2, 2.0, 0.06), sheet, 0, 0.42, 0);
      add(g, rbox(1.44, 0.07, 1.42, 0.03), cloth, 0, 0.55, 0.3);
      add(g, rbox(1.44, 0.3, 0.06, 0.03), cloth, 0, 0.42, 1.0);
      for (const sx of [-0.71, 0.71]) add(g, rbox(0.05, 0.3, 1.42, 0.02), cloth, sx, 0.42, 0.3);
      add(g, rbox(1.46, 0.09, 0.22, 0.04), sheet, 0, 0.56, -0.38);
      for (const x of [-0.34, 0.34]) {
        const pil = add(g, rbox(0.58, 0.14, 0.36, 0.07), mat(c === NAVY ? shade(c, 1.25) : WHITE, 0.95), x, 0.6, -0.76);
        pil.rotation.x = -0.12;
      }
      return g;
    },
  },
  {
    kind: 'chair', label: 'Стул', icon: '🪑', color: MAROON, radius: 0.45,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.6);
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) add(g, cyl(0.022, 0.017, 0.4, 10), m, x, 0.2, z);
      add(g, rbox(0.5, 0.05, 0.48, 0.02), m, 0, 0.42, 0);
      for (const x of [-0.2, 0.2]) add(g, cyl(0.02, 0.022, 0.5, 10), m, x, 0.68, -0.21);
      add(g, rbox(0.48, 0.16, 0.035, 0.015), m, 0, 0.84, -0.21);
      add(g, rbox(0.4, 0.035, 0.03, 0.01), m, 0, 0.64, -0.21);
      for (const z of [-0.2, 0.2]) add(g, box(0.4, 0.025, 0.025), m, 0, 0.12, z);
      return g;
    },
  },
  {
    kind: 'beanbag', label: 'Кресло-мешок', icon: '🫘', color: MAROON, radius: 0.6,
    build: (c) => {
      const g = new THREE.Group();
      const geo = new THREE.IcosahedronGeometry(0.55, 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        y *= 0.72;
        if (y < -0.2) y = -0.2 - (y + 0.2) * 0.15; // приплюснутое дно
        const r = Math.hypot(x, z);
        if (y > 0.1) y -= Math.max(0, 0.22 - r) * 0.55; // вмятина сверху
        y += Math.sin(x * 9) * 0.012 + Math.cos(z * 8) * 0.012;
        x *= 1.05;
        p.setXYZ(i, x, y + 0.36, z);
      }
      geo.computeVertexNormals();
      add(g, geo.toNonIndexed(), new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }));
      return g;
    },
  },
  {
    kind: 'plant', label: 'Растение', icon: '🪴', color: CHARCOAL, radius: 0.35,
    build: (c) => {
      const g = new THREE.Group();
      add(g, lathe([[0, 0], [0.12, 0], [0.155, 0.27], [0.17, 0.28], [0.17, 0.31], [0.15, 0.31], [0.14, 0.29], [0, 0.29]]), mat(STONE, 0.7));
      add(g, cyl(0.145, 0.145, 0.015, 24), mat('#3b342d', 1), 0, 0.29, 0);
      const leaf = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide });
      const stem = mat(shade(c, 0.8), 0.7);
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (i % 2) * 0.3;
        const len = 0.32 + (i % 3) * 0.06;
        const pivot = new THREE.Group();
        pivot.position.set(0, 0.3, 0);
        pivot.rotation.set(0, a, 0);
        const tilt = new THREE.Group();
        tilt.rotation.x = 0.35 + (i % 3) * 0.18;
        pivot.add(tilt);
        add(tilt, cyl(0.007, 0.009, 0.12, 5), stem, 0, 0.06, 0);
        const l = add(tilt, leafGeometry(len, 0.09, 0.45), leaf, 0, 0.1, 0);
        l.rotation.x = 0.1;
        g.add(pivot);
      }
      return g;
    },
  },
  {
    kind: 'lamp', label: 'Торшер', icon: '💡', color: MAROON, radius: 0.3,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.45);
      add(g, lathe([[0, 0], [0.18, 0], [0.19, 0.012], [0.16, 0.035], [0, 0.04]]), m);
      add(g, cyl(0.016, 0.016, 1.62, 10), m, 0, 0.84, 0);
      add(g, new THREE.SphereGeometry(0.028, 12, 8), m, 0, 1.66, 0);
      const arm = add(g, cyl(0.013, 0.013, 0.38, 8), m, 0, 1.73, 0.15, Math.PI / 2 - 0.35, 0, 0);
      void arm;
      const head = new THREE.Group();
      head.position.set(0, 1.79, 0.33);
      head.rotation.x = 0.5;
      add(head, lathe([[0.03, 0.08], [0.06, 0.06], [0.135, -0.12], [0.13, -0.125]], 24), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, side: THREE.DoubleSide }));
      add(head, new THREE.SphereGeometry(0.035, 12, 8), mat('#fff6dd', 0.3, { emissive: '#fff1c4', emissiveIntensity: 0.6 }), 0, -0.06, 0);
      g.add(head);
      return g;
    },
  },
  {
    kind: 'table', label: 'Стол', icon: '🟫', color: LIGHT_GRAY, radius: 0.85,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(1.4, 0.045, 0.8, 0.02), mat(c, 0.5), 0, 0.745, 0);
      const leg = mat(CHARCOAL, 0.5);
      for (const [x, z] of [[-0.64, -0.34], [0.64, -0.34], [-0.64, 0.34], [0.64, 0.34]]) add(g, rbox(0.045, 0.72, 0.045, 0.01), leg, x, 0.36, z);
      add(g, box(1.24, 0.06, 0.02), leg, 0, 0.69, -0.34);
      add(g, box(1.24, 0.06, 0.02), leg, 0, 0.69, 0.34);
      return g;
    },
  },
  {
    kind: 'sofa', label: 'Диван', icon: '🛋️', color: NAVY, radius: 1.1,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.95);
      const d = mat(shade(c, 0.82), 0.95);
      add(g, rbox(1.9, 0.24, 0.86, 0.06), d, 0, 0.2, 0);
      for (const x of [-0.45, 0.45]) {
        add(g, rbox(0.89, 0.15, 0.68, 0.07), m, x, 0.39, 0.07);
        add(g, rbox(0.86, 0.42, 0.18, 0.08), m, x, 0.62, -0.27, -0.12, 0, 0);
      }
      add(g, rbox(1.9, 0.52, 0.2, 0.07), d, 0, 0.5, -0.36);
      for (const x of [-0.96, 0.96]) add(g, rbox(0.18, 0.38, 0.86, 0.08), m, x, 0.43, 0);
      add(g, rbox(0.34, 0.3, 0.12, 0.06), mat(mix(c, WHITE, 0.65), 0.95), -0.62, 0.58, -0.17, -0.3, 0.25, 0.1);
      for (const [x, z] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]]) add(g, cyl(0.025, 0.018, 0.08, 8), mat(CHARCOAL), x, 0.04, z);
      return g;
    },
  },
  {
    kind: 'laptop', label: 'Ноутбук', icon: '💻', color: NAVY, radius: 0.35,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.45);
      add(g, rbox(0.5, 0.022, 0.34, 0.008), m, 0, 0.011, 0);
      // клавиши и тачпад
      const keyM = mat(shade(c, 0.7), 0.6);
      const keys = new THREE.InstancedMesh(box(0.028, 0.006, 0.026), keyM, 12 * 4);
      const mm = new THREE.Matrix4();
      let k = 0;
      for (let r = 0; r < 4; r++) for (let i = 0; i < 12; i++) keys.setMatrixAt(k++, mm.makeTranslation(-0.198 + i * 0.036, 0.024, -0.105 + r * 0.034));
      keys.castShadow = true;
      g.add(keys);
      add(g, box(0.14, 0.003, 0.08), keyM, 0, 0.023, 0.1);
      const lid = new THREE.Group();
      lid.position.set(0, 0.022, -0.17);
      lid.rotation.x = -0.32;
      add(lid, rbox(0.5, 0.33, 0.018, 0.008), m, 0, 0.165, -0.005);
      add(lid, box(0.45, 0.28, 0.004), mat('#1d2230', 0.25, { emissive: '#2b3550', emissiveIntensity: 0.4 }), 0, 0.17, 0.006);
      g.add(lid);
      return g;
    },
  },
  {
    kind: 'books', label: 'Книги', icon: '📚', color: NAVY, radius: 0.3,
    build: (c) => {
      const g = new THREE.Group();
      const page = mat(WHITE, 0.9);
      let y = 0;
      const book = (col: string, r: number, h: number, w = 0.42, d = 0.3) => {
        const bg = new THREE.Group();
        bg.position.y = y;
        bg.rotation.y = r;
        add(bg, rbox(w, 0.012, d, 0.005), mat(col, 0.7), 0, 0.006, 0);
        add(bg, rbox(w, 0.012, d, 0.005), mat(col, 0.7), 0, h - 0.006, 0);
        add(bg, rbox(0.014, h, d, 0.006), mat(col, 0.7), -w / 2 + 0.007, h / 2, 0);
        add(bg, box(w - 0.03, h - 0.022, d - 0.016), page, 0.008, h / 2, 0);
        g.add(bg);
        y += h;
      };
      book(MAROON, 0.12, 0.075);
      book(c, -0.06, 0.085);
      book(STONE, 0.2, 0.05, 0.34, 0.24);
      return g;
    },
  },
  {
    kind: 'mug', label: 'Кружка', icon: '☕', color: MAROON, radius: 0.15,
    build: (c) => {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, side: THREE.DoubleSide });
      add(g, lathe([[0, 0], [0.06, 0], [0.065, 0.01], [0.065, 0.14], [0.058, 0.14], [0.058, 0.012], [0, 0.012]]), m);
      add(g, cyl(0.057, 0.057, 0.004), mat('#2a1810', 0.2), 0, 0.115, 0);
      add(g, new THREE.TorusGeometry(0.038, 0.011, 8, 18, Math.PI * 1.15), m, 0.068, 0.072, 0, 0, 0, -Math.PI * 0.575);
      return g;
    },
  },
  {
    kind: 'bottle', label: 'Бутылка', icon: '🧴', color: NAVY, radius: 0.12,
    build: (c) => {
      const g = new THREE.Group();
      add(g, lathe([[0, 0], [0.055, 0], [0.062, 0.01], [0.062, 0.27], [0.05, 0.31], [0.032, 0.33], [0.032, 0.35], [0, 0.35]]), mat(c, 0.35));
      const cap = mat(shade(c, 0.65), 0.5);
      add(g, cyl(0.034, 0.034, 0.045, 18), cap, 0, 0.37, 0);
      add(g, new THREE.TorusGeometry(0.026, 0.007, 8, 16), cap, 0, 0.415, 0);
      return g;
    },
  },
  {
    kind: 'headphones', label: 'Наушники', icon: '🎧', color: NAVY, radius: 0.22,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.5);
      const pad = mat(shade(c, 0.6), 0.9);
      // стоят на амбушюрах, оголовье сверху
      add(g, new THREE.TorusGeometry(0.13, 0.016, 10, 32, Math.PI), m, 0, 0.09, 0);
      add(g, new THREE.TorusGeometry(0.122, 0.01, 8, 32, Math.PI), pad, 0, 0.09, 0.0);
      for (const s of [-1, 1]) {
        add(g, cyl(0.075, 0.075, 0.05, 24), m, s * 0.135, 0.078, 0, 0, 0, Math.PI / 2);
        add(g, new THREE.TorusGeometry(0.055, 0.02, 8, 24), pad, s * 0.105, 0.078, 0, 0, Math.PI / 2, 0);
      }
      g.scale.setScalar(1.25);
      const w = new THREE.Group();
      w.add(g);
      return w;
    },
  },
  {
    kind: 'phone', label: 'Телефон', icon: '📱', color: NAVY, radius: 0.12,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(0.09, 0.012, 0.18, 0.006), mat(c, 0.35), 0, 0.006, 0);
      add(g, rbox(0.08, 0.002, 0.165, 0.004), mat('#151a24', 0.15), 0, 0.0125, 0);
      add(g, cyl(0.01, 0.01, 0.004, 12), mat(shade(c, 0.6)), -0.025, 0.0, -0.065);
      return g;
    },
  },
  {
    kind: 'pizza', label: 'Коробка пиццы', icon: '🍕', color: LIGHT_GRAY, radius: 0.3,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(0.45, 0.04, 0.45, 0.006), mat(c, 0.95), 0, 0.02, 0);
      add(g, rbox(0.452, 0.025, 0.452, 0.006), mat(shade(c, 1.04), 0.95), 0, 0.052, 0);
      const tri = new THREE.Shape([new THREE.Vector2(-0.045, 0.05), new THREE.Vector2(0.045, 0.05), new THREE.Vector2(0, -0.07)]);
      add(g, new THREE.ShapeGeometry(tri), mat(MAROON), 0, 0.0655, 0, -Math.PI / 2, 0, 0);
      add(g, new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.05, 0.05), new THREE.Vector2(0.05, 0.05), new THREE.Vector2(0.05, 0.065), new THREE.Vector2(-0.05, 0.065)])), mat('#b48a5a'), 0, 0.0656, 0, -Math.PI / 2, 0, 0);
      for (const [x, z] of [[0, 0], [0.015, -0.025], [-0.012, 0.015]]) add(g, cyl(0.009, 0.009, 0.002, 10), mat('#f1e3c0'), x, 0.067, z);
      return g;
    },
  },
  {
    kind: 'towel', label: 'Полотенце', icon: '🧺', color: LIGHT_GRAY, radius: 0.25,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 1);
      const m2 = mat(shade(c, 0.9), 1);
      add(g, rbox(0.42, 0.045, 0.3, 0.02), m, 0, 0.0225, 0);
      add(g, rbox(0.42, 0.045, 0.3, 0.02), m2, 0.012, 0.067, 0.008);
      add(g, rbox(0.4, 0.03, 0.29, 0.015), m, 0.02, 0.104, 0.012);
      add(g, rbox(0.03, 0.06, 0.29, 0.015), m2, -0.19, 0.07, 0.012);
      return g;
    },
  },
  {
    kind: 'bin', label: 'Корзина', icon: '🗑️', color: NAVY, radius: 0.22,
    build: (c) => {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide, flatShading: true });
      add(g, lathe([[0, 0], [0.15, 0], [0.19, 0.42], [0.2, 0.43], [0.18, 0.43], [0.14, 0.012], [0, 0.012]], 8), m);
      return g;
    },
  },
  {
    kind: 'box', label: 'Коробка', icon: '📦', color: '#b5873a', radius: 0.35,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(0.5, 0.4, 0.5, 0.01), mat(c, 0.95), 0, 0.2, 0);
      const tape = mat(shade(c, 1.2), 0.5);
      add(g, box(0.512, 0.004, 0.08), tape, 0, 0.401, 0);
      add(g, box(0.08, 0.12, 0.512), tape, 0, 0.34, 0);
      add(g, box(0.005, 0.38, 0.51), mat(shade(c, 0.85)), 0.249, 0.2, 0);
      return g;
    },
  },
  {
    kind: 'rug', label: 'Ковёр', icon: '🟥', color: MAROON, radius: 1.2,
    build: (c) => {
      const g = new THREE.Group();
      const a = add(g, rbox(2.4, 0.02, 1.6, 0.008, 2), mat(c, 1), 0, 0.01, 0);
      const b = add(g, rbox(2.1, 0.022, 1.3, 0.006, 2), mat(shade(c, 0.88), 1), 0, 0.011, 0);
      const d = add(g, rbox(1.9, 0.024, 1.1, 0.006, 2), mat(c, 1), 0, 0.012, 0);
      for (const x of [a, b, d]) x.castShadow = false;
      return g;
    },
  },
  {
    kind: 'wall', label: 'Стена', icon: '🧱', color: '#ececec', radius: 1.5,
    build: (c) => {
      const g = new THREE.Group();
      add(g, box(3, 2.6, 0.12), mat(c, 0.95), 0, 1.3, 0);
      add(g, box(3, 0.1, 0.14), mat(shade(c, 0.85), 0.8), 0, 0.05, 0);
      return g;
    },
  },
  {
    kind: 'window_wall', label: 'Стена с окном', icon: '🪟', color: '#ececec', radius: 1.5,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.95);
      add(g, box(3, 0.9, 0.12), m, 0, 0.45, 0);
      add(g, box(3, 0.5, 0.12), m, 0, 2.35, 0);
      add(g, box(0.9, 1.2, 0.12), m, -1.05, 1.5, 0);
      add(g, box(0.9, 1.2, 0.12), m, 1.05, 1.5, 0);
      add(g, box(3, 0.1, 0.14), mat(shade(c, 0.85), 0.8), 0, 0.05, 0);
      const glass = new THREE.MeshStandardMaterial({ color: '#c7d5e2', roughness: 0.15, transparent: true, opacity: 0.4 });
      const gm = add(g, box(1.2, 1.2, 0.02), glass, 0, 1.5, 0);
      gm.castShadow = false;
      const fr = mat(CHARCOAL, 0.5);
      add(g, box(1.24, 0.05, 0.14), fr, 0, 2.1, 0);
      add(g, box(1.24, 0.05, 0.14), fr, 0, 0.9, 0);
      add(g, box(0.05, 1.24, 0.14), fr, -0.6, 1.5, 0);
      add(g, box(0.05, 1.24, 0.14), fr, 0.6, 1.5, 0);
      add(g, box(1.2, 0.035, 0.12), fr, 0, 1.5, 0);
      add(g, box(0.035, 1.2, 0.12), fr, 0, 1.5, 0);
      add(g, box(1.36, 0.04, 0.26), mat(WHITE, 0.6), 0, 0.88, 0.06);
      return g;
    },
  },
  {
    kind: 'door', label: 'Дверь', icon: '🚪', color: NAVY, radius: 0.6,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.6);
      add(g, box(0.88, 2.04, 0.05), m, 0, 1.02, 0);
      const inset = mat(shade(c, 0.85), 0.6);
      add(g, rbox(0.62, 0.75, 0.02, 0.01), inset, 0, 1.5, 0.03);
      add(g, rbox(0.62, 0.75, 0.02, 0.01), inset, 0, 0.6, 0.03);
      const fr = mat(CHARCOAL, 0.6);
      add(g, box(1.0, 0.07, 0.1), fr, 0, 2.075, 0);
      add(g, box(0.06, 2.11, 0.1), fr, -0.47, 1.055, 0);
      add(g, box(0.06, 2.11, 0.1), fr, 0.47, 1.055, 0);
      const brass = mat('#c9a84a', 0.25, { metalness: 0.6 });
      add(g, new THREE.SphereGeometry(0.035, 14, 10), brass, 0.33, 1.0, 0.06);
      add(g, cyl(0.02, 0.02, 0.04, 10), brass, 0.33, 1.0, 0.035, Math.PI / 2, 0, 0);
      return g;
    },
  },
  {
    kind: 'tree', label: 'Дерево', icon: '🌳', cat: 'Улица', color: '#3f5c4b', radius: 0.8,
    build: (c) => {
      const g = new THREE.Group();
      add(g, lathe([[0.13, 0], [0.09, 0.15], [0.07, 0.8], [0.05, 1.5], [0, 1.55]], 9), new THREE.MeshStandardMaterial({ color: '#4a3a2e', roughness: 0.9, flatShading: true }));
      add(g, cyl(0.03, 0.04, 0.5, 6), mat('#4a3a2e'), 0.2, 1.25, 0, 0, 0, -0.7);
      const crown = (r: number, x: number, y: number, z: number, k: number) =>
        add(g, new THREE.IcosahedronGeometry(r, 0), new THREE.MeshStandardMaterial({ color: shade(c, k), roughness: 0.9, flatShading: true }), x, y, z, x * 2, y, z);
      crown(0.72, 0, 1.75, 0, 1);
      crown(0.5, 0.42, 2.15, 0.12, 1.15);
      crown(0.45, -0.38, 2.05, -0.2, 0.88);
      crown(0.4, 0.05, 2.45, -0.1, 1.08);
      return g;
    },
  },
  {
    kind: 'bench', label: 'Скамейка', icon: '🪵', cat: 'Улица', color: '#7a5a3f', radius: 0.9,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.8);
      for (const z of [-0.12, 0, 0.12]) add(g, rbox(1.6, 0.04, 0.1, 0.012), m, 0, 0.43, z);
      for (const y of [0.58, 0.72]) add(g, rbox(1.6, 0.1, 0.03, 0.01), m, 0, y, -0.2);
      const leg = mat(CHARCOAL, 0.5);
      for (const x of [-0.7, 0.7]) {
        add(g, rbox(0.05, 0.42, 0.36, 0.01), leg, x, 0.21, 0);
        add(g, rbox(0.05, 0.4, 0.04, 0.01), leg, x, 0.62, -0.2);
        add(g, rbox(0.05, 0.04, 0.4, 0.01), leg, x, 0.6, -0.02);
      }
      return g;
    },
  },
  {
    kind: 'tv', label: 'Телевизор', icon: '📺', color: CHARCOAL, radius: 0.7,
    build: (c) => {
      const g = new THREE.Group();
      const cab = mat(LIGHT_GRAY, 0.6);
      add(g, rbox(1.2, 0.42, 0.4, 0.015), cab, 0, 0.25, 0);
      add(g, box(0.003, 0.36, 0.38), mat(shade(LIGHT_GRAY, 0.8)), 0, 0.25, 0.012);
      for (const x of [-0.55, 0.55]) add(g, box(0.04, 0.04, 0.36), mat(CHARCOAL), x, 0.02, 0);
      add(g, box(0.24, 0.02, 0.14), mat(c, 0.4), 0, 0.47, 0);
      add(g, box(0.05, 0.1, 0.03), mat(c, 0.4), 0, 0.52, 0);
      add(g, rbox(1.12, 0.66, 0.045, 0.012), mat(c, 0.35), 0, 0.9, 0);
      add(g, box(1.06, 0.6, 0.004), mat('#18202e', 0.15, { emissive: '#22304a', emissiveIntensity: 0.5 }), 0, 0.9, 0.024);
      return g;
    },
  },
];

PROPS.push(...STREET_PROPS, ...DECOR_PROPS);
// деревья и кусты — в «Природе»
for (const p of PROPS) if (p.kind === 'tree' || p.kind === 'bush') p.cat = 'Природа';

export const PROP_MAP: Record<string, PropDef> = Object.fromEntries(PROPS.map((p) => [p.kind, p]));
