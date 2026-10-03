import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { exportVideo } from '../export/exporter';
import { totalDuration } from '../engine/evaluate';
import { ASPECTS } from '../project';
import { download } from './TopBar';

const QUALITIES = [
  { id: '720', label: '720p', short: 720 },
  { id: '1080', label: '1080p', short: 1080 },
  { id: '1440', label: '1440p (2K)', short: 1440 },
];

function sizeFor(aspect: number, short: number) {
  const even = (v: number) => Math.round(v / 2) * 2;
  return aspect >= 1 ? { width: even(short * aspect), height: short } : { width: short, height: even(short / aspect) };
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const [quality, setQuality] = useState('1080');
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const aspect = ASPECTS[project.aspect];
  const q = QUALITIES.find((x) => x.id === quality)!;
  const size = sizeFor(aspect, q.short);
  const dur = totalDuration(project);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => void (result && URL.revokeObjectURL(result.url)), [result]);

  const start = async () => {
    useStore.getState().setPlaying(false);
    setState('running');
    setProgress(0);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      let attached = false;
      const res = await exportVideo(
        project,
        { ...size, fps: project.fps },
        (f, canvas) => {
          setProgress(f);
          if (!attached && previewRef.current) {
            previewRef.current.innerHTML = '';
            previewRef.current.appendChild(canvas);
            attached = true;
          }
        },
        ac.signal,
      );
      const name = `${project.name || 'video'}.${res.ext}`;
      setResult({ url: URL.createObjectURL(res.blob), name, size: res.blob.size });
      download(res.blob, name);
      setState('done');
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setState('idle');
        return;
      }
      console.error(e);
      setError((e as Error).message);
      setState('error');
    }
  };

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && state !== 'running' && onClose()}>
      <div className="modal">
        <h2>Экспорт видео</h2>
        {state === 'idle' && (
          <>
            <div className="field">
              <label>Качество</label>
              <div className="seg">
                {QUALITIES.map((x) => (
                  <button key={x.id} className={quality === x.id ? 'active' : ''} onClick={() => setQuality(x.id)}>
                    {x.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="hint" style={{ lineHeight: 1.7 }}>
              {size.width}×{size.height} · {project.fps} fps · {dur.toFixed(1)} с · {project.scenes.length} сцен ·{' '}
              {project.audioClips.length ? `${project.audioClips.length} аудиоклипов` : 'без звука'}
              <br />
              Видео рендерится покадрово в MP4 (H.264 + AAC), поэтому результат не зависит от скорости компьютера.
            </div>
          </>
        )}
        {state !== 'idle' && (
          <>
            <div className="preview" style={{ aspectRatio: `${size.width} / ${size.height}`, maxHeight: 300 }} ref={previewRef} />
            <div className="progress">
              <div style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              {state === 'running' && `Рендер… ${Math.round(progress * 100)}%`}
              {state === 'done' && result && (
                <>
                  Готово: {result.name} ({(result.size / 1024 / 1024).toFixed(1)} МБ).{' '}
                  <a href={result.url} download={result.name} style={{ color: 'var(--accent)' }}>
                    Скачать ещё раз
                  </a>
                </>
              )}
              {state === 'error' && <span style={{ color: 'var(--rec)' }}>Ошибка: {error}</span>}
            </div>
          </>
        )}
        <div className="actions">
          {state === 'running' ? (
            <button onClick={() => abortRef.current?.abort()}>Отмена</button>
          ) : (
            <button onClick={onClose}>Закрыть</button>
          )}
          {(state === 'idle' || state === 'error') && (
            <button className="primary" disabled={dur <= 0} title={dur <= 0 ? 'В проекте нет сцен' : undefined} onClick={() => void start()}>
              Начать рендер
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
