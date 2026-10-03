import type { MediaAsset, Overlay, Project } from '../types';
import { decodeAndCache, getAudioBlob, putAudioBlob } from '../audio/audio';

/**
 * Картинки и видео пользователя: файлы лежат в IndexedDB (тот же store, что и аудио),
 * здесь — кэш загруженных <img>/<video> и синхронизация видео с плейхедом.
 */
const images = new Map<string, HTMLImageElement>();
const posters = new Map<string, string>();
const listeners = new Set<() => void>();

/** Подписка на появление превью (для таймлайна). */
export function onMediaChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
const notify = () => listeners.forEach((l) => l());

/** Картинка-превью для клипа на таймлайне. */
export function posterOf(id: string): string | null {
  return posters.get(id) ?? null;
}

function makePoster(id: string, src: HTMLImageElement | HTMLVideoElement, w: number, h: number) {
  const c = document.createElement('canvas');
  c.height = 64;
  c.width = Math.max(16, Math.round((64 * w) / Math.max(1, h)));
  try {
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    posters.set(id, c.toDataURL('image/jpeg', 0.7));
    notify();
  } catch {
    /* ignore */
  }
}
const videos = new Map<string, HTMLVideoElement>();
const loading = new Set<string>();

export function ensureMedia(p: Project) {
  for (const a of p.mediaAssets ?? []) {
    if (images.has(a.id) || videos.has(a.id) || loading.has(a.id)) continue;
    loading.add(a.id);
    getAudioBlob(a.id).then((blob) => {
      if (!blob) return;
      attach(a, blob);
    });
  }
}

function attach(a: MediaAsset, blob: Blob) {
  const url = URL.createObjectURL(blob);
  if (a.type === 'image') {
    const img = new Image();
    img.src = url;
    img.onload = () => makePoster(a.id, img, img.naturalWidth, img.naturalHeight);
    images.set(a.id, img);
  } else {
    const v = document.createElement('video');
    v.src = url;
    v.muted = true; // звук видео идёт через общий аудиодвижок
    v.playsInline = true;
    v.preload = 'auto';
    v.addEventListener('loadeddata', () => !posters.has(a.id) && makePoster(a.id, v, v.videoWidth, v.videoHeight), { once: true });
    videos.set(a.id, v);
  }
}

/** Источник для drawImage, если уже готов. */
export function mediaSource(id: string): CanvasImageSource | null {
  const img = images.get(id);
  if (img) return img.complete && img.naturalWidth ? img : null;
  const v = videos.get(id);
  if (v && v.readyState >= 2) return v;
  return null;
}

/** Импорт файла: сохранить, прочитать размеры/длительность, подготовить звук видео. */
export async function importMediaFile(id: string, file: File): Promise<MediaAsset> {
  await putAudioBlob(id, file);
  const isVideo = file.type.startsWith('video/');
  const url = URL.createObjectURL(file);
  let asset: MediaAsset;
  if (!isVideo) {
    const img = new Image();
    img.src = url;
    await img.decode();
    images.set(id, img);
    makePoster(id, img, img.naturalWidth, img.naturalHeight);
    asset = { id, name: file.name, type: 'image', width: img.naturalWidth, height: img.naturalHeight, duration: 0 };
  } else {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    await new Promise<void>((resolve, reject) => {
      v.onloadeddata = () => resolve();
      v.onerror = () => reject(new Error('Не удалось открыть видео'));
    });
    videos.set(id, v);
    makePoster(id, v, v.videoWidth, v.videoHeight);
    asset = { id, name: file.name, type: 'video', width: v.videoWidth, height: v.videoHeight, duration: v.duration };
    // звуковая дорожка видео (если есть) — в общий кэш аудиобуферов
    decodeAndCache(id, file).catch(() => undefined);
  }
  return asset;
}

const activeVideo = (p: Project, o: Overlay, t: number) =>
  o.type === 'media' && t >= o.start && t < o.start + o.duration && p.mediaAssets.find((a) => a.id === o.assetId)?.type === 'video';

/** Превью: держать видео в такт плейхеду (играть при проигрывании, перематывать на паузе). */
export function syncVideos(p: Project, t: number, playing: boolean) {
  const active = new Set<string>();
  for (const o of p.overlays ?? []) {
    if (!activeVideo(p, o, t)) continue;
    const v = videos.get(o.assetId!);
    if (!v || v.readyState < 1) continue;
    active.add(o.assetId!);
    const local = Math.min(t - o.start + o.offset, Math.max(0, v.duration - 0.05));
    if (playing) {
      if (v.paused) {
        v.currentTime = local;
        void v.play().catch(() => undefined);
      } else if (Math.abs(v.currentTime - local) > 0.3) v.currentTime = local;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - local) > 0.04 && !v.seeking) v.currentTime = local;
    }
  }
  for (const [id, v] of videos) if (!active.has(id) && !v.paused) v.pause();
}

/** Экспорт: перемотать видео точно на кадр и дождаться его. */
export async function seekVideosExact(p: Project, t: number) {
  const jobs: Promise<void>[] = [];
  for (const o of p.overlays ?? []) {
    if (!activeVideo(p, o, t)) continue;
    const v = videos.get(o.assetId!);
    if (!v) continue;
    if (!v.paused) v.pause();
    const local = Math.min(t - o.start + o.offset, Math.max(0, v.duration - 0.05));
    if (Math.abs(v.currentTime - local) < 1e-3 && v.readyState >= 2) continue;
    jobs.push(
      new Promise<void>((resolve) => {
        const done = () => resolve();
        v.addEventListener('seeked', done, { once: true });
        setTimeout(done, 1500);
        v.currentTime = local;
      }),
    );
  }
  await Promise.all(jobs);
}

/** Дождаться, пока все медиа проекта загрузятся (перед экспортом). */
export async function waitMediaReady(p: Project) {
  ensureMedia(p);
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    if ((p.mediaAssets ?? []).every((a) => mediaSource(a.id))) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}
