import type { Draft } from 'immer';
import type { Actor, AudioClip, CameraView, FilterClip, FilterKind, MoveKey, Overlay, Project, Prop, Scene, TextClip } from './types';
import { importMediaFile } from './engine/media';
import { compactTracks, freeTrack, groupItems, groupOf, insertTrack, placeClip, trackBusy, trackCount } from './tracks';
import { actorDraft, currentSceneInfo, sceneOfDraft, sortActor, useStore } from './store';
import { ASPECTS, newActor, newProp, newScene, uid } from './project';
import { ACTION_MAP } from './engine/poses';
import { PROP_MAP } from './engine/props';
import { evaluateActor, evaluateCamera, evaluateProp, sceneStart, totalDuration } from './engine/evaluate';
import { decodeAndCache, putAudioBlob } from './audio/audio';

const st = () => useStore.getState();
const KEY_SNAP = 0.06;

/** Сцена под плейхедом; в пустом проекте создаётся новая. */
function curScene(p: Draft<Project>): Draft<Scene> {
  const id = currentSceneInfo().scene.id;
  const found = p.scenes.find((s) => s.id === id);
  if (found) return found;
  const s = newScene(`Сцена ${p.scenes.length + 1}`);
  p.scenes.push(s);
  return p.scenes[p.scenes.length - 1];
}
const localTime = () => currentSceneInfo().local;

// ---------- объекты ----------

export function addActor(partial: Partial<Actor>, at?: { x: number; z: number }) {
  const a = newActor({ ...partial, x: at?.x ?? (Math.random() - 0.5) * 2, z: at?.z ?? (Math.random() - 0.5) * 2 });
  st().edit((p) => {
    curScene(p).actors.push(a);
  });
  st().select({ kind: 'actor', id: a.id });
}

export function addProp(kind: string, at?: { x: number; z: number }) {
  const def = PROP_MAP[kind];
  const pr = newProp(kind, { x: at?.x ?? (Math.random() - 0.5) * 3, z: at?.z ?? (Math.random() - 0.5) * 3 });
  if (def && ['wall', 'window_wall'].includes(kind)) pr.ry = 0;
  st().edit((p) => {
    curScene(p).props.push(pr);
  });
  st().select({ kind: 'prop', id: pr.id });
}

export function deleteSelection() {
  const sel = st().selection;
  if (!sel) return;
  st().edit((p) => {
    switch (sel.kind) {
      case 'actor':
        p.scenes.forEach((s) => (s.actors = s.actors.filter((a) => a.id !== sel.id)));
        break;
      case 'prop':
        p.scenes.forEach((s) => (s.props = s.props.filter((a) => a.id !== sel.id)));
        break;
      case 'action': {
        const a = actorDraft(p, sel.actorId);
        if (a) a.actions = a.actions.filter((x) => x.id !== sel.id);
        break;
      }
      case 'movekey': {
        const a = actorDraft(p, sel.actorId);
        if (a) {
          a.keys = a.keys.filter((x) => x.id !== sel.id);
          if (a.keys.length) Object.assign(a, pick(a.keys[0]));
        }
        break;
      }
      case 'camkey':
        p.scenes.forEach((s) => (s.cameraKeys = s.cameraKeys.filter((k) => k.id !== sel.id)));
        break;
      case 'text':
        p.texts = p.texts.filter((x) => x.id !== sel.id);
        break;
      case 'audio':
        p.audioClips = p.audioClips.filter((x) => x.id !== sel.id);
        break;
      case 'overlay':
        p.overlays = p.overlays.filter((x) => x.id !== sel.id);
        break;
      case 'filter':
        p.filters = p.filters.filter((x) => x.id !== sel.id);
        break;
      case 'scene':
        p.scenes = p.scenes.filter((s) => s.id !== sel.id);
        break;
    }
  });
  if (sel.kind === 'action' || sel.kind === 'movekey') st().select({ kind: 'actor', id: sel.actorId });
  else st().select(null);
  const g = groupOf(sel.kind);
  if (g) st().edit((p) => compactTracks(p, g), { history: false });
  if (sel.kind === 'scene') st().seek(st().time); // плейхед не должен остаться за концом ролика
}

