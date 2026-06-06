import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/lib/storage/test-helpers';
import { TripId } from '@/domain/ids';
import { currency } from '@/domain/money';
import type { WriteQueue, WriteQueueItem } from '@/sync/queue';
import { createShoppingAdmin, type ShoppingScope } from './shopping-admin';
import type { ShoppingItemPayload } from './reconciler';

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

const TRIP = TripId.parse('trp_01HABCDEFGHJKMNPQRSTVWXYZ0');
const TRIP_SCOPE: ShoppingScope = { tripId: TRIP, slug: 'vietnam' };
const GENERAL_SCOPE: ShoppingScope = { tripId: null, slug: null };

function setup(name: string) {
  const db = makeTestDb(name);
  const queue = new InMemoryQueue();
  const admin = createShoppingAdmin({
    db,
    writeQueue: queue,
    travelFolderPath: 'Vault/Travel',
    today: () => '2026-06-06',
  });
  return { db, queue, admin };
}

describe('shoppingAdmin.addItem', () => {
  it('persists a trip item and enqueues a create against the trip Shopping.md', async () => {
    const { db, queue, admin } = setup('shopping-add-trip');
    const item = await admin.addItem(TRIP_SCOPE, {
      name: 'Trail runners',
      quantity: 1,
      estimated_cost: { amount: 120, currency: currency('USD') },
      tags: ['gear/shoes'],
    });

    expect(item.trip_id).toBe(TRIP);
    expect(item.bought).toBe(false);
    expect(item.quantity).toBe(1);
    expect(item.estimated_cost?.currency).toBe('USD');
    expect(await db.shopping_items.get(item.id)).toMatchObject({ name: 'Trail runners' });

    expect(queue.items).toHaveLength(1);
    const enq = queue.items[0] as WriteQueueItem<ShoppingItemPayload>;
    expect(enq.entityType).toBe('shopping_item');
    expect(enq.op).toBe('create');
    expect(enq.resolvedPath).toBe('Vault/Travel/Trips/vietnam/Shopping.md');
    expect(enq.payload.item.id).toBe(item.id);
  });

  it('targets the General Shopping.md for the null scope', async () => {
    const { admin, queue } = setup('shopping-add-general');
    const item = await admin.addItem(GENERAL_SCOPE, { name: 'Travel adapter' });
    expect(item.trip_id).toBeNull();
    expect(queue.items[0]?.resolvedPath).toBe('Vault/Travel/General/Shopping.md');
  });

  it('stamps bought_date when created already bought', async () => {
    const { admin } = setup('shopping-add-bought');
    const item = await admin.addItem(TRIP_SCOPE, { name: 'Pre-bought thing', bought: true });
    expect(item.bought_date).toBe('2026-06-06');
  });
});

describe('shoppingAdmin.setBought', () => {
  it('stamps bought_date on completion and enqueues an update', async () => {
    const { db, queue, admin } = setup('shopping-bought');
    const item = await admin.addItem(TRIP_SCOPE, { name: 'Sunscreen' });
    await admin.setBought(TRIP_SCOPE, item, true);

    const stored = await db.shopping_items.get(item.id);
    expect(stored?.bought).toBe(true);
    expect(stored?.bought_date).toBe('2026-06-06');
    expect(queue.items.at(-1)?.op).toBe('update');
  });

  it('clears bought_date when un-buying a bought item', async () => {
    const { db, admin } = setup('shopping-unbought');
    const item = await admin.addItem(TRIP_SCOPE, { name: 'Sunscreen', bought: true });
    await admin.setBought(TRIP_SCOPE, item, false);
    const stored = await db.shopping_items.get(item.id);
    expect(stored?.bought).toBe(false);
    expect(stored?.bought_date).toBeUndefined();
  });
});

describe('shoppingAdmin.removeItem', () => {
  it('deletes locally and enqueues a delete', async () => {
    const { db, queue, admin } = setup('shopping-remove');
    const item = await admin.addItem(TRIP_SCOPE, { name: 'Obsolete' });
    await admin.removeItem(TRIP_SCOPE, item);
    expect(await db.shopping_items.get(item.id)).toBeUndefined();
    expect(queue.items.at(-1)?.op).toBe('delete');
  });
});

describe('shoppingAdmin.listByScope', () => {
  it('separates trip items from General items', async () => {
    const { admin } = setup('shopping-list-scope');
    await admin.addItem(TRIP_SCOPE, { name: 'Trip thing' });
    await admin.addItem(GENERAL_SCOPE, { name: 'General thing' });

    const tripList = await admin.listByScope(TRIP_SCOPE);
    const generalList = await admin.listByScope(GENERAL_SCOPE);
    expect(tripList.map((s) => s.name)).toEqual(['Trip thing']);
    expect(generalList.map((s) => s.name)).toEqual(['General thing']);
  });

  it('orders unbought before bought, then by name', async () => {
    const { admin } = setup('shopping-list-order');
    const a = await admin.addItem(TRIP_SCOPE, { name: 'Apples' });
    await admin.addItem(TRIP_SCOPE, { name: 'Bananas' });
    await admin.setBought(TRIP_SCOPE, a, true);

    const list = await admin.listByScope(TRIP_SCOPE);
    expect(list.map((s) => s.name)).toEqual(['Bananas', 'Apples']);
  });
});
