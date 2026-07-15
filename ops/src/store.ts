/* ---- OPSDATA store ----
 *
 * The single source of truth for the app. Holds the live records in memory,
 * seeds from ./seed on first run, and persists every mutation to localStorage
 * so the UI survives reloads. All reads used by ./ops go through here.
 */
import { defaultStockFor } from './ops';
import { seed } from './seed';
import type {
  Assignment, Cert, Client, EventRec, StockItem, Staff, Unit,
} from './types';

/** Array-backed collections addressable by id via `all()` / `get()`. */
interface Collections {
  clients: Client;
  staff: Staff;
  events: EventRec;
  units: Unit;
  assignments: Assignment;
  certs: Cert;
}

interface DB extends Record<keyof Collections, { id: string }[]> {
  clients: Client[];
  staff: Staff[];
  events: EventRec[];
  units: Unit[];
  assignments: Assignment[];
  certs: Cert[];
  /** unitId -> stock lines. */
  stock: Record<string, StockItem[]>;
  /** staffId -> { 'YYYY-MM-DD': true } unavailable dates. */
  availability: Record<string, Record<string, boolean>>;
  /** unitId -> staffIds in the regular pool. */
  pools: Record<string, string[]>;
  /** `${eventId}:${unitId}` -> shortlisted staffIds. */
  shortlists: Record<string, string[]>;
  /** unitId -> { itemName: qty } applied when default stock is generated. */
  stockOverrides: Record<string, Record<string, number>>;
}

const STORAGE_KEY = 'opsdeck.db.v1';

function hasStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function buildFresh(): DB {
  const s = seed();
  // Stock is generated lazily (see stockForUnit): calling defaultStockFor here
  // would run during module init, while ops.ts's DEFAULT_STOCK const is still
  // in its temporal dead zone (store <-> ops import cycle).
  return {
    clients: s.clients,
    staff: s.staff,
    events: s.events,
    units: s.units,
    assignments: s.assignments,
    certs: s.certs,
    stock: {},
    availability: s.availability,
    pools: s.pools,
    shortlists: s.shortlists,
    stockOverrides: s.stockOverrides,
  };
}

function load(): DB {
  if (hasStorage()) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as DB;
      } catch {
        /* fall through to fresh seed */
      }
    }
  }
  return buildFresh();
}

let counter = 0;
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
}

class OpsStore {
  private db: DB;

  constructor() {
    this.db = load();
    this.persist();
  }

  /* ---- persistence ---- */
  private persist(): void {
    if (!hasStorage()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
    } catch {
      /* storage full / unavailable — keep going in-memory */
    }
  }

  /** Reset back to the seed dataset (used by the UI's "reset" action). */
  reset(): void {
    this.db = buildFresh();
    this.persist();
  }

  /* ---- generic reads ---- */
  all<K extends keyof Collections>(coll: K): Collections[K][] {
    return this.db[coll] as Collections[K][];
  }

  get<K extends keyof Collections>(coll: K, id: string): Collections[K] | undefined {
    return (this.db[coll] as Collections[K][]).find((r) => (r as { id: string }).id === id);
  }

  /* ---- relational reads used by ./ops ---- */
  unitsForEvent(e: EventRec | null): Unit[] {
    if (!e) return [];
    return this.db.units.filter((u) => u.eventId === e.id);
  }

  certsFor(staffId: string): Cert[] {
    return this.db.certs.filter((c) => c.staffId === staffId);
  }

  availabilityFor(staffId: string): Record<string, boolean> {
    return this.db.availability[staffId] ?? {};
  }

  assignmentsForStaff(staffId: string): Assignment[] {
    return this.db.assignments.filter((a) => a.staffId === staffId);
  }

  assignmentsForEvent(eventId: string): Assignment[] {
    return this.db.assignments.filter((a) => a.eventId === eventId);
  }

  assignmentsForUnit(unitId: string): Assignment[] {
    return this.db.assignments.filter((a) => a.unitId === unitId);
  }

  stockForUnit(unitId: string): StockItem[] {
    let rows = this.db.stock[unitId];
    if (!rows) {
      const unit = this.db.units.find((u) => u.id === unitId);
      rows = defaultStockFor(unit?.type);
      const overrides = this.db.stockOverrides?.[unitId];
      if (overrides) {
        rows.forEach((r) => {
          if (r.item in overrides) r.qty = overrides[r.item];
        });
      }
      this.db.stock[unitId] = rows;
      this.persist();
    }
    return rows;
  }

  inUnitPool(unitId: string, staffId: string): boolean {
    return (this.db.pools[unitId] ?? []).includes(staffId);
  }

  inShortlist(eventId: string, unitId: string, staffId: string): boolean {
    return (this.db.shortlists[`${eventId}:${unitId}`] ?? []).includes(staffId);
  }

  /* ---- mutations (drive the interactive UI) ---- */

  /** Assign staff to a unit on an event. No-op if already assigned. */
  assign(eventId: string, unitId: string, staffId: string): Assignment {
    const existing = this.db.assignments.find(
      (a) => a.eventId === eventId && a.unitId === unitId && a.staffId === staffId,
    );
    if (existing) return existing;
    const rec: Assignment = { id: newId('a'), eventId, unitId, staffId, confirmed: false };
    this.db.assignments.push(rec);
    this.persist();
    return rec;
  }

  unassign(assignmentId: string): void {
    this.db.assignments = this.db.assignments.filter((a) => a.id !== assignmentId);
    this.persist();
  }

  toggleConfirm(assignmentId: string): void {
    const a = this.db.assignments.find((x) => x.id === assignmentId);
    if (a) {
      a.confirmed = !a.confirmed;
      this.persist();
    }
  }

  togglePool(unitId: string, staffId: string): void {
    const list = this.db.pools[unitId] ?? (this.db.pools[unitId] = []);
    const i = list.indexOf(staffId);
    if (i >= 0) list.splice(i, 1);
    else list.push(staffId);
    this.persist();
  }

  toggleShortlist(eventId: string, unitId: string, staffId: string): void {
    const key = `${eventId}:${unitId}`;
    const list = this.db.shortlists[key] ?? (this.db.shortlists[key] = []);
    const i = list.indexOf(staffId);
    if (i >= 0) list.splice(i, 1);
    else list.push(staffId);
    this.persist();
  }

  setStockQty(unitId: string, item: string, qty: number): void {
    const list = this.db.stock[unitId];
    if (!list) return;
    const row = list.find((r) => r.item === item);
    if (row) {
      row.qty = Math.max(0, qty);
      this.persist();
    }
  }
}

export const OPSDATA = new OpsStore();