const pick = (k: { x: number; y: number; z: number; ry: number }) => ({ x: k.x, y: k.y, z: k.z, ry: k.ry });

export function duplicateSelection() {
  const sel = st().selection;
  if (!sel) return;
  let newSel: typeof sel | null = null;
  st().edit((p) => {
    if (sel.kind === 'actor' || sel.kind === 'prop') {
      const s = sceneOfDraft(p, sel.id)!;
      if (sel.kind === 'actor') {
        const a = s.actors.find((x) => x.id === sel.id)!;
        const c: Actor = JSON.parse(JSON.stringify(a));
        c.id = uid();
        c.name = a.name + ' (копия)';
        c.x += 0.8;
        c.keys.forEach((k) => ((k.id = uid()), (k.x += 0.8)));
        c.actions.forEach((k) => (k.id = uid()));
        s.actors.push(c);
        newSel = { kind: 'actor', id: c.id };
      } else {
        const pr = s.props.find((x) => x.id === sel.id)!;
        const c: Prop = { ...JSON.parse(JSON.stringify(pr)), id: uid(), x: pr.x + 0.8, z: pr.z + 0.4 };
        c.keys?.forEach((k) => ((k.id = uid()), (k.x += 0.8), (k.z += 0.4)));
        s.props.push(c);
        newSel = { kind: 'prop', id: c.id };
      }
    } else if (sel.kind === 'scene') {
      const i = p.scenes.findIndex((s) => s.id === sel.id);
      const c: Scene = JSON.parse(JSON.stringify(p.scenes[i]));
      c.id = uid();
      c.name += ' (копия)';
      c.actors.forEach((a) => {
        a.id = uid();
        a.keys.forEach((k) => (k.id = uid()));
        a.actions.forEach((k) => (k.id = uid()));
      });
      c.props.forEach((x) => ((x.id = uid()), x.keys?.forEach((k) => (k.id = uid()))));
      c.cameraKeys.forEach((x) => (x.id = uid()));
      p.scenes.splice(i + 1, 0, c);
      newSel = { kind: 'scene', id: c.id };
    } else if (sel.kind === 'text') {
      const t = p.texts.find((x) => x.id === sel.id)!;
      const c = { ...t, id: uid(), start: t.start + t.duration };
      c.track = freeTrack(p, 'visual', c.start, c.duration, t.track ?? 0);
      p.texts.push(c);
      newSel = { kind: 'text', id: c.id };
    } else if (sel.kind === 'overlay') {
      const o = p.overlays.find((x) => x.id === sel.id)!;
      const c = { ...o, id: uid(), x: Math.min(0.95, o.x + 0.05), y: Math.min(0.95, o.y + 0.05) };
      c.track = freeTrack(p, 'visual', c.start, c.duration, (o.track ?? 0) + 1);
      p.overlays.push(c);
      newSel = { kind: 'overlay', id: c.id };
    } else if (sel.kind === 'filter') {
      const f = p.filters.find((x) => x.id === sel.id)!;
      const c = { ...f, id: uid(), start: f.start + f.duration };
      c.track = freeTrack(p, 'filter', c.start, c.duration, f.track ?? 0);
      p.filters.push(c);
      newSel = { kind: 'filter', id: c.id };
    }
  });
  if (newSel) st().select(newSel);
}

// ---------- трансформации персонажа ----------

export interface TransformPatch {
  x?: number;
  y?: number;
  z?: number;
  ry?: number;
}

/**
 * Записать положение персонажа в момент t (локальное время сцены).
 * autoKey: создаёт/обновляет ключ движения в t; иначе сдвигает весь путь.
 */
export function writeActorTransform(a: Draft<Actor>, t: number, patch: TransformPatch, autoKey: boolean, faceTravel = false) {
  writeKeyedTransform(a, evaluateActor(a as Actor, t), t, patch, autoKey, faceTravel);
}

