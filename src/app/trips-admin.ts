/**
 * Wiring between the trips UI and the persistence + sync layers.
 *
 * Each mutation:
 *  1. Upserts the entity in Dexie (UI reads from Dexie, so this is "instant").
 *  2. Enqueues a write queue item for the sync worker to drain into Drive.
 *
 * `syncNow` drains the queue end-to-end against the configured DriveClient.
 * Triggers for it: explicit "Sync now" UI button, post-mutation calls, and
 * later `online`/`focus` listeners (deferred to S13).
 */

import { z } from 'zod';

import { CountryCode, Trip } from '@/domain/trip';
import { newTripId, type TripId } from '@/domain/ids';
import { IsoDate } from '@/domain/dates';
import { Currency } from '@/domain/money';
import {
  drainAll,
  reconcilers as defaultRegistry,
  type ReconcilerRegistry,
  type SyncReport,
  type WriteQueue,
} from '@/sync/queue';
import type { DriveClient, FileId } from '@/sync/drive';
import { asFileId } from '@/sync/drive';
import {
  db as defaultDb,
  deleteFileMeta,
  deleteKV,
  deleteTrip as deleteTripRow,
  getFileMetaByEntity,
  getKV,
  upsertTrip,
} from '@/lib/storage';
import type { TravelDB } from '@/lib/storage';
import { tripFilePath, activeConfigFilePath } from '@/features/trips/paths';
import type { TripPayload } from '@/features/trips/reconciler';
import { ulid } from 'ulid';
import type { EntityType } from '@/lib/storage/types';

import type { TripsAdminService } from './context';

export interface TripsAdminDeps {
  db?: TravelDB;
  writeQueue: WriteQueue;
  drive: DriveClient;
  reconcilers?: ReconcilerRegistry;
  /** Resolve the canonical Travel folder path (e.g. `MyVault/Travel`). */
  travelFolderPath: string;
  /** Drive file id of the Travel folder, used as parent for `Trips/`. */
  travelFolderId: FileId;
  /** Resolve a parent folder id for a queue item. The default uses the
   *  Travel folder for trips and config. */
  resolveParent?: (item: { entityType: string; resolvedPath: string }) => Promise<FileId | null>;
}

const CreateInput = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  start_date: IsoDate,
  end_date: IsoDate,
  home_currency: Currency,
  country_codes: z.array(CountryCode).default([]),
  notes: z.string().default(''),
});

