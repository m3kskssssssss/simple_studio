import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { Actor, Project, Scene, Selection } from './types';
import { demoProject, normalizeProject } from './project';
import { sceneAt, totalDuration } from './engine/evaluate';

const HISTORY_LIMIT = 150;

export type SaveState = 'saved' | 'saving' | 'dirty';

interface State {
  /** Экран: стартовое меню проектов или редактор. */
  view: 'home' | 'editor';
  /** id открытого проекта в хранилище. */
  projectId: string | null;
  saveState: SaveState;
  project: Project;
  past: Project[];
  future: Project[];
  selection: Selection | null;
  /** Глобальное время плейхеда, секунды. */
  time: number;
  playing: boolean;
  autoKey: boolean;
  pxPerSec: number;
  /** Счётчик «пользователь перемотал» — сбрасывает свободную камеру в редакторе. */
  seekNonce: number;

  edit: (fn: (p: Draft<Project>) => void, opts?: { history?: boolean }) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  replaceProject: (p: Project) => void;
  openProject: (id: string, p: Project) => void;
  goHome: () => void;
  select: (s: Selection | null) => void;
  seek: (t: number) => void;
  setTimeFromPlayback: (t: number) => void;
  setPlaying: (v: boolean) => void;
  setAutoKey: (v: boolean) => void;
  setPxPerSec: (v: number) => void;
}

export const useStore = create<State>((set, get) => ({
  view: 'home',
  projectId: null,
  saveState: 'saved',
  project: normalizeProject(demoProject()),
  past: [],
  future: [],
  selection: null,
  time: 0,
  playing: false,
  autoKey: true,
  pxPerSec: 80,
  seekNonce: 0,

  edit: (fn, opts = {}) => {
    const { project, past } = get();
    const next = produce(project, fn);
    if (next === project) return;
    if (opts.history === false) set({ project: next });
    else set({ project: next, past: [...past.slice(-HISTORY_LIMIT), project], future: [] });
  },
  checkpoint: () => {
    const { project, past } = get();
    set({ past: [...past.slice(-HISTORY_LIMIT), project], future: [] });
  },
  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] });
    fixSelection();
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    set({ project: future[0], past: [...past, project], future: future.slice(1) });
    fixSelection();
  },
  replaceProject: (p) => {
    set({ project: normalizeProject(p), past: [], future: [], selection: null, time: 0, playing: false });
  },
  openProject: (id, p) => {
    set({ view: 'editor', projectId: id, saveState: 'saved', project: normalizeProject(p), past: [], future: [], selection: null, time: 0, playing: false });
  },
  goHome: () => set({ view: 'home', playing: false, selection: null }),
  select: (s) => set({ selection: s }),
  seek: (t) => {
    const max = totalDuration(get().project);
    set({ time: Math.min(Math.max(0, t), max), seekNonce: get().seekNonce + 1 });
  },
  setTimeFromPlayback: (t) => set({ time: t }),
  setPlaying: (v) => set({ playing: v }),
  setAutoKey: (v) => set({ autoKey: v }),
  setPxPerSec: (v) => set({ pxPerSec: Math.min(Math.max(v, 15), 400) }),
}));

// ---------- автосохранение открытого проекта ----------

let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Снимок кадра для превью (ставит Viewport). */
export const thumbProvider: { current: (() => string | undefined) | null } = { current: null };

/** Сохранить немедленно (например, при выходе в меню). */
export async function saveNow(withThumb = true) {
  clearTimeout(saveTimer);
  const { projectId, project } = useStore.getState();
  if (!projectId) return;
  useStore.setState({ saveState: 'saving' });
  let thumb: string | undefined;
  try {
    thumb = withThumb ? thumbProvider.current?.() : undefined;
  } catch {
    thumb = undefined;
  }
  const { saveProject } = await import('./projects');
  await saveProject(projectId, project, thumb);
  if (useStore.getState().project === project) useStore.setState({ saveState: 'saved' });
}

let thumbTick = 0;
useStore.subscribe((s, prev) => {
  if (s.project === prev.project || !s.projectId || s.projectId !== prev.projectId) return;
  if (s.saveState !== 'dirty') useStore.setState({ saveState: 'dirty' });
  clearTimeout(saveTimer);
  // превью обновляем не на каждое сохранение — это дороже
  saveTimer = setTimeout(() => void saveNow(++thumbTick % 4 === 1), 700);
});

/** Снять выделение, если объект исчез (после undo/удаления). */
function fixSelection() {
  const { selection, project } = useStore.getState();
  if (selection && !findSelected(project, selection)) useStore.setState({ selection: null });
}

export function findSelected(p: Project, s: Selection): unknown {
  switch (s.kind) {
    case 'scene':
      return p.scenes.find((x) => x.id === s.id);
    case 'actor':
      return p.scenes.flatMap((x) => x.actors).find((x) => x.id === s.id);
    case 'prop':
      return p.scenes.flatMap((x) => x.props).find((x) => x.id === s.id);
    case 'action':
      return p.scenes.flatMap((x) => x.actors).find((x) => x.id === s.actorId)?.actions.find((x) => x.id === s.id);
    case 'movekey':
      return p.scenes.flatMap((x) => x.actors).find((x) => x.id === s.actorId)?.keys.find((x) => x.id === s.id);
    case 'camkey':
      return p.scenes.flatMap((x) => x.cameraKeys).find((x) => x.id === s.id);
    case 'text':
      return p.texts.find((x) => x.id === s.id);
    case 'audio':
      return p.audioClips.find((x) => x.id === s.id);
    case 'overlay':
      return p.overlays.find((x) => x.id === s.id);
    case 'filter':
      return p.filters.find((x) => x.id === s.id);
  }
}

// ---------- удобные селекторы ----------

export function currentSceneInfo() {
  const { project, time } = useStore.getState();
  return sceneAt(project, time);
}

export function useCurrentScene(): Scene {
  return useStore((s) => sceneAt(s.project, s.time).scene);
}

/** Найти сцену (draft) с персонажем/объектом. */
export function sceneOfDraft(p: Draft<Project>, objectId: string): Draft<Scene> | undefined {
  return p.scenes.find(
    (s) =>
      s.id === objectId ||
      s.actors.some((a) => a.id === objectId) ||
      s.props.some((x) => x.id === objectId) ||
      s.cameraKeys.some((k) => k.id === objectId),
  );
}

export function actorDraft(p: Draft<Project>, id: string): Draft<Actor> | undefined {
  for (const s of p.scenes) {
    const a = s.actors.find((x) => x.id === id);
    if (a) return a;
  }
}

export function sortActor(a: Draft<Actor>) {
  a.keys.sort((x, y) => x.t - y.t);
  a.actions.sort((x, y) => x.start - y.start);
}
