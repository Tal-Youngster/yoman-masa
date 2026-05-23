/**
 * Sync worker.
 *
 * Drains the write queue. For each item:
 *  - Look up the reconciler by `entityType`.
 *  - For `update`: run `reconcileUpdate` (ADR-0006 algorithm).
 *  - For `create`: `applyEdit` on an empty string (the reconciler emits a
 *    fresh file), then `createFile`. Subsequent updates take the standard path.
 *  - On `EditPointMissingError`: mark terminal (dead-letter). The UI will
 *    surface a "needs attention" toast per ADR-0006.
 *  - On `WriteOutOfScopeError`: mark terminal. This is a programming bug, not
 *    a transient failure.
 *  - On other errors: mark transient. The queue implementation decides re-enqueue
 *    vs dead-letter based on attempt count.
 *
 * Triggers (caller wires these up): `syncNow()`, `online`, `focus`,
 * `BackgroundSync`. The worker itself is just `processOne` / `drainAll`.
 */

import {
  ConflictExhaustedError,
  EditPointMissingError,
  WriteOutOfScopeError,
  type DriveClient,
  type FileId,
} from '../drive/types.js';
import { reconcileUpdate, type ReconcileOptions } from '../drive/reconcile.js';
import type { ReconcilerRegistry } from './reconciler.js';
import type { ProcessOutcome, SyncReport, WriteQueue, WriteQueueItem } from './types.js';

export interface WorkerOptions {
  drive: DriveClient;
  queue: WriteQueue;
  reconcilers: ReconcilerRegistry;
  /** Override conflict-reconciliation knobs (max attempts, backoff). */
  reconcileOptions?: ReconcileOptions;
  /**
   * Resolver: given a queue item, return the parent folder id for first-time
   * creates. Feature slices supply this via wiring. Returning `null` means
   * "the reconciler will resolve it" (e.g. via a known kv lookup).
   */
  resolveParent?: (item: WriteQueueItem) => Promise<FileId | null>;
}

/**
 * Process a single item. Pure with respect to the queue — does not mutate it.
 * Returns a {@link ProcessOutcome} which the caller routes back to the queue.
 */
export async function processItem(
  item: WriteQueueItem,
  opts: WorkerOptions,
): Promise<ProcessOutcome> {
  const reconciler = opts.reconcilers.get(item.entityType);
  if (!reconciler) {
    return {
      kind: 'dead-letter',
      error: `No reconciler registered for entityType "${item.entityType}"`,
    };
  }

  try {
    if (item.op === 'delete') {
      return {
        kind: 'dead-letter',
        error: 'Delete operation is not supported for vault files in v1.',
      };
    }

    if (item.op === 'create') {
      // For creates the reconciler builds initial content from an empty base.
      // `applyEdit` is intentionally used here too so reconcilers stay simple
      // (one method, two callers).
      const initialContent = reconciler.applyEdit('', item);
      const parent = await opts.resolveParent?.(item);
      if (!parent) {
        return {
          kind: 'retry',
          error: 'Cannot create file: parent folder id not resolved.',
        };
      }
      const created = await opts.drive.createFile({
        parentId: parent,
        name: deriveFileName(item),
        content: initialContent,
        mimeType: 'text/markdown',
        resolvedPath: item.resolvedPath,
      });
      return { kind: 'applied', newRevision: created.headRevisionId };
    }

    // Update path.
    const result = await reconcileUpdate(opts.drive, reconciler, item, opts.reconcileOptions ?? {});
    return { kind: 'applied', newRevision: result.newRevision };
  } catch (err) {
    if (err instanceof EditPointMissingError) {
      return { kind: 'dead-letter', error: err.message };
    }
    if (err instanceof WriteOutOfScopeError) {
      return { kind: 'dead-letter', error: err.message };
    }
    if (err instanceof ConflictExhaustedError) {
      return { kind: 'retry', error: err.message };
    }
    return { kind: 'retry', error: errorMessage(err) };
  }
}

/**
 * Drain the queue end-to-end. Stops at the first empty `drainNext` or when
 * `signal.aborted` is true. Returns a summary report.
 */
export async function drainAll(opts: WorkerOptions, signal?: AbortSignal): Promise<SyncReport> {
  const report: SyncReport = {
    processed: 0,
    applied: 0,
    retried: 0,
    deadLettered: 0,
    skipped: 0,
  };
  while (!signal?.aborted) {
    const item = await opts.queue.drainNext();
    if (!item) break;
    report.processed += 1;
    const outcome = await processItem(item, opts);
    switch (outcome.kind) {
      case 'applied':
        report.applied += 1;
        // Queues that distinguish "claimed but not yet applied" (e.g. the
        // Dexie-backed adapter that doesn't delete on `drainNext`) need an
        // explicit confirmation. `MemoryWriteQueue` ignores this — see its
        // own `markApplied` helper. We use an optional method here so older
        // queue implementations stay valid.
        await opts.queue.markApplied?.(item.id);
        break;
      case 'no-op':
        report.skipped += 1;
        await opts.queue.markApplied?.(item.id);
        break;
      case 'retry':
        report.retried += 1;
        await opts.queue.markFailed(item.id, outcome.error, false);
        break;
      case 'dead-letter':
        report.deadLettered += 1;
        await opts.queue.markFailed(item.id, outcome.error, true);
        break;
    }
  }
  return report;
}

/**
 * The reconciler decides the in-vault file name. Until S5 lands, we derive a
 * conservative default from the resolved path's last segment.
 */
function deriveFileName(item: WriteQueueItem): string {
  const seg = item.resolvedPath.split('/').filter(Boolean);
  return seg[seg.length - 1] ?? `${item.entityId}.md`;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
