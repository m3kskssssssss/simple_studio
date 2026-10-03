import { useRef } from 'react';
import { useStore } from '../store';
import type { Aspect, Project } from '../types';
import { demoProject, emptyProject } from '../project';
import { base64ToBlob, blobToBase64, decodeAndCache, getAudioBlob, putAudioBlob } from '../audio/audio';

interface ProjectFile {
  project: Project;
  audio: Record<string, string>;
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function saveProjectFile() {
  const p = useStore.getState().project;
  const audio: Record<string, string> = {};
  for (const a of p.audioAssets) {
    const b = await getAudioBlob(a.id);
    if (b) audio[a.id] = await blobToBase64(b);
  }
  const file: ProjectFile = { project: p, audio };
  download(new Blob([JSON.stringify(file)], { type: 'application/json' }), `${p.name || 'project'}.studio.json`);
}

async function openProjectFile(f: File) {
  try {
    const data = JSON.parse(await f.text()) as ProjectFile | Project;
    const file: ProjectFile = 'project' in data ? data : { project: data, audio: {} };
    for (const [id, url] of Object.entries(file.audio ?? {})) {
      const blob = await base64ToBlob(url);
      await putAudioBlob(id, blob);
      await decodeAndCache(id, blob);
    }
    useStore.getState().replaceProject(file.project);
  } catch (e) {
    alert('Не удалось открыть проект: ' + (e as Error).message);
  }
}

export function TopBar({ onExport }: { onExport: () => void }) {
  const name = useStore((s) => s.project.name);
  const aspect = useStore((s) => s.project.aspect);
  const fps = useStore((s) => s.project.fps);
  const frameBands = useStore((s) => s.project.frameBands);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const edit = useStore((s) => s.edit);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="topbar">
      <div className="logo">
        <span className="dot" /> Simple Studio
      </div>
      <input
        className="name"
        type="text"
        value={name}
        onChange={(e) => edit((p) => void (p.name = e.target.value), { history: false })}
        title="Название проекта"
      />
      <button className="ghost" disabled={!canUndo} onClick={() => useStore.getState().undo()} title="Отменить (Ctrl+Z)">
        ↶
      </button>
      <button className="ghost" disabled={!canRedo} onClick={() => useStore.getState().redo()} title="Повторить (Ctrl+Y)">
        ↷
      </button>
      <div className="spacer" />
      <label className="hint">Кадр</label>
      <select value={aspect} onChange={(e) => edit((p) => void (p.aspect = e.target.value as Aspect))} title="Соотношение сторон видео">
        <option value="16:9">16:9 — YouTube</option>
        <option value="9:16">9:16 — Shorts / Reels</option>
        <option value="1:1">1:1 — квадрат</option>
        <option value="4:3">4:3</option>
      </select>
      {aspect === '9:16' && (
        <label className="hint" style={{ display: 'flex', gap: 5, alignItems: 'center' }} title="Действие в центральном квадрате, сверху и снизу — плашки для текста">
          <input type="checkbox" checked={!!frameBands} onChange={(e) => edit((p) => void (p.frameBands = e.target.checked ? '#14161c' : null))} />
          квадрат
          {frameBands && <input type="color" value={frameBands} onChange={(e) => edit((p) => void (p.frameBands = e.target.value), { history: false })} />}
        </label>
      )}
      <select value={fps} onChange={(e) => edit((p) => void (p.fps = Number(e.target.value)))} title="Кадров в секунду">
        <option value={24}>24 fps</option>
        <option value={30}>30 fps</option>
        <option value={60}>60 fps</option>
      </select>
      <button
        onClick={() => {
          if (confirm('Создать пустой проект? Несохранённые изменения пропадут.')) useStore.getState().replaceProject(emptyProject());
        }}
      >
        Новый
      </button>
      <button
        onClick={() => {
          if (confirm('Загрузить демо-проект? Текущий проект будет заменён.')) useStore.getState().replaceProject(demoProject());
        }}
      >
        Демо
      </button>
      <button onClick={() => fileRef.current?.click()}>Открыть…</button>
      <button onClick={() => void saveProjectFile()}>Сохранить</button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openProjectFile(f);
          e.target.value = '';
        }}
      />
      <button className="primary" onClick={onExport}>
        ⬇ Экспорт видео
      </button>
    </div>
  );
}
