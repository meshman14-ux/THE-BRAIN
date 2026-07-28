/* THE BRAIN — shell: header, three tabs (Today / Capture / Everything),
   undo toast for deletes, store subscription. */
import { useEffect, useState, useRef } from 'react';
import { brain, type Item } from './lib/store';
import { Today } from './pages/Today';
import { Capture } from './pages/Capture';
import { Everything } from './pages/Everything';

type Tab = 'today' | 'capture' | 'everything';

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [, force] = useState(0);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => brain.subscribe(() => force((n) => n + 1)), []);

  function notice(msg: string, undo?: () => void) {
    clearTimeout(toastTimer.current);
    setToast({ msg, undo });
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }

  const onToggle = (id: string) => { brain.toggleDone(id); };
  const onSnooze = (id: string) => {
    const i = brain.snooze(id);
    if (i) notice('Pushed back');
  };
  const onDelete = (id: string) => {
    const gone = brain.all().find((i) => i.id === id);
    if (!gone) return;
    brain.remove(id);
    notice('Deleted', () => { restore(gone); });
  };
  function restore(item: Item) {
    // Re-insert via import path (id-safe merge), then clear the toast.
    brain.importJSON(JSON.stringify({ app: 'the-brain', version: 1, items: [item] }));
    setToast(null);
  }
  const onSave = (raw: string) => {
    const item = brain.capture(raw);
    if (item) notice(item.kind === 'note' ? 'Note saved' : item.due ? 'To-do saved & dated' : 'To-do saved');
  };

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="app">
      <header className="hdr">
        <h1>{tab === 'today' ? 'Today' : tab === 'capture' ? 'Capture' : 'Everything'}</h1>
        <span className="sub">{today}</span>
      </header>

      <main>
        {tab === 'today' && (
          <Today brain={brain} onToggle={onToggle} onSnooze={onSnooze} onDelete={onDelete} onGoCapture={() => setTab('capture')} />
        )}
        {tab === 'capture' && <Capture onSave={onSave} />}
        {tab === 'everything' && (
          <Everything brain={brain} onToggle={onToggle} onSnooze={onSnooze} onDelete={onDelete} onNotice={notice} />
        )}
      </main>

      {toast && (
        <div className="toast" role="status">
          {toast.msg}
          {toast.undo && <button onClick={toast.undo}>Undo</button>}
        </div>
      )}

      <nav className="tabbar" aria-label="Main">
        <button aria-current={tab === 'today'} onClick={() => setTab('today')}>
          <span className="glyph" aria-hidden>☀️</span>Today
        </button>
        <button className="capture-btn" aria-current={tab === 'capture'} onClick={() => setTab('capture')}>
          + Capture
        </button>
        <button aria-current={tab === 'everything'} onClick={() => setTab('everything')}>
          <span className="glyph" aria-hidden>🗂️</span>Everything
        </button>
      </nav>
    </div>
  );
}
