import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Actor, Project } from '../types';
import { SceneRuntime, applyView, makeCamera, readView, setCameraAspect } from '../engine/runtime';
import { evaluateActor, evaluateCamera, evaluateProp, sceneAt, totalDuration } from '../engine/evaluate';
import { PROP_MAP } from '../engine/props';
import { drawOverlay } from '../engine/overlay';
import { ASPECTS } from '../project';
import { actorDraft, sceneOfDraft, useStore } from '../store';
import { setSceneCamera, writeActorTransform, writePropTransform } from '../ops';
import { audioCtx, ensureBuffers, scheduleClips, type ScheduledAudio } from '../audio/audio';

interface Drag {
  id: string;
  kind: 'actor' | 'prop';
  start: THREE.Vector3;
  orig: { x: number; z: number };
  planeY: number;
  moved: boolean;
}

/** Нерендерящая React-часть редактора: three.js, камера, мышь, проигрывание. */
export class EditorEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly cam: THREE.OrthographicCamera;
  readonly controls: OrbitControls;
  private runtime = new SceneRuntime();
  private overlay: CanvasRenderingContext2D;
  private raf = 0;
  private ro: ResizeObserver;
  private userCam = false;
  private lastSeek = -1;
  private lastScene = '';
  private drag: Drag | null = null;
  private ray = new THREE.Raycaster();
  private playback: { ctxStart: number; projStart: number; audio: ScheduledAudio } | null = null;
  private aspect = 16 / 9;
  /** Размер кадра в CSS-пикселях — для отрисовки рамки в UI. */
  frame = { w: 0, h: 0, x: 0, y: 0 };
  onFrame?: (f: { w: number; h: number; x: number; y: number }) => void;

  constructor(private host: HTMLDivElement, private gl: HTMLCanvasElement, private ov: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.overlay = ov.getContext('2d')!;
    this.cam = makeCamera(this.aspect);

    // наш обработчик должен идти раньше OrbitControls
    gl.addEventListener('pointerdown', this.onPointerDown);
    this.controls = new OrbitControls(this.cam, gl);
    this.controls.enableDamping = false;
    this.controls.zoomToCursor = true;
    this.controls.minZoom = 0.15;
    this.controls.maxZoom = 12;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.controls.addEventListener('start', () => (this.userCam = true));
    this.controls.addEventListener('end', this.onControlsEnd);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.loop();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.stopPlayback();
    this.ro.disconnect();
    this.controls.dispose();
    this.gl.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.runtime.dispose();
    this.renderer.dispose();
  }

  /** Вписать кадр нужного соотношения сторон в контейнер. */
  resize() {
    const r = this.host.getBoundingClientRect();
    const pad = 16;
    const aw = Math.max(50, r.width - pad * 2);
    const ah = Math.max(50, r.height - pad * 2);
    let w = aw;
    let h = w / this.aspect;
    if (h > ah) {
      h = ah;
      w = h * this.aspect;
    }
    w = Math.floor(w);
    h = Math.floor(h);
    const x = Math.floor((r.width - w) / 2);
    const y = Math.floor((r.height - h) / 2);
    for (const c of [this.gl, this.ov]) {
      c.style.width = w + 'px';
      c.style.height = h + 'px';
      c.style.left = x + 'px';
      c.style.top = y + 'px';
    }
    this.renderer.setSize(w, h, false);
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.ov.width = Math.floor(w * dpr);
    this.ov.height = Math.floor(h * dpr);
    setCameraAspect(this.cam, this.aspect);
    this.frame = { w, h, x, y };
    this.onFrame?.(this.frame);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const s = useStore.getState();
    const project = s.project;
    ensureBuffers(project);

    const aspect = ASPECTS[project.aspect];
    if (aspect !== this.aspect) {
      this.aspect = aspect;
      this.resize();
    }

    // проигрывание: мастер-часы — AudioContext
    let time = s.time;
    if (s.playing) {
      if (!this.playback) this.startPlayback(project, s.time);
      const pb = this.playback!;
      time = pb.projStart + (audioCtx().currentTime - pb.ctxStart);
      const total = totalDuration(project);
      if (time >= total) {
        time = total;
        useStore.getState().setPlaying(false);
        this.stopPlayback();
      }
      useStore.getState().setTimeFromPlayback(time);
      this.userCam = false;
    } else if (this.playback) {
      this.stopPlayback();
    }

    const at = sceneAt(project, time);
    if (at.scene.id !== this.lastScene || s.seekNonce !== this.lastSeek) {
      this.userCam = false;
      this.lastScene = at.scene.id;
      this.lastSeek = s.seekNonce;
    }

    const sel = s.selection;
    const selectedId =
      sel && (sel.kind === 'actor' || sel.kind === 'prop') ? sel.id : sel && (sel.kind === 'action' || sel.kind === 'movekey') ? sel.actorId : null;
    this.runtime.sync(at.scene, at.local, { helpers: !s.playing, selectedId });
    if (!this.userCam) applyView(this.cam, evaluateCamera(at.scene, at.local), this.controls.target);
    this.runtime.setShadowFocus(this.controls.target);
    this.renderer.render(this.runtime.scene, this.cam);

    const o = this.overlay;
    o.clearRect(0, 0, this.ov.width, this.ov.height);
    drawOverlay(o, project, time, this.ov.width, this.ov.height);
  };

  private startPlayback(p: Project, from: number) {
    const ac = audioCtx();
    void ac.resume();
    const total = totalDuration(p);
    if (from >= total - 0.01) {
      from = 0;
      useStore.getState().setTimeFromPlayback(0);
    }
    const when = ac.currentTime + 0.03;
    this.playback = { ctxStart: when, projStart: from, audio: scheduleClips(ac, ac.destination, p.audioClips, from, when, total) };
  }

  private stopPlayback() {
    this.playback?.audio.stop();
    this.playback = null;
  }

  /** Перезапустить звук (например, после правки клипов во время проигрывания). */
  restartPlayback() {
    if (!this.playback) return;
    const s = useStore.getState();
    this.stopPlayback();
    this.startPlayback(s.project, s.time);
  }

  // ---------- камера ----------

  private onControlsEnd = () => {
    const s = useStore.getState();
    const at = sceneAt(s.project, s.time);
    // без ключей камеры вид становится базовым видом сцены
    if (at.scene.cameraKeys.length === 0) {
      setSceneCamera(at.scene.id, readView(this.cam, this.controls.target));
      this.userCam = false;
    }
  };

  currentView() {
    return readView(this.cam, this.controls.target);
  }

  setView(v: Parameters<typeof applyView>[1]) {
    applyView(this.cam, v, this.controls.target);
    this.userCam = true;
    this.onControlsEnd();
  }

  get isFreeCamera() {
    return this.userCam;
  }

  // ---------- мышь ----------

  private ndc(e: { clientX: number; clientY: number }) {
    const r = this.gl.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  /** Точка на горизонтальной плоскости y под курсором. */
  floorPoint(e: { clientX: number; clientY: number }, y = 0): THREE.Vector3 | null {
    this.ray.setFromCamera(this.ndc(e), this.cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(plane, out) ? out : null;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const s = useStore.getState();
    this.ray.setFromCamera(this.ndc(e), this.cam);
    const hits = this.ray.intersectObjects(this.runtime.pickables(), true);
    const owner = hits.length ? SceneRuntime.ownerOf(hits[0].object) : null;
    if (!owner) {
      // клик в пустоту — снимаем выделение, но даём вращать камеру
      if (s.selection && (s.selection.kind === 'actor' || s.selection.kind === 'prop')) s.select(null);
      return;
    }
    e.stopImmediatePropagation();
    if (s.playing) s.setPlaying(false);
    s.select({ kind: owner.kind, id: owner.id });
    const at = sceneAt(s.project, s.time);
    let orig = { x: 0, z: 0 };
    let planeY = 0;
    if (owner.kind === 'actor') {
      const a = at.scene.actors.find((x) => x.id === owner.id)!;
      const st = evaluateActor(a, at.local);
      orig = { x: st.x, z: st.z };
      planeY = st.y;
    } else {
      const p = at.scene.props.find((x) => x.id === owner.id)!;
      const ps = evaluateProp(p, at.local, !!PROP_MAP[p.kind]?.vehicle);
      orig = { x: ps.x, z: ps.z };
      planeY = ps.y;
    }
    const start = this.floorPoint(e, planeY);
    if (!start) return;
    this.drag = { id: owner.id, kind: owner.kind, start, orig, planeY, moved: false };
    this.gl.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    const p = this.floorPoint(e, d.planeY);
    if (!p) return;
    let x = d.orig.x + p.x - d.start.x;
    let z = d.orig.z + p.z - d.start.z;
    if (e.ctrlKey || e.metaKey) {
      x = Math.round(x * 4) / 4;
      z = Math.round(z * 4) / 4;
    }
    const s = useStore.getState();
    if (!d.moved) {
      if (Math.hypot(p.x - d.start.x, p.z - d.start.z) < 0.03) return;
      d.moved = true;
      s.checkpoint();
    }
    const at = sceneAt(s.project, s.time);
    s.edit(
      (proj) => {
        if (d.kind === 'prop') {
          const pr = sceneOfDraft(proj, d.id)?.props.find((q) => q.id === d.id);
          if (pr) writePropTransform(pr, at.local, { x, z }, s.autoKey, true);
        } else {
          const a = actorDraft(proj, d.id);
          if (a) writeActorTransform(a, at.local, { x, z }, s.autoKey, true);
        }
      },
      { history: false },
    );
  };

  private onPointerUp = () => {
    this.drag = null;
  };

  /** Хелпер для UI: позиция персонажа в текущий момент. */
  static actorNow(a: Actor) {
    const s = useStore.getState();
    return evaluateActor(a, sceneAt(s.project, s.time).local);
  }
}
