/**
 * Trip slug derivation.
 *
 * Delegates to the shared `slugify` (`src/lib/slug.ts`) with the trip-specific
 * rules from ADR-0010 + the Trip Zod regex `^[a-z0-9][a-z0-9-]*$`:
 *  - `trip-` prefix when the name starts with a digit. The regex allows leading
 *    digits, but `2026-japan` reads awkwardly as a folder.
 *  - `trip-untitled` when nothing alphanumeric survives (emoji-only names).
 *  - 64-char cap; folder names get long otherwise.
 */

import { slugify } from '@/lib/slug';
import { db as defaultDb } from '@/lib/storage';
import type { TravelDB } from '@/lib/storage';

export function deriveSlug(name: string): string {
  return slugify(name, { fallback: 'trip-untitled', digitPrefix: 'trip-', maxLength: 64 });
}

/**
 * Is the slug not yet taken by another Trip in Dexie? Caller-owned: the
 * common usage is to suggest `slug`, `slug-2`, `slug-3`… until this returns
 * true. ADR-0010 keeps slug immutable post-creation so collision-handling
 * only matters at creation time.
 */
export async function isSlugUnique(slug: string, db?: TravelDB): Promise<boolean> {
  const handle = db ?? defaultDb;
  const existing = await handle.trips.where('slug').equals(slug).first();
  return existing === undefined;
}

/** Try slug, then slug-2, slug-3… until one is unique. */
export async function suggestUniqueSlug(name: string, db?: TravelDB): Promise<string> {
  const base = deriveSlug(name);
  if (await isSlugUnique(base, db)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}-${i}`;
    if (await isSlugUnique(candidate, db)) return candidate;
  }
  // Astronomically unlikely; fall back to a timestamped suffix.
  return `${base}-${Date.now()}`;
}
