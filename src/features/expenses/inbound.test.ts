import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isoDate } from '@/domain/dates';
import { currency } from '@/domain/money';
import { newExpense } from '@/domain/expense';
import { newTripId } from '@/domain/ids';
import { deleteDatabase, makeTestDb } from '@/lib/storage/test-helpers';
import type { TravelDB } from '@/lib/storage';
import { FakeDrive } from '@/sync/drive/fake';
import { InboundReconcilerRegistry, pullAll } from '@/sync/pull';

import { expenseInboundReconciler } from './inbound';
import { serializeExpensesLedger } from './serializer';

let db: TravelDB;
beforeEach(() => {
  db = makeTestDb('expense-inbound');
});
afterEach(async () => {
  db.close();
  await deleteDatabase(db.name);
});

const tripId = newTripId();
const a = newExpense({
  trip_id: tripId,
  date: isoDate('2026-11-04'),
  amount: 12.4,
  currency: currency('EUR'),
  category: 'food',
  description: 'café',
});
const b = newExpense({
  trip_id: tripId,
  date: isoDate('2026-11-09'),
  amount: 38,
  currency: currency('EUR'),
  category: 'transport',
  description: 'bus',
});
const c = newExpense({
  trip_id: tripId,
  date: isoDate('2026-11-12'),
  amount: 7.5,
  currency: currency('EUR'),
  category: 'food',
  description: 'snack',
});

function seedNovemberLedger(
  drive: FakeDrive,
  expenses: readonly typeof a[],
): ReturnType<typeof drive.seedFile> {
  const trips = ensureFolder(drive, 'Trips', drive.travelFolderId, 'MyVault/Travel/Trips');
  const slug = ensureFolder(drive, 'argentina', trips, 'MyVault/Travel/Trips/argentina');
  const exp = ensureFolder(drive, 'Expenses', slug, 'MyVault/Travel/Trips/argentina/Expenses');
  return drive.seedFile({
    name: '2026-11.md',
    parent: exp,
    path: 'MyVault/Travel/Trips/argentina/Expenses/2026-11.md',
    content: serializeExpensesLedger({ tripId, month: '2026-11', expenses }),
  });
}

function ensureFolder(
  drive: FakeDrive,
  name: string,
  parent: ReturnType<typeof drive.seedFolder>,
  path: string,
): ReturnType<typeof drive.seedFolder> {
  for (const f of drive.files.values()) {
    if (f.meta.name === name && f.meta.parents[0] === parent) return f.meta.id;
  }
  return drive.seedFolder({ name, parents: [parent], path });
}

describe('expenseInboundReconciler', () => {
  it('matchesPath: claims `Trips/<slug>/Expenses/<yyyy-mm>.md`', () => {
    expect(
      expenseInboundReconciler.matchesPath('Trips/argentina/Expenses/2026-11.md'),
    ).toBe(true);
    expect(
      expenseInboundReconciler.matchesPath('Trips/x/Expenses/2099-12.md'),
    ).toBe(true);
  });

  it('matchesPath: rejects invalid month shape and look-alikes', () => {
    expect(
      expenseInboundReconciler.matchesPath('Trips/argentina/Expenses/2026-13.md'),
    ).toBe(false); // bad month
    expect(
      expenseInboundReconciler.matchesPath('Trips/argentina/Expenses/26-11.md'),
    ).toBe(false);
    expect(expenseInboundReconciler.matchesPath('Expenses/2026-11.md')).toBe(false);
    expect(
      expenseInboundReconciler.matchesPath('Trips/Argentina/Expenses/2026-11.md'),
    ).toBe(false);
  });

  it('parseFile: returns every expense in the ledger', () => {
    const md = serializeExpensesLedger({ tripId, month: '2026-11', expenses: [a, b, c] });
    const out = expenseInboundReconciler.parseFile(
      md,
      'Trips/argentina/Expenses/2026-11.md',
    );
    expect(out.map((e) => e.id).sort()).toEqual([a.id, b.id, c.id].sort());
  });

  it('parseFile: returns [] when the file is unparseable', () => {
    expect(expenseInboundReconciler.parseFile('not-frontmatter', 'x')).toEqual([]);
    expect(
      expenseInboundReconciler.parseFile(
        '---\ntype: trip\nid: trp_x\n---\n',
        'x',
      ),
    ).toEqual([]);
  });

  it('end-to-end: every row in a ledger lands in Dexie after pullAll', async () => {
    const drive = new FakeDrive();
    seedNovemberLedger(drive, [a, b, c]);

    const registry = new InboundReconcilerRegistry();
    registry.register(expenseInboundReconciler);

    const report = await pullAll({
      drive,
      db,
      travelFolderId: drive.travelFolderId,
      registry,
    });

    expect(report.upserted).toBeGreaterThanOrEqual(1);
    const stored = await db.expenses.toArray();
    expect(stored.map((e) => e.id).sort()).toEqual([a.id, b.id, c.id].sort());
  });

  it('removes a row that disappears from the ledger between syncs', async () => {
    const drive = new FakeDrive();
    const fileId = seedNovemberLedger(drive, [a, b, c]);

    const registry = new InboundReconcilerRegistry();
    registry.register(expenseInboundReconciler);

    await pullAll({ drive, db, travelFolderId: drive.travelFolderId, registry });
    expect((await db.expenses.toArray()).length).toBe(3);

    // User (or another device) removes `b` from the ledger on Drive.
    drive.externalEdit(
      fileId,
      serializeExpensesLedger({ tripId, month: '2026-11', expenses: [a, c] }),
    );

    const report = await pullAll({
      drive,
      db,
      travelFolderId: drive.travelFolderId,
      registry,
    });
    expect(report.removed).toBeGreaterThanOrEqual(1);
    expect(await db.expenses.get(a.id)).toBeDefined();
    expect(await db.expenses.get(b.id)).toBeUndefined();
    expect(await db.expenses.get(c.id)).toBeDefined();
  });
});
