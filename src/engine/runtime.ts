import * as THREE from 'three';
import type { Actor, CameraView, Prop, Scene } from '../types';
import { applyPose, createFigure, disposeObject, type FigureRig } from './figure';
import { PROP_MAP } from './props';
import { evaluateActor, evaluateProp } from './evaluate';
import { variantDef } from './variants';

export const VIEW_HEIGHT = 9; // высота кадра в метрах при zoom = 1
const SUN_OFFSET = new THREE.Vector3(2.5, 10, -6);

interface ActorEntry { sig: string; rig: FigureRig }
interface PropEntry { sig: string; obj: THREE.Group }

export interface SyncOptions {
  selectedId?: string | null;
  helpers?: boolean;
}

/** Держит three.js-сцену и синхронизирует её с данными сцены проекта. */
export class SceneRuntime {
  readonly scene = new THREE.Scene();
  private floor: THREE.Mesh;
  private grid: THREE.GridHelper;
  private sun: THREE.DirectionalLight;
  private actors = new Map<string, ActorEntry>();
  private props = new Map<string, PropEntry>();
  private helpers = new THREE.Group();
  private selRing: THREE.Mesh;
  private pathLine: THREE.Line;
  private keyDots: THREE.InstancedMesh;

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color('#ffffff');

    s.add(new THREE.HemisphereLight('#ffffff', '#c9ccd2', 1.45));
    const fill = new THREE.DirectionalLight('#ffffff', 0.7);
    fill.position.set(6, 5, 8);
    s.add(fill);
    const sun = new THREE.DirectionalLight('#ffffff', 2.0);
    sun.position.copy(SUN_OFFSET);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 40;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 5;
    s.add(sun, sun.target);
    this.sun = sun;

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.floor.name = 'floor';
    s.add(this.floor);

    this.grid = new THREE.GridHelper(200, 200, '#e3e3e6', '#e3e3e6');
    this.grid.position.y = 0.002;
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.9;
    s.add(this.grid);

