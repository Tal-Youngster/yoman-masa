/**
 * Wiring between the shopping UI and the persistence + sync layers.
 *
 * Each mutation:
 *  1. Upserts the item in Dexie (the UI reads from Dexie, so this is instant).
 *  2. Enqueues a line-level write against the scope's `Shopping.md` file.
 *
 * A "scope" is either a trip (per-trip `Shopping.md`) or `null`/`null` for the
 * cross-trip General list. Like tasks, we enqueue with `fileId`/`baseRevision`
 * null and let the worker resolve the file by path and reconcile on conflict.
 *
 * Deletes follow the v1 vault convention: the row is removed locally and a
 * `delete` op is enqueued. The outbound reconciler removes the line; inbound
 * picks up out-of-band Obsidian deletes via the `last_entity_ids` snapshot.
 */

import { ulid } from 'ulid';
import { z } from 'zod';
import { ShoppingItem, newShoppingItem } from '@/domain/shopping-item';
import type { TripId } from '@/domain/ids';
import { todayIso } from '@/domain/dates';
import { Currency, Money } from '@/domain/money';
import type { TravelDB } from '@/lib/storage';
import type { WriteQueue } from '@/sync/queue';
import {
  upsertShoppingItem,
  deleteShoppingItem,
  listShoppingItemsByTrip,
  listGeneralShoppingItems,
} from './queries';
import type { ShoppingItemPayload } from './reconciler';
import { shoppingFilePath } from './paths';

/** Identifies which `Shopping.md` a mutation targets. `null`/`null` = General. */
export interface ShoppingScope {
  tripId: TripId | null;
  slug: string | null;
}

const AddInput = z.object({
  name: z.string().min(1),
  bought: z.boolean().default(false),
  quantity: z.number().int().positive().optional(),
  estimated_cost: Money.optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type AddShoppingItemInput = z.input<typeof AddInput>;

export interface ShoppingAdminDeps {
  db?: TravelDB;
  writeQueue: WriteQueue;
  /** Vault path of the Travel folder, used to resolve the Shopping.md path. */
  travelFolderPath: string;
  /** `yyyy-mm-dd` today, in UTC. Tests inject; production passes the real value. */
  today?: () => string;
}

export interface ShoppingAdminService {
  addItem(scope: ShoppingScope, input: AddShoppingItemInput): Promise<ShoppingItem>;
  updateItem(scope: ShoppingScope, item: ShoppingItem): Promise<void>;
  /** Flip bought; stamps/clears `bought_date` when crossing the flag. */
  setBought(scope: ShoppingScope, item: ShoppingItem, bought: boolean): Promise<void>;
  removeItem(scope: ShoppingScope, item: ShoppingItem): Promise<void>;
  listByScope(scope: ShoppingScope): Promise<ShoppingItem[]>;
}

export function createShoppingAdmin(deps: ShoppingAdminDeps): ShoppingAdminService {
  const today = deps.today ?? (() => todayIso());

  async function enqueue(
    scope: ShoppingScope,
    item: ShoppingItem,
    op: 'create' | 'update' | 'delete',
  ): Promise<void> {
    const payload: ShoppingItemPayload = { item };
    await deps.writeQueue.enqueue({
      id: ulid(),
      entityType: 'shopping_item',
      entityId: item.id,
      op,
      payload,
      baseRevision: null,
      fileId: null,
      resolvedPath: shoppingFilePath(deps.travelFolderPath, scope.slug),
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    async addItem(scope, input): Promise<ShoppingItem> {
      const fields = AddInput.parse(input);
      const item = newShoppingItem({
        trip_id: scope.tripId,
        name: fields.name,
        bought: fields.bought,
        tags: fields.tags,
        ...(fields.quantity !== undefined ? { quantity: fields.quantity } : {}),
        ...(fields.estimated_cost
          ? { estimated_cost: fields.estimated_cost }
          : {}),
        ...(fields.category ? { category: fields.category } : {}),
        ...(fields.bought ? { bought_date: today() } : {}),
      });
      await upsertShoppingItem(item, deps.db);
      await enqueue(scope, item, 'create');
      return item;
    },

    async updateItem(scope, item): Promise<void> {
      const updated = ShoppingItem.parse(item);
      await upsertShoppingItem(updated, deps.db);
      await enqueue(scope, updated, 'update');
    },

    async setBought(scope, item, bought): Promise<void> {
      const becomingBought = bought && !item.bought;
      const leavingBought = !bought && item.bought;
      const next = ShoppingItem.parse({
        ...item,
        bought,
        ...(becomingBought ? { bought_date: today() } : {}),
        ...(leavingBought ? { bought_date: undefined } : {}),
      });
      await upsertShoppingItem(next, deps.db);
      await enqueue(scope, next, 'update');
    },

    async removeItem(scope, item): Promise<void> {
      await deleteShoppingItem(item.id, deps.db);
      await enqueue(scope, item, 'delete');
    },

    async listByScope(scope): Promise<ShoppingItem[]> {
      return scope.tripId === null
        ? listGeneralShoppingItems(deps.db)
        : listShoppingItemsByTrip(scope.tripId, deps.db);
    },
  };
}

// `Currency` is re-exported so callers building an `estimated_cost` Money have
// a single import point.
export { Currency };
