import type { Draft } from 'immer';
import type { Project, TrackFlags, TrackGroup } from './types';

/**
 * Дорожки как в CapCut. Три группы:
 *  - visual — текст, стикеры, фото и видео (общие дорожки; выше — поверх в кадре);
 *  - filter — фильтры;
 *  - audio — звук.
 * Номер дорожки хранится в самом клипе (track), 0 — нижняя.
 */

export interface TrackItem {
  id: string;
  start: number;
  duration: number;
  track?: number;
}

type P = Project | Draft<Project>;

export function groupItems(p: P, g: TrackGroup): TrackItem[] {
  if (g === 'visual') return [...(p.texts as TrackItem[]), ...(p.overlays as TrackItem[])];
  if (g === 'filter') return p.filters as TrackItem[];
  return p.audioClips as TrackItem[];
}

export function groupOf(kind: string): TrackGroup | null {
  if (kind === 'text' || kind === 'overlay') return 'visual';
  if (kind === 'filter') return 'filter';
  if (kind === 'audio') return 'audio';
  return null;
}

export const trackOf = (it: TrackItem) => it.track ?? 0;

export function trackCount(p: P, g: TrackGroup) {
  return groupItems(p, g).reduce((m, it) => Math.max(m, trackOf(it) + 1), 0);
}

const EPS = 1e-3;
const overlaps = (a: { start: number; duration: number }, b: { start: number; duration: number }) =>
  a.start < b.start + b.duration - EPS && b.start < a.start + a.duration - EPS;

/** Есть ли на дорожке клип, пересекающийся с [start, start+duration) (кроме exceptId). */
export function trackBusy(p: P, g: TrackGroup, track: number, start: number, duration: number, exceptId?: string) {
  return groupItems(p, g).some((it) => it.id !== exceptId && trackOf(it) === track && overlaps(it, { start, duration }));
}

/** Нижняя дорожка, где клип помещается; иначе — новая сверху. */
export function freeTrack(p: P, g: TrackGroup, start: number, duration: number, prefer = 0, exceptId?: string) {
  const n = trackCount(p, g);
  for (let t = Math.max(0, prefer); t < n; t++) if (!trackBusy(p, g, t, start, duration, exceptId)) return t;
  return n;
}

function meta(p: Draft<Project>, g: TrackGroup) {
  p.trackMeta ??= { visual: {}, filter: {}, audio: {} };
  p.trackMeta[g] ??= {};
  return p.trackMeta[g];
}

export function trackFlags(p: P, g: TrackGroup, track: number): TrackFlags {
  return p.trackMeta?.[g]?.[track] ?? {};
}

/** Вставить пустую дорожку с номером at (всё, что выше или равно, сдвигается вверх). */
export function insertTrack(p: Draft<Project>, g: TrackGroup, at: number) {
  for (const it of groupItems(p, g)) if (trackOf(it) >= at) it.track = trackOf(it) + 1;
  const m = meta(p, g);
  const keys = Object.keys(m).map(Number).sort((a, b) => b - a);
  for (const k of keys) if (k >= at) {
    m[k + 1] = m[k];
    delete m[k];
  }
}

/** Убрать пустые дорожки и перенумеровать подряд (флаги дорожек едут вместе с ними). */
export function compactTracks(p: Draft<Project>, g?: TrackGroup) {
  for (const grp of g ? [g] : (['visual', 'filter', 'audio'] as TrackGroup[])) {
    const items = groupItems(p, grp);
    const used = [...new Set(items.map(trackOf))].sort((a, b) => a - b);
    const remap = new Map(used.map((t, i) => [t, i]));
    for (const it of items) it.track = remap.get(trackOf(it))!;
    const m = meta(p, grp);
    const next: Record<number, TrackFlags> = {};
    for (const [k, v] of Object.entries(m)) {
      const nk = remap.get(Number(k));
      if (nk !== undefined && (v.hidden || v.muted)) next[nk] = v;
    }
    p.trackMeta![grp] = next;
  }
}

/** Разложить клипы без дорожек (старые проекты) так, чтобы они не перекрывались. */
export function assignMissingTracks(p: Draft<Project>) {
  for (const g of ['visual', 'filter', 'audio'] as TrackGroup[]) {
    const items = groupItems(p, g).filter((it) => it.track === undefined);
    // текст исторически был поверх медиа — кладём медиа ниже
    const sorted = g === 'visual'
      ? [...items.filter((it) => (p.overlays as TrackItem[]).includes(it)), ...items.filter((it) => (p.texts as TrackItem[]).includes(it))]
      : [...items].sort((a, b) => a.start - b.start);
    for (const it of sorted) it.track = freeTrack(p, g, it.start, it.duration, 0, it.id);
  }
  compactTracks(p);
}

/**
 * Положить клип на дорожку track с началом start. Если место занято — создаётся новая дорожка
 * прямо над track (как в CapCut при наложении клипов друг на друга). Возвращает итоговую дорожку.
 */
export function placeClip(p: Draft<Project>, g: TrackGroup, id: string, start: number, track: number): number {
  const it = groupItems(p, g).find((x) => x.id === id);
  if (!it) return track;
  it.start = Math.max(0, start);
  let target = Math.max(0, track);
  if (trackBusy(p, g, target, it.start, it.duration, id)) {
    insertTrack(p, g, target + 1);
    target += 1;
  }
  it.track = target;
  compactTracks(p, g);
  return it.track ?? target;
}

/** Границы соседей на дорожке — чтобы края клипа не заезжали на них при обрезке. */
export function neighbours(p: P, g: TrackGroup, id: string) {
  const it = groupItems(p, g).find((x) => x.id === id)!;
  let left = 0;
  let right = Infinity;
  for (const o of groupItems(p, g)) {
    if (o.id === id || trackOf(o) !== trackOf(it)) continue;
    const end = o.start + o.duration;
    if (end <= it.start + EPS) left = Math.max(left, end);
    if (o.start >= it.start + it.duration - EPS) right = Math.min(right, o.start);
  }
  return { left, right };
}

/** Все края клипов (для привязки). */
export function clipEdges(p: P, exceptId?: string): number[] {
  const out: number[] = [];
  for (const g of ['visual', 'filter', 'audio'] as TrackGroup[])
    for (const it of groupItems(p, g)) if (it.id !== exceptId) out.push(it.start, it.start + it.duration);
  return out;
}
