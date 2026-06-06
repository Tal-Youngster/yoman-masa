import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newShoppingItem } from '@/domain/shopping-item';
import { newTripId } from '@/domain/ids';
import { deleteDatabase, makeTestDb } from '@/lib/storage/test-helpers';
import type { TravelDB } from '@/lib/storage';
import { FakeDrive } from '@/sync/drive/fake';
import { InboundReconcilerRegistry, pullAll } from '@/sync/pull';

import { shoppingInboundReconciler } from './inbound';
import { serializeShoppingFile } from './serializer';

let db: TravelDB;
beforeEach(() => {
  db = makeTestDb('shopping-inbound');
});
afterEach(async () => {
  db.close();
  await deleteDatabase(db.name);
});

const tripId = newTripId();
const s1 = newShoppingItem({ trip_id: tripId, name: 'Trail runners', bought: false });
const s2 = newShoppingItem({
  trip_id: tripId,
  name: 'Sunscreen',
  bought: true,
  quantity: 2,
});
const general = newShoppingItem({ trip_id: null, name: 'Travel adapter', bought: false });

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

describe('shoppingInboundReconciler', () => {
  it('matchesPath: claims both per-trip and General Shopping.md', () => {
    expect(shoppingInboundReconciler.matchesPath('Trips/argentina/Shopping.md')).toBe(true);
    expect(shoppingInboundReconciler.matchesPath('General/Shopping.md')).toBe(true);
  });

  it('matchesPath: rejects unrelated paths', () => {
    expect(shoppingInboundReconciler.matchesPath('Trips/argentina/Trip.md')).toBe(false);
    expect(shoppingInboundReconciler.matchesPath('Trips/argentina/Tasks.md')).toBe(false);
    expect(shoppingInboundReconciler.matchesPath('Shopping.md')).toBe(false);
    expect(shoppingInboundReconciler.matchesPath('Trips/Argentina/Shopping.md')).toBe(false);
    expect(shoppingInboundReconciler.matchesPath('General/Other.md')).toBe(false);
    expect(shoppingInboundReconciler.matchesPath('Trips/x/Sub/Shopping.md')).toBe(false);
  });

  it('parseFile: returns every item in a per-trip file', () => {
    const md = serializeShoppingFile({ tripId, items: [s1, s2] });
    const out = shoppingInboundReconciler.parseFile(md, 'Trips/argentina/Shopping.md');
    expect(out.map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort());
  });

  it('parseFile: returns the General item (trip_id: null) from General/Shopping.md', () => {
    const md = serializeShoppingFile({ tripId: null, items: [general] });
    const out = shoppingInboundReconciler.parseFile(md, 'General/Shopping.md');
    expect(out).toHaveLength(1);
    expect(out[0].trip_id).toBeNull();
    expect(out[0].id).toBe(general.id);
  });

  it('parseFile: returns [] for unparseable content', () => {
    expect(shoppingInboundReconciler.parseFile('not-frontmatter', 'x')).toEqual([]);
    expect(
      shoppingInboundReconciler.parseFile('---\ntype: trip\nid: trp_x\n---\n', 'x'),
    ).toEqual([]);
  });

  it('end-to-end: trip + General shopping files both land in Dexie', async () => {
    const drive = new FakeDrive();

    const trips = ensureFolder(drive, 'Trips', drive.travelFolderId, 'MyVault/Travel/Trips');
    const slug = ensureFolder(drive, 'argentina', trips, 'MyVault/Travel/Trips/argentina');
    drive.seedFile({
      name: 'Shopping.md',
      parent: slug,
      path: 'MyVault/Travel/Trips/argentina/Shopping.md',
      content: serializeShoppingFile({ tripId, items: [s1, s2] }),
    });

    const generalFolder = ensureFolder(
      drive,
      'General',
      drive.travelFolderId,
      'MyVault/Travel/General',
    );
    drive.seedFile({
      name: 'Shopping.md',
      parent: generalFolder,
      path: 'MyVault/Travel/General/Shopping.md',
      content: serializeShoppingFile({ tripId: null, items: [general] }),
    });

    const registry = new InboundReconcilerRegistry();
    registry.register(shoppingInboundReconciler);

    await pullAll({ drive, db, travelFolderId: drive.travelFolderId, registry });
    const stored = await db.shopping_items.toArray();
    expect(stored.map((s) => s.id).sort()).toEqual([s1.id, s2.id, general.id].sort());
    const generalStored = stored.find((s) => s.id === general.id);
    expect(generalStored?.trip_id).toBeNull();
  });

  it('removes an item that disappears from a Shopping.md between syncs', async () => {
    const drive = new FakeDrive();
    const trips = ensureFolder(drive, 'Trips', drive.travelFolderId, 'MyVault/Travel/Trips');
    const slug = ensureFolder(drive, 'argentina', trips, 'MyVault/Travel/Trips/argentina');
    const fileId = drive.seedFile({
      name: 'Shopping.md',
      parent: slug,
      path: 'MyVault/Travel/Trips/argentina/Shopping.md',
      content: serializeShoppingFile({ tripId, items: [s1, s2] }),
    });

    const registry = new InboundReconcilerRegistry();
    registry.register(shoppingInboundReconciler);

    await pullAll({ drive, db, travelFolderId: drive.travelFolderId, registry });
    expect((await db.shopping_items.toArray()).length).toBe(2);

    drive.externalEdit(fileId, serializeShoppingFile({ tripId, items: [s1] }));
    const report = await pullAll({
      drive,
      db,
      travelFolderId: drive.travelFolderId,
      registry,
    });
    expect(report.removed).toBeGreaterThanOrEqual(1);
    expect(await db.shopping_items.get(s2.id)).toBeUndefined();
    expect(await db.shopping_items.get(s1.id)).toBeDefined();
  });
});
