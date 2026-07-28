/* Natural-language date words → ISO dates (yyyy-mm-dd), UK conventions.
   Pure functions: `now` is always injectable so tests are deterministic. */

export const toISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const addDays = (iso: string, n: number): string => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const todayISO = (now: Date = new Date()): string => toISO(now);

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Next occurrence of a weekday name, strictly after today. */
export function nextWeekday(name: string, now: Date = new Date()): string | null {
  const target = WEEKDAYS.findIndex((w) => w === name.toLowerCase() || w.slice(0, 3) === name.toLowerCase());
  if (target < 0) return null;
  let diff = (target - now.getDay() + 7) % 7;
  if (diff === 0) diff = 7;
  return addDays(toISO(now), diff);
}

/** dd/mm or dd/mm/yyyy → ISO. Rolls a past dd/mm to next year. */
export function ukDate(s: string, now: Date = new Date()): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(s.trim());
  if (!m) return null;
  const day = Number(m[1]), month = Number(m[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  let year = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : now.getFullYear();
  const candidate = new Date(year, month - 1, day, 12);
  if (candidate.getDate() !== day || candidate.getMonth() !== month - 1) return null; // e.g. 31/02
  if (!m[3] && toISO(candidate) < toISO(now)) year += 1;
  const rolled = new Date(year, month - 1, day, 12);
  if (rolled.getDate() !== day) return null;
  return toISO(rolled);
}

/** Human label for an ISO date, relative to today: Today / Tomorrow /
    Mon 4 Aug / 4 Aug 2027. Overdue dates get no special casing here —
    the UI colours them. */
export function humanDate(iso: string, now: Date = new Date()): string {
  const today = toISO(now);
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  const d = new Date(iso + 'T12:00:00');
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-GB', sameYear
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}
