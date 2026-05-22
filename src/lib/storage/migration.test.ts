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

    // Phase 2 — reopen at v2 via the real TravelDB and verify upgrade ran.
    const v2 = new TravelDB(name);
    await v2.open();
    expect(v2.verno).toBe(2);

    const tripBack = await v2.trips.get(trip.id);
    expect(tripBack).toEqual(trip);
    const expenseBack = await v2.expenses.get(expense.id);
    expect(expenseBack).toEqual(expense);

    // v2 marker written by the upgrade hook.
    const marker = await v2.kv.get('__schema_v2__');
    expect(marker?.value).toBe('true');

    // The new compound index works against pre-existing rows (proves migration re-indexed).
    const inRange = await v2.expenses
      .where('[trip_id+date]')
      .between([trip.id, '2026-06-00'], [trip.id, '2026-06-99'])
      .toArray();
    expect(inRange.map((e) => e.id)).toEqual([expense.id]);

    v2.close();
  });

  it('a fresh DB opens directly at v2 and supports the compound query', async () => {
    const name = `travel-fresh-${Math.random().toString(36).slice(2)}`;
    dbsToCleanup.push(name);

    const db = new TravelDB(name);
    await db.open();
    expect(db.verno).toBe(2);

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
