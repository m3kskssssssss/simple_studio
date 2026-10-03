import { useRef, useState } from 'react';
import { PROPS, PROP_CATS } from '../engine/props';
import { TEMPLATES, type SceneTemplate } from '../templates';
import { figureThumb, groupThumb, propThumb } from '../engine/thumbs';
import { MAROON, NAVY, CHARCOAL } from '../engine/palette';
import { addActor, addAudioClipFromAsset, addProp, addText, importAudio } from '../ops';
import { useStore } from '../store';
import { newProp, newScene } from '../project';
import { sceneAt, sceneStart } from '../engine/evaluate';
import type { Accessory, FigureVariant, Prop, TextStyle } from '../types';

export const DRAG_MIME = 'application/x-simple-studio';

export type DragPayload =
  | { type: 'actor'; variant: FigureVariant; color: string; accessory: Accessory }
  | { type: 'prop'; kind: string }
  | { type: 'audio'; assetId: string };

const CHARACTERS: { label: string; variant: FigureVariant; color: string; accessory: Accessory }[] = [
  { label: 'Он', variant: 'man', color: NAVY, accessory: 'none' },
  { label: 'Она', variant: 'woman', color: MAROON, accessory: 'none' },
  { label: 'Он', variant: 'man', color: MAROON, accessory: 'none' },
  { label: 'Она', variant: 'woman', color: NAVY, accessory: 'none' },
  { label: 'Он', variant: 'man', color: CHARCOAL, accessory: 'none' },
  { label: 'Она', variant: 'woman', color: '#4a6a5a', accessory: 'none' },
];

export function FigureIcon({ variant, color }: { variant: FigureVariant; color: string }) {
  return <img className="thumb" src={figureThumb(variant, color)} alt="" draggable={false} />;
}

// ---------- шаблоны сцен ----------

function addSceneFromTemplate(t: SceneTemplate) {
  const s = useStore.getState();
  const cur = sceneAt(s.project, s.time);
  const sc = t.build();
  if (t.name === 'Пустая') sc.name = `Сцена ${s.project.scenes.length + 1}`;
  s.edit((p) => {
    p.scenes.splice(cur.index + 1, 0, sc);
  });
  const st = useStore.getState();
  st.seek(sceneStart(st.project, sc.id) + 0.001);
  st.select({ kind: 'scene', id: sc.id });
}

/** Превью шаблона: декорации и машины в начальных позициях. */
const templateThumbs = new Map<string, string>();
function templateThumb(t: SceneTemplate) {
  let url = templateThumbs.get(t.name);
  if (!url) {
    const sc = t.build();
    url = groupThumb(t.name, sc.props.map((p) => ({ kind: p.kind, x: p.keys?.[0]?.x ?? p.x, z: p.keys?.[0]?.z ?? p.z, ry: p.keys?.[0]?.ry ?? p.ry, color: p.color })));
    templateThumbs.set(t.name, url);
  }
  return url;
}

// ---------- панель ----------

type Tab = 'chars' | 'props' | 'scenes' | 'audio' | 'text';

export function Library({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  const [tab, setTab] = useState<Tab>('chars');
  const assets = useStore((s) => s.project.audioAssets);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const drag = (payload: DragPayload) => (e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await importAudio(f);
    } catch (e) {
      alert('Не удалось загрузить аудио: ' + (e as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="panel library">
      <div
        className="lib-resize"
        title="Потяните, чтобы изменить ширину"
        onPointerDown={(e) => {
          const x0 = e.clientX;
          const w0 = width;
          const el = e.currentTarget;
          el.classList.add('active');
          const move = (ev: PointerEvent) => onResize(Math.min(640, Math.max(220, w0 + ev.clientX - x0)));
          const up = () => {
            el.classList.remove('active');
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
      />
      <div className="tabs">
        {(
          [
            ['chars', 'Люди'],
            ['props', 'Декор'],
            ['scenes', 'Сцены'],
            ['audio', 'Звук'],
            ['text', 'Текст'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="lib-body">
        {tab === 'chars' && (
          <>
            <div className="hint">Кликните или перетащите в кадр.</div>
            <div className="lib-grid">
              {CHARACTERS.map((c, i) => (
                <div
                  key={i}
                  className="lib-item"
                  draggable
                  onDragStart={drag({ type: 'actor', variant: c.variant, color: c.color, accessory: c.accessory })}
                  onClick={() => addActor({ variant: c.variant, color: c.color, accessory: c.accessory, name: c.variant === 'woman' ? 'Она' : 'Он' })}
                >
                  <FigureIcon variant={c.variant} color={c.color} />
                  {c.label}
                </div>
              ))}
            </div>
          </>
        )}
        {tab === 'props' && (
          <>
            <div className="hint">Кликните или перетащите в кадр. Цвет и размер — в инспекторе справа.</div>
            {PROP_CATS.map((cat) => (
              <div key={cat}>
                <div className="section-title">{cat}</div>
                <div className="lib-grid">
                  {PROPS.filter((p) => (p.cat ?? 'Дом') === cat).map((p) => (
                    <div key={p.kind} className="lib-item" draggable onDragStart={drag({ type: 'prop', kind: p.kind })} onClick={() => addProp(p.kind)}>
                      <img className="thumb" src={propThumb(p.kind)} alt="" draggable={false} />
                      {p.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
        {tab === 'scenes' && (
          <>
            <div className="hint">Добавляет новую сцену с готовыми декорациями после текущей.</div>
            <div className="lib-grid">
              {TEMPLATES.map((t) => (
                <div key={t.name} className="lib-item" onClick={() => addSceneFromTemplate(t)}>
                  <img className="thumb" src={templateThumb(t)} alt="" draggable={false} />
                  {t.name}
                </div>
              ))}
            </div>
          </>
        )}
        {tab === 'audio' && (
          <>
            <button className="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'Загрузка…' : '＋ Загрузить аудио'}
            </button>
            <input ref={fileRef} type="file" accept="audio/*,video/*" multiple hidden onChange={(e) => (void onFiles(e.target.files), (e.target.value = ''))} />
            <div className="hint">MP3, WAV, OGG, M4A… Файл ставится на таймлайн с позиции плейхеда. Перетаскивайте клипы, тяните за края, чтобы обрезать; S — разрезать.</div>
            <div className="list">
              {assets.map((a) => (
                <div key={a.id} className="item" draggable onDragStart={drag({ type: 'audio', assetId: a.id })}>
                  ♪ <span className="grow">{a.name}</span>
                  <span className="hint">{a.duration.toFixed(1)}с</span>
                  <button className="ghost" title="Добавить ещё раз на таймлайн" onClick={() => addAudioClipFromAsset(a.id)}>
                    ＋
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === 'text' && (
          <>
            <div className="hint">Текст добавляется на дорожку «Текст» в позицию плейхеда.</div>
            {(
              [
                ['caption', 'Субтитр', 'bottom', '#ffffff', 1],
                ['title', 'Заголовок', 'center', NAVY, 1.2],
                ['plain', 'Подпись', 'top', '#ffffff', 1],
              ] as [TextStyle, string, 'top' | 'center' | 'bottom', string, number][]
            ).map(([style, label, position, color, size]) => (
              <button
                key={style}
                onClick={() => {
                  addText();
                  const sel = useStore.getState().selection;
                  if (sel?.kind === 'text')
                    useStore.getState().edit(
                      (p) => {
                        const c = p.texts.find((x) => x.id === sel.id)!;
                        Object.assign(c, { style, position, color, size, text: label });
                      },
                      { history: false },
                    );
                }}
              >
                ＋ {label}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
