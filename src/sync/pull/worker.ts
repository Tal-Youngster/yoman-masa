/**
 * Inbound pull worker.
 *
 * `pullAll` is the entry point. It reads the persisted change token; if
 * absent (first run), it delegates to {@link backfill}. Otherwise it pages
 * through `getChanges` to exhaustion and processes each change.
 *
 * Per-change flow:
 *  1. Resolve the file's path relative to `Travel/`. Not-under-Travel ⇒
 *     treat like a removal of any file_meta we already had.
 *  2. Route through the inbound registry by path. Unknown ⇒ skip.
 *  3. Check if any pending write_queue row targets the same entity. If so,
 *     skip (the queued local write will land first and re-emerge via the
 *     next pull tick).
 *  4. Parse, upsert entity, upsert file_meta.
 *
 * Removals (`removed: true` or file vanished) take the file_meta-keyed
 * path: look up by `file_id`, delete the referenced entity, drop the
 * file_meta row.
 *
 * The token is persisted ONLY after a full successful pass — partial
 * progress is replayable because every individual op is idempotent.
 */

import {
  deleteFileMeta,
  getFileMeta,
  getKV,
  setKV,
  upsertFileMeta,
} from '@/lib/storage';
import type { TravelDB } from '@/lib/storage';

import type { DriveChange } from '@/sync/drive';

import { backfill } from './backfill.js';
import { newPathCache, resolveRelativePath, type PathCache } from './path.js';
import { newPullReport, type PullDeps, type PullReport } from './types.js';
import type { InboundReconciler } from './types.js';

/** Hard cap on pages per pass. Defensive against a Drive bug returning the
 *  same token forever. At 100 changes/page that's 10k changes per pass. */
const MAX_PAGES = 100;

export async function pullAll(deps: PullDeps): Promise<PullReport> {
  const token = await getKV('drive_changes_page_token', deps.db);
  if (!token) {
    return backfill(deps);
  }

  const report = newPullReport();
  const cache = newPathCache();
  let cursor = token;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await deps.drive.getChanges(cursor);
    for (const change of batch.changes) {
      await processChange(deps, change, cache, report);
    }
    if (batch.nextPageToken === cursor) break;
    cursor = batch.nextPageToken;
  }

  await setKV('drive_changes_page_token', cursor, deps.db);
  return report;
}

async function processChange(
  deps: PullDeps,
  change: DriveChange,
  cache: PathCache,
  report: PullReport,
): Promise<void> {
  report.scanned += 1;

  // Removal: look up by file_id, propagate the delete.
  if (change.removed || !change.file) {
    await handleRemoval(deps, change.fileId, report);
    return;
  }

  // Folders are routed, not parsed — the inbound reconcilers only claim
  // *file* paths, and folder events would otherwise route to nothing.
  if (change.file.isFolder) {
    report.skipped += 1;
    return;
  }

  const relPath = await resolveRelativePath(
    deps.drive,
    deps.travelFolderId,
    change.file,
    cache,
  );

  // File left Travel/ — same shape as a removal from our perspective.
  if (relPath === null) {
    await handleRemoval(deps, change.fileId, report);
    return;
  }

  const reconciler = deps.registry.match(relPath);
  if (!reconciler) {
    report.skipped += 1;
    return;
  }

  let content: string;
  try {
    const got = await deps.drive.getContent(change.fileId);
    content = got.content;
  } catch {
    report.errors += 1;
    return;
  }

  await ingestFile(
    deps,
    reconciler,
    {
      fileId: change.fileId,
      relPath,
      content,
      headRevisionId: change.file.headRevisionId,
      modifiedTime: change.file.modifiedTime,
    },
    report,
  );
}

interface IngestInput {
  fileId: string;
  relPath: string;
  content: string;
  headRevisionId: string;
  modifiedTime: string;
}

/**
 * Parse a file and upsert its entities + file_meta. Shared by `pullAll` and
 * `backfill` so they apply identical conflict suppression / file_meta logic.
 */
export async function ingestFile(
  deps: PullDeps,
  reconciler: InboundReconciler,
  input: IngestInput,
  report: PullReport,
): Promise<void> {
  let entities: readonly unknown[];
  try {
    entities = reconciler.parseFile(input.content, input.relPath);
  } catch {
    report.errors += 1;
    return;
  }
  if (entities.length === 0) {
    report.skipped += 1;
    return;
  }

  let appliedAny = false;
  for (const entity of entities) {
    const id = reconciler.entityId(entity);
    if (await hasPendingWrite(deps.db, reconciler.entityType, id)) {
      report.skipped += 1;
      continue;
    }
    await reconciler.upsertEntity(entity, deps.db);
    appliedAny = true;
  }

  // Only record file_meta for single-entity files. Multi-entity ledger files
  // need a per-file-snapshot strategy that's out of scope for this slice
  // (see ADR-0014 "Ledger files" / "Sharp edges"). Until ledger inbound
  // wiring lands, we deliberately leave file_meta alone for those — the
  // outbound side still writes its own entries on each push, so we don't
  // lose track of ledger files entirely.
  if (entities.length === 1 && appliedAny) {
    const id = reconciler.entityId(entities[0]);
    await upsertFileMeta(
      {
        file_id: input.fileId,
        entity_type: reconciler.entityType,
        entity_id: id,
        head_revision_id: input.headRevisionId,
        modified_time: input.modifiedTime,
        path: input.relPath,
      },
      deps.db,
    );
  }

  if (appliedAny) report.upserted += 1;
}

async function handleRemoval(
  deps: PullDeps,
  fileId: string,
  report: PullReport,
): Promise<void> {
  const fm = await getFileMeta(fileId, deps.db);
  if (!fm) {
    report.skipped += 1;
    return;
  }
  if (await hasPendingWrite(deps.db, fm.entity_type, fm.entity_id)) {
    // A local write for this entity is queued. The user might be racing a
    // remote delete with a local edit — keep both intact and let the next
    // tick (after the local write lands or is dead-lettered) decide.
    report.skipped += 1;
    return;
  }
  const reconciler = deps.registry.get(fm.entity_type);
  if (!reconciler) {
    report.skipped += 1;
    return;
  }
  await reconciler.deleteEntity(fm.entity_id, deps.db);
  await deleteFileMeta(fm.file_id, deps.db);
  report.removed += 1;
}

/**
 * Pending-write suppression check. Reads directly from the Dexie `write_queue`
 * table — we don't go through the queue adapter because we want raw row
 * presence, not the worker-facing item shape.
 *
 * Exported so `backfill` (which runs its own diff pass) can apply the same
 * suppression without duplicating the predicate.
 */
export async function hasPendingWrite(
  db: TravelDB,
  entityType: string,
  entityId: string,
): Promise<boolean> {
  const row = await db.write_queue
    .where('entity_id')
    .equals(entityId)
    .filter((r) => r.entity_type === entityType)
    .first();
  return row !== undefined;
}
