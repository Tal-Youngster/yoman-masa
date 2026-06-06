import { tripFolderPath } from '@/features/trips/paths';

/**
 * Shopping file path (ADR-0004 / ADR-0010):
 *   per trip:  <travelFolder>/Trips/<slug>/Shopping.md
 *   General:   <travelFolder>/General/Shopping.md
 *
 * Pass `null` for `tripSlug` to address the cross-trip General list.
 */
export function shoppingFilePath(travelFolderPath: string, tripSlug: string | null): string {
  if (tripSlug === null) {
    return `${stripTrailingSlash(travelFolderPath)}/General/Shopping.md`;
  }
  return `${tripFolderPath(travelFolderPath, tripSlug)}/Shopping.md`;
}

/** Block reference for a shopping item line: `s-<ulid>` (no leading caret). */
export function shoppingItemBlockRef(itemId: string): string {
  return `s-${itemId.replace(/^shp_/, '')}`;
}

function stripTrailingSlash(p: string): string {
  return p.endsWith('/') ? p.slice(0, -1) : p;
}
