import type { Trip, TripStatus } from '@/domain/trip';
import type { Accommodation, AccommodationStatus } from '@/domain/accommodation';
import type { Place } from '@/domain/place';
import type { Expense } from '@/domain/expense';
import type { Task } from '@/domain/task';
import type { ShoppingItem } from '@/domain/shopping-item';
import type { Article } from '@/domain/article';
import type { TripId, PlaceId } from '@/domain/ids';

import { db as defaultDb, type TravelDB } from './db';
import type {
  FileMeta,
  KVKey,
  KVValueMap,
  WriteQueueItem,
  EntityType,
} from './types';

/**
 * Strip keys whose value is exactly `undefined` before handing the object to Dexie.
 * Under `exactOptionalPropertyTypes`, leaving `key: undefined` in a stored object causes
 * Dexie to index `undefined` for that key, which surprises later queries.
 * This is shallow — entities here are flat enough that nested undefineds don't occur
 * (zod replaces them with the default or omits the key).
 */
function stripUndefined<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/** Allow tests / app boot to inject a non-default db (e.g. a per-test instance). */
type DB = TravelDB;
const dbHandle = (db?: DB): DB => db ?? defaultDb;

// ────────────────────────────────────────────────────────────────────────────
// Trips
// ────────────────────────────────────────────────────────────────────────────

export async function upsertTrip(t: Trip, db?: DB): Promise<void> {
  await dbHandle(db).trips.put(stripUndefined(t));
}

export async function getTrip(id: TripId, db?: DB): Promise<Trip | undefined> {
  return dbHandle(db).trips.get(id);
}

export async function deleteTrip(id: TripId, db?: DB): Promise<void> {
  await dbHandle(db).trips.delete(id);
}

export async function listTrips(db?: DB): Promise<Trip[]> {
  return dbHandle(db).trips.toArray();
}

export async function listTripsByStatus(s: TripStatus, db?: DB): Promise<Trip[]> {
  return dbHandle(db).trips.where('status').equals(s).toArray();
}

// ────────────────────────────────────────────────────────────────────────────
// Accommodations
// ────────────────────────────────────────────────────────────────────────────

export async function upsertAccommodation(a: Accommodation, db?: DB): Promise<void> {
  await dbHandle(db).accommodations.put(stripUndefined(a));
}

export async function getAccommodation(
  id: Accommodation['id'],
  db?: DB,
): Promise<Accommodation | undefined> {
  return dbHandle(db).accommodations.get(id);
}

export async function deleteAccommodation(id: Accommodation['id'], db?: DB): Promise<void> {
  await dbHandle(db).accommodations.delete(id);
}

export async function accommodationsByTrip(tripId: TripId, db?: DB): Promise<Accommodation[]> {
  return dbHandle(db).accommodations.where('trip_id').equals(tripId).toArray();
}

export async function accommodationsByTripAndStatus(
  tripId: TripId,
  status: AccommodationStatus,
  db?: DB,
): Promise<Accommodation[]> {
  return dbHandle(db)
    .accommodations.where('trip_id')
    .equals(tripId)
    .filter((a) => a.status === status)
    .toArray();
}

// ────────────────────────────────────────────────────────────────────────────
// Places
// ────────────────────────────────────────────────────────────────────────────

export async function upsertPlace(p: Place, db?: DB): Promise<void> {
  await dbHandle(db).places.put(stripUndefined(p));
}

export async function getPlace(id: PlaceId, db?: DB): Promise<Place | undefined> {
  return dbHandle(db).places.get(id);
}

export async function deletePlace(id: PlaceId, db?: DB): Promise<void> {
  await dbHandle(db).places.delete(id);
}

export async function placesByTrip(tripId: TripId, db?: DB): Promise<Place[]> {
  return dbHandle(db).places.where('trip_id').equals(tripId).toArray();
}

export async function visitedPlacesByTrip(tripId: TripId, db?: DB): Promise<Place[]> {
  return dbHandle(db)
    .places.where('trip_id')
    .equals(tripId)
    .filter((p) => p.visited)
    .toArray();
}

// ────────────────────────────────────────────────────────────────────────────
// Expenses
// ────────────────────────────────────────────────────────────────────────────

export async function upsertExpense(e: Expense, db?: DB): Promise<void> {
  await dbHandle(db).expenses.put(stripUndefined(e));
}

