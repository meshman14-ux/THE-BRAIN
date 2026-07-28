import { describe, it, expect } from 'vitest';
import { toISO, addDays, nextWeekday, ukDate, humanDate } from '../src/lib/dates';

const WED = new Date('2026-08-05T10:00:00');

describe('date helpers', () => {
  it('toISO / addDays cross month and year boundaries', () => {
    expect(toISO(WED)).toBe('2026-08-05');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-08-05', -6)).toBe('2026-07-30');
  });
  it('nextWeekday is strictly in the future', () => {
    expect(nextWeekday('friday', WED)).toBe('2026-08-07');
    expect(nextWeekday('wed', WED)).toBe('2026-08-12');
    expect(nextWeekday('notaday', WED)).toBeNull();
  });
  it('ukDate validates real calendar dates', () => {
    expect(ukDate('29/2/2028', WED)).toBe('2028-02-29');  // leap year ok
    expect(ukDate('29/2/2027', WED)).toBeNull();          // not a leap year
    expect(ukDate('31/02', WED)).toBeNull();
    expect(ukDate('0/5', WED)).toBeNull();
  });
  it('humanDate labels', () => {
    expect(humanDate('2026-08-05', WED)).toBe('Today');
    expect(humanDate('2026-08-06', WED)).toBe('Tomorrow');
    expect(humanDate('2026-08-10', WED)).toMatch(/Mon 10 Aug/);
    expect(humanDate('2027-01-03', WED)).toMatch(/3 Jan 2027/);
  });
});
