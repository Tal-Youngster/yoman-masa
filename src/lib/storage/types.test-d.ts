/**
 * Compile-time only: this file is imported by `types.test.ts` so vitest picks it up,
 * but the assertions are static — they verify that the typed CRUD signatures reject
 * malformed inputs at compile time. The `@ts-expect-error` lines MUST stay errors;
 * if any becomes valid, tsc will fail.
 */
import type { Trip } from '@/domain/trip';
import { upsertTrip, setKV, getKV } from './queries';

declare const trip: Trip;
declare const partial: Partial<Trip>;
declare const wrongShape: { id: 'not-a-trip-id'; foo: 'bar' };

export const typeChecks = {
  acceptsAFullTrip: () => upsertTrip(trip),

  // @ts-expect-error — partial Trip is missing required fields
  rejectsPartialTrip: () => upsertTrip(partial),

  // @ts-expect-error — payload has none of the required Trip fields
  rejectsWrongShape: () => upsertTrip(wrongShape),

  // @ts-expect-error — `null` is not a valid Trip
  rejectsNull: () => upsertTrip(null),

  // @ts-expect-error — kv keys are a closed union
  rejectsUnknownKVKey: () => getKV('nope_not_a_real_key'),

  // @ts-expect-error — value type per key is enforced
  rejectsWrongKVValueType: () => setKV('drive_changes_page_token', 42),
};
