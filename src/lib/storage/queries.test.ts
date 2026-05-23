import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newTrip } from '@/domain/trip';
import { newAccommodation } from '@/domain/accommodation';
import { newPlace } from '@/domain/place';
import { newExpense } from '@/domain/expense';
import { newTask } from '@/domain/task';
import { newShoppingItem } from '@/domain/shopping-item';
import { newArticle } from '@/domain/article';
import { isoDate } from '@/domain/dates';
import { currency } from '@/domain/money';

import { deleteDatabase, makeTestDb } from './test-helpers';
import {
  accommodationsByTrip,
  accommodationsByTripAndStatus,
  articlesByTrip,
  dequeueById,
  deleteAccommodation,
  deleteTrip,
  drainNext,
  enqueueWrite,
  expensesByTrip,
  expensesByTripAndMonth,
  generalArticles,
  generalShoppingItems,
  generalTasks,
  getAccommodation,
  getKV,
  getTrip,
  getFileMeta,
  getFileMetaByEntity,
  listTrips,
  peekNextPending,
  peekQueue,
  placesByTrip,
  recordQueueFailure,
  setKV,
  shoppingItemsByTrip,
  tasksByTrip,
  upsertAccommodation,
  upsertArticle,
  upsertExpense,
  upsertFileMeta,
  upsertPlace,
  upsertShoppingItem,
  upsertTask,
  upsertTrip,
  visitedPlacesByTrip,
} from './queries';
import type { TravelDB } from './db';

const makeTrip = (overrides: Partial<Parameters<typeof newTrip>[0]> = {}) =>
  newTrip({
    slug: 'thailand-2026',
    name: 'Thailand 2026',
    start_date: isoDate('2026-06-01'),
    end_date: isoDate('2026-07-15'),
    home_currency: currency('USD'),
    ...overrides,
  });

let db: TravelDB;

beforeEach(() => {
  db = makeTestDb('queries');
});

afterEach(async () => {
  db.close();
  await deleteDatabase(db.name);
});

describe('Trip CRUD', () => {
  it('round-trips a Trip through Dexie unchanged', async () => {
    const trip = makeTrip();
    await upsertTrip(trip, db);
    const back = await getTrip(trip.id, db);
    expect(back).toEqual(trip);
  });

  it('deleteTrip removes the row', async () => {
    const trip = makeTrip();
    await upsertTrip(trip, db);
    await deleteTrip(trip.id, db);
    expect(await getTrip(trip.id, db)).toBeUndefined();
    expect(await listTrips(db)).toHaveLength(0);
  });

  it('upsert is idempotent — re-putting overwrites in place', async () => {
    const trip = makeTrip();
    await upsertTrip(trip, db);
    const edited = { ...trip, notes: 'updated' };
    await upsertTrip(edited, db);
    expect(await getTrip(trip.id, db)).toEqual(edited);
    expect(await listTrips(db)).toHaveLength(1);
  });
});

describe('Accommodation CRUD + trip filter', () => {
  it('round-trips and filters by trip', async () => {
    const tripA = makeTrip({ slug: 'a' });
    const tripB = makeTrip({ slug: 'b' });
    await upsertTrip(tripA, db);
    await upsertTrip(tripB, db);

    const accA = newAccommodation({
      trip_id: tripA.id,
      status: 'booked',
      name: 'Hotel A',
      service: 'booking',
      checkin: isoDate('2026-06-05'),
      checkout: isoDate('2026-06-09'),
    });
    const accB = newAccommodation({
      trip_id: tripB.id,
      status: 'wishlist',
      name: 'Hotel B',
      service: 'airbnb',
      checkin: isoDate('2026-06-10'),
      checkout: isoDate('2026-06-12'),
    });
    await upsertAccommodation(accA, db);
    await upsertAccommodation(accB, db);

    expect(await getAccommodation(accA.id, db)).toEqual(accA);
    expect((await accommodationsByTrip(tripA.id, db)).map((a) => a.id)).toEqual([accA.id]);
    expect((await accommodationsByTripAndStatus(tripA.id, 'booked', db)).map((a) => a.id)).toEqual([
      accA.id,
    ]);
    expect(
      (await accommodationsByTripAndStatus(tripA.id, 'wishlist', db)).map((a) => a.id),
    ).toEqual([]);
  });

  it('deleteAccommodation removes only the target', async () => {
    const trip = makeTrip();
    await upsertTrip(trip, db);
    const acc = newAccommodation({
      trip_id: trip.id,
      status: 'booked',
      name: 'X',
      service: 'direct',
      checkin: isoDate('2026-06-01'),
      checkout: isoDate('2026-06-02'),
    });
    await upsertAccommodation(acc, db);
    await deleteAccommodation(acc.id, db);
    expect(await getAccommodation(acc.id, db)).toBeUndefined();
  });
});

