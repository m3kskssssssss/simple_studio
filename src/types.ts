export type Vec3 = [number, number, number];

export type FigureVariant = 'man' | 'woman';
export type Accessory = 'none' | 'backpack' | 'bag';

/** Анимация (действие) на дорожке персонажа, время локальное для сцены. */
export interface ActionClip {
  id: string;
  type: string;
  start: number;
  duration: number;
  speed: number;
}

/** Ключ перемещения персонажа, время локальное для сцены. */
export interface MoveKey {
  id: string;
  t: number;
  x: number;
  y: number;
  z: number;
  ry: number;
}

export interface Actor {
  id: string;
  name: string;
  variant: FigureVariant;
  color: string;
  accessory: Accessory;
  scale: number;
  /** Базовая позиция (используется, если нет ключей). */
  x: number;
  y: number;
  z: number;
  ry: number;
  keys: MoveKey[];
  actions: ActionClip[];
  /** Автоматически шагать и поворачиваться по ходу движения между ключами. */
  autoWalk: boolean;
}

export interface Prop {
  id: string;
  kind: string;
  x: number;
  y: number;
  z: number;
  ry: number;
  scale: number;
  color: string | null;
  /** Ключи движения (только для транспорта). */
  keys?: MoveKey[];
}

export interface CameraView {
  target: Vec3;
  azimuth: number;
  elevation: number;
  distance: number;
  zoom: number;
}

export interface CameraKey extends CameraView {
  id: string;
  t: number;
  ease: 'smooth' | 'linear';
}

export type Transition = 'cut' | 'fade-black' | 'fade-white';

export interface Scene {
  id: string;
  name: string;
  duration: number;
  background: string;
  floor: string;
  grid: boolean;
  transition: Transition;
  actors: Actor[];
  props: Prop[];
  camera: CameraView;
  cameraKeys: CameraKey[];
}

export type TextStyle = 'caption' | 'title' | 'plain';

export interface TextClip {
  id: string;
  text: string;
  start: number;
  duration: number;
  style: TextStyle;
  position: 'top' | 'center' | 'bottom';
  color: string;
  size: number;
}

export interface AudioAsset {
  id: string;
  name: string;
  duration: number;
}

export interface AudioClip {
  id: string;
  assetId: string;
  name: string;
  /** Глобальное время начала на таймлайне. */
  start: number;
  /** Сдвиг внутри файла (обрезка начала). */
  offset: number;
  duration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export type Aspect = '16:9' | '9:16' | '1:1' | '4:3';

export interface Project {
  version: 1;
  name: string;
  aspect: Aspect;
  /** Цвет плашек вокруг центрального квадрата в вертикальном кадре (null — выкл). */
  frameBands?: string | null;
  fps: number;
  scenes: Scene[];
  texts: TextClip[];
  audioAssets: AudioAsset[];
  audioClips: AudioClip[];
}

export type Selection =
  | { kind: 'scene'; id: string }
  | { kind: 'actor'; id: string }
  | { kind: 'prop'; id: string }
  | { kind: 'action'; id: string; actorId: string }
  | { kind: 'movekey'; id: string; actorId: string }
  | { kind: 'camkey'; id: string }
  | { kind: 'text'; id: string }
  | { kind: 'audio'; id: string };
