/**
 * Inbound pull worker.
 *
 * `pullAll` is the entry point. It reads the persisted change token; if it is
 * absent, minted against a different Travel folder, or rejected by Drive, it
 * delegates to {@link backfill}. Otherwise it pages through `getChanges` to
 * exhaustion and processes each change.
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
 * The token is persisted ONLY when Drive hands back a `newStartPageToken`,
 * which it emits solely on the final page — i.e. only once we are genuinely
 * caught up. Partial progress is replayable because every individual op is
 * idempotent. See ADR-0019 for the bug this replaced: the old code fell back
 * to re-persisting the token it was given, so the cursor never moved and
 * every pull replayed an ever-growing window.
 */

import {
  deleteFileMeta,
  deleteKV,
  getFileMeta,
  getKV,
  setKV,
  upsertFileMeta,
} from '@/lib/storage';
import type { TravelDB } from '@/lib/storage';

import { InvalidPageTokenError, type DriveChange } from '@/sync/drive';

import { backfill } from './backfill.js';
import { newPathCache, resolveRelativePath, type PathCache } from './path.js';
import { newPullReport, type PullDeps, type PullReport } from './types.js';
import type { InboundReconciler } from './types.js';

/** Hard cap on pages per pass. Defensive against a Drive bug returning the
 *  same token forever. At 100 changes/page that's 10k changes per pass. */
const MAX_PAGES = 100;

