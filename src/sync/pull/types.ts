/**
 * Inbound (Drive → Dexie) sync contracts.
 *
 * The outbound side (`@/sync/queue`) serializes one entity per write_queue
 * row. Inbound is shaped differently: a single Drive file may contain 0..N
 * entities (Trip.md → 1; a Tasks.md ledger → many), and the lifecycle is
 * driven by the Drive Changes feed rather than a local queue. Keeping the
 * two interfaces separate lets each evolve without contorting the other.
 *
 * See `docs/adr/0014-inbound-drive-sync.md` for the design rationale.
 */

import type { DriveClient, FileId } from '@/sync/drive';
import type { EntityType, TravelDB } from '@/lib/storage';

import type { InboundReconcilerRegistry } from './registry.js';

/**
 * Per-entity-type inbound adapter. Owned by the feature slice — `trips`,
 * `accommodations`, etc. — and registered in {@link InboundReconcilerRegistry}.
 */
export interface InboundReconciler<E = unknown> {
  /** Discriminator. Matches the outbound `Reconciler.entityType`. */
  readonly entityType: EntityType;
  /**
   * Does this file belong to this entity type? Receives the path *relative*
   * to the Travel folder (e.g. `Trips/argentina/Trip.md`), so the matcher is
   * vault-layout aware without needing the absolute path.
   *
   * First match wins in the registry — keep patterns mutually exclusive.
   */
  matchesPath(relPath: string): boolean;
  /**
   * Parse the file. Returns an array so ledger-style files can yield many
   * entities from one file. Single-entity files return a one-element array.
   * Returns `[]` if the file is recognized but currently empty.
   *
   * Throwing here means the file is malformed — the pull worker records the
   * error and moves on rather than aborting the whole pass.
   */
  parseFile(content: string, relPath: string): readonly E[];
  /** Stable identifier used to upsert / delete in Dexie and key `file_meta`. */
  entityId(entity: E): string;
  /** Idempotent upsert into the slice's Dexie table. */
  upsertEntity(entity: E, db: TravelDB): Promise<void>;
  /** Idempotent delete by id. Used when Drive reports the file removed. */
  deleteEntity(entityId: string, db: TravelDB): Promise<void>;
  /**
   * All locally-known entity ids of this type. Backfill uses this to enforce
   * the "Drive is source of truth" policy (ADR-0014 addendum): any local
   * entity not seen during the walk is dropped unless it has a pending
   * write_queue row (i.e. it's mid-flight, not orphan).
   *
   * Implementations should return primary keys from the slice's Dexie table.
   */
  listEntityIds(db: TravelDB): Promise<readonly string[]>;
}

/**
 * Outcome summary returned from one `pullAll` (or `backfill`) pass. The shape
 * mirrors {@link import('@/sync/queue').SyncReport} so the UI can render both
 * push and pull stats with one component.
 */
export interface PullReport {
  /** Total Drive entries inspected (files + removals). */
  scanned: number;
  /** Entities upserted into Dexie. */
  upserted: number;
  /** Entities removed from Dexie (inbound delete or moved-out-of-Travel). */
  removed: number;
  /** Files we recognized but skipped — usually because a local write is
   *  pending for the same entity, or the file was unparseable. */
  skipped: number;
  /** Parse / fetch errors. */
  errors: number;
}

export function newPullReport(): PullReport {
  return { scanned: 0, upserted: 0, removed: 0, skipped: 0, errors: 0 };
}

export interface PullDeps {
  drive: DriveClient;
  db: TravelDB;
  /** Drive file id of the user's `Travel/` folder. The boundary for "is this
   *  file ours?". */
  travelFolderId: FileId;
  /** Inbound registry. Defaults to the global singleton via the worker. */
  registry: InboundReconcilerRegistry;
}
