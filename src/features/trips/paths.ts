/**
 * Vault path conventions for trip files (ADR-0010).
 *
 *   <travelFolderPath>/Trips/<slug>/Trip.md
 *
 * `travelFolderPath` is the canonical path to the Travel root (e.g.
 * `MyVault/Travel`). The caller normally reads it from S3's
 * FolderPick.path / kv `travel_folder_file_id` -> resolvePath.
 */

export function tripFolderPath(travelFolderPath: string, slug: string): string {
  return `${stripTrailingSlash(travelFolderPath)}/Trips/${slug}`;
}

export function tripFilePath(travelFolderPath: string, slug: string): string {
  return `${tripFolderPath(travelFolderPath, slug)}/Trip.md`;
}

/** `.travel/config.json` — pointer file for the active trip. */
export function activeConfigFilePath(travelFolderPath: string): string {
  return `${stripTrailingSlash(travelFolderPath)}/.travel/config.json`;
}

function stripTrailingSlash(p: string): string {
  return p.endsWith('/') ? p.slice(0, -1) : p;
}
