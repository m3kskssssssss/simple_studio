import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Draft } from 'immer';
import { actorDraft, sortActor, useStore } from '../store';
import type { AudioClip, Project, Selection } from '../types';
import { sceneAt, totalDuration } from '../engine/evaluate';
import { ACTION_MAP } from '../engine/poses';
import { PROP_MAP } from '../engine/props';
import { PEAKS_PER_SEC, getPeaks, onBuffersChange } from '../audio/audio';
import { addScene, addText, splitAtPlayhead } from '../ops';
import { DRAG_MIME, type DragPayload } from './Library';
import { addAudioClipFromAsset } from '../ops';

const LABEL_W = 150;
const ROW_H = 30;
const st = () => useStore.getState();

function fmtTime(t: number, fps: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const f = Math.floor((t % 1) * fps);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
}

/**
 * Перетаскивание по горизонтали. onMove получает сдвиг в секундах.
 * Первая точка истории создаётся при первом движении.
 */
function useDrag() {
  return (e: React.PointerEvent, onMove: (dt: number, ev: PointerEvent) => void, onClick?: () => void) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const x0 = e.clientX;
    let moved = false;
    const pps = st().pxPerSec;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      if (!moved) {
        moved = true;
        st().checkpoint();
      }
      onMove(dx / pps, ev);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) onClick?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
}

/** Привязка ко времени: плейхед, границы сцен, целые секунды. */
function snapper(project: Project, exclude?: number) {
  const pts = [0, st().time];
  let acc = 0;
  for (const s of project.scenes) {
    acc += s.duration;
    pts.push(acc);
  }
  const tol = 7 / st().pxPerSec;
  return (t: number) => {
    for (const p of pts) if (p !== exclude && Math.abs(p - t) < tol) return p;
    return t;
  };
}

const live = (fn: (p: Draft<Project>) => void) => st().edit(fn, { history: false });
const isSel = (sel: Selection | null, kind: Selection['kind'], id: string) => !!sel && sel.kind === kind && sel.id === id;

// ---------- волна ----------

function Wave({ clip, width }: { clip: AudioClip; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ver, setVer] = useState(0);
  useEffect(() => {
    const off = onBuffersChange(() => setVer((v) => v + 1));
    return () => void off();
  }, []);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = Math.max(1, Math.min(4000, Math.floor(width)));
    c.width = w;
    c.height = ROW_H - 8;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, c.height);
    const peaks = getPeaks(clip.assetId);
    if (!peaks) return;
    ctx.fillStyle = '#9a9a9a';
    const mid = c.height / 2;
    for (let x = 0; x < w; x++) {
      const t = clip.offset + (x / w) * clip.duration;
      const v = peaks[Math.min(peaks.length - 1, Math.floor(t * PEAKS_PER_SEC))] ?? 0;
      const h = Math.max(1, v * mid * clip.volume);
      ctx.fillRect(x, mid - h, 1, h * 2);
    }
  }, [clip.assetId, clip.offset, clip.duration, clip.volume, width, ver]);
  return <canvas ref={ref} />;
}

// ---------- клип ----------

function Clip(props: {
  className: string;
  start: number;
  duration: number;
  pps: number;
  selected: boolean;
  onBody: (e: React.PointerEvent) => void;
  onLeft?: (e: React.PointerEvent) => void;
  onRight?: (e: React.PointerEvent) => void;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`clip ${props.className}${props.selected ? ' sel' : ''}`}
      style={{ left: props.start * props.pps, width: Math.max(4, props.duration * props.pps) }}
      onPointerDown={props.onBody}
      title={props.title}
    >
      {props.children}
      {props.onLeft && <div className="handle l" onPointerDown={props.onLeft} />}
      {props.onRight && <div className="handle r" onPointerDown={props.onRight} />}
    </div>
  );
}

// ---------- раскладка аудио по дорожкам ----------

