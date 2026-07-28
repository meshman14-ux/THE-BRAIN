/* Local-first store. Single source of truth in memory, persisted to
   localStorage on every change, pub/sub for React. No network, no accounts:
   the data lives on Jay's device and exports/imports as one JSON file.

   Storage keys are versioned so future migrations are explicit. */
import { parseCapture, type Kind, type Context } from './parse';
import { todayISO, addDays } from './dates';

export interface Item {
  id: string;
  kind: Kind;
  title: string;
  context: Context;
  tags: string[];
  due: string | null;
  pinned: boolean;
  done: boolean;
  doneAt: string | null;     // ISO datetime
  createdAt: string;         // ISO datetime
  updatedAt: string;
}

const KEY = 'brain.v1.items';

export interface BrainState { items: Item[] }

type Listener = () => void;

export class Brain {
  private items: Item[] = [];
  private listeners = new Set<Listener>();
  private storage: Storage | null;

  constructor(storage: Storage | null = defaultStorage()) {
    this.storage = storage;
    this.load();
  }

  /* ---- persistence ---- */
  private load(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.items = parsed.filter(isItem);
      }
    } catch { /* corrupted storage never brick the app — start empty */ }
  }
  private persist(): void {
    try { this.storage?.setItem(KEY, JSON.stringify(this.items)); } catch { /* quota — keep running in memory */ }
    this.listeners.forEach((l) => l());
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /* ---- reads ---- */
  all(): Item[] { return [...this.items]; }

  /** The Today screen: overdue + due-today tasks, pinned first, then undated
      pinned tasks — the honest "what needs me" list. */
  today(now: Date = new Date()): { overdue: Item[]; due: Item[]; pinned: Item[] } {
    const t = todayISO(now);
    const open = this.items.filter((i) => i.kind === 'task' && !i.done);
    const byPin = (a: Item, b: Item) => Number(b.pinned) - Number(a.pinned) || a.createdAt.localeCompare(b.createdAt);
    return {
      overdue: open.filter((i) => i.due && i.due < t).sort((a, b) => (a.due! < b.due! ? -1 : 1)),
      due: open.filter((i) => i.due === t).sort(byPin),
      pinned: open.filter((i) => !i.due && i.pinned).sort(byPin),
    };
  }

  /** Everything screen: search + filters over the whole brain. */
  find(opts: { q?: string; kind?: Kind | 'all'; context?: Context | 'all'; showDone?: boolean } = {}): Item[] {
    const q = (opts.q ?? '').trim().toLowerCase();
    return this.items
      .filter((i) => (opts.kind ?? 'all') === 'all' || i.kind === opts.kind)
      .filter((i) => (opts.context ?? 'all') === 'all' || i.context === opts.context)
      .filter((i) => opts.showDone || !i.done)
      .filter((i) => !q || i.title.toLowerCase().includes(q) || i.tags.some((tag) => tag.includes(q)))
      .sort((a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : 0) ||
        b.createdAt.localeCompare(a.createdAt));
  }

  counts(): { openTasks: number; notes: number; doneToday: number } {
    const t = todayISO();
    return {
      openTasks: this.items.filter((i) => i.kind === 'task' && !i.done).length,
      notes: this.items.filter((i) => i.kind === 'note').length,
      doneToday: this.items.filter((i) => i.done && (i.doneAt ?? '').slice(0, 10) === t).length,
    };
  }

  /* ---- writes ---- */
  capture(raw: string, now: Date = new Date()): Item | null {
    const p = parseCapture(raw, now);
    if (!raw.trim()) return null;
    const stamp = now.toISOString();
    const item: Item = {
      id: uid(), kind: p.kind, title: p.title, context: p.context, tags: p.tags,
      due: p.due, pinned: p.pinned, done: false, doneAt: null,
      createdAt: stamp, updatedAt: stamp,
    };
    this.items.push(item);
    this.persist();
    return item;
  }

  update(id: string, patch: Partial<Omit<Item, 'id' | 'createdAt'>>): Item | null {
    const i = this.items.find((x) => x.id === id);
    if (!i) return null;
    Object.assign(i, patch, { updatedAt: new Date().toISOString() });
    this.persist();
    return i;
  }

  toggleDone(id: string): Item | null {
    const i = this.items.find((x) => x.id === id);
    if (!i) return null;
    i.done = !i.done;
    i.doneAt = i.done ? new Date().toISOString() : null;
    i.updatedAt = new Date().toISOString();
    this.persist();
    return i;
  }

  /** Push a dated task back: today→tomorrow, overdue→today, undated→tomorrow. */
  snooze(id: string, now: Date = new Date()): Item | null {
    const i = this.items.find((x) => x.id === id);
    if (!i) return null;
    const t = todayISO(now);
    i.due = !i.due ? addDays(t, 1) : i.due < t ? t : addDays(i.due, 1);
    i.updatedAt = now.toISOString();
    this.persist();
    return i;
  }

  remove(id: string): boolean {
    const n = this.items.length;
    this.items = this.items.filter((x) => x.id !== id);
    if (this.items.length === n) return false;
    this.persist();
    return true;
  }

  /* ---- backup ---- */
  exportJSON(): string {
    return JSON.stringify({ app: 'the-brain', version: 1, exportedAt: new Date().toISOString(), items: this.items }, null, 2);
  }
  /** Merge-import: keeps existing items, adds any with unseen ids.
      Returns how many were added; -1 means the file wasn't ours. */
  importJSON(raw: string): number {
    try {
      const data = JSON.parse(raw);
      if (data?.app !== 'the-brain' || !Array.isArray(data.items)) return -1;
      const known = new Set(this.items.map((i) => i.id));
      const fresh = (data.items as unknown[]).filter(isItem).filter((i) => !known.has(i.id));
      this.items.push(...fresh);
      this.persist();
      return fresh.length;
    } catch { return -1; }
  }
}

/* ---- helpers ---- */
function isItem(x: unknown): x is Item {
  const i = x as Item;
  return !!i && typeof i.id === 'string' && typeof i.title === 'string'
    && (i.kind === 'task' || i.kind === 'note')
    && (i.context === 'personal' || i.context === 'business');
}
function uid(): string {
  try { return crypto.randomUUID(); }
  catch { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
}
function defaultStorage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch { return null; }
}

/* App-wide singleton (tests construct their own with fake storage). */
export const brain = new Brain();
