import Dexie, { type Table } from 'dexie';

import type { Trip } from '@/domain/trip';
import type { Accommodation } from '@/domain/accommodation';
import type { Place } from '@/domain/place';
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

  // v4 — `file_meta.last_entity_ids: string[]`. Tracks the set of entity ids
  // a file was last seen to contain so the inbound worker can compute
  // per-row deletes for ledger files (Tasks, Shopping). See ADR-0014
  // addendum (2026-06-06).
  //
  // The column isn't indexed — readers fetch the full row and iterate the
  // array client-side. No `.stores()` change is needed (Dexie indexes are
  // explicit; non-indexed fields are free), but we declare v4 so the
  // upgrade hook runs.
  //
  // Upgrade does two things:
  //   1. Backfill `last_entity_ids = [entity_id]` on every existing row.
  //      Correct for single-entity files; safely approximate for ledger
  //      file_metas (worst case: one stale-id no-op on next ingest).
  //   2. Delete `drive_changes_page_token`. Pre-v4 the change-feed token
  //      was captured at the end of a walk that silently skipped any file
  //      the inbound registry didn't claim (because S14 only registered
  //      the trip reconciler). Those files still exist in Drive but won't
  //      appear in the change feed — they haven't been modified since the
  //      token was captured. Forcing the next pull onto the backfill path
  //      is the only way to surface them. Also re-derives the correct
  //      `last_entity_ids` for ledger files from Drive content.
  db.version(4).upgrade(async (tx) => {
    await tx
      .table('file_meta')
      .toCollection()
      .modify((row: { entity_id?: unknown; last_entity_ids?: unknown }) => {
        if (row.last_entity_ids === undefined) {
          row.last_entity_ids = typeof row.entity_id === 'string' ? [row.entity_id] : [];
        }
      });
    await tx.table('kv').delete('drive_changes_page_token');
    await tx.table('kv').put({ key: '__schema_v4__', value: 'true' });
  });

  // v5 — drop the `expenses` store (ADR-0018 removes the expenses feature).
  // `null` is Dexie's "delete this table" marker. Rows go with it; the vault's
  // `Expenses/<yyyy-mm>.md` files are left untouched for Obsidian.
  //
  // Queued expense writes and their file_meta rows are purged too: no
  // reconciler is registered for them any more, so leaving them would only
  // produce dead-letters on the next drain.
  db.version(5)
    .stores({ expenses: null })
    .upgrade(async (tx) => {
      await tx.table('write_queue').where('entity_type').equals('expense').delete();
      await tx.table('file_meta').where('entity_type').equals('expense').delete();
      await tx.table('kv').delete('rates_snapshot');
      await tx.table('kv').put({ key: '__schema_v5__', value: 'true' });
    });

  // v6 — per-item retry scheduling for the continuous sync engine (ADR-0019).
  //
  //   `next_attempt_at` (epoch ms, 0 = ready) lets the drain skip a backing-off
  //   row instead of stalling behind it. Pre-v6 a single failing item blocked
  //   every write queued after it, forever.
  //
  //   `dead` (0|1, indexed) replaces "delete the row on terminal failure".
  //   Deleting discarded the user's edit with no trace. A dead row is retained,
  //   excluded from the drain, excluded from inbound write-suppression, and
  //   counted by the status indicator.
  //
  // The stale page token is dropped as well: tokens written before the
  // `newStartPageToken` fix never advanced past the point they were minted, so
  // every one of them is a replay loop. Clearing forces one backfill, which
  // re-derives correct `file_meta` and mints a token that actually moves.
  db.version(6)
    .stores({
      write_queue: 'id, entity_type, entity_id, created_at, file_id, resolved_path, dead',
    })
    .upgrade(async (tx) => {
      await tx
        .table('write_queue')
        .toCollection()
        .modify((row: { next_attempt_at?: unknown; dead?: unknown }) => {
          if (row.next_attempt_at === undefined) row.next_attempt_at = 0;
          if (row.dead === undefined) row.dead = 0;
        });
      await tx.table('kv').delete('drive_changes_page_token');
      await tx.table('kv').put({ key: '__schema_v6__', value: 'true' });
    });
}

/** Shared singleton for the running app. Tests construct their own per-test instance. */
export const db = new TravelDB();
