/**
 * Slug derivation for vault file and folder names.
 *
 * Rules (originally ADR-0010's trip-slug rules, generalized so every slice that
 * names a file after user text derives it the same way):
 *  - Strip combining marks via NFKD so `Côte d'Azur` → `cote-dazur`.
 *  - Lowercase.
 *  - Replace any run of non-`[a-z0-9]` characters with a single hyphen.
 *  - Trim leading/trailing hyphens.
 *  - Cap the length (Drive allows 255, but paths stack up).
 *  - Optionally prefix a leading digit so the name reads as a name.
 *  - Fall back to a caller-supplied constant when nothing alphanumeric remains
 *    (input was emoji-only, punctuation-only, …).
 */

export interface SlugOptions {
  /** Returned when the input has no alphanumeric content. */
  fallback: string;
  /** Prefixed when the slug would otherwise start with a digit. */
  digitPrefix?: string;
  /** Max characters, trailing hyphens trimmed after the cut. Default 64. */
  maxLength?: number;
}

export function slugify(name: string, opts: SlugOptions): string {
  const nfkd = name.normalize('NFKD');
  // Strip combining marks (category Mn). The `\p{Mn}` class is supported in
  // ES2018+ Unicode regex.
  const stripped = nfkd.replace(/\p{Mn}+/gu, '');
  const lower = stripped.toLowerCase();
  // Anything that isn't `[a-z0-9]` collapses to a single hyphen.
  let kebab = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (kebab.length === 0) return opts.fallback;
  if (opts.digitPrefix && /^\d/.test(kebab)) kebab = `${opts.digitPrefix}${kebab}`;

  const max = opts.maxLength ?? 64;
  if (kebab.length > max) {
    kebab = kebab.slice(0, max).replace(/-+$/g, '');
    if (kebab.length === 0) return opts.fallback;
  }
  return kebab;
}
