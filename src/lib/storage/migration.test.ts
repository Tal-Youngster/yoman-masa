import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';

import { newExpense, newTrip } from '@/domain';
import { isoDate } from '@/domain/dates';
import { currency } from '@/domain/money';

import { TravelDB } from './db';
import { deleteDatabase } from './test-helpers';

/**
 * Stops at v1 to simulate a database that was originally created before the v2 upgrade.
 * Mirrors the v1 stores definition in db.ts exactly — if v1 changes, so must this.
 */
class V1Db extends Dexie {
  constructor(name: string) {
    super(name);
    this.version(1).stores({
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
  }
}

/**
 * Stops at v2 to simulate a database opened on a build between S2 and S5 — when
 * the write_queue still lacked `file_id` and `resolved_path`. Mirrors the v1+v2
 * stores from db.ts exactly.
 */
class V2Db extends Dexie {
  constructor(name: string) {
    super(name);
    this.version(1).stores({
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
    this.version(2)
      .stores({
        expenses: 'id, trip_id, date, category, currency, [trip_id+date]',
      })
      .upgrade(async (tx) => {
        await tx.table('kv').put({ key: '__schema_v2__', value: 'true' });
      });
  }
}

const dbsToCleanup: string[] = [];
afterEach(async () => {
  for (const name of dbsToCleanup.splice(0)) {
    await deleteDatabase(name);
  }
});

describe('Schema migration v1 → v2', () => {
  it('upgrades an existing v1 DB, preserves data, and adds the v2 marker', async () => {
    const name = `travel-migration-${Math.random().toString(36).slice(2)}`;
    dbsToCleanup.push(name);

    // Phase 1 — write data using v1 schema only.
    const trip = newTrip({
      slug: 'pre-migration',
      name: 'Pre-migration trip',
      start_date: isoDate('2026-06-01'),
      end_date: isoDate('2026-06-10'),
      home_currency: currency('USD'),
      status: 'active',
    });
    const expense = newExpense({
      trip_id: trip.id,
      date: isoDate('2026-06-05'),
      amount: 42,
      currency: currency('USD'),
      category: 'food',
    });

    const v1 = new V1Db(name);
    await v1.open();
    expect(v1.verno).toBe(1);
    await v1.table('trips').put(trip);
    await v1.table('expenses').put(expense);
    v1.close();

    // Phase 2 — reopen at v3 via the real TravelDB and verify upgrade ran.
    const v3 = new TravelDB(name);
    await v3.open();
    expect(v3.verno).toBe(3);

    const tripBack = await v3.trips.get(trip.id);
    expect(tripBack).toEqual(trip);
    const expenseBack = await v3.expenses.get(expense.id);
    expect(expenseBack).toEqual(expense);

    // v2 marker written by the upgrade hook.
    const marker = await v3.kv.get('__schema_v2__');
    expect(marker?.value).toBe('true');

    // The new compound index works against pre-existing rows (proves migration re-indexed).
    const inRange = await v3.expenses
      .where('[trip_id+date]')
      .between([trip.id, '2026-06-00'], [trip.id, '2026-06-99'])
      .toArray();
    expect(inRange.map((e) => e.id)).toEqual([expense.id]);

    v3.close();
  });

  it('a fresh DB opens directly at v3 and supports the compound query', async () => {
    const name = `travel-fresh-${Math.random().toString(36).slice(2)}`;
    dbsToCleanup.push(name);

    const db = new TravelDB(name);
    await db.open();
    expect(db.verno).toBe(3);

    const trip = newTrip({
      slug: 'fresh',
      name: 'Fresh',
      start_date: isoDate('2026-06-01'),
      end_date: isoDate('2026-06-10'),
      home_currency: currency('USD'),
      status: 'active',
    });
    await db.trips.put(trip);

    const result = await db.expenses
      .where('[trip_id+date]')
      .between([trip.id, '2026-06-00'], [trip.id, '2026-06-99'])
      .toArray();
    expect(result).toEqual([]);

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
    });
    v2.close();

    // Phase 2 — reopen via TravelDB; upgrade backfills new columns.
    const v3 = new TravelDB(name);
    await v3.open();
    expect(v3.verno).toBe(3);

    const row = (await v3.write_queue.get('legacy-row-1')) as
      | (Record<string, unknown> & { file_id: unknown; resolved_path: unknown })
      | undefined;
    expect(row).toBeDefined();
    expect(row?.file_id).toBeNull();
    expect(row?.resolved_path).toBe('');

    const v3Marker = await v3.kv.get('__schema_v3__');
    expect(v3Marker?.value).toBe('true');

    v3.close();
  });

  it('a fresh DB opens directly at v3 with the new write_queue indexes', async () => {
    const name = `travel-fresh-v3-${Math.random().toString(36).slice(2)}`;
    dbsToCleanup.push(name);

    const db = new TravelDB(name);
    await db.open();
    expect(db.verno).toBe(3);

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
    });

    // The new index `file_id` is queryable on a fresh DB.
    const byFileId = await db.write_queue.where('file_id').equals('drive-file-x').toArray();
    expect(byFileId.map((r) => r.id)).toEqual(['fresh-row-1']);

    db.close();
  });
});
