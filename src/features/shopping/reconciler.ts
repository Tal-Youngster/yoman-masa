/**
 * Shopping reconciler — line-level patching via S1 primitives.
 *
 * Like tasks (and unlike file-per-entity trips/accommodations), one shopping
 * item is one line in a per-trip (or General) `Shopping.md`. `applyEdit` finds
 * the line by its `^s-<ulid>` block ref and inserts/replaces/removes it without
 * disturbing the rest of the file — headings, notes, and other items the user
 * keeps there.
 *
 * On the first write to a file that doesn't exist yet, the worker passes empty
 * `originalContent`; we emit minimal frontmatter plus the single line.
 *
 * Edits preserve the existing line's indentation so an item nested under a
 * heading in Obsidian stays nested.
 */

import { z } from 'zod';
import {
  parseFrontmatter,
  serializeFrontmatter,
  findLineByBlockRef,
  replaceLine,
  insertLine,
  removeLine,
} from '@/lib/markdown';
import type { Reconciler, WriteQueueItem } from '@/sync/queue';
import { ShoppingItem } from '@/domain/shopping-item';
import { parseShoppingFile } from './parser';
import { serializeShoppingItemLine, serializeShoppingFile } from './serializer';
import { shoppingItemBlockRef } from './paths';

export interface ShoppingItemPayload {
  item: ShoppingItem;
}

const ShoppingItemPayloadSchema = z.object({ item: ShoppingItem });

function leadingWhitespace(line: string): string {
  return /^(\s*)/.exec(line)?.[1] ?? '';
}

export const shoppingItemReconciler: Reconciler<ShoppingItem, ShoppingItemPayload> = {
  entityType: 'shopping_item',

  fromMarkdown(content: string): ShoppingItem | null {
    try {
      return parseShoppingFile(content).items[0] ?? null;
    } catch {
      return null;
    }
  },

  /**
   * Not the primary path (an entity-as-file rewrite would drop sibling lines).
   * Returns the original content if parseable, else a single-item file.
   */
  toMarkdown(entity: ShoppingItem, originalContent: string | null): string {
    if (originalContent === null || originalContent === '') {
      return serializeShoppingFile({ tripId: entity.trip_id, items: [entity] });
    }
    return originalContent;
  },

  applyEdit(originalContent: string, item: WriteQueueItem<unknown>): string {
    const { item: entity } = ShoppingItemPayloadSchema.parse(item.payload);
    const blockRef = shoppingItemBlockRef(entity.id);

    if (originalContent === '') {
      if (item.op === 'delete') return '';
      return serializeShoppingFile({ tripId: entity.trip_id, items: [entity] });
    }

    const parsed = parseFrontmatter(originalContent);
    const body = parsed.body;
    const existing = findLineByBlockRef(body, blockRef);

    let nextBody: string;
    if (item.op === 'delete') {
      if (!existing) return originalContent;
      nextBody = removeLine(body, blockRef);
    } else if (existing) {
      nextBody = replaceLine(
        body,
        blockRef,
        serializeShoppingItemLine(entity, leadingWhitespace(existing.line)),
      );
    } else {
      nextBody = insertLine(body, serializeShoppingItemLine(entity));
    }

    return serializeFrontmatter(parsed.frontmatter, nextBody, { lineEnding: parsed.lineEnding });
  },
};
