/* Store behaviour: persistence round-trip, the Today query, search/filter,
   snooze semantics, export/import — the full user journey, headless. */
import { describe, it, expect } from 'vitest';
import { Brain } from '../src/lib/store';

/** In-memory Storage double. */
function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

const WED = new Date('2026-08-05T10:00:00');

describe('capture + persistence', () => {
  it('captured items survive a reload (new Brain over same storage)', () => {
    const s = fakeStorage();
    const a = new Brain(s);
    a.capture('pay VAT friday @business', WED);
    a.capture('note: gazebo pole is 2.4m', WED);
    const b = new Brain(s);
    expect(b.all()).toHaveLength(2);
    expect(b.find({ kind: 'note' })[0].title).toBe('gazebo pole is 2.4m');
  });
  it('corrupted storage starts empty rather than crashing', () => {
    const s = fakeStorage();
    s.setItem('brain.v1.items', '{not json');
    expect(new Brain(s).all()).toHaveLength(0);
  });
  it('blank capture is refused', () => {
    const b = new Brain(fakeStorage());
    expect(b.capture('   ')).toBeNull();
    expect(b.all()).toHaveLength(0);
  });
});

describe('the Today query', () => {
  it('splits overdue / due today / pinned-undated, excludes done and notes', () => {
    const b = new Brain(fakeStorage());
    // dd/mm in the past rolls forward, so build the overdue row explicitly
    // (and avoid weekday words in the title — the parser would eat them):
    const t = b.capture('catch up on emails', WED)!;
    b.update(t.id, { due: '2026-08-03' });
    b.capture('due today today', WED);
    b.capture('someday important !', WED);
    b.capture('someday plain', WED);
    b.capture('note: not a task', WED);
    const done = b.capture('done thing today', WED)!;
    b.toggleDone(done.id);

    const today = b.today(WED);
    expect(today.overdue.map((i) => i.title)).toContain('catch up on emails');
    expect(today.due.map((i) => i.title)).toEqual(['due today']);
    expect(today.pinned.map((i) => i.title)).toEqual(['someday important']);
  });
});

describe('done / snooze / delete', () => {
  it('toggleDone stamps and unstamps doneAt', () => {
    const b = new Brain(fakeStorage());
    const t = b.capture('x', WED)!;
    expect(b.toggleDone(t.id)?.doneAt).toBeTruthy();
    expect(b.toggleDone(t.id)?.doneAt).toBeNull();
  });
  it('snooze: overdue→today, today→tomorrow, undated→tomorrow', () => {
    const b = new Brain(fakeStorage());
    const over = b.capture('a', WED)!; b.update(over.id, { due: '2026-08-01' });
    const today = b.capture('b today', WED)!;
    const undated = b.capture('c', WED)!;
    expect(b.snooze(over.id, WED)?.due).toBe('2026-08-05');
    expect(b.snooze(today.id, WED)?.due).toBe('2026-08-06');
    expect(b.snooze(undated.id, WED)?.due).toBe('2026-08-06');
  });
  it('remove deletes exactly one and reports misses', () => {
    const b = new Brain(fakeStorage());
    const t = b.capture('x', WED)!;
    expect(b.remove(t.id)).toBe(true);
    expect(b.remove(t.id)).toBe(false);
  });
});

describe('search and filters', () => {
  it('matches title and tags, respects kind/context/done filters', () => {
    const b = new Brain(fakeStorage());
    b.capture('order cups #stock @business', WED);
    b.capture('note: van insurance doc in drawer @business', WED);
    b.capture('gym friday', WED);
    expect(b.find({ q: 'stock' }).map((i) => i.title)).toEqual(['order cups']);
    expect(b.find({ context: 'business' })).toHaveLength(2);
    expect(b.find({ kind: 'note' })).toHaveLength(1);
    const done = b.capture('secret done', WED)!;
    b.toggleDone(done.id);
    expect(b.find({ q: 'secret' })).toHaveLength(0);
    expect(b.find({ q: 'secret', showDone: true })).toHaveLength(1);
  });
});

describe('backup', () => {
  it('export → import into a fresh brain restores everything once', () => {
    const a = new Brain(fakeStorage());
    a.capture('one', WED); a.capture('two friday', WED);
    const dump = a.exportJSON();
    const b = new Brain(fakeStorage());
    expect(b.importJSON(dump)).toBe(2);
    expect(b.importJSON(dump)).toBe(0);       // idempotent merge
    expect(b.all()).toHaveLength(2);
  });
  it('rejects foreign or broken files with -1', () => {
    const b = new Brain(fakeStorage());
    expect(b.importJSON('{"app":"other"}')).toBe(-1);
    expect(b.importJSON('not json')).toBe(-1);
  });
});
