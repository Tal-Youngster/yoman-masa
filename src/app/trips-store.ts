import type { Trip } from '@/domain';
import { listTripsAll } from '@/features/trips/queries';
import type { TravelDB } from '@/lib/storage';

/**
 * Thin read interface for trips needed by the shell's TripSwitcher.
 * S5 (Trips slice) provides a Dexie-backed implementation via
 * `createDexieTripsStore`. Tests continue to use `createMockTripsStore`.
 */
export interface TripsStore {
  list(): Promise<Trip[]>;
}

/** Empty mock used in dev until S5 lands real trip storage. */
export function createMockTripsStore(initial: Trip[] = []): TripsStore {
  return {
    list(): Promise<Trip[]> {
      return Promise.resolve(initial);
    },
  };
}

/** Reads trips from Dexie. The app entrypoint wires this up. */
export function createDexieTripsStore(db?: TravelDB): TripsStore {
  return {
    list(): Promise<Trip[]> {
      return listTripsAll(db);
    },
  };
}
