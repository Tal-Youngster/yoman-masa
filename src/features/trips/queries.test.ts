import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isoDate } from '@/domain/dates';
import { currency } from '@/domain/money';
import { newTrip } from '@/domain/trip';
import { upsertTrip } from '@/lib/storage';
import { deleteDatabase, makeTestDb } from '@/lib/storage/test-helpers';
import type { TravelDB } from '@/lib/storage';

import {
  getActiveTripId,
  getTripBySlug,
  listTripsAll,
  setActiveTripId,
} from './queries';

let db: TravelDB;
beforeEach(() => {
  db = makeTestDb('trips-queries');
});
afterEach(async () => {
  db.close();
  await deleteDatabase(db.name);
});

const seed = async (
  overrides: Partial<Parameters<typeof newTrip>[0]>,
): Promise<ReturnType<typeof newTrip>> => {
  const trip = newTrip({
    slug: 'kyoto-2026',
    name: 'Kyoto 2026',
    start_date: isoDate('2026-09-01'),
    end_date: isoDate('2026-09-15'),
    home_currency: currency('USD'),
    ...overrides,
  });
  await upsertTrip(trip, db);
  return trip;
};

describe('Trip queries', () => {
  it('listTripsAll returns every trip', async () => {
    await seed({ slug: 'a' });
    await seed({ slug: 'b' });
    const all = await listTripsAll(db);
    expect(all.map((t) => t.slug).sort()).toEqual(['a', 'b']);
  });

  it('getTripBySlug returns the matching trip or undefined', async () => {
    const trip = await seed({ slug: 'kyoto-2026' });
    const back = await getTripBySlug('kyoto-2026', db);
    expect(back?.id).toBe(trip.id);
    expect(await getTripBySlug('not-a-slug', db)).toBeUndefined();
  });

  it('getActiveTripId / setActiveTripId round-trip and clear', async () => {
    const trip = await seed({ slug: 'kyoto-2026' });
    expect(await getActiveTripId(db)).toBeNull();
    await setActiveTripId(trip.id, db);
    expect(await getActiveTripId(db)).toBe(trip.id);
    await setActiveTripId(null, db);
    expect(await getActiveTripId(db)).toBeNull();
  });
});
