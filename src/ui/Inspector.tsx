import type { Draft } from 'immer';
import { useState, type ReactNode } from 'react';
import { actorDraft, findSelected, sceneOfDraft, sortActor, useStore } from '../store';
import type { Actor, ActionClip, AudioClip, CameraKey, MoveKey, Project, Prop, Scene, TextClip } from '../types';
import { ACTIONS, ACTION_GROUPS, ACTION_MAP } from '../engine/poses';
import { PROP_MAP } from '../engine/props';
import { SWATCHES } from '../engine/palette';
import { evaluateActor, evaluateProp, sceneAt, sceneStart } from '../engine/evaluate';
import { addActionAtPlayhead, addScene, addCameraKey, deleteSelection, duplicateSelection, moveScene, writeActorTransform, writePropTransform } from '../ops';
import { engineRef } from './Viewport';
import { FigureIcon } from './Library';
import { propThumb } from '../engine/thumbs';

const st = () => useStore.getState();
const edit = (fn: (p: Draft<Project>) => void) => st().edit(fn);
const editLive = (fn: (p: Draft<Project>) => void) => st().edit(fn, { history: false });
const deg = (r: number) => Math.round((((r * 180) / Math.PI) % 360 + 540) % 360 - 180);

// ---------- поля ----------

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row">{children}</div>
    </div>
  );
}

/** Слайдер: одна точка истории на одно перетаскивание. */
function Slider(props: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 0.01}
        value={props.value}
        onPointerDown={() => st().checkpoint()}
        onKeyDown={() => st().checkpoint()}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="val">{props.fmt ? props.fmt(props.value) : props.value.toFixed(1)}</span>
    </>
  );
}