export async function getExpense(id: Expense['id'], db?: DB): Promise<Expense | undefined> {
  return dbHandle(db).expenses.get(id);
}

export async function deleteExpense(id: Expense['id'], db?: DB): Promise<void> {
  await dbHandle(db).expenses.delete(id);
}

export async function expensesByTrip(tripId: TripId, db?: DB): Promise<Expense[]> {
  return dbHandle(db).expenses.where('trip_id').equals(tripId).toArray();
}

/**
 * `yyyy_mm` is e.g. `"2026-05"`. We range-scan the `[trip_id+date]` compound index
 * from `[tripId, "2026-05-00"]` to `[tripId, "2026-05-99"]` — string lex order matches
 * date order for fixed-width ISO dates.
 */
export async function expensesByTripAndMonth(
  tripId: TripId,
  yyyy_mm: string,
  db?: DB,
): Promise<Expense[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yyyy_mm)) {
    throw new Error(`expensesByTripAndMonth: bad yyyy_mm '${yyyy_mm}'`);
  }
  return dbHandle(db)
    .expenses.where('[trip_id+date]')
    .between([tripId, `${yyyy_mm}-00`], [tripId, `${yyyy_mm}-99`])
    .toArray();
}

// ────────────────────────────────────────────────────────────────────────────
// Tasks (cross-trip nullable trip_id)
// ────────────────────────────────────────────────────────────────────────────

export async function upsertTask(t: Task, db?: DB): Promise<void> {
  await dbHandle(db).tasks.put(stripUndefined(t));
}

export async function getTask(id: Task['id'], db?: DB): Promise<Task | undefined> {
  return dbHandle(db).tasks.get(id);
}

export async function deleteTask(id: Task['id'], db?: DB): Promise<void> {
  await dbHandle(db).tasks.delete(id);
}

export async function tasksByTrip(tripId: TripId, db?: DB): Promise<Task[]> {
  return dbHandle(db).tasks.where('trip_id').equals(tripId).toArray();
}

/** Cross-trip "General" tasks — those with `trip_id === null`. */
export async function generalTasks(db?: DB): Promise<Task[]> {
  return dbHandle(db)
    .tasks.filter((t) => t.trip_id === null)
    .toArray();
}

// ────────────────────────────────────────────────────────────────────────────
// Shopping items (cross-trip nullable trip_id)
// ────────────────────────────────────────────────────────────────────────────

export async function upsertShoppingItem(s: ShoppingItem, db?: DB): Promise<void> {
  await dbHandle(db).shopping_items.put(stripUndefined(s));
}

export async function getShoppingItem(
  id: ShoppingItem['id'],
  db?: DB,
): Promise<ShoppingItem | undefined> {
  return dbHandle(db).shopping_items.get(id);
}

export async function deleteShoppingItem(id: ShoppingItem['id'], db?: DB): Promise<void> {
  await dbHandle(db).shopping_items.delete(id);
}

export async function shoppingItemsByTrip(tripId: TripId, db?: DB): Promise<ShoppingItem[]> {
  return dbHandle(db).shopping_items.where('trip_id').equals(tripId).toArray();
}

export async function generalShoppingItems(db?: DB): Promise<ShoppingItem[]> {
  return dbHandle(db)
    .shopping_items.filter((s) => s.trip_id === null)
    .toArray();
}

// ────────────────────────────────────────────────────────────────────────────
// Articles (cross-trip nullable trip_id)
// ────────────────────────────────────────────────────────────────────────────

export async function upsertArticle(a: Article, db?: DB): Promise<void> {
  await dbHandle(db).articles.put(stripUndefined(a));
}

export async function getArticle(id: Article['id'], db?: DB): Promise<Article | undefined> {
  return dbHandle(db).articles.get(id);
}

export async function deleteArticle(id: Article['id'], db?: DB): Promise<void> {
  await dbHandle(db).articles.delete(id);
}

export async function articlesByTrip(tripId: TripId, db?: DB): Promise<Article[]> {
  return dbHandle(db).articles.where('trip_id').equals(tripId).toArray();
}

export async function generalArticles(db?: DB): Promise<Article[]> {
  return dbHandle(db)
    .articles.filter((a) => a.trip_id === null)
    .toArray();
}

// ────────────────────────────────────────────────────────────────────────────
// file_meta
// ────────────────────────────────────────────────────────────────────────────

