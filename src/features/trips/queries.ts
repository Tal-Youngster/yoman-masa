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
  listTripsByStatus as storageListTripsByStatus,
  setKV,
  deleteKV,
} from '@/lib/storage';
import type { TravelDB } from '@/lib/storage';
import type { Trip, TripStatus } from '@/domain/trip';
import type { TripId } from '@/domain/ids';

export async function listTripsAll(db?: TravelDB): Promise<Trip[]> {
  return listTrips(db);
}

export async function listTripsByStatus(status: TripStatus, db?: TravelDB): Promise<Trip[]> {
  return storageListTripsByStatus(status, db);
}

export async function getTripBySlug(slug: string, db?: TravelDB): Promise<Trip | undefined> {
  const handle = db ?? defaultDb;
  return handle.trips.where('slug').equals(slug).first();
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
