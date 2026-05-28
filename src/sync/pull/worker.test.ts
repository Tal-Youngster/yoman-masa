/**
 * Integration tests for the inbound pull worker + backfill against the in-memory
 * FakeDrive + a fresh fake-indexeddb-backed TravelDB. Uses an inline test
 * reconciler so the framework is exercised without coupling to a feature slice.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deleteDatabase, makeTestDb } from '@/lib/storage/test-helpers';
import {
  enqueueWrite,
  getKV,
  setKV,
  upsertFileMeta,
  type TravelDB,
} from '@/lib/storage';

import { FakeDrive } from '../drive/fake.js';
import { asFileId } from '../drive/types.js';

import { backfill } from './backfill.js';
import { InboundReconcilerRegistry } from './registry.js';
import type { InboundReconciler, PullDeps } from './types.js';
import { pullAll } from './worker.js';

/**
 * A minimal entity stored as JSON in the file body so the test doesn't have to
 * stand up the real Trip parser. Persisted into the `trips` table so we get a
 * real Dexie table with the right key. The "trip" entity_type discriminator
 * matches the schema; we're piggy-backing the table, not the Trip Zod shape.
 */
interface TestEntity {
  id: string;
  name: string;
}

/** Coerce a TestEntity into a Dexie row that the `trips` table will accept.
 *  Fields beyond `id` are unindexed so the table tolerates the lighter shape. */
function asTripRow(t: TestEntity): Record<string, unknown> {
  return { id: t.id, name: t.name, type: 'trip' };
}

const TEST_PATH = /^Trips\/[a-z0-9-]+\/Trip\.md$/;

function makeReconciler(): InboundReconciler<TestEntity> {
  return {
    entityType: 'trip',
    matchesPath: (p) => TEST_PATH.test(p),
    parseFile: (content) => {
      const parsed = JSON.parse(content) as TestEntity;
      return [parsed];
    },
    entityId: (e) => e.id,
    upsertEntity: async (e, db) => {
      await db.trips.put(asTripRow(e) as never);
    },
    deleteEntity: async (id, db) => {
      await db.trips.delete(id as never);
    },
  };
}

function seedTripFile(
  drive: FakeDrive,
  slug: string,
  entity: TestEntity,
): { fileId: ReturnType<typeof asFileId>; trips: ReturnType<typeof drive.seedFolder> } {
  // Reuse one Trips/ folder per drive — seedFolder creates a new id on each
  // call, so callers must do the lookup themselves. The helper handles the
  // common "create if missing" pattern.
  const tripsFolderId = ensureFolder(drive, 'Trips', drive.travelFolderId, 'MyVault/Travel/Trips');
  const slugFolderId = drive.seedFolder({
    name: slug,
    parents: [tripsFolderId],
    path: `MyVault/Travel/Trips/${slug}`,
  });
  const fileId = drive.seedFile({
    name: 'Trip.md',
    parent: slugFolderId,
    path: `MyVault/Travel/Trips/${slug}/Trip.md`,
    content: JSON.stringify(entity),
  });
  return { fileId, trips: tripsFolderId };
}

function ensureFolder(
  drive: FakeDrive,
  name: string,
  parent: ReturnType<typeof asFileId>,
  path: string,
): ReturnType<typeof asFileId> {
  for (const f of drive.files.values()) {
    if (f.meta.name === name && f.meta.parents[0] === parent) return f.meta.id;
  }
  return drive.seedFolder({ name, parents: [parent], path });
}

function makeDeps(drive: FakeDrive, db: TravelDB, registry: InboundReconcilerRegistry): PullDeps {
  return { drive, db, travelFolderId: drive.travelFolderId, registry };
}

let db: TravelDB;
beforeEach(() => {
  db = makeTestDb('pull-worker');
});
afterEach(async () => {
  db.close();
  await deleteDatabase(db.name);
});

