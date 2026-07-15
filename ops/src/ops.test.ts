import { describe, expect, it } from 'vitest';
import {
  areaOfUnit, csv, eventReadiness, ics, skillsOf,
  staffCompliance, staffUnavailableOn, suitableForUnit,
} from './ops';
import { OPSDATA } from './store';
import type { Unit } from './types';

/* These assertions are deliberately independent of the wall-clock "today":
 * they lean on fixed past cert-expiry dates, fixed availability dates, and
 * readiness maths that never reads the current date. */

describe('areaOfUnit', () => {
  const area = (type?: string) => areaOfUnit({ id: 'x', type } as Unit);
  it('maps unit types onto areas', () => {
    expect(area('Main Bar')).toBe('Bar');
    expect(area('Coffee cart')).toBe('Coffee');
    expect(area('Food trailer')).toBe('Food');
    expect(area('Kitchen')).toBe('Food');
    expect(area('Catering')).toBe('Food');
    expect(area('Cloakroom')).toBe('General');
    expect(area(undefined)).toBe('General');
  });
});

describe('skillsOf', () => {
  it('prefers an explicit skills list', () => {
    expect(skillsOf({ id: 's', name: 'n', skills: ['Coffee'] })).toEqual(['Coffee']);
  });
  it('infers from role otherwise', () => {
    expect(skillsOf({ id: 's', name: 'n', role: 'Bartender' })).toEqual(['Bar', 'General']);
    expect(skillsOf({ id: 's', name: 'n', role: 'Head Chef' })).toEqual(['Food', 'Supervisor']);
    expect(skillsOf({ id: 's', name: 'n', role: 'Driver' })).toEqual(['Driver', 'General']);
    expect(skillsOf({ id: 's', name: 'n' })).toEqual(['General']);
  });
});

describe('staffCompliance', () => {
  const byId = (id: string) => OPSDATA.all('staff').find((s) => s.id === id);
  it('is ok when RTW is verified and no cert has expired', () => {
    // s10 (Jade) is Verified with no certs on file.
    expect(staffCompliance(byId('s10'))).toEqual({
      rtwOk: true, certsOk: true, expiredCount: 0, ok: true,
    });
  });
  it('flags an expired certificate', () => {
    // s2 (Ben) holds a Personal Licence that expired 2026-06-30.
    const c = staffCompliance(byId('s2'));
    expect(c.certsOk).toBe(false);
    expect(c.expiredCount).toBe(1);
    expect(c.ok).toBe(false);
  });
  it('flags unverified right-to-work', () => {
    // s5 (Evan) is RTW Pending.
    expect(staffCompliance(byId('s5')).rtwOk).toBe(false);
  });
  it('is not ok for an unknown / missing staff member', () => {
    expect(staffCompliance(undefined).ok).toBe(false);
  });
});

describe('staffUnavailableOn', () => {
  it('detects an unavailable day inside the range', () => {
    // s3 (Cara) is off on 2026-07-18.
    expect(staffUnavailableOn('s3', '2026-07-18', '2026-07-19')).toBe(true);
  });
  it('returns false when the range is clear', () => {
    expect(staffUnavailableOn('s3', '2026-07-20', '2026-07-21')).toBe(false);
  });
  it('returns false with no dates given', () => {
    expect(staffUnavailableOn('s3')).toBe(false);
  });
});

describe('suitableForUnit', () => {
  const unit = OPSDATA.all('units').find((u) => u.id === 'u1')!; // Main Bar, client c1
  const event = OPSDATA.get('events', 'e1')!;
  const ranked = suitableForUnit(unit, { event });

  it('scores the fully-qualified bar manager to the top', () => {
    expect(ranked[0].id).toBe('s1'); // Ava Reed
    expect(ranked[0].skillOk).toBe(true);
    expect(ranked[0].blocked).toBe(false);
    expect(ranked[0].score).toBeGreaterThanOrEqual(170);
  });
  it('blocks and explains a candidate with no bar skill', () => {
    const barista = ranked.find((c) => c.id === 's3')!; // Cara, Coffee
    expect(barista.skillOk).toBe(false);
    expect(barista.blocked).toBe(true);
    expect(barista.reasons).toContain('no Bar skill');
  });
  it('is sorted by descending score', () => {
    const scores = ranked.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
  it('widening the pool includes other clients', () => {
    const own = suitableForUnit(unit, { event }).length;
    const wide = suitableForUnit(unit, { event, widen: true }).length;
    expect(wide).toBeGreaterThan(own);
  });
});

describe('eventReadiness', () => {
  it('combines crew, confirmation and stock into a score', () => {
    const e1 = OPSDATA.get('events', 'e1')!;
    const r = eventReadiness(e1);
    // 3 of 9 crew filled, 2 of 3 confirmed, one seeded bar line is below par.
    expect(r.filled).toBe(3);
    expect(r.totalNeed).toBe(9);
    expect(r.crewPct).toBe(33);
    expect(r.confirmedPct).toBe(67);
    expect(r.lowStock).toBe(true);
    expect(r.score).toBe(43); // 33*0.5 + 67*0.4 + 0
  });
});

describe('connectors', () => {
  it('emits a VEVENT with an all-day DTSTART', () => {
    const e1 = OPSDATA.get('events', 'e1')!;
    const out = ics([e1]);
    expect(out).toContain('BEGIN:VEVENT');
    expect(out).toContain('SUMMARY:Riverside Summer Fair');
    expect(out).toContain('DTSTART;VALUE=DATE:20260718');
    expect(out).toContain('END:VCALENDAR');
  });
  it('quotes csv fields containing commas', () => {
    const out = csv(['a', 'b'], [[1, 'x,y']]);
    expect(out).toBe('a,b\n1,"x,y"');
  });
});
