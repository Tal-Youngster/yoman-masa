/**
 * Resolve a Drive file's path relative to the user's `Travel/` folder by
 * walking the parent chain. The Drive Changes feed gives us a file's name +
 * `parents[]` but not the path; the `RealDriveClient.resolvePath` callback
 * is a placeholder (`() => 'Travel'`) until S6 ships a real one. The pull
 * subsystem owns its own resolver so it doesn't depend on that wiring.
 *
 * Memoization is shared across one pull pass via the caller-supplied cache.
 * Each unfamiliar ancestor costs one `getMetadata` round-trip; subsequent
 * children of that ancestor are free for the rest of the pass.
 *
 * Returns `null` if the file is not under `Travel/`. Out-of-Travel files
 * are treated by the worker as "if we knew about this file_id, drop it".
 */

import type { DriveClient, FileId, FileMetadata } from '@/sync/drive';

/** Defensive cap on the parent walk to break any pathological cycles
 *  Drive shouldn't ever produce. A Travel-folder-rooted path 16 deep would
 *  already be absurd. */
const MAX_DEPTH = 16;

export type PathCache = Map<FileId, FileMetadata>;

export function newPathCache(): PathCache {
  return new Map();
}

export async function resolveRelativePath(
  drive: DriveClient,
  travelFolderId: FileId,
  file: FileMetadata,
  cache: PathCache,
): Promise<string | null> {
  // Pre-seed the cache with the file itself so a getMetadata lookup of the
  // same id later in the pass is free.
  cache.set(file.id, file);

  const segments: string[] = [file.name];
  let parents = file.parents;

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    if (parents.length === 0) return null; // hit the Drive root without seeing Travel
    const parentId = parents[0];
    if (!parentId) return null;
    if (parentId === travelFolderId) {
      return segments.reverse().join('/');
    }
    const parent = await getCached(drive, parentId, cache);
    if (!parent) return null;
    segments.push(parent.name);
    parents = parent.parents;
  }
  return null;
}

async function getCached(
  drive: DriveClient,
  fileId: FileId,
  cache: PathCache,
): Promise<FileMetadata | null> {
  const hit = cache.get(fileId);
  if (hit) return hit;
  try {
    const meta = await drive.getMetadata(fileId);
    cache.set(fileId, meta);
    return meta;
  } catch {
    // 404 / permission denied: the parent disappeared between the change
    // event and our lookup. Treat as "not under Travel" so the worker
    // either drops or skips the file.
    return null;
  }
}
