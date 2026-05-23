/**
 * Trip slug derivation.
 *
 * Rules (ADR-0010 + Trip Zod regex `^[a-z0-9][a-z0-9-]*$`):
 *  - Strip combining marks via NFKD so `Côte d'Azur` → `cote-dazur`.
 *  - Lowercase.
 *  - Replace any run of non-`[a-z0-9]` characters with a single hyphen.
 *  - Trim leading/trailing hyphens.
 *  - Cap at 64 chars (folder names get long otherwise; Drive supports up to
 *    255 but the path stacks up).
 *  - If the first character after trimming is a digit, prefix `trip-`.
 *    (The Trip Zod regex allows leading digits, but `2026-japan` reads
 *    awkwardly as a folder.)
 *  - If the result is empty (input was entirely non-alphanumeric, e.g. only
 *    emojis), return `trip-untitled`.
 */

import { db as defaultDb } from '@/lib/storage';
import type { TravelDB } from '@/lib/storage';

const MAX_SLUG_LEN = 64;

export function deriveSlug(name: string): string {
  const nfkd = name.normalize('NFKD');
  // Strip combining marks (category Mn). The `\p{Mn}` class is supported in
  // ES2018+ Unicode regex.
  const stripped = nfkd.replace(/\p{Mn}+/gu, '');
  const lower = stripped.toLowerCase();
  // Anything that isn't `[a-z0-9]` collapses to a single hyphen.
  let kebab = lower.replace(/[^a-z0-9]+/g, '-');
  kebab = kebab.replace(/^-+|-+$/g, '');
  if (kebab.length === 0) return 'trip-untitled';
  if (/^\d/.test(kebab)) kebab = `trip-${kebab}`;
  if (kebab.length > MAX_SLUG_LEN) {
    kebab = kebab.slice(0, MAX_SLUG_LEN).replace(/-+$/g, '');
    if (kebab.length === 0) kebab = 'trip-untitled';
  }
  return kebab;
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