describe('pullAll — first run delegates to backfill', () => {
  it('ingests pre-existing Trip.md files into Dexie + file_meta', async () => {
    const drive = new FakeDrive();
    seedTripFile(drive, 'argentina', { id: 'trp_arg', name: 'Argentina' });
    seedTripFile(drive, 'israel', { id: 'trp_isr', name: 'Israel' });
    const registry = new InboundReconcilerRegistry();
    registry.register(makeReconciler());

    const report = await pullAll(makeDeps(drive, db, registry));

    expect(report.upserted).toBe(2);
    expect(report.removed).toBe(0);
    expect(report.errors).toBe(0);

    const rows = await db.trips.toArray();
    expect(rows.map((r) => (r as unknown as { id: string }).id).sort()).toEqual([
      'trp_arg',
      'trp_isr',
    ]);

    // file_meta written for each.
    const fm = await db.file_meta.toArray();
    expect(fm.map((m) => m.entity_id).sort()).toEqual(['trp_arg', 'trp_isr']);
    expect(fm.every((m) => m.entity_type === 'trip')).toBe(true);

    // Change token captured.
    const token = await getKV('drive_changes_page_token', db);
    expect(token).not.toBeNull();
  });

  it('ignores files outside Trips/ and folders without Trip.md', async () => {
    const drive = new FakeDrive();
    seedTripFile(drive, 'argentina', { id: 'trp_arg', name: 'Argentina' });
    // Stray file under Travel/ that no reconciler claims.
    drive.seedFile({
      name: 'README.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/README.md',
      content: '# notes',
    });
    const registry = new InboundReconcilerRegistry();
    registry.register(makeReconciler());

    const report = await pullAll(makeDeps(drive, db, registry));

    expect(report.upserted).toBe(1);
    // README.md scanned + skipped.
    expect(report.skipped).toBeGreaterThanOrEqual(1);
    expect((await db.trips.toArray()).length).toBe(1);
  });

  it('reconcileMissing: drops Dexie entities whose Drive file is gone', async () => {
    const drive = new FakeDrive();
    // Pre-seed Dexie with a "tokyo" trip whose file_meta points at a Drive
    // file that no longer exists (simulated: the file id was never created
    // on the FakeDrive in the first place).
    await db.trips.put({ id: 'trp_tokyo', name: 'Tokyo', type: 'trip' } as never);
    await upsertFileMeta(
      {
        file_id: 'fil-orphan',
        entity_type: 'trip',
        entity_id: 'trp_tokyo',
        head_revision_id: 'fil-orphan:1',
        modified_time: '2026-01-01T00:00:00.000Z',
        path: 'Trips/tokyo/Trip.md',
      },
      db,
    );

    // Argentina exists on Drive.
    seedTripFile(drive, 'argentina', { id: 'trp_arg', name: 'Argentina' });
    const registry = new InboundReconcilerRegistry();
    registry.register(makeReconciler());

    const report = await pullAll(makeDeps(drive, db, registry));

    expect(report.upserted).toBe(1);
    expect(report.removed).toBe(1); // tokyo dropped

    const remaining = (await db.trips.toArray()).map((r) => (r as unknown as { id: string }).id);
    expect(remaining.sort()).toEqual(['trp_arg']);
    expect(await db.file_meta.get('fil-orphan')).toBeUndefined();
  });

  it('reconcileMissing: keeps Dexie entities with a pending local write', async () => {
    const drive = new FakeDrive();
    // Local create that never made it to Drive — keep the orphan.
    await db.trips.put({ id: 'trp_pending', name: 'Pending', type: 'trip' } as never);
    await upsertFileMeta(
      {
        file_id: 'fil-pending',
        entity_type: 'trip',
        entity_id: 'trp_pending',
        head_revision_id: 'fil-pending:1',
        modified_time: '2026-01-01T00:00:00.000Z',
        path: 'Trips/pending/Trip.md',
      },
      db,
    );
    await enqueueWrite(
      {
        id: '01H_pending_write',
        entity_type: 'trip',
        entity_id: 'trp_pending',
        op: 'update',
        payload: {},
        base_revision: null,
        file_id: 'fil-pending',
        resolved_path: 'MyVault/Travel/Trips/pending/Trip.md',
      },
      db,
    );

    const registry = new InboundReconcilerRegistry();
    registry.register(makeReconciler());

    const report = await pullAll(makeDeps(drive, db, registry));

    expect(report.removed).toBe(0);
    expect(await db.trips.get('trp_pending' as never)).toBeDefined();
  });
});

