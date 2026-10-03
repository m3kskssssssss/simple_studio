import type { AudioClip, Project } from '../types';

// ---------- IndexedDB для аудиофайлов ----------

const DB_NAME = 'simple-studio';
const STORE = 'audio';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putAudioBlob(id: string, blob: Blob) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAudioBlob(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------- декодирование и кэш ----------

let ctx: AudioContext | null = null;
export function audioCtx() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

const buffers = new Map<string, AudioBuffer>();
const peaksCache = new Map<string, Float32Array>();
const loading = new Map<string, Promise<AudioBuffer | undefined>>();
const listeners = new Set<() => void>();

export function onBuffersChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getBuffer(id: string) {
  return buffers.get(id);
}

export async function decodeAndCache(id: string, blob: Blob): Promise<AudioBuffer> {
  const buf = await audioCtx().decodeAudioData(await blob.arrayBuffer());
  buffers.set(id, buf);
  listeners.forEach((l) => l());
  return buf;
}

/** Подгрузить буферы всех ассетов проекта из IndexedDB. */
export function ensureBuffers(p: Project) {
  for (const a of p.audioAssets) {
    if (buffers.has(a.id) || loading.has(a.id)) continue;
    const job = getAudioBlob(a.id)
      .then((b) => (b ? decodeAndCache(a.id, b) : undefined))
      .catch(() => undefined);
    loading.set(a.id, job);
  }
}

/** Пики громкости (PEAKS_PER_SEC на секунду) для отрисовки волны. */
export const PEAKS_PER_SEC = 60;
export function getPeaks(id: string): Float32Array | undefined {
  const cached = peaksCache.get(id);
  if (cached) return cached;
  const buf = buffers.get(id);
  if (!buf) return;
  const n = Math.ceil(buf.duration * PEAKS_PER_SEC);
  const out = new Float32Array(n);
  const step = buf.sampleRate / PEAKS_PER_SEC;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      let m = 0;
      const s0 = Math.floor(i * step);
      const s1 = Math.min(d.length, Math.floor((i + 1) * step));
      for (let s = s0; s < s1; s += 4) m = Math.max(m, Math.abs(d[s]));
      out[i] = Math.max(out[i], m);
    }
  }
  peaksCache.set(id, out);
  return out;
}

// ---------- планирование воспроизведения ----------

export interface ScheduledAudio {
  stop: () => void;
}

/**
 * Запланировать все аудиоклипы проекта, начиная с времени проекта `from`,
 * так что время проекта `from` соответствует `when` в часах контекста.
 */
export function scheduleClips(
  ac: BaseAudioContext,
  dest: AudioNode,
  clips: AudioClip[],
  from: number,
  when: number,
  end: number,
): ScheduledAudio {
  const nodes: AudioBufferSourceNode[] = [];
  for (const c of clips) {
    const buf = buffers.get(c.assetId);
    if (!buf) continue;
    const clipEnd = Math.min(c.start + c.duration, end);
    if (clipEnd <= from) continue;
    const startInClip = Math.max(0, from - c.start);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    const t0 = when + Math.max(0, c.start - from);
    const len = clipEnd - c.start - startInClip;
    if (len <= 0) continue;
    // огибающая громкости с фейдами
    const gainAt = (local: number) => {
      let v = c.volume;
      if (c.fadeIn > 0) v *= Math.min(1, local / c.fadeIn);
      if (c.fadeOut > 0) v *= Math.min(1, (c.duration - local) / c.fadeOut);
      return Math.max(0, v);
    };
    g.gain.setValueAtTime(gainAt(startInClip), t0);
    if (c.fadeIn > startInClip) g.gain.linearRampToValueAtTime(c.volume, t0 + (c.fadeIn - startInClip));
    if (c.fadeOut > 0) {
      const fs = c.duration - c.fadeOut - startInClip;
      if (fs > 0) g.gain.setValueAtTime(c.volume, t0 + fs);
      g.gain.linearRampToValueAtTime(0, t0 + c.duration - startInClip);
    }
    src.connect(g).connect(dest);
    src.start(t0, c.offset + startInClip, len);
    nodes.push(src);
  }
  return {
    stop: () =>
      nodes.forEach((n) => {
        try {
          n.stop();
        } catch {
          /* уже остановлен */
        }
      }),
  };
}

// ---------- импорт файла ----------

export async function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(b);
  });
}

export async function base64ToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}
