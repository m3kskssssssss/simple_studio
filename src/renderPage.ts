// Отладка: чистый покадровый рендер шаблона (/render.html?tpl=Вечеринка&w=640&h=360)
import { TEMPLATES } from './templates';
import { FrameRenderer } from './export/exporter';
import type { Project } from './types';

const q = new URLSearchParams(location.search);
const tpl = TEMPLATES.find((t) => t.name === (q.get('tpl') ?? 'Вечеринка'))!;
const w = Number(q.get('w') ?? 640);
const h = Number(q.get('h') ?? 360);
const scene = tpl.build();
const project: Project = { version: 1, name: tpl.name, aspect: '16:9', fps: 30, scenes: [scene], texts: [], audioAssets: [], audioClips: [], mediaAssets: [], overlays: [], filters: [] };
const fr = new FrameRenderer(project, w, h);
document.body.appendChild(fr.out);
const g = window as unknown as Record<string, unknown>;
g.__duration = scene.duration;
g.frame = async (t: number) => {
  await fr.render(t);
  return fr.out.toDataURL('image/png');
};
