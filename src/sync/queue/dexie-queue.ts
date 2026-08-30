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
  deleteFileMeta,
  enqueueWrite,
  getFileMeta,
  listReadyWrites,
  recordQueueFailure,
  upsertFileMeta,
  type EnqueueInput,
  type TravelDB,
  type WriteQueueItem as DexieWriteQueueItem,
} from '@/lib/storage';

import { backoffMs, MAX_ATTEMPTS } from '../backoff.js';

import type { NewWriteQueueItem, WriteQueue, WriteQueueItem } from './types.js';

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
    nextAttemptAt: row.next_attempt_at ?? 0,
    dead: (row.dead ?? 0) === 1,
  };
}

export function itemToEnqueueInput(item: NewWriteQueueItem): EnqueueInput {
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
  markApplied(id: string, newRevision?: string, fileId?: string): Promise<void>;
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

  /**
   * Oldest row that is alive, past its backoff deadline, and not already
   * claimed by this drain. Rows still backing off are stepped over rather
   * than blocked on — pre-ADR-0019 the drain peeked only the FIFO head, so a
   * single failing item froze every write behind it indefinitely.
   */
  async function nextReady(): Promise<DexieWriteQueueItem | null> {
    const ready = await listReadyWrites(Date.now(), handle);
    for (const candidate of ready) {
      if (!claimed.has(candidate.id)) return candidate;
    }
    return null;
  }

  return {
    async enqueue(item: NewWriteQueueItem): Promise<void> {
      await enqueueWrite(itemToEnqueueInput(item), handle);
    },

    async drainNext(): Promise<WriteQueueItem | null> {
      // Dead-letter pre-v3 rows whose resolved_path was backfilled to "" —
      // they pre-date the WRITE_ALLOWED_PREFIX-aware queue contract and we
      // refuse to forward them to Drive. Loop until we either find a usable
      // row or the queue is empty.
      for (;;) {
        const row = await nextReady();
        if (!row) return null;
        if (row.resolved_path === '') {
          await dequeueById(row.id, handle);
          continue;
        }
        claimed.add(row.id);
        return rowToItem(row);
      }
    },

    /**
     * Terminal failures and exhausted retries mark the row `dead` and keep it.
     * The pre-ADR-0019 adapter deleted it, which silently threw away the
     * user's edit with nothing left to inspect. A dead row still costs one
     * IndexedDB record, is excluded from the drain and from inbound
     * write-suppression, and is counted by the status indicator.
     */
    async markFailed(id: string, error: string, terminal: boolean): Promise<void> {
      claimed.delete(id);
      const row = await handle.write_queue.get(id);
      const attempts = (row?.attempts ?? 0) + 1;
      const dead = terminal || attempts >= MAX_ATTEMPTS;
      await recordQueueFailure(
        id,
        error,
        dead ? { dead: true } : { nextAttemptAt: Date.now() + backoffMs(attempts) },
        handle,
      );
    },

    async markApplied(id: string, newRevision?: string, fileId?: string): Promise<void> {
      claimed.delete(id);

      const row = await handle.write_queue.get(id);
      if (row && fileId && newRevision) {
        // 1. Update file_meta. `last_entity_ids` merges with any existing
        //    snapshot (rather than replacing) so ledger files don't lose
        //    the inbound-side per-file entity set when one row is written
        //    or deleted outbound. See ADR-0014 addendum (2026-06-06).
        const existing = await getFileMeta(fileId, handle);
        const prevIds = existing?.last_entity_ids ?? [];
        const nextIds =
          row.op === 'delete'
            ? prevIds.filter((eid) => eid !== row.entity_id)
            : prevIds.includes(row.entity_id)
              ? prevIds
              : [...prevIds, row.entity_id];

        // Whole-file delete (single-entity file, last row in a ledger we knew
        // about): drop the file_meta entirely. The next inbound pull will
        // recreate it if Drive still has the file (e.g. a different device
        // re-created an entity in it).
        if (row.op === 'delete' && nextIds.length === 0) {
          await deleteFileMeta(fileId, handle);
        } else {
          await upsertFileMeta(
            {
              file_id: fileId,
              entity_type: row.entity_type,
              entity_id: row.entity_id,
              last_entity_ids: nextIds,
              head_revision_id: newRevision,
              modified_time: new Date().toISOString(), // Approximate
              path: row.resolved_path,
            },
            handle,
          );
        }

        // 2. Patch any pending queue items for the same entity that are missing file_id
        await handle.write_queue
          .where('entity_id').equals(row.entity_id)
          .filter(q => q.entity_type === row.entity_type && !q.file_id)
          .modify({ file_id: fileId, base_revision: newRevision });
      }

      await dequeueById(id, handle);
    },
  };
}