/** То же для транспорта; обычные декорации просто двигаются. */
export function writePropTransform(p: Draft<Prop>, t: number, patch: TransformPatch, autoKey: boolean, faceTravel = false) {
  const vehicle = !!PROP_MAP[p.kind]?.vehicle;
  if (!vehicle) {
    Object.assign(p, patch);
    return;
  }
  p.keys ??= [];
  writeKeyedTransform(p as Draft<Keyed>, evaluateProp(p as Prop, t, true), t, patch, autoKey, faceTravel);
}

type Keyed = { keys: MoveKey[]; x: number; y: number; z: number; ry: number };

function writeKeyedTransform(a: Draft<Keyed>, cur: TransformPatch & { x: number; y: number; z: number; ry: number }, t: number, patch: TransformPatch, autoKey: boolean, faceTravel: boolean) {
  const sortKeys = () => a.keys.sort((x, y) => x.t - y.t);
  if (a.keys.length === 0) {
    if (!autoKey || t < KEY_SNAP || (patch.x === undefined && patch.z === undefined && patch.y === undefined)) {
      Object.assign(a, patch);
      return;
    }
    a.keys.push({ id: uid(), t: 0, x: a.x, y: a.y, z: a.z, ry: a.ry });
  }
  if (!autoKey) {
    const dx = (patch.x ?? cur.x) - cur.x;
    const dy = (patch.y ?? cur.y) - cur.y;
    const dz = (patch.z ?? cur.z) - cur.z;
    const dr = patch.ry !== undefined ? patch.ry - cur.ry : 0;
    for (const k of a.keys) {
      k.x += dx;
      k.y += dy;
      k.z += dz;
      k.ry += dr;
    }
    Object.assign(a, pick(a.keys[0]));
    return;
  }
  let k = a.keys.find((k) => Math.abs(k.t - t) < KEY_SNAP);
  if (!k) {
    a.keys.push({ id: uid(), t, x: cur.x, y: cur.y, z: cur.z, ry: cur.ry });
    sortKeys();
    k = a.keys.find((k) => k.t === t)!;
  }
  Object.assign(k, patch);
  if (faceTravel) {
    const i = a.keys.indexOf(k);
    const prev = a.keys[i - 1];
    if (prev && Math.hypot(k.x - prev.x, k.z - prev.z) > 0.15) k.ry = Math.atan2(k.x - prev.x, k.z - prev.z);
  }
  Object.assign(a, pick(a.keys[0]));
}

export function rotateSelected(delta: number) {
  const sel = st().selection;
  if (!sel) return;
  if (sel.kind === 'prop') {
    const t = localTime();
    st().edit((p) => {
      const pr = sceneOfDraft(p, sel.id)?.props.find((x) => x.id === sel.id);
      if (pr) writePropTransform(pr, t, { ry: evaluateProp(pr as Prop, t, !!PROP_MAP[pr.kind]?.vehicle).ry + delta }, st().autoKey);
    });
  } else if (sel.kind === 'actor') {
    const t = localTime();
    st().edit((p) => {
      const a = actorDraft(p, sel.id);
      if (a) writeActorTransform(a, t, { ry: evaluateActor(a as Actor, t).ry + delta }, st().autoKey);
    });
  }
}

// ---------- анимации ----------

export function addActionAtPlayhead(actorId: string, type: string) {
  const def = ACTION_MAP[type];
  const info = currentSceneInfo();
  let t = info.local;
  const id = uid();
  st().edit((p) => {
    const a = actorDraft(p, actorId);
    if (!a) return;
    // если под плейхедом уже есть действие — заменяем его тип
    const under = a.actions.find((c) => t >= c.start && t < c.start + c.duration);
    if (under) {
      under.type = type;
      return;
    }
    const next = a.actions.find((c) => c.start > t);
    const room = Math.min(next ? next.start - t : Infinity, info.scene.duration - t);
    if (room < 0.2) t = Math.max(0, t - 0.2);
    a.actions.push({ id, type, start: t, duration: Math.max(0.2, Math.min(def.duration, room)), speed: 1 });
    sortActor(a);
  });
  const a = useStore.getState().project.scenes.flatMap((s) => s.actors).find((x) => x.id === actorId);
  const created = a?.actions.find((c) => c.id === id);
  if (created) st().select({ kind: 'action', id, actorId });
}

