/**
 * Resolve the Drive parent folder id for a write_queue item.
 *
 * The queue stores each item's `resolvedPath` *with* the WRITE_ALLOWED_PREFIX
 * (e.g. `Travel/Trips/argentina/Trip.md`) because the guard re-verifies it at
 * write time. But the user picks the Travel folder up-front, so the prefix is
 * the *picked folder itself* — not an extra layer beneath it. Stripping the
 * leading prefix segment is the difference between writing to
 *
 *   <picked Travel>/Trips/argentina/Trip.md      ✓ what Obsidian expects
 *
 * vs. the buggy nested layout that ships otherwise:
 *
 *   <picked Travel>/Travel/Trips/argentina/Trip.md
 *
 * The bug was invisible while everything ran on one device — files round-trip
 * to themselves on the same device. It breaks the moment a second device pulls
 * from Drive: the inbound walk descends from `<picked Travel>/` so it sees the
 * relative path `Travel/Trips/<slug>/Trip.md`, the trip inbound reconciler's
 * `^Trips/<slug>/Trip\.md$` regex rejects it, and the trip silently disappears
 * from cross-device sync. See `tripInboundReconciler.matchesPath` in
 * `src/features/trips/inbound.ts`.
 *
 * Subfolders below the prefix (`Trips/`, `<slug>/`, …) are created on demand —
 * Drive doesn't have `mkdir -p`. The `folderCache` is a per-session memo so a
 * burst of trips into the same trip folder doesn't re-list it N times.
 */

import { asFileId, type DriveClient, type FileId } from '@/sync/drive';

export interface ResolveParentDeps {
  drive: DriveClient;
  /** Drive file id of the user's picked Travel folder. */
  travelFolderId: string;
  /** WRITE_ALLOWED_PREFIX — must match the leading segment of `resolvedPath`. */
  allowedPrefix: string;
  /** Per-session cache: subfolder path (under the Travel folder) → folder id. */
  folderCache: Map<string, string>;
}

export interface ResolveParentItem {
  entityType: string;
  resolvedPath: string;
}

/**
 * Return the parent folder id where a queue item's file should live, creating
 * intermediate folders if missing. Returns `null` only if the Travel folder
 * itself is unset (callers route that to a "blocked, pick folder" report).
 */
export async function resolveParent(
  item: ResolveParentItem,
  deps: ResolveParentDeps,
): Promise<FileId | null> {
  if (!deps.travelFolderId) return null;

  // Segments AFTER stripping the WRITE_ALLOWED_PREFIX. `Travel/Trips/x/Trip.md`
  // with allowedPrefix `Travel` → `['Trips', 'x', 'Trip.md']`.
  const segments = stripPrefix(item.resolvedPath, deps.allowedPrefix);

  // No subfolders → the file lives directly under the Travel folder.
  if (segments.length <= 1) return asFileId(deps.travelFolderId);

  // Everything except the file name is a folder to ensure exists.
  const folderNames = segments.slice(0, -1);

  let currentParent: string = deps.travelFolderId;
  let currentPath = '';

  for (const name of folderNames) {
    currentPath = currentPath ? `${currentPath}/${name}` : name;

    const cached = deps.folderCache.get(currentPath);
    if (cached) {
      currentParent = cached;
      continue;
    }

    const children = await deps.drive.listFolder(asFileId(currentParent));
    let found = children.find((c) => c.name === name && c.isFolder);
    if (!found) {
      found = await deps.drive.createFolder(asFileId(currentParent), name);
    }
    deps.folderCache.set(currentPath, found.id);
    currentParent = found.id;
  }

  return asFileId(currentParent);
}

/**
 * Split `resolvedPath` on `/`, drop empties, and remove a leading segment that
 * matches `allowedPrefix` (case-sensitive, exact). Trailing slashes don't
 * matter because filter(Boolean) drops empty strings.
 *
 * Exported for tests so the "did it strip the prefix?" assertion doesn't have
 * to go through the full Drive walk.
 */
export function stripPrefix(resolvedPath: string, allowedPrefix: string): string[] {
  const all = resolvedPath.split('/').filter(Boolean);
  if (all.length > 0 && all[0] === allowedPrefix) return all.slice(1);
  return all;
}
