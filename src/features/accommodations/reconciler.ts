import { z } from 'zod';
import { Accommodation } from '@/domain/accommodation';
import type { Reconciler, WriteQueueItem } from '@/sync/queue';
import { parseAccommodation, serializeAccommodation, tryParseAccommodation } from './parser';
import type { ParsedAccommodation } from './parser';

export interface AccommodationPayload {
  accommodation: Accommodation;
  body?: string;
}

const AccommodationPayloadSchema = z.object({
  accommodation: Accommodation,
  body: z.string().optional(),
});

export const accommodationReconciler: Reconciler<Accommodation, AccommodationPayload> = {
  entityType: 'accommodation',

  fromMarkdown(content: string): Accommodation | null {
    const parsed = tryParseAccommodation(content);
    return parsed?.accommodation ?? null;
  },

  toMarkdown(entity: Accommodation, originalContent: string | null): string {
    if (originalContent === null || originalContent === '') {
      return serializeAccommodation(entity, '');
    }
    const original = tryParseAccommodation(originalContent);
    if (!original) return serializeAccommodation(entity, '');
    return serializeAccommodation(entity, original.body, {
      extraFrontmatter: original.extraFrontmatter,
      lineEnding: original.lineEnding,
    });
  },

  applyEdit(originalContent: string, item: WriteQueueItem<unknown>): string {
    const payload = AccommodationPayloadSchema.parse(item.payload);
    if (originalContent === '') {
      return serializeAccommodation(payload.accommodation, payload.body ?? '');
    }
    let original: ParsedAccommodation | null;
    try {
      original = parseAccommodation(originalContent);
    } catch {
      original = null;
    }
    if (!original) {
      return serializeAccommodation(payload.accommodation, '');
    }
    return serializeAccommodation(payload.accommodation, original.body, {
      extraFrontmatter: original.extraFrontmatter,
      lineEnding: original.lineEnding,
    });
  },
};
