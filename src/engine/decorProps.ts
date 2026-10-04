import * as THREE from 'three';
import { add, box, cyl, lathe, mat, mix, rbox, shade } from './geo';
import { CHARCOAL, WHITE } from './palette';
import type { PropDef } from './props';

// ---------- помощники ----------

/** Детерминированный «случай» — модели одинаковы при каждой сборке. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const flat = (color: string, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true });
const glass = (color = '#cfe3ee', opacity = 0.35) => new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.1, transparent: true, opacity, depthWrite: false });
const metal = (color = '#b9bec5', rough = 0.3) => mat(color, rough, { metalness: 0.75 });
const glow = (color: string, emissive: string, k = 1) => mat(color, 0.4, { emissive, emissiveIntensity: k });
const WOOD_LIGHT = '#c49a6c';
const WOOD_DARK = '#5a3d2b';
const LEAF = '#4f8a46';

/** «Лиственная» неровность: смещаем вершины от центра по шуму (позиционному — швы не рвутся). */
function leafy(geo: THREE.BufferGeometry, amp: number, freq = 6, seed = 0) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n =
      Math.sin(v.x * freq + 1.3 + seed) * Math.sin(v.y * freq * 1.7 + 0.4) * Math.sin(v.z * freq * 1.3 + 2.1 + seed) +
      0.5 * Math.sin(v.x * freq * 2.3 + seed * 2) * Math.sin(v.z * freq * 2.1 + 1);
    const d = v.clone().normalize();
    v.addScaledVector(d, n * amp);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
const blobGeo = (r: number, detail = 2, amp = 0.12, seed = 0) => leafy(new THREE.IcosahedronGeometry(r, detail), r * amp, 5 / r, seed);

/** Лист: вытянутая форма, изогнутая дугой. */
function leafGeo(len: number, width: number, bend: number, split = false) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(width, len * 0.25, width * 0.9, len * 0.75, 0, len);
  s.bezierCurveTo(-width * 0.9, len * 0.75, -width, len * 0.25, 0, 0);
  if (split) {
    // прорези, как у монстеры
    for (const sgn of [-1, 1])
      for (let k = 0; k < 3; k++) {
        const y = len * (0.3 + k * 0.18);
        const h = new THREE.Path();
        h.moveTo(sgn * width * 0.25, y);
        h.lineTo(sgn * width * 0.75, y + len * 0.04);
        h.lineTo(sgn * width * 0.72, y + len * 0.08);
        h.lineTo(sgn * width * 0.25, y + len * 0.03);
        s.holes.push(h);
      }
  }
  const g = new THREE.ShapeGeometry(s, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const x = p.getX(i);
    p.setZ(i, -bend * (y / len) ** 2 * len + Math.abs(x) * 0.3);
  }
  g.computeVertexNormals();
  return g;
}

/** Ствол с лёгким изгибом. */
function trunk(g: THREE.Group, h: number, r0: number, r1: number, color: string, lean = 0) {
  const t = add(g, lathe([[r0 * 1.25, 0], [r0, 0.12], [r0 * 0.85, h * 0.5], [r1, h], [0, h + 0.02]], 10), flat(color, 0.95));
  t.rotation.z = lean;
  return t;
}

/** Горшок с землёй; верх земли — на высоте h. */
function pot(parent: THREE.Group, r: number, h: number, color: string, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  add(g, lathe([[0, 0], [r * 0.75, 0], [r, h * 0.92], [r * 1.08, h * 0.95], [r * 1.08, h], [r * 0.95, h], [r * 0.9, h * 0.94], [0, h * 0.94]], 28), mat(color, 0.6));
  add(g, cyl(r * 0.9, r * 0.9, 0.012, 24), mat('#3b2f26', 1), 0, h * 0.93, 0);
}

function flower(g: THREE.Object3D, x: number, z: number, h: number, color: string, r = 0.035) {
  add(g, cyl(0.005, 0.006, h, 5), mat('#4c7a3c'), x, h / 2, z);
  add(g, new THREE.SphereGeometry(r * 0.45, 8, 6), mat('#f2c84b', 0.6), x, h + r * 0.2, z);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const pt = add(g, new THREE.SphereGeometry(r * 0.55, 8, 6), mat(color, 0.7), x + Math.cos(a) * r * 0.7, h, z + Math.sin(a) * r * 0.7);
    pt.scale.set(1, 0.35, 1);
  }
}

// ---------- природа ----------

