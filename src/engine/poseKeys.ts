import type { FigureVariant } from '../types';
import type { RigKind } from './variants';

/**
 * Позы — плоский набор углов суставов (радианы).
 * Соглашения: персонаж смотрит в +Z, его левая сторона — +X.
 *  - плечо/бедро x < 0 — конечность вперёд; z — в сторону (для левой +, для правой −); y — скручивание
 *  - локоть < 0 — сгиб вперёд; колено > 0 — сгиб назад
 *  - торс/голова x > 0 — наклон вперёд
 *  - rx/ry2 — наклон и поворот всей модели (коляска с седоком), whl/wd — доворот колёс (вместе / в разные стороны)
 *  - tw/tl/ear/jaw — хвост, уши и пасть животных (см. animal.ts)
 *  - grip — трость: 0 висит отвесно, 1 продолжает руку (замахнуться)
 */
export const POSE_KEYS = [
  'y', 'bz2', 'bx', 'by', 'bz',
  'tx', 'ty', 'tz',
  'hx', 'hy', 'hz',
  'lsx', 'lsy', 'lsz', 'le',
  'rsx', 'rsy', 'rsz', 're',
  'lhx', 'lhy', 'lhz', 'lk',
  'rhx', 'rhy', 'rhz', 'rk',
  'rx', 'ry2', 'whl', 'wd',
  'tw', 'tl', 'ear', 'jaw',
  'grip',
] as const;
export type PoseKey = (typeof POSE_KEYS)[number];
export type Pose = Record<PoseKey, number>;

export const ZERO: Readonly<Pose> = Object.freeze(Object.fromEntries(POSE_KEYS.map((k) => [k, 0])) as Pose);

export type ActionGroup = 'Особые' | 'Движение' | 'Жесты' | 'Эмоции' | 'Позы';

export interface ActionDef {
  id: string;
  label: string;
  icon: string;
  group: ActionGroup;
  duration: number;
  /** v — вариант модели (для животных размеры и повадки отличаются). */
  fn: (t: number, v: FigureVariant) => Pose;
  /** Для какого скелета (по умолчанию — человек). */
  rig?: RigKind;
  /** Только для этих вариантов. */
  only?: FigureVariant[];
  /** Не для этих вариантов. */
  not?: FigureVariant[];
}
