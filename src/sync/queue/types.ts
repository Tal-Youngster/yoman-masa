/**
 * Write queue surface consumed by the sync worker.
 *
 * S3 owns the worker. S2 owns the storage. The two are decoupled here: S3
 * depends on this typed interface, S2 will ship a Dexie-backed adapter that
 * implements it. When S2 merges, wiring is a small adapter change — no
 * worker-side rewrites.
 *
 * Per ADR-0006:
 *  - Each row carries a client-generated ULID (`id`) so replays are safe.
 *  - `baseRevision` captures the revision the user *thought* they were editing.
 *    The worker re-reads from Drive before writing and reconciles per ADR-0006
 *    section "Conflict resolution".
 *  - `attempts` counts hard-failure retries; the worker decides when to dead-letter.
 */

export type WriteOp = 'create' | 'update' | 'delete';

/** Payload is `unknown` to keep this contract entity-agnostic. Reconcilers narrow it. */
export interface WriteQueueItem<P = unknown> {
  /** ULID assigned at enqueue time. */
  readonly id: string;
  /** Discriminator routed to the reconciler registry. Matches `Reconciler.entityType`. */
  readonly entityType: string;
  /** Entity id (e.g. `trp_01H...`) — the stable identifier used by the reconciler. */
  readonly entityId: string;
  readonly op: WriteOp;
  /** Reconciler-specific payload. */
  readonly payload: P;
  /**
   * Revision id the local edit was based on. `null` for first-time creates.
   * The worker uses this to decide if a re-read found a concurrent edit.
   */
  readonly baseRevision: string | null;
  /**
   * Drive file id the edit targets. `null` for first-time creates (the reconciler
   * is expected to resolve / create the file).
   */
  readonly fileId: string | null;
  /** Resolved path under WRITE_ALLOWED_PREFIX. The guard re-checks at write time. */
  readonly resolvedPath: string;
  /** Number of times the worker has tried this item. */
  readonly attempts: number;
  readonly lastError: string | null;
  /** ISO timestamp at which the item was enqueued. */
  readonly createdAt: string;
}

/**
 * Minimal write-queue interface. S2 will implement this on Dexie; tests provide
 * an in-memory implementation.
 */
export interface WriteQueue {
  /** Insert a new item. Idempotent on `id`. */
  enqueue(item: WriteQueueItem): Promise<void>;
  /**
   * Atomically pop the next pending item from the queue. Returns `null` if empty.
   * The worker calls this in a loop until `null`.
   */
  drainNext(): Promise<WriteQueueItem | null>;
  /**
   * Mark an item as failed (transient or terminal). The implementation decides
   * whether to re-enqueue or move to a dead-letter table based on `attempts` and
   * `terminal`.
   */
  markFailed(id: string, error: string, terminal: boolean): Promise<void>;
  /** Optional: peek the head of the queue without removing it. Used by tests. */
  peek?(): Promise<WriteQueueItem | null>;
  /** Optional: size of the queue. */
  size?(): Promise<number>;
}

/** Outcome of processing one queue item. */
export type ProcessOutcome =
  | { kind: 'applied'; newRevision: string }
  | { kind: 'no-op' }
  | { kind: 'retry'; error: string }
  | { kind: 'dead-letter'; error: string };

export interface SyncReport {
  processed: number;
  applied: number;
  retried: number;
  deadLettered: number;
  skipped: number;
}
