import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Draft } from 'immer';
import { actorDraft, sortActor, useStore } from '../store';
import type { AudioClip, Overlay, Project, Scene, Selection, TrackGroup } from '../types';
import { sceneAt, totalDuration } from '../engine/evaluate';
import { ACTION_MAP } from '../engine/poses';
import { PROP_MAP } from '../engine/props';
import { PEAKS_PER_SEC, getPeaks, onBuffersChange } from '../audio/audio';
import { addAudioClipFromAsset, addBlankScene, addScene, addText, splitAtPlayhead } from '../ops';
import { FILTER_MAP } from '../engine/filters';
import { STICKER_MAP } from '../engine/stickers';
import { onMediaChange, posterOf } from '../engine/media';
import { clipEdges, compactTracks, groupItems, neighbours, placeClip, trackBusy, trackCount, trackFlags, trackOf } from '../tracks';
import { DRAG_MIME, type DragPayload } from './Library';

const LABEL_W = 170;
const ROW_H = 32;
const st = () => useStore.getState();

function fmtTime(t: number, fps: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const f = Math.floor((t % 1) * fps);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
}

/**
 * Перетаскивание клипа. onMove получает сдвиг в секундах; onEnd — после отпускания, если двигали.
 * Первая точка истории создаётся при первом движении.
 */
function useDrag() {
  return (
    e: React.PointerEvent,
    onMove: (dt: number, ev: PointerEvent) => void,
    onClick?: () => void,
    onEnd?: () => void,
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const pps = st().pxPerSec;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3 && Math.abs(ev.clientY - y0) < 6) return;
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
      else onEnd?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
}

/**
 * Привязка: плейхед, начало, границы сцен и края всех клипов (кроме перетаскиваемого).
 * Возвращает функцию привязки и последнюю точку, к которой «прилипли» (для линии магнита).
 */
function snapper(project: Project, exceptId?: string) {
  const pts = [0, st().time, ...clipEdges(project, exceptId)];
  let acc = 0;
  for (const s of project.scenes) {
    acc += s.duration;
    pts.push(acc);
  }
  const tol = 8 / st().pxPerSec;
  const state = { hit: null as number | null };
  const snap = (t: number) => {
    let best = t;
    let d = tol;
    for (const p of pts) {
      const dd = Math.abs(p - t);
      if (dd < d) {
        d = dd;
        best = p;
      }
    }
    state.hit = best !== t ? best : null;
    return best;
  };
  /** Привязать клип целиком: к началу или к концу — что ближе. */
  const snapRange = (start: number, dur: number) => {
    const a = snap(start);
    const ha = state.hit;
    const da = Math.abs(a - start);
    const b = snap(start + dur);
    const hb = state.hit;
    const db = Math.abs(b - (start + dur));
    if (ha !== null && (hb === null || da <= db)) {
      state.hit = ha;
      return a;
    }
    if (hb !== null) {
      state.hit = hb;
      return b - dur;
    }
    state.hit = null;
    return start;
  };
  return { snap, snapRange, state };
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
  style?: React.CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      className={`clip ${props.className}${props.selected ? ' sel' : ''}`}
      style={{ left: props.start * props.pps, width: Math.max(4, props.duration * props.pps), ...props.style }}
      onPointerDown={props.onBody}
      title={props.title}
    >
      {props.children}
      {props.onLeft && <div className="handle l" onPointerDown={props.onLeft} />}
      {props.onRight && <div className="handle r" onPointerDown={props.onRight} />}
    </div>
  );
}

// ---------- иконки заголовков дорожек ----------