const NATURE: PropDef[] = [
  {
    kind: 'pine', label: 'Ель', icon: '🌲', cat: 'Природа', color: '#2f5d43', radius: 0.9,
    build: (c) => {
      const g = new THREE.Group();
      trunk(g, 0.7, 0.12, 0.08, '#4a3427');
      const tiers: [number, number, number][] = [[0.95, 1.0, 0.35], [0.78, 0.9, 0.95], [0.6, 0.8, 1.48], [0.42, 0.7, 1.95], [0.24, 0.5, 2.38]];
      tiers.forEach(([r, h, y], i) => {
        const geo = new THREE.ConeGeometry(r, h, 10, 2);
        // нижний край тира — «лапами» вниз
        const p = geo.attributes.position;
        for (let k = 0; k < p.count; k++) if (p.getY(k) < -h / 2 + 0.01) p.setY(k, p.getY(k) - 0.06 * Math.sin(Math.atan2(p.getZ(k), p.getX(k)) * 5) ** 2);
        geo.computeVertexNormals();
        add(g, geo, flat(shade(c, 0.9 + i * 0.07)), 0, y + h / 2, 0, 0, i * 0.4, 0);
      });
      return g;
    },
  },
  {
    kind: 'birch', label: 'Берёза', icon: '🌳', cat: 'Природа', color: '#8fbf5a', radius: 0.8,
    build: (c) => {
      const g = new THREE.Group();
      const r = rng(7);
      trunk(g, 2.7, 0.09, 0.045, '#f1efe8', 0.03);
      const spot = mat('#2a2a2a', 0.9);
      for (let i = 0; i < 16; i++) {
        const y = 0.2 + r() * 2.3;
        const a = r() * Math.PI * 2;
        const rad = 0.088 - (y / 2.7) * 0.04;
        const s = add(g, box(0.035 + r() * 0.04, 0.012, 0.01), spot, Math.cos(a) * rad + y * 0.03, y, Math.sin(a) * rad, 0, -a + Math.PI / 2, 0);
        s.castShadow = false;
      }
      const br = flat('#e9e6dd');
      for (const [y, a, l] of [[1.6, 0.4, 0.55], [1.95, 2.6, 0.5], [2.25, 4.4, 0.45]] as const) {
        const b = add(g, cyl(0.015, 0.025, l, 6), br, Math.cos(a) * l * 0.35, y + l * 0.3, Math.sin(a) * l * 0.35);
        b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      }
      const blobs: [number, number, number, number][] = [[0.55, 0.05, 2.45, 0], [0.42, 0.42, 2.2, 0.15], [0.45, -0.38, 2.25, -0.1], [0.4, 0.1, 2.85, -0.12], [0.36, -0.2, 2.0, 0.3], [0.34, 0.3, 2.65, 0.3]];
      blobs.forEach(([rr, x, y, z], i) => add(g, blobGeo(rr, 1, 0.18, i), flat(shade(c, 0.88 + (i % 3) * 0.08)), x, y, z, i, i * 2, 0));
      return g;
    },
  },
  {
    kind: 'oak', label: 'Пышное дерево', icon: '🌳', cat: 'Природа', color: '#4f8a46', radius: 1.2,
    build: (c) => {
      const g = new THREE.Group();
      trunk(g, 1.8, 0.2, 0.12, '#5b4332');
      const bark = flat('#5b4332');
      for (const [a, l] of [[0.5, 0.9], [2.4, 0.8], [4.2, 0.85]] as const) {
        const b = add(g, cyl(0.04, 0.08, l, 7), bark, Math.cos(a) * 0.25, 1.65, Math.sin(a) * 0.25);
        b.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
      }
      const blobs: [number, number, number, number][] = [[0.95, 0, 2.5, 0], [0.7, 0.75, 2.25, 0.2], [0.72, -0.7, 2.3, -0.15], [0.65, 0.2, 2.25, 0.75], [0.62, -0.15, 2.3, -0.75], [0.62, 0.3, 3.15, 0.1], [0.55, -0.4, 3.0, 0.3]];
      blobs.forEach(([r, x, y, z], i) => add(g, blobGeo(r, 2, 0.1, i * 1.7), flat(shade(c, 0.85 + ((i * 37) % 5) * 0.06)), x, y, z, i, i, 0));
      return g;
    },
  },
  {
    kind: 'apple_tree', label: 'Яблоня', icon: '🍎', cat: 'Природа', color: '#5e9a4a', radius: 1.0,
    build: (c) => {
      const g = new THREE.Group();
      trunk(g, 1.3, 0.13, 0.09, '#6a4b36', -0.04);
      const crown = add(g, blobGeo(0.95, 2, 0.08, 3), flat(c), 0, 2.0, 0);
      crown.scale.set(1, 0.85, 1);
      add(g, blobGeo(0.6, 1, 0.12, 5), flat(shade(c, 1.1)), 0.35, 2.45, 0.2);
      const apple = mat('#c8312e', 0.35);
      const r = rng(11);
      for (let i = 0; i < 16; i++) {
        const th = r() * Math.PI * 2;
        const ph = 0.4 + r() * 1.3;
        add(g, new THREE.SphereGeometry(0.055, 10, 8), apple, Math.sin(ph) * Math.cos(th) * 0.92, 2.0 + Math.cos(ph) * 0.78, Math.sin(ph) * Math.sin(th) * 0.92);
      }
      // пара упавших яблок
      add(g, new THREE.SphereGeometry(0.055, 10, 8), apple, 0.6, 0.055, 0.4);
      add(g, new THREE.SphereGeometry(0.055, 10, 8), apple, -0.3, 0.055, 0.7);
      return g;
    },
  },
  {
    kind: 'palm', label: 'Пальма', icon: '🌴', cat: 'Природа', color: '#4f9a4a', radius: 1.0,
    build: (c) => {
      const g = new THREE.Group();
      const bark = flat('#8a6a48');
      let x = 0;
      let y = 0;
      const n = 11;
      for (let i = 0; i < n; i++) {
        const r0 = 0.15 - i * 0.006;
        const seg = add(g, cyl(r0 * 0.92, r0, 0.3, 9), bark, x, y + 0.15, 0, 0, 0, -0.03 - i * 0.012);
        seg.scale.y = 1.05;
        add(g, new THREE.TorusGeometry(r0 * 0.95, 0.015, 5, 12), flat('#6e5338'), x, y + 0.29, 0, Math.PI / 2, 0, 0);
        x += Math.sin(0.03 + i * 0.012) * 0.3;
        y += Math.cos(0.03 + i * 0.012) * 0.29;
      }
      const top = new THREE.Group();
      top.position.set(x, y, 0);
      g.add(top);
      const leafM = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide });
      for (let i = 0; i < 9; i++) {
        const piv = new THREE.Group();
        piv.rotation.y = (i / 9) * Math.PI * 2 + (i % 2) * 0.2;
        const tilt = new THREE.Group();
        tilt.rotation.x = 1.25 + (i % 3) * 0.2;
        piv.add(tilt);
        // лист выгнут вниз — свисающая крона
        add(tilt, leafGeo(1.5, 0.28, -0.7), leafM, 0, 0, 0);
        top.add(piv);
      }
      const nut = mat('#5a3f27', 0.6);
      for (let i = 0; i < 3; i++) add(top, new THREE.SphereGeometry(0.08, 10, 8), nut, Math.cos(i * 2.1) * 0.12, -0.1, Math.sin(i * 2.1) * 0.12);
      return g;
    },
  },
  {
    kind: 'hedge', label: 'Живая изгородь', icon: '🟩', cat: 'Природа', color: '#4b7d40', radius: 1.1,
    build: (c) => {
      const g = new THREE.Group();
      const geo = leafy(new THREE.BoxGeometry(2, 0.95, 0.6, 16, 8, 6), 0.025, 18);
      add(g, geo, flat(c), 0, 0.475, 0);
      const r = rng(5);
      for (let i = 0; i < 10; i++) add(g, blobGeo(0.12 + r() * 0.06, 1, 0.2, i), flat(shade(c, 1.05 + r() * 0.12)), -0.9 + i * 0.2, 0.92 + r() * 0.03, (r() - 0.5) * 0.3);
      return g;
    },
  },
  {
    kind: 'topiary', label: 'Шар в кадке', icon: '🟢', cat: 'Природа', color: '#3f7a46', radius: 0.4,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(0.5, 0.45, 0.5, 0.03), mat('#e8e2d6', 0.7), 0, 0.225, 0);
      add(g, box(0.44, 0.02, 0.44), mat('#3b2f26', 1), 0, 0.445, 0);
      add(g, cyl(0.03, 0.035, 0.4, 8), flat('#5a4130'), 0, 0.6, 0);
      add(g, blobGeo(0.38, 3, 0.04, 2), flat(c), 0, 1.05, 0);
      return g;
    },
  },
  {
    kind: 'flower_bed', label: 'Клумба', icon: '🌷', cat: 'Природа', color: '#d9466b', radius: 0.9,
    build: (c) => {
      const g = new THREE.Group();
      const stone = flat('#b9b4ab', 0.9);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        add(g, new THREE.DodecahedronGeometry(0.11, 0), stone, Math.cos(a) * 0.8, 0.07, Math.sin(a) * 0.8, a, a * 2, 0).scale.set(1.2, 0.7, 1);
      }
      add(g, cyl(0.76, 0.78, 0.1, 32), mat('#4a3626', 1), 0, 0.05, 0);
      const r = rng(3);
      const cols = [c, '#f2d24b', '#ffffff', shade(c, 0.7), '#9a5bd1'];
      for (let ring = 0; ring < 3; ring++) {
        const n = [5, 10, 15][ring];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + ring;
          const rad = ring * 0.25 + 0.08;
          const x = Math.cos(a) * rad + (r() - 0.5) * 0.06;
          const z = Math.sin(a) * rad + (r() - 0.5) * 0.06;
          add(g, blobGeo(0.07, 0, 0.1, i), flat('#4f8a3c'), x, 0.13, z);
          flower(g, x, z, 0.22 + (2 - ring) * 0.08 + r() * 0.05, cols[(i + ring) % cols.length], 0.045);
        }
      }
      return g;
    },
  },
  {
    kind: 'tulips', label: 'Тюльпаны', icon: '🌷', cat: 'Природа', color: '#e0405e', radius: 0.3,
    build: (c) => {
      const g = new THREE.Group();
      const r = rng(9);
      const leafM = new THREE.MeshStandardMaterial({ color: '#4f8a3c', roughness: 0.7, side: THREE.DoubleSide });
      const head = lathe([[0, 0], [0.03, 0.005], [0.042, 0.04], [0.036, 0.075], [0.025, 0.07], [0.018, 0.085]], 6);
      for (let i = 0; i < 7; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 0.16;
        const h = 0.35 + r() * 0.15;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        add(g, cyl(0.006, 0.008, h, 6), mat('#4f8a3c'), x, h / 2, z);
        add(g, head, mat(i % 3 === 2 ? '#f6d94a' : c, 0.5, { side: THREE.DoubleSide }), x, h, z);
        const lf = add(g, leafGeo(0.25, 0.04, 0.3), leafM, x, 0.0, z, 0, a, 0);
        lf.rotation.x = -0.25;
      }
      return g;
    },
  },
  {
    kind: 'grass', label: 'Трава', icon: '🌱', cat: 'Природа', color: '#5d9a48', radius: 0.4,
    build: (c) => {
      const g = new THREE.Group();
      const r = rng(21);
      const blade = new THREE.ConeGeometry(0.018, 1, 3);
      blade.translate(0, 0.5, 0);
      for (let t = 0; t < 4; t++) {
        const cx = (r() - 0.5) * 0.6, cz = (r() - 0.5) * 0.6;
        for (let i = 0; i < 14; i++) {
          const b = add(g, blade, flat(shade(c, 0.8 + r() * 0.4)), cx + (r() - 0.5) * 0.08, 0, cz + (r() - 0.5) * 0.08, (r() - 0.5) * 0.8, r() * 3, (r() - 0.5) * 0.8);
          b.scale.y = 0.15 + r() * 0.22;
          b.castShadow = false;
        }
      }
      return g;
    },
  },
  {
    kind: 'rocks', label: 'Камни', icon: '🪨', cat: 'Природа', color: '#9a9690', radius: 0.6,
    build: (c) => {
      const g = new THREE.Group();
      const rock = (r: number, x: number, z: number, sy: number, k: number, seed: number) => {
        const geo = leafy(new THREE.DodecahedronGeometry(r, 1), r * 0.12, 3 / r, seed);
        const m = add(g, geo, flat(shade(c, k)), x, r * sy * 0.75, z, seed, seed * 2, 0);
        m.scale.set(1, sy, 0.9);
      };
      rock(0.38, 0, 0, 0.7, 1, 1);
      rock(0.22, 0.45, 0.2, 0.8, 1.1, 2);
      rock(0.15, -0.35, 0.32, 0.9, 0.9, 3);
      rock(0.1, 0.2, -0.38, 1, 1.05, 4);
      return g;
    },
  },
  {
    kind: 'stump', label: 'Пень', icon: '🪵', cat: 'Природа', color: '#7a5a3f', radius: 0.4,
    build: (c) => {
      const g = new THREE.Group();
      add(g, lathe([[0.32, 0], [0.26, 0.06], [0.23, 0.2], [0.22, 0.4], [0, 0.4]], 12), flat(c));
      add(g, cyl(0.2, 0.2, 0.01, 24), mat('#d9b98a', 0.9), 0, 0.402, 0);
      for (const r of [0.06, 0.11, 0.16]) add(g, new THREE.TorusGeometry(r, 0.004, 4, 28), mat('#a67d52'), 0, 0.408, 0, Math.PI / 2, 0, 0);
      for (let i = 0; i < 4; i++) {
        const a = i * 1.6 + 0.3;
        add(g, cyl(0.03, 0.07, 0.3, 6), flat(shade(c, 0.9)), Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3, Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3);
      }
      // грибочки
      const cap = mat('#b5452f', 0.6);
      for (const [x, z, s] of [[0.33, 0.12, 1], [0.38, 0.2, 0.7]] as const) {
        add(g, cyl(0.012 * s, 0.015 * s, 0.07 * s, 8), mat('#f1ead8'), x, 0.035 * s, z);
        add(g, new THREE.SphereGeometry(0.035 * s, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap, x, 0.065 * s, z);
      }
      return g;
    },
  },
  {
    kind: 'log', label: 'Бревно', icon: '🪵', cat: 'Природа', color: '#7a5a3f', radius: 0.9,
    build: (c) => {
      const g = new THREE.Group();
      add(g, cyl(0.2, 0.22, 1.6, 12), flat(c), 0, 0.21, 0, 0, 0, Math.PI / 2);
      for (const s of [-1, 1]) {
        add(g, cyl(0.19, 0.19, 0.01, 24), mat('#d9b98a', 0.9), s * 0.805, 0.21, 0, 0, 0, Math.PI / 2);
        for (const r of [0.06, 0.12]) add(g, new THREE.TorusGeometry(r, 0.004, 4, 24), mat('#a67d52'), s * 0.81, 0.21, 0, 0, Math.PI / 2, 0);
      }
      add(g, cyl(0.03, 0.05, 0.3, 6), flat(c), 0.3, 0.42, 0.05, 0.3, 0, 0.6);
      return g;
    },
  },
  {
    kind: 'pond', label: 'Пруд', icon: '🪷', cat: 'Природа', color: '#5b9fc2', radius: 1.6,
    build: (c) => {
      const g = new THREE.Group();
      const shape = new THREE.Shape();
      const r = rng(4);
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const rad = 1.25 + Math.sin(a * 3) * 0.12 + Math.cos(a * 2) * 0.1;
        pts.push(new THREE.Vector2(Math.cos(a) * rad * 1.15, Math.sin(a) * rad * 0.85));
      }
      shape.setFromPoints(pts);
      const bed = add(g, new THREE.ShapeGeometry(shape), mat(shade(c, 0.55), 1), 0, 0.005, 0, -Math.PI / 2, 0, 0);
      bed.castShadow = false;
      const water = add(g, new THREE.ShapeGeometry(shape), mat(c, 0.05, { metalness: 0.2, transparent: true, opacity: 0.85 }), 0, 0.03, 0, -Math.PI / 2, 0, 0);
      water.castShadow = false;
      const stone = flat('#a8a39a');
      pts.forEach((p, i) => {
        add(g, leafy(new THREE.DodecahedronGeometry(0.13 + r() * 0.06, 0), 0.02, 10, i), stone, p.x * 1.04, 0.06, -p.y * 1.04, r(), r() * 3, 0).scale.set(1.3, 0.6, 1);
      });
      // кувшинки
      const pad = new THREE.CircleGeometry(0.16, 20, 0.3, Math.PI * 2 - 0.3);
      for (const [x, z] of [[0.3, 0.2], [-0.4, -0.25], [0.55, -0.35]] as const) add(g, pad, mat('#4f8a3c', 0.6), x, 0.035, z, -Math.PI / 2, 0, x * 3);
      flower(g, 0.3, 0.2, 0.05, '#f3b6c9', 0.05);
      // камыш
      const reed = mat('#5e7e3a');
      for (let i = 0; i < 9; i++) {
        const x = -1.15 + (r() - 0.5) * 0.2, z = 0.35 + (r() - 0.5) * 0.4;
        const h = 0.7 + r() * 0.4;
        add(g, cyl(0.008, 0.012, h, 5), reed, x, h / 2, z, (r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2);
        if (i % 2) add(g, cyl(0.025, 0.025, 0.14, 8), mat('#6b4a2e'), x, h - 0.1, z);
      }
      return g;
    },
  },
];

