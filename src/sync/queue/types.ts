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
  /** Epoch ms before which the drain must skip this item. `0` = ready. */
  readonly nextAttemptAt: number;
  /** Retired after a terminal error or an exhausted retry budget (ADR-0019). */
  readonly dead: boolean;
}

/**
 * What a *caller* supplies to {@link WriteQueue.enqueue}. Retry bookkeeping
 * (`nextAttemptAt`, `dead`) is the queue's business, not the feature slice's,
 * so those are defaulted by the implementation rather than demanded of every
 * admin service.
 */
export type NewWriteQueueItem<P = unknown> = Omit<
  WriteQueueItem<P>,
  'nextAttemptAt' | 'dead'
> & {
  readonly nextAttemptAt?: number;
  readonly dead?: boolean;
};

/**
 * Minimal write-queue interface. S2 will implement this on Dexie; tests provide
 * an in-memory implementation.
 */
export interface WriteQueue {
  /** Insert a new item. Idempotent on `id`. */
  enqueue(item: NewWriteQueueItem): Promise<void>;
  /**
   * Atomically claim the next pending item from the queue. Returns `null` if
   * empty. The worker calls this in a loop until `null`.
   *
   * Implementations may either (a) remove the row from storage on `drainNext`
   * (e.g. `MemoryWriteQueue` flips state to `inflight`), or (b) keep the row
   * in storage and rely on `markApplied` for the final delete (the Dexie
   * adapter). The worker calls both `markFailed` *and* `markApplied` so it
   * works with either flavor.
   */
  drainNext(): Promise<WriteQueueItem | null>;
  /**
   * Mark an item as failed (transient or terminal). The implementation decides
   * whether to re-enqueue or move to a dead-letter table based on `attempts` and
   * `terminal`.
   */
  markFailed(id: string, error: string, terminal: boolean): Promise<void>;
  /**
   * Confirm a successful write. The Dexie adapter deletes the row here; the
   * in-memory queue's optional method is a no-op. Optional so existing
   * queues without explicit success-confirmation stay valid.
   */
  markApplied?(id: string, newRevision?: string, fileId?: string): Promise<void>;
  /** Optional: peek the head of the queue without removing it. Used by tests. */
  peek?(): Promise<WriteQueueItem | null>;
  /** Optional: size of the queue. */
  size?(): Promise<number>;
}

/** Outcome of processing one queue item. */
export type ProcessOutcome =
  | { kind: 'applied'; newRevision: string; fileId?: string }
  | { kind: 'no-op' }
  | { kind: 'retry'; error: string }
  /**
   * The item can't proceed without user action — e.g. the Travel folder isn't
   * configured, or its id is stale/inaccessible (404). Unlike `retry`, hammering
   * Drive won't fix it, so the worker stalls and the UI surfaces a "re-pick your
   * folder" prompt instead of looping. The item stays queued (non-terminal) so a
   * re-pick lets it resume.
   */
  | { kind: 'blocked'; error: string }
  | { kind: 'dead-letter'; error: string };

export interface SyncReport {
  processed: number;
  applied: number;
  retried: number;
  /** Items that stalled awaiting user action (see `ProcessOutcome` `blocked`). */
  blocked: number;
  deadLettered: number;
  skipped: number;
}