const Eye = ({ off }: { off?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);
const Speaker = ({ off }: { off?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 9h4l5-4v14l-5-4H4z" />
    {off ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
  </svg>
);

function toggleFlag(g: TrackGroup, track: number, flag: 'hidden' | 'muted') {
  st().edit((p) => {
    p.trackMeta ??= { visual: {}, filter: {}, audio: {} };
    const m = (p.trackMeta[g] ??= {});
    const cur = m[track] ?? {};
    m[track] = { ...cur, [flag]: !cur[flag] };
  });
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

// ---------- вспомогательное ----------

/** Сцена, которой принадлежит выбранный объект. */
function sceneOfSelection(p: Project, s: Selection | null): Scene | undefined {
  if (!s) return;
  const id = s.kind === 'action' || s.kind === 'movekey' ? s.actorId : s.id;
  if (!['actor', 'prop', 'action', 'movekey', 'camkey'].includes(s.kind)) return;
  return p.scenes.find((sc) => sc.actors.some((a) => a.id === id) || sc.props.some((x) => x.id === id) || sc.cameraKeys.some((k) => k.id === id));
}

/** На сколько пикселей можно «перетянуть» плейхед за границу сцены, прежде чем выбор снимется. */
const MAGNET_PX = 40;

interface DropHint {
  g: TrackGroup;
  track: number;
  /** Клип наложится на другой — при отпускании появится новая дорожка над этой. */
  newTrack: boolean;
}

// ---------- таймлайн ----------

export function Timeline({ height, onResize }: { height: number; onResize: (h: number) => void }) {
  const project = useStore((s) => s.project);
  const sel = useStore((s) => s.selection);
  const pps = useStore((s) => s.pxPerSec);
  const playing = useStore((s) => s.playing);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useDrag();
  const [hint, setHint] = useState<DropHint | null>(null);
  const [snapAt, setSnapAt] = useState<number | null>(null);
  const [, setMediaVer] = useState(0);
  useEffect(() => onMediaChange(() => setMediaVer((v) => v + 1)), []);

  const total = totalDuration(project);
  const contentEnd = Math.max(
    total,
    ...project.audioClips.map((c) => c.start + c.duration),
    ...project.texts.map((c) => c.start + c.duration),
    ...project.overlays.map((c) => c.start + c.duration),
    ...project.filters.map((c) => c.start + c.duration),
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

  const curIndex = useStore((s) => sceneAt(s.project, s.time).index);
  const cur = project.scenes[curIndex] ?? sceneAt(project, 0).scene;

  const sceneStarts: number[] = [];
  {
    let a = 0;
    for (const s of project.scenes) {
      sceneStarts.push(a);
      a += s.duration;
    }
  }
  const startOf = (sceneId: string) => sceneStarts[project.scenes.findIndex((s) => s.id === sceneId)] ?? 0;
  const curStart = curIndex >= 0 ? sceneStarts[curIndex] : 0;

  // ---- перемотка с магнитом у границы сцены выбранного объекта ----
  const timeFromEvent = (e: { clientX: number }) => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    return (e.clientX - r.left + el.scrollLeft - LABEL_W) / st().pxPerSec;
  };
  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    st().setPlaying(false);
    const p = st().project;
    const sc = sceneOfSelection(p, st().selection);
    const range = sc ? [startOf(sc.id), startOf(sc.id) + sc.duration] : null;
    const apply = (ev: { clientX: number }) => {
      let t = timeFromEvent(ev);
      if (range && st().selection) {
        const px = st().pxPerSec;
        if (t >= range[1]) {
          if ((t - range[1]) * px < MAGNET_PX) t = range[1] - 0.001;
          else st().select(null);
        } else if (t < range[0]) {
          if ((range[0] - t) * px < MAGNET_PX) t = range[0];
          else st().select(null);
        }
      }
      st().seek(t);
    };
    apply(e);
    const move = (ev: PointerEvent) => apply(ev);
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

  // ---- сцены (основная дорожка) ----
  const onSceneBody = (id: string, index: number) => (e: React.PointerEvent) =>
    drag(
      e,
      (_dt, ev) => {
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

  // ---- клипы на дорожках: перенос по времени и между дорожками ----
  /** Дорожка группы g под курсором; выше верхней — новая сверху (для звука — ниже нижней). */
  const trackAtPointer = (g: TrackGroup, clientY: number): number => {
    const els = Array.from(scrollRef.current!.querySelectorAll<HTMLElement>(`.tl-row[data-tg="${g}"]`));
    const n = trackCount(st().project, g);
    if (!els.length) return 0;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (clientY >= r.top && clientY < r.bottom) return Number(el.dataset.track);
    }
    const first = els[0].getBoundingClientRect();
    if (g === 'audio') return clientY < first.top ? 0 : n;
    return clientY < first.top ? n : 0;
  };

  type T = { id: string; start: number; duration: number; track?: number; offset?: number; assetId?: string };

  const clipBody = (g: TrackGroup, kind: 'text' | 'overlay' | 'filter' | 'audio', id: string) => (e: React.PointerEvent) => {
    const it0 = { ...(groupItems(project, g) as T[]).find((c) => c.id === id)! };
    const sn = snapper(project, id);
    drag(
      e,
      (dt, ev) => {
        const start = Math.max(0, sn.snapRange(it0.start + dt, it0.duration));
        setSnapAt(sn.state.hit);
        const target = trackAtPointer(g, ev.clientY);
        live((p) => {
          const c = (groupItems(p, g) as T[]).find((x) => x.id === id)!;
          c.start = start;
          c.track = target;
        });
        setHint({ g, track: target, newTrack: trackBusy(st().project, g, target, start, it0.duration, id) });
      },
      () => st().select({ kind, id } as Selection),
      () => {
        // отпустили: если клип лёг поверх другого — новая дорожка над целевой
        live((p) => {
          const c = (groupItems(p, g) as T[]).find((x) => x.id === id)!;
          placeClip(p, g, id, c.start, trackOf(c));
        });
        setHint(null);
        setSnapAt(null);
        st().select({ kind, id } as Selection);
      },
    );
  };

  const clipEdge = (g: TrackGroup, id: string, side: 'l' | 'r') => (e: React.PointerEvent) => {
    const c0 = { ...(groupItems(project, g) as T[]).find((c) => c.id === id)! };
    const nb = neighbours(project, g, id);
    const sn = snapper(project, id);
    let maxDur = Infinity;
    let minStart = nb.left;
    if (c0.assetId) {
      const media = project.mediaAssets.find((a) => a.id === c0.assetId);
      const audio = project.audioAssets.find((a) => a.id === c0.assetId);
      const dur = media?.type === 'video' ? media.duration : audio?.duration;
      if (dur !== undefined) {
        maxDur = dur - (c0.offset ?? 0);
        minStart = Math.max(minStart, c0.start - (c0.offset ?? 0));
      }
    }
    drag(
      e,
      (dt) => {
        live((p) => {
          const c = (groupItems(p, g) as T[]).find((x) => x.id === id)!;
          if (side === 'r') {
            const end = Math.min(nb.right, sn.snap(c0.start + c0.duration + dt));
            c.duration = Math.max(0.2, Math.min(maxDur, end - c0.start));
          } else {
            const ns = Math.min(Math.max(minStart, sn.snap(c0.start + dt)), c0.start + c0.duration - 0.2);
            const d = ns - c0.start;
            c.start = ns;
            c.duration = c0.duration - d;
            if (c.offset !== undefined) c.offset = Math.max(0, (c0.offset ?? 0) + d);
          }
        });
        setSnapAt(sn.state.hit);
      },
      undefined,
      () => setSnapAt(null),
    );
  };

  // ---- анимации персонажей: каждая не выходит за пределы своей сцены ----
  const enterScene = (sc: Scene, local: number) => {
    const s0 = startOf(sc.id);
    const t = st().time;
    if (t < s0 || t >= s0 + sc.duration) st().seek(s0 + Math.min(Math.max(local, 0), sc.duration - 0.001));
  };
  const onActionBody = (sc: Scene, actorId: string, id: string) => (e: React.PointerEvent) => {
    const s0 = startOf(sc.id);
    const c0 = sc.actors.find((a) => a.id === actorId)!.actions.find((c) => c.id === id)!;
    const sn = snapper(project);
    drag(
      e,
      (dt) => {
        live((p) => {
          const a = actorDraft(p, actorId)!;
          const c = a.actions.find((x) => x.id === id)!;
          c.start = Math.min(Math.max(0, sn.snapRange(s0 + c0.start + dt, c0.duration) - s0), Math.max(0, sc.duration - c.duration));
          sortActor(a);
        });
        setSnapAt(sn.state.hit);
      },
      () => {
        st().select({ kind: 'action', id, actorId });
        enterScene(sc, c0.start);
      },
      () => setSnapAt(null),
    );
  };
  const onActionEdge = (sc: Scene, actorId: string, id: string, side: 'l' | 'r') => (e: React.PointerEvent) => {
    const s0 = startOf(sc.id);
    const c0 = sc.actors.find((a) => a.id === actorId)!.actions.find((c) => c.id === id)!;
    const sn = snapper(project);
    drag(
      e,
      (dt) => {
        live((p) => {
          const a = actorDraft(p, actorId)!;
          const c = a.actions.find((x) => x.id === id)!;
          const end0 = c0.start + c0.duration;
          if (side === 'r') c.duration = Math.max(0.2, Math.min(sn.snap(s0 + end0 + dt) - s0, sc.duration) - c0.start);
          else {
            const ns = Math.min(Math.max(0, sn.snap(s0 + c0.start + dt) - s0), end0 - 0.2);
            c.start = ns;
            c.duration = end0 - ns;
          }
          sortActor(a);
        });
        setSnapAt(sn.state.hit);
      },
      undefined,
      () => setSnapAt(null),
    );
  };
  const keyDrag = (sc: Scene, k0t: number, apply: (p: Draft<Project>, t: number) => void, onClick: () => void) => (e: React.PointerEvent) => {
    const s0 = startOf(sc.id);
    const sn = snapper(project);
    drag(
      e,
      (dt) => {
        live((p) => apply(p, Math.min(Math.max(0, sn.snap(s0 + k0t + dt) - s0), sc.duration)));
        setSnapAt(sn.state.hit);
      },
      onClick,
      () => setSnapAt(null),
    );
  };
  const onMoveKey = (sc: Scene, actorId: string, id: string, k0t: number) =>
    keyDrag(
      sc,
      k0t,
      (p, t) => {
        const a = actorDraft(p, actorId)!;
        a.keys.find((k) => k.id === id)!.t = t;
        sortActor(a);
        Object.assign(a, { x: a.keys[0].x, y: a.keys[0].y, z: a.keys[0].z, ry: a.keys[0].ry });
      },
      () => {
        st().select({ kind: 'movekey', id, actorId });
        st().seek(startOf(sc.id) + k0t);
      },
    );
  const onCamKey = (sc: Scene, id: string, k0t: number) =>
    keyDrag(
      sc,
      k0t,
      (p, t) => {
        const s = p.scenes.find((x) => x.id === sc.id)!;
        s.cameraKeys.find((k) => k.id === id)!.t = t;
        s.cameraKeys.sort((a, b) => a.t - b.t);
      },
      () => {
        st().select({ kind: 'camkey', id });
        st().seek(startOf(sc.id) + k0t);
      },
    );
  const onPropKey = (sc: Scene, propId: string, id: string, k0t: number) =>
    keyDrag(
      sc,
      k0t,
      (p, t) => {
        const pr = p.scenes.find((x) => x.id === sc.id)!.props.find((x) => x.id === propId)!;
        pr.keys!.find((k) => k.id === id)!.t = t;
        pr.keys!.sort((a, b) => a.t - b.t);
        Object.assign(pr, { x: pr.keys![0].x, y: pr.keys![0].y, z: pr.keys![0].z, ry: pr.keys![0].ry });
      },
      () => {
        st().select({ kind: 'prop', id: propId });
        st().seek(startOf(sc.id) + k0t);
      },
    );

  // ---- строки ----
  type Row = { key: string; label: ReactNode; labelCls?: string; content: ReactNode; g?: TrackGroup; track?: number; rowCls?: string };
  const rows: Row[] = [];

  const header = (g: TrackGroup, track: number, title: string) => {
    const f = trackFlags(project, g, track);
    return (
      <span className="track-head">
        <span className="track-name">{title}</span>
        {g !== 'audio' && (
          <button className={'ghost icon' + (f.hidden ? ' off' : '')} title={f.hidden ? 'Показать дорожку' : 'Скрыть дорожку'} onPointerDown={(e) => e.stopPropagation()} onClick={() => toggleFlag(g, track, 'hidden')}>
            <Eye off={f.hidden} />
          </button>
        )}
        {(g === 'audio' || g === 'visual') && (
          <button className={'ghost icon' + (f.muted ? ' off' : '')} title={f.muted ? 'Включить звук' : 'Выключить звук'} onPointerDown={(e) => e.stopPropagation()} onClick={() => toggleFlag(g, track, 'muted')}>
            <Speaker off={f.muted} />
          </button>
        )}
      </span>
    );
  };

  // фильтры — сверху
  const nF = trackCount(project, 'filter');
  for (let tr = Math.max(1, nF) - 1; tr >= 0; tr--) {
    rows.push({
      key: 'fx' + tr,
      g: 'filter',
      track: tr,
      rowCls: trackFlags(project, 'filter', tr).hidden ? 'hidden-track' : '',
      label: header('filter', tr, nF > 1 ? `Фильтры ${tr + 1}` : 'Фильтры'),
      content: project.filters
        .filter((f) => trackOf(f) === tr)
        .map((f) => (
          <Clip key={f.id} className="filter" start={f.start} duration={f.duration} pps={pps} selected={isSel(sel, 'filter', f.id)} onBody={clipBody('filter', 'filter', f.id)} onLeft={clipEdge('filter', f.id, 'l')} onRight={clipEdge('filter', f.id, 'r')}>
            ◑ {FILTER_MAP[f.filter]?.label ?? f.filter} <span style={{ opacity: 0.6 }}>{Math.round(f.amount * 100)}%</span>
          </Clip>
        )),
    });
  }

  // слои: текст, стикеры, фото, видео — верхняя дорожка рисуется поверх
  const overlayLabel = (o: Overlay) => {
    if (o.type === 'sticker') return STICKER_MAP[o.sticker!]?.emoji ?? '★ ' + (STICKER_MAP[o.sticker!]?.label ?? '');
    const a = project.mediaAssets.find((m) => m.id === o.assetId);
    return (a?.type === 'video' ? '▶ ' : '') + (a?.name ?? 'медиа');
  };
  const nV = trackCount(project, 'visual');
  for (let tr = Math.max(1, nV) - 1; tr >= 0; tr--) {
    rows.push({
      key: 'v' + tr,
      g: 'visual',
      track: tr,
      rowCls: trackFlags(project, 'visual', tr).hidden ? 'hidden-track' : '',
      label: header('visual', tr, `Слой ${tr + 1}`),
      content: (
        <>
          {project.overlays
            .filter((o) => trackOf(o) === tr)
            .map((o) => {
              const poster = o.type === 'media' ? posterOf(o.assetId!) : null;
              return (
                <Clip
                  key={o.id}
                  className={'overlay ' + (o.type === 'sticker' ? 'stk' : 'media')}
                  start={o.start}
                  duration={o.duration}
                  pps={pps}
                  selected={isSel(sel, 'overlay', o.id)}
                  onBody={clipBody('visual', 'overlay', o.id)}
                  onLeft={clipEdge('visual', o.id, 'l')}
                  onRight={clipEdge('visual', o.id, 'r')}
                  style={poster ? { backgroundImage: `url(${poster})` } : undefined}
                >
                  <span className="clip-label">{overlayLabel(o)}</span>
                </Clip>
              );
            })}
          {project.texts
            .filter((c) => trackOf(c) === tr)
            .map((c) => (
              <Clip key={c.id} className="text" start={c.start} duration={c.duration} pps={pps} selected={isSel(sel, 'text', c.id)} onBody={clipBody('visual', 'text', c.id)} onLeft={clipEdge('visual', c.id, 'l')} onRight={clipEdge('visual', c.id, 'r')}>
                <span className="clip-t">T</span>
                <span style={{ fontFamily: `"${c.font ?? 'Inter'}"` }}>{c.text.split('\n')[0]}</span>
              </Clip>
            ))}
        </>
      ),
    });
  }

  // основная дорожка — сцены
  rows.push({
    key: 'scenes',
    label: <span className="track-head"><span className="track-name"><b>Основная</b></span></span>,
    labelCls: 'main',
    rowCls: 'main',
    content: project.scenes.map((s, i) => (
      <Clip
        key={s.id}
        className={'scene' + (i === curIndex ? ' cur' : '') + (s.kind === 'blank' ? ' blank' : '')}
        start={sceneStarts[i]}
        duration={s.duration}
        pps={pps}
        selected={isSel(sel, 'scene', s.id)}
        onBody={onSceneBody(s.id, i)}
        onRight={onSceneRight(s.id)}
        title="Тяните, чтобы переставить; правый край — длительность"
      >
        {s.kind === 'blank' && <span className="swatch-dot" style={{ background: s.background }} />}
        {s.transition !== 'cut' && <span title="Переход">◐</span>}
        <b>{i + 1}</b> {s.name} <span style={{ opacity: 0.6 }}>{s.duration.toFixed(1)}с</span>
      </Clip>
    )),
  });

  // звук — снизу (+ пустая дорожка для новых клипов)
  const nA = trackCount(project, 'audio');
  for (let tr = 0; tr <= nA; tr++) {
    rows.push({
      key: 'a' + tr,
      g: 'audio',
      track: tr,
      rowCls: trackFlags(project, 'audio', tr).muted ? 'hidden-track' : '',
      label: header('audio', tr, `Звук ${tr + 1}`),
      content: project.audioClips
        .filter((c) => trackOf(c) === tr)
        .map((c) => (
          <Clip key={c.id} className="audio" start={c.start} duration={c.duration} pps={pps} selected={isSel(sel, 'audio', c.id)} onBody={clipBody('audio', 'audio', c.id)} onLeft={clipEdge('audio', c.id, 'l')} onRight={clipEdge('audio', c.id, 'r')}>
            <Wave clip={c} width={c.duration * pps} />
            <span>{c.name}</span>
          </Clip>
        )),
    });
  }

  // ---- детали всех сцен ----
  const scenes3d = project.scenes.filter((s) => s.kind !== 'blank');
  const detail: Row[] = [];
  detail.push({
    key: 'cam',
    label: <>Камера</>,
    labelCls: 'sub',
    content: scenes3d.flatMap((sc) =>
      sc.cameraKeys.map((k) => (
        <div
          key={k.id}
          className={'diamond cam' + (isSel(sel, 'camkey', k.id) ? ' sel' : '')}
          style={{ left: (startOf(sc.id) + k.t) * pps }}
          onPointerDown={onCamKey(sc, k.id, k.t)}
          title={`${sc.name}: ключ камеры ${k.t.toFixed(2)}с`}
        />
      )),
    ),
  });
  const actorLanes = Math.max(0, ...scenes3d.map((s) => s.actors.length));
  for (let li = 0; li < actorLanes; li++) {
    const laneSel = scenes3d.some((sc) => {
      const a = sc.actors[li];
      return a && sel && ((sel.kind === 'actor' && sel.id === a.id) || ((sel.kind === 'action' || sel.kind === 'movekey') && sel.actorId === a.id));
    });
    detail.push({
      key: 'actor' + li,
      labelCls: 'sub' + (laneSel ? ' sel' : ''),
      label: <>Персонаж {li + 1}</>,
      content: scenes3d.map((sc) => {
        const a = sc.actors[li];
        if (!a) return null;
        const s0 = startOf(sc.id);
        const actorSel = sel && ((sel.kind === 'actor' && sel.id === a.id) || ((sel.kind === 'action' || sel.kind === 'movekey') && sel.actorId === a.id));
        return (
          <Fragment key={a.id}>
            <div className={'seg-bg' + (actorSel ? ' sel' : '')} style={{ left: s0 * pps, width: sc.duration * pps }} />
            <div
              className={'name-tag' + (actorSel ? ' sel' : '')}
              style={{ left: s0 * pps + 2 }}
              onPointerDown={(e) => {
                e.stopPropagation();
                st().select({ kind: 'actor', id: a.id });
                enterScene(sc, 0);
              }}
              title={`${sc.name}: ${a.name}`}
            >
              <span className="dot" style={{ background: a.color }} />
              {a.name}
            </div>
            {a.actions.map((c) => {
              const def = ACTION_MAP[c.type];
              return (
                <Clip
                  key={c.id}
                  className="action"
                  start={s0 + c.start}
                  duration={c.duration}
                  pps={pps}
                  selected={isSel(sel, 'action', c.id)}
                  onBody={onActionBody(sc, a.id, c.id)}
                  onLeft={onActionEdge(sc, a.id, c.id, 'l')}
                  onRight={onActionEdge(sc, a.id, c.id, 'r')}
                >
                  <span className="ic">{def?.icon}</span> {def?.label ?? c.type}
                </Clip>
              );
            })}
            {a.keys.map((k) => (
              <div
                key={k.id}
                className={'diamond move' + (isSel(sel, 'movekey', k.id) ? ' sel' : '')}
                style={{ left: (s0 + k.t) * pps }}
                onPointerDown={onMoveKey(sc, a.id, k.id, k.t)}
                title={`Ключ движения ${k.t.toFixed(2)}с`}
              />
            ))}
          </Fragment>
        );
      }),
    });
  }
  const vehicleLanes = Math.max(0, ...scenes3d.map((s) => s.props.filter((p) => PROP_MAP[p.kind]?.vehicle && p.keys?.length).length));
  for (let li = 0; li < vehicleLanes; li++) {
    detail.push({
      key: 'veh' + li,
      labelCls: 'sub',
      label: <>Транспорт {li + 1}</>,
      content: scenes3d.map((sc) => {
        const pr = sc.props.filter((p) => PROP_MAP[p.kind]?.vehicle && p.keys?.length)[li];
        if (!pr || !pr.keys) return null;
        const def = PROP_MAP[pr.kind];
        const s0 = startOf(sc.id);
        return (
          <Fragment key={pr.id}>
            <div
              className={'name-tag' + (isSel(sel, 'prop', pr.id) ? ' sel' : '')}
              style={{ left: s0 * pps + 2 }}
              onPointerDown={(e) => {
                e.stopPropagation();
                st().select({ kind: 'prop', id: pr.id });
                enterScene(sc, 0);
              }}
            >
              <span className="dot" style={{ background: pr.color ?? def.color }} />
              {def.label}
            </div>
            {pr.keys.length > 1 && (
              <div className="clip drive" style={{ left: (s0 + pr.keys[0].t) * pps, width: Math.max(4, (pr.keys[pr.keys.length - 1].t - pr.keys[0].t) * pps), pointerEvents: 'none' }} />
            )}
            {pr.keys.map((k) => (
              <div key={k.id} className="diamond move" style={{ left: (s0 + k.t) * pps }} onPointerDown={onPropKey(sc, pr.id, k.id, k.t)} title={`Ключ поездки ${k.t.toFixed(2)}с`} />
            ))}
          </Fragment>
        );
      }),
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

  const renderRow = (r: Row, dim = false) => {
    const isHint = hint && r.g === hint.g && r.track === hint.track;
    return (
      <div key={r.key} style={{ display: 'flex', width: LABEL_W + width }}>
        <div className={'tl-label ' + (r.labelCls ?? '')} style={{ position: 'sticky', left: 0, zIndex: 3, background: 'var(--panel)', width: LABEL_W, flex: 'none', borderRight: '1px solid var(--line)' }}>
          {r.label}
        </div>
        <div
          className={'tl-row' + (dim ? ' dim' : '') + (r.rowCls ? ' ' + r.rowCls : '') + (isHint ? (hint!.newTrack ? ' drop-new' : ' drop-target') : '')}
          style={{ width }}
          data-tg={r.g}
          data-track={r.track}
          onPointerDown={scrub}
        >
          {isHint && hint!.newTrack && <div className="new-track-bar">＋ новая дорожка</div>}
          {r.content}
        </div>
      </div>
    );
  };

  // при выходе со страницы/потере фокуса подсказку убираем
  useEffect(() => {
    const clear = () => (setHint(null), setSnapAt(null));
    window.addEventListener('blur', clear);
    return () => window.removeEventListener('blur', clear);
  }, []);

  // на всякий случай: пустые дорожки после внешних правок (импорт, undo) убираем лениво
  useEffect(() => {
    const p = st().project;
    const needs = (['visual', 'filter', 'audio'] as TrackGroup[]).some((g) => {
      const used = new Set(groupItems(p, g).map(trackOf));
      return used.size && Math.max(...used) + 1 !== used.size;
    });
    if (needs) st().edit((d) => compactTracks(d), { history: false });
  }, [project]);

  return (
    <div className="timeline" style={{ ['--row-h' as string]: ROW_H + 'px' }}>
      <div
        className="tl-resize"
        onPointerDown={(e) => {
          e.preventDefault();
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
        <button onClick={() => addBlankScene()} title="Кадр без 3D — для фото, видео и текста">
          ＋ Пустой кадр
        </button>
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
              <div className="tl-label" style={{ position: 'sticky', left: 0, zIndex: 3, background: '#0b0b0b', width: LABEL_W, height: 22, fontSize: 11, borderRight: '1px solid var(--line)' }}>
                Анимации сцен
              </div>
              <div className="tl-sep" style={{ width, height: 22 }}>
                {project.scenes.map((s, i) => (
                  <span key={s.id} className="sep-name" style={{ left: sceneStarts[i] * pps + 4 }}>
                    {i + 1}. {s.name}
                  </span>
                ))}
              </div>
            </div>
            {detail.map((r) => renderRow(r, true))}
            {/* границы сцен, подсветка текущей, магнит, конец ролика и плейхед */}
            {sceneStarts.slice(1).map((s0, i) => (
              <div key={i} className="scene-border" style={{ left: LABEL_W + s0 * pps }} />
            ))}
            {curIndex >= 0 && <div className="scene-span" style={{ left: LABEL_W + curStart * pps, width: cur.duration * pps }} />}
            {snapAt !== null && <div className="snap-line" style={{ left: LABEL_W + snapAt * pps }} />}
            <div className="tl-end" style={{ left: LABEL_W + total * pps, right: 0 }} />
            <Playhead pps={pps} scrollRef={scrollRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