export async function upsertFileMeta(m: FileMeta, db?: DB): Promise<void> {
  await dbHandle(db).file_meta.put(stripUndefined(m));
}

export async function getFileMeta(fileId: string, db?: DB): Promise<FileMeta | undefined> {
  return dbHandle(db).file_meta.get(fileId);
}

export async function getFileMetaByEntity(
  entityType: EntityType,
  entityId: string,
  db?: DB,
): Promise<FileMeta | undefined> {
  return dbHandle(db)
    .file_meta.where('entity_id')
    .equals(entityId)
    .filter((m) => m.entity_type === entityType)
    .first();
}

export async function deleteFileMeta(fileId: string, db?: DB): Promise<void> {
  await dbHandle(db).file_meta.delete(fileId);
}

// ────────────────────────────────────────────────────────────────────────────
// write_queue
// ────────────────────────────────────────────────────────────────────────────

/**
 * `file_id` and `resolved_path` are required for new enqueues as of v3. Existing
 * callers that still expect them to be optional should set them explicitly:
 *  - first-time creates: `file_id: null`, `resolved_path` = the target path.
 *  - updates: `file_id: '<drive-file-id>'`, `resolved_path` = the existing path.
 */
export type EnqueueInput = Omit<WriteQueueItem, 'attempts' | 'last_error' | 'created_at'> & {
  attempts?: number;
  last_error?: string | null;
  created_at?: number;
};

export async function enqueueWrite(item: EnqueueInput, db?: DB): Promise<void> {
  const row: WriteQueueItem = {
    attempts: 0,
    last_error: null,
    created_at: Date.now(),
    ...item,
  };
  await dbHandle(db).write_queue.put(stripUndefined(row));
}

/** FIFO peek-and-pop. Returns null when the queue is empty.
 *
 * Destructive — the row is removed before the worker has had a chance to
 * confirm the write applied. New callers that need the row to remain in the
 * queue until applied (so a crash mid-write doesn't lose the mutation) should
 * use {@link peekNextPending} + {@link dequeueById} instead.
 */
export async function drainNext(db?: DB): Promise<WriteQueueItem | null> {
  const handle = dbHandle(db);
  return handle.transaction('rw', handle.write_queue, async () => {
    const next = await handle.write_queue.orderBy('created_at').first();
    if (!next) return null;
    await handle.write_queue.delete(next.id);
    return next;
  });
}

/** Non-destructive FIFO head. The row remains in the queue. */
export async function peekNextPending(db?: DB): Promise<WriteQueueItem | null> {
  const next = await dbHandle(db).write_queue.orderBy('created_at').first();
  return next ?? null;
}

/** Remove a queue row by id. Idempotent. */
export async function dequeueById(id: string, db?: DB): Promise<void> {
  await dbHandle(db).write_queue.delete(id);
}

/** Inspect without dequeueing (e.g. for the sync worker's retry loop). */
export async function peekQueue(limit = 50, db?: DB): Promise<WriteQueueItem[]> {
  return dbHandle(db).write_queue.orderBy('created_at').limit(limit).toArray();
}

export async function recordQueueFailure(
  id: string,
  error: string,
  db?: DB,
): Promise<void> {
  const handle = dbHandle(db);
  await handle.transaction('rw', handle.write_queue, async () => {
    const row = await handle.write_queue.get(id);
    if (!row) return;
    await handle.write_queue.put({
      ...row,
      attempts: row.attempts + 1,
      last_error: error,
    });
  });
}

export async function deleteQueueItem(id: string, db?: DB): Promise<void> {
  await dbHandle(db).write_queue.delete(id);
}

/** Re-export for callers that don't want to depend on the row type's optional fields. */
export type { WriteQueueItem, WriteOp } from './types';

// ────────────────────────────────────────────────────────────────────────────
// kv
// ────────────────────────────────────────────────────────────────────────────

export async function getKV<K extends KVKey>(
  key: K,
  db?: DB,
): Promise<KVValueMap[K] | null> {
  const row = await dbHandle(db).kv.get(key);
  return row ? (row.value as KVValueMap[K]) : null;
}

export async function setKV<K extends KVKey>(
  key: K,
  value: KVValueMap[K],
  db?: DB,
): Promise<void> {
  await dbHandle(db).kv.put({ key, value });
}

export async function deleteKV(key: KVKey, db?: DB): Promise<void> {
  await dbHandle(db).kv.delete(key);
}
