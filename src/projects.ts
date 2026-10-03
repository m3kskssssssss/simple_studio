import type { Aspect, Project } from './types';
import { idbAll, idbDelete, idbGet, idbKeys, idbPut } from './db';
import { demoProject, emptyProject, normalizeProject, uid } from './project';
import { totalDuration } from './engine/evaluate';
import { base64ToBlob, blobToBase64, decodeAndCache, getAudioBlob, putAudioBlob } from './audio/audio';

/** Запись проекта в хранилище. */
export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  duration: number;
  aspect: Aspect;
  /** Превью (JPEG dataURL). */
  thumb?: string;
  data: Project;
}

export type ProjectMeta = Omit<ProjectRecord, 'data'>;

const LEGACY_KEY = 'simple-studio:project';

/** Перенести проект из старого автосохранения (localStorage), один раз. */
async function migrateLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const p = normalizeProject(JSON.parse(raw));
    await saveProject(uid(), p, undefined, Date.now() - 1000);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

let migrated = false;

export async function listProjects(): Promise<ProjectMeta[]> {
  if (!migrated) {
    migrated = true;
    await migrateLegacy();
  }
  const all = await idbAll<ProjectRecord>('projects');
  return all.map(({ data: _d, ...meta }) => meta).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: string): Promise<Project | null> {
  const r = await idbGet<ProjectRecord>('projects', id);
  return r ? normalizeProject(r.data) : null;
}

/** Сохранить проект (превью — если передано, иначе остаётся прежнее). */
export async function saveProject(id: string, p: Project, thumb?: string, createdAt?: number) {
  const prev = await idbGet<ProjectRecord>('projects', id);
  const rec: ProjectRecord = {
    id,
    name: p.name,
    createdAt: prev?.createdAt ?? createdAt ?? Date.now(),
    updatedAt: Date.now(),
    duration: totalDuration(p),
    aspect: p.aspect,
    thumb: thumb ?? prev?.thumb,
    data: p,
  };
  await idbPut('projects', id, rec);
}

export async function createProject(kind: 'empty' | 'demo', aspect: Aspect = '16:9'): Promise<string> {
  const p = kind === 'demo' ? demoProject() : emptyProject();
  if (kind === 'empty') p.aspect = aspect;
  p.name = kind === 'demo' ? 'Демо-проект' : await nextName();
  const id = uid();
  await saveProject(id, normalizeProject(p));
  return id;
}

async function nextName() {
  const names = new Set((await listProjects()).map((p) => p.name));
  let i = 1;
  while (names.has(`Проект ${i}`)) i++;
  return `Проект ${i}`;
}

export async function renameProject(id: string, name: string) {
  const r = await idbGet<ProjectRecord>('projects', id);
  if (!r) return;
  r.name = name;
  r.data.name = name;
  r.updatedAt = Date.now();
  await idbPut('projects', id, r);
}

export async function duplicateProject(id: string): Promise<string | null> {
  const r = await idbGet<ProjectRecord>('projects', id);
  if (!r) return null;
  const nid = uid();
  const data = { ...JSON.parse(JSON.stringify(r.data)), name: r.name + ' (копия)' } as Project;
  await idbPut('projects', nid, { ...r, id: nid, name: data.name, data, createdAt: Date.now(), updatedAt: Date.now() });
  return nid;
}

/** Удалить проект и файлы, которые больше ни в одном проекте не используются. */
export async function deleteProject(id: string) {
  await idbDelete('projects', id);
  const all = await idbAll<ProjectRecord>('projects');
  const used = new Set<string>();
  for (const r of all) {
    for (const a of r.data.audioAssets ?? []) used.add(a.id);
    for (const m of r.data.mediaAssets ?? []) used.add(m.id);
  }
  for (const key of await idbKeys('audio')) if (!used.has(key)) await idbDelete('audio', key);
}

// ---------- файл проекта (.studio.json) ----------

interface ProjectFile {
  project: Project;
  /** Файлы проекта (звук, фото, видео) в base64. */
  audio: Record<string, string>;
}

export async function projectToFile(p: Project): Promise<Blob> {
  const audio: Record<string, string> = {};
  for (const a of [...p.audioAssets, ...(p.mediaAssets ?? [])]) {
    const b = await getAudioBlob(a.id);
    if (b) audio[a.id] = await blobToBase64(b);
  }
  const file: ProjectFile = { project: p, audio };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

/** Импортировать файл проекта как новый проект; вернуть его id. */
export async function importProjectFile(f: File): Promise<string> {
  const data = JSON.parse(await f.text()) as ProjectFile | Project;
  const file: ProjectFile = 'project' in data ? data : { project: data, audio: {} };
  for (const [id, url] of Object.entries(file.audio ?? {})) {
    const blob = await base64ToBlob(url);
    await putAudioBlob(id, blob);
    await decodeAndCache(id, blob).catch(() => undefined);
  }
  const id = uid();
  await saveProject(id, normalizeProject(file.project));
  return id;
}

/** «2 мин назад», «вчера», дата. */
export function ago(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  if (s < 172800) return 'вчера';
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}
