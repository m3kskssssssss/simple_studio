import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './fonts-local';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.DEV) {
  // хук для автотестов/отладки из консоли
  void Promise.all([import('./store'), import('./ui/Viewport'), import('./engine/evaluate'), import('three')]).then(([store, vp, ev, THREE]) => {
    (window as unknown as Record<string, unknown>).__studio = {
      store: store.useStore,
      /** Экранные координаты персонажа в текущий момент. */
      actorScreen(name: string) {
        const s = store.useStore.getState();
        const at = ev.sceneAt(s.project, s.time);
        const a = at.scene.actors.find((x) => x.name === name)!;
        const st = ev.evaluateActor(a, at.local);
        const eng = vp.engineRef.current!;
        const v = new THREE.Vector3(st.x, st.y + 0.9, st.z).project(eng.cam);
        const r = eng.renderer.domElement.getBoundingClientRect();
        return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
      },
      /** Экранные координаты декорации (первой с таким kind). */
      propScreen(kind: string) {
        const s = store.useStore.getState();
        const at = ev.sceneAt(s.project, s.time);
        const p = at.scene.props.find((x) => x.kind === kind)!;
        const st = ev.evaluateProp(p, at.local, true);
        const eng = vp.engineRef.current!;
        const v = new THREE.Vector3(st.x, st.y + 0.7, st.z).project(eng.cam);
        const r = eng.renderer.domElement.getBoundingClientRect();
        return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
      },
    };
  });
}