export async function pullAll(deps: PullDeps): Promise<PullReport> {
  const token = await getKV('drive_changes_page_token', deps.db);
  const tokenFolder = await getKV('drive_changes_token_folder', deps.db);

  // A token is only meaningful for the folder it was minted against. If the
  // user re-picked, the cursor describes a vault we are no longer reading.
  if (!token || tokenFolder !== deps.travelFolderId) {
    return backfill(deps);
  }

  const report = newPullReport();
  const cache = newPathCache();
  let cursor: string = token;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let batch;
    try {
      batch = await deps.drive.getChanges(cursor);
    } catch (err) {
      if (err instanceof InvalidPageTokenError) {
        // Self-healing path that replaced the manual "Resync from Drive"
        // button: drop the unusable cursor and rebuild from a full walk.
        await deleteKV('drive_changes_page_token', deps.db);
        return backfill(deps);
      }
      throw err;
    }

    for (const change of batch.changes) {
      await processChange(deps, change, cache, report);
    }

    if (batch.newStartPageToken) {
      // Caught up. This is the ONLY point at which the cursor advances.
      await setKV('drive_changes_page_token', batch.newStartPageToken, deps.db);
      await setKV('drive_changes_token_folder', deps.travelFolderId, deps.db);
      return report;
    }

    if (!batch.nextPageToken) {
      // Neither token: Drive told us nothing actionable. Leave the cursor
      // where it is and replay next pass rather than guessing.
      break;
    }
    cursor = batch.nextPageToken;
  }

  // Fell out via MAX_PAGES or a token-less page — deliberately do NOT persist
  // the cursor. The next pass replays from the last known-good position.
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

  // Echo suppression (ADR-0019). If the revision Drive is reporting is the one
  // we already recorded, this change is either our own outbound write coming
  // back around or a duplicate event. Skipping here saves the `getContent`
  // round-trip and a redundant re-parse of a file we are already consistent
  // with.
  const known = await getFileMeta(change.fileId, deps.db);
  if (known && known.head_revision_id === change.file.headRevisionId) {
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
 *
 * `onAlive` is optional: backfill passes a callback so it can record which
 * entity ids Drive surfaced this pass, then sweep anything else. The
 * change-feed path doesn't need the callback — it only sees deltas, not the
 * full set.
 */
export async function ingestFile(
  deps: PullDeps,
  reconciler: InboundReconciler,
  input: IngestInput,
  report: PullReport,
  onAlive?: (entityType: string, entityId: string) => void,
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

  // Ledger delta: any id that was in the file last tick but isn't now is a
  // row the user (or another device) removed from the ledger. Compute this
  // BEFORE the upsert pass so we don't accidentally delete an entity we
  // just upserted under a different id.
  const prevMeta = await getFileMeta(input.fileId, deps.db);
  // Defensive `?? []` covers any pre-v4 row the migration missed (the field
  // is required at the type level but a stray legacy row would still be
  // `undefined` at runtime).
  const prevIds = (prevMeta?.last_entity_ids ?? []);
  const nowIds = entities.map((e) => reconciler.entityId(e));
  const nowSet = new Set(nowIds);

  for (const goneId of prevIds) {
    if (nowSet.has(goneId)) continue;
    // Pending-write guard mirrors the upsert path: if a local write for this
    // entity is queued, the user might be racing a remote delete with a
    // local edit — keep both intact and let the next tick decide.
    if (await hasPendingWrite(deps.db, reconciler.entityType, goneId)) continue;
    await reconciler.deleteEntity(goneId, deps.db);
    report.removed += 1;
  }

  let appliedAny = false;
  for (let i = 0; i < entities.length; i += 1) {
    const entity = entities[i];
    const id = nowIds[i] ?? reconciler.entityId(entity);
    // Mark alive whether or not we end up upserting — Drive showed us this
    // entity, so the backfill sweep should not delete it even if we skipped
    // the upsert because of a pending local write.
    onAlive?.(reconciler.entityType, id);
    if (await hasPendingWrite(deps.db, reconciler.entityType, id)) {
      report.skipped += 1;
      continue;
    }
    await reconciler.upsertEntity(entity, deps.db);
    appliedAny = true;
  }

  // Always record file_meta — single-entity and ledger both use the same
  // shape now (v4+). `last_entity_ids` is the snapshot the next ingest will
  // diff against. `entity_id` keeps the first id as a representative so the
  // existing `getFileMetaByEntity` index lookup stays cheap; readers that
  // need the full set use `last_entity_ids`.
  if (appliedAny || prevMeta) {
    await upsertFileMeta(
      {
        file_id: input.fileId,
        entity_type: reconciler.entityType,
        entity_id: nowIds[0] ?? prevMeta?.entity_id ?? '',
        last_entity_ids: nowIds,
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
  const reconciler = deps.registry.get(fm.entity_type);
  if (!reconciler) {
    report.skipped += 1;
    return;
  }

  // Iterate the full last-seen entity set so ledger files (Tasks,
  // Tasks) propagate a whole-file delete to every row they contained.
  // Fall back to `[entity_id]` for any pre-v4 file_meta that slipped
  // through migration (the field is declared required, but a row
  // written before v4 and missed by the upgrade hook would still satisfy
  // the type at compile time while being `undefined` at runtime —
  // defensive read here).
  const lastIds = (fm.last_entity_ids ?? []);
  const ids = lastIds.length > 0 ? lastIds : [fm.entity_id];

  let anyDeleted = false;
  for (const id of ids) {
    if (await hasPendingWrite(deps.db, fm.entity_type, id)) {
      // A local write for this entity is queued. Keep it intact; the next
      // tick (after the local write lands or is dead-lettered) will decide.
      continue;
    }
    await reconciler.deleteEntity(id, deps.db);
    anyDeleted = true;
    report.removed += 1;
  }

  // Only drop the file_meta if we actually completed the removal. If every
  // id was pending-write-suppressed, keep the row so the next pass sees the
  // same prev set and can re-attempt.
  if (anyDeleted) await deleteFileMeta(fm.file_id, deps.db);
  if (!anyDeleted) report.skipped += 1;
}

/**
 * Pending-write suppression check. Reads directly from the Dexie `write_queue`
 * table — we don't go through the queue adapter because we want raw row
 * presence, not the worker-facing item shape.
 *
 * Dead rows are explicitly excluded (ADR-0019). They are retained for
 * visibility, but a write that will never be attempted again must not
 * suppress inbound updates for its entity — that would freeze the entity at
 * its stale local value permanently, which is the original wedge wearing a
 * different hat.
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
    .filter((r) => r.entity_type === entityType && (r.dead ?? 0) === 0)
    .first();
  return row !== undefined;
}
