// Отладка: пересечения во всех шаблонах и демо-проекте (/check.html)
import { TEMPLATES } from './templates';
import { demoProject } from './project';
import { checkScene } from './collide';

const out: Record<string, string[]> = {};
for (const t of TEMPLATES) out['Шаблон ' + t.name] = checkScene(t.build()).map((h) => `${h.t.toFixed(2)}s  ${h.a} × ${h.b}`);
for (const s of demoProject().scenes) out['Демо ' + s.name] = checkScene(s).map((h) => `${h.t.toFixed(2)}s  ${h.a} × ${h.b}`);
document.body.textContent = Object.entries(out).map(([k, v]) => `== ${k}: ${v.length}\n${v.join('\n')}`).join('\n\n');
(window as unknown as Record<string, unknown>).__report = out;
