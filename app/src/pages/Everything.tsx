/* Everything — the whole brain: search, filter by kind/world, show done.
   Also home of backup: export the brain to a file, import one back. */
import { useRef, useState } from 'react';
import type { Brain } from '../lib/store';
import type { Kind, Context } from '../lib/parse';
import { ItemRow } from '../components/ItemRow';

export function Everything({ brain, onToggle, onSnooze, onDelete, onNotice }: {
  brain: Brain;
  onToggle: (id: string) => void;
  onSnooze: (id: string) => void;
  onDelete: (id: string) => void;
  onNotice: (msg: string) => void;
}) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [ctx, setCtx] = useState<Context | 'all'>('all');
  const [showDone, setShowDone] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const items = brain.find({ q, kind, context: ctx, showDone });

  function exportBrain() {
    const blob = new Blob([brain.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `the-brain-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    onNotice('Backup downloaded');
  }
  async function importBrain(f: File | undefined) {
    if (!f) return;
    const added = brain.importJSON(await f.text());
    onNotice(added < 0 ? "That file isn't a Brain backup" : added === 0 ? 'Nothing new in that backup' : `Restored ${added} item${added !== 1 ? 's' : ''}`);
  }

  return (
    <div>
      <div className="filters">
        <input className="search" type="search" placeholder="Search everything…" aria-label="Search"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="filters">
        <div className="chip-row" role="group" aria-label="Type">
          {(['all', 'task', 'note'] as const).map((k) => (
            <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === 'all' ? 'All' : k === 'task' ? 'To-dos' : 'Notes'}
            </button>
          ))}
        </div>
        <div className="chip-row" role="group" aria-label="World">
          {(['all', 'personal', 'business'] as const).map((c) => (
            <button key={c} className="chip" aria-pressed={ctx === c} onClick={() => setCtx(c)}>
              {c === 'all' ? 'Both' : c[0].toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
        <button className="chip" aria-pressed={showDone} onClick={() => setShowDone(!showDone)}>Done too</button>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <span className="big" aria-hidden>🗂️</span>
          {q ? <>Nothing matches “{q}”.</> : 'Nothing here yet — capture your first thought.'}
        </div>
      ) : (
        <div className="card">
          {items.map((i) => <ItemRow key={i.id} item={i} onToggle={onToggle} onSnooze={onSnooze} onDelete={onDelete} />)}
        </div>
      )}

      <div className="section-label">Backup</div>
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn ghost" onClick={exportBrain}>Download backup</button>
        <button className="btn ghost" onClick={() => file.current?.click()}>Restore from backup</button>
        <input ref={file} type="file" accept="application/json" style={{ display: 'none' }}
          onChange={(e) => importBrain(e.target.files?.[0])} />
        <p className="hint" style={{ flexBasis: '100%' }}>
          Your brain lives on this device only — nothing is uploaded anywhere.
          Download a backup now and then, and keep it somewhere safe (email it
          to yourself or drop it in your cloud drive).
        </p>
      </div>
    </div>
  );
}
