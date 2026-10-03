import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Aspect } from '../types';
import { TEMPLATES } from '../templates';
import { emptyProject, normalizeProject, uid } from '../project';
import {
  ago,
  createProject,
  deleteProject,
  duplicateProject,
  importProjectFile,
  listProjects,
  loadProject,
  projectToFile,
  renameProject,
  saveProject,
  type ProjectMeta,
} from '../projects';
import { groupThumb } from '../engine/thumbs';
import { download } from './TopBar';

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

async function open(id: string) {
  const p = await loadProject(id);
  if (p) useStore.getState().openProject(id, p);
}

/** Новый проект из шаблона сцены. */
async function fromTemplate(name: string) {
  const t = TEMPLATES.find((x) => x.name === name)!;
  const p = emptyProject();
  p.name = t.name;
  p.scenes = [t.build()];
  const id = uid();
  await saveProject(id, normalizeProject(p));
  await open(id);
}

const tplThumbs = new Map<string, string>();
function tplThumb(name: string) {
  let u = tplThumbs.get(name);
  if (!u) {
    const sc = TEMPLATES.find((t) => t.name === name)!.build();
    u = groupThumb(name, sc.props.map((p) => ({ kind: p.kind, x: p.keys?.[0]?.x ?? p.x, z: p.keys?.[0]?.z ?? p.z, ry: p.keys?.[0]?.ry ?? p.ry, color: p.color })));
    tplThumbs.set(name, u);
  }
  return u;
}

function AspectIcon({ a }: { a: Aspect }) {
  const [w, h] = a === '16:9' ? [34, 19] : a === '9:16' ? [16, 28] : a === '1:1' ? [24, 24] : [28, 21];
  return <span className="aspect-ico" style={{ width: w, height: h }} />;
}

export function Home() {
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nav, setNav] = useState<'home' | 'templates'>('home');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => listProjects().then(setProjects);
  useEffect(() => {
    void refresh();
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);

  const create = async (aspect: Aspect) => open(await createProject('empty', aspect));
  const shown = (projects ?? []).filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="home">
      <aside className="home-side">
        <div className="home-logo">
          <img className="app-logo" src="./logo.png" alt="" /> Simple Studio
        </div>
        <button className={'side-item' + (nav === 'home' ? ' active' : '')} onClick={() => setNav('home')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>
          Главная
        </button>
        <button className={'side-item' + (nav === 'templates' ? ' active' : '')} onClick={() => setNav('templates')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></svg>
          Шаблоны
        </button>
        <div className="side-spacer" />
        <div className="side-note">Проекты сохраняются автоматически на этом компьютере.</div>
      </aside>

      <main className="home-main">
        {nav === 'home' && (
          <>
            <section className="create-row">
              <button className="create-big" onClick={() => void create('16:9')}>
                <span className="plus"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 4v16M4 12h16" /></svg></span>
                <span>
                  <b>Создать проект</b>
                  <small>16:9 · горизонтальное видео</small>
                </span>
              </button>
              <div className="create-small">
                {(
                  [
                    ['9:16', 'Вертикальное', 'Shorts / Reels / TikTok'],
                    ['1:1', 'Квадрат', 'Лента'],
                    ['4:3', 'Классика', '4:3'],
                  ] as [Aspect, string, string][]
                ).map(([a, t, sub]) => (
                  <button key={a} className="create-tile" onClick={() => void create(a)}>
                    <AspectIcon a={a} />
                    <span>
                      <b>{t}</b>
                      <small>{sub}</small>
                    </span>
                  </button>
                ))}
                <button className="create-tile" onClick={() => fileRef.current?.click()}>
                  <span className="tile-ico">⇪</span>
                  <span>
                    <b>Открыть файл</b>
                    <small>.studio.json</small>
                  </span>
                </button>
                <button className="create-tile" onClick={async () => open(await createProject('demo'))}>
                  <span className="tile-ico">▶</span>
                  <span>
                    <b>Демо-проект</b>
                    <small>пример ролика</small>
                  </span>
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    await open(await importProjectFile(f));
                  } catch (err) {
                    alert('Не удалось открыть проект: ' + (err as Error).message);
                  }
                }}
              />
            </section>

            <section>
              <div className="home-h">
                <h2>Начать с шаблона</h2>
                <button className="ghost" onClick={() => setNav('templates')}>
                  Все →
                </button>
              </div>
              <div className="tpl-row">
                {['Вечеринка', 'Улица', 'Остановка', 'Двор', 'Гостиная'].map((n) => (
                  <button key={n} className="tpl-card" onClick={() => void fromTemplate(n)}>
                    <img src={tplThumb(n)} alt="" />
                    <span>{n}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="home-h">
                <h2>Проекты {projects ? <span className="count">{projects.length}</span> : null}</h2>
                <input className="search" type="text" placeholder="Поиск проектов" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              {projects && !projects.length && <div className="empty">Пока нет проектов — создайте первый выше.</div>}
              <div className="proj-grid">
                {shown.map((p) => (
                  <div key={p.id} className="proj-card" onClick={() => void open(p.id)}>
                    <div className="proj-thumb">
                      {p.thumb ? <img src={p.thumb} alt="" /> : <div className="no-thumb">{p.name.slice(0, 1)}</div>}
                      <span className="proj-dur">{fmtDur(p.duration)}</span>
                      <span className="proj-aspect">{p.aspect}</span>
                      <button
                        className="proj-more"
                        title="Ещё"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenu(menu === p.id ? null : p.id);
                        }}
                      >
                        ⋯
                      </button>
                      {menu === p.id && (
                        <div className="proj-menu" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => void open(p.id)}>Открыть</button>
                          <button onClick={() => (setRenaming(p.id), setMenu(null))}>Переименовать</button>
                          <button onClick={async () => (await duplicateProject(p.id), setMenu(null), refresh())}>Дублировать</button>
                          <button
                            onClick={async () => {
                              setMenu(null);
                              const data = await loadProject(p.id);
                              if (data) download(await projectToFile(data), `${p.name}.studio.json`);
                            }}
                          >
                            Сохранить в файл
                          </button>
                          <button
                            className="danger"
                            onClick={async () => {
                              setMenu(null);
                              if (confirm(`Удалить «${p.name}»? Это нельзя отменить.`)) {
                                await deleteProject(p.id);
                                void refresh();
                              }
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      )}
                    </div>
                    {renaming === p.id ? (
                      <input
                        className="proj-rename"
                        autoFocus
                        defaultValue={p.name}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        onBlur={async (e) => {
                          const v = e.target.value.trim();
                          setRenaming(null);
                          if (v && v !== p.name) {
                            await renameProject(p.id, v);
                            void refresh();
                          }
                        }}
                      />
                    ) : (
                      <div className="proj-name" onDoubleClick={(e) => (e.stopPropagation(), setRenaming(p.id))} title="Двойной клик — переименовать">
                        {p.name}
                      </div>
                    )}
                    <div className="proj-meta">{ago(p.updatedAt)}</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {nav === 'templates' && (
          <section>
            <div className="home-h">
              <h2>Шаблоны</h2>
            </div>
            <div className="hint" style={{ marginBottom: 14 }}>
              Новый проект сразу с готовой сценой: декорации, персонажи с анимациями, машины и камера уже настроены.
            </div>
            <div className="tpl-grid">
              {TEMPLATES.filter((t) => t.name !== 'Пустая').map((t) => (
                <button key={t.name} className="tpl-card" onClick={() => void fromTemplate(t.name)}>
                  <img src={tplThumb(t.name)} alt="" />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
