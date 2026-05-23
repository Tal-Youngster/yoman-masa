/**
 * Trip Dexie queries.
 *
 * Thin wrappers over `@/lib/storage` queries that the trips slice's UI
 * components consume. Keeping the slice's vocabulary local lets us evolve
 * names without churning S2's surface.
 */

import {
  db as defaultDb,
  getKV,
  listTrips,
  setKV,
  deleteKV,
} from '@/lib/storage';
import type { TravelDB } from '@/lib/storage';
import type { Trip } from '@/domain/trip';
import type { TripId } from '@/domain/ids';

/**
 * Backfill defaults for fields added after a trip was first persisted.
 * Zod defaults only apply at parse time, so rows that pre-date the field
 * come back from Dexie with the field as `undefined`. Normalizing here
 * keeps every UI consumer free of `?? []` boilerplate.
 */
function normalizeTrip(t: Trip): Trip {
  return { ...t, country_codes: t.country_codes ?? [] };
}

export async function listTripsAll(db?: TravelDB): Promise<Trip[]> {
  const trips = await listTrips(db);
  return trips.map(normalizeTrip);
}

export async function getTripBySlug(slug: string, db?: TravelDB): Promise<Trip | undefined> {
  const handle = db ?? defaultDb;
  const trip = await handle.trips.where('slug').equals(slug).first();
  return trip ? normalizeTrip(trip) : undefined;
}

export async function getActiveTripId(db?: TravelDB): Promise<TripId | null> {
  return getKV('active_trip_id', db);
}

export async function setActiveTripId(tripId: TripId | null, db?: TravelDB): Promise<void> {
  if (tripId === null) {
    await deleteKV('active_trip_id', db);
    return;
  }
  await setKV('active_trip_id', tripId, db);
}