// ---------- улица ----------

const STREET: PropDef[] = [
  {
    kind: 'trash_can', label: 'Урна', icon: '🗑️', cat: 'Улица', color: '#3f5a45', radius: 0.3,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.5, { metalness: 0.3 });
      add(g, lathe([[0, 0], [0.2, 0], [0.24, 0.7], [0.25, 0.72], [0.25, 0.75], [0.22, 0.75], [0.2, 0.05], [0, 0.05]], 24), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
      for (const y of [0.2, 0.5]) add(g, new THREE.TorusGeometry(0.225 + y * 0.05, 0.012, 6, 28), m, 0, y, 0, Math.PI / 2, 0, 0);
      add(g, cyl(0.21, 0.21, 0.02, 24), mat('#1a1a1a'), 0, 0.68, 0);
      add(g, rbox(0.04, 0.85, 0.06, 0.01), metal('#55595f'), 0.27, 0.42, 0);
      return g;
    },
  },
  {
    kind: 'mailbox', label: 'Почтовый ящик', icon: '📮', cat: 'Улица', color: '#2d5aa0', radius: 0.3,
    build: (c) => {
      const g = new THREE.Group();
      add(g, cyl(0.035, 0.035, 0.95, 10), metal('#4a4d52'), 0, 0.475, 0);
      add(g, rbox(0.42, 0.5, 0.26, 0.04), mat(c, 0.45), 0, 1.15, 0);
      add(g, rbox(0.44, 0.08, 0.28, 0.03), mat(shade(c, 0.75), 0.45), 0, 1.42, 0);
      add(g, box(0.22, 0.025, 0.02), mat('#141414'), 0, 1.3, 0.13);
      add(g, box(0.18, 0.12, 0.01), mat(WHITE, 0.6), 0, 1.08, 0.131);
      add(g, box(0.06, 0.06, 0.012), glow('#f6d34a', '#f2b51e', 0.2), 0, 1.08, 0.137);
      return g;
    },
  },
  {
    kind: 'cafe_set', label: 'Столик кафе', icon: '☂️', cat: 'Улица', color: '#c7423b', radius: 1.2,
    build: (c) => {
      const g = new THREE.Group();
      const iron = metal('#2e3135', 0.45);
      add(g, cyl(0.38, 0.38, 0.03, 32), mat(WHITE, 0.4), 0, 0.74, 0);
      add(g, cyl(0.025, 0.025, 0.72, 10), iron, 0, 0.37, 0);
      add(g, cyl(0.2, 0.22, 0.03, 20), iron, 0, 0.015, 0);
      // зонт: восьмигранный купол с полосами
      add(g, cyl(0.02, 0.02, 1.6, 8), iron, 0, 1.45, 0);
      const can = new THREE.Group();
      can.position.y = 2.1;
      g.add(can);
      for (let i = 0; i < 8; i++) {
        const seg = add(can, new THREE.CylinderGeometry(0.02, 1.05, 0.38, 1, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4), new THREE.MeshStandardMaterial({ color: i % 2 ? c : WHITE, roughness: 0.8, side: THREE.DoubleSide }));
        seg.position.y = 0.0;
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        add(can, new THREE.ConeGeometry(0.07, 0.1, 3), mat(i % 2 ? WHITE : c, 0.8), Math.sin(a) * 1.0, -0.23, Math.cos(a) * 1.0, Math.PI, a, 0);
      }
      add(can, new THREE.SphereGeometry(0.04, 10, 8), iron, 0, 0.2, 0);
      // кружки и стулья
      add(g, lathe([[0, 0], [0.04, 0], [0.045, 0.09], [0.04, 0.09], [0, 0.01]], 16), mat(WHITE, 0.3), 0.12, 0.755, 0.05);
      for (const a of [Math.PI / 2, -Math.PI / 2]) {
        const ch = new THREE.Group();
        ch.position.set(Math.sin(a) * 0.72, 0, Math.cos(a) * 0.72);
        ch.rotation.y = a + Math.PI;
        g.add(ch);
        add(ch, cyl(0.21, 0.2, 0.035, 24), mat(c, 0.6), 0, 0.46, 0);
        for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) add(ch, cyl(0.012, 0.012, 0.46, 6), iron, x, 0.23, z);
        add(ch, new THREE.TorusGeometry(0.2, 0.014, 6, 20, Math.PI), iron, 0, 0.7, -0.15, 0, 0, 0);
        for (const x of [-0.2, 0.2]) add(ch, cyl(0.012, 0.012, 0.26, 6), iron, x, 0.58, -0.17);
      }
      return g;
    },
  },
  {
    kind: 'fountain', label: 'Фонтан', icon: '⛲', cat: 'Улица', color: '#d8d2c6', radius: 1.6,
    build: (c) => {
      const g = new THREE.Group();
      const st = mat(c, 0.75);
      add(g, lathe([[0, 0], [1.5, 0], [1.55, 0.05], [1.55, 0.45], [1.42, 0.5], [1.38, 0.48], [1.38, 0.15], [0, 0.15]], 40), st);
      const water = mat('#7cc0e0', 0.05, { metalness: 0.2, transparent: true, opacity: 0.8 });
      add(g, cyl(1.38, 1.38, 0.02, 40), water, 0, 0.38, 0).castShadow = false;
      add(g, lathe([[0.18, 0], [0.12, 0.3], [0.1, 0.9], [0.16, 1.0], [0, 1.0]], 24), st, 0, 0.15, 0);
      add(g, lathe([[0, 0], [0.6, 0], [0.62, 0.12], [0.58, 0.14], [0.55, 0.06], [0, 0.06]], 32), st, 0, 1.12, 0);
      add(g, cyl(0.55, 0.55, 0.02, 32), water, 0, 1.24, 0).castShadow = false;
      add(g, lathe([[0.06, 0], [0.05, 0.3], [0.1, 0.36], [0, 0.42]], 16), st, 0, 1.18, 0);
      // струи
      const jet = new THREE.MeshStandardMaterial({ color: '#bfe6f5', roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false });
      add(g, cyl(0.02, 0.035, 0.4, 10), jet, 0, 1.8, 0).castShadow = false;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const arc = add(g, new THREE.TorusGeometry(0.3, 0.012, 6, 16, Math.PI / 2), jet, Math.cos(a) * 0.3, 1.9, Math.sin(a) * 0.3, 0, -a, 0);
        arc.rotation.order = 'YXZ';
        arc.castShadow = false;
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        add(g, cyl(0.006, 0.02, 0.7, 6), jet, Math.cos(a) * 0.82, 0.75, Math.sin(a) * 0.82, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35).castShadow = false;
      }
      return g;
    },
  },
  {
    kind: 'advert_column', label: 'Афишная тумба', icon: '🪧', cat: 'Улица', color: '#2f4a3a', radius: 0.6,
    build: (c) => {
      const g = new THREE.Group();
      add(g, cyl(0.52, 0.55, 0.15, 32), mat(c, 0.5), 0, 0.075, 0);
      add(g, cyl(0.45, 0.45, 2.2, 32), mat('#ece6d8', 0.9), 0, 1.25, 0);
      const posters = ['#d9463c', '#f2c84b', '#3a6fb0', '#e8e1d0', '#5aa06a', '#202020'];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(g, new THREE.CylinderGeometry(0.455, 0.455, 0.7 + (i % 2) * 0.2, 8, 1, true, a, 0.9), mat(posters[i], 0.7, { side: THREE.DoubleSide }), 0, 1.15 + (i % 3) * 0.2, 0);
        add(g, new THREE.CylinderGeometry(0.458, 0.458, 0.12, 8, 1, true, a + 0.15, 0.6), mat(WHITE, 0.7, { side: THREE.DoubleSide }), 0, 1.25 + (i % 3) * 0.2, 0);
      }
      add(g, cyl(0.52, 0.5, 0.1, 32), mat(c, 0.5), 0, 2.4, 0);
      add(g, new THREE.SphereGeometry(0.5, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(c, 0.5), 0, 2.45, 0).scale.y = 0.55;
      add(g, new THREE.SphereGeometry(0.06, 12, 8), metal('#c9a84a'), 0, 2.76, 0);
      return g;
    },
  },
  {
    kind: 'street_clock', label: 'Уличные часы', icon: '🕰️', cat: 'Улица', color: CHARCOAL, radius: 0.4,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.4, { metalness: 0.5 });
      add(g, lathe([[0, 0], [0.22, 0], [0.2, 0.08], [0.1, 0.2], [0.07, 0.5], [0.06, 2.6], [0, 2.6]], 24), m);
      add(g, cyl(0.29, 0.29, 0.14, 40), m, 0, 2.9, 0, Math.PI / 2, 0, 0);
      for (const s of [-1, 1]) {
        add(g, cyl(0.25, 0.25, 0.01, 40), mat(WHITE, 0.4), 0, 2.9, s * 0.071, Math.PI / 2, 0, 0);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          add(g, box(0.012, i % 3 ? 0.025 : 0.045, 0.004), mat('#111'), Math.sin(a) * 0.21, 2.9 + Math.cos(a) * 0.21, s * 0.077, 0, 0, -a);
        }
        add(g, box(0.014, 0.14, 0.004), mat('#111'), 0.04, 2.95, s * 0.08, 0, 0, -0.6);
        add(g, box(0.01, 0.2, 0.004), mat('#111'), -0.06, 2.97, s * 0.082, 0, 0, 0.6);
      }
      add(g, new THREE.SphereGeometry(0.06, 12, 8), metal('#c9a84a'), 0, 3.22, 0);
      return g;
    },
  },
  {
    kind: 'bicycle', label: 'Велосипед', icon: '🚲', cat: 'Улица', color: '#2f7fc1', radius: 0.9,
    build: (c) => {
      const g = new THREE.Group();
      const f = mat(c, 0.35, { metalness: 0.3 });
      const tire = mat('#161616', 0.8);
      const R = 0.33;
      for (const z of [-0.52, 0.52]) {
        add(g, new THREE.TorusGeometry(R, 0.022, 8, 40), tire, 0, R, z, 0, Math.PI / 2, 0);
        add(g, new THREE.TorusGeometry(R - 0.03, 0.006, 6, 40), metal(), 0, R, z, 0, Math.PI / 2, 0);
        for (let i = 0; i < 8; i++) add(g, cyl(0.002, 0.002, (R - 0.03) * 2, 4), metal(), 0, R, z, (i / 8) * Math.PI, 0, 0);
        add(g, cyl(0.025, 0.025, 0.06, 10), metal('#666'), 0, R, z, 0, 0, Math.PI / 2);
      }
      // рама: точки и трубы между ними
      const P = {
        rear: new THREE.Vector3(0, R, -0.52), front: new THREE.Vector3(0, R, 0.52), bb: new THREE.Vector3(0, 0.3, -0.08),
        seat: new THREE.Vector3(0, 0.82, -0.22), head: new THREE.Vector3(0, 0.82, 0.38), headLow: new THREE.Vector3(0, 0.68, 0.42),
      };
      const tube = (a: THREE.Vector3, b: THREE.Vector3, r = 0.018) => {
        const d = b.clone().sub(a);
        const m = add(g, cyl(r, r, d.length(), 8), f, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      };
      tube(P.rear, P.bb); tube(P.rear, P.seat); tube(P.bb, P.seat, 0.02); tube(P.seat, P.head, 0.02); tube(P.bb, P.headLow, 0.022);
      tube(P.headLow, P.front, 0.016); tube(P.head, P.headLow, 0.024);
      tube(P.head, new THREE.Vector3(0, 0.95, 0.34), 0.014);
      add(g, cyl(0.012, 0.012, 0.5, 8), metal('#333'), 0, 0.95, 0.34, 0, 0, Math.PI / 2);
      for (const s of [-1, 1]) add(g, cyl(0.016, 0.016, 0.09, 8), mat('#222'), s * 0.22, 0.95, 0.34, 0, 0, Math.PI / 2);
      tube(P.seat, new THREE.Vector3(0, 0.9, -0.24), 0.012);
      add(g, rbox(0.1, 0.04, 0.22, 0.02), mat('#222', 0.7), 0, 0.92, -0.25);
      add(g, cyl(0.07, 0.07, 0.02, 20), metal('#555'), 0.03, 0.3, -0.08, 0, 0, Math.PI / 2);
      for (const s of [-1, 1]) add(g, rbox(0.08, 0.02, 0.04, 0.008), mat('#222'), s * 0.09, 0.3 + s * 0.14, -0.08);
      add(g, rbox(0.1, 0.02, 0.36, 0.01), f, 0, R + 0.05, -0.55);
      // стоит на подножке — чуть наклонён
      const w = new THREE.Group();
      w.add(g);
      g.rotation.z = 0.06;
      return w;
    },
  },
  {
    kind: 'swing', label: 'Качели', icon: '🛝', cat: 'Улица', color: '#d4483b', radius: 1.3,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.45, { metalness: 0.3 });
      for (const x of [-1.1, 1.1]) for (const z of [-1, 1]) add(g, cyl(0.04, 0.04, 2.3, 10), m, x, 1.1, z * 0.22, -z * 0.2, 0, 0);
      add(g, cyl(0.05, 0.05, 2.4, 12), m, 0, 2.2, 0, 0, 0, Math.PI / 2);
      const chain = metal('#9aa0a6');
      for (const x of [-0.5, 0.5]) {
        for (const s of [-0.2, 0.2]) add(g, cyl(0.008, 0.008, 1.6, 5), chain, x + s, 1.4, 0);
        add(g, rbox(0.5, 0.04, 0.2, 0.015), mat(i2c(x, c), 0.7), x, 0.6, 0);
      }
      return g;
    },
  },
  {
    kind: 'bollards', label: 'Столбики', icon: '🚧', cat: 'Улица', color: '#3a3d42', radius: 1.0,
    build: (c) => {
      const g = new THREE.Group();
      for (const x of [-0.8, 0, 0.8]) {
        add(g, lathe([[0, 0], [0.09, 0], [0.08, 0.7], [0.08, 0.75], [0, 0.82]], 20), mat(c, 0.45, { metalness: 0.4 }), x, 0, 0);
        add(g, cyl(0.083, 0.083, 0.06, 20), glow('#f3f3f3', '#ffffff', 0.15), x, 0.62, 0);
      }
      const chain = metal('#8f959b');
      for (const x of [-0.4, 0.4]) add(g, new THREE.TorusGeometry(0.4, 0.008, 4, 20, Math.PI), chain, x, 0.72, 0, 0, 0, Math.PI);
      return g;
    },
  },
  {
    kind: 'planter', label: 'Кадка с деревцем', icon: '🪴', cat: 'Улица', color: '#7b5b3f', radius: 0.5,
    build: (c) => {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) add(g, rbox(0.7, 0.13, 0.7, 0.02), mat(shade(c, i % 2 ? 0.92 : 1), 0.8), 0, 0.07 + i * 0.13, 0);
      for (const [x, z] of [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]]) add(g, box(0.06, 0.58, 0.06), mat(shade(c, 0.75), 0.8), x, 0.29, z);
      add(g, box(0.62, 0.02, 0.62), mat('#3b2f26', 1), 0, 0.55, 0);
      trunk(g, 0.9, 0.05, 0.035, '#5a4130').position.y = 0.55;
      add(g, blobGeo(0.42, 2, 0.12, 8), flat(LEAF), 0, 1.6, 0);
      add(g, blobGeo(0.28, 1, 0.15, 9), flat(shade(LEAF, 1.12)), 0.18, 1.85, 0.1);
      return g;
    },
  },
  {
    kind: 'kiosk', label: 'Ларёк', icon: '🏪', cat: 'Улица', color: '#2f6b5a', radius: 1.4,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(2.0, 2.3, 1.5, 0.05), mat(c, 0.6), 0, 1.15, 0);
      add(g, box(1.6, 0.8, 0.02), glass('#e9f2f7', 0.5), 0, 1.45, 0.751);
      add(g, rbox(1.8, 0.06, 0.3, 0.02), mat(WHITE, 0.5), 0, 1.02, 0.85);
      add(g, rbox(2.1, 0.4, 0.1, 0.03), mat(WHITE, 0.5), 0, 2.15, 0.76);
      add(g, box(1.6, 0.22, 0.02), mat(c, 0.5), 0, 2.15, 0.815);
      // полосатый козырёк
      for (let i = 0; i < 8; i++) {
        add(g, box(0.26, 0.02, 0.6), mat(i % 2 ? WHITE : '#d64a3c', 0.8), -0.91 + i * 0.26, 1.88, 1.0, -0.35, 0, 0);
      }
      add(g, rbox(2.04, 0.12, 1.54, 0.04), mat(shade(c, 0.7), 0.6), 0, 2.36, 0);
      // товары за стеклом
      const r = rng(17);
      for (let i = 0; i < 12; i++) add(g, rbox(0.1, 0.16, 0.08, 0.02), mat(['#e0453a', '#f2c84b', '#3a6fb0', '#ffffff'][i % 4], 0.5), -0.7 + i * 0.125, 1.18 + (r() > 0.5 ? 0.28 : 0), 0.6);
      return g;
    },
  },
];

