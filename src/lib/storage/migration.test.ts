import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';

import { newTrip } from '@/domain';
import { isoDate } from '@/domain/dates';
import { currency } from '@/domain/money';

import { TravelDB } from './db';
import { deleteDatabase } from './test-helpers';

/** Current schema version of the real `TravelDB`. */
const CURRENT_VERSION = 6;

/**
 * Historical stores, replayed verbatim so a legacy DB can be constructed. These
 * mirror db.ts's past versions — including the `expenses` table that v5 drops —
 * and must never be "cleaned up" to match the present schema.
 */
const V1_STORES = {
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
} as const;

/**
 * Stops at v1 to simulate a database that was originally created before the v2 upgrade.
 */
class V1Db extends Dexie {
  constructor(name: string) {
    super(name);
    this.version(1).stores({ ...V1_STORES });
  }
}

/**
 * Stops at v2 to simulate a database opened on a build between S2 and S5 — when
 * the write_queue still lacked `file_id` and `resolved_path`.
 */
class V2Db extends Dexie {
  constructor(name: string) {
    super(name);
    this.version(1).stores({ ...V1_STORES });
    this.version(2)
      .stores({
        expenses: 'id, trip_id, date, category, currency, [trip_id+date]',
      })
      .upgrade(async (tx) => {
        await tx.table('kv').put({ key: '__schema_v2__', value: 'true' });
      });
  }
}

/**
 * Stops at v3 to simulate a database opened on a build between S5 and S16 —
 * before `file_meta.last_entity_ids` and the change-token purge.
 */
