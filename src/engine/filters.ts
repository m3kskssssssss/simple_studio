import type { FilterKind, Project } from '../types';

/**
 * Фильтры кадра. Цветовые — CSS-фильтры canvas (одинаково работают в превью и экспорте),
 * виньетка и зерно — полупрозрачные слои поверх картинки.
 */
export interface FilterDef {
  id: FilterKind;
  label: string;
  /** CSS-фильтр при силе a (0..1); px — масштаб размытия под разрешение. */
  css?: (a: number, px: number) => string;
  vignette?: (a: number) => number;
  grain?: (a: number) => number;
}

export const FILTERS: FilterDef[] = [
  { id: 'bw', label: 'Ч/Б', css: (a) => `grayscale(${a})` },
  { id: 'noir', label: 'Нуар', css: (a) => `grayscale(${a}) contrast(${1 + 0.55 * a}) brightness(${1 - 0.06 * a})`, vignette: (a) => 0.55 * a },
  { id: 'sepia', label: 'Сепия', css: (a) => `sepia(${a})` },
  { id: 'vintage', label: 'Винтаж', css: (a) => `sepia(${0.45 * a}) saturate(${1 - 0.25 * a}) contrast(${1 - 0.1 * a}) brightness(${1 + 0.05 * a})`, vignette: (a) => 0.45 * a, grain: (a) => 0.35 * a },
  { id: 'warm', label: 'Тепло', css: (a) => `sepia(${0.22 * a}) saturate(${1 + 0.35 * a}) brightness(${1 + 0.03 * a})` },
  { id: 'cold', label: 'Холод', css: (a) => `saturate(${1 - 0.15 * a}) hue-rotate(${-14 * a}deg) brightness(${1 + 0.04 * a})` },
  { id: 'contrast', label: 'Контраст', css: (a) => `contrast(${1 + 0.4 * a}) saturate(${1 + 0.3 * a})` },
  { id: 'faded', label: 'Пастель', css: (a) => `contrast(${1 - 0.25 * a}) brightness(${1 + 0.08 * a}) saturate(${1 - 0.35 * a})` },
  { id: 'dream', label: 'Мечта', css: (a, px) => `blur(${1.6 * a * px}px) brightness(${1 + 0.1 * a}) saturate(${1 + 0.2 * a})`, vignette: (a) => 0.2 * a },
  { id: 'blur', label: 'Размытие', css: (a, px) => `blur(${6 * a * px}px)` },
  { id: 'vignette', label: 'Виньетка', vignette: (a) => a },
  { id: 'grain', label: 'Плёнка', grain: (a) => 0.6 * a, css: (a) => `contrast(${1 + 0.08 * a})` },
];
export const FILTER_MAP = Object.fromEntries(FILTERS.map((f) => [f.id, f])) as Record<FilterKind, FilterDef>;

export interface FilterStack {
  css: string;
  vignette: number;
  grain: number;
}

const EDGE = 0.3;

/** Сумма активных фильтров в момент t (с плавным появлением/исчезновением на краях клипа). */
export function filterAt(p: Project, t: number, px: number): FilterStack {
  const parts: string[] = [];
  let vignette = 0;
  let grain = 0;
  for (const f of p.filters ?? []) {
    if (t < f.start || t >= f.start + f.duration) continue;
    if (p.trackMeta?.filter?.[f.track ?? 0]?.hidden) continue;
    const def = FILTER_MAP[f.filter];
    if (!def) continue;
    const edge = Math.min(1, (t - f.start) / EDGE, (f.start + f.duration - t) / EDGE);
    const a = Math.max(0, f.amount * (f.start <= 0.001 && t < EDGE ? 1 : edge));
    if (def.css) parts.push(def.css(a, px));
    if (def.vignette) vignette = Math.max(vignette, def.vignette(a));
    if (def.grain) grain = Math.max(grain, def.grain(a));
  }
  return { css: parts.length ? parts.join(' ') : 'none', vignette, grain };
}

let noise: HTMLCanvasElement | null = null;
function noiseCanvas() {
  if (noise) return noise;
  noise = document.createElement('canvas');
  noise.width = noise.height = 256;
  const ctx = noise.getContext('2d')!;
  const img = ctx.createImageData(256, 256);
  let seed = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = seed % 256;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return noise;
}

/** Виньетка и зерно поверх уже нарисованной картинки (область y0..y0+h). */
export function drawFilterLayers(ctx: CanvasRenderingContext2D, f: FilterStack, t: number, w: number, y0: number, h: number) {
  if (f.vignette > 0) {
    const g = ctx.createRadialGradient(w / 2, y0 + h / 2, Math.min(w, h) * 0.35, w / 2, y0 + h / 2, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.75 * f.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, w, h);
  }
  if (f.grain > 0) {
    const n = noiseCanvas();
    const pat = ctx.createPattern(n, 'repeat')!;
    // детерминированный сдвиг по кадру
    const k = Math.floor(t * 24);
    pat.setTransform(new DOMMatrix().translate((k * 97) % 256, (k * 61) % 256));
    ctx.save();
    ctx.globalAlpha = 0.13 * f.grain;
    ctx.fillStyle = pat;
    ctx.fillRect(0, y0, w, h);
    ctx.restore();
  }
}
