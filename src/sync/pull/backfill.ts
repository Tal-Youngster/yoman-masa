/**
 * First-run backfill: walk `Travel/` recursively and ingest every file the
 * inbound registry claims. Captures `startPageToken` *before* the walk so any
 * writes during the walk are picked up on the next `pullAll` — a file may
 * be processed once during the walk and again via the resulting change event,
 * but both paths are idempotent upserts so duplicates are harmless.
 *
 * The walk produces relative paths inline (no parent resolver needed — we
 * know the prefix as we descend), which makes backfill cheaper than a
 * change-feed pass: zero `getMetadata` calls.
 *
 * After the walk, `reconcileAll` enforces ADR-0014's "Drive is source of
 * truth" policy: any locally-known entity that wasn't seen on Drive AND has
 * no pending `write_queue` row is dropped. This is the only place the policy
 * runs — change-feed mode handles incremental deletes via `handleRemoval`
 * inside the worker.
 */

import { deleteFileMeta, getFileMetaByEntity, setKV } from '@/lib/storage';

import type { FileId } from '@/sync/drive';

import { hasPendingWrite, ingestFile } from './worker.js';
import { newPullReport, type PullDeps, type PullReport } from './types.js';

/** Defensive cap on recursion depth. Vault organization > 16 levels is
 *  pathological and likely a cycle. */
const MAX_DEPTH = 16;

export async function backfill(deps: PullDeps): Promise<PullReport> {
  // Capture the token BEFORE walking, per ADR-0014 sharp-edge note.
  const startToken = await deps.drive.startChangeToken();
  const report = newPullReport();
  const visited = new Set<string>();
  const aliveByType = new Map<string, Set<string>>();
  await walk(deps, deps.travelFolderId, '', report, 0, visited, aliveByType);
  await reconcileAll(deps, aliveByType, report);
  await setKV('drive_changes_page_token', startToken, deps.db);
  // Stamp the folder the token belongs to. `pullAll` refuses a token whose
  // folder doesn't match, so a re-pick can't be read through a cursor that
  // describes the previous vault (ADR-0019).
  await setKV('drive_changes_token_folder', deps.travelFolderId, deps.db);
  return report;
}

/**
 * After the walk: drop any local entity Drive didn't show us.
 *
 * Two passes per reconciler:
 *
 *  1. `listEntityIds(db)` → for each id not in the walk's alive set, delete
 *     the entity. This is the "Drive is source of truth" sweep — it catches
 *     orphans that no `file_meta` row points at (the entity was created
 *     locally, the outbound write was dead-lettered or never started, and
 *     Drive never knew it existed).
 *  2. `file_meta` rows whose `file_id` we didn't visit — drop them. This is
 *     the original ADR-0014 behaviour, kept so a file-meta row referencing a
 *     Drive-deleted file is cleaned up even if the entity was already gone.
 *
 * Both passes skip entities whose `write_queue` has a pending row. That's
 * how we preserve a slow-typing user's draft: their queue row is the
 * "in flight" claim that this is locally authoritative until the outbound
 * worker either applies it or terminally dead-letters it (in which case the
 * next backfill correctly sweeps it).
 */
async function reconcileAll(
  deps: PullDeps,
  aliveByType: ReadonlyMap<string, ReadonlySet<string>>,
  report: PullReport,
): Promise<void> {
  for (const reconciler of deps.registry.list()) {
    const alive = aliveByType.get(reconciler.entityType) ?? new Set<string>();

    // Pass 1: enumerate everything Dexie has of this type. Drop anything
    // Drive didn't surface (modulo pending writes).
    const all = await reconciler.listEntityIds(deps.db);
    for (const id of all) {
      if (alive.has(id)) continue;
      if (await hasPendingWrite(deps.db, reconciler.entityType, id)) continue;
      await reconciler.deleteEntity(id, deps.db);
      const meta = await getFileMetaByEntity(reconciler.entityType, id, deps.db);
      if (meta) await deleteFileMeta(meta.file_id, deps.db);
      report.removed += 1;
    }

    // Pass 2: stale file_meta rows whose entity is already gone (or whose
    // referenced file is). Belt-and-suspenders against partial states from
    // earlier code paths (e.g. a pre-v3 migration where the entity got
    // deleted but file_meta lingered).
    const candidates = await deps.db.file_meta
      .where('entity_type')
      .equals(reconciler.entityType)
      .toArray();
    for (const fm of candidates) {
      // The pass-1 deletion above already removed any file_meta tied to a
      // deleted entity; here we only handle the case where the entity is
      // still in Dexie but file_meta points to a Drive file the walk didn't
      // see. That means the user (or another device) deleted the file in
      // Drive — we want the same delete reflected locally.
      if (alive.has(fm.entity_id)) continue;
      if (await hasPendingWrite(deps.db, fm.entity_type, fm.entity_id)) continue;
      // Entity already deleted in pass 1; this just cleans up the file_meta.
      await deleteFileMeta(fm.file_id, deps.db);
    }
  }
}

async function walk(
  deps: PullDeps,
  folderId: FileId,
  relPath: string,
  report: PullReport,
  depth: number,
  visited: Set<string>,
  aliveByType: Map<string, Set<string>>,
): Promise<void> {
  if (depth >= MAX_DEPTH) return;

  let children: readonly { id: FileId; name: string; isFolder: boolean; headRevisionId: string; modifiedTime: string }[];
  try {
    children = await deps.drive.listFolder(folderId);
  } catch {
    report.errors += 1;
    return;
  }

  for (const child of children) {
    const childRelPath = relPath === '' ? child.name : `${relPath}/${child.name}`;

    if (child.isFolder) {
      await walk(deps, child.id, childRelPath, report, depth + 1, visited, aliveByType);
      continue;
    }

    report.scanned += 1;
    visited.add(child.id);
    const reconciler = deps.registry.match(childRelPath);
    if (!reconciler) {
      report.skipped += 1;
      continue;
    }

    let content: string;
    try {
      const got = await deps.drive.getContent(child.id);
      content = got.content;
    } catch {
      report.errors += 1;
      continue;
    }

    await ingestFile(
      deps,
      reconciler,
      {
        fileId: child.id,
        relPath: childRelPath,
        content,
        headRevisionId: child.headRevisionId,
        modifiedTime: child.modifiedTime,
      },
      report,
      (entityType, entityId) => {
        let set = aliveByType.get(entityType);
        if (!set) {
          set = new Set();
          aliveByType.set(entityType, set);
        }
        set.add(entityId);
      },
    );
  }
}

