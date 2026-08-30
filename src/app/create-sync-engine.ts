/**
 * Assembles the app's {@link SyncEngine} (ADR-0019): binds the outbound
 * drain and the inbound pull to the real Drive client, Dexie, and the
 * reconciler registries, and wires the "a local write was enqueued" trigger.
 *
 * The wiring lives here rather than in `main.tsx` so the whole engine can be
 * constructed against a `FakeDrive` and an in-memory Dexie in tests.
 */

import {
  countDeadWrites,
  countPendingWrites,
  db as defaultDb,
  getFileMetaByEntity,
  type EntityType,
  type TravelDB,
} from '@/lib/storage';

import { asFileId, type DriveClient, type FileId } from '@/sync/drive';
import { inboundReconcilers, pullAll } from '@/sync/pull';
import { drainAll, reconcilers, type WriteQueue, type WriteQueueItem } from '@/sync/queue';
import { SyncEngine } from '@/sync/engine';

import type { KVStore } from './kv-store';

export interface CreateSyncEngineDeps {
  db?: TravelDB;
  kv: KVStore;
  drive: DriveClient;
  writeQueue: WriteQueue;
  /** Resolve (creating as needed) the Drive parent folder for a new file. */
  resolveParent(item: WriteQueueItem): Promise<FileId | null>;
}

export function createSyncEngine(deps: CreateSyncEngineDeps): SyncEngine {
  const handle = deps.db ?? defaultDb;

  /**
   * Recover the Drive file id for a queued row that doesn't carry one.
   * `file_meta` is the fast path; falling back to a folder listing covers a
   * row whose local metadata was lost (a cleared cache, a failed backfill)
   * but whose file exists on Drive — without it we would create a duplicate.
   */
  async function resolveFileId(item: WriteQueueItem): Promise<FileId | null> {
    const meta = await getFileMetaByEntity(item.entityType as EntityType, item.entityId, handle);
    if (meta?.file_id) return asFileId(meta.file_id);

    const parent = await deps.resolveParent(item);
    if (!parent) return null;

    const segments = item.resolvedPath.split('/').filter(Boolean);
    const expectedName = segments[segments.length - 1] ?? `${item.entityId}.md`;
    const files = await deps.drive.listFolder(parent);
    const found = files.find((f) => f.name === expectedName);
    return found ? asFileId(found.id) : null;
  }

  const engine = new SyncEngine({
    async push(signal) {
      return drainAll(
        {
          drive: deps.drive,
          queue: deps.writeQueue,
          reconcilers,
          // Wrapped rather than passed by reference: `deps.resolveParent` is a
          // method on the caller's object and must keep its own `this`.
          resolveParent: (item) => deps.resolveParent(item),
          resolveFileId,
        },
        signal,
      );
    },

    async pull() {
      const folder = await deps.kv.get('travel_folder_file_id');
      // No folder picked yet is an ordinary idle state, not a failure — the
      // engine must not enter backoff over it.
      if (!folder) return null;
      return pullAll({
        drive: deps.drive,
        db: handle,
        travelFolderId: asFileId(folder),
        registry: inboundReconcilers,
      });
    },

    async counts() {
      const [pending, dead] = await Promise.all([
        countPendingWrites(handle),
        countDeadWrites(handle),
      ]);
      return { pending, dead };
    },
  });

  // Any code path that enqueues a write wakes the engine, without having to
  // know the engine exists. `queueMicrotask` is load-bearing: this hook runs
  // *inside* the Dexie transaction that inserted the row, and doing real work
  // here would deadlock it (ADR-0019 sharp edges).
  handle.write_queue.hook('creating', () => {
    queueMicrotask(() => engine.wake());
  });

  return engine;
}
