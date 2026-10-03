import { useEffect, useRef, useState } from 'react';
import { PROPS, PROP_CATS } from '../engine/props';
import { TEMPLATES, type SceneTemplate } from '../templates';
import { FILTERS } from '../engine/filters';
import { STICKERS, drawSticker } from '../engine/stickers';
import { addBlankScene, addFilter, addMediaOverlay, addSticker, importMedia } from '../ops';
import { getAudioBlob } from '../audio/audio';
import type { MediaAsset, TextClip } from '../types';
import { figureThumb, groupThumb, propThumb } from '../engine/thumbs';
import { MAROON, NAVY } from '../engine/palette';
import { VARIANTS, rigOf, variantDef } from '../engine/variants';
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

const CHARACTERS: { label: string; variant: FigureVariant; color: string; accessory: Accessory }[] = VARIANTS.map((v) => ({
  label: v.label,
  variant: v.id,
  color: v.id === 'man' ? NAVY : v.id === 'woman' ? MAROON : v.color,
  accessory: 'none',
}));
const PEOPLE = CHARACTERS.filter((c) => rigOf(c.variant) === 'human');
const ANIMALS = CHARACTERS.filter((c) => rigOf(c.variant) === 'quad');

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

type Tab = 'chars' | 'props' | 'scenes' | 'media' | 'stickers' | 'text' | 'filters' | 'audio';

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
            ['chars', 'Герои'],
            ['props', 'Декор'],
            ['scenes', 'Сцены'],
            ['media', 'Медиа'],
            ['stickers', 'Стикеры'],
            ['text', 'Текст'],
            ['filters', 'Фильтры'],
            ['audio', 'Звук'],
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
            {(
              [
                ['Люди', PEOPLE],
                ['Животные', ANIMALS],
              ] as const
            ).map(([title, list]) => (
              <div key={title}>
                <div className="section-title">{title}</div>
                <div className="lib-grid">
                  {list.map((c) => (
                    <div
                      key={c.variant}
                      className="lib-item"
                      draggable
                      onDragStart={drag({ type: 'actor', variant: c.variant, color: c.color, accessory: c.accessory })}
                      onClick={() => addActor({ variant: c.variant, color: c.color, accessory: c.accessory, name: variantDef(c.variant).name })}
                    >
                      <FigureIcon variant={c.variant} color={c.color} />
                      {c.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
            <div className="hint">Стиль текста — с позиции плейхеда. Потом правьте в инспекторе: шрифт, цвет, обводка, подложка, анимация; в кадре текст можно двигать и масштабировать мышью.</div>
            <div className="text-presets">
              {TEXT_PRESETS.map((pr) => (
                <button
                  key={pr.label}
                  className="text-preset"
                  style={{ fontFamily: `"${pr.clip.font ?? 'Inter'}"`, fontStyle: pr.clip.italic ? 'italic' : undefined, fontWeight: pr.clip.bold === false ? 400 : 700 }}
                  onClick={() => addTextPreset(pr)}
                >
                  <span style={{ color: pr.swatch ?? '#fff', WebkitTextStroke: pr.clip.stroke ? `1px ${pr.clip.stroke}` : undefined }}>{pr.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === 'media' && <MediaTab />}
        {tab === 'stickers' && (
          <>
            <div className="hint">Стикер появляется в кадре с позиции плейхеда. Двигайте его мышью, тяните за уголок — размер. Цвет фигур и анимация — в инспекторе.</div>
            <div className="sticker-grid">
              {STICKERS.map((st) => (
                <button key={st.id} className="sticker" title={st.label} onClick={() => addSticker(st.id)}>
                  <img src={stickerThumb(st.id)} alt={st.label} draggable={false} />
                </button>
              ))}
            </div>
          </>
        )}
        {tab === 'filters' && (
          <>
            <div className="hint">Клик — фильтр на 3 с с позиции плейхеда (фрагмент). «На всё» — на весь ролик. Длину и силу меняйте на дорожке «Фильтры» и в инспекторе.</div>
            <div className="lib-grid">
              {FILTERS.map((f) => (
                <div key={f.id} className="lib-item filter-item" onClick={() => addFilter(f.id)}>
                  <div className="filter-prev">
                    <img className="thumb" src={filterSample()} alt="" draggable={false} style={{ filter: f.css ? f.css(1, 0.25) : undefined }} />
                    {f.vignette && <div className="vig" style={{ opacity: f.vignette(1) }} />}
                    {f.grain && <div className="grain" style={{ opacity: f.grain(1) }} />}
                  </div>
                  {f.label}
                  <button className="ghost tiny" onClick={(e) => (e.stopPropagation(), addFilter(f.id, true))}>
                    на всё
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- текстовые пресеты ----------

interface TextPreset {
  label: string;
  swatch?: string;
  clip: Partial<TextClip>;
}

const TEXT_PRESETS: TextPreset[] = [
  { label: 'Субтитр', clip: { style: 'caption', position: 'bottom', color: '#ffffff', size: 1 } },
  { label: 'Заголовок', clip: { style: 'title', position: 'center', color: '#ffffff', size: 1.1, font: 'Montserrat', stroke: '#111111', strokeWidth: 1, anim: 'pop' } },
  { label: 'Комикс!', swatch: '#f5c518', clip: { style: 'title', color: '#f5c518', size: 1.1, font: 'Russo One', stroke: '#111111', strokeWidth: 1.4, anim: 'pop', bg: null } },
  { label: 'Неон', swatch: '#7af7ff', clip: { style: 'plain', color: '#e9feff', size: 1.1, font: 'Unbounded', shadow: true, anim: 'fade', stroke: '#21c7ff', strokeWidth: 0.6 } },
  { label: 'От руки', clip: { style: 'plain', color: '#ffffff', size: 1.4, font: 'Caveat', bold: false, shadow: true, anim: 'slide' } },
  { label: 'Элегантно', clip: { style: 'plain', color: '#ffffff', size: 1.1, font: 'Playfair Display', italic: true, bold: false, shadow: true, anim: 'fade', letterSpacing: 0.04 } },
  { label: 'Печать…', clip: { style: 'caption', color: '#ffffff', size: 0.9, font: 'JetBrains Mono', bold: false, anim: 'type', bg: '#000000', bgOpacity: 0.85 } },
  { label: 'Ретро', swatch: '#ff5c8a', clip: { style: 'plain', color: '#ff5c8a', size: 0.7, font: 'Press Start 2P', bold: false, stroke: '#111111', strokeWidth: 1, anim: 'type' } },
  { label: 'Плашка', swatch: '#111', clip: { style: 'plain', color: '#111111', size: 0.95, font: 'Rubik', bg: '#ffffff', bgOpacity: 1, anim: 'slide', shadow: false } },
  { label: 'Lobster', clip: { style: 'plain', color: '#ffffff', size: 1.2, font: 'Lobster', bold: false, shadow: true, anim: 'pop' } },
];

function addTextPreset(pr: TextPreset) {
  addText();
  const sel = useStore.getState().selection;
  if (sel?.kind !== 'text') return;
  useStore.getState().edit(
    (p) => {
      const c = p.texts.find((x) => x.id === sel.id)!;
      Object.assign(c, { position: 'center', ...pr.clip, text: pr.label.replace('…', '') });
    },
    { history: false },
  );
}

// ---------- стикеры: превью ----------

const stickerCache = new Map<string, string>();
function stickerThumb(id: string) {
  let url = stickerCache.get(id);
  if (!url) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const ctx = c.getContext('2d')!;
    ctx.translate(48, 48);
    drawSticker(ctx, id, 78);
    url = c.toDataURL();
    stickerCache.set(id, url);
  }
  return url;
}

// ---------- фильтры: образец ----------

let sample: string | null = null;
function filterSample() {
  if (!sample) sample = templateThumb(TEMPLATES.find((t) => t.name === 'Вечеринка') ?? TEMPLATES[0]);
  return sample;
}

// ---------- медиа ----------

function MediaThumb({ a }: { a: MediaAsset }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    getAudioBlob(a.id).then((b) => {
      if (b) setUrl((u = URL.createObjectURL(b)));
    });
    return () => void (u && URL.revokeObjectURL(u));
  }, [a.id]);
  if (!url) return <div className="thumb" />;
  return a.type === 'image' ? <img className="thumb" src={url} alt="" draggable={false} /> : <video className="thumb" src={url + '#t=0.3'} muted preload="metadata" />;
}

function MediaTab() {
  const assets = useStore((s) => s.project.mediaAssets);
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await importMedia(f);
    } catch (e) {
      alert('Не удалось загрузить файл: ' + (e as Error).message);
    }
    setBusy(false);
  };
  return (
    <>
      <div className="btn-row">
        <button className="primary" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? 'Загрузка…' : '＋ Фото или видео'}
        </button>
        <button onClick={() => addBlankScene()} title="Пустой кадр без 3D — фон для фото, видео и текста">
          ＋ Пустой кадр
        </button>
      </div>
      <input ref={ref} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => (void onFiles(e.target.files), (e.target.value = ''))} />
      <div className="hint">
        Файл ложится поверх кадра с позиции плейхеда — и на 3D-сцену, и на пустой кадр. Двигайте мышью в кадре, тяните за уголок — размер. Обрезка, громкость видео, поворот и анимация — в инспекторе.
      </div>
      <div className="lib-grid">
        {assets.map((a) => (
          <div key={a.id} className="lib-item" onClick={() => addMediaOverlay(a.id)} title="Добавить ещё раз">
            <MediaThumb a={a} />
            <span className="media-name">
              {a.type === 'video' ? '▶ ' : ''}
              {a.name}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