describe('Places', () => {
  it('round-trips and isolates by trip; visited filter works', async () => {
    const trip = makeTrip();
    await upsertTrip(trip, db);
    const wish = newPlace({ trip_id: trip.id, name: 'Wat Pho', lat: 13.7, lng: 100.49 });
    const seen = newPlace({
      trip_id: trip.id,
      name: 'Grand Palace',
      lat: 13.75,
      lng: 100.49,
      visited: true,
      visited_date: isoDate('2026-06-05'),
    });
    await upsertPlace(wish, db);
    await upsertPlace(seen, db);

    expect((await placesByTrip(trip.id, db)).map((p) => p.id).sort()).toEqual(
      [wish.id, seen.id].sort(),
    );
    expect((await visitedPlacesByTrip(trip.id, db)).map((p) => p.id)).toEqual([seen.id]);
  });
});

describe('Expenses + month range query', () => {
  it('filters by trip and by month using the compound index', async () => {
    const trip = makeTrip();
    await upsertTrip(trip, db);

    const may1 = newExpense({
      trip_id: trip.id,
      date: isoDate('2026-05-03'),
      amount: 10,
      currency: currency('USD'),
      category: 'food',
    });
    const may2 = newExpense({
      trip_id: trip.id,
      date: isoDate('2026-05-30'),
      amount: 20,
      currency: currency('USD'),
      category: 'transport',
    });
    const june = newExpense({
      trip_id: trip.id,
      date: isoDate('2026-06-01'),
      amount: 30,
      currency: currency('USD'),
      category: 'food',
    });
    await upsertExpense(may1, db);
    await upsertExpense(may2, db);
    await upsertExpense(june, db);

    expect((await expensesByTrip(trip.id, db)).map((e) => e.id).sort()).toEqual(
      [may1.id, may2.id, june.id].sort(),
    );

    const inMay = await expensesByTripAndMonth(trip.id, '2026-05', db);
    expect(inMay.map((e) => e.id).sort()).toEqual([may1.id, may2.id].sort());

    const inJune = await expensesByTripAndMonth(trip.id, '2026-06', db);
    expect(inJune.map((e) => e.id)).toEqual([june.id]);
  });

  it('rejects malformed yyyy_mm', async () => {
    const trip = makeTrip();
    await upsertTrip(trip, db);
    await expect(expensesByTripAndMonth(trip.id, '2026-13', db)).rejects.toThrow(/bad yyyy_mm/);
    await expect(expensesByTripAndMonth(trip.id, '202605', db)).rejects.toThrow(/bad yyyy_mm/);
  });
});

