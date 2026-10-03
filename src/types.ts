export type Vec3 = [number, number, number];

export type FigureVariant =
  | 'man' | 'woman' | 'tall' | 'fat' | 'wheelchair' | 'oldman' | 'oldwoman' | 'robot'
  | 'cat' | 'dog' | 'horse' | 'deer';
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

/** '3d' — сцена с человечками; 'blank' — пустой кадр цвета background (для фото, видео, текста). */
export type SceneKind = '3d' | 'blank';

export interface Scene {
  id: string;
  kind?: SceneKind;
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

export type TextAnim = 'none' | 'fade' | 'pop' | 'slide' | 'type';

export interface TextClip {
  id: string;
  text: string;
  start: number;
  duration: number;
  style: TextStyle;
  position: 'top' | 'center' | 'bottom';
  color: string;
  size: number;
  font?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Свободная позиция центра блока (доли кадра); если задана — важнее position. */
  x?: number;
  y?: number;
  /** Обводка букв. */
  stroke?: string | null;
  strokeWidth?: number;
  /** Подложка; для стиля caption по умолчанию тёмная. */
  bg?: string | null;
  bgOpacity?: number;
  shadow?: boolean;
  anim?: TextAnim;
  letterSpacing?: number;
  /** Дорожка (общая с наложениями): выше — поверх. */
  track?: number;
}

/** Картинка/видео или стикер поверх кадра. */
export type OverlayAnim = 'none' | 'fade' | 'pop' | 'slide' | 'pulse' | 'bounce' | 'spin' | 'wiggle';

export interface Overlay {
  id: string;
  type: 'media' | 'sticker';
  /** media: id файла. */
  assetId?: string;
  /** sticker: id стикера. */
  sticker?: string;
  color?: string;
  start: number;
  duration: number;
  /** Сдвиг внутри видео (обрезка начала). */
  offset: number;
  /** Центр (доли кадра). */
  x: number;
  y: number;
  /** Ширина как доля ширины кадра. */
  scale: number;
  rotation: number;
  opacity: number;
  volume: number;
  anim: OverlayAnim;
  /** Дорожка (общая с текстом): выше — поверх. */
  track?: number;
}

export interface MediaAsset {
  id: string;
  name: string;
  type: 'image' | 'video';
  width: number;
  height: number;
  duration: number;
}

export type FilterKind = 'bw' | 'noir' | 'sepia' | 'vintage' | 'warm' | 'cold' | 'contrast' | 'faded' | 'dream' | 'blur' | 'vignette' | 'grain';

export interface FilterClip {
  id: string;
  filter: FilterKind;
  start: number;
  duration: number;
  /** Сила 0..1. */
  amount: number;
  track?: number;
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
  track?: number;
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
  mediaAssets: MediaAsset[];
  overlays: Overlay[];
  filters: FilterClip[];
  /** Состояние дорожек по группам: скрыта / без звука. Индекс — номер дорожки. */
  trackMeta?: TrackMeta;
}

export type TrackGroup = 'visual' | 'filter' | 'audio';
export interface TrackFlags {
  hidden?: boolean;
  muted?: boolean;
}
export type TrackMeta = Record<TrackGroup, Record<number, TrackFlags>>;

export type Selection =
  | { kind: 'scene'; id: string }
  | { kind: 'actor'; id: string }
  | { kind: 'prop'; id: string }
  | { kind: 'action'; id: string; actorId: string }
  | { kind: 'movekey'; id: string; actorId: string }
  | { kind: 'camkey'; id: string }
  | { kind: 'text'; id: string }
  | { kind: 'audio'; id: string }
  | { kind: 'overlay'; id: string }
  | { kind: 'filter'; id: string };
