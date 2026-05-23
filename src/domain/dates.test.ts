import { describe, expect, it } from 'vitest';
import { addDays, compareDates, dateRangeArray, daysBetween, isoDate, IsoDate } from './dates';

describe('IsoDate parsing', () => {
  it('accepts valid dates', () => {
    expect(IsoDate.parse('2026-05-21')).toBe('2026-05-21');
    expect(IsoDate.parse('2024-02-29')).toBe('2024-02-29'); // leap day
  });

  it('rejects invalid formats', () => {
    expect(() => IsoDate.parse('2026-5-21')).toThrow();
    expect(() => IsoDate.parse('21/05/2026')).toThrow();
    expect(() => IsoDate.parse('')).toThrow();
  });

  it('rejects invalid calendar dates', () => {
    expect(() => IsoDate.parse('2026-02-30')).toThrow();
    expect(() => IsoDate.parse('2025-02-29')).toThrow(); // not a leap year
    expect(() => IsoDate.parse('2026-13-01')).toThrow();
    expect(() => IsoDate.parse('2026-00-15')).toThrow();
  });
});

describe('addDays', () => {
  it('adds and subtracts days correctly', () => {
    expect(addDays(isoDate('2026-05-21'), 1)).toBe('2026-05-22');
    expect(addDays(isoDate('2026-05-21'), -1)).toBe('2026-05-20');
    expect(addDays(isoDate('2026-05-21'), 0)).toBe('2026-05-21');
  });

  it('crosses month boundaries', () => {
    expect(addDays(isoDate('2026-05-31'), 1)).toBe('2026-06-01');
    expect(addDays(isoDate('2026-06-01'), -1)).toBe('2026-05-31');
  });

  it('crosses year boundaries', () => {
    expect(addDays(isoDate('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(isoDate('2027-01-01'), -1)).toBe('2026-12-31');
  });

  it('handles leap years', () => {
    expect(addDays(isoDate('2024-02-28'), 1)).toBe('2024-02-29');
    expect(addDays(isoDate('2024-02-29'), 1)).toBe('2024-03-01');
    expect(addDays(isoDate('2025-02-28'), 1)).toBe('2025-03-01');
  });

  it('is immune to local DST shifts (uses UTC math)', () => {
    // In US/EU, DST transitions are in March/November. Crossing them
    // with local-time math can lose or duplicate a day.
    expect(addDays(isoDate('2026-03-08'), 1)).toBe('2026-03-09'); // US spring forward
    expect(addDays(isoDate('2026-11-01'), 1)).toBe('2026-11-02'); // US fall back
    expect(addDays(isoDate('2026-03-29'), 1)).toBe('2026-03-30'); // EU spring forward
  });
});

describe('daysBetween', () => {
  it('returns the unsigned diff in days', () => {
    expect(daysBetween(isoDate('2026-05-01'), isoDate('2026-05-10'))).toBe(9);
    expect(daysBetween(isoDate('2026-05-10'), isoDate('2026-05-01'))).toBe(-9);
    expect(daysBetween(isoDate('2026-05-01'), isoDate('2026-05-01'))).toBe(0);
  });
});

describe('compareDates', () => {
  it('orders by lexical equality with calendar semantics', () => {
    expect(compareDates(isoDate('2026-05-01'), isoDate('2026-05-02'))).toBe(-1);
    expect(compareDates(isoDate('2026-05-02'), isoDate('2026-05-01'))).toBe(1);
    expect(compareDates(isoDate('2026-05-01'), isoDate('2026-05-01'))).toBe(0);
  });
});

describe('dateRangeArray (half-open)', () => {
  it('enumerates [start, end)', () => {
    expect(dateRangeArray(isoDate('2026-05-01'), isoDate('2026-05-04'))).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
    ]);
  });

  it('returns empty when start >= end', () => {
    expect(dateRangeArray(isoDate('2026-05-04'), isoDate('2026-05-04'))).toEqual([]);
    expect(dateRangeArray(isoDate('2026-05-05'), isoDate('2026-05-04'))).toEqual([]);
  });
});
