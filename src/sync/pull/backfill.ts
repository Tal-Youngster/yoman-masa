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
 */

import { deleteFileMeta, setKV } from '@/lib/storage';

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
  await walk(deps, deps.travelFolderId, '', report, 0, visited);
  await reconcileMissing(deps, visited, report);
  await setKV('drive_changes_page_token', startToken, deps.db);
  return report;
}

/**
 * Backfill-only: any `file_meta` row for an entity type the inbound registry
 * owns, whose `file_id` we did NOT visit during the walk, refers to a file
 * that Drive no longer has. That entity is an orphan (Obsidian-side delete
 * we missed because there was no change token yet) and per ADR-0014 the
 * entity row + file_meta row are dropped.
 *
 * Skipped if a local write is pending for the entity — the local create may
 * still need to land. The next change-feed tick (after the local write
 * succeeds, or is dead-lettered) handles it.
 */
async function reconcileMissing(
  deps: PullDeps,
  visited: ReadonlySet<string>,
  report: PullReport,
): Promise<void> {
  for (const reconciler of deps.registry.list()) {
    const candidates = await deps.db.file_meta
      .where('entity_type')
      .equals(reconciler.entityType)
      .toArray();
    for (const fm of candidates) {
      if (visited.has(fm.file_id)) continue;
      if (await hasPendingWrite(deps.db, fm.entity_type, fm.entity_id)) continue;
      await reconciler.deleteEntity(fm.entity_id, deps.db);
      await deleteFileMeta(fm.file_id, deps.db);
      report.removed += 1;
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
      await walk(deps, child.id, childRelPath, report, depth + 1, visited);
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
    );
  }
}
