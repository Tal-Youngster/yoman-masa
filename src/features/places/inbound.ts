/**
 * Inbound (Drive → Dexie) reconciler for places.
 *
 * Single-entity-per-file. Mirrors `tripInboundReconciler`'s shape; the
 * file lives at `Trips/<slug>/Places/<slug>.md` (see `paths.ts`).
 */

import type { Place } from '@/domain/place';
import { deletePlace as deletePlaceRow, upsertPlace } from '@/lib/storage';
import type { InboundReconciler } from '@/sync/pull';

import { tryParsePlace } from './parser';

/** `Trips/<slug>/Places/<file>.md` — trip slug per the Trip Zod schema. */
const PLACE_PATH_RE = /^Trips\/[a-z0-9][a-z0-9-]*\/Places\/[^/]+\.md$/;

export const placeInboundReconciler: InboundReconciler<Place> = {
  entityType: 'place',

  matchesPath(relPath) {
    return PLACE_PATH_RE.test(relPath);
  },

  parseFile(content) {
    const parsed = tryParsePlace(content);
    return parsed ? [parsed.place] : [];
  },

  entityId(place) {
    return place.id;
  },

  async upsertEntity(place, db) {
    await upsertPlace(place, db);
  },

  async deleteEntity(id, db) {
    await deletePlaceRow(id as Place['id'], db);
  },

  async listEntityIds(db) {
    const keys = await db.places.toCollection().primaryKeys();
    return keys.filter((k) => typeof k === 'string');
  },
};
