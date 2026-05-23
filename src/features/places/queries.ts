/**
 * Place Dexie queries.
 *
 * Thin wrappers over `@/lib/storage` queries that the places slice's UI
 * components consume. Keeping the slice's vocabulary local lets us evolve
 * names without churning S2's surface.
 */

import {
  upsertPlace as _upsertPlace,
  getPlace as _getPlace,
  deletePlace as _deletePlace,
  placesByTrip as _placesByTrip,
  visitedPlacesByTrip as _visitedPlacesByTrip,
} from '@/lib/storage';
import type { TravelDB } from '@/lib/storage';
import type { Place } from '@/domain/place';
import type { PlaceId, TripId } from '@/domain/ids';

/**
 * Backfill defaults for fields added after a place was first persisted.
 */
function normalizePlace(p: Place): Place {
  return {
    ...p,
    visited: p.visited ?? false,
    notes: p.notes ?? '',
  };
}

export async function upsertPlace(place: Place, db?: TravelDB): Promise<void> {
  return _upsertPlace(place, db);
}

export async function getPlace(id: PlaceId, db?: TravelDB): Promise<Place | undefined> {
  const p = await _getPlace(id, db);
  return p ? normalizePlace(p) : undefined;
}

export async function deletePlace(id: PlaceId, db?: TravelDB): Promise<void> {
  return _deletePlace(id, db);
}

export async function placesByTrip(tripId: TripId, db?: TravelDB): Promise<Place[]> {
  const places = await _placesByTrip(tripId, db);
  return places.map(normalizePlace);
}

export async function visitedPlacesByTrip(tripId: TripId, db?: TravelDB): Promise<Place[]> {
  const places = await _visitedPlacesByTrip(tripId, db);
  return places.map(normalizePlace);
}
