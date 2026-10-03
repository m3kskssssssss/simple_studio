import { saveNow, useStore } from '../store';
import type { Aspect } from '../types';
import { projectToFile } from '../projects';
export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function TopBar({ onExport }: { onExport: () => void }) {
  const name = useStore((s) => s.project.name);
  const aspect = useStore((s) => s.project.aspect);
  const fps = useStore((s) => s.project.fps);
  const frameBands = useStore((s) => s.project.frameBands);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const saveState = useStore((s) => s.saveState);
  const edit = useStore((s) => s.edit);

  return (
    <div className="topbar">
      <img className="app-logo" src="./logo.png" alt="Simple Studio" title="Simple Studio" />
      <button
        className="ghost back"
        title="К проектам (сохранится автоматически)"
        onClick={async () => {
          await saveNow(true);
          useStore.getState().goHome();
        }}
      >
        ‹ Проекты
      </button>
      <div className="sep-v" />
      <input
        className="name"
        type="text"
        value={name}
        onChange={(e) => edit((p) => void (p.name = e.target.value), { history: false })}
        title="Название проекта"
      />
      <span className={'save-state ' + saveState} title="Проект сохраняется автоматически">
        {saveState === 'saved' ? '✓ Сохранено' : saveState === 'saving' ? 'Сохранение…' : '● Изменено'}
      </span>
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
        title="Скачать проект одним файлом (.studio.json) — со звуком, фото и видео"
        onClick={async () => {
          const p = useStore.getState().project;
          download(await projectToFile(p), `${p.name || 'project'}.studio.json`);
        }}
      >
        Файл проекта
      </button>
      <button className="primary" onClick={onExport}>
        ⬇ Экспорт
      </button>
    </div>
  );
}