// ---------- камера ----------

export function addCameraKey(view: CameraView) {
  const info = currentSceneInfo();
  const t = info.local;
  const id = uid();
  st().edit((p) => {
    const s = p.scenes.find((x) => x.id === info.scene.id)!;
    const existing = s.cameraKeys.find((k) => Math.abs(k.t - t) < KEY_SNAP);
    if (existing) Object.assign(existing, view, { target: [...view.target] });
    else {
      s.cameraKeys.push({ id, t, ease: 'smooth', ...view, target: [...view.target] });
      s.cameraKeys.sort((a, b) => a.t - b.t);
    }
  });
  const s = st().project.scenes.find((x) => x.id === info.scene.id)!;
  const k = s.cameraKeys.find((k) => Math.abs(k.t - t) < KEY_SNAP);
  if (k) st().select({ kind: 'camkey', id: k.id });
}

export function setSceneCamera(sceneId: string, view: CameraView) {
  st().edit((p) => {
    const s = p.scenes.find((x) => x.id === sceneId);
    if (s) s.camera = { ...view, target: [...view.target] };
  });
}

export function currentCameraView(): CameraView {
  const info = currentSceneInfo();
  return evaluateCamera(info.scene, info.local);
}

// ---------- сцены ----------

export function addScene() {
  const s = newScene(`Сцена ${st().project.scenes.length + 1}`);
  st().edit((p) => {
    p.scenes.push(s);
  });
  st().seek(sceneStart(st().project, s.id) + 0.001);
  st().select({ kind: 'scene', id: s.id });
}

export function moveScene(id: string, dir: -1 | 1) {
  st().edit((p) => {
    const i = p.scenes.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.scenes.length) return;
    [p.scenes[i], p.scenes[j]] = [p.scenes[j], p.scenes[i]];
  });
}

// ---------- текст и аудио ----------

export function addText() {
  const t = st().time;
  const c: TextClip = {
    id: uid(),
    text: 'Новый текст',
    start: t,
    duration: 2.5,
    style: 'caption',
    position: 'bottom',
    color: '#ffffff',
    size: 1,
  };
  st().edit((p) => {
    c.track = freeTrack(p, 'visual', c.start, c.duration);
    p.texts.push(c);
  });
  st().select({ kind: 'text', id: c.id });
}

export async function importAudio(file: File) {
  const id = uid();
  await putAudioBlob(id, file);
  const buf = await decodeAndCache(id, file);
  const clip: AudioClip = {
    id: uid(),
    assetId: id,
    name: file.name.replace(/\.[^.]+$/, ''),
    start: st().time,
    offset: 0,
    duration: Math.min(buf.duration, Math.max(1, totalDuration(st().project) - st().time)),
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
  };
  st().edit((p) => {
    p.audioAssets.push({ id, name: file.name, duration: buf.duration });
    clip.track = freeTrack(p, 'audio', clip.start, clip.duration);
    p.audioClips.push(clip);
  });
  st().select({ kind: 'audio', id: clip.id });
}

export function addAudioClipFromAsset(assetId: string) {
  const asset = st().project.audioAssets.find((a) => a.id === assetId);
  if (!asset) return;
  const clip: AudioClip = {
    id: uid(),
    assetId,
    name: asset.name.replace(/\.[^.]+$/, ''),
    start: st().time,
    offset: 0,
    duration: asset.duration,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
  };
  st().edit((p) => {
    clip.track = freeTrack(p, 'audio', clip.start, clip.duration);
    p.audioClips.push(clip);
  });
  st().select({ kind: 'audio', id: clip.id });
}

