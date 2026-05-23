import { describe, expect, it } from 'vitest';

import { getDisplayStatus } from './status';

describe('getDisplayStatus', () => {
  const trip = { start_date: '2026-06-01', end_date: '2026-06-15' };

  it('returns planned when today is before start_date', () => {
    expect(getDisplayStatus(trip, '2026-05-31')).toBe('planned');
  });

  it('returns active when today equals start_date', () => {
    expect(getDisplayStatus(trip, '2026-06-01')).toBe('active');
  });

  it('returns active when today is between start_date and end_date', () => {
    expect(getDisplayStatus(trip, '2026-06-07')).toBe('active');
  });

  it('returns active when today equals end_date', () => {
    expect(getDisplayStatus(trip, '2026-06-15')).toBe('active');
  });

  it('returns completed when today is after end_date', () => {
    expect(getDisplayStatus(trip, '2026-06-16')).toBe('completed');
  });
});
