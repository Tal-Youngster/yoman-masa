import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { computeMissingNights, groupMissingGaps } from './compute';
import { newTrip, type Trip } from '@/domain/trip';
import { newAccommodation, type Accommodation } from '@/domain/accommodation';
import { addDays, isoDate, type IsoDate } from '@/domain/dates';
import { currency } from '@/domain/money';

const TRIP: Trip = newTrip({
  slug: 'test-trip',
  name: 'Test Trip',
  start_date: isoDate('2026-07-01'),
  end_date: isoDate('2026-07-10'),
  home_currency: currency('USD'),
  status: 'active',
});

const booked = (
  checkin: string,
  checkout: string,
  trip_id: Trip['id'] = TRIP.id,
): Accommodation =>
  newAccommodation({
    trip_id,
    status: 'booked',
    name: `Stay ${checkin}`,
    service: 'airbnb',
    checkin: isoDate(checkin),
    checkout: isoDate(checkout),
  });

describe('computeMissingNights', () => {
  it('flags every night when there are no accommodations', () => {
    const r = computeMissingNights(TRIP, []);
    expect(r.trip_total_nights).toBe(10);
    expect(r.missing).toHaveLength(10);
    expect(r.covered).toHaveLength(0);
  });

  it('treats checkout day as NOT a stay night', () => {
    // booked Jul 1 → Jul 3 covers nights Jul 1, Jul 2 only.
    const r = computeMissingNights(TRIP, [booked('2026-07-01', '2026-07-03')]);
    expect(r.covered).toEqual([isoDate('2026-07-01'), isoDate('2026-07-02')]);
    expect(r.missing).toContain(isoDate('2026-07-03'));
    expect(r.missing).not.toContain(isoDate('2026-07-02'));
  });

  it('back-to-back same-day bookings leave no gap', () => {
    const r = computeMissingNights(TRIP, [
      booked('2026-07-01', '2026-07-05'),
      booked('2026-07-05', '2026-07-11'),
    ]);
    expect(r.missing).toEqual([]);
    expect(r.covered).toHaveLength(10);
  });

  it('deduplicates overlapping bookings', () => {
    const r = computeMissingNights(TRIP, [
      booked('2026-07-01', '2026-07-05'),
      booked('2026-07-03', '2026-07-08'),
    ]);
    expect(r.covered).toHaveLength(7); // Jul 1..7
    expect(r.missing).toEqual([
      isoDate('2026-07-08'),
      isoDate('2026-07-09'),
      isoDate('2026-07-10'),
    ]);
  });

  it('ignores wishlist and cancelled accommodations', () => {
    const wishlist = newAccommodation({
      trip_id: TRIP.id,
      status: 'wishlist',
      name: 'Wishlist Stay',
      service: 'airbnb',
      checkin: isoDate('2026-07-01'),
      checkout: isoDate('2026-07-05'),
    });
    const cancelled = newAccommodation({
      trip_id: TRIP.id,
      status: 'cancelled',
      name: 'Cancelled Stay',
      service: 'booking',
      checkin: isoDate('2026-07-05'),
      checkout: isoDate('2026-07-11'),
    });
    const r = computeMissingNights(TRIP, [wishlist, cancelled]);
    expect(r.missing).toHaveLength(10);
  });

  it('ignores accommodations from other trips', () => {
    const other = newTrip({
      slug: 'other',
      name: 'Other',
      start_date: isoDate('2026-08-01'),
      end_date: isoDate('2026-08-10'),
      home_currency: currency('USD'),
      status: 'planned',
    });
    const otherAcc = booked('2026-07-01', '2026-07-11', other.id);
    const r = computeMissingNights(TRIP, [otherAcc]);
    expect(r.missing).toHaveLength(10);
  });

  it('single-night booking covers exactly one night', () => {
    const r = computeMissingNights(TRIP, [booked('2026-07-05', '2026-07-06')]);
    expect(r.covered).toEqual([isoDate('2026-07-05')]);
  });

  it('trip with start_date == end_date has exactly one night', () => {
    const oneNight = newTrip({
      slug: 'one',
      name: 'One Night',
      start_date: isoDate('2026-07-05'),
      end_date: isoDate('2026-07-05'),
      home_currency: currency('USD'),
      status: 'planned',
    });
    const r = computeMissingNights(oneNight, []);
    expect(r.trip_total_nights).toBe(1);
    expect(r.missing).toEqual([isoDate('2026-07-05')]);
  });

  it('handles bookings extending past the trip end', () => {
    const r = computeMissingNights(TRIP, [booked('2026-07-08', '2026-07-20')]);
    expect(r.covered).toEqual([
      isoDate('2026-07-08'),
      isoDate('2026-07-09'),
      isoDate('2026-07-10'),
    ]);
  });

  it('handles bookings starting before the trip start', () => {
    const r = computeMissingNights(TRIP, [booked('2026-06-25', '2026-07-03')]);
    expect(r.covered).toEqual([isoDate('2026-07-01'), isoDate('2026-07-02')]);
  });

  it('property: covered and missing partition the trip nights', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.integer({ min: -3, max: 12 }), fc.integer({ min: -2, max: 14 })),
          { maxLength: 8 },
        ),
        (ranges) => {
          const accs: Accommodation[] = ranges
            .filter(([s, e]) => s < e)
            .map(([s, e]) =>
              booked(
                addDays(TRIP.start_date, s),
                addDays(TRIP.start_date, e),
              ),
            );
          const r = computeMissingNights(TRIP, accs);
          const missingSet = new Set<IsoDate>(r.missing);
          for (const n of r.covered) {
            if (missingSet.has(n)) return false;
          }
          return r.covered.length + r.missing.length === r.trip_total_nights;
        },
      ),
    );
  });
});

describe('groupMissingGaps', () => {
  it('returns empty for no missing nights', () => {
    expect(groupMissingGaps([])).toEqual([]);
  });

  it('groups consecutive nights into one gap', () => {
    const missing: IsoDate[] = [
      isoDate('2026-07-03'),
      isoDate('2026-07-04'),
      isoDate('2026-07-05'),
    ];
    expect(groupMissingGaps(missing)).toEqual([
      { start: isoDate('2026-07-03'), end_exclusive: isoDate('2026-07-06'), nights: 3 },
    ]);
  });

  it('splits non-consecutive missing into multiple gaps', () => {
    const missing: IsoDate[] = [
      isoDate('2026-07-03'),
      isoDate('2026-07-04'),
      isoDate('2026-07-07'),
      isoDate('2026-07-10'),
      isoDate('2026-07-11'),
    ];
    const gaps = groupMissingGaps(missing);
    expect(gaps).toHaveLength(3);
    expect(gaps[0]).toEqual({
      start: isoDate('2026-07-03'),
      end_exclusive: isoDate('2026-07-05'),
      nights: 2,
    });
    expect(gaps[1]).toEqual({
      start: isoDate('2026-07-07'),
      end_exclusive: isoDate('2026-07-08'),
      nights: 1,
    });
    expect(gaps[2]).toEqual({
      start: isoDate('2026-07-10'),
      end_exclusive: isoDate('2026-07-12'),
      nights: 2,
    });
  });

  it('handles a single missing night', () => {
    expect(groupMissingGaps([isoDate('2026-07-05')])).toEqual([
      { start: isoDate('2026-07-05'), end_exclusive: isoDate('2026-07-06'), nights: 1 },
    ]);
  });
});
