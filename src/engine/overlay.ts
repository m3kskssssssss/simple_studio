import type { Overlay, Project, TextClip } from '../types';
import { clamp, sceneAt } from './evaluate';
import { fontCss } from './fonts';
import { drawFilterLayers, filterAt } from './filters';
import { mediaSource } from './media';
import { drawSticker } from './stickers';
import { trackFlags } from '../tracks';

const FADE = 0.45;

/** Прозрачность и цвет перехода между сценами в момент t. */
export function transitionAt(p: Project, t: number): { color: string; alpha: number } | null {
  let start = 0;
  for (let i = 0; i < p.scenes.length; i++) {
    const s = p.scenes[i];
    if (s.transition !== 'cut') {
      const d = Math.abs(t - start);
      if (d < FADE) {
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

/** Высота плашки сверху/снизу, если включён квадратный кадр в вертикальном видео. */
export function bandHeight(p: Project, w: number, h: number) {
  return p.frameBands && h > w ? (h - w) / 2 : 0;
}

// ---------- зоны попадания (для редактора) ----------

export interface HitBox {
  id: string;
  kind: 'overlay' | 'text';
  /** Центр и размеры в пикселях холста, поворот в радианах. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

export interface DrawOptions {
  /** Отрендеренная 3D-картинка (экспорт); в редакторе 3D лежит под холстом. */
  base?: CanvasImageSource | null;
  /** Собирать зоны попадания. */
  hits?: HitBox[];
  /** Нарисовать рамку выделения вокруг объекта. */
  selectedId?: string | null;
}

const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** Анимация появления: альфа, масштаб, сдвиг по y (доли высоты), доп. поворот. */
function animState(anim: string, local: number, dur: number) {
  const inK = clamp(local / 0.35, 0, 1);
  const outK = clamp((dur - local) / 0.3, 0, 1);
  let alpha = 1;
  let scale = 1;
  let dy = 0;
  let rot = 0;
  switch (anim) {
    case 'fade':
      alpha = Math.min(inK, outK);
      break;
    case 'pop':
      scale = Math.min(inK < 1 ? Math.max(0.01, easeOutBack(inK)) : 1, 0.6 + 0.4 * outK);
      alpha = Math.min(1, inK * 3, outK * 2);
      break;
    case 'slide':
      dy = (1 - easeOutBack(inK)) * 0.08 + (1 - outK) * 0.05;
      alpha = Math.min(inK * 2, outK);
      break;
    case 'pulse':
      scale = 1 + 0.07 * Math.sin(local * Math.PI * 4);
      alpha = Math.min(1, inK * 3, outK * 3);
      break;
    case 'bounce':
      dy = -Math.abs(Math.sin(local * Math.PI * 2.2)) * 0.035;
      alpha = Math.min(1, inK * 3, outK * 3);
      break;
    case 'spin':
      rot = local * Math.PI;
      alpha = Math.min(1, inK * 3, outK * 3);
      break;
    case 'wiggle':
      rot = 0.14 * Math.sin(local * 11);
      alpha = Math.min(1, inK * 3, outK * 3);
      break;
  }
  return { alpha, scale, dy, rot };
}

// ---------- слои ----------

function drawOverlayItem(ctx: CanvasRenderingContext2D, p: Project, o: Overlay, t: number, w: number, h: number, hits?: HitBox[]) {
  const local = t - o.start;
  const a = animState(o.anim, local, o.duration);
  const bw = o.scale * w;
  let bh = bw;
  let src: CanvasImageSource | null = null;
  if (o.type === 'media') {
    const asset = p.mediaAssets.find((m) => m.id === o.assetId);
    if (!asset) return;
    bh = (bw * asset.height) / Math.max(1, asset.width);
    src = mediaSource(asset.id);
  }
  const cx = o.x * w;
  const cy = (o.y + a.dy) * h;
  const rot = (o.rotation * Math.PI) / 180 + a.rot;
  hits?.push({ id: o.id, kind: 'overlay', cx, cy, w: bw * a.scale, h: bh * a.scale, rot });
  ctx.save();
  ctx.globalAlpha = clamp(o.opacity * a.alpha, 0, 1);
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(a.scale, a.scale);
  if (o.type === 'media') {
    if (src) ctx.drawImage(src, -bw / 2, -bh / 2, bw, bh);
    else {
      ctx.fillStyle = 'rgba(128,128,128,0.35)';
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    }
  } else {
    ctx.filter = 'none';
    drawSticker(ctx, o.sticker!, bw, o.color);
  }
  ctx.restore();
}

/** Позиция и разметка текстового блока. */
function textLayout(ctx: CanvasRenderingContext2D, c: TextClip, w: number, h: number, band: number) {
  const unit = Math.min(w, h) / 1080;
  const base = c.style === 'title' ? 92 : c.style === 'caption' ? 52 : 60;
  const size = base * c.size * unit;
  ctx.font = fontCss(c, size);
  const lines = c.text.split('\n');
  const lh = size * 1.22;
  const blockH = lines.length * lh;
  const spacing = (c.letterSpacing ?? 0) * size;
  const widths = lines.map((l) => ctx.measureText(l).width + spacing * Math.max(0, l.length - 1));
  const blockW = Math.max(1, ...widths);
  const margin = h * 0.08;
  let cx = w / 2;
  let cy: number;
  if (c.x !== undefined && c.y !== undefined) {
    cx = c.x * w;
    cy = c.y * h;
  } else if (band > 0) cy = c.position === 'top' ? band / 2 : c.position === 'bottom' ? h - band / 2 : h / 2;
  else cy = c.position === 'top' ? margin + blockH / 2 : c.position === 'bottom' ? h - margin - blockH / 2 : h / 2;
  return { size, lines, lh, blockH, blockW, widths, cx, cy, spacing };
}

/** Центр текстового блока в долях кадра (для перетаскивания). */
export function textCenter(c: TextClip, p: Project, w: number, h: number) {
  const ctx = document.createElement('canvas').getContext('2d')!;
  const L = textLayout(ctx, c, w, h, bandHeight(p, w, h));
  return { x: L.cx / w, y: L.cy / h };
}

function drawText(ctx: CanvasRenderingContext2D, c: TextClip, t: number, w: number, h: number, band: number, hits?: HitBox[]) {
  const local = t - c.start;
  const anim = c.anim ?? 'fade';
  const a = animState(anim === 'type' ? 'fade' : anim, local, c.duration);
  if (a.alpha <= 0) return;
  ctx.save();
  const L = textLayout(ctx, c, w, h, band);
  const align = c.align ?? 'center';
  const padX = L.size * 0.6;
  const padY = L.size * 0.35;
  hits?.push({ id: c.id, kind: 'text', cx: L.cx, cy: L.cy, w: L.blockW + padX * 2, h: L.blockH + padY * 2, rot: 0 });
  ctx.globalAlpha = a.alpha;
  ctx.translate(L.cx, L.cy + a.dy * h);
  ctx.scale(a.scale, a.scale);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  // подложка
  const bg = c.bg !== undefined ? c.bg : c.style === 'caption' ? '#14161c' : null;
  if (bg) {
    ctx.save();
    ctx.globalAlpha = a.alpha * (c.bgOpacity ?? (c.style === 'caption' ? 0.72 : 1));
    ctx.fillStyle = bg;
    roundRect(ctx, -L.blockW / 2 - padX, -L.blockH / 2 - padY, L.blockW + padX * 2, L.blockH + padY * 2, L.size * 0.4);
    ctx.fill();
    ctx.restore();
  }
  // печатная машинка: сколько символов уже видно
  const total = c.text.replace(/\n/g, '').length;
  let budget = anim === 'type' ? Math.floor(total * clamp(local / Math.min(1.4, c.duration * 0.6), 0, 1)) : Infinity;
  if (c.shadow ?? c.style === 'plain') {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = L.size * 0.18;
    ctx.shadowOffsetY = L.size * 0.04;
  }
  L.lines.forEach((line, i) => {
    const shown = budget === Infinity ? line : line.slice(0, Math.max(0, budget));
    if (budget !== Infinity) budget -= line.length;
    const lw = L.widths[i];
    const x0 = align === 'left' ? -L.blockW / 2 : align === 'right' ? L.blockW / 2 - lw : -lw / 2;
    const y = -L.blockH / 2 + L.lh * (i + 0.5);
    const drawRun = (fn: (s: string, x: number) => void) => {
      if (!L.spacing) return fn(shown, x0);
      let x = x0;
      for (const ch of shown) {
        fn(ch, x);
        x += ctx.measureText(ch).width + L.spacing;
      }
    };
    if (c.stroke && (c.strokeWidth ?? 0) > 0) {
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.lineJoin = 'round';
      ctx.lineWidth = (c.strokeWidth ?? 0) * L.size * 0.12;
      ctx.strokeStyle = c.stroke;
      drawRun((s, x) => ctx.strokeText(s, x, y));
      ctx.restore();
    }
    ctx.fillStyle = c.color;
    drawRun((s, x) => ctx.fillText(s, x, y));
  });
  ctx.restore();
}

function drawSelection(ctx: CanvasRenderingContext2D, b: HitBox) {
  const k = Math.max(1, ctx.canvas.width / 1000);
  ctx.save();
  ctx.translate(b.cx, b.cy);
  ctx.rotate(b.rot);
  ctx.lineWidth = 1.5 * k;
  ctx.setLineDash([6 * k, 4 * k]);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
  ctx.strokeStyle = '#000000';
  ctx.lineDashOffset = 5 * k;
  ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
  ctx.setLineDash([]);
  // ручка масштаба в правом нижнем углу
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.beginPath();
  ctx.arc(b.w / 2, b.h / 2, 7 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Весь 2D-слой кадра в момент t: фон пустого кадра / 3D-картинка, медиа под фильтрами,
 * виньетка и зерно, переход, плашки, стикеры и текст.
 */
export function drawOverlay(ctx: CanvasRenderingContext2D, p: Project, t: number, w: number, h: number, opts: DrawOptions = {}) {
  const band = bandHeight(p, w, h);
  const at = sceneAt(p, t);
  const fx = filterAt(p, t, h / 1080);
  const active = (o: { start: number; duration: number }) => t >= o.start && t < o.start + o.duration;

  // 1. база: пустой кадр или 3D
  ctx.save();
  ctx.filter = fx.css;
  if (at.index >= 0 && at.scene.kind === 'blank') {
    ctx.fillStyle = at.scene.background;
    ctx.fillRect(0, 0, w, h);
  } else if (opts.base) ctx.drawImage(opts.base, 0, 0, w, h);
  ctx.restore();
  // 2. переход между сценами (затемняет основную дорожку)
  const tr = transitionAt(p, t);
  if (tr && tr.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = tr.alpha;
    ctx.fillStyle = tr.color;
    ctx.fillRect(0, band, w, h - band * 2);
    ctx.restore();
  }

  // плашки квадратного кадра: фото/видео обрезаются по квадрату, текст и стикеры могут лежать на плашках
  if (band > 0) {
    ctx.fillStyle = p.frameBands!;
    ctx.fillRect(0, 0, w, band);
    ctx.fillRect(0, h - band, w, band);
  }

  // 3. дорожки снизу вверх: выше — поверх (как в CapCut)
  type Item = { track: number; order: number; draw: () => void; media: boolean };
  const items: Item[] = [];
  let order = 0;
  for (const o of p.overlays ?? []) {
    if (!active(o) || trackFlags(p, 'visual', o.track ?? 0).hidden) continue;
    items.push({
      track: o.track ?? 0,
      order: order++,
      media: o.type === 'media',
      draw: () => {
        ctx.save();
        // фильтры действуют на фото и видео, не на стикеры и текст
        if (o.type === 'media') {
          ctx.filter = fx.css;
          if (band > 0) {
            ctx.beginPath();
            ctx.rect(0, band, w, h - band * 2);
            ctx.clip();
          }
        }
        drawOverlayItem(ctx, p, o, t, w, h, opts.hits);
        ctx.restore();
      },
    });
  }
  for (const c of p.texts) {
    if (!active(c) || trackFlags(p, 'visual', c.track ?? 0).hidden) continue;
    items.push({ track: c.track ?? 0, order: order++, media: false, draw: () => drawText(ctx, c, t, w, h, band, opts.hits) });
  }
  items.sort((a, b) => a.track - b.track || a.order - b.order);
  // виньетка и зерно — над самым верхним фото/видео (или над базой)
  let lastMedia = -1;
  items.forEach((it, i) => it.media && (lastMedia = i));
  // (если фото/видео нет — сразу над базой)
  if (lastMedia < 0) drawFilterLayers(ctx, fx, t, w, band, h - band * 2);
  items.forEach((it, i) => {
    it.draw();
    if (i === lastMedia) drawFilterLayers(ctx, fx, t, w, band, h - band * 2);
  });


  if (opts.selectedId && opts.hits) {
    const b = opts.hits.find((x) => x.id === opts.selectedId);
    if (b) drawSelection(ctx, b);
  }
}
