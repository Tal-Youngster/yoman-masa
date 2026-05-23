import Dexie, { type Table } from 'dexie';

import type { Trip } from '@/domain/trip';
import type { Accommodation } from '@/domain/accommodation';
import type { Place } from '@/domain/place';
import type { Expense } from '@/domain/expense';
import type { Task } from '@/domain/task';
import type { ShoppingItem } from '@/domain/shopping-item';
import type { Article } from '@/domain/article';

import type { FileMeta, KVRow, WriteQueueItem } from './types';

/**
 * Primary keys are the entity's branded id (string under the hood).
 * Trip-scoped tables index `trip_id` for cheap filtered listing.
 * Cross-trip entities (task, shopping_item, article) carry `trip_id: string | null`;
 * Dexie indexes `null` correctly, so cross-trip listing uses `where('trip_id').equals(null)`.
 */
export class TravelDB extends Dexie {
  trips!: Table<Trip, Trip['id']>;
  accommodations!: Table<Accommodation, Accommodation['id']>;
  places!: Table<Place, Place['id']>;
  expenses!: Table<Expense, Expense['id']>;
  tasks!: Table<Task, Task['id']>;
  shopping_items!: Table<ShoppingItem, ShoppingItem['id']>;
  articles!: Table<Article, Article['id']>;
  file_meta!: Table<FileMeta, string>;
  write_queue!: Table<WriteQueueItem, string>;
  kv!: Table<KVRow, string>;

  constructor(name = 'travel-journal') {
    super(name);
    defineSchema(this);
  }
}

/**
 * Schema versions are append-only. Never edit a past version's `stores()` — add a new
 * version and write an `upgrade()` for the delta. The migration test pins each version's
 * shape via a separate db handle.
 */
export function defineSchema(db: Dexie): void {
  // v1 — initial shape.
  db.version(1).stores({
    trips: 'id, slug, status, start_date, end_date',
    accommodations: 'id, trip_id, status, checkin, checkout',
    places: 'id, trip_id, visited',
    expenses: 'id, trip_id, date, category, currency',
    tasks: 'id, trip_id, status, due_date',
    shopping_items: 'id, trip_id, bought',
    articles: 'id, trip_id, place_id',
    file_meta: 'file_id, entity_id, entity_type',
    write_queue: 'id, entity_type, entity_id, created_at',
    kv: 'key',
  });

  // v2 — add [trip_id+date] compound to expenses (for the monthly ledger query)
  // and persist a `schema_marker` row in kv so migration is observable in tests.
  db.version(2)
    .stores({
      expenses: 'id, trip_id, date, category, currency, [trip_id+date]',
    })
    .upgrade(async (tx) => {
      await tx.table('kv').put({ key: '__schema_v2__', value: 'true' });
    });

  // v3 — add `file_id` and `resolved_path` columns to write_queue so the Dexie
  // adapter can hand the sync worker rows S3 understands without extracting
  // those fields from `payload`. Indexes added for both columns to support
  // potential per-file dedupe lookups later.
  //
  // Pre-existing v2 rows are backfilled with `file_id = null` and
  // `resolved_path = ''`. The adapter treats `resolved_path === ''` as a
  // terminal dead-letter so a v2 row never reaches Drive with the empty path.
  db.version(3)
    .stores({
      write_queue: 'id, entity_type, entity_id, created_at, file_id, resolved_path',
    })
    .upgrade(async (tx) => {
      await tx
        .table('write_queue')
        .toCollection()
        .modify((row: { file_id?: unknown; resolved_path?: unknown }) => {
          if (row.file_id === undefined) row.file_id = null;
          if (row.resolved_path === undefined) row.resolved_path = '';
        });
      await tx.table('kv').put({ key: '__schema_v3__', value: 'true' });
    });
}

/** Shared singleton for the running app. Tests construct their own per-test instance. */
export const db = new TravelDB();
