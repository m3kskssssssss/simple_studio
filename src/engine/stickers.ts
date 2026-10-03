/** Стикеры поверх кадра: эмодзи и векторные фигуры. Рисуются в квадрат size×size с центром в (0,0). */
export interface StickerDef {
  id: string;
  label: string;
  emoji?: string;
  /** Фигуре можно менять цвет. */
  color?: string;
  draw?: (ctx: CanvasRenderingContext2D, s: number, color: string) => void;
}

const EMOJI = '😀 😂 😍 😎 🤔 😭 😡 🥳 😱 🤯 👍 👏 🙌 👀 🔥 💯 ❤️ 💔 ⭐ ✨ 🎉 💥 💤 💬 ❓ ❗ 🎵 ☀️ 🌧️ 🌸 🍕 ☕ 🚗 🏠 📱 💡'.split(' ');

function star(ctx: CanvasRenderingContext2D, r: number, inner: number, n: number) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

const SHAPES: StickerDef[] = [
  {
    id: 'heart', label: 'Сердце', color: '#e0344b',
    draw: (ctx, s, c) => {
      const r = s / 2;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.75);
      ctx.bezierCurveTo(-r * 1.15, -r * 0.05, -r * 0.65, -r * 0.95, 0, -r * 0.42);
      ctx.bezierCurveTo(r * 0.65, -r * 0.95, r * 1.15, -r * 0.05, 0, r * 0.75);
      ctx.fillStyle = c;
      ctx.fill();
    },
  },
  {
    id: 'star', label: 'Звезда', color: '#f5c518',
    draw: (ctx, s, c) => {
      star(ctx, s / 2, 0.45, 5);
      ctx.fillStyle = c;
      ctx.fill();
    },
  },
  {
    id: 'burst', label: 'Бум', color: '#ff6a2b',
    draw: (ctx, s, c) => {
      star(ctx, s / 2, 0.68, 12);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.lineWidth = s * 0.03;
      ctx.strokeStyle = '#111';
      ctx.stroke();
    },
  },
  {
    id: 'bubble', label: 'Реплика', color: '#ffffff',
    draw: (ctx, s, c) => {
      const w = s * 0.92;
      const h = s * 0.62;
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.08, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.moveTo(-s * 0.12, s * 0.15);
      ctx.lineTo(-s * 0.3, s * 0.42);
      ctx.lineTo(s * 0.06, s * 0.2);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.lineWidth = s * 0.035;
      ctx.strokeStyle = '#111';
      ctx.stroke();
    },
  },
  {
    id: 'arrow', label: 'Стрелка', color: '#ffffff',
    draw: (ctx, s, c) => {
      const r = s / 2;
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.18);
      ctx.lineTo(r * 0.2, -r * 0.18);
      ctx.lineTo(r * 0.2, -r * 0.5);
      ctx.lineTo(r, 0);
      ctx.lineTo(r * 0.2, r * 0.5);
      ctx.lineTo(r * 0.2, r * 0.18);
      ctx.lineTo(-r, r * 0.18);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.lineWidth = s * 0.035;
      ctx.strokeStyle = '#111';
      ctx.stroke();
    },
  },
  {
    id: 'ring', label: 'Обвести', color: '#e0344b',
    draw: (ctx, s, c) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.46, s * 0.4, -0.15, 0.1, Math.PI * 2.05);
      ctx.lineWidth = s * 0.06;
      ctx.lineCap = 'round';
      ctx.strokeStyle = c;
      ctx.stroke();
    },
  },
  {
    id: 'check', label: 'Галочка', color: '#2fb35a',
    draw: (ctx, s, c) => {
      ctx.beginPath();
      ctx.moveTo(-s * 0.38, 0);
      ctx.lineTo(-s * 0.1, s * 0.3);
      ctx.lineTo(s * 0.4, -s * 0.32);
      ctx.lineWidth = s * 0.14;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = c;
      ctx.stroke();
    },
  },
  {
    id: 'cross', label: 'Крестик', color: '#e0344b',
    draw: (ctx, s, c) => {
      ctx.beginPath();
      ctx.moveTo(-s * 0.32, -s * 0.32);
      ctx.lineTo(s * 0.32, s * 0.32);
      ctx.moveTo(s * 0.32, -s * 0.32);
      ctx.lineTo(-s * 0.32, s * 0.32);
      ctx.lineWidth = s * 0.14;
      ctx.lineCap = 'round';
      ctx.strokeStyle = c;
      ctx.stroke();
    },
  },
  {
    id: 'sparkle', label: 'Блеск', color: '#ffffff',
    draw: (ctx, s, c) => {
      star(ctx, s / 2, 0.18, 4);
      ctx.fillStyle = c;
      ctx.fill();
    },
  },
];

export const STICKERS: StickerDef[] = [...SHAPES, ...EMOJI.map((e, i) => ({ id: 'e' + i, label: e, emoji: e }))];
export const STICKER_MAP: Record<string, StickerDef> = Object.fromEntries(STICKERS.map((s) => [s.id, s]));

export function drawSticker(ctx: CanvasRenderingContext2D, id: string, size: number, color?: string) {
  const def = STICKER_MAP[id];
  if (!def) return;
  if (def.emoji) {
    ctx.font = `${size * 0.86}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.emoji, 0, size * 0.04);
  } else def.draw!(ctx, size, color ?? def.color ?? '#ffffff');
}