/** Разрезать выбранный клип (аудио/текст/действие/сцену) по плейхеду. */
export function splitAtPlayhead() {
  const sel = st().selection;
  const t = st().time;
  if (!sel) return;
  st().edit((p) => {
    if (sel.kind === 'audio') {
      const c = p.audioClips.find((x) => x.id === sel.id);
      if (!c || t <= c.start + 0.05 || t >= c.start + c.duration - 0.05) return;
      const left = t - c.start;
      p.audioClips.push({ ...c, id: uid(), start: t, offset: c.offset + left, duration: c.duration - left, fadeIn: 0 });
      c.duration = left;
      c.fadeOut = 0;
    } else if (sel.kind === 'text') {
      const c = p.texts.find((x) => x.id === sel.id);
      if (!c || t <= c.start + 0.05 || t >= c.start + c.duration - 0.05) return;
      p.texts.push({ ...c, id: uid(), start: t, duration: c.start + c.duration - t });
      c.duration = t - c.start;
    } else if (sel.kind === 'overlay') {
      const c = p.overlays.find((x) => x.id === sel.id);
      if (!c || t <= c.start + 0.05 || t >= c.start + c.duration - 0.05) return;
      const left = t - c.start;
      p.overlays.push({ ...c, id: uid(), start: t, offset: c.offset + left, duration: c.duration - left });
      c.duration = left;
    } else if (sel.kind === 'filter') {
      const c = p.filters.find((x) => x.id === sel.id);
      if (!c || t <= c.start + 0.05 || t >= c.start + c.duration - 0.05) return;
      p.filters.push({ ...c, id: uid(), start: t, duration: c.start + c.duration - t });
      c.duration = t - c.start;
    } else if (sel.kind === 'action') {
      const a = actorDraft(p, sel.actorId);
      const c = a?.actions.find((x) => x.id === sel.id);
      const lt = localTime();
      if (!a || !c || lt <= c.start + 0.05 || lt >= c.start + c.duration - 0.05) return;
      a.actions.push({ ...c, id: uid(), start: lt, duration: c.start + c.duration - lt });
      c.duration = lt - c.start;
      sortActor(a);
    }
  });
}

// ---------- пустой кадр, медиа, стикеры, фильтры ----------

/** Пустой кадр без 3D — фон для фото, видео и текста (как в CapCut). */
export function addBlankScene(color = '#111111') {
  const info = currentSceneInfo();
  const s = newScene(`Кадр ${st().project.scenes.length + 1}`, { kind: 'blank', background: color, floor: color, duration: 4 });
  st().edit((p) => {
    p.scenes.splice(info.index + 1, 0, s);
  });
  st().seek(sceneStart(st().project, s.id) + 0.001);
  st().select({ kind: 'scene', id: s.id });
}

/** Длительность нового клипа: до конца ролика, но не меньше 1 с. */
const clipLen = (want: number) => Math.max(1, Math.min(want, totalDuration(st().project) - st().time || want));

export async function importMedia(file: File) {
  const id = uid();
  const asset = await importMediaFile(id, file);
  st().edit((p) => {
    p.mediaAssets.push(asset);
  });
  addMediaOverlay(id);
}

export function addMediaOverlay(assetId: string) {
  const asset = st().project.mediaAssets.find((a) => a.id === assetId);
  if (!asset) return;
  const p0 = st().project;
  const aspect = ASPECTS[p0.aspect];
  // по умолчанию — вписать в кадр
  const fit = Math.min(1, (asset.width / Math.max(1, asset.height)) / aspect);
  const o: Overlay = {
    id: uid(), type: 'media', assetId, start: st().time,
    duration: asset.type === 'video' ? Math.max(0.5, Math.min(asset.duration, clipLen(asset.duration))) : clipLen(3),
    offset: 0, x: 0.5, y: 0.5, scale: fit, rotation: 0, opacity: 1, volume: 1, anim: 'none',
  };
  st().edit((p) => {
    o.track = freeTrack(p, 'visual', o.start, o.duration);
    p.overlays.push(o);
  });
  st().select({ kind: 'overlay', id: o.id });
}

export function addSticker(sticker: string) {
  const o: Overlay = {
    id: uid(), type: 'sticker', sticker, start: st().time, duration: clipLen(2.5), offset: 0,
    x: 0.5 + (Math.random() - 0.5) * 0.3, y: 0.4 + (Math.random() - 0.5) * 0.2, scale: 0.16, rotation: 0, opacity: 1, volume: 0, anim: 'pop',
  };
  st().edit((p) => {
    o.track = freeTrack(p, 'visual', o.start, o.duration);
    p.overlays.push(o);
  });
  st().select({ kind: 'overlay', id: o.id });
}

