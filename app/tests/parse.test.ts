/* The capture parser is the product — test it like it. All dates pinned to a
   known Wednesday so weekday/relative parsing is deterministic. */
import { describe, it, expect } from 'vitest';
import { parseCapture } from '../src/lib/parse';

const WED = new Date('2026-08-05T10:00:00'); // Wednesday 5 Aug 2026

describe('kind detection', () => {
  it('defaults to task', () => {
    expect(parseCapture('buy milk', WED).kind).toBe('task');
  });
  it('note: and idea: prefixes make notes', () => {
    expect(parseCapture('note: gazebo pole is 2.4m', WED)).toMatchObject({ kind: 'note', title: 'gazebo pole is 2.4m' });
    expect(parseCapture('Idea - loyalty cards for regulars', WED).kind).toBe('note');
  });
  it('a dated "note" becomes a task (dates mean action)', () => {
    expect(parseCapture('note: renew lease friday', WED).kind).toBe('task');
  });
});

describe('context', () => {
  it('defaults personal', () => {
    expect(parseCapture('buy milk', WED).context).toBe('personal');
  });
  it('@business / @b / @work file under business', () => {
    for (const t of ['pay VAT @business', 'pay VAT @b', 'pay VAT @work']) {
      expect(parseCapture(t, WED)).toMatchObject({ context: 'business', title: 'pay VAT' });
    }
  });
});

describe('dates', () => {
  it('today / tomorrow / tmrw', () => {
    expect(parseCapture('call bank today', WED).due).toBe('2026-08-05');
    expect(parseCapture('call bank tomorrow', WED).due).toBe('2026-08-06');
    expect(parseCapture('call bank tmrw', WED).due).toBe('2026-08-06');
  });
  it('weekday names go to the NEXT such day', () => {
    expect(parseCapture('gym friday', WED).due).toBe('2026-08-07');
    expect(parseCapture('gym wednesday', WED).due).toBe('2026-08-12'); // next Wed, not today
    expect(parseCapture('gym on mon', WED).due).toBe('2026-08-10');
  });
  it('next week and in N days', () => {
    expect(parseCapture('service van next week', WED).due).toBe('2026-08-12');
    expect(parseCapture('follow up in 3 days', WED).due).toBe('2026-08-08');
  });
  it('UK dd/mm and dd/mm/yyyy; past dd/mm rolls to next year', () => {
    expect(parseCapture('MOT due 14/8', WED).due).toBe('2026-08-14');
    expect(parseCapture('MOT due 14/8/2027', WED).due).toBe('2027-08-14');
    expect(parseCapture('birthday 3/1', WED).due).toBe('2027-01-03'); // Jan already passed
  });
  it('invalid dates are left in the title, not mangled', () => {
    const p = parseCapture('lockup code is 45/99', WED);
    expect(p.due).toBeNull();
    expect(p.title).toBe('lockup code is 45/99');
  });
  it('date words are stripped from the title', () => {
    expect(parseCapture('pay van insurance tomorrow', WED).title).toBe('pay van insurance');
  });
});

describe('tags and importance', () => {
  it('#tags collect and strip', () => {
    expect(parseCapture('order cups #stock #van', WED)).toMatchObject({ tags: ['stock', 'van'], title: 'order cups' });
  });
  it('! pins', () => {
    expect(parseCapture('renew insurance !', WED).pinned).toBe(true);
  });
  it('! inside a word does not pin', () => {
    const p = parseCapture('email dan!ela', WED);
    expect(p.pinned).toBe(false);
  });
});

describe('kitchen sink + edges', () => {
  it('everything at once, any order', () => {
    const p = parseCapture('! pay van insurance @business tomorrow #van #money', WED);
    expect(p).toMatchObject({
      kind: 'task', title: 'pay van insurance', context: 'business',
      due: '2026-08-06', pinned: true, tags: ['van', 'money'],
    });
  });
  it('empty and whitespace input', () => {
    expect(parseCapture('', WED).title).toBe('Untitled task');
    expect(parseCapture('   ', WED).title).toBe('Untitled task');
  });
  it('tokens-only capture still yields a titled item', () => {
    expect(parseCapture('tomorrow @business !', WED).title).toBe('Untitled task');
  });
  it('only the FIRST date phrase is consumed', () => {
    const p = parseCapture('move friday booking to monday', WED);
    expect(p.due).toBe('2026-08-07');          // friday
    expect(p.title).toBe('move booking to monday');
  });
});