describe('pullAll — incremental change-feed pass', () => {
  it('propagates an externally-created Trip.md to Dexie', async () => {
    const drive = new FakeDrive();
    const registry = new InboundReconcilerRegistry();
    registry.register(makeReconciler());

    // Initial backfill — empty.
    await pullAll(makeDeps(drive, db, registry));
    expect((await db.trips.toArray()).length).toBe(0);

    // Someone (Obsidian, another device) drops a Trip.md.
    seedTripFile(drive, 'israel', { id: 'trp_isr', name: 'Israel' });

    const report = await pullAll(makeDeps(drive, db, registry));
    expect(report.upserted).toBe(1);
    expect((await db.trips.toArray()).map((r) => (r as unknown as { id: string }).id)).toEqual([
      'trp_isr',
    ]);
  });

  it('propagates an external removal to Dexie', async () => {
    const drive = new FakeDrive();
    const registry = new InboundReconcilerRegistry();
    registry.register(makeReconciler());

    const { fileId } = seedTripFile(drive, 'argentina', { id: 'trp_arg', name: 'Argentina' });
    await pullAll(makeDeps(drive, db, registry));
    expect((await db.trips.toArray()).length).toBe(1);

    // External delete (Obsidian removes the folder, etc.).
    drive.externalRemove(fileId);

    const report = await pullAll(makeDeps(drive, db, registry));
    expect(report.removed).toBe(1);
    expect((await db.trips.toArray()).length).toBe(0);
    expect(await db.file_meta.get(fileId)).toBeUndefined();
  });

  it('suppresses inbound update when a local write is pending for the same entity', async () => {
    const drive = new FakeDrive();
    const registry = new InboundReconcilerRegistry();
    registry.register(makeReconciler());

    const { fileId } = seedTripFile(drive, 'argentina', { id: 'trp_arg', name: 'Argentina' });
    await pullAll(makeDeps(drive, db, registry));
    // Confirm initial state.
    const initial = await db.trips.get('trp_arg' as never);
    expect((initial as unknown as { name: string }).name).toBe('Argentina');

    // External edit on Drive (someone renamed it remotely)…
    drive.externalEdit(fileId, JSON.stringify({ id: 'trp_arg', name: 'Argentina (remote)' }));
    // …while a local write is queued for the same entity.
    await enqueueWrite(
      {
        id: '01H_local',
        entity_type: 'trip',
        entity_id: 'trp_arg',
        op: 'update',
        payload: {},
        base_revision: null,
        file_id: fileId,
        resolved_path: 'MyVault/Travel/Trips/argentina/Trip.md',
      },
      db,
    );

    const report = await pullAll(makeDeps(drive, db, registry));

    // The remote edit is skipped because the local write hasn't drained yet.
    expect(report.upserted).toBe(0);
    expect(report.skipped).toBeGreaterThanOrEqual(1);
    const after = await db.trips.get('trp_arg' as never);
    expect((after as unknown as { name: string }).name).toBe('Argentina');
  });

  it('persists the change token so a subsequent pass is incremental', async () => {
    const drive = new FakeDrive();
    const registry = new InboundReconcilerRegistry();
    registry.register(makeReconciler());

    seedTripFile(drive, 'argentina', { id: 'trp_arg', name: 'Argentina' });
    await pullAll(makeDeps(drive, db, registry));

    const tokenAfterFirst = await getKV('drive_changes_page_token', db);

    // A second pass with no new changes still advances the token to the
    // latest server-known position. FakeDrive returns `String(changes.length)`
    // so the token mirrors the change-feed length.
    await pullAll(makeDeps(drive, db, registry));
    const tokenAfterSecond = await getKV('drive_changes_page_token', db);
    expect(tokenAfterSecond).toBe(tokenAfterFirst);
  });
});

describe('backfill — direct invocation', () => {
  it('does not re-run on a configured token but a manual call still works', async () => {
    const drive = new FakeDrive();
    const registry = new InboundReconcilerRegistry();
    registry.register(makeReconciler());

    seedTripFile(drive, 'argentina', { id: 'trp_arg', name: 'Argentina' });
    await setKV('drive_changes_page_token', '0', db);

    // pullAll would take the change-feed path because the token is set;
    // calling backfill directly forces a full snapshot pass — used by a
    // future "Re-sync from Drive" recovery action.
    const report = await backfill(makeDeps(drive, db, registry));
    expect(report.upserted).toBe(1);
  });

  it('records parse errors without aborting the walk', async () => {
    const drive = new FakeDrive();
    const registry = new InboundReconcilerRegistry();
    registry.register(makeReconciler());

    // First file parses fine; second is malformed JSON.
    seedTripFile(drive, 'argentina', { id: 'trp_arg', name: 'Argentina' });
    const tripsFolder = ensureFolder(
      drive,
      'Trips',
      drive.travelFolderId,
      'MyVault/Travel/Trips',
    );
    const badSlug = drive.seedFolder({
      name: 'broken',
      parents: [tripsFolder],
      path: 'MyVault/Travel/Trips/broken',
    });
    drive.seedFile({
      name: 'Trip.md',
      parent: badSlug,
      path: 'MyVault/Travel/Trips/broken/Trip.md',
      content: 'not json at all',
    });

    const report = await backfill(makeDeps(drive, db, registry));
    expect(report.upserted).toBe(1);
    expect(report.errors).toBe(1);
  });
});
