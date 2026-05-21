import {
  addDays,
  dateRangeArray,
  daysBetween,
  eachDayInRange,
  type IsoDate,
} from '@/domain/dates';
import type { Accommodation } from '@/domain/accommodation';
import type { Trip } from '@/domain/trip';

export interface MissingNightsResult {
  trip_id: Trip['id'];
  trip_total_nights: number;
  missing: IsoDate[];
  covered: IsoDate[];
}

/**
 * Enumerate every night in [trip.start_date, trip.end_date] (inclusive of last night).
 * A night is covered iff some booked accommodation has checkin ≤ night < checkout.
 */
export function computeMissingNights(
  trip: Trip,
  accommodations: readonly Accommodation[],
): MissingNightsResult {
  const relevant = accommodations.filter(
    (a) => a.trip_id === trip.id && a.status === 'booked',
  );

  const covered = new Set<IsoDate>();
  for (const a of relevant) {
    for (const night of eachDayInRange(a.checkin, a.checkout)) covered.add(night);
  }

  const allNights = dateRangeArray(trip.start_date, addDays(trip.end_date, 1));

  const missing: IsoDate[] = [];
  const coveredList: IsoDate[] = [];
  for (const n of allNights) {
    if (covered.has(n)) coveredList.push(n);
    else missing.push(n);
  }

  return {
    trip_id: trip.id,
    trip_total_nights: allNights.length,
    missing,
    covered: coveredList,
  };
}

export interface MissingGap {
  start: IsoDate;
  end_exclusive: IsoDate;
  nights: number;
}

/** Group consecutive missing nights into contiguous gap ranges, sorted ascending. */
export function groupMissingGaps(missing: readonly IsoDate[]): MissingGap[] {
  if (missing.length === 0) return [];
  const sorted = [...missing].sort();

  const gaps: MissingGap[] = [];
  let runStart = sorted[0]!;
  let runEnd = sorted[0]!;

  const flush = () => {
    gaps.push({
      start: runStart,
      end_exclusive: addDays(runEnd, 1),
      nights: daysBetween(runStart, runEnd) + 1,
    });
  };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    if (next === addDays(runEnd, 1)) {
      runEnd = next;
    } else {
      flush();
      runStart = next;
      runEnd = next;
    }
  }
  flush();
  return gaps;
}
