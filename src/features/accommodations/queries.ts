import type { TravelDB } from '@/lib/storage';
import {
  upsertAccommodation as dbUpsert,
  getAccommodation as dbGet,
  deleteAccommodation as dbDelete,
  accommodationsByTrip as dbListByTrip,
  accommodationsByTripAndStatus as dbListByTripAndStatus,
} from '@/lib/storage/queries';
import type { Accommodation, AccommodationStatus } from '@/domain/accommodation';
import type { TripId } from '@/domain/ids';

export async function listAccommodationsByTrip(tripId: TripId, db?: TravelDB): Promise<Accommodation[]> {
  const accs = await dbListByTrip(tripId, db);
  return accs.sort((a, b) => a.checkin.localeCompare(b.checkin));
}

export async function listAccommodationsByTripAndStatus(
  tripId: TripId,
  status: AccommodationStatus,
  db?: TravelDB,
): Promise<Accommodation[]> {
  const accs = await dbListByTripAndStatus(tripId, status, db);
  return accs.sort((a, b) => a.checkin.localeCompare(b.checkin));
}

export async function upsertAccommodation(accommodation: Accommodation, db?: TravelDB): Promise<void> {
  await dbUpsert(accommodation, db);
}

export async function getAccommodation(id: Accommodation['id'], db?: TravelDB): Promise<Accommodation | undefined> {
  return dbGet(id, db);
}

export async function deleteAccommodation(id: Accommodation['id'], db?: TravelDB): Promise<void> {
  await dbDelete(id, db);
}