function Num(props: { value: number; step?: number; min?: number; onChange: (v: number) => void }) {
  // пока поле в фокусе, держим введённый текст, чтобы можно было набрать «1.» или «-»
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Number(props.value.toFixed(3)));
  return (
    <input
      type="number"
      step={props.step ?? 0.1}
      min={props.min}
      value={shown}
      onFocus={() => st().checkpoint()}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = parseFloat(e.target.value);
        if (!Number.isNaN(v)) props.onChange(v);
      }}
    />
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={v} className={v === value ? 'active' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Swatches({ value, onChange, allowDefault }: { value: string | null; onChange: (c: string | null) => void; allowDefault?: boolean }) {
  return (
    <div className="swatches">
      {allowDefault && (
        <button className={'swatch' + (value === null ? ' sel' : '')} title="Цвет по умолчанию" style={{ background: 'conic-gradient(#27344f 0 50%, #6a2633 0)' }} onClick={() => onChange(null)} />
      )}
      {SWATCHES.map((c) => (
        <button key={c} className={'swatch' + (value === c ? ' sel' : '')} style={{ background: c }} onClick={() => onChange(c)} />
      ))}
      <input type="color" value={value ?? '#888888'} onFocus={() => st().checkpoint()} onChange={(e) => editColor(e.target.value, onChange)} />
    </div>
  );
}
function editColor(c: string, onChange: (c: string) => void) {
  onChange(c);
}

function Title({ chip, title, children }: { chip: string; title: string; children?: ReactNode }) {
  return (
    <div className="insp-title">
      <span className="chip">{chip}</span>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function Footer({ dup = true }: { dup?: boolean }) {
  return (
    <div className="group btn-row">
      {dup && <button onClick={duplicateSelection}>Дублировать <span className="kbd">Ctrl+D</span></button>}
      <button className="danger" onClick={deleteSelection}>
        Удалить <span className="kbd">Del</span>
      </button>
    </div>
  );
}

// ---------- персонаж ----------

function ActorPanel({ a, scene }: { a: Actor; scene: Scene }) {
  const time = useStore((s) => (s.playing ? Math.floor(s.time * 2) / 2 : s.time));
  const local = time - sceneStart(st().project, scene.id);
  const now = evaluateActor(a, local);
  const under = a.actions.find((c) => local >= c.start && local < c.start + c.duration);
  const set = (fn: (a: Draft<Actor>) => void, live = false) => (live ? editLive : edit)((p) => fn(actorDraft(p, a.id)!));
  const autoKey = useStore((s) => s.autoKey);
  const transform = (patch: { x?: number; z?: number; y?: number; ry?: number }) =>
    set((d) => writeActorTransform(d, local, patch, st().autoKey), true);

  return (
    <>
      <Title chip="Персонаж" title={a.name}>
        <FigureIcon variant={a.variant} color={a.color} />
      </Title>
      <Field label="Имя">
        <input type="text" value={a.name} onChange={(e) => set((d) => void (d.name = e.target.value), true)} />
      </Field>
      <Field label="Фигура">
        <Seg value={a.variant} options={[['man', 'Он'], ['woman', 'Она']]} onChange={(v) => set((d) => void (d.variant = v))} />
      </Field>
      <Field label="Цвет">
        <Swatches value={a.color} onChange={(c) => set((d) => void (d.color = c ?? d.color))} />
      </Field>
      <Field label="Рост">
        <Slider value={a.scale} min={0.5} max={1.5} onChange={(v) => set((d) => void (d.scale = v), true)} fmt={(v) => `${Math.round(v * 100)}%`} />
      </Field>

      <div className="group">
        <div className="section-title">Анимация — в позицию плейхеда</div>
        {ACTION_GROUPS.map((g) => (
          <div key={g} style={{ marginBottom: 8 }}>
            <div className="hint" style={{ margin: '4px 0' }}>{g}</div>
            <div className="anim-grid">
              {ACTIONS.filter((x) => x.group === g).map((x) => (
                <button key={x.id} className={under?.type === x.id ? 'cur' : ''} onClick={() => addActionAtPlayhead(a.id, x.id)} title={under ? 'Заменить текущую анимацию' : 'Добавить анимацию'}>
                  <span className="ic">{x.icon}</span>
                  {x.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="hint">Ходьба между точками включается сама: включите «● Запись движения», переставьте плейхед и перетащите персонажа.</div>
      </div>

      <div className="group">
        <div className="section-title">Положение {a.keys.length > 0 && autoKey ? '(ключ в плейхеде)' : ''}</div>
        <Field label="X / Z">
          <Num value={now.x} onChange={(v) => transform({ x: v })} />
          <Num value={now.z} onChange={(v) => transform({ z: v })} />
        </Field>
        <Field label="Высота">
          <Num value={now.y} step={0.05} onChange={(v) => transform({ y: v })} />
        </Field>
        <Field label="Поворот">
          <Slider value={deg(now.ry)} min={-180} max={180} step={1} onChange={(v) => transform({ ry: (v * Math.PI) / 180 })} fmt={(v) => `${Math.round(v)}°`} />
        </Field>
        <Field label="Авто-шаг">
          <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={a.autoWalk} onChange={(e) => set((d) => void (d.autoWalk = e.target.checked))} />
            идти и смотреть по ходу движения
          </label>
        </Field>
        {a.keys.length > 0 && (
          <>
            <div className="hint" style={{ margin: '6px 0' }}>Ключи движения ({a.keys.length}):</div>
            <div className="list">
              {a.keys.map((k) => (
                <div key={k.id} className="item" onClick={() => (st().seek(sceneStart(st().project, scene.id) + k.t), st().select({ kind: 'movekey', id: k.id, actorId: a.id }))}>
                  ◆ <span className="grow">{k.t.toFixed(2)} с</span>
                  <span className="hint">
                    {k.x.toFixed(1)}, {k.z.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
            <div className="btn-row" style={{ marginTop: 6 }}>
              <button onClick={() => set((d) => void ((d.keys = []), Object.assign(d, { x: now.x, z: now.z, y: now.y, ry: now.ry })))}>Убрать движение</button>
            </div>
          </>
        )}
      </div>
      <Footer />
    </>
  );
}

// ---------- действие ----------

function ActionPanel({ c, a }: { c: ActionClip; a: Actor }) {
  const set = (fn: (c: Draft<ActionClip>) => void, live = false) =>
    (live ? editLive : edit)((p) => {
      const ad = actorDraft(p, a.id)!;
      fn(ad.actions.find((x) => x.id === c.id)!);
      sortActor(ad);
    });
  const def = ACTION_MAP[c.type];
  return (
    <>
      <Title chip="Анимация" title={def?.label ?? c.type} />
      <div className="hint" style={{ marginBottom: 10 }}>Персонаж: {a.name}</div>
      <Field label="Тип">
        <select value={c.type} onChange={(e) => set((d) => void (d.type = e.target.value))}>
          {ACTION_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {ACTIONS.filter((x) => x.group === g).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field label="Начало, с">
        <Num value={c.start} min={0} onChange={(v) => set((d) => void (d.start = Math.max(0, v)), true)} />
      </Field>
      <Field label="Длина, с">
        <Num value={c.duration} min={0.1} onChange={(v) => set((d) => void (d.duration = Math.max(0.1, v)), true)} />
      </Field>
      <Field label="Скорость">
        <Slider value={c.speed} min={0.25} max={3} step={0.05} onChange={(v) => set((d) => void (d.speed = v), true)} fmt={(v) => `×${v.toFixed(2)}`} />
      </Field>
      <div className="group btn-row">
        <button onClick={() => st().select({ kind: 'actor', id: a.id })}>← К персонажу</button>
      </div>
      <Footer dup={false} />
    </>
  );
}

// ---------- ключ движения ----------

function MoveKeyPanel({ k, a }: { k: MoveKey; a: Actor }) {
  const set = (fn: (k: Draft<MoveKey>) => void) =>
    editLive((p) => {
      const ad = actorDraft(p, a.id)!;
      fn(ad.keys.find((x) => x.id === k.id)!);
      sortActor(ad);
      Object.assign(ad, { x: ad.keys[0].x, y: ad.keys[0].y, z: ad.keys[0].z, ry: ad.keys[0].ry });
    });
  return (
    <>
      <Title chip="Ключ движения" title={`${a.name} · ${k.t.toFixed(2)} с`} />
      <Field label="Время, с">
        <Num value={k.t} min={0} onChange={(v) => set((d) => void (d.t = Math.max(0, v)))} />
      </Field>
      <Field label="X / Z">
        <Num value={k.x} onChange={(v) => set((d) => void (d.x = v))} />
        <Num value={k.z} onChange={(v) => set((d) => void (d.z = v))} />
      </Field>
      <Field label="Высота">
        <Num value={k.y} step={0.05} onChange={(v) => set((d) => void (d.y = v))} />
      </Field>
      <Field label="Поворот">
        <Slider value={deg(k.ry)} min={-180} max={180} step={1} onChange={(v) => set((d) => void (d.ry = (v * Math.PI) / 180))} fmt={(v) => `${Math.round(v)}°`} />
      </Field>
      <div className="group btn-row">
        <button onClick={() => st().select({ kind: 'actor', id: a.id })}>← К персонажу</button>
      </div>
      <Footer dup={false} />
    </>
  );
}

// ---------- декорация ----------

function PropPanel({ pr }: { pr: Prop }) {
  const def = PROP_MAP[pr.kind];
  const vehicle = !!def.vehicle;
  const time = useStore((s) => (s.playing ? Math.floor(s.time * 2) / 2 : s.time));
  const sceneId = useStore((s) => s.project.scenes.find((x) => x.props.some((q) => q.id === pr.id))?.id ?? '');
  const local = time - sceneStart(st().project, sceneId);
  const now = evaluateProp(pr, local, vehicle);
  const set = (fn: (d: Draft<Prop>) => void, live = true) =>
    (live ? editLive : edit)((p) => fn(sceneOfDraft(p, pr.id)!.props.find((x) => x.id === pr.id)!));
  const transform = (patch: { x?: number; z?: number; y?: number; ry?: number }) => set((d) => writePropTransform(d, local, patch, st().autoKey));
  const keys = pr.keys ?? [];
  return (
    <>
      <Title chip={vehicle ? 'Транспорт' : 'Декорация'} title={def.label}>
        <img className="thumb" src={propThumb(pr.kind, pr.color)} alt="" />
      </Title>
      <Field label="Цвет">
        <Swatches value={pr.color} allowDefault onChange={(c) => set((d) => void (d.color = c), false)} />
      </Field>
      <Field label="Размер">
        <Slider value={pr.scale} min={0.2} max={4} onChange={(v) => set((d) => void (d.scale = v))} fmt={(v) => `${Math.round(v * 100)}%`} />
      </Field>
      <Field label="Поворот">
        <Slider value={deg(now.ry)} min={-180} max={180} step={1} onChange={(v) => transform({ ry: (v * Math.PI) / 180 })} fmt={(v) => `${Math.round(v)}°`} />
      </Field>
      <Field label="X / Z">
        <Num value={now.x} onChange={(v) => transform({ x: v })} />
        <Num value={now.z} onChange={(v) => transform({ z: v })} />
      </Field>
      <Field label="Высота">
        <Num value={now.y} step={0.05} onChange={(v) => transform({ y: v })} />
      </Field>
      {vehicle ? (
        <div className="group">
          <div className="section-title">Поездка</div>
          <div className="hint" style={{ marginBottom: 8 }}>
            Включите «● Запись движения», поставьте плейхед и перетащите машину — появится ключ. Между ключами она едет с разгоном и торможением, поворачивает по ходу, колёса крутятся.
          </div>
          {keys.length > 0 && (
            <>
              <div className="list">
                {keys.map((k) => (
                  <div key={k.id} className="item" onClick={() => st().seek(sceneStart(st().project, sceneId) + k.t)}>
                    ◆ <span className="grow">{k.t.toFixed(2)} с</span>
                    <span className="hint">
                      {k.x.toFixed(1)}, {k.z.toFixed(1)}
                    </span>
                    <button
                      className="ghost"
                      title="Удалить ключ"
                      onClick={(e) => {
                        e.stopPropagation();
                        set((d) => {
                          d.keys = (d.keys ?? []).filter((x) => x.id !== k.id);
                          if (d.keys.length) Object.assign(d, { x: d.keys[0].x, y: d.keys[0].y, z: d.keys[0].z, ry: d.keys[0].ry });
                        }, false);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="btn-row" style={{ marginTop: 6 }}>
                <button onClick={() => set((d) => void ((d.keys = []), Object.assign(d, { x: now.x, y: now.y, z: now.z, ry: now.ry })), false)}>Убрать движение</button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="hint">Чтобы поставить предмет на стол или кровать, поднимите его «Высотой».</div>
      )}
      <Footer />
    </>
  );
}

// ---------- сцена ----------

function ScenePanel({ s }: { s: Scene }) {
  const set = (fn: (d: Draft<Scene>) => void, live = false) => (live ? editLive : edit)((p) => fn(p.scenes.find((x) => x.id === s.id)!));
  const idx = useStore((x) => x.project.scenes.findIndex((y) => y.id === s.id));
  const count = useStore((x) => x.project.scenes.length);
  const sel = useStore((x) => x.selection);
  return (
    <>
      <Title chip={`Сцена ${idx + 1}`} title={s.name} />
      <Field label="Название">
        <input type="text" value={s.name} onChange={(e) => set((d) => void (d.name = e.target.value), true)} />
      </Field>
      <Field label="Длина, с">
        <Num value={s.duration} min={0.5} step={0.5} onChange={(v) => set((d) => void (d.duration = Math.max(0.5, v)), true)} />
      </Field>
      <Field label="Переход">
        <Seg value={s.transition} options={[['cut', 'Склейка'], ['fade-black', 'Чёрный'], ['fade-white', 'Белый']]} onChange={(v) => set((d) => void (d.transition = v))} />
      </Field>
      <Field label="Фон">
        <input type="color" value={s.background} onFocus={() => st().checkpoint()} onChange={(e) => set((d) => void (d.background = e.target.value), true)} />
        <span className="hint">пол</span>
        <input type="color" value={s.floor} onFocus={() => st().checkpoint()} onChange={(e) => set((d) => void (d.floor = e.target.value), true)} />
        <label className="hint" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={s.grid} onChange={(e) => set((d) => void (d.grid = e.target.checked))} /> сетка
        </label>
      </Field>
      <div className="btn-row">
        <button disabled={idx === 0} onClick={() => moveScene(s.id, -1)}>← Раньше</button>
        <button disabled={idx === count - 1} onClick={() => moveScene(s.id, 1)}>Позже →</button>
      </div>

      <div className="group">
        <div className="section-title">Камера</div>
        <div className="hint" style={{ marginBottom: 8 }}>
          Без ключей камера статична — просто настройте вид мышью. Для пролёта: плейхед → вид → «◆ Ключ камеры», и так несколько раз.
        </div>
        <div className="list">
          {s.cameraKeys.map((k) => (
            <div key={k.id} className={'item' + (sel?.kind === 'camkey' && sel.id === k.id ? ' sel' : '')} onClick={() => (st().seek(sceneStart(st().project, s.id) + k.t), st().select({ kind: 'camkey', id: k.id }))}>
              ◆ <span className="grow">{k.t.toFixed(2)} с</span>
              <span className="hint">×{k.zoom.toFixed(2)}</span>
            </div>
          ))}
        </div>
        {s.cameraKeys.length > 0 && (
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button onClick={() => set((d) => void (d.cameraKeys = []))}>Убрать ключи камеры</button>
          </div>
        )}
      </div>

      <div className="group">
        <div className="section-title">В сцене</div>
        <div className="list">
          {s.actors.map((a) => (
            <div key={a.id} className="item" onClick={() => st().select({ kind: 'actor', id: a.id })}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: a.color }} /> <span className="grow">{a.name}</span>
              <span className="hint">{a.actions.length} аним.</span>
            </div>
          ))}
          {s.props.map((p) => (
            <div key={p.id} className="item" onClick={() => st().select({ kind: 'prop', id: p.id })}>
              <img className="thumb" src={propThumb(p.kind, p.color)} alt="" /> <span className="grow">{PROP_MAP[p.kind]?.label}</span>
            </div>
          ))}
        </div>
      </div>
      {sel?.kind === 'scene' && <Footer />}
      {sel?.kind !== 'scene' && (
        <div className="group btn-row">
          <button onClick={() => st().select({ kind: 'scene', id: s.id })}>Выбрать сцену</button>
        </div>
      )}
    </>
  );
}

// ---------- ключ камеры ----------

function CamKeyPanel({ k, s }: { k: CameraKey; s: Scene }) {
  const set = (fn: (d: Draft<CameraKey>) => void, live = true) =>
    (live ? editLive : edit)((p) => {
      const sd = p.scenes.find((x) => x.id === s.id)!;
      fn(sd.cameraKeys.find((x) => x.id === k.id)!);
      sd.cameraKeys.sort((a, b) => a.t - b.t);
    });
  return (
    <>
      <Title chip="Ключ камеры" title={`${s.name} · ${k.t.toFixed(2)} с`} />
      <Field label="Время, с">
        <Num value={k.t} min={0} onChange={(v) => set((d) => void (d.t = Math.max(0, Math.min(s.duration, v))))} />
      </Field>
      <Field label="Зум">
        <Slider value={k.zoom} min={0.2} max={6} onChange={(v) => set((d) => void (d.zoom = v))} fmt={(v) => `×${v.toFixed(2)}`} />
      </Field>
      <Field label="Поворот">
        <Slider value={deg(k.azimuth)} min={-180} max={180} step={1} onChange={(v) => set((d) => void (d.azimuth = (v * Math.PI) / 180))} fmt={(v) => `${Math.round(v)}°`} />
      </Field>
      <Field label="Наклон">
        <Slider value={Math.round((k.elevation * 180) / Math.PI)} min={3} max={89} step={1} onChange={(v) => set((d) => void (d.elevation = (v * Math.PI) / 180))} fmt={(v) => `${Math.round(v)}°`} />
      </Field>
      <Field label="Движение">
        <Seg value={k.ease} options={[['smooth', 'Плавно'], ['linear', 'Линейно']]} onChange={(v) => set((d) => void (d.ease = v), false)} />
      </Field>
      <div className="btn-row">
        <button
          onClick={() => {
            const e = engineRef.current;
            if (!e) return;
            const v = e.currentView();
            set((d) => void Object.assign(d, v, { target: [...v.target] }), false);
          }}
          title="Записать в этот ключ текущий вид вьюпорта"
        >
          Взять текущий вид
        </button>
      </div>
      <Footer dup={false} />
    </>
  );
}

// ---------- текст ----------

function TextPanel({ c }: { c: TextClip }) {
  const set = (fn: (d: Draft<TextClip>) => void, live = true) => (live ? editLive : edit)((p) => fn(p.texts.find((x) => x.id === c.id)!));
  return (
    <>
      <Title chip="Текст" title={c.text.split('\n')[0] || 'Текст'} />
      <textarea value={c.text} onFocus={() => st().checkpoint()} onChange={(e) => set((d) => void (d.text = e.target.value))} style={{ marginBottom: 10 }} />
      <Field label="Стиль">
        <Seg value={c.style} options={[['caption', 'Субтитр'], ['title', 'Заголовок'], ['plain', 'Простой']]} onChange={(v) => set((d) => void (d.style = v), false)} />
      </Field>
      <Field label="Где">
        <Seg value={c.position} options={[['top', 'Сверху'], ['center', 'Центр'], ['bottom', 'Снизу']]} onChange={(v) => set((d) => void (d.position = v), false)} />
      </Field>
      <Field label="Цвет">
        <Swatches value={c.color} onChange={(v) => set((d) => void (d.color = v ?? '#ffffff'), false)} />
      </Field>
      <Field label="Размер">
        <Slider value={c.size} min={0.4} max={3} onChange={(v) => set((d) => void (d.size = v))} fmt={(v) => `${Math.round(v * 100)}%`} />
      </Field>
      <Field label="Начало / длина">
        <Num value={c.start} min={0} onChange={(v) => set((d) => void (d.start = Math.max(0, v)))} />
        <Num value={c.duration} min={0.2} onChange={(v) => set((d) => void (d.duration = Math.max(0.2, v)))} />
      </Field>
      <Footer />
    </>
  );
}

// ---------- аудио ----------

function AudioPanel({ c }: { c: AudioClip }) {
  const set = (fn: (d: Draft<AudioClip>) => void, live = true) => (live ? editLive : edit)((p) => fn(p.audioClips.find((x) => x.id === c.id)!));
  const asset = useStore((s) => s.project.audioAssets.find((a) => a.id === c.assetId));
  return (
    <>
      <Title chip="Аудио" title={c.name} />
      <Field label="Громкость">
        <Slider value={c.volume} min={0} max={2} onChange={(v) => set((d) => void (d.volume = v))} fmt={(v) => `${Math.round(v * 100)}%`} />
      </Field>
      <Field label="Нарастание">
        <Slider value={c.fadeIn} min={0} max={Math.min(5, c.duration / 2)} step={0.1} onChange={(v) => set((d) => void (d.fadeIn = v))} fmt={(v) => `${v.toFixed(1)}с`} />
      </Field>
      <Field label="Затухание">
        <Slider value={c.fadeOut} min={0} max={Math.min(5, c.duration / 2)} step={0.1} onChange={(v) => set((d) => void (d.fadeOut = v))} fmt={(v) => `${v.toFixed(1)}с`} />
      </Field>
      <Field label="Старт, с">
        <Num value={c.start} min={0} onChange={(v) => set((d) => void (d.start = Math.max(0, v)))} />
      </Field>
      <Field label="Обрезка, с">
        <Num value={c.offset} min={0} onChange={(v) => set((d) => void (d.offset = Math.max(0, Math.min(v, (asset?.duration ?? 1e9) - 0.1))))} />
      </Field>
      <Field label="Длина, с">
        <Num value={c.duration} min={0.1} onChange={(v) => set((d) => void (d.duration = Math.max(0.1, Math.min(v, (asset?.duration ?? 1e9) - d.offset))))} />
      </Field>
      <div className="hint">После правок во время проигрывания нажмите пробел дважды, чтобы звук обновился.</div>
      <Footer dup={false} />
    </>
  );
}

// ---------- корень ----------

export function Inspector() {
  const sel = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const time = useStore((s) => Math.floor(s.time * 4)); // перерисовка не на каждый кадр
  void time;
  const cur = sceneAt(project, st().time).scene;

  let body: ReactNode = null;
  if (sel && findSelected(project, sel)) {
    const sceneOf = (id: string) => project.scenes.find((s) => s.actors.some((a) => a.id === id) || s.props.some((p) => p.id === id) || s.cameraKeys.some((k) => k.id === id) || s.id === id)!;
    switch (sel.kind) {
      case 'actor': {
        const s = sceneOf(sel.id);
        body = <ActorPanel a={s.actors.find((a) => a.id === sel.id)!} scene={s} />;
        break;
      }
      case 'action': {
        const s = sceneOf(sel.actorId);
        const a = s.actors.find((x) => x.id === sel.actorId)!;
        body = <ActionPanel c={a.actions.find((x) => x.id === sel.id)!} a={a} />;
        break;
      }
      case 'movekey': {
        const s = sceneOf(sel.actorId);
        const a = s.actors.find((x) => x.id === sel.actorId)!;
        body = <MoveKeyPanel k={a.keys.find((x) => x.id === sel.id)!} a={a} />;
        break;
      }
      case 'prop': {
        const s = sceneOf(sel.id);
        body = <PropPanel pr={s.props.find((p) => p.id === sel.id)!} />;
        break;
      }
      case 'camkey': {
        const s = sceneOf(sel.id);
        body = <CamKeyPanel k={s.cameraKeys.find((k) => k.id === sel.id)!} s={s} />;
        break;
      }
      case 'scene':
        body = <ScenePanel s={project.scenes.find((s) => s.id === sel.id)!} />;
        break;
      case 'text':
        body = <TextPanel c={project.texts.find((x) => x.id === sel.id)!} />;
        break;
      case 'audio':
        body = <AudioPanel c={project.audioClips.find((x) => x.id === sel.id)!} />;
        break;
    }
  } else {
    body = (
      <>
        {project.scenes.length > 0 ? (
          <ScenePanel s={cur} />
        ) : (
          <>
            <Title chip="Проект" title="Сцен нет" />
            <div className="hint" style={{ marginBottom: 10 }}>
              Проект пуст. Добавьте сцену кнопкой ниже, шаблоном во вкладке «Сцены» — или просто перетащите персонажа или декорацию в кадр: сцена создастся сама.
            </div>
            <div className="btn-row">
              <button className="primary" onClick={addScene}>＋ Сцена</button>
            </div>
          </>
        )}
        <div className="group">
          <div className="section-title">Как пользоваться</div>
          <ul className="help-list">
            <li><b>Сцены</b> идут подряд на таймлайне, как клипы в CapCut. Длину меняйте за правый край.</li>
            <li><b>Персонажи и декор</b> — слева, кликом или перетаскиванием в кадр.</li>
            <li><b>Анимации</b> — выберите персонажа и нажмите жест/позу: он ляжет на дорожку в позицию плейхеда.</li>
            <li><b>Перемещение</b> — «● Запись движения», двигайте плейхед и персонажа: он сам пойдёт по точкам.</li>
            <li><b>Камера</b> — мышью, затем «◆ Ключ камеры» для пролётов.</li>
            <li><b>Звук</b> — вкладка «Звук», клипы на нижних дорожках.</li>
            <li><b>Пробел</b> — play, <b>S</b> — разрезать клип, <b>Ctrl+Z</b> — отмена.</li>
          </ul>
        </div>
      </>
    );
  }
  return <div className="panel inspector">{body}</div>;
}

export type { Actor };