/** Сиденья качелей — цвет чуть отличается слева и справа. */
function i2c(x: number, c: string) {
  return x < 0 ? '#3a6fb0' : mix(c, '#f2c84b', 0.6);
}

// ---------- дом ----------

const ROOM: PropDef[] = [
  {
    kind: 'wardrobe', label: 'Шкаф', icon: '🚪', color: '#d9cbb3', radius: 0.7,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(1.1, 0.08, 0.6, 0.01), mat(shade(c, 0.7), 0.6), 0, 0.04, 0);
      add(g, rbox(1.1, 2.0, 0.6, 0.02), mat(c, 0.6), 0, 1.08, 0);
      add(g, rbox(1.16, 0.06, 0.64, 0.02), mat(shade(c, 0.85), 0.6), 0, 2.1, 0);
      add(g, box(0.008, 1.9, 0.02), mat(shade(c, 0.6)), 0, 1.08, 0.301);
      for (const s of [-1, 1]) {
        add(g, rbox(0.46, 1.7, 0.02, 0.01), mat(shade(c, 1.04), 0.6), s * 0.27, 1.12, 0.305);
        add(g, cyl(0.012, 0.012, 0.22, 10), metal('#c9a84a'), s * 0.06, 1.15, 0.33);
      }
      return g;
    },
  },
  {
    kind: 'bookshelf', label: 'Книжный шкаф', icon: '📚', color: '#8a5f3e', radius: 0.7,
    build: (c) => {
      const g = new THREE.Group();
      const w = mat(c, 0.6);
      add(g, box(1.0, 1.9, 0.03), mat(shade(c, 0.8), 0.7), 0, 0.95, -0.15);
      for (const s of [-1, 1]) add(g, rbox(0.04, 1.9, 0.32, 0.01), w, s * 0.48, 0.95, 0);
      for (let i = 0; i < 6; i++) add(g, rbox(0.98, 0.035, 0.32, 0.01), w, 0, 0.03 + i * 0.37, 0);
      const r = rng(31);
      const cols = ['#b5452f', '#2f4a6b', '#d9b14a', '#3f6a4f', '#e8e1d0', '#6a2633', '#8a8f99', '#c46b2e'];
      for (let sh = 0; sh < 5; sh++) {
        let x = -0.44;
        const y0 = 0.05 + sh * 0.37;
        while (x < 0.42) {
          const bw = 0.03 + r() * 0.035;
          if (x + bw > 0.44) break;
          if (r() < 0.08 && sh % 2) {
            x += 0.08;
            continue;
          }
          const bh = 0.22 + r() * 0.1;
          const lean = x > 0.3 && r() < 0.5 ? 0.25 : 0;
          add(g, rbox(bw, bh, 0.22, 0.004), mat(cols[Math.floor(r() * cols.length)], 0.75), x + bw / 2, y0 + bh / 2, 0.02, 0, 0, -lean);
          x += bw + 0.004 + lean * 0.1;
        }
      }
      // горшок с плющом наверху
      pot(g, 0.08, 0.14, WHITE, 0.3, 1.88, 0);
      const ivy = mat(LEAF, 0.7);
      for (let i = 0; i < 7; i++) add(g, new THREE.SphereGeometry(0.035, 8, 6), ivy, 0.3 + Math.sin(i) * 0.06, 2.0 - i * 0.07, 0.12 + Math.cos(i * 1.7) * 0.03).scale.set(1, 0.5, 1);
      return g;
    },
  },
  {
    kind: 'armchair', label: 'Кресло', icon: '🛋️', color: '#4a6a5a', radius: 0.6,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.95);
      const d = mat(shade(c, 0.82), 0.95);
      add(g, rbox(0.86, 0.22, 0.82, 0.06), d, 0, 0.21, 0);
      add(g, rbox(0.62, 0.16, 0.66, 0.07), m, 0, 0.39, 0.06);
      add(g, rbox(0.84, 0.62, 0.2, 0.08), d, 0, 0.58, -0.33, -0.1, 0, 0);
      add(g, rbox(0.6, 0.42, 0.14, 0.07), m, 0, 0.64, -0.22, -0.15, 0, 0);
      for (const s of [-1, 1]) add(g, rbox(0.14, 0.42, 0.8, 0.07), m, s * 0.37, 0.44, 0.0);
      for (const [x, z] of [[-0.36, -0.34], [0.36, -0.34], [-0.36, 0.34], [0.36, 0.34]]) add(g, cyl(0.025, 0.016, 0.12, 8), mat(WOOD_DARK, 0.5), x, 0.05, z);
      add(g, rbox(0.3, 0.28, 0.1, 0.05), mat(mix(c, WHITE, 0.6), 0.95), 0.14, 0.6, -0.12, -0.25, -0.2, 0.15);
      return g;
    },
  },
  {
    kind: 'coffee_table', label: 'Журнальный столик', icon: '🟫', color: WOOD_LIGHT, radius: 0.6,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(1.0, 0.05, 0.56, 0.02), mat(c, 0.45), 0, 0.42, 0);
      add(g, rbox(0.9, 0.025, 0.46, 0.01), mat(shade(c, 0.9), 0.5), 0, 0.14, 0);
      for (const [x, z] of [[-0.44, -0.22], [0.44, -0.22], [-0.44, 0.22], [0.44, 0.22]]) add(g, cyl(0.022, 0.016, 0.42, 10), mat(WOOD_DARK, 0.5), x, 0.2, z);
      add(g, rbox(0.3, 0.012, 0.22, 0.004), mat('#d9463c', 0.7), -0.2, 0.452, 0.04, 0, 0.2, 0);
      add(g, rbox(0.26, 0.012, 0.2, 0.004), mat('#e8e1d0', 0.7), -0.18, 0.464, 0.03, 0, -0.1, 0);
      add(g, lathe([[0, 0], [0.05, 0], [0.07, 0.06], [0.05, 0.13], [0.025, 0.16], [0.03, 0.18], [0, 0.18]], 20), mat('#3a6fb0', 0.3), 0.25, 0.445, -0.05);
      for (const [x, z, col] of [[0.24, -0.06, '#f2c84b'], [0.27, -0.03, '#e0405e']] as const) flower(g, x, z, 0.445 + 0.24, col, 0.03);
      return g;
    },
  },
  {
    kind: 'desk', label: 'Письменный стол', icon: '🗄️', color: '#e9e4dc', radius: 0.8,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(1.3, 0.04, 0.65, 0.015), mat(WOOD_LIGHT, 0.5), 0, 0.75, 0);
      add(g, rbox(0.42, 0.72, 0.6, 0.015), mat(c, 0.6), 0.42, 0.37, 0);
      for (let i = 0; i < 3; i++) {
        add(g, rbox(0.38, 0.21, 0.02, 0.008), mat(shade(c, 1.03), 0.6), 0.42, 0.13 + i * 0.235, 0.305);
        add(g, rbox(0.12, 0.018, 0.025, 0.008), metal('#8f959b'), 0.42, 0.2 + i * 0.235, 0.32);
      }
      add(g, rbox(0.04, 0.72, 0.6, 0.01), mat(c, 0.6), -0.62, 0.37, 0);
      add(g, rbox(0.8, 0.3, 0.02, 0.01), mat(c, 0.6), -0.2, 0.55, -0.29);
      // монитор, клавиатура, кружка с ручками
      add(g, rbox(0.2, 0.012, 0.14, 0.005), mat('#2a2d33', 0.5), -0.2, 0.776, -0.15);
      add(g, rbox(0.04, 0.22, 0.03, 0.01), mat('#2a2d33', 0.5), -0.2, 0.88, -0.17);
      add(g, rbox(0.62, 0.38, 0.03, 0.01), mat('#1f2228', 0.4), -0.2, 1.1, -0.15);
      add(g, box(0.58, 0.34, 0.005), glow('#202a3d', '#2c4a7a', 0.6), -0.2, 1.1, -0.133);
      add(g, rbox(0.42, 0.015, 0.14, 0.005), mat(WHITE, 0.5), -0.2, 0.778, 0.12);
      add(g, cyl(0.04, 0.035, 0.11, 16), mat('#2f4a6b', 0.5), 0.3, 0.825, -0.12);
      for (let i = 0; i < 3; i++) add(g, cyl(0.005, 0.005, 0.15, 6), mat(['#d9463c', '#3a6fb0', '#f2c84b'][i], 0.5), 0.29 + i * 0.01, 0.9, -0.12, 0.15 * (i - 1), 0, 0.15);
      return g;
    },
  },
  {
    kind: 'office_chair', label: 'Офисный стул', icon: '💺', color: '#2c2f35', radius: 0.4,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.7);
      const chrome = metal('#9aa0a6', 0.25);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(g, rbox(0.3, 0.035, 0.05, 0.015), chrome, Math.sin(a) * 0.15, 0.08, Math.cos(a) * 0.15, 0, a + Math.PI / 2, 0);
        add(g, new THREE.SphereGeometry(0.03, 10, 8), mat('#111'), Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29);
      }
      add(g, cyl(0.025, 0.025, 0.36, 12), chrome, 0, 0.27, 0);
      add(g, rbox(0.48, 0.08, 0.46, 0.035), m, 0, 0.47, 0);
      add(g, rbox(0.06, 0.3, 0.03, 0.01), chrome, 0, 0.6, -0.22);
      add(g, rbox(0.44, 0.5, 0.07, 0.035), m, 0, 0.88, -0.26, -0.12, 0, 0);
      for (const s of [-1, 1]) {
        add(g, rbox(0.03, 0.18, 0.03, 0.01), chrome, s * 0.24, 0.58, 0.0);
        add(g, rbox(0.06, 0.03, 0.24, 0.012), m, s * 0.24, 0.68, 0.0);
      }
      return g;
    },
  },
  {
    kind: 'fridge', label: 'Холодильник', icon: '🧊', color: '#eef0f2', radius: 0.5,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(0.66, 1.85, 0.66, 0.05), mat(c, 0.3), 0, 0.925, 0);
      add(g, box(0.64, 0.01, 0.02), mat(shade(c, 0.7)), 0, 1.3, 0.331);
      const h = metal('#a8adb3', 0.2);
      add(g, rbox(0.03, 0.3, 0.04, 0.012), h, 0.26, 1.5, 0.35);
      add(g, rbox(0.03, 0.6, 0.04, 0.012), h, 0.26, 0.9, 0.35);
      // магнитики и рисунок
      for (const [x, y, col] of [[-0.15, 1.1, '#d9463c'], [0.05, 1.0, '#f2c84b'], [-0.05, 1.55, '#3a6fb0']] as const) add(g, cyl(0.025, 0.025, 0.012, 14), mat(col, 0.4), x, y, 0.335, Math.PI / 2, 0, 0);
      add(g, box(0.16, 0.2, 0.004), mat('#fffbe8', 0.9), -0.12, 0.92, 0.333, 0, 0, 0.08);
      add(g, box(0.07, 0.07, 0.003), mat('#f2c84b'), -0.14, 0.95, 0.336, 0, 0, 0.08);
      return g;
    },
  },
  {
    kind: 'kitchen', label: 'Кухня', icon: '🍳', color: '#6f8f8a', radius: 1.3,
    build: (c) => {
      const g = new THREE.Group();
      add(g, box(2.4, 0.08, 0.56), mat('#2a2a2a', 0.8), 0, 0.04, 0);
      for (let i = 0; i < 4; i++) {
        const x = -0.9 + i * 0.6;
        add(g, rbox(0.58, 0.78, 0.56, 0.01), mat(c, 0.55), x, 0.47, 0);
        add(g, rbox(0.12, 0.018, 0.025, 0.008), metal('#c4c8cc'), x, 0.78, 0.29);
      }
      add(g, rbox(2.44, 0.04, 0.62, 0.01), mat('#e9e4dc', 0.35), 0, 0.88, 0.02);
      // мойка
      add(g, rbox(0.46, 0.012, 0.38, 0.03), metal('#c4c8cc', 0.25), -0.6, 0.902, 0.02);
      add(g, rbox(0.4, 0.01, 0.32, 0.03), mat('#6e7378', 0.3, { metalness: 0.6 }), -0.6, 0.905, 0.02);
      add(g, cyl(0.015, 0.018, 0.28, 10), metal('#d9dde1', 0.15), -0.6, 1.04, -0.2);
      add(g, new THREE.TorusGeometry(0.08, 0.015, 8, 16, Math.PI), metal('#d9dde1', 0.15), -0.6, 1.18, -0.12, 0, Math.PI / 2, 0);
      // плита
      add(g, rbox(0.58, 0.012, 0.52, 0.01), mat('#141414', 0.15), 0.6, 0.904, 0.02);
      for (const [x, z] of [[0.46, -0.1], [0.74, -0.1], [0.46, 0.14], [0.74, 0.14]]) {
        add(g, new THREE.TorusGeometry(0.08, 0.008, 6, 24), mat('#3a3a3a'), x, 0.912, z, Math.PI / 2, 0, 0);
        add(g, new THREE.TorusGeometry(0.045, 0.006, 6, 20), mat('#3a3a3a'), x, 0.912, z, Math.PI / 2, 0, 0);
      }
      // кастрюля
      add(g, lathe([[0, 0], [0.11, 0], [0.11, 0.13], [0.105, 0.13], [0.105, 0.005], [0, 0.005]], 24), metal('#b0b5ba', 0.3), 0.46, 0.912, -0.1);
      add(g, cyl(0.112, 0.112, 0.012, 24), metal('#b0b5ba', 0.3), 0.46, 1.045, -0.1);
      add(g, rbox(0.12, 0.015, 0.03, 0.007), mat('#141414'), 0.62, 1.0, -0.1);
      // стенка-фартук
      add(g, box(2.4, 0.55, 0.02), mat('#f1f1ef', 0.5), 0, 1.18, -0.29);
      for (let i = 0; i < 12; i++) add(g, box(0.004, 0.55, 0.022), mat('#d6d6d2'), -1.1 + i * 0.2, 1.18, -0.29);
      return g;
    },
  },
  {
    kind: 'bathtub', label: 'Ванна', icon: '🛁', color: '#f4f4f2', radius: 1.0,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(1.7, 0.55, 0.78, 0.12), mat(c, 0.25), 0, 0.3, 0);
      add(g, rbox(1.5, 0.05, 0.58, 0.2), mat(shade(c, 0.88), 0.25), 0, 0.555, 0);
      const water = add(g, rbox(1.46, 0.02, 0.54, 0.2), mat('#a7d4ea', 0.05, { transparent: true, opacity: 0.8 }), 0, 0.56, 0);
      water.castShadow = false;
      // пена
      const r = rng(2);
      for (let i = 0; i < 16; i++) add(g, new THREE.SphereGeometry(0.04 + r() * 0.04, 10, 8), mat(WHITE, 0.6), 0.15 + (r() - 0.5) * 0.8, 0.57, (r() - 0.5) * 0.3).scale.y = 0.5;
      for (const [x, z] of [[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]]) add(g, new THREE.SphereGeometry(0.05, 10, 8), metal('#c9a84a', 0.25), x, 0.03, z);
      add(g, cyl(0.02, 0.02, 0.2, 10), metal('#d9dde1', 0.15), -0.78, 0.68, 0);
      add(g, cyl(0.016, 0.016, 0.14, 10), metal('#d9dde1', 0.15), -0.72, 0.77, 0, 0, 0, Math.PI / 2);
      // уточка
      add(g, new THREE.SphereGeometry(0.05, 12, 10), mat('#f6d02e', 0.4), 0.45, 0.6, 0.12).scale.set(1, 0.8, 1.3);
      add(g, new THREE.SphereGeometry(0.03, 12, 10), mat('#f6d02e', 0.4), 0.45, 0.66, 0.16);
      add(g, new THREE.ConeGeometry(0.012, 0.03, 8), mat('#e8732b'), 0.45, 0.655, 0.195, Math.PI / 2, 0, 0);
      return g;
    },
  },
  {
    kind: 'nightstand', label: 'Тумбочка с лампой', icon: '🛏️', color: WOOD_LIGHT, radius: 0.3,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(0.45, 0.5, 0.38, 0.015), mat(c, 0.55), 0, 0.3, 0);
      for (const [x, z] of [[-0.19, -0.15], [0.19, -0.15], [-0.19, 0.15], [0.19, 0.15]]) add(g, cyl(0.014, 0.01, 0.06, 8), mat(WOOD_DARK), x, 0.03, z);
      for (let i = 0; i < 2; i++) {
        add(g, rbox(0.41, 0.2, 0.02, 0.008), mat(shade(c, 1.05), 0.55), 0, 0.18 + i * 0.235, 0.19);
        add(g, new THREE.SphereGeometry(0.018, 10, 8), metal('#c9a84a'), 0, 0.18 + i * 0.235, 0.205);
      }
      tableLamp(g, '#e8dcc4', 0.05, 0.55, 0.0);
      add(g, rbox(0.12, 0.02, 0.16, 0.005), mat('#2f4a6b', 0.7), 0.13, 0.56, 0.05, 0, 0.3, 0);
      return g;
    },
  },
  {
    kind: 'table_lamp', label: 'Настольная лампа', icon: '🛋️', color: '#e8dcc4', radius: 0.18,
    build: (c) => {
      const g = new THREE.Group();
      tableLamp(g, c, 0, 0, 0);
      return g;
    },
  },
  {
    kind: 'dresser', label: 'Комод', icon: '🗄️', color: '#f0ebe2', radius: 0.6,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(1.0, 0.82, 0.48, 0.015), mat(c, 0.55), 0, 0.49, 0);
      add(g, rbox(1.04, 0.035, 0.52, 0.01), mat(WOOD_LIGHT, 0.5), 0, 0.915, 0);
      for (const [x, z] of [[-0.45, -0.2], [0.45, -0.2], [-0.45, 0.2], [0.45, 0.2]]) add(g, cyl(0.016, 0.01, 0.08, 8), mat(WOOD_DARK), x, 0.04, z);
      for (let i = 0; i < 3; i++) {
        add(g, rbox(0.94, 0.24, 0.02, 0.008), mat(shade(c, 1.03), 0.55), 0, 0.22 + i * 0.265, 0.245);
        for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(0.02, 10, 8), metal('#c9a84a'), s * 0.25, 0.22 + i * 0.265, 0.262);
      }
      // зеркальце и ваза
      add(g, new THREE.TorusGeometry(0.2, 0.02, 8, 32), mat(WOOD_DARK, 0.5), -0.2, 1.17, -0.18);
      add(g, new THREE.CircleGeometry(0.19, 32), mat('#d5e2ea', 0.05, { metalness: 0.2 }), -0.2, 1.17, -0.175);
      add(g, rbox(0.06, 0.04, 0.06, 0.01), mat(WOOD_DARK), -0.2, 0.952, -0.18);
      add(g, lathe([[0, 0], [0.05, 0], [0.07, 0.07], [0.04, 0.16], [0.045, 0.2], [0, 0.2]], 20), mat('#7aa2b8', 0.3), 0.3, 0.93, 0);
      for (const [x, z, col] of [[0.29, 0, '#e0405e'], [0.32, 0.02, '#ffffff'], [0.3, -0.03, '#f2c84b']] as const) flower(g, x, z, 0.93 + 0.32, col, 0.035);
      return g;
    },
  },
  {
    kind: 'picture', label: 'Картина', icon: '🖼️', color: '#b08a4a', radius: 0.5,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(0.9, 0.66, 0.05, 0.01), mat(c, 0.4, { metalness: 0.3 }), 0, 1.55, 0);
      add(g, box(0.8, 0.56, 0.01), mat('#f3efe6', 0.9), 0, 1.55, 0.022);
      // пейзаж: небо, солнце, холмы
      add(g, box(0.72, 0.48, 0.006), mat('#a8d0e6', 0.9), 0, 1.55, 0.028);
      add(g, new THREE.CircleGeometry(0.06, 24), mat('#f6d34a', 0.6), 0.2, 1.67, 0.033);
      for (const [x, r, col] of [[-0.15, 0.2, '#5f9a52'], [0.17, 0.18, '#4a7d44']] as const) {
        add(g, new THREE.CircleGeometry(r, 32, 0, Math.PI), mat(col, 0.9), x, 1.31, 0.034 + (x > 0 ? 0.001 : 0));
      }
      add(g, box(0.72, 0.06, 0.006), mat('#4a7d44', 0.9), 0, 1.34, 0.034);
      return g;
    },
  },
  {
    kind: 'wall_clock', label: 'Настенные часы', icon: '🕰️', color: CHARCOAL, radius: 0.25,
    build: (c) => {
      const g = new THREE.Group();
      add(g, new THREE.TorusGeometry(0.2, 0.025, 10, 40), mat(c, 0.4), 0, 1.95, 0);
      add(g, cyl(0.2, 0.2, 0.03, 40), mat(WHITE, 0.4), 0, 1.95, -0.01, Math.PI / 2, 0, 0);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        add(g, box(0.01, i % 3 ? 0.02 : 0.04, 0.004), mat('#111'), Math.sin(a) * 0.16, 1.95 + Math.cos(a) * 0.16, 0.008, 0, 0, -a);
      }
      add(g, box(0.012, 0.1, 0.004), mat('#111'), 0.03, 1.985, 0.011, 0, 0, -0.6);
      add(g, box(0.008, 0.15, 0.004), mat('#111'), -0.035, 2.005, 0.013, 0, 0, 0.45);
      add(g, box(0.004, 0.15, 0.004), mat('#d9463c'), 0, 1.89, 0.015, 0, 0, 2.6);
      return g;
    },
  },
  {
    kind: 'floor_mirror', label: 'Зеркало', icon: '🪞', color: WOOD_DARK, radius: 0.4,
    build: (c) => {
      const g = new THREE.Group();
      const frame = mat(c, 0.45);
      const ell = new THREE.Shape();
      ell.absellipse(0, 0, 0.32, 0.8, 0, Math.PI * 2, false, 0);
      add(g, new THREE.ShapeGeometry(ell, 48), mat('#d5e2ea', 0.05, { metalness: 0.2 }), 0, 1.0, 0.012);
      const ring = new THREE.EllipseCurve(0, 0, 0.33, 0.81);
      const pts = ring.getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, 0));
      add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, 0.025, 8, true), frame, 0, 1.0, 0);
      for (const s of [-1, 1]) add(g, rbox(0.04, 0.5, 0.04, 0.01), frame, s * 0.2, 0.22, -0.12, -0.25, 0, 0);
      return g;
    },
  },
  {
    kind: 'piano', label: 'Пианино', icon: '🎹', color: '#1b1b1d', radius: 0.9,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.15, { metalness: 0.1 });
      add(g, rbox(1.5, 1.25, 0.32, 0.02), m, 0, 0.625, -0.18);
      add(g, rbox(1.5, 0.08, 0.3, 0.015), m, 0, 0.7, 0.12);
      for (const s of [-1, 1]) {
        add(g, rbox(0.06, 0.18, 0.32, 0.015), m, s * 0.74, 0.8, 0.12);
        add(g, rbox(0.06, 0.66, 0.06, 0.015), m, s * 0.66, 0.33, 0.2);
      }
      // клавиши
      const n = 36;
      add(g, box(1.36, 0.025, 0.16), mat('#f7f5ef', 0.35), 0, 0.755, 0.17);
      for (let i = 0; i <= n; i++) add(g, box(0.002, 0.026, 0.16), mat('#c9c6bd'), -0.68 + (i * 1.36) / n, 0.756, 0.17);
      for (let i = 0; i < n - 1; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) add(g, box(0.02, 0.025, 0.1), m, -0.68 + ((i + 1) * 1.36) / n, 0.775, 0.14);
      add(g, rbox(1.4, 0.2, 0.03, 0.01), m, 0, 0.92, 0.0, -0.2, 0, 0);
      add(g, box(0.36, 0.25, 0.006), mat('#f3efe6', 0.9), 0.1, 1.02, -0.005, -0.25, 0, 0);
      // табурет
      add(g, rbox(0.6, 0.06, 0.32, 0.02), m, 0, 0.48, 0.62);
      for (const [x, z] of [[-0.26, 0.5], [0.26, 0.5], [-0.26, 0.74], [0.26, 0.74]]) add(g, cyl(0.02, 0.016, 0.46, 8), m, x, 0.23, z);
      // подсвечник
      add(g, cyl(0.03, 0.04, 0.03, 12), metal('#c9a84a'), 0.55, 1.265, -0.18);
      add(g, cyl(0.015, 0.015, 0.14, 10), mat('#f7f2e2', 0.7), 0.55, 1.35, -0.18);
      add(g, new THREE.SphereGeometry(0.012, 8, 6), glow('#ffd27a', '#ffb43a', 2), 0.55, 1.43, -0.18).scale.y = 1.6;
      return g;
    },
  },
  {
    kind: 'aquarium', label: 'Аквариум', icon: '🐠', color: '#2a2d33', radius: 0.7,
    build: (c) => {
      const g = new THREE.Group();
      add(g, rbox(1.1, 0.7, 0.45, 0.015), mat(c, 0.5), 0, 0.35, 0);
      add(g, rbox(1.1, 0.04, 0.45, 0.01), mat(c, 0.5), 0, 1.28, 0);
      const w = add(g, box(1.06, 0.48, 0.41), mat('#5fb3d6', 0.05, { transparent: true, opacity: 0.35, depthWrite: false }), 0, 0.98, 0);
      w.castShadow = false;
      add(g, box(1.08, 0.56, 0.43), glass('#e6f3f8', 0.15), 0, 1.0, 0).castShadow = false;
      add(g, box(1.06, 0.05, 0.41), mat('#d9c7a2', 1), 0, 0.745, 0);
      const r = rng(8);
      for (let i = 0; i < 7; i++) {
        const x = -0.45 + i * 0.15;
        const h = 0.15 + r() * 0.25;
        add(g, leafGeo(h, 0.03, -0.2), mat(i % 2 ? '#3f8a4a' : '#5aa65a', 0.7, { side: THREE.DoubleSide }), x, 0.76, -0.12 + r() * 0.1, 0, r() * 3, 0);
      }
      add(g, leafy(new THREE.DodecahedronGeometry(0.08, 0), 0.01, 10), flat('#8a8580'), 0.3, 0.79, 0.05);
      // рыбки
      for (const [x, y, col, rot] of [[-0.2, 1.0, '#f08a2a', 0.2], [0.15, 1.08, '#f2c84b', Math.PI], [0.35, 0.92, '#e0405e', 0.3], [-0.35, 1.12, '#3a8fd6', Math.PI + 0.2]] as const) {
        const f = new THREE.Group();
        f.position.set(x, y, 0.02);
        f.rotation.y = rot;
        add(f, new THREE.SphereGeometry(0.03, 12, 8), mat(col, 0.4), 0, 0, 0).scale.set(1.6, 1, 0.5);
        add(f, new THREE.ConeGeometry(0.025, 0.04, 3), mat(col, 0.4), -0.06, 0, 0, 0, 0, Math.PI / 2);
        g.add(f);
      }
      add(g, rbox(0.3, 0.02, 0.06, 0.01), glow('#e6f6ff', '#bfeaff', 0.8), 0, 1.26, 0);
      return g;
    },
  },
  {
    kind: 'pet_bed', label: 'Лежанка', icon: '🐾', color: '#b55a4a', radius: 0.45,
    build: (c) => {
      const g = new THREE.Group();
      add(g, new THREE.TorusGeometry(0.33, 0.1, 14, 36), mat(c, 0.95), 0, 0.1, 0, Math.PI / 2, 0, 0).scale.set(1, 1, 1.2);
      add(g, cyl(0.34, 0.36, 0.08, 32), mat(mix(c, '#fff4e6', 0.7), 0.95), 0, 0.05, 0);
      add(g, rbox(0.18, 0.04, 0.12, 0.02), mat('#e8732b'), 0.08, 0.1, 0.05, 0, 0.5, 0);
      return g;
    },
  },
  {
    kind: 'cat_tree', label: 'Когтеточка', icon: '🐈', color: '#c9b79c', radius: 0.45,
    build: (c) => {
      const g = new THREE.Group();
      const carpet = mat(c, 1);
      const rope = mat('#d9c39a', 1);
      add(g, rbox(0.6, 0.06, 0.6, 0.02), carpet, 0, 0.03, 0);
      add(g, cyl(0.06, 0.06, 1.1, 14), rope, -0.15, 0.6, -0.15);
      add(g, cyl(0.06, 0.06, 0.7, 14), rope, 0.18, 0.4, 0.15);
      add(g, rbox(0.42, 0.32, 0.36, 0.04), carpet, 0.06, 0.24, 0.05);
      add(g, cyl(0.1, 0.1, 0.02, 24), mat('#2a221c'), 0.06, 0.24, 0.235, Math.PI / 2, 0, 0);
      add(g, rbox(0.4, 0.05, 0.36, 0.02), carpet, 0.12, 0.78, 0.1);
      add(g, rbox(0.46, 0.05, 0.4, 0.02), carpet, -0.15, 1.18, -0.15);
      add(g, new THREE.TorusGeometry(0.14, 0.04, 8, 20), carpet, -0.15, 1.22, -0.15, Math.PI / 2, 0, 0);
      // мячик на верёвочке
      add(g, cyl(0.003, 0.003, 0.2, 4), mat('#444'), 0.25, 0.68, 0.24);
      add(g, new THREE.SphereGeometry(0.03, 10, 8), mat('#e0405e', 0.5), 0.25, 0.57, 0.24);
      return g;
    },
  },
  {
    kind: 'fireplace', label: 'Камин', icon: '🔥', color: '#e6e0d6', radius: 0.9,
    build: (c) => {
      const g = new THREE.Group();
      const m = mat(c, 0.8);
      for (const s of [-1, 1]) add(g, rbox(0.3, 1.0, 0.45, 0.02), m, s * 0.6, 0.5, 0);
      add(g, rbox(1.5, 0.3, 0.45, 0.02), m, 0, 0.95, 0);
      add(g, rbox(1.7, 0.07, 0.55, 0.02), mat(shade(c, 0.85), 0.6), 0, 1.13, 0.02);
      add(g, rbox(1.4, 0.06, 0.5, 0.02), mat('#5a5550', 0.9), 0, 0.03, 0.08);
      add(g, box(0.9, 0.8, 0.3), mat('#1b1714', 1), 0, 0.4, -0.06);
      // поленья и огонь
      for (const [x, rz] of [[-0.12, 0.25], [0.12, -0.25], [0, 0]] as const) add(g, cyl(0.06, 0.06, 0.55, 8), flat('#6a4a32'), x, 0.12 + (x === 0 ? 0.08 : 0), 0.0, 0, 0, Math.PI / 2 + rz).rotation.y = 0.3;
      const flame = (x: number, h: number, r: number, k: number) => {
        const f = add(g, new THREE.ConeGeometry(r, h, 10), mat('#ffb347', 0.4, { emissive: k > 1 ? '#ffe08a' : '#ff6a1a', emissiveIntensity: 1.8, transparent: true, opacity: 0.9 }), x, 0.2 + h / 2, 0.02);
        f.castShadow = false;
      };
      flame(0, 0.45, 0.12, 1);
      flame(-0.12, 0.32, 0.09, 1);
      flame(0.13, 0.35, 0.09, 1);
      flame(0.02, 0.25, 0.06, 2);
      // на полке: свечи и рамка
      for (const x of [-0.6, -0.52]) {
        add(g, cyl(0.025, 0.025, 0.16 + (x + 0.6) * 1.2, 12), mat('#f7f2e2', 0.7), x, 1.24 + (x + 0.6) * 0.6, 0.0);
      }
      add(g, rbox(0.22, 0.28, 0.03, 0.01), mat(WOOD_DARK, 0.5), 0.45, 1.3, -0.08, -0.15, 0, 0);
      add(g, box(0.17, 0.22, 0.005), mat('#a8d0e6'), 0.45, 1.3, -0.063, -0.15, 0, 0);
      return g;
    },
  },
  {
    kind: 'monstera', label: 'Монстера', icon: '🌿', color: '#2f6b3c', radius: 0.55,
    build: (c) => {
      const g = new THREE.Group();
      pot(g, 0.2, 0.38, '#d9cfc0');
      const leafM = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, side: THREE.DoubleSide });
      const stem = mat(shade(c, 1.2), 0.7);
      for (let i = 0; i < 7; i++) {
        const piv = new THREE.Group();
        piv.position.y = 0.38;
        piv.rotation.y = (i / 7) * Math.PI * 2 + i;
        const tilt = new THREE.Group();
        tilt.rotation.x = 0.25 + (i % 3) * 0.2;
        piv.add(tilt);
        const h = 0.45 + (i % 3) * 0.15;
        add(tilt, cyl(0.008, 0.01, h, 6), stem, 0, h / 2, 0);
        const lf = add(tilt, leafGeo(0.42, 0.24, 0.35, true), leafM, 0, h, 0);
        lf.rotation.x = 0.7;
        g.add(piv);
      }
      return g;
    },
  },
  {
    kind: 'cactus', label: 'Кактус', icon: '🌵', color: '#4f8a4a', radius: 0.2,
    build: (c) => {
      const g = new THREE.Group();
      pot(g, 0.1, 0.16, '#c96f4a');
      const ribbed = (r: number, h: number) => {
        const geo = new THREE.CylinderGeometry(r, r, h, 16, 6);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
          const a = Math.atan2(z, x);
          const k = 1 + 0.08 * Math.cos(a * 8);
          const top = y > h / 2 - 0.001 ? 0.75 : 1;
          p.setXYZ(i, x * k * top, y, z * k * top);
        }
        geo.computeVertexNormals();
        return geo;
      };
      const m = mat(c, 0.7);
      add(g, ribbed(0.06, 0.3), m, 0, 0.3, 0);
      add(g, new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.45, 0).scale.y = 0.8;
      add(g, ribbed(0.035, 0.1), m, 0.08, 0.32, 0, 0, 0, -Math.PI / 2);
      add(g, ribbed(0.035, 0.12), m, 0.12, 0.4, 0);
      add(g, new THREE.SphereGeometry(0.035, 12, 6), m, 0.12, 0.46, 0);
      flower(g, 0.0, 0.0, 0.5, '#f27aa6', 0.03);
      return g;
    },
  },
  {
    kind: 'fruit_bowl', label: 'Фрукты', icon: '🍎', color: '#f1ece2', radius: 0.2,
    build: (c) => {
      const g = new THREE.Group();
      add(g, lathe([[0, 0], [0.06, 0], [0.07, 0.015], [0.16, 0.07], [0.165, 0.08], [0.15, 0.08], [0, 0.03]], 32), mat(c, 0.3, { side: THREE.DoubleSide }));
      const fr: [number, number, number, number, string][] = [[0.0, 0.08, 0.0, 0.05, '#e24a2e'], [0.07, 0.075, 0.03, 0.048, '#f39a1e'], [-0.06, 0.075, 0.04, 0.046, '#9ccc3c'], [0.02, 0.075, -0.07, 0.047, '#c8312e'], [-0.03, 0.12, -0.02, 0.045, '#f39a1e']];
      for (const [x, y, z, r, col] of fr) add(g, new THREE.SphereGeometry(r, 16, 12), mat(col, 0.45), x, y, z);
      // банан
      add(g, new THREE.TorusGeometry(0.08, 0.018, 8, 16, 1.6), mat('#f2d14a', 0.5), -0.02, 0.1, 0.06, -0.9, 0.4, 0);
      // зелень сверху
      add(g, leafGeo(0.06, 0.02, 0.2), new THREE.MeshStandardMaterial({ color: '#4f8a3c', side: THREE.DoubleSide }), 0.0, 0.125, 0.0, -0.4, 0, 0);
      return g;
    },
  },
  {
    kind: 'round_rug', label: 'Круглый ковёр', icon: '⭕', color: '#c9a86a', radius: 1.0,
    build: (c) => {
      const g = new THREE.Group();
      const cols = [c, shade(c, 0.8), mix(c, WHITE, 0.5), shade(c, 0.8), c];
      cols.forEach((col, i) => {
        const r = 1.0 - i * 0.18;
        add(g, cyl(r, r, 0.015, 48), mat(col, 1), 0, 0.008 + i * 0.001, 0).castShadow = false;
      });
      return g;
    },
  },
  {
    kind: 'floor_vase', label: 'Напольная ваза', icon: '🏺', color: '#2f4a6b', radius: 0.25,
    build: (c) => {
      const g = new THREE.Group();
      add(g, lathe([[0, 0], [0.1, 0], [0.18, 0.2], [0.17, 0.4], [0.08, 0.6], [0.07, 0.68], [0.1, 0.72], [0, 0.72]], 32), mat(c, 0.2));
      add(g, new THREE.TorusGeometry(0.175, 0.01, 6, 32), metal('#c9a84a'), 0, 0.3, 0, Math.PI / 2, 0, 0);
      const br = mat('#8a6a48');
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25;
        add(g, cyl(0.004, 0.006, 0.7, 5), br, Math.cos(a) * 0.08, 1.0, Math.sin(a) * 0.08, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
        for (let k = 0; k < 4; k++) add(g, new THREE.SphereGeometry(0.02, 6, 5), mat('#f4f1ea', 0.9), Math.cos(a) * (0.12 + k * 0.03), 1.05 + k * 0.08, Math.sin(a) * (0.12 + k * 0.03));
      }
      return g;
    },
  },
];

function tableLamp(g: THREE.Group, c: string, x: number, y: number, z: number) {
  const l = new THREE.Group();
  l.position.set(x, y, z);
  add(l, lathe([[0, 0], [0.07, 0], [0.075, 0.015], [0.03, 0.03], [0.05, 0.1], [0.06, 0.16], [0.03, 0.22], [0.015, 0.26], [0, 0.26]], 24), mat('#7a8a9a', 0.3));
  add(l, new THREE.CylinderGeometry(0.08, 0.13, 0.16, 24, 1, true), mat(c, 0.9, { side: THREE.DoubleSide, emissive: '#fff1c4', emissiveIntensity: 0.25 }), 0, 0.31, 0);
  add(l, new THREE.SphereGeometry(0.03, 10, 8), glow('#fff6dd', '#fff1c4', 0.8), 0, 0.27, 0);
  g.add(l);
}

export const DECOR_PROPS: PropDef[] = [...NATURE, ...STREET, ...ROOM];
