/**
 * Inbound (Drive → Dexie) reconciler for the shopping ledger.
 *
 * Two valid locations per ADR-0010:
 *   - `Trips/<slug>/Shopping.md`   — trip-scoped list
 *   - `General/Shopping.md`        — cross-trip "General" list (trip_id: null)
 *
 * Multi-entity per file (each `- [ ] …` line is an item). The pull worker
 * handles per-row delete bookkeeping via `file_meta.last_entity_ids`
 * (ADR-0014 addendum) — we only have to parse and return the current set.
 */

import type { ShoppingItem } from '@/domain/shopping-item';
import { deleteShoppingItem, upsertShoppingItem } from '@/lib/storage';
import type { InboundReconciler } from '@/sync/pull';

import { parseShoppingFile } from './parser';

/** Per-trip: `Trips/<slug>/Shopping.md`. */
const TRIP_SHOPPING_PATH_RE = /^Trips\/[a-z0-9][a-z0-9-]*\/Shopping\.md$/;
/** Cross-trip "General" list. */
const GENERAL_SHOPPING_PATH_RE = /^General\/Shopping\.md$/;

export const shoppingInboundReconciler: InboundReconciler<ShoppingItem> = {
  entityType: 'shopping_item',

  matchesPath(relPath) {
    return TRIP_SHOPPING_PATH_RE.test(relPath) || GENERAL_SHOPPING_PATH_RE.test(relPath);
  },

  parseFile(content) {
    try {
      return parseShoppingFile(content).items;
    } catch {
      // Unparseable frontmatter (missing `type: shopping`, broken yaml). Treat
      // as "skip this file" rather than raising the error counter — a stray
      // file with the right path but wrong content shouldn't poison the pass.
      return [];
    }
  },

  entityId(item) {
    return item.id;
  },

  async upsertEntity(item, db) {
    await upsertShoppingItem(item, db);
  },

  async deleteEntity(id, db) {
    await deleteShoppingItem(id as ShoppingItem['id'], db);
  },

  async listEntityIds(db) {
    const keys = await db.shopping_items.toCollection().primaryKeys();
    return keys.filter((k) => typeof k === 'string');
  },
};