describe('Cross-trip nullable trip_id (tasks / shopping / articles)', () => {
  it('tasks: trip vs General isolation', async () => {
    const trip = makeTrip();
    await upsertTrip(trip, db);

    const tripTask = newTask({
      trip_id: trip.id,
      title: 'Pack passport',
      status: 'open',
    });
    const generalTask = newTask({
      trip_id: null,
      title: 'Buy travel adapter',
      status: 'open',
    });
    await upsertTask(tripTask, db);
    await upsertTask(generalTask, db);

    expect((await tasksByTrip(trip.id, db)).map((t) => t.id)).toEqual([tripTask.id]);
    expect((await generalTasks(db)).map((t) => t.id)).toEqual([generalTask.id]);
  });

  it('shopping_items: trip vs General isolation', async () => {
    const trip = makeTrip();
    await upsertTrip(trip, db);

    const tripItem = newShoppingItem({
      trip_id: trip.id,
      name: 'Sunscreen',
      bought: false,
    });
    const generalItem = newShoppingItem({
      trip_id: null,
      name: 'Universal adapter',
      bought: false,
    });
    await upsertShoppingItem(tripItem, db);
    await upsertShoppingItem(generalItem, db);

    expect((await shoppingItemsByTrip(trip.id, db)).map((s) => s.id)).toEqual([tripItem.id]);
    expect((await generalShoppingItems(db)).map((s) => s.id)).toEqual([generalItem.id]);
  });

  it('articles: trip vs General isolation', async () => {
    const trip = makeTrip();
    await upsertTrip(trip, db);

    const tripArt = newArticle({
      trip_id: trip.id,
      url: 'https://example.com/a',
      title: 'Bangkok food guide',
    });
    const generalArt = newArticle({
      trip_id: null,
      url: 'https://example.com/b',
      title: 'Packing checklist',
    });
    await upsertArticle(tripArt, db);
    await upsertArticle(generalArt, db);

    expect((await articlesByTrip(trip.id, db)).map((a) => a.id)).toEqual([tripArt.id]);
    expect((await generalArticles(db)).map((a) => a.id)).toEqual([generalArt.id]);
  });
});

describe('file_meta', () => {
  it('round-trips by file_id and by entity', async () => {
    const trip = makeTrip();
    await upsertTrip(trip, db);
    const meta = {
      file_id: 'drive-file-1',
      entity_type: 'trip' as const,
      entity_id: trip.id,
      head_revision_id: 'rev-1',
      modified_time: '2026-05-22T10:00:00.000Z',
      path: '/Travel/Trips/thailand-2026/Trip.md',
    };
    await upsertFileMeta(meta, db);
    expect(await getFileMeta('drive-file-1', db)).toEqual(meta);
    expect(await getFileMetaByEntity('trip', trip.id, db)).toEqual(meta);
  });
});

