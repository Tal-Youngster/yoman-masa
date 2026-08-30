/**
 * Wiring between the trips UI and the persistence layer.
 *
 * Each mutation:
 *  1. Upserts the entity in Dexie (UI reads from Dexie, so this is "instant").
 *  2. Enqueues a write queue item.
 *
 * Getting that row to Drive is not this module's concern. The enqueue itself
 * wakes the sync engine (ADR-0019), so there is no drain wiring, no Drive
 * client, and no "sync now" entry point here any more.
 */

import { z } from 'zod';

import { CountryCode, Trip } from '@/domain/trip';
import { newTripId, type TripId } from '@/domain/ids';
import { IsoDate } from '@/domain/dates';
import { Currency } from '@/domain/money';
import { type WriteQueue } from '@/sync/queue';
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

import type { TripsAdminService } from './context';

export interface TripsAdminDeps {
  db?: TravelDB;
  writeQueue: WriteQueue;
  /** Resolve the canonical Travel folder path (e.g. `MyVault/Travel`). */
  travelFolderPath: string;
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

  };
}