    // помощники редактора
    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 48),
      new THREE.MeshBasicMaterial({ color: '#111111', transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.renderOrder = 10;
    this.pathLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: '#111111', dashSize: 0.15, gapSize: 0.1 }),
    );
    this.keyDots = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16),
      new THREE.MeshBasicMaterial({ color: '#111111' }),
      64,
    );
    this.keyDots.count = 0;
    this.helpers.add(this.selRing, this.pathLine, this.keyDots);
    s.add(this.helpers);
  }

  setShadowFocus(target: THREE.Vector3) {
    this.sun.target.position.copy(target).setY(0);
    this.sun.position.copy(this.sun.target.position).add(SUN_OFFSET);
  }

  sync(data: Scene, t: number, opts: SyncOptions = {}) {
    (this.scene.background as THREE.Color).set(data.background);
    (this.floor.material as THREE.MeshStandardMaterial).color.set(data.floor);
    this.grid.visible = data.grid;

    // персонажи
    const seenA = new Set<string>();
    for (const a of data.actors) {
      seenA.add(a.id);
      const sig = `${a.variant}|${a.color}`;
      let e = this.actors.get(a.id);
      if (!e || e.sig !== sig) {
        if (e) this.removeObj(e.rig.root, false);
        const rig = createFigure(a.variant, a.color);
        rig.root.userData.ownerId = a.id;
        rig.root.userData.ownerKind = 'actor';
        this.scene.add(rig.root);
        e = { sig, rig };
        this.actors.set(a.id, e);
      }
      const st = evaluateActor(a, t);
      e.rig.root.position.set(st.x, st.y, st.z);
      e.rig.root.rotation.y = st.ry;
      e.rig.root.scale.setScalar(a.scale);
      applyPose(e.rig, st.pose, st.odo);
    }
    for (const [id, e] of this.actors) {
      if (!seenA.has(id)) {
        this.removeObj(e.rig.root, false);
        this.actors.delete(id);
      }
    }

    // декорации
    const seenP = new Set<string>();
    for (const p of data.props) {
      seenP.add(p.id);
      const def = PROP_MAP[p.kind];
      if (!def) continue;
      const color = p.color ?? def.color;
      const sig = `${p.kind}|${color}`;
      let e = this.props.get(p.id);
      if (!e || e.sig !== sig) {
        if (e) this.removeObj(e.obj, true);
        const obj = def.build(color);
        obj.userData.ownerId = p.id;
        obj.userData.ownerKind = 'prop';
        this.scene.add(obj);
        e = { sig, obj };
        this.props.set(p.id, e);
      }
      const ps = evaluateProp(p, t, !!def.vehicle);
      e.obj.position.set(ps.x, ps.y, ps.z);
      e.obj.rotation.y = ps.ry;
      e.obj.scale.setScalar(p.scale);
      const wheels = e.obj.userData.wheels as THREE.Object3D[] | undefined;
      if (wheels) for (const w of wheels) w.rotation.x = ps.odo / (e.obj.userData.wheelR * p.scale);
    }
    for (const [id, e] of this.props) {
      if (!seenP.has(id)) {
        this.removeObj(e.obj, true);
        this.props.delete(id);
      }
    }

    this.updateHelpers(data, t, opts);
  }

  private updateHelpers(data: Scene, t: number, opts: SyncOptions) {
    this.helpers.visible = !!opts.helpers;
    if (!opts.helpers) return;
    const id = opts.selectedId;
    const actor = data.actors.find((a) => a.id === id);
    const prop = data.props.find((p) => p.id === id);
    this.selRing.visible = !!(actor || prop);
    if (actor) {
      const st = evaluateActor(actor, t);
      this.selRing.position.set(st.x, st.y + 0.01, st.z);
      this.selRing.scale.setScalar(variantDef(actor.variant).radius * actor.scale);
    } else if (prop) {
      const def = PROP_MAP[prop.kind];
      const ps = evaluateProp(prop, t, !!def?.vehicle);
      this.selRing.position.set(ps.x, 0.01, ps.z);
      this.selRing.scale.setScalar((def?.radius ?? 0.5) * prop.scale);
    }
    // путь персонажа или машины
    const pathKeys = actor ? actor.keys : prop && PROP_MAP[prop.kind]?.vehicle ? prop.keys ?? [] : [];
    if (pathKeys.length > 1) {
      const pts = pathKeys.map((k) => new THREE.Vector3(k.x, k.y + 0.02, k.z));
      this.pathLine.geometry.dispose();
      this.pathLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      this.pathLine.computeLineDistances();
      this.pathLine.visible = true;
      const m = new THREE.Matrix4();
      this.keyDots.count = Math.min(pathKeys.length, 64);
      pathKeys.slice(0, 64).forEach((k, i) => {
        m.makeTranslation(k.x, k.y + 0.02, k.z);
        this.keyDots.setMatrixAt(i, m);
      });
      this.keyDots.instanceMatrix.needsUpdate = true;
    } else {
      this.pathLine.visible = false;
      this.keyDots.count = 0;
    }
  }

  private removeObj(o: THREE.Object3D, disposeGeo: boolean) {
    this.scene.remove(o);
    disposeObject(o);
    if (disposeGeo) o.traverse((c) => (c as THREE.Mesh).geometry?.dispose());
  }

  /** Найти владельца (персонаж/декорацию) по объекту из рейкаста. */
  static ownerOf(o: THREE.Object3D | null): { id: string; kind: 'actor' | 'prop' } | null {
    while (o) {
      if (o.userData.ownerId) return { id: o.userData.ownerId, kind: o.userData.ownerKind };
      o = o.parent;
    }
    return null;
  }

  pickables(): THREE.Object3D[] {
    return [...[...this.actors.values()].map((e) => e.rig.root), ...[...this.props.values()].map((e) => e.obj)];
  }

  dispose() {
    for (const e of this.actors.values()) this.removeObj(e.rig.root, false);
    for (const e of this.props.values()) this.removeObj(e.obj, true);
    this.actors.clear();
    this.props.clear();
  }
}

// ---------- камера ----------

export function makeCamera(aspect: number) {
  const h = VIEW_HEIGHT / 2;
  const cam = new THREE.OrthographicCamera(-h * aspect, h * aspect, h, -h, 0.1, 200);
  return cam;
}

export function setCameraAspect(cam: THREE.OrthographicCamera, aspect: number) {
  // для вертикального кадра держим ширину, чтобы сцена не «уменьшалась»
  const h = aspect >= 1 ? VIEW_HEIGHT / 2 : VIEW_HEIGHT / 2 / aspect * 0.5625;
  cam.left = -h * aspect;
  cam.right = h * aspect;
  cam.top = h;
  cam.bottom = -h;
  cam.updateProjectionMatrix();
}

export function applyView(cam: THREE.OrthographicCamera, v: CameraView, target?: THREE.Vector3) {
  const [tx, ty, tz] = v.target;
  const ce = Math.cos(v.elevation);
  cam.position.set(
    tx + v.distance * ce * Math.sin(v.azimuth),
    ty + v.distance * Math.sin(v.elevation),
    tz + v.distance * ce * Math.cos(v.azimuth),
  );
  cam.zoom = v.zoom;
  cam.lookAt(tx, ty, tz);
  cam.updateProjectionMatrix();
  target?.set(tx, ty, tz);
}

export function readView(cam: THREE.OrthographicCamera, target: THREE.Vector3): CameraView {
  const off = cam.position.clone().sub(target);
  const d = off.length();
  return {
    target: [target.x, target.y, target.z],
    azimuth: Math.atan2(off.x, off.z),
    elevation: Math.asin(THREE.MathUtils.clamp(off.y / d, -1, 1)),
    distance: d,
    zoom: cam.zoom,
  };
}

export type { Actor, Prop };
