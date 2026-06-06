/**
 * Inbound (Drive → Dexie) reconciler for accommodations.
 *
 * Mirrors `tripInboundReconciler`'s shape — single-entity-per-file (per the
 * vault layout in `paths.ts`: `Trips/<slug>/Accommodations/<file>.md`), so
 * the worker treats it identically to a Trip.md.
 */

import type { Accommodation } from '@/domain/accommodation';
import {
  deleteAccommodation as deleteAccommodationRow,
  upsertAccommodation,
} from '@/lib/storage';
import type { InboundReconciler } from '@/sync/pull';

import { tryParseAccommodation } from './parser';

/** `Trips/<slug>/Accommodations/<file>.md` — slug per the Trip Zod schema.
 *  The filename can be anything (typically `<checkin>-<slug>.md` from
 *  `accommodationFilePath`) so we only constrain the directory shape. */
const ACCOMMODATION_PATH_RE = /^Trips\/[a-z0-9][a-z0-9-]*\/Accommodations\/[^/]+\.md$/;

export const accommodationInboundReconciler: InboundReconciler<Accommodation> = {
  entityType: 'accommodation',

  matchesPath(relPath) {
    return ACCOMMODATION_PATH_RE.test(relPath);
  },

  parseFile(content) {
    const parsed = tryParseAccommodation(content);
    // Unrecognized content (missing `type: accommodation`, broken
    // frontmatter, Zod validation failed) returns []. The pull worker treats
    // that as "skip this file"; it does not raise the error counter.
    return parsed ? [parsed.accommodation] : [];
  },

  entityId(acc) {
    return acc.id;
  },

  async upsertEntity(acc, db) {
    await upsertAccommodation(acc, db);
  },

  async deleteEntity(id, db) {
    await deleteAccommodationRow(id as Accommodation['id'], db);
  },

  async listEntityIds(db) {
    const keys = await db.accommodations.toCollection().primaryKeys();
    return keys.filter((k) => typeof k === 'string');
  },
};