describe('write_queue', () => {
  it('FIFO drain, peek, and failure recording', async () => {
    await enqueueWrite(
      {
        id: '01HQ1',
        entity_type: 'trip',
        entity_id: 'trp_test1',
        op: 'create',
        payload: { foo: 1 },
        base_revision: null,
        file_id: null,
        resolved_path: 'MyVault/Travel/Trips/test1/Trip.md',
      },
      db,
    );
    // ensure created_at differs deterministically
    await new Promise((r) => setTimeout(r, 2));
    await enqueueWrite(
      {
        id: '01HQ2',
        entity_type: 'expense',
        entity_id: 'exp_test1',
        op: 'update',
        payload: { bar: 2 },
        base_revision: 'rev-7',
        file_id: 'drive-file-7',
        resolved_path: 'MyVault/Travel/Trips/test1/Expenses/2026-05.md',
      },
      db,
    );

    const peeked = await peekQueue(10, db);
    expect(peeked.map((r) => r.id)).toEqual(['01HQ1', '01HQ2']);

    await recordQueueFailure('01HQ1', 'network down', db);
    const peekedAfter = await peekQueue(10, db);
    const first = peekedAfter.find((r) => r.id === '01HQ1');
    expect(first?.attempts).toBe(1);
    expect(first?.last_error).toBe('network down');

    const a = await drainNext(db);
    expect(a?.id).toBe('01HQ1');
    const b = await drainNext(db);
    expect(b?.id).toBe('01HQ2');
    const c = await drainNext(db);
    expect(c).toBeNull();
  });

  it('enqueueWrite defaults attempts / last_error / created_at', async () => {
    await enqueueWrite(
      {
        id: '01HQX',
        entity_type: 'task',
        entity_id: 'tsk_x',
        op: 'delete',
        payload: null,
        base_revision: null,
        file_id: 'drive-task-file',
        resolved_path: 'MyVault/Travel/General/Tasks.md',
      },
      db,
    );
    const [row] = await peekQueue(1, db);
    expect(row?.attempts).toBe(0);
    expect(row?.last_error).toBeNull();
    expect(typeof row?.created_at).toBe('number');
  });

  it('round-trips file_id and resolved_path through enqueue → peek → drain', async () => {
    await enqueueWrite(
      {
        id: '01HQV3',
        entity_type: 'trip',
        entity_id: 'trp_v3',
        op: 'update',
        payload: { foo: 'bar' },
        base_revision: 'rev-9',
        file_id: 'drive-trip-9',
        resolved_path: 'MyVault/Travel/Trips/example/Trip.md',
      },
      db,
    );

    const [peeked] = await peekQueue(10, db);
    expect(peeked?.file_id).toBe('drive-trip-9');
    expect(peeked?.resolved_path).toBe('MyVault/Travel/Trips/example/Trip.md');

    const drained = await drainNext(db);
    expect(drained?.file_id).toBe('drive-trip-9');
    expect(drained?.resolved_path).toBe('MyVault/Travel/Trips/example/Trip.md');
  });

  it('peekNextPending returns head without removing; dequeueById removes by id', async () => {
    await enqueueWrite(
      {
        id: 'A',
        entity_type: 'trip',
        entity_id: 'trp_a',
        op: 'create',
        payload: null,
        base_revision: null,
        file_id: null,
        resolved_path: 'MyVault/Travel/Trips/a/Trip.md',
      },
      db,
    );
    await new Promise((r) => setTimeout(r, 2));
    await enqueueWrite(
      {
        id: 'B',
        entity_type: 'trip',
        entity_id: 'trp_b',
        op: 'create',
        payload: null,
        base_revision: null,
        file_id: null,
        resolved_path: 'MyVault/Travel/Trips/b/Trip.md',
      },
      db,
    );

    const head1 = await peekNextPending(db);
    expect(head1?.id).toBe('A');
    const head2 = await peekNextPending(db);
    expect(head2?.id).toBe('A'); // peek does not remove

    await dequeueById('A', db);
    const head3 = await peekNextPending(db);
    expect(head3?.id).toBe('B');

    await dequeueById('missing', db); // idempotent
    expect((await peekQueue(10, db)).map((r) => r.id)).toEqual(['B']);
  });
});

describe('kv', () => {
  it('round-trips typed values; getKV returns null for missing keys', async () => {
    expect(await getKV('active_trip_id', db)).toBeNull();
    const trip = makeTrip();
    await setKV('active_trip_id', trip.id, db);
    expect(await getKV('active_trip_id', db)).toBe(trip.id);

    await setKV('drive_changes_page_token', 'pt-123', db);
    expect(await getKV('drive_changes_page_token', db)).toBe('pt-123');
  });
});

describe('exactOptionalPropertyTypes hygiene', () => {
  it('strips undefined keys before put so Dexie does not store them', async () => {
    const trip = makeTrip();
    await upsertTrip(trip, db);
    // Accommodation with several optional fields left undefined.
    const acc = newAccommodation({
      trip_id: trip.id,
      status: 'booked',
      name: 'Spartan',
      service: 'direct',
      checkin: isoDate('2026-06-05'),
      checkout: isoDate('2026-06-07'),
    });
    await upsertAccommodation(acc, db);
    const stored = await getAccommodation(acc.id, db);
    expect(stored).toBeDefined();
    // Keys never set should be absent (not present-as-undefined).
    const storedKeys = Object.keys(stored as object);
    expect(storedKeys).not.toContain('cost');
    expect(storedKeys).not.toContain('location');
    expect(storedKeys).not.toContain('host');
    expect(storedKeys).not.toContain('confirmation');
  });
});