class V3Db extends V2Db {
  constructor(name: string) {
    super(name);
    this.version(3)
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
}

/**
 * Stops at v4 — the last version that still had an `expenses` table. Used to
 * seed the rows the v5 drop is expected to clear.
 */
class V4Db extends V3Db {
  constructor(name: string) {
    super(name);
    this.version(4).upgrade(async (tx) => {
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
  }
}

const dbsToCleanup: string[] = [];
afterEach(async () => {
  for (const name of dbsToCleanup.splice(0)) {
    await deleteDatabase(name);
  }
});

function makeTrip(slug: string) {
  return newTrip({
    slug,
    name: `Trip ${slug}`,
    start_date: isoDate('2026-06-01'),
    end_date: isoDate('2026-06-10'),
    home_currency: currency('USD'),
  });
}

describe('Schema migration v1 → current', () => {
  it('upgrades an existing v1 DB, preserves data, and adds the v2 marker', async () => {
    const name = `travel-migration-${Math.random().toString(36).slice(2)}`;
    dbsToCleanup.push(name);

    // Phase 1 — write data using v1 schema only.
    const trip = makeTrip('pre-migration');

    const v1 = new V1Db(name);
    await v1.open();
    expect(v1.verno).toBe(1);
    await v1.table('trips').put(trip);
    v1.close();

    // Phase 2 — reopen via the real TravelDB and verify every upgrade ran.
    const current = new TravelDB(name);
    await current.open();
    expect(current.verno).toBe(CURRENT_VERSION);

    const tripBack = await current.trips.get(trip.id);
    expect(tripBack).toEqual(trip);

    // v2 marker written by the upgrade hook.
    const marker = await current.kv.get('__schema_v2__');
    expect(marker?.value).toBe('true');

    current.close();
  });

  it('a fresh DB opens directly at the current version', async () => {
    const name = `travel-fresh-${Math.random().toString(36).slice(2)}`;
    dbsToCleanup.push(name);

    const db = new TravelDB(name);
    await db.open();
    expect(db.verno).toBe(CURRENT_VERSION);

    const trip = makeTrip('fresh');
    await db.trips.put(trip);
    expect(await db.trips.get(trip.id)).toEqual(trip);

    db.close();
  });
});

describe('Schema migration v2 → v3', () => {
  it('backfills file_id=null and resolved_path="" on pre-existing v2 write_queue rows', async () => {
    const name = `travel-migration-v3-${Math.random().toString(36).slice(2)}`;
    dbsToCleanup.push(name);

    // Phase 1 — open at v2 and seed a synthetic write_queue row using the
    // pre-v3 shape (no file_id, no resolved_path).
    const v2 = new V2Db(name);
    await v2.open();
    expect(v2.verno).toBe(2);
    await v2.table('write_queue').put({
      id: 'legacy-row-1',
      entity_type: 'trip',
      entity_id: 'trp_legacy',
      op: 'create',
      payload: { foo: 1 },
      base_revision: null,
      attempts: 0,
      last_error: null,
      created_at: Date.now(),
      next_attempt_at: 0,
      dead: 0,
    });
    v2.close();

    // Phase 2 — reopen via TravelDB; upgrade backfills new columns.
    const current = new TravelDB(name);
    await current.open();
    expect(current.verno).toBe(CURRENT_VERSION);

    const row = (await current.write_queue.get('legacy-row-1')) as
      | (Record<string, unknown> & { file_id: unknown; resolved_path: unknown })
      | undefined;
    expect(row).toBeDefined();
    expect(row?.file_id).toBeNull();
    expect(row?.resolved_path).toBe('');

    const v3Marker = await current.kv.get('__schema_v3__');
    expect(v3Marker?.value).toBe('true');

    current.close();
  });

  it('a fresh DB opens with the new write_queue indexes', async () => {
    const name = `travel-fresh-v3-${Math.random().toString(36).slice(2)}`;
    dbsToCleanup.push(name);

    const db = new TravelDB(name);
    await db.open();
    expect(db.verno).toBe(CURRENT_VERSION);

    await db.write_queue.put({
      id: 'fresh-row-1',
      entity_type: 'trip',
      entity_id: 'trp_fresh',
      op: 'create',
      payload: null,
      base_revision: null,
      file_id: 'drive-file-x',
      resolved_path: 'MyVault/Travel/Trips/fresh/Trip.md',
      attempts: 0,
      last_error: null,
      created_at: Date.now(),
      next_attempt_at: 0,
      dead: 0,
    });

    // The new index `file_id` is queryable on a fresh DB.
    const byFileId = await db.write_queue.where('file_id').equals('drive-file-x').toArray();
    expect(byFileId.map((r) => r.id)).toEqual(['fresh-row-1']);

    db.close();
  });
});

describe('Schema migration v3 → v4', () => {
  it('backfills last_entity_ids from entity_id and clears the change-feed token', async () => {
    const name = `travel-migration-v4-${Math.random().toString(36).slice(2)}`;
    dbsToCleanup.push(name);

    // Phase 1 — open at v3 and seed a file_meta row in the legacy shape (no
    // `last_entity_ids`) plus a `drive_changes_page_token` kv row that should
    // be purged on upgrade.
    const v3 = new V3Db(name);
    await v3.open();
    expect(v3.verno).toBe(3);
    await v3.table('file_meta').put({
      file_id: 'fil-legacy',
      entity_type: 'trip',
      entity_id: 'trp_legacy',
      head_revision_id: 'rev-1',
      modified_time: '2026-01-01T00:00:00.000Z',
      path: 'Trips/legacy/Trip.md',
    });
    await v3.table('kv').put({ key: 'drive_changes_page_token', value: 'stale-token' });
    v3.close();

    // Phase 2 — reopen via TravelDB; upgrade runs.
    const current = new TravelDB(name);
    await current.open();
    expect(current.verno).toBe(CURRENT_VERSION);

    const row = (await current.file_meta.get('fil-legacy')) as
      | (Record<string, unknown> & { last_entity_ids: unknown })
      | undefined;
    expect(row).toBeDefined();
    expect(row?.last_entity_ids).toEqual(['trp_legacy']);

    // Token gone — pre-v4 walks may have silently skipped non-trip files,
    // so the next pull must take the backfill path.
    expect(await current.kv.get('drive_changes_page_token')).toBeUndefined();

    const marker = await current.kv.get('__schema_v4__');
    expect(marker?.value).toBe('true');

    current.close();
  });

  it('a fresh DB round-trips file_meta.last_entity_ids', async () => {
    const name = `travel-fresh-v4-${Math.random().toString(36).slice(2)}`;
    dbsToCleanup.push(name);

    const db = new TravelDB(name);
    await db.open();
    expect(db.verno).toBe(CURRENT_VERSION);

    await db.file_meta.put({
      file_id: 'fil-fresh',
      entity_type: 'task',
      entity_id: 'tsk_a',
      last_entity_ids: ['tsk_a', 'tsk_b'],
      head_revision_id: 'rev-1',
      modified_time: '2026-01-01T00:00:00.000Z',
      path: 'Trips/x/Tasks.md',
    });
    const back = await db.file_meta.get('fil-fresh');
    expect(back?.last_entity_ids).toEqual(['tsk_a', 'tsk_b']);

    db.close();
  });
});

describe('Schema migration v4 → v5 (expenses removal, ADR-0018)', () => {
  it('drops the expenses store and purges its queue, file_meta and rates rows', async () => {
    const name = `travel-migration-v5-${Math.random().toString(36).slice(2)}`;
    dbsToCleanup.push(name);

    // Phase 1 — open at v4 (the last version with expenses) and seed rows that
    // only made sense while the feature existed.
    const v4 = new V4Db(name);
    await v4.open();
    expect(v4.verno).toBe(4);
    await v4.table('expenses').put({
      id: 'exp_legacy',
      trip_id: 'trp_legacy',
      date: '2026-06-05',
      amount: 42,
      currency: 'USD',
      category: 'food',
    });
    await v4.table('write_queue').bulkPut([
      {
        id: 'queued-expense',
        entity_type: 'expense',
        entity_id: 'exp_legacy',
        op: 'update',
        payload: null,
        base_revision: null,
        file_id: 'fil-ledger',
        resolved_path: 'Travel/Trips/legacy/Expenses/2026-06.md',
        attempts: 0,
        last_error: null,
        created_at: Date.now(),
        next_attempt_at: 0,
        dead: 0,
      },
      {
        id: 'queued-trip',
        entity_type: 'trip',
        entity_id: 'trp_legacy',
        op: 'update',
        payload: null,
        base_revision: null,
        file_id: 'fil-trip',
        resolved_path: 'Travel/Trips/legacy/Trip.md',
        attempts: 0,
        last_error: null,
        created_at: Date.now(),
        next_attempt_at: 0,
        dead: 0,
      },
    ]);
    await v4.table('file_meta').put({
      file_id: 'fil-ledger',
      entity_type: 'expense',
      entity_id: 'exp_legacy',
      last_entity_ids: ['exp_legacy'],
      head_revision_id: 'rev-1',
      modified_time: '2026-01-01T00:00:00.000Z',
      path: 'Trips/legacy/Expenses/2026-06.md',
    });
    await v4.table('kv').put({
      key: 'rates_snapshot',
      value: { base: 'USD', date: '2026-06-01', rates: { EUR: 0.9 }, source: 'frankfurter' },
    });
    v4.close();

    // Phase 2 — reopen via TravelDB; v5 removes the table and its debris.
    const current = new TravelDB(name);
    await current.open();
    expect(current.verno).toBe(CURRENT_VERSION);

    expect(current.tables.map((t) => t.name)).not.toContain('expenses');
    expect(await current.write_queue.get('queued-expense')).toBeUndefined();
    // Unrelated queue rows survive.
    expect(await current.write_queue.get('queued-trip')).toBeDefined();
    expect(await current.file_meta.get('fil-ledger')).toBeUndefined();
    expect(await current.kv.get('rates_snapshot')).toBeUndefined();

    const marker = await current.kv.get('__schema_v5__');
    expect(marker?.value).toBe('true');

    current.close();
  });
});
