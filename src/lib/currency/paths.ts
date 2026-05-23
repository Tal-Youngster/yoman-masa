/**
 * Resolve the vault path of a daily rates snapshot file.
 * Layout: `<travelFolder>/.travel/rates/<yyyy-mm-dd>.json` (ADR-0008).
 */
export function ratesFilePath(travelFolderPath: string, date: string): string {
  const trimmed = travelFolderPath.replace(/\/+$/, '');
  return `${trimmed}/.travel/rates/${date}.json`;
}