function audioLanes(clips: AudioClip[]): AudioClip[][] {
  const lanes: AudioClip[][] = [];
  const ends: number[] = [];
  for (const c of [...clips].sort((a, b) => a.start - b.start)) {
    let i = ends.findIndex((e) => e <= c.start + 1e-3);
    if (i < 0) {
      i = lanes.length;
      lanes.push([]);
      ends.push(0);
    }
    lanes[i].push(c);
    ends[i] = c.start + c.duration;
  }
  return lanes;
}

// ---------- плейхед (подписан на время отдельно) ----------

function TimeLabel({ fps }: { fps: number }) {
  const time = useStore((s) => s.time);
  return <b>{fmtTime(time, fps)}</b>;
}

function Playhead({ pps, scrollRef }: { pps: number; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const time = useStore((s) => s.time);
  const playing = useStore((s) => s.playing);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const x = LABEL_W + time * pps;
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft + LABEL_W) el.scrollLeft = x - LABEL_W - 40;
  }, [time, playing, pps, scrollRef]);
  return <div className="playhead" style={{ left: LABEL_W + time * pps }} />;
}

// ---------- таймлайн ----------

export function Timeline({ height, onResize }: { height: number; onResize: (h: number) => void }) {
  const project = useStore((s) => s.project);
  const sel = useStore((s) => s.selection);
  const pps = useStore((s) => s.pxPerSec);
  const playing = useStore((s) => s.playing);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useDrag();

  const total = totalDuration(project);
  const contentEnd = Math.max(
    total,
    ...project.audioClips.map((c) => c.start + c.duration),
    ...project.texts.map((c) => c.start + c.duration),
  );
  // полосы тянутся минимум на всю видимую ширину, даже при мелком масштабе
  const [viewW, setViewW] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const width = Math.max((contentEnd + 8) * pps, viewW - LABEL_W);

  // текущая сцена меняется только при переходе плейхеда через границу
  const curIndex = useStore((s) => sceneAt(s.project, s.time).index);
  const cur = project.scenes[curIndex] ?? sceneAt(project, 0).scene;
  let curStart = 0;
  for (let i = 0; i < curIndex; i++) curStart += project.scenes[i].duration;

  const lanes = useMemo(() => audioLanes(project.audioClips), [project.audioClips]);

  // ---- перемотка ----
  const timeFromEvent = (e: { clientX: number }) => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    return (e.clientX - r.left + el.scrollLeft - LABEL_W) / st().pxPerSec;
  };
  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    st().setPlaying(false);
    st().seek(timeFromEvent(e));
    const move = (ev: PointerEvent) => st().seek(timeFromEvent(ev));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ---- зум колесом с Ctrl ----
  useEffect(() => {
    const el = scrollRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mouseT = (e.clientX - r.left + el.scrollLeft - LABEL_W) / st().pxPerSec;
      st().setPxPerSec(st().pxPerSec * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      el.scrollLeft = mouseT * st().pxPerSec + LABEL_W - (e.clientX - r.left);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- деления линейки ----
  const ticks = useMemo(() => {
    const step = pps > 120 ? 0.5 : pps > 50 ? 1 : pps > 25 ? 2 : 5;
    const out: { t: number; major: boolean }[] = [];
    for (let t = 0; t <= width / pps; t += step) out.push({ t, major: Math.abs(t - Math.round(t / (step * 2)) * step * 2) < 1e-6 || step >= 1 });
    return out;
  }, [pps, width]);

  // ---- сцены ----
  const sceneStarts: number[] = [];
  {
    let a = 0;
    for (const s of project.scenes) {
      sceneStarts.push(a);
      a += s.duration;
    }
  }

  const onSceneBody = (id: string, index: number) => (e: React.PointerEvent) =>
    drag(
      e,
      (_dt, ev) => {
        // перестановка сцен: курсор пересёк середину соседа
        const t = timeFromEvent(ev);
        const p = st().project;
        const i = p.scenes.findIndex((s) => s.id === id);
        let acc = 0;
        let target = i;
        p.scenes.forEach((s, j) => {
          const mid = acc + s.duration / 2;
          if (j < i && t < mid) target = Math.min(target, j);
          if (j > i && t > mid) target = j;
          acc += s.duration;
        });
        if (target !== i)
          live((d) => {
            const [m] = d.scenes.splice(i, 1);
            d.scenes.splice(target, 0, m);
          });
      },
      () => {
        st().select({ kind: 'scene', id });
        const t = st().time;
        const s0 = sceneStarts[index];
        if (t < s0 || t >= s0 + project.scenes[index].duration) st().seek(s0 + 0.001);
      },
    );

  const onSceneRight = (id: string) => (e: React.PointerEvent) => {
    const d0 = project.scenes.find((s) => s.id === id)!.duration;
    drag(e, (dt) => live((p) => void (p.scenes.find((s) => s.id === id)!.duration = Math.max(0.5, Math.round((d0 + dt) * 10) / 10))));
  };

  // ---- текст ----
  const onTextBody = (id: string) => (e: React.PointerEvent) => {
    const c0 = project.texts.find((c) => c.id === id)!;
    const snap = snapper(project);
    drag(
      e,
      (dt) => live((p) => void (p.texts.find((c) => c.id === id)!.start = Math.max(0, snap(c0.start + dt)))),
      () => st().select({ kind: 'text', id }),
    );
  };
  const onTextEdge = (id: string, side: 'l' | 'r') => (e: React.PointerEvent) => {
    const c0 = project.texts.find((c) => c.id === id)!;
    const snap = snapper(project);
    drag(e, (dt) =>
      live((p) => {
        const c = p.texts.find((x) => x.id === id)!;
        if (side === 'r') c.duration = Math.max(0.2, snap(c0.start + c0.duration + dt) - c0.start);
        else {
          const ns = Math.min(Math.max(0, snap(c0.start + dt)), c0.start + c0.duration - 0.2);
          c.start = ns;
          c.duration = c0.start + c0.duration - ns;
        }
      }),
    );
  };

  // ---- аудио ----
  const onAudioBody = (id: string) => (e: React.PointerEvent) => {
    const c0 = project.audioClips.find((c) => c.id === id)!;
    const snap = snapper(project);
    drag(
      e,
      (dt) => live((p) => void (p.audioClips.find((c) => c.id === id)!.start = Math.max(0, snap(c0.start + dt)))),
      () => st().select({ kind: 'audio', id }),
    );
  };
  const onAudioEdge = (id: string, side: 'l' | 'r') => (e: React.PointerEvent) => {
    const c0 = project.audioClips.find((c) => c.id === id)!;
    const assetDur = project.audioAssets.find((a) => a.id === c0.assetId)?.duration ?? c0.offset + c0.duration;
    drag(e, (dt) =>
      live((p) => {
        const c = p.audioClips.find((x) => x.id === id)!;
        if (side === 'r') c.duration = Math.max(0.1, Math.min(c0.duration + dt, assetDur - c0.offset));
        else {
          const d = Math.max(-c0.offset, -c0.start, Math.min(dt, c0.duration - 0.1));
          c.start = c0.start + d;
          c.offset = c0.offset + d;
          c.duration = c0.duration - d;
        }
      }),
    );
  };

  // ---- действия персонажей ----
  const onActionBody = (actorId: string, id: string) => (e: React.PointerEvent) => {
    const a0 = cur.actors.find((a) => a.id === actorId)!;
    const c0 = a0.actions.find((c) => c.id === id)!;
    const snap = snapper(project);
    drag(
      e,
      (dt) =>
        live((p) => {
          const a = actorDraft(p, actorId)!;
          const c = a.actions.find((x) => x.id === id)!;
          c.start = Math.min(Math.max(0, snap(curStart + c0.start + dt) - curStart), Math.max(0, cur.duration - c.duration));
          sortActor(a);
        }),
      () => st().select({ kind: 'action', id, actorId }),
    );
  };
  const onActionEdge = (actorId: string, id: string, side: 'l' | 'r') => (e: React.PointerEvent) => {
    const c0 = cur.actors.find((a) => a.id === actorId)!.actions.find((c) => c.id === id)!;
    const snap = snapper(project);
    drag(e, (dt) =>
      live((p) => {
        const a = actorDraft(p, actorId)!;
        const c = a.actions.find((x) => x.id === id)!;
        const end0 = c0.start + c0.duration;
        if (side === 'r') c.duration = Math.max(0.2, Math.min(snap(curStart + end0 + dt) - curStart, cur.duration) - c0.start);
        else {
          const ns = Math.min(Math.max(0, snap(curStart + c0.start + dt) - curStart), end0 - 0.2);
          c.start = ns;
          c.duration = end0 - ns;
        }
        sortActor(a);
      }),
    );
  };
  const onMoveKey = (actorId: string, id: string) => (e: React.PointerEvent) => {
    const k0 = cur.actors.find((a) => a.id === actorId)!.keys.find((k) => k.id === id)!;
    const snap = snapper(project);
    drag(
      e,
      (dt) =>
        live((p) => {
          const a = actorDraft(p, actorId)!;
          a.keys.find((k) => k.id === id)!.t = Math.min(Math.max(0, snap(curStart + k0.t + dt) - curStart), cur.duration);
          sortActor(a);
          Object.assign(a, { x: a.keys[0].x, y: a.keys[0].y, z: a.keys[0].z, ry: a.keys[0].ry });
        }),
      () => {
        st().select({ kind: 'movekey', id, actorId });
        st().seek(curStart + k0.t);
      },
    );
  };
  const onCamKey = (id: string) => (e: React.PointerEvent) => {
    const k0 = cur.cameraKeys.find((k) => k.id === id)!;
    const snap = snapper(project);
    drag(
      e,
      (dt) =>
        live((p) => {
          const s = p.scenes.find((x) => x.id === cur.id)!;
          s.cameraKeys.find((k) => k.id === id)!.t = Math.min(Math.max(0, snap(curStart + k0.t + dt) - curStart), cur.duration);
          s.cameraKeys.sort((a, b) => a.t - b.t);
        }),
      () => {
        st().select({ kind: 'camkey', id });
        st().seek(curStart + k0.t);
      },
    );
  };

  const onPropKey = (propId: string, id: string) => (e: React.PointerEvent) => {
    const k0 = cur.props.find((x) => x.id === propId)!.keys!.find((k) => k.id === id)!;
    const snap = snapper(project);
    drag(
      e,
      (dt) =>
        live((p) => {
          const pr = p.scenes.find((x) => x.id === cur.id)!.props.find((x) => x.id === propId)!;
          pr.keys!.find((k) => k.id === id)!.t = Math.min(Math.max(0, snap(curStart + k0.t + dt) - curStart), cur.duration);
          pr.keys!.sort((a, b) => a.t - b.t);
          Object.assign(pr, { x: pr.keys![0].x, y: pr.keys![0].y, z: pr.keys![0].z, ry: pr.keys![0].ry });
        }),
      () => {
        st().select({ kind: 'prop', id: propId });
        st().seek(curStart + k0.t);
      },
    );
  };

  // ---- строки ----
  type Row = { key: string; label: ReactNode; cls?: string; labelCls?: string; content: ReactNode; onDown?: (e: React.PointerEvent) => void };
  const rows: Row[] = [];

  rows.push({
    key: 'scenes',
    label: <>Сцены</>,
    content: project.scenes.map((s, i) => (
      <Clip
        key={s.id}
        className={'scene' + (i === curIndex ? ' cur' : '')}
        start={sceneStarts[i]}
        duration={s.duration}
        pps={pps}
        selected={isSel(sel, 'scene', s.id)}
        onBody={onSceneBody(s.id, i)}
        onRight={onSceneRight(s.id)}
        title="Тяните, чтобы переставить; правый край — длительность"
      >
        {s.transition !== 'cut' && <span title="Переход">◐</span>}
        <b>{i + 1}</b> {s.name} <span style={{ opacity: 0.6 }}>{s.duration.toFixed(1)}с</span>
      </Clip>
    )),
  });
  rows.push({
    key: 'text',
    label: <>Текст</>,
    content: project.texts.map((c) => (
      <Clip key={c.id} className="text" start={c.start} duration={c.duration} pps={pps} selected={isSel(sel, 'text', c.id)} onBody={onTextBody(c.id)} onLeft={onTextEdge(c.id, 'l')} onRight={onTextEdge(c.id, 'r')}>
        {c.text.split('\n')[0]}
      </Clip>
    )),
  });
  [...lanes, []].forEach((lane, i) =>
    rows.push({
      key: 'audio' + i,
      label: <>Звук {i + 1}</>,
      content: lane.map((c) => (
        <Clip key={c.id} className="audio" start={c.start} duration={c.duration} pps={pps} selected={isSel(sel, 'audio', c.id)} onBody={onAudioBody(c.id)} onLeft={onAudioEdge(c.id, 'l')} onRight={onAudioEdge(c.id, 'r')}>
          <Wave clip={c} width={c.duration * pps} />
          <span>{c.name}</span>
        </Clip>
      )),
    }),
  );

  const detail: Row[] = [];
  detail.push({
    key: 'cam',
    label: <>Камера</>,
    labelCls: 'sub',
    content: cur.cameraKeys.map((k) => (
      <div key={k.id} className={'diamond cam' + (isSel(sel, 'camkey', k.id) ? ' sel' : '')} style={{ left: (curStart + k.t) * pps }} onPointerDown={onCamKey(k.id)} title={`Ключ камеры ${k.t.toFixed(2)}с`} />
    )),
  });
  for (const a of cur.actors) {
    const actorSel = sel && ((sel.kind === 'actor' && sel.id === a.id) || ((sel.kind === 'action' || sel.kind === 'movekey') && sel.actorId === a.id));
    detail.push({
      key: a.id,
      labelCls: 'sub' + (actorSel ? ' sel' : ''),
      label: (
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }} onClick={() => st().select({ kind: 'actor', id: a.id })}>
          <span className="dot" style={{ background: a.color }} />
          {a.name}
        </span>
      ),
      content: (
        <>
          {a.actions.map((c) => {
            const def = ACTION_MAP[c.type];
            return (
              <Clip
                key={c.id}
                className="action"
                start={curStart + c.start}
                duration={c.duration}
                pps={pps}
                selected={isSel(sel, 'action', c.id)}
                onBody={onActionBody(a.id, c.id)}
                onLeft={onActionEdge(a.id, c.id, 'l')}
                onRight={onActionEdge(a.id, c.id, 'r')}
              >
                <span className="ic">{def?.icon}</span> {def?.label ?? c.type}
              </Clip>
            );
          })}
          {a.keys.map((k) => (
            <div
              key={k.id}
              className={'diamond move' + (isSel(sel, 'movekey', k.id) ? ' sel' : '')}
              style={{ left: (curStart + k.t) * pps }}
              onPointerDown={onMoveKey(a.id, k.id)}
              title={`Ключ движения ${k.t.toFixed(2)}с`}
            />
          ))}
        </>
      ),
    });
  }

  for (const pr of cur.props) {
    const def = PROP_MAP[pr.kind];
    if (!def?.vehicle || !pr.keys?.length) continue;
    detail.push({
      key: pr.id,
      labelCls: 'sub' + (isSel(sel, 'prop', pr.id) ? ' sel' : ''),
      label: (
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }} onClick={() => st().select({ kind: 'prop', id: pr.id })}>
          <span className="dot" style={{ background: pr.color ?? def.color }} />
          {def.label}
        </span>
      ),
      content: (
        <>
          {pr.keys.length > 1 && (
            <div className="clip drive" style={{ left: (curStart + pr.keys[0].t) * pps, width: Math.max(4, (pr.keys[pr.keys.length - 1].t - pr.keys[0].t) * pps), pointerEvents: 'none' }} />
          )}
          {pr.keys.map((k) => (
            <div key={k.id} className="diamond move" style={{ left: (curStart + k.t) * pps }} onPointerDown={onPropKey(pr.id, k.id)} title={`Ключ поездки ${k.t.toFixed(2)}с`} />
          ))}
        </>
      ),
    });
  }

  const fit = () => {
    const el = scrollRef.current;
    if (el) st().setPxPerSec((el.clientWidth - LABEL_W - 40) / Math.max(1, contentEnd));
  };

  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    const d = JSON.parse(raw) as DragPayload;
    if (d.type !== 'audio') return;
    e.preventDefault();
    st().seek(timeFromEvent(e));
    addAudioClipFromAsset(d.assetId);
  };

  const renderRow = (r: Row, dim = false) => (
    <div key={r.key} style={{ display: 'flex', width: LABEL_W + width }}>
      <div className={'tl-label ' + (r.labelCls ?? '')} style={{ position: 'sticky', left: 0, zIndex: 3, background: 'var(--panel)', width: LABEL_W, flex: 'none', borderRight: '1px solid var(--line)' }}>
        {r.label}
      </div>
      <div className={'tl-row' + (dim ? ' dim' : '')} style={{ width }} onPointerDown={scrub}>
        {r.content}
      </div>
    </div>
  );

  return (
    <div className="timeline" style={{ ['--row-h' as string]: ROW_H + 'px' }}>
      <div
        className="tl-resize"
        onPointerDown={(e) => {
          const y0 = e.clientY;
          const h0 = height;
          const move = (ev: PointerEvent) => onResize(Math.min(window.innerHeight - 250, Math.max(140, h0 - (ev.clientY - y0))));
          const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up));
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
      />
      <div className="tl-head">
        <button className="ghost" onClick={() => st().seek(0)} title="В начало (Home)">
          ⏮
        </button>
        <button className="primary play" onClick={() => st().setPlaying(!playing)} title="Пробел">
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="time">
          <TimeLabel fps={project.fps} /> <span>/ {fmtTime(total, project.fps)}</span>
        </div>
        <button onClick={splitAtPlayhead} title="Разрезать выбранный клип по плейхеду (S)">
          ✂ Разрезать
        </button>
        <button onClick={addScene}>＋ Сцена</button>
        <button onClick={addText}>＋ Текст</button>
        <div className="spacer" />
        <span className="hint">Масштаб</span>
        <input type="range" min={15} max={400} value={pps} onChange={(e) => st().setPxPerSec(Number(e.target.value))} style={{ width: 120 }} />
        <button className="ghost" onClick={fit} title="Вместить всё">
          ⤢
        </button>
      </div>
      <div className="tl-body">
        <div className="tl-scroll" ref={scrollRef} onDragOver={(e) => e.dataTransfer.types.includes(DRAG_MIME) && e.preventDefault()} onDrop={onDrop}>
          <div className="tl-canvas" style={{ width: LABEL_W + width }}>
            {/* линейка */}
            <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 5 }}>
              <div className="tl-label head" style={{ position: 'sticky', left: 0, zIndex: 6, background: 'var(--panel)', width: LABEL_W, flex: 'none', borderRight: '1px solid var(--line)' }} />
              <div className="tl-ruler" style={{ width, position: 'relative' }} onPointerDown={scrub}>
                {ticks.map(({ t, major }) => (
                  <div key={t} className={'tick' + (major ? '' : ' minor')} style={{ left: t * pps }}>
                    {major ? `${Math.round(t * 10) / 10}s` : ''}
                  </div>
                ))}
              </div>
            </div>
            {rows.map((r) => renderRow(r))}
            <div style={{ display: 'flex', width: LABEL_W + width }}>
              <div className="tl-label" style={{ position: 'sticky', left: 0, zIndex: 3, background: '#101010', width: LABEL_W, height: 22, fontSize: 11, borderRight: '1px solid var(--line)' }}>
                {curIndex >= 0 ? `Сцена ${curIndex + 1}: ${cur.name}` : 'Сцен нет'}
              </div>
              <div className="tl-sep" style={{ width, height: 22 }} />
            </div>
            {detail.map((r) => renderRow(r, true))}
            {/* подсветка текущей сцены, конец ролика и плейхед */}
            <div className="scene-span" style={{ left: LABEL_W + curStart * pps, width: cur.duration * pps }} />
            <div className="tl-end" style={{ left: LABEL_W + total * pps, right: 0 }} />
            <Playhead pps={pps} scrollRef={scrollRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
