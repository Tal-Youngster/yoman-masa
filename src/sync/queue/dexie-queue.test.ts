import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deleteDatabase, makeTestDb } from '@/lib/storage/test-helpers';
import type { TravelDB } from '@/lib/storage';
import { enqueueWrite, peekQueue } from '@/lib/storage';

import { FakeDrive } from '../drive/fake.js';
import { EditPointMissingError, type FileId } from '../drive/types.js';

import { createDexieWriteQueue, rowToItem } from './dexie-queue.js';
import { ReconcilerRegistry, type Reconciler } from './reconciler.js';
import { drainAll } from './worker.js';
import type { WriteQueueItem } from './types.js';

let db: TravelDB;

beforeEach(() => {
  db = makeTestDb('dexie-queue');
});

afterEach(async () => {
  db.close();
  await deleteDatabase(db.name);
});

function makeItem(overrides: Partial<WriteQueueItem> & { id: string }): WriteQueueItem {
  return {
    entityType: 'trip',
    entityId: 'trp_test',
    op: 'create',
    payload: { foo: 1 },
    baseRevision: null,
    fileId: null,
    resolvedPath: 'MyVault/Travel/Trips/test/Trip.md',
    attempts: 0,
    lastError: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('createDexieWriteQueue', () => {
  it('enqueues, drains FIFO without deleting, and markApplied removes', async () => {
    const queue = createDexieWriteQueue(db);
    await queue.enqueue(makeItem({ id: 'A', createdAt: '2026-05-01T00:00:00.000Z' }));
    await queue.enqueue(makeItem({ id: 'B', createdAt: '2026-05-01T00:00:01.000Z' }));

    const head1 = await queue.drainNext();
    expect(head1?.id).toBe('A');
    // Row remains in storage until markApplied.
    expect((await peekQueue(10, db)).map((r) => r.id)).toEqual(['A', 'B']);

    await queue.markApplied('A');
    const head2 = await queue.drainNext();
    expect(head2?.id).toBe('B');
    await queue.markApplied('B');
    expect(await queue.drainNext()).toBeNull();
  });

  it('markFailed(terminal=false) bumps attempts; row stays for retry', async () => {
    const queue = createDexieWriteQueue(db);
    await queue.enqueue(makeItem({ id: 'X' }));

    await queue.markFailed('X', 'network glitch', false);
    const [row] = await peekQueue(10, db);
    expect(row?.attempts).toBe(1);
    expect(row?.last_error).toBe('network glitch');

    // The row is still drainable.
    const back = await queue.drainNext();
    expect(back?.id).toBe('X');
    expect(back?.attempts).toBe(1);
    expect(back?.lastError).toBe('network glitch');

    await queue.markApplied('X');
    expect(await queue.drainNext()).toBeNull();
  });

  it('markFailed(terminal=true) removes the row (dead-letter)', async () => {
    const queue = createDexieWriteQueue(db);
    await queue.enqueue(makeItem({ id: 'DEAD' }));
    await queue.markFailed('DEAD', 'no reconciler', true);
    expect(await queue.drainNext()).toBeNull();
    expect(await peekQueue(10, db)).toEqual([]);
  });

  it('refuses to forward v2-migration rows with empty resolved_path; dequeues them silently', async () => {
    // Directly write a row that looks like a backfilled v2 entry. Pin
    // created_at explicitly so ordering vs `GOOD` is deterministic.
    await enqueueWrite(
      {
        id: 'legacy',
        entity_type: 'trip',
        entity_id: 'trp_legacy',
        op: 'create',
        payload: null,
        base_revision: null,
        file_id: null,
        resolved_path: '', // <-- dead-letter sentinel
        created_at: Date.parse('2026-04-01T00:00:00.000Z'),
      },
      db,
    );
    const queue = createDexieWriteQueue(db);
    await queue.enqueue(makeItem({ id: 'GOOD', createdAt: '2026-04-01T00:00:01.000Z' }));

    // Drain silently dequeues the legacy row and returns the healthy one.
    const head = await queue.drainNext();
    expect(head?.id).toBe('GOOD');
    expect((await peekQueue(10, db)).map((r) => r.id)).toEqual(['GOOD']);
  });

  it('round-trips snake_case ↔ camelCase fields and epoch ms ↔ ISO', async () => {
    const queue = createDexieWriteQueue(db);
    await queue.enqueue(
      makeItem({
        id: 'MAP',
        entityType: 'trip',
        entityId: 'trp_map',
        baseRevision: 'rev-42',
        fileId: 'drive-file-42',
        resolvedPath: 'MyVault/Travel/Trips/map/Trip.md',
        attempts: 3,
        lastError: 'before',
        createdAt: '2026-04-15T12:34:56.000Z',
      }),
    );
    const [row] = await peekQueue(10, db);
    expect(row?.entity_type).toBe('trip');
    expect(row?.entity_id).toBe('trp_map');
    expect(row?.base_revision).toBe('rev-42');
    expect(row?.file_id).toBe('drive-file-42');
    expect(row?.resolved_path).toBe('MyVault/Travel/Trips/map/Trip.md');
    expect(row?.created_at).toBe(Date.parse('2026-04-15T12:34:56.000Z'));

    const back = await queue.drainNext();
    expect(back).toEqual({
      id: 'MAP',
      entityType: 'trip',
      entityId: 'trp_map',
      op: 'create',
      payload: { foo: 1 },
      baseRevision: 'rev-42',
      fileId: 'drive-file-42',
      resolvedPath: 'MyVault/Travel/Trips/map/Trip.md',
      attempts: 3,
      lastError: 'before',
      createdAt: '2026-04-15T12:34:56.000Z',
    });
  });
});

describe('rowToItem mapping (unit)', () => {
  it('converts a known row shape correctly', () => {
    const item = rowToItem({
      id: 'r',
      entity_type: 'trip',
      entity_id: 'trp_r',
      op: 'update',
      payload: 'pay',
      base_revision: 'rev',
      file_id: 'f',
      resolved_path: 'p',
      attempts: 2,
      last_error: 'e',
      created_at: Date.parse('2026-01-02T03:04:05.000Z'),
    });
    expect(item.createdAt).toBe('2026-01-02T03:04:05.000Z');
    expect(item.entityType).toBe('trip');
    expect(item.entityId).toBe('trp_r');
    expect(item.baseRevision).toBe('rev');
    expect(item.fileId).toBe('f');
    expect(item.resolvedPath).toBe('p');
    expect(item.lastError).toBe('e');
  });
});

/**
 * Integration: the worker's `drainAll` against a FakeDrive and the Dexie queue.
 * Mirrors `worker.test.ts` but proves the adapter is a drop-in for
 * MemoryWriteQueue.
 */
describe('drainAll integration with Dexie queue', () => {
  const markerReconciler: Reconciler<unknown, string> = {
    entityType: 'trip',
    fromMarkdown: () => null,
    toMarkdown: () => '',
    applyEdit(orig, item) {
      if (orig === '') return `INIT:${item.payload}`;
      if (!orig.includes('<EDIT_POINT>')) {
        throw new EditPointMissingError(item.fileId as FileId, '<EDIT_POINT>');
      }
      return orig.replace('<EDIT_POINT>', item.payload);
    },
  };

  it('drains a create and an update against the FakeDrive', async () => {
    const drive = new FakeDrive();
    const queue = createDexieWriteQueue(db);
    const registry = new ReconcilerRegistry();
    registry.register(markerReconciler);

    // Create — no fileId yet, parent resolver returns the Travel folder.
    await queue.enqueue(
      makeItem({
        id: 'C1',
        op: 'create',
        fileId: null,
        baseRevision: null,
        resolvedPath: 'MyVault/Travel/new.md',
        payload: 'NEW',
      }),
    );

    const createReport = await drainAll({
      drive,
      queue,
      reconcilers: registry,
      resolveParent: () => Promise.resolve(drive.travelFolderId),
      reconcileOptions: { backoffBaseMs: 0, sleep: () => Promise.resolve() },
    });
    expect(createReport.applied).toBe(1);
    // Worker called markApplied; the row should be gone from storage.
    expect(await peekQueue(10, db)).toEqual([]);

    const children = await drive.listFolder(drive.travelFolderId);
    const created = children.find((c) => c.name === 'new.md');
    expect(created).toBeDefined();
    if (!created) throw new Error('unreachable');

    // Now an update on the same file.
    drive.externalEdit(created.id, 'pre <EDIT_POINT> post');
    const base = (await drive.getMetadata(created.id)).headRevisionId;
    await queue.enqueue(
      makeItem({
        id: 'U1',
        op: 'update',
        fileId: created.id,
        baseRevision: base,
        resolvedPath: 'MyVault/Travel/new.md',
        payload: 'PATCHED',
      }),
    );
    const updateReport = await drainAll({
      drive,
      queue,
      reconcilers: registry,
      reconcileOptions: { backoffBaseMs: 0, sleep: () => Promise.resolve() },
    });
    expect(updateReport.applied).toBe(1);
    expect(await peekQueue(10, db)).toEqual([]);

    const { content } = await drive.getContent(created.id);
    expect(content).toBe('pre PATCHED post');
  });
});
