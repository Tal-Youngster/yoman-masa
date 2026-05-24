import { describe, expect, it } from 'vitest';

import { FakeDrive } from '../drive/fake.js';
import { DriveApiError, EditPointMissingError, type FileId } from '../drive/types.js';
import { MemoryWriteQueue } from './memory-queue.js';
import { ReconcilerRegistry, type Reconciler } from './reconciler.js';
import { drainAll, processItem } from './worker.js';
import type { WriteQueueItem } from './types.js';

const markerReconciler: Reconciler<unknown, string> = {
  entityType: 'marker',
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

function makeItem(overrides: Partial<WriteQueueItem<string>>): WriteQueueItem<string> {
  return {
    id: `01H${Math.random().toString(36).slice(2, 10)}`,
    entityType: 'marker',
    entityId: 'mk_01H',
    op: 'update',
    payload: 'P',
    attempts: 0,
    lastError: null,
    createdAt: '2026-05-01T00:00:00Z',
    resolvedPath: 'MyVault/Travel/marker.md',
    fileId: null,
    baseRevision: null,
    ...overrides,
  };
}

describe('worker', () => {
  it('drains a single update happily', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(markerReconciler);

    const id = drive.seedFile({
      name: 'marker.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/marker.md',
      content: 'pre <EDIT_POINT> post',
    });
    const base = (await drive.getMetadata(id)).headRevisionId;

    await queue.enqueue(
      makeItem({ id: '01HUPDATE', fileId: id, baseRevision: base, payload: 'OK' }),
    );

    const report = await drainAll({
      drive,
      queue,
      reconcilers: registry,
      reconcileOptions: { backoffBaseMs: 0, sleep: () => Promise.resolve() },
    });
    expect(report).toMatchObject({ processed: 1, applied: 1, retried: 0, deadLettered: 0 });
    const { content } = await drive.getContent(id);
    expect(content).toBe('pre OK post');
  });

  it('dead-letters when no reconciler is registered', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();

    const queued = makeItem({
      id: '01HNORECON',
      entityType: 'unknown',
      fileId: 'f',
      baseRevision: 'r',
    });
    await queue.enqueue(queued);

    const outcome = await processItem(queued, { drive, queue, reconcilers: registry });
    expect(outcome.kind).toBe('dead-letter');
  });

  it('dead-letters delete operations (out of scope for v1)', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(markerReconciler);

    const outcome = await processItem(
      makeItem({ id: '01HDEL', op: 'delete', fileId: 'f', baseRevision: 'r' }),
      { drive, queue, reconcilers: registry },
    );
    expect(outcome.kind).toBe('dead-letter');
  });

  it('dead-letters EditPointMissingError', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(markerReconciler);

    const id = drive.seedFile({
      name: 'marker.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/marker.md',
      content: 'nothing to patch',
    });
    const base = (await drive.getMetadata(id)).headRevisionId;

    await queue.enqueue(makeItem({ id: '01HGONE', fileId: id, baseRevision: base }));
    const report = await drainAll({ drive, queue, reconcilers: registry });
    expect(report).toMatchObject({ processed: 1, deadLettered: 1 });
    const inspected = queue.inspect();
    expect(inspected[0].state).toBe('dead');
  });

  it('dead-letters WRITE_ALLOWED_PREFIX violations', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(markerReconciler);

    const id = drive.seedFile({
      name: 'marker.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/marker.md',
      content: 'pre <EDIT_POINT> post',
    });
    const base = (await drive.getMetadata(id)).headRevisionId;

    await queue.enqueue(
      makeItem({
        id: '01HOOS',
        fileId: id,
        baseRevision: base,
        resolvedPath: 'MyVault/Outside/marker.md',
      }),
    );
    const report = await drainAll({ drive, queue, reconcilers: registry });
    expect(report).toMatchObject({ deadLettered: 1 });
  });

  it('creates a new file when op=create and a parent resolver is provided', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(markerReconciler);

    await queue.enqueue(
      makeItem({
        id: '01HCREATE',
        op: 'create',
        fileId: null,
        baseRevision: null,
        resolvedPath: 'MyVault/Travel/new-marker.md',
        payload: 'NEW',
      }),
    );
    const report = await drainAll({
      drive,
      queue,
      reconcilers: registry,
      resolveParent: () => Promise.resolve(drive.travelFolderId),
    });
    expect(report.applied).toBe(1);
    const children = await drive.listFolder(drive.travelFolderId);
    const child = children.find((c) => c.name === 'new-marker.md');
    expect(child).toBeDefined();
    if (!child) throw new Error('unreachable');
    const { content } = await drive.getContent(child.id);
    expect(content).toBe('INIT:NEW');
  });

  it('blocks (does not dead-letter) a create with no resolvable parent folder', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(markerReconciler);

    await queue.enqueue(
      makeItem({
        id: '01HCREATE2',
        op: 'create',
        fileId: null,
        baseRevision: null,
        resolvedPath: 'MyVault/Travel/x.md',
      }),
    );
    // No resolveParent wired → the parent can't be resolved. This must surface
    // as `blocked` (user needs to pick a folder), not a transient `retry` that
    // loops forever.
    const report = await drainAll({ drive, queue, reconcilers: registry });
    expect(report.processed).toBe(1);
    expect(report.blocked).toBe(1);
    expect(report.retried).toBe(0);
    expect(report.applied).toBe(0);
  });

  it('blocks when parent resolution 404s (stale/inaccessible folder)', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(markerReconciler);

    await queue.enqueue(
      makeItem({
        id: '01HCREATE404',
        op: 'create',
        fileId: null,
        baseRevision: null,
        resolvedPath: 'MyVault/Travel/y.md',
      }),
    );
    const report = await drainAll({
      drive,
      queue,
      reconcilers: registry,
      // Simulates resolveParent walking into a stale folder id that 404s.
      resolveParent: () => Promise.reject(new DriveApiError('File not found: fld-000002', 404)),
    });
    expect(report.blocked).toBe(1);
    expect(report.retried).toBe(0);
    expect(report.deadLettered).toBe(0);
  });
});
