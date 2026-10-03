import type { Actor, Aspect, Prop, Project, Scene } from './types';
import { DEFAULT_CAMERA } from './engine/evaluate';
import { MAROON, NAVY } from './engine/palette';
import { PROP_MAP } from './engine/props';
import { ACTION_MAP } from './engine/poses';
import { assignMissingTracks } from './tracks';
import { variantDef } from './engine/variants';

export const uid = () => Math.random().toString(36).slice(2, 10);

export const ASPECTS: Record<Aspect, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:3': 4 / 3,
};

export function newActor(partial: Partial<Actor> = {}): Actor {
  return {
    id: uid(),
    name: variantDef(partial.variant ?? 'man').name,
    variant: 'man',
    color: NAVY,
    accessory: 'none',
    scale: 1,
    x: 0,
    y: 0,
    z: 0,
    ry: Math.PI / 4,
    keys: [],
    actions: [],
    autoWalk: true,
    ...partial,
  };
}

export function newProp(kind: string, partial: Partial<Prop> = {}): Prop {
  return { id: uid(), kind, x: 0, y: 0, z: 0, ry: 0, scale: 1, color: null, ...partial };
}

export function newScene(name: string, partial: Partial<Scene> = {}): Scene {
  return {
    id: uid(),
    kind: '3d',
    name,
    duration: 5,
    background: '#ffffff',
    floor: '#ffffff',
    grid: true,
    transition: 'cut',
    actors: [],
    props: [],
    camera: { ...DEFAULT_CAMERA, target: [...DEFAULT_CAMERA.target] },
    cameraKeys: [],
    ...partial,
  };
}

const act = (type: string, start: number, duration = ACTION_MAP[type].duration) => ({
  id: uid(),
  type,
  start,
  duration,
  speed: 1,
});

export function demoProject(): Project {
  // Сцена 1: комната, она машет, он подходит
  const s1 = newScene('Комната', { duration: 6 });
  s1.props = [
    newProp('bed', { x: -3, z: -2.2, ry: 0 }),
    newProp('plant', { x: -0.6, z: -3.4 }),
    newProp('beanbag', { x: 1.6, z: -2.9 }),
    newProp('lamp', { x: 3.4, z: -0.6, ry: -0.9 }),
    newProp('chair', { x: 3.2, z: 1.4, ry: -0.9 }),
    newProp('books', { x: -3.4, z: 1.6, ry: 0.3 }),
    newProp('rug', { x: 0.2, z: 0.2, color: '#e6e1dc' }),
  ];
  const him = newActor({ name: 'Он', variant: 'man', color: NAVY, x: -2.4, z: 1.2 });
  him.keys = [
    { id: uid(), t: 0.6, x: -2.4, y: 0, z: 1.2, ry: Math.PI / 2 },
    { id: uid(), t: 2.8, x: -0.5, y: 0, z: 0.3, ry: 1.45 },
  ];
  him.actions = [act('talk', 3.3, 2.4)];
  const her = newActor({ name: 'Она', variant: 'woman', color: MAROON, x: 0.9, z: 0.4, ry: -1.4 });
  her.actions = [act('wave', 0.4, 2.2), act('laugh', 4.2, 1.6)];
  s1.actors = [him, her];
  s1.cameraKeys = [
    { id: uid(), t: 0, ease: 'smooth', ...DEFAULT_CAMERA, target: [0, 0.6, 0], zoom: 0.95 },
    { id: uid(), t: 6, ease: 'smooth', ...DEFAULT_CAMERA, target: [0, 0.8, 0.4], zoom: 1.35 },
  ];

  // Сцена 2: компания радуется
  const s2 = newScene('Ура!', { duration: 5, transition: 'fade-white' });
  const people: [number, number, string, string][] = [
    [-1.6, 0, 'cheer', NAVY],
    [0, -1.2, 'jump', MAROON],
    [1.6, 0, 'clap', NAVY],
    [0.2, 1.4, 'dance', MAROON],
    [-1.2, 1.8, 'sit_floor', NAVY],
  ];
  s2.actors = people.map(([x, z, a, c], i) =>
    newActor({
      name: `Персонаж ${i + 1}`,
      variant: i % 2 ? 'woman' : 'man',
      color: c,
      x,
      z,
      ry: Math.atan2(-x, -z) + Math.PI * 0.0,
      actions: [act(a, 0, 5)],
    }),
  );
  s2.actors.forEach((a) => (a.ry = Math.PI / 4 + (a.x - a.z) * 0.15));
  s2.cameraKeys = [
    { id: uid(), t: 0, ease: 'smooth', ...DEFAULT_CAMERA, azimuth: Math.PI / 4 - 0.5, zoom: 1.1 },
    { id: uid(), t: 5, ease: 'smooth', ...DEFAULT_CAMERA, azimuth: Math.PI / 4 + 0.5, zoom: 1.25 },
  ];

  return {
    version: 1,
    name: 'Мой ролик',
    aspect: '16:9',
    fps: 30,
    scenes: [s1, s2],
    texts: [
      { id: uid(), text: 'Привет!', start: 0.5, duration: 2.2, style: 'caption', position: 'bottom', color: '#ffffff', size: 1 },
      { id: uid(), text: 'Ура!', start: 6.6, duration: 3, style: 'title', position: 'top', color: NAVY, size: 1.3 },
    ],
    audioAssets: [],
    audioClips: [],
    mediaAssets: [],
    overlays: [],
    filters: [],
  };
}

export function emptyProject(): Project {
  return {
    version: 1,
    name: 'Новый проект',
    aspect: '16:9',
    fps: 30,
    scenes: [newScene('Сцена 1')],
    texts: [],
    audioAssets: [],
    audioClips: [],
    mediaAssets: [],
    overlays: [],
    filters: [],
  };
}

/** Привести загруженный JSON к актуальной форме. */
export function normalizeProject(p: Project): Project {
  p.scenes.forEach((s) => {
    s.actors.forEach((a) => {
      a.keys.sort((x, y) => x.t - y.t);
      a.actions.sort((x, y) => x.start - y.start);
    });
    s.cameraKeys.sort((x, y) => x.t - y.t);
    s.props.forEach((pr) => pr.keys?.sort((x, y) => x.t - y.t));
    s.props = s.props.filter((pr) => PROP_MAP[pr.kind]);
  });
  p.scenes.forEach((s) => s.actors.forEach((a) => (a.accessory = 'none')));
  p.texts ??= [];
  p.audioAssets ??= [];
  p.audioClips ??= [];
  p.mediaAssets ??= [];
  p.overlays ??= [];
  p.filters ??= [];
  p.trackMeta ??= { visual: {}, filter: {}, audio: {} };
  assignMissingTracks(p as never);
  return p;
}
