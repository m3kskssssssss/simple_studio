import { useEffect, useState } from 'react';
import { TopBar } from './TopBar';
import { Home } from './Home';
import { Library } from './Library';
import { Viewport } from './Viewport';
import { Inspector } from './Inspector';
import { Timeline } from './Timeline';
import { ExportDialog } from './ExportDialog';
import { useStore } from '../store';
import { copySelection, deleteSelection, duplicateSelection, moveSelectionTrack, pasteClip, rotateSelected, splitAtPlayhead } from '../ops';

export function App() {
  const [exporting, setExporting] = useState(false);
  const [tlHeight, setTlHeight] = useState(360);
  const [libW, setLibW] = useState(() => {
    try {
      return Number(localStorage.getItem('simple-studio:lib-w')) || 300;
    } catch {
      return 300;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('simple-studio:lib-w', String(libW));
    } catch {
      /* ignore */
    }
  }, [libW]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const s = useStore.getState();
      if (s.view !== 'editor') return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        s.setPlaying(!s.playing);
      } else if (mod && (k === 'z' || k === 'я')) {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
      } else if (mod && (k === 'y' || k === 'н')) {
        e.preventDefault();
        s.redo();
      } else if (mod && (e.key === ']' || e.key === 'ъ')) {
        if (moveSelectionTrack(1)) e.preventDefault();
      } else if (mod && (e.key === '[' || e.key === 'х')) {
        if (moveSelectionTrack(-1)) e.preventDefault();
      } else if (mod && (k === 'c' || k === 'с')) {
        if (copySelection()) e.preventDefault();
      } else if (mod && (k === 'v' || k === 'м')) {
        if (pasteClip()) e.preventDefault();
      } else if (mod && (k === 'd' || k === 'в')) {
        e.preventDefault();
        duplicateSelection();
      } else if (k === 'delete' || k === 'backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (k === 'q' || k === 'й') {
        rotateSelected(Math.PI / 12);
      } else if (k === 'e' || k === 'у') {
        rotateSelected(-Math.PI / 12);
      } else if (k === 's' && !mod) {
        splitAtPlayhead();
      } else if (k === 'home') {
        s.seek(0);
      } else if (k === 'arrowleft') {
        s.seek(s.time - (e.shiftKey ? 1 : 1 / s.project.fps));
      } else if (k === 'arrowright') {
        s.seek(s.time + (e.shiftKey ? 1 : 1 / s.project.fps));
      } else if (k === 'escape') {
        s.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const view = useStore((s) => s.view);
  if (view === 'home') return <Home />;

  return (
    <div className="app" style={{ ['--tl-h' as string]: tlHeight + 'px', ['--lib-w' as string]: libW + 'px' }}>
      <TopBar onExport={() => setExporting(true)} />
      <Library width={libW} onResize={setLibW} />
      <Viewport />
      <Inspector />
      <Timeline height={tlHeight} onResize={setTlHeight} />
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </div>
  );
}
