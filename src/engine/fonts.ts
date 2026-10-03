import type { Project, TextClip } from '../types';

/** Шрифты с кириллицей (Google Fonts, подключены в index.html). */
export const FONTS: { id: string; label: string }[] = [
  { id: 'Inter', label: 'Inter' },
  { id: 'Montserrat', label: 'Montserrat' },
  { id: 'Rubik', label: 'Rubik' },
  { id: 'Unbounded', label: 'Unbounded' },
  { id: 'Oswald', label: 'Oswald' },
  { id: 'Russo One', label: 'Russo One' },
  { id: 'Playfair Display', label: 'Playfair Display' },
  { id: 'PT Serif', label: 'PT Serif' },
  { id: 'Lobster', label: 'Lobster' },
  { id: 'Caveat', label: 'Caveat' },
  { id: 'Comfortaa', label: 'Comfortaa' },
  { id: 'Amatic SC', label: 'Amatic SC' },
  { id: 'Press Start 2P', label: 'Press Start 2P' },
  { id: 'JetBrains Mono', label: 'JetBrains Mono' },
];

export const DEFAULT_FONT = 'Inter';

export function fontCss(c: TextClip, sizePx: number) {
  const weight = c.bold === true ? 800 : c.bold === false ? 400 : c.style === 'title' ? 800 : 600;
  return `${c.italic ? 'italic ' : ''}${weight} ${sizePx}px "${c.font ?? DEFAULT_FONT}", Inter, "Segoe UI", system-ui, sans-serif`;
}

/** Дождаться загрузки шрифтов, используемых в проекте (перед экспортом). */
export async function ensureFonts(p: Project) {
  if (!document.fonts) return;
  await Promise.all(
    p.texts.map((c) => document.fonts.load(fontCss(c, 40), c.text || 'Аб').catch(() => undefined)),
  );
}
