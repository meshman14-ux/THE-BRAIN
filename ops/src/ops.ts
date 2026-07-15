import { OPSDATA } from './store';
import type { Area, EventRec, Staff, Suitability, Unit } from './types';

const today = () => new Date().toISOString().slice(0, 10);
function addDay(iso?: string): string | undefined {
  if (!iso) return iso;
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const AREAS: Area[] = ['Bar', 'Coffee', 'Food', 'General', 'Driver', 'Supervisor'];

/* ---- per-event identity colour (deterministic across screens) ---- */
export const EVENT_PALETTE = [
  'oklch(0.72 0.19 250)', 'oklch(0.72 0.21 150)', 'oklch(0.75 0.18 55)',
  'oklch(0.70 0.24 350)', 'oklch(0.62 0.25 295)', 'oklch(0.74 0.15 195)',
  'oklch(0.72 0.20 25)', 'oklch(0.70 0.16 320)',
];
export function eventColor(id: string): string {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return EVENT_PALETTE[h % EVENT_PALETTE.length];
}

/* ---- area / skills inference ---- */
export function areaOfUnit(u?: Unit): Area {
  const t = (u?.type ?? '').toLowerCase();
  if (t.includes('bar')) return 'Bar';
  if (t.includes('coffee') || t.includes('barista')) return 'Coffee';
  if (t.includes('food') || t.includes('cater') || t.includes('kitchen')) return 'Food';
  return 'General';
}
export function skillsOf(staff?: Staff): Area[] {
  if (staff && Array.isArray(staff.skills)) return staff.skills;
  const role = (staff?.role ?? '').toLowerCase();
  if (role.includes('manager')) return ['Bar', 'Supervisor', 'General'];
  if (role.includes('bartender') || role.includes('bar ')) return ['Bar', 'General'];
  if (role.includes('barista')) return ['Coffee', 'General'];
  if (role.includes('chef')) return ['Food', 'Supervisor'];
  if (role.includes('kitchen')) return ['Food', 'General'];
  if (role.includes('driver')) return ['Driver', 'General'];
  return ['General'];
}

/* ---- required headcount per area for an event ---- */
export function staffingFor(e?: EventRec): Record<Area, number> {
  const out = {} as Record<Area, number>;
  AREAS.forEach((a) => { out[a] = 0; });
  if (e?.staffing && typeof e.staffing === 'object') {
    AREAS.forEach((a) => { out[a] = Number(e.staffing![a]) || 0; });
    return out;
  }
  OPSDATA.unitsForEvent(e ?? null).forEach((u) => {
    const a = areaOfUnit(u);
    out[a] = (out[a] || 0) + (Number(u.crew) || 0);
  });
  return out;
}

/* ---- compliance: RTW + cert expiry ---- */
export function staffCompliance(s?: Staff) {
  if (!s) return { rtwOk: false, certsOk: false, expiredCount: 0, ok: false };
  const rtwOk = s.rtw === 'Verified';
  const t = today();
  const expired = OPSDATA.certsFor(s.id).filter((c) => c.expiry && c.expiry < t);
  const certsOk = expired.length === 0;
  return { rtwOk, certsOk, expiredCount: expired.length, ok: rtwOk && certsOk };
}
export function staffUnavailableOn(sid: string, startISO?: string, endISO?: string): boolean {
  const map = OPSDATA.availabilityFor(sid);
  const s = startISO || endISO; if (!s) return false;
  const e = endISO || startISO!;
  const d = new Date(s + 'T00:00:00'), end = new Date(e + 'T00:00:00');
  while (d <= end) {
    if (map[d.toISOString().slice(0, 10)]) return true;
    d.setDate(d.getDate() + 1);
  }
  return false;
}
export function staffPastShifts(sid: string): number {
  const t = today();
  return OPSDATA.assignmentsForStaff(sid).filter((a) => {
    const ev = OPSDATA.get('events', a.eventId);
    return ev && (ev.end || ev.start || '') < t;
  }).length;
}

/* ---- suitability scoring: skill + availability + compliance + own-client + reliability ---- */
export function suitableForUnit(
  unit: Unit | null,
  opts: { event?: EventRec | null; widen?: boolean } = {}
): Suitability[] {
  if (!unit) return [];
  const area = areaOfUnit(unit);
  const ev = opts.event ?? null;
  const clientId = unit.clientId;
  const pool = opts.widen
    ? OPSDATA.all('staff')
    : OPSDATA.all('staff').filter((s) => s.clientId === clientId);

  return pool.map((s): Suitability => {
    const skills = skillsOf(s);
    const skillOk = skills.includes(area);
    const comp = staffCompliance(s);
    const unavailable = ev ? staffUnavailableOn(s.id, ev.start, ev.end || ev.start) : false;
    const past = staffPastShifts(s.id);
    const ownClient = s.clientId === clientId;
    const reasons: string[] = [];
    if (!skillOk) reasons.push(`no ${area} skill`);
    if (unavailable) reasons.push('unavailable');
    if (!comp.rtwOk) reasons.push('RTW pending');
    if (!comp.certsOk) reasons.push(`${comp.expiredCount} cert${comp.expiredCount === 1 ? '' : 's'} expired`);
    const score =
      (skillOk ? 100 : 0) + (unavailable ? 0 : 30) + (comp.ok ? 25 : 0) +
      (ownClient ? 15 : 0) + Math.min(past, 20);
    return {
      staff: s, id: s.id, name: s.name, skills, area, skillOk,
      compliance: comp, available: !unavailable, unavailable, pastShifts: past,
      ownClient, reasons, blocked: !skillOk || unavailable || !comp.ok, score,
      inPool: OPSDATA.inUnitPool(unit.id, s.id),
      inShortlist: ev ? OPSDATA.inShortlist(ev.id, unit.id, s.id) : false,
    };
  }).sort((a, b) => b.score - a.score || (b.pastShifts - a.pastShifts));
}

/* ---- default stock catalogue per unit type ---- */
export const DEFAULT_STOCK: Record<string, Array<{ item: string; unit: string; qty: number; par: number }>> = {
  Bar: [
    { item: 'Lager keg (50L)', unit: 'kegs', qty: 4, par: 3 },
    { item: 'Cider keg (50L)', unit: 'kegs', qty: 2, par: 1 },
    { item: 'Ale / craft keg', unit: 'kegs', qty: 2, par: 1 },
    { item: 'House red wine', unit: 'bottles', qty: 12, par: 6 },
    { item: 'House white wine', unit: 'bottles', qty: 12, par: 6 },
    { item: 'Prosecco', unit: 'bottles', qty: 12, par: 6 },
    { item: 'Vodka', unit: 'bottles', qty: 3, par: 2 },
    { item: 'Gin', unit: 'bottles', qty: 3, par: 2 },
    { item: 'Rum', unit: 'bottles', qty: 2, par: 1 },
    { item: 'Whisky', unit: 'bottles', qty: 2, par: 1 },
    { item: 'Mixers (tonic/cola/lemonade)', unit: 'cases', qty: 6, par: 4 },
    { item: 'Soft drinks', unit: 'cases', qty: 4, par: 2 },
    { item: 'Bottled water', unit: 'cases', qty: 4, par: 2 },
    { item: 'Ice', unit: 'bags', qty: 20, par: 10 },
    { item: 'Disposable cups', unit: 'sleeves', qty: 10, par: 5 },
    { item: 'Garnishes (lemon/lime)', unit: 'packs', qty: 6, par: 3 },
    { item: 'Napkins', unit: 'packs', qty: 10, par: 4 },
    { item: 'Bin bags', unit: 'rolls', qty: 4, par: 2 },
    { item: 'Card receipt roll', unit: 'rolls', qty: 6, par: 3 },
  ],
  Coffee: [
    { item: 'Coffee beans', unit: 'kg', qty: 10, par: 5 },
    { item: 'Fresh whole milk', unit: 'litres', qty: 24, par: 12 },
    { item: 'Oat milk', unit: 'litres', qty: 12, par: 6 },
    { item: 'Semi-skimmed milk', unit: 'litres', qty: 12, par: 6 },
    { item: 'Cups 8oz', unit: 'sleeves', qty: 8, par: 4 },
    { item: 'Cups 12oz', unit: 'sleeves', qty: 8, par: 4 },
    { item: 'Lids', unit: 'sleeves', qty: 8, par: 4 },
    { item: 'Sugar sachets', unit: 'boxes', qty: 4, par: 2 },
    { item: 'Wooden stirrers', unit: 'boxes', qty: 4, par: 2 },
    { item: 'Hot chocolate powder', unit: 'tubs', qty: 3, par: 1 },
    { item: 'Syrups (vanilla/caramel/hazelnut)', unit: 'bottles', qty: 6, par: 3 },
    { item: 'Takeaway cup trays', unit: 'sleeves', qty: 4, par: 2 },
    { item: 'Napkins', unit: 'packs', qty: 8, par: 4 },
    { item: 'Cleaning tablets', unit: 'packs', qty: 2, par: 1 },
    { item: 'Bottled water', unit: 'cases', qty: 3, par: 1 },
  ],
  Food: [
    { item: 'Burger buns', unit: 'packs', qty: 20, par: 10 },
    { item: 'Beef patties', unit: 'boxes', qty: 10, par: 5 },
    { item: 'Sausages', unit: 'kg', qty: 15, par: 8 },
    { item: 'Chicken fillets', unit: 'kg', qty: 12, par: 6 },
    { item: 'Veggie / vegan patties', unit: 'boxes', qty: 4, par: 2 },
    { item: 'Chips / fries', unit: 'kg', qty: 25, par: 12 },
    { item: 'Cheese slices', unit: 'packs', qty: 8, par: 4 },
    { item: 'Onions', unit: 'kg', qty: 6, par: 3 },
    { item: 'Salad / garnish', unit: 'kg', qty: 5, par: 2 },
    { item: 'Ketchup', unit: 'bottles', qty: 6, par: 3 },
    { item: 'Mayonnaise', unit: 'bottles', qty: 6, par: 3 },
    { item: 'Mustard', unit: 'bottles', qty: 3, par: 1 },
    { item: 'Cooking oil', unit: 'litres', qty: 20, par: 10 },
    { item: 'Food boxes / trays', unit: 'sleeves', qty: 10, par: 5 },
    { item: 'Wooden forks', unit: 'boxes', qty: 4, par: 2 },
    { item: 'Napkins', unit: 'packs', qty: 10, par: 4 },
    { item: 'Blue roll', unit: 'rolls', qty: 6, par: 3 },
    { item: 'Food-safe gloves', unit: 'boxes', qty: 4, par: 2 },
    { item: 'Foil / cling film', unit: 'rolls', qty: 4, par: 2 },
  ],
  Catering: [
    { item: 'Protein (mixed meats)', unit: 'kg', qty: 40, par: 20 },
    { item: 'Vegetables (mixed)', unit: 'kg', qty: 30, par: 15 },
    { item: 'Rice / grains', unit: 'kg', qty: 20, par: 10 },
    { item: 'Pasta / noodles', unit: 'kg', qty: 15, par: 8 },
    { item: 'Bread / rolls', unit: 'packs', qty: 24, par: 12 },
    { item: 'Cooking oil', unit: 'litres', qty: 25, par: 12 },
    { item: 'Seasoning / spices', unit: 'tubs', qty: 10, par: 5 },
    { item: 'Sauces / condiments', unit: 'bottles', qty: 12, par: 6 },
    { item: 'Disposable plates', unit: 'sleeves', qty: 12, par: 6 },
    { item: 'Cutlery sets', unit: 'boxes', qty: 8, par: 4 },
    { item: 'Napkins', unit: 'packs', qty: 12, par: 6 },
    { item: 'Blue roll', unit: 'rolls', qty: 8, par: 4 },
    { item: 'Food-safe gloves', unit: 'boxes', qty: 6, par: 3 },
    { item: 'Foil trays', unit: 'packs', qty: 10, par: 5 },
    { item: 'Cling film / foil', unit: 'rolls', qty: 6, par: 3 },
  ],
  General: [
    { item: 'Bin bags', unit: 'rolls', qty: 6, par: 3 },
    { item: 'Blue roll', unit: 'rolls', qty: 8, par: 4 },
    { item: 'Cleaning spray', unit: 'bottles', qty: 4, par: 2 },
    { item: 'Disposable gloves', unit: 'boxes', qty: 4, par: 2 },
    { item: 'Hand sanitiser', unit: 'bottles', qty: 4, par: 2 },
    { item: 'Napkins', unit: 'packs', qty: 8, par: 4 },
    { item: 'Disposable cups', unit: 'sleeves', qty: 6, par: 3 },
    { item: 'Bottled water', unit: 'cases', qty: 4, par: 2 },
    { item: 'Till / receipt roll', unit: 'rolls', qty: 6, par: 3 },
    { item: 'First-aid consumables', unit: 'kits', qty: 2, par: 1 },
  ],
};
export function defaultStockFor(type?: string) {
  const key = type && DEFAULT_STOCK[key_(type)] ? key_(type) : 'General';
  return (DEFAULT_STOCK[key] ?? DEFAULT_STOCK.General).map((r) => ({ ...r }));
}
function key_(type: string) { return type; }

/* ---- event readiness: crew filled %, confirmed %, stock ok -> single score ---- */
export function eventReadiness(e: EventRec) {
  const need = staffingFor(e);
  const totalNeed = AREAS.reduce((n, a) => n + (need[a] || 0), 0);
  const asg = OPSDATA.assignmentsForEvent(e.id);
  const filled = asg.length;
  const confirmed = asg.filter((a) => a.confirmed).length;
  const crewPct = totalNeed ? Math.min(100, Math.round((filled / totalNeed) * 100)) : 100;
  const confirmedPct = filled ? Math.round((confirmed / filled) * 100) : 0;
  const units = OPSDATA.unitsForEvent(e);
  const lowStock = units.some((u) =>
    OPSDATA.stockForUnit(u.id).some((s) => Number(s.qty) < Number(s.par))
  );
  const score = Math.round(crewPct * 0.5 + confirmedPct * 0.4 + (lowStock ? 0 : 10));
  return { crewPct, confirmedPct, filled, totalNeed, lowStock, score };
}

/* ---- connectors: ics + csv (ported) ---- */
export function ics(events: EventRec[]): string {
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OPSDECK//MAINFRAME//EN', 'CALSCALE:GREGORIAN'];
  const d = (x?: string) => String(x || '').replace(/-/g, '');
  events.forEach((e) => {
    out.push('BEGIN:VEVENT');
    out.push('UID:' + e.id + '@opsdeck');
    out.push('DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z');
    out.push('SUMMARY:' + (e.name || 'Event'));
    if (e.loc) out.push('LOCATION:' + String(e.loc).replace(/,/g, '\\,'));
    const desc: string[] = [];
    if (e.callTime) desc.push('Crew call ' + e.callTime);
    if (e.notes) desc.push(e.notes);
    if (desc.length) out.push('DESCRIPTION:' + desc.join(' \\n ').replace(/,/g, '\\,'));
    out.push('DTSTART;VALUE=DATE:' + d(e.start || e.end));
    out.push('DTEND;VALUE=DATE:' + d(addDay(e.end || e.start)));
    out.push('END:VEVENT');
  });
  out.push('END:VCALENDAR');
  return out.join('\r\n');
}
export function csv(headers: string[], rows: Array<Array<string | number>>): string {
  const esc = (v: string | number) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
export function download(name: string, text: string, mime = 'text/plain') {
  const b = new Blob([text], { type: mime });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = u; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 120);
}
