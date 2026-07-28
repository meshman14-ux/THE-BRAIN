/* Smart capture: one line of ordinary typing → a structured item.
   Deterministic rules, no AI, no network — instant and predictable.

     "pay van insurance tomorrow @business !"
       → pinned BUSINESS task, due tomorrow, title "pay van insurance"
     "note: gazebo pole is 2.4m #kit"
       → note tagged kit
     "call mum friday"
       → personal task due next Friday

   Tokens (all optional, any order, stripped from the title):
     note: / idea:            → it's a note (default is a task)
     @business / @b           → business context (@personal / @p explicit)
     #word                    → tag (repeatable)
     !                        → pinned (important)
     today / tomorrow / tmrw  → due date
     monday..sunday / mon..sun→ due next such weekday
     next week                → due 7 days from now
     in N days                → relative due date
     dd/mm or dd/mm/yyyy      → explicit due date (UK order)
*/
import { todayISO, addDays, nextWeekday, ukDate } from './dates';

export type Kind = 'task' | 'note';
export type Context = 'personal' | 'business';

export interface Parsed {
  kind: Kind;
  title: string;
  context: Context;
  tags: string[];
  due: string | null;   // ISO date
  pinned: boolean;
}

export function parseCapture(raw: string, now: Date = new Date()): Parsed {
  let text = raw.trim().replace(/\s+/g, ' ');
  const out: Parsed = { kind: 'task', title: '', context: 'personal', tags: [], due: null, pinned: false };
  if (!text) { out.title = 'Untitled task'; return out; }

  // kind prefix
  const kindM = /^(note|idea)\s*[:\-]\s*/i.exec(text);
  if (kindM) { out.kind = 'note'; text = text.slice(kindM[0].length); }

  // context
  text = text.replace(/(?:^|\s)@(business|b|work)(?=\s|$)/i, () => { out.context = 'business'; return ' '; });
  text = text.replace(/(?:^|\s)@(personal|p|home)(?=\s|$)/i, () => { out.context = 'personal'; return ' '; });

  // tags
  text = text.replace(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu, (_m, tag: string) => {
    out.tags.push(tag.toLowerCase());
    return ' ';
  });

  // pinned
  text = text.replace(/(?:^|\s)!+(?=\s|$)/, () => { out.pinned = true; return ' '; });

  // dates — first match wins; keep scanning order stable & documented
  const today = todayISO(now);
  const dateRules: [RegExp, (m: RegExpExecArray) => string | null][] = [
    [/(?:^|\s)(today|tonight)(?=\s|$)/i, () => today],
    [/(?:^|\s)(tomorrow|tmrw)(?=\s|$)/i, () => addDays(today, 1)],
    [/(?:^|\s)next week(?=\s|$)/i, () => addDays(today, 7)],
    [/(?:^|\s)in (\d{1,3}) days?(?=\s|$)/i, (m) => addDays(today, Number(m[1]))],
    [/(?:^|\s)(?:on |by )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?=\s|$)/i,
      (m) => nextWeekday(m[1].slice(0, 3), now)],
    [/(?:^|\s)(?:on |by )?(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?=\s|$)/, (m) => ukDate(m[1], now)],
  ];
  for (const [re, resolve] of dateRules) {
    const m = re.exec(text);
    if (m) {
      const iso = resolve(m);
      if (iso) {
        out.due = iso;
        text = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length));
        break;
      }
    }
  }

  out.title = text.replace(/\s+/g, ' ').trim();
  // A capture that was ONLY tokens still deserves to exist.
  if (!out.title) out.title = out.kind === 'note' ? 'Untitled note' : 'Untitled task';
  // Notes don't pin or have due dates in v1 — a dated "note" is really a task.
  if (out.kind === 'note' && out.due) out.kind = 'task';
  return out;
}
