import type { Trip } from '@/domain';

/**
 * Thin read interface for trips needed by the shell's TripSwitcher.
 * S5 (Trips slice) replaces this with a Dexie- and Drive-backed implementation.
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
