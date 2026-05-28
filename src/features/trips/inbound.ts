/**
 * Inbound (Drive → Dexie) reconciler for trips.
 *
 * Mirrors `reconciler.ts` (outbound) but parses files coming the other way:
 * the pull worker calls us with the content of a `Trips/<slug>/Trip.md` file
 * and we yield the parsed Trip for upsert. The outbound reconciler stays in
 * charge of writes; we deliberately keep the two separate per ADR-0014.
 *
 * `matchesPath` mirrors the vault convention encoded in `paths.ts` —
 * `Trips/<slug>/Trip.md` where `<slug>` matches the canonical Trip slug regex
 * (`^[a-z0-9][a-z0-9-]*$`).
 */

import type { Trip } from '@/domain/trip';
import type { TripId } from '@/domain/ids';
import {
  deleteTrip as deleteTripRow,
  upsertTrip,
} from '@/lib/storage';
import type { InboundReconciler } from '@/sync/pull';

import { tryParseTrip } from './parser';

/** `Trips/<slug>/Trip.md` — slug per the Trip Zod schema. */
const TRIP_PATH_RE = /^Trips\/[a-z0-9][a-z0-9-]*\/Trip\.md$/;

export const tripInboundReconciler: InboundReconciler<Trip> = {
  entityType: 'trip',

  matchesPath(relPath) {
    return TRIP_PATH_RE.test(relPath);
  },

  parseFile(content) {
    const parsed = tryParseTrip(content);
    // Unrecognized content (missing `type: trip`, broken frontmatter, etc.)
    // returns []. The pull worker treats that as "skip this file"; it does
    // not raise the error counter. Use throw for *malformed* input — but
    // tryParseTrip already swallows Zod errors, so we mirror that here.
    return parsed ? [parsed.trip] : [];
  },

  entityId(trip) {
    return trip.id;
  },

  async upsertEntity(trip, db) {
    await upsertTrip(trip, db);
  },

  async deleteEntity(id, db) {
    await deleteTripRow(id as TripId, db);
  },
};
