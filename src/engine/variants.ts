import type { FigureVariant } from '../types';

/** Тип скелета: человек (общие позы) или четвероногое (свои позы). */
export type RigKind = 'human' | 'quad';

export interface VariantDef {
  id: FigureVariant;
  label: string;
  /** Имя нового персонажа по умолчанию. */
  name: string;
  rig: RigKind;
  color: string;
  /** Радиус кольца выделения и столкновений, м. */
  radius: number;
}

export const VARIANTS: VariantDef[] = [
  { id: 'man', label: 'Он', name: 'Он', rig: 'human', color: '#27344f', radius: 0.42 },
  { id: 'woman', label: 'Она', name: 'Она', rig: 'human', color: '#6a2633', radius: 0.42 },
  { id: 'tall', label: 'Высокий', name: 'Высокий', rig: 'human', color: '#4a6a5a', radius: 0.45 },
  { id: 'fat', label: 'Толстый', name: 'Толстяк', rig: 'human', color: '#b5873a', radius: 0.52 },
  { id: 'wheelchair', label: 'На коляске', name: 'Колясочник', rig: 'human', color: '#3d5a80', radius: 0.62 },
  { id: 'oldman', label: 'Дед', name: 'Дедушка', rig: 'human', color: '#7a6a58', radius: 0.45 },
  { id: 'oldwoman', label: 'Бабушка', name: 'Бабушка', rig: 'human', color: '#7d8899', radius: 0.45 },
  { id: 'robot', label: 'Робот', name: 'Робот', rig: 'human', color: '#a9b4c2', radius: 0.45 },
  { id: 'cat', label: 'Кошка', name: 'Кошка', rig: 'quad', color: '#d9893b', radius: 0.32 },
  { id: 'dog', label: 'Собака', name: 'Собака', rig: 'quad', color: '#a8794e', radius: 0.55 },
  { id: 'horse', label: 'Лошадь', name: 'Лошадь', rig: 'quad', color: '#6b4632', radius: 1.35 },
  { id: 'deer', label: 'Олень', name: 'Олень', rig: 'quad', color: '#a0703f', radius: 1.0 },
];

export const VARIANT_MAP = Object.fromEntries(VARIANTS.map((v) => [v.id, v])) as Record<FigureVariant, VariantDef>;

export const variantDef = (v: FigureVariant): VariantDef => VARIANT_MAP[v] ?? VARIANT_MAP.man;
export const rigOf = (v: FigureVariant): RigKind => variantDef(v).rig;