export function addFilter(filter: FilterKind, whole = false) {
  const total = totalDuration(st().project);
  const f: FilterClip = whole
    ? { id: uid(), filter, start: 0, duration: Math.max(1, total), amount: 1 }
    : { id: uid(), filter, start: st().time, duration: clipLen(3), amount: 1 };
  st().edit((p) => {
    f.track = freeTrack(p, 'filter', f.start, f.duration);
    p.filters.push(f);
  });
  st().select({ kind: 'filter', id: f.id });
}

// ---------- копировать / вставить клипы ----------

type ClipCopy =
  | { kind: 'text'; data: TextClip }
  | { kind: 'overlay'; data: Overlay }
  | { kind: 'filter'; data: FilterClip }
  | { kind: 'audio'; data: AudioClip };
let clipboard: ClipCopy | null = null;

export function copySelection() {
  const s = st();
  const sel = s.selection;
  if (!sel) return false;
  const p = s.project;
  const find = <T extends { id: string }>(arr: T[]) => JSON.parse(JSON.stringify(arr.find((x) => x.id === sel.id))) as T;
  if (sel.kind === 'text') clipboard = { kind: 'text', data: find(p.texts) };
  else if (sel.kind === 'overlay') clipboard = { kind: 'overlay', data: find(p.overlays) };
  else if (sel.kind === 'filter') clipboard = { kind: 'filter', data: find(p.filters) };
  else if (sel.kind === 'audio') clipboard = { kind: 'audio', data: find(p.audioClips) };
  else return false;
  return true;
}

/** Вставить скопированный клип в позицию плейхеда (на свободную дорожку). */
export function pasteClip() {
  if (!clipboard) return false;
  const cb = clipboard;
  const t = st().time;
  const id = uid();
  st().edit((p) => {
    if (cb.kind === 'text') {
      const c = { ...cb.data, id, start: t };
      c.track = freeTrack(p, 'visual', c.start, c.duration, cb.data.track ?? 0);
      p.texts.push(c);
    } else if (cb.kind === 'overlay') {
      const c = { ...cb.data, id, start: t };
      c.track = freeTrack(p, 'visual', c.start, c.duration, cb.data.track ?? 0);
      p.overlays.push(c);
    } else if (cb.kind === 'filter') {
      const c = { ...cb.data, id, start: t };
      c.track = freeTrack(p, 'filter', c.start, c.duration, cb.data.track ?? 0);
      p.filters.push(c);
    } else {
      const c = { ...cb.data, id, start: t };
      c.track = freeTrack(p, 'audio', c.start, c.duration, cb.data.track ?? 0);
      p.audioClips.push(c);
    }
  });
  st().select({ kind: cb.kind, id } as never);
  return true;
}

/** Переложить выбранный клип на дорожку выше/ниже (выше — поверх в кадре). Занято — появится новая дорожка. */
export function moveSelectionTrack(delta: 1 | -1) {
  const sel = st().selection;
  if (!sel) return false;
  const g = groupOf(sel.kind);
  if (!g) return false;
  st().edit((p) => {
    const it = groupItems(p, g).find((x) => x.id === sel.id);
    if (!it) return;
    const cur = it.track ?? 0;
    const n = trackCount(p, g);
    if (delta > 0) {
      // на верхней дорожке — создать новую сверху
      if (cur >= n - 1) {
        it.track = n;
      } else placeClip(p, g, it.id, it.start, cur + 1);
    } else {
      if (cur === 0) {
        insertTrack(p, g, 0);
        it.track = 0;
      } else if (trackBusy(p, g, cur - 1, it.start, it.duration, it.id)) {
        // нижняя занята — новая дорожка под ней
        insertTrack(p, g, cur - 1);
        it.track = cur - 1;
      } else it.track = cur - 1;
    }
    compactTracks(p, g);
  });
  return true;
}
