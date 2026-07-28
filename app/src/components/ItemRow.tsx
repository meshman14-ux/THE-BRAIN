/* One row anywhere an item appears: tick (tasks), title, badges, actions. */
import type { Item } from '../lib/store';
import { humanDate, todayISO } from '../lib/dates';

export function ItemRow({ item, onToggle, onSnooze, onDelete }: {
  item: Item;
  onToggle: (id: string) => void;
  onSnooze: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const overdue = !!item.due && !item.done && item.due < todayISO();
  return (
    <div className="item" data-done={item.done}>
      {item.kind === 'task' ? (
        <button className="tick" aria-pressed={item.done} aria-label={item.done ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`} onClick={() => onToggle(item.id)}>
          <span className="box">✓</span>
        </button>
      ) : (
        <span className="note-dot" aria-hidden />
      )}
      <div className="item-main">
        <div className="item-title">{item.title}</div>
        <div className="item-meta">
          {item.pinned && !item.done && <span className="badge pin">★ important</span>}
          {item.due && (
            <span className={`badge ${overdue ? 'overdue' : item.due === todayISO() ? 'today' : ''}`}>
              {overdue ? `was due ${humanDate(item.due)}` : humanDate(item.due)}
            </span>
          )}
          {item.context === 'business' && <span className="badge biz">business</span>}
          {item.tags.map((t) => <span key={t}>#{t}</span>)}
        </div>
      </div>
      <div className="item-actions">
        {item.kind === 'task' && !item.done && (
          <button className="icon-btn" aria-label={`Push "${item.title}" back a day`} title="Push back a day" onClick={() => onSnooze(item.id)}>↷</button>
        )}
        <button className="icon-btn" aria-label={`Delete "${item.title}"`} title="Delete" onClick={() => onDelete(item.id)}>✕</button>
      </div>
    </div>
  );
}
