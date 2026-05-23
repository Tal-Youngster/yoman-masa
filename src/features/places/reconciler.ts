import { z } from 'zod';

import { Place } from '@/domain/place';
import type { Reconciler } from '@/sync/queue';
import type { WriteQueueItem } from '@/sync/queue';

import { parsePlace, serializePlace, tryParsePlace } from './parser';
import type { ParsedPlace } from './parser';

export interface PlacePayload {
  place: Place;
  body?: string;
}

const PlacePayloadSchema = z.object({
  place: Place,
  body: z.string().optional(),
});

export const placeReconciler: Reconciler<Place, PlacePayload> = {
  entityType: 'place',

  fromMarkdown(content: string): Place | null {
    const parsed = tryParsePlace(content);
    return parsed?.place ?? null;
  },

  toMarkdown(entity: Place, originalContent: string | null): string {
    if (originalContent === null || originalContent === '') {
      return serializePlace(entity, '');
    }
    const original = tryParsePlace(originalContent);
    if (!original) return serializePlace(entity, '');
    return serializePlace(entity, original.body, {
      extraFrontmatter: original.extraFrontmatter,
      lineEnding: original.lineEnding,
    });
  },

  applyEdit(originalContent: string, item: WriteQueueItem<unknown>): string {
    const payload = PlacePayloadSchema.parse(item.payload);
    if (originalContent === '') {
      return serializePlace(payload.place, payload.body ?? '');
    }
    let original: ParsedPlace | null;
    try {
      original = parsePlace(originalContent);
    } catch {
      original = null;
    }
    if (!original) {
      return serializePlace(payload.place, '');
    }
    return serializePlace(payload.place, original.body, {
      extraFrontmatter: original.extraFrontmatter,
      lineEnding: original.lineEnding,
    });
  },
};
