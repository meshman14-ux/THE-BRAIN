/* ---- OPSDECK domain types ----
 *
 * These describe the shape of everything the ops utilities operate on. The
 * store (./store) is the single source of truth for the live records; these
 * types are shared across the store, the utils, and the UI.
 */

/** Broad skill / staffing categories used across events, units and staff. */
export type Area = 'Bar' | 'Coffee' | 'Food' | 'General' | 'Driver' | 'Supervisor';

/** A client / customer that owns events, units and (usually) staff. */
export interface Client {
  id: string;
  name: string;
}

/** A member of staff who can be assigned to units on an event. */
export interface Staff {
  id: string;
  name: string;
  /** Home client. Used for "own client" preference in suitability scoring. */
  clientId?: string;
  /** Free-text role; used to infer skills when `skills` is not set. */
  role?: string;
  /** Explicit skill list. Takes precedence over role inference. */
  skills?: Area[];
  /** Right-to-work status. Considered compliant only when 'Verified'. */
  rtw?: 'Verified' | 'Pending' | 'Rejected' | string;
}

/** A working position on an event (a bar, a coffee cart, a kitchen, ...). */
export interface Unit {
  id: string;
  /** The event this unit belongs to. */
  eventId?: string;
  /** Human label, e.g. "Main bar". */
  name?: string;
  /** Free-text type; drives area inference and default stock, e.g. "Bar". */
  type?: string;
  /** Client this unit is run for. */
  clientId?: string;
  /** Headcount this unit needs. */
  crew?: number;
}

/** A booked event / job. */
export interface EventRec {
  id: string;
  name?: string;
  clientId?: string;
  /** ISO date (YYYY-MM-DD). */
  start?: string;
  /** ISO date (YYYY-MM-DD). Defaults to `start` when a single-day event. */
  end?: string;
  loc?: string;
  /** Crew call time, free text e.g. "07:30". */
  callTime?: string;
  notes?: string;
  /** Optional explicit headcount per area; overrides unit-derived staffing. */
  staffing?: Partial<Record<Area, number>>;
}

/** A staff assignment to an event (optionally pinned to a unit). */
export interface Assignment {
  id: string;
  eventId: string;
  staffId: string;
  unitId?: string;
  confirmed?: boolean;
}

/** A certification / ticket held by a staff member. */
export interface Cert {
  id: string;
  staffId: string;
  name: string;
  /** ISO date (YYYY-MM-DD). Considered expired when strictly before today. */
  expiry?: string;
}

/** A stock line for a unit (or a default-catalogue row). */
export interface StockItem {
  item: string;
  /** Unit of measure, e.g. "kegs", "litres". */
  unit: string;
  qty: number;
  /** Par level — reorder threshold. Below this is "low stock". */
  par: number;
}

/** Result of a compliance check for a staff member. */
export interface Compliance {
  rtwOk: boolean;
  certsOk: boolean;
  expiredCount: number;
  ok: boolean;
}

/** A scored suitability row for placing a staff member on a unit. */
export interface Suitability {
  staff: Staff;
  id: string;
  name: string;
  skills: Area[];
  area: Area;
  skillOk: boolean;
  compliance: Compliance;
  available: boolean;
  unavailable: boolean;
  pastShifts: number;
  ownClient: boolean;
  reasons: string[];
  blocked: boolean;
  score: number;
  inPool: boolean;
  inShortlist: boolean;
}
