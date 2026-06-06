import type { TravelDB } from '@/lib/storage';
import {
  upsertShoppingItem as dbUpsert,
  getShoppingItem as dbGet,
  deleteShoppingItem as dbDelete,
  shoppingItemsByTrip as dbByTrip,
  generalShoppingItems as dbGeneral,
} from '@/lib/storage/queries';
import type { ShoppingItem } from '@/domain/shopping-item';
import type { TripId } from '@/domain/ids';

/**
 * Sort: not-yet-bought first (by name, case-insensitive), then bought items
 * (also by name). Stable enough for a list view; the form/dashboard re-derive
 * their own order if they need something else.
 */
function compareItems(a: ShoppingItem, b: ShoppingItem): number {
  if (a.bought !== b.bought) return a.bought ? 1 : -1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

export async function listShoppingItemsByTrip(
  tripId: TripId,
  db?: TravelDB,
): Promise<ShoppingItem[]> {
  return (await dbByTrip(tripId, db)).sort(compareItems);
}

export async function listGeneralShoppingItems(db?: TravelDB): Promise<ShoppingItem[]> {
  return (await dbGeneral(db)).sort(compareItems);
}

export async function upsertShoppingItem(item: ShoppingItem, db?: TravelDB): Promise<void> {
  await dbUpsert(item, db);
}

export async function getShoppingItem(
  id: ShoppingItem['id'],
  db?: TravelDB,
): Promise<ShoppingItem | undefined> {
  return dbGet(id, db);
}

export async function deleteShoppingItem(id: ShoppingItem['id'], db?: TravelDB): Promise<void> {
  await dbDelete(id, db);
}
