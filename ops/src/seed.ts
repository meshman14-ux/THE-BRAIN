/* ---- seed dataset ----
 *
 * Pure data only (imports types, nothing else) so it can be loaded before the
 * store and utils finish initialising. The store turns this into the live DB
 * on first run and then persists mutations to localStorage.
 */
import type {
  Assignment, Cert, Client, EventRec, Staff, Unit,
} from './types';

export interface SeedDB {
  clients: Client[];
  staff: Staff[];
  events: EventRec[];
  units: Unit[];
  assignments: Assignment[];
  certs: Cert[];
  /** staffId -> { 'YYYY-MM-DD': true } for dates the person is unavailable. */
  availability: Record<string, Record<string, boolean>>;
  /** unitId -> staffIds kept in the unit's regular pool. */
  pools: Record<string, string[]>;
  /** `${eventId}:${unitId}` -> shortlisted staffIds. */
  shortlists: Record<string, string[]>;
}

export function seed(): SeedDB {
  const clients: Client[] = [
    { id: 'c1', name: 'Northside Festivals' },
    { id: 'c2', name: 'Harbour Weddings' },
  ];

  const staff: Staff[] = [
    { id: 's1', name: 'Ava Reed', clientId: 'c1', role: 'Bar Manager', rtw: 'Verified' },
    { id: 's2', name: 'Ben Cole', clientId: 'c1', role: 'Bartender', rtw: 'Verified' },
    { id: 's3', name: 'Cara Lin', clientId: 'c1', role: 'Barista', rtw: 'Verified' },
    { id: 's4', name: 'Deni Osei', clientId: 'c1', role: 'Chef', rtw: 'Verified' },
    { id: 's5', name: 'Evan Pratt', clientId: 'c1', role: 'Kitchen Porter', rtw: 'Pending' },
    { id: 's6', name: 'Faye Ndour', clientId: 'c1', role: 'Driver', rtw: 'Verified' },
    { id: 's7', name: 'Gus Mila', clientId: 'c2', role: 'Bartender', rtw: 'Verified' },
    { id: 's8', name: 'Hana Vela', clientId: 'c2', role: 'Barista', rtw: 'Verified' },
    { id: 's9', name: 'Ivo Marsh', clientId: 'c2', role: 'Chef', rtw: 'Verified' },
    { id: 's10', name: 'Jade Kerr', clientId: 'c2', role: 'General Staff', rtw: 'Verified',
      skills: ['General', 'Bar'] },
  ];

  const events: EventRec[] = [
    {
      id: 'e1', name: 'Riverside Summer Fair', clientId: 'c1',
      start: '2026-07-18', end: '2026-07-19', loc: 'Riverside Park, Bristol',
      callTime: '08:00', notes: 'Two-day outdoor. Bar + coffee + food trailers.',
    },
    {
      id: 'e2', name: 'Meadow Wedding', clientId: 'c2',
      start: '2026-07-25', loc: 'Meadow Barn, Bath',
      callTime: '11:00', notes: 'Single bar, drinks reception then evening service.',
    },
    {
      id: 'e3', name: 'City Food Market', clientId: 'c1',
      start: '2026-08-02', end: '2026-08-02', loc: 'Castle Square',
      callTime: '07:30', notes: 'Street food + coffee. Early load-in.',
    },
  ];

  const units: Unit[] = [
    // e1
    { id: 'u1', eventId: 'e1', name: 'Main Bar', type: 'Bar', clientId: 'c1', crew: 4 },
    { id: 'u2', eventId: 'e1', name: 'Coffee Cart', type: 'Coffee', clientId: 'c1', crew: 2 },
    { id: 'u3', eventId: 'e1', name: 'Food Trailer', type: 'Food', clientId: 'c1', crew: 3 },
    // e2
    { id: 'u4', eventId: 'e2', name: 'Reception Bar', type: 'Bar', clientId: 'c2', crew: 3 },
    // e3
    { id: 'u5', eventId: 'e3', name: 'Street Kitchen', type: 'Food', clientId: 'c1', crew: 3 },
    { id: 'u6', eventId: 'e3', name: 'Coffee Stand', type: 'Coffee', clientId: 'c1', crew: 1 },
  ];

  const assignments: Assignment[] = [
    { id: 'a1', eventId: 'e1', unitId: 'u1', staffId: 's1', confirmed: true },
    { id: 'a2', eventId: 'e1', unitId: 'u1', staffId: 's2', confirmed: true },
    { id: 'a3', eventId: 'e1', unitId: 'u2', staffId: 's3', confirmed: false },
    { id: 'a4', eventId: 'e2', unitId: 'u4', staffId: 's7', confirmed: true },
  ];

  const certs: Cert[] = [
    { id: 'ct1', staffId: 's1', name: 'Personal Licence', expiry: '2027-03-01' },
    { id: 'ct2', staffId: 's2', name: 'Personal Licence', expiry: '2026-06-30' }, // expired
    { id: 'ct3', staffId: 's4', name: 'Food Hygiene L2', expiry: '2028-01-01' },
    { id: 'ct4', staffId: 's5', name: 'Food Hygiene L2', expiry: '2025-12-01' }, // expired
    { id: 'ct5', staffId: 's6', name: 'Driver CPC', expiry: '2029-05-05' },
    { id: 'ct6', staffId: 's9', name: 'Food Hygiene L2', expiry: '2027-09-09' },
  ];

  const availability: Record<string, Record<string, boolean>> = {
    // Cara is off on the 18th (clashes with e1 day one)
    s3: { '2026-07-18': true },
    // Deni is away the whole e1 weekend
    s4: { '2026-07-18': true, '2026-07-19': true },
  };

  const pools: Record<string, string[]> = {
    u1: ['s1', 's2', 's10'],
    u2: ['s3'],
    u3: ['s4', 's5'],
    u4: ['s7'],
  };

  const shortlists: Record<string, string[]> = {
    'e1:u1': ['s10'],
    'e1:u3': ['s5'],
  };

  return { clients, staff, events, units, assignments, certs, availability, pools, shortlists };
}