export function createTripsAdmin(deps: TripsAdminDeps): TripsAdminService {
  const reconcilers = deps.reconcilers ?? defaultRegistry;

  async function resolveParent(item: {
    entityType: string;
    resolvedPath: string;
  }): Promise<FileId | null> {
    if (deps.resolveParent) return deps.resolveParent(item);
    // Default: trips share the Travel folder ancestor; the trip folder itself
    // is created lazily on the first write — but for v1 we punt and place
    // the file at the Travel folder root if no explicit resolver was wired.
    // A full implementation creates the `Trips/<slug>/` subfolder first; we
    // surface that requirement so the caller can supply a more specific
    // resolver in production.
    return deps.travelFolderId;
  }

  return {
    async createTrip(input): Promise<{ id: string; slug: string }> {
      const fields = CreateInput.parse(input);
      const trip: Trip = Trip.parse({
        type: 'trip',
        id: newTripId(),
        ...fields,
      });
      await upsertTrip(trip, deps.db);
      const path = tripFilePath(deps.travelFolderPath, trip.slug);
      const payload: TripPayload = { trip };
      await deps.writeQueue.enqueue({
        id: ulid(),
        entityType: 'trip',
        entityId: trip.id,
        op: 'create',
        payload,
        baseRevision: null,
        fileId: null,
        resolvedPath: path,
        attempts: 0,
        lastError: null,
        createdAt: new Date().toISOString(),
      });
      return { id: trip.id, slug: trip.slug };
    },

    async updateTrip(input): Promise<void> {
      // Look up the existing trip to retain the slug (immutable for v1).
      const existing = await deps.db?.trips.get(input.id as TripId);
      if (!existing) {
        throw new Error(`updateTrip: unknown trip id ${input.id}`);
      }
      const updated: Trip = Trip.parse({
        ...existing,
        name: input.name,
        home_currency: input.home_currency,
        start_date: input.start_date,
        end_date: input.end_date,
        country_codes: input.country_codes ?? existing.country_codes,
        notes: input.notes ?? existing.notes,
      });
      await upsertTrip(updated, deps.db);
      const meta = await getFileMetaByEntity('trip', updated.id, deps.db);
      const path = tripFilePath(deps.travelFolderPath, updated.slug);
      const payload: TripPayload = { trip: updated };
      await deps.writeQueue.enqueue({
        id: ulid(),
        entityType: 'trip',
        entityId: updated.id,
        op: 'update',
        payload,
        baseRevision: meta?.head_revision_id ?? null,
        fileId: meta?.file_id ?? null,
        resolvedPath: path,
        attempts: 0,
        lastError: null,
        createdAt: new Date().toISOString(),
      });
    },

    async deleteTrip(tripId): Promise<void> {
      const handle = deps.db;
      const dbRef = handle ?? defaultDb;
      // Cancel any unsynced writes targeting this trip. The vault file (if
      // it exists on Drive) is intentionally left in place — the user
      // removes it in Obsidian. ADR-0001's "no backend, vault as source of
      // truth" plus the worker's hard refusal of `op: 'delete'` (see
      // src/sync/queue/worker.ts) means we don't try to push a delete.
      await dbRef.write_queue
        .where('entity_id')
        .equals(tripId)
        .filter((row) => row.entity_type === 'trip')
        .delete();
      // Drop the file-meta row so a future re-create with the same id
      // doesn't try to update a stale revision.
      const meta = await getFileMetaByEntity('trip', tripId, handle);
      if (meta) {
        await deleteFileMeta(meta.file_id, handle);
      }
      // If this trip happened to be the active one, clear the pointer (KV
      // only — we deliberately do not enqueue an active_config write so
      // remote clients keep their own state).
      const activeId = await getKV('active_trip_id', handle);
      if (activeId === tripId) {
        await deleteKV('active_trip_id', handle);
      }
      await deleteTripRow(tripId as TripId, handle);
    },

    async setActiveTrip(tripId): Promise<void> {
      const handle = deps.db;
      // Mirror in Dexie KV so the shell picks it up on next read.
      const { setKV, deleteKV } = await import('@/lib/storage');
      if (tripId === null) {
        await deleteKV('active_trip_id', handle);
      } else {
        await setKV('active_trip_id', tripId as TripId, handle);
      }
      // Enqueue the JSON pointer file write so Drive reflects the change.
      const path = activeConfigFilePath(deps.travelFolderPath);
      // For active_config we look up the existing file (if any) to pick up
      // its current revision; the JSON reconciler reapplies on top of fresh
      // content if a concurrent edit landed.
      const meta = await getFileMetaByEntity('active_config', '_singleton_', handle);
      await deps.writeQueue.enqueue({
        id: ulid(),
        entityType: 'active_config',
        entityId: '_singleton_',
        op: meta ? 'update' : 'create',
        payload: { active_trip_id: tripId },
        baseRevision: meta?.head_revision_id ?? null,
        fileId: meta?.file_id ?? null,
        resolvedPath: path,
        attempts: 0,
        lastError: null,
        createdAt: new Date().toISOString(),
      });
    },

    async syncNow(): Promise<SyncReport | null> {
      try {
        return await drainAll({
          drive: deps.drive,
          queue: deps.writeQueue,
          reconcilers,
          resolveParent,
          resolveFileId: async (item) => {
            const handle = deps.db ?? defaultDb;
            const meta = await getFileMetaByEntity(item.entityType as EntityType, item.entityId, handle);
            if (meta?.file_id) return asFileId(meta.file_id);
            
            // Fallback: search Drive if local meta is completely missing
            const parent = await resolveParent(item);
            if (!parent) return null;
            
            const seg = item.resolvedPath.split('/').filter(Boolean);
            const expectedName = seg[seg.length - 1] ?? `${item.entityId}.md`;
            
            const files = await deps.drive.listFolder(parent);
            const found = files.find(f => f.name === expectedName);
            return found ? asFileId(found.id) : null;
          }
        });
      } catch {
        // Surface to the caller as a null report; the UI logs and shows a
        // toast. We swallow rather than crash because sync errors are
        // expected (offline, auth churn, etc).
        return null;
      }
    },
  };
}
