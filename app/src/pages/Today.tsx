/* Today — the answer to "what needs me right now?" Opens first.
   Overdue at the top (honest, not hidden), then due today, then
   important undated things. Done = it disappears from here. */
import type { Brain } from '../lib/store';
import { ItemRow } from '../components/ItemRow';

export function Today({ brain, onToggle, onSnooze, onDelete, onGoCapture }: {
  brain: Brain;
  onToggle: (id: string) => void;
  onSnooze: (id: string) => void;
  onDelete: (id: string) => void;
  onGoCapture: () => void;
}) {
  const { overdue, due, pinned } = brain.today();
  const counts = brain.counts();
  const empty = overdue.length === 0 && due.length === 0 && pinned.length === 0;

  return (
    <div>
      <div className="stat-row" role="status" aria-label="Summary">
        <div className="stat"><div className="n">{counts.openTasks}</div><div className="k">to do</div></div>
        <div className="stat"><div className="n">{counts.doneToday}</div><div className="k">done today</div></div>
        <div className="stat"><div className="n">{counts.notes}</div><div className="k">notes</div></div>
      </div>

      {empty ? (
        <div className="empty">
          <span className="big" aria-hidden>☀️</span>
          Nothing needs you today.
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={onGoCapture}>Add something</button>
          </div>
        </div>
      ) : (
        <>
          {overdue.length > 0 && (
            <>
              <div className="section-label danger">Catch up</div>
              <div className="card">
                {overdue.map((i) => <ItemRow key={i.id} item={i} onToggle={onToggle} onSnooze={onSnooze} onDelete={onDelete} />)}
              </div>
            </>
          )}
          {due.length > 0 && (
            <>
              <div className="section-label">Today</div>
              <div className="card">
                {due.map((i) => <ItemRow key={i.id} item={i} onToggle={onToggle} onSnooze={onSnooze} onDelete={onDelete} />)}
              </div>
            </>
          )}
          {pinned.length > 0 && (
            <>
              <div className="section-label">Important</div>
              <div className="card">
                {pinned.map((i) => <ItemRow key={i.id} item={i} onToggle={onToggle} onSnooze={onSnooze} onDelete={onDelete} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
