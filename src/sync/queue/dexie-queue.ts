/**
 * Dexie-backed implementation of {@link WriteQueue}.
 *
 * Translates between S2's persisted row shape (snake_case, `created_at` as
 * epoch ms) and S3's runtime contract (camelCase, ISO `createdAt`). The
 * worker is unaware of Dexie; the storage layer is unaware of Drive. This
 * adapter is the single place those two world-views meet.
 *
 * Drain semantics:
 *  - `drainNext` peeks at the FIFO head *without* removing it. The worker
 *    confirms success/failure via `markApplied` / `markFailed`. This means a
 *    process crash mid-write leaves the row in the queue; replays are safe per
 *    ADR-0006 (each mutation carries a stable ULID).
 *  - Rows with `resolved_path === ''` are terminal dead-letters: they came
 *    from a v2→v3 migration where the original enqueue happened before the
 *    field existed. We mark them failed-terminal and remove them so they
 *    never reach Drive with an empty path.
 */

import {
  db as defaultDb,
  dequeueById,
  enqueueWrite,
  peekNextPending,
  recordQueueFailure,
  type EnqueueInput,
  type TravelDB,
  type WriteQueueItem as DexieWriteQueueItem,
} from '@/lib/storage';

import type { WriteQueue, WriteQueueItem } from './types.js';

/**
 * Bidirectional mapping between the Dexie row (snake_case + epoch ms) and the
 * worker-facing `WriteQueueItem` (camelCase + ISO).
 */
export function rowToItem(row: DexieWriteQueueItem): WriteQueueItem {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    op: row.op,
    payload: row.payload,
    baseRevision: row.base_revision,
    fileId: row.file_id,
    resolvedPath: row.resolved_path,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function itemToEnqueueInput(item: WriteQueueItem): EnqueueInput {
  // We accept the runtime cast because S3's `entityType` is a string and the
  // adapter passes through entity-agnostic. The storage layer enforces the
  // closed `EntityType` union at the public `enqueueWrite` signature; callers
  // outside the closed set hit the type system before reaching this point.
  return {
    id: item.id,
    entity_type: item.entityType as EnqueueInput['entity_type'],
    entity_id: item.entityId,
    op: item.op,
    payload: item.payload,
    base_revision: item.baseRevision,
    file_id: item.fileId,
    resolved_path: item.resolvedPath,
    attempts: item.attempts,
    last_error: item.lastError,
    created_at: Date.parse(item.createdAt),
  };
}

export interface DexieWriteQueue extends WriteQueue {
  /** Confirm a row applied successfully and remove it from the queue. */
  markApplied(id: string): Promise<void>;
}

/**
 * Build a Dexie-backed write queue against the supplied (or default) DB
 * handle. Tests construct a per-test DB and pass it explicitly; the app uses
 * the shared singleton.
 *
 * `drainNext` returns the FIFO head without removing the row from Dexie. The
 * adapter keeps an in-memory "claimed" set so the worker's loop doesn't re-
 * peek the same row before its outcome is recorded. The set lives for the
 * lifetime of the adapter instance — short-lived enough that a crash mid-
 * drain still leaves the row on disk for the next process to retry.
 *
 * The worker calls `markFailed(id, _, terminal)` on retry/dead-letter and
 * `markApplied(id)` on success; both clear the claim and either bump
 * attempts or delete the row.
 */
export function createDexieWriteQueue(db?: TravelDB): DexieWriteQueue {
  const handle = db ?? defaultDb;
  const claimed = new Set<string>();

  async function nextUnclaimed(): Promise<DexieWriteQueueItem | null> {
    const row = await peekNextPending(handle);
    if (!row) return null;
    if (!claimed.has(row.id)) return row;
    // Fall back to a linear scan of pending rows by created_at order until we
    // find one we haven't claimed yet. The queue is typically tiny (< 100
    // rows during a sync); this is fine.
    const all = await handle.write_queue.orderBy('created_at').toArray();
    for (const candidate of all) {
      if (!claimed.has(candidate.id)) return candidate;
    }
    return null;
  }

  return {
    async enqueue(item: WriteQueueItem): Promise<void> {
      await enqueueWrite(itemToEnqueueInput(item), handle);
    },

    async drainNext(): Promise<WriteQueueItem | null> {
      // Dead-letter pre-v3 rows whose resolved_path was backfilled to "" —
      // they pre-date the WRITE_ALLOWED_PREFIX-aware queue contract and we
      // refuse to forward them to Drive. Loop until we either find a usable
      // row or the queue is empty.
      for (;;) {
        const row = await nextUnclaimed();
        if (!row) return null;
        if (row.resolved_path === '') {
          await dequeueById(row.id, handle);
          continue;
        }
        claimed.add(row.id);
        return rowToItem(row);
      }
    },

    async markFailed(id: string, error: string, terminal: boolean): Promise<void> {
      claimed.delete(id);
      if (terminal) {
        await dequeueById(id, handle);
        return;
      }
      await recordQueueFailure(id, error, handle);
    },

    async markApplied(id: string): Promise<void> {
      claimed.delete(id);
      await dequeueById(id, handle);
    },
  };
}
