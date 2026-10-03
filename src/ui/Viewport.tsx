import { useEffect, useRef, useState } from 'react';
import { EditorEngine } from './editorEngine';
import { useStore } from '../store';
import { DRAG_MIME, type DragPayload } from './Library';
import { addActor, addAudioClipFromAsset, addCameraKey, addProp } from '../ops';
import { DEFAULT_CAMERA } from '../engine/evaluate';
import type { CameraView } from '../types';

export const engineRef: { current: EditorEngine | null } = { current: null };

const PRESETS: { label: string; title: string; view: (v: CameraView) => CameraView }[] = [
  { label: 'Изо', title: 'Изометрия по умолчанию', view: (v) => ({ ...DEFAULT_CAMERA, target: v.target, zoom: v.zoom }) },
  { label: 'Спереди', title: 'Вид спереди', view: (v) => ({ ...v, azimuth: Math.PI / 4, elevation: 0.12 }) },
  { label: 'Сверху', title: 'Вид сверху', view: (v) => ({ ...v, elevation: Math.PI / 2 - 0.03 }) },
  { label: '⟲', title: 'Повернуть на 90°', view: (v) => ({ ...v, azimuth: v.azimuth + Math.PI / 2 }) },
];

export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0, x: 0, y: 0 });
  const [dropping, setDropping] = useState(false);
  const autoKey = useStore((s) => s.autoKey);
  const setAutoKey = useStore((s) => s.setAutoKey);
  const hasCamKeys = useStore((s) => {
    let start = 0;
    for (const sc of s.project.scenes) {
      if (s.time < start + sc.duration || sc === s.project.scenes[s.project.scenes.length - 1]) return sc.cameraKeys.length > 0;
      start += sc.duration;
    }
    return false;
  });

  useEffect(() => {
    const eng = new EditorEngine(hostRef.current!, glRef.current!, ovRef.current!);
    eng.onFrame = setFrame;
    setFrame(eng.frame);
    engineRef.current = eng;
    return () => {
      eng.dispose();
      engineRef.current = null;
    };
  }, []);

  const zoom = (k: number) => {
    const e = engineRef.current;
    if (!e) return;
    const v = e.currentView();
    e.setView({ ...v, zoom: Math.min(12, Math.max(0.15, v.zoom * k)) });
  };

  const onDrop = (e: React.DragEvent) => {
    setDropping(false);
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    e.preventDefault();
    const d = JSON.parse(raw) as DragPayload;
    const p = engineRef.current?.floorPoint(e);
    const at = p ? { x: p.x, z: p.z } : undefined;
    if (d.type === 'actor') addActor({ variant: d.variant, color: d.color, accessory: d.accessory, name: d.variant === 'woman' ? 'Она' : 'Он' }, at);
    else if (d.type === 'prop') addProp(d.kind, at);
    else if (d.type === 'audio') addAudioClipFromAsset(d.assetId);
  };

  return (
    <div
      className="viewport"
      ref={hostRef}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="frame-shadow" style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }} />
      <canvas ref={glRef} />
      <canvas ref={ovRef} className="ov" />
      <div className="vp-toolbar">
        <button
          className={'rec' + (autoKey ? ' on' : '')}
          onClick={() => setAutoKey(!autoKey)}
          title="Запись движения: перетаскивание персонажа ставит ключ в момент плейхеда. Выкл — двигает весь путь целиком."
        >
          ● Запись движения
        </button>
        <div className="sep" />
        {PRESETS.map((p) => (
          <button
            key={p.label}
            title={p.title}
            onClick={() => {
              const e = engineRef.current;
              if (e) e.setView(p.view(e.currentView()));
            }}
          >
            {p.label}
          </button>
        ))}
        <button title="Приблизить" onClick={() => zoom(1.25)}>
          ＋
        </button>
        <button title="Отдалить" onClick={() => zoom(0.8)}>
          －
        </button>
        <div className="sep" />
        <button
          title="Поставить ключ камеры в позиции плейхеда — камера будет плавно двигаться между ключами"
          onClick={() => {
            const e = engineRef.current;
            if (e) addCameraKey(e.currentView());
          }}
        >
          ◆ Ключ камеры
        </button>
      </div>
      <div className="vp-badge">
        <b>ЛКМ</b> по объекту — двигать · <b>ЛКМ</b> по полю — вращать камеру · <b>ПКМ</b> — панорама · <b>колесо</b> — зум · <b>Q/E</b> — поворот
        {hasCamKeys && <> · камера анимирована ключами</>}
      </div>
      {dropping && <div className="drop-hint" />}
    </div>
  );
}
