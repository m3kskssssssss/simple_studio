import type { Project, TextClip } from '../types';
import { clamp } from './evaluate';

const FADE = 0.45;

/** Прозрачность и цвет перехода между сценами в момент t. */
export function transitionAt(p: Project, t: number): { color: string; alpha: number } | null {
  let start = 0;
  for (let i = 0; i < p.scenes.length; i++) {
    const s = p.scenes[i];
    if (s.transition !== 'cut') {
      const d = Math.abs(t - start);
      if (d < FADE) {
        // у первой сцены — только проявление из цвета
        if (i === 0 && t < start) return null;
        return { color: s.transition === 'fade-black' ? '#000000' : '#ffffff', alpha: 1 - d / FADE };
      }
    }
    start += s.duration;
  }
  return null;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawText(ctx: CanvasRenderingContext2D, c: TextClip, t: number, w: number, h: number, band: number) {
  const local = t - c.start;
  const appear = clamp(Math.min(local / 0.25, (c.duration - local) / 0.25), 0, 1);
  if (appear <= 0) return;
  const unit = Math.min(w, h) / 1080;
  const base = c.style === 'title' ? 92 : c.style === 'caption' ? 52 : 60;
  const size = base * c.size * unit;
  const weight = c.style === 'title' ? 800 : 600;
  ctx.save();
  ctx.globalAlpha = appear;
  ctx.font = `${weight} ${size}px Inter, "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = c.text.split('\n');
  const lh = size * 1.22;
  const blockH = lines.length * lh;
  const margin = h * 0.08;
  let cy =
    band > 0
      ? c.position === 'top' ? band / 2 : c.position === 'bottom' ? h - band / 2 : h / 2
      : c.position === 'top' ? margin + blockH / 2 : c.position === 'bottom' ? h - margin - blockH / 2 : h / 2;
  cy += (1 - appear) * size * 0.3;
  if (c.style === 'caption') {
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const px = size * 0.6;
    const py = size * 0.35;
    ctx.fillStyle = 'rgba(20,22,28,0.72)';
    roundRect(ctx, w / 2 - tw / 2 - px, cy - blockH / 2 - py, tw + px * 2, blockH + py * 2, size * 0.4);
    ctx.fill();
  }
  ctx.fillStyle = c.color;
  if (c.style === 'plain') {
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = size * 0.15;
  }
  lines.forEach((l, i) => ctx.fillText(l, w / 2, cy - blockH / 2 + lh * (i + 0.5)));
  ctx.restore();
}

/** Высота плашки сверху/снизу, если включён квадратный кадр в вертикальном видео. */
export function bandHeight(p: Project, w: number, h: number) {
  return p.frameBands && h > w ? (h - w) / 2 : 0;
}

/** Нарисовать титры, плашки и переходы для момента t на холсте w×h. */
export function drawOverlay(ctx: CanvasRenderingContext2D, p: Project, t: number, w: number, h: number) {
  const band = bandHeight(p, w, h);
  // переход затемняет только картинку (квадрат), плашки и текст остаются
  const tr = transitionAt(p, t);
  if (tr && tr.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = tr.alpha;
    ctx.fillStyle = tr.color;
    ctx.fillRect(0, band, w, h - band * 2);
    ctx.restore();
  }
  if (band > 0) {
    ctx.fillStyle = p.frameBands!;
    ctx.fillRect(0, 0, w, band);
    ctx.fillRect(0, h - band, w, band);
  }
  for (const c of p.texts) {
    if (t >= c.start && t < c.start + c.duration) drawText(ctx, c, t, w, h, band);
  }
}
