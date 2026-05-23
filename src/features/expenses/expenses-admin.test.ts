import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/lib/storage/test-helpers';
import { TripId } from '@/domain/ids';
import { Trip } from '@/domain/trip';
import { currency } from '@/domain/money';
import { IsoDate } from '@/domain/dates';
import { ExpenseCategory } from '@/domain/expense';
import { RatesSnapshot } from '@/lib/currency';
import { writeCachedRates } from '@/lib/currency/cache';
import { createExpensesAdmin } from './expenses-admin';
import type { WriteQueue, WriteQueueItem } from '@/sync/queue';

class InMemoryQueue implements WriteQueue {
  public readonly items: WriteQueueItem[] = [];
  enqueue(item: WriteQueueItem): Promise<void> {
    this.items.push(item);
    return Promise.resolve();
  }
  drainNext(): Promise<WriteQueueItem | null> {
    return Promise.resolve(this.items.shift() ?? null);
  }
  markFailed(): Promise<void> {
    return Promise.resolve();
  }
}

function buildTrip(overrides: Partial<Trip> = {}): Trip {
  return Trip.parse({
    type: 'trip',
    id: TripId.parse('trp_01HABCDEFGHJKMNPQRSTVWXYZ0'),
    name: 'Trip',
    slug: 'trip',
    start_date: IsoDate.parse('2026-05-01'),
    end_date: IsoDate.parse('2026-05-31'),
    home_currency: currency('USD'),
    ...overrides,
  });
}

const USD = currency('USD');
const EUR = currency('EUR');

describe('expensesAdmin.addExpense', () => {
  it('persists expense + enqueues a ledger write (same-currency, no snapshot)', async () => {
    const db = makeTestDb('exp-admin-same');
    const queue = new InMemoryQueue();
    const admin = createExpensesAdmin({
      db,
      writeQueue: queue,
      travelFolderPath: 'Vault/Travel',
      today: () => '2026-05-04',
    });
    const trip = buildTrip({ home_currency: USD });
    const expense = await admin.addExpense(trip, {
      trip_id: trip.id,
      date: IsoDate.parse('2026-05-04'),
      amount: 12.4,
      currency: USD,
      category: ExpenseCategory.parse('food'),
      description: 'Café',
    });
    expect(expense.home_conversion).toBeUndefined();
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0].entityType).toBe('expense');
    expect(queue.items[0].resolvedPath).toBe('Vault/Travel/Trips/trip/Expenses/2026-05.md');
    const stored = await db.expenses.get(expense.id);
    expect(stored?.amount).toBe(12.4);
  });

  it('computes home_conversion and enqueues a rates_snapshot write for cross-currency', async () => {
    const db = makeTestDb('exp-admin-fx');
    // Pre-seed cache so refreshRates doesn't try to fetch.
    await writeCachedRates(
      RatesSnapshot.parse({
        base: USD,
        date: IsoDate.parse('2026-05-04'),
        rates: { EUR: 0.92 },
        source: 'frankfurter',
      }),
      db,
    );
    const queue = new InMemoryQueue();
    const admin = createExpensesAdmin({
      db,
      writeQueue: queue,
      travelFolderPath: 'Vault/Travel',
      today: () => '2026-05-04',
    });
    const trip = buildTrip({ home_currency: USD });
    const expense = await admin.addExpense(trip, {
      trip_id: trip.id,
      date: IsoDate.parse('2026-05-04'),
      amount: 100,
      currency: EUR,
      category: ExpenseCategory.parse('food'),
      description: 'Dinner',
    });
    expect(expense.home_conversion?.currency).toBe(USD);
    expect(expense.home_conversion?.amount).toBeCloseTo(100 / 0.92, 6);
    const types = queue.items.map((i) => i.entityType);
    expect(types).toContain('expense');
    expect(types).toContain('rates_snapshot');
  });
});

describe('expensesAdmin.removeExpense', () => {
  it('deletes locally and enqueues a delete op', async () => {
    const db = makeTestDb('exp-admin-rm');
    const queue = new InMemoryQueue();
    const admin = createExpensesAdmin({
      db,
      writeQueue: queue,
      travelFolderPath: 'Vault/Travel',
      today: () => '2026-05-04',
    });
    const trip = buildTrip({ home_currency: USD });
    const expense = await admin.addExpense(trip, {
      trip_id: trip.id,
      date: IsoDate.parse('2026-05-04'),
      amount: 5,
      currency: USD,
      category: ExpenseCategory.parse('food'),
      description: '',
    });
    queue.items.length = 0;
    await admin.removeExpense(trip, expense);
    expect(await db.expenses.get(expense.id)).toBeUndefined();
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0].op).toBe('delete');
  });
});
