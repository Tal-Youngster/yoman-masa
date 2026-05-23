/**
 * Trip reconciler.
 *
 * Bridges the trips slice with S3's sync worker. The worker calls
 *  - `fromMarkdown(content)` to read back what's in Drive.
 *  - `applyEdit(original, item)` to surgically rewrite the file on each
 *    attempt of the conflict-reconcile loop (ADR-0006).
 *  - `toMarkdown(trip, original)` for ad-hoc serialization (e.g. tests).
 *
 * Body preservation is the load-bearing invariant: if the user has
 * journaling notes below the frontmatter, an app-side rename must not erase
 * them. `applyEdit` parses the fresh Drive content, swaps the frontmatter
 * for the queued payload's Trip, and re-emits — preserving the original
 * body verbatim. For first-time creates (`original === ''`) we emit a
 * frontmatter-only file; the user adds notes later in Obsidian or in-app.
 */

import { z } from 'zod';

import { Trip } from '@/domain/trip';
import type { Reconciler } from '@/sync/queue';
import type { WriteQueueItem } from '@/sync/queue';

import { parseTrip, serializeTrip, tryParseTrip } from './parser';
import type { ParsedTrip } from './parser';

export interface TripPayload {
  trip: Trip;
  /** Optional override for the body on a create. Updates ignore this — the
   * original Drive body is preserved verbatim. */
  body?: string;
}

/** Zod schema for the queue payload — defensive parsing on the worker side. */
const TripPayloadSchema = z.object({
  trip: Trip,
  body: z.string().optional(),
});

export const tripReconciler: Reconciler<Trip, TripPayload> = {
  entityType: 'trip',

  fromMarkdown(content: string): Trip | null {
    const parsed = tryParseTrip(content);
    return parsed?.trip ?? null;
  },

  toMarkdown(entity: Trip, originalContent: string | null): string {
    if (originalContent === null || originalContent === '') {
      return serializeTrip(entity, '');
    }
    const original = tryParseTrip(originalContent);
    if (!original) return serializeTrip(entity, '');
    return serializeTrip(entity, original.body, {
      extraFrontmatter: original.extraFrontmatter,
      lineEnding: original.lineEnding,
    });
  },

  applyEdit(originalContent: string, item: WriteQueueItem<unknown>): string {
    const payload = TripPayloadSchema.parse(item.payload);
    // Create — empty original. Emit frontmatter-only; user adds notes later.
    if (originalContent === '') {
      return serializeTrip(payload.trip, payload.body ?? '');
    }
    // Update — preserve the body and any extra frontmatter keys from the
    // fresh Drive content. If the file has been replaced with something
    // unparseable, fall through to a defensive overwrite (frontmatter-only).
    // Note: ADR-0006 mentions surfacing `EditPointMissingError` when the
    // structured edit point disappears; for Trip.md the edit point is the
    // *whole frontmatter*, so a missing/malformed file is closer to "the
    // user moved Trip.md somewhere weird in Obsidian". We surface that
    // through the worker as a retry rather than dead-letter — the user can
    // recover by either restoring the file or accepting our overwrite.
    let original: ParsedTrip | null;
    try {
      original = parseTrip(originalContent);
    } catch {
      original = null;
    }
    if (!original) {
      return serializeTrip(payload.trip, '');
    }
    return serializeTrip(payload.trip, original.body, {
      extraFrontmatter: original.extraFrontmatter,
      lineEnding: original.lineEnding,
    });
  },
};
