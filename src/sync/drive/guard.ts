/**
 * WRITE_ALLOWED_PREFIX guard.
 *
 * ADR-0003: "A WRITE_ALLOWED_PREFIX enforced at the Drive client layer. Any write
 * whose target path doesn't resolve under the configured Travel folder is rejected
 * at runtime."
 *
 * This is the only thing standing between a bug and arbitrary writes to the user's
 * Drive. Be paranoid:
 *   - Resolve `.` and `..` segments before comparing.
 *   - Reject any unresolved `..` that escapes the prefix.
 *   - Reject empty paths and absolute Windows / POSIX prefixes that we don't expect.
 *   - Normalize the path to a canonical form: forward slashes, no trailing slash,
 *     no leading slash, Unicode-NFC, segment-by-segment.
 *   - Drive is case-sensitive *server-side* but the user's vault root might be
 *     stored under a different casing on different systems. We treat path
 *     comparison as case-sensitive (matching Drive); callers must agree on the
 *     casing of the prefix at configuration time.
 */

import { WriteOutOfScopeError } from './types.js';

/**
 * Normalize a Drive path into a comparable canonical form:
 *  - Apply Unicode NFC normalization (so `é` (U+00E9) matches `é` (U+0065 U+0301)).
 *  - Convert backslashes to forward slashes.
 *  - Trim leading/trailing slashes and collapse repeated slashes.
 *  - Resolve `.` and `..` segments. `..` is allowed only if the remaining stack
 *    is non-empty (i.e. it does not escape the start of the path).
 *
 * @throws WriteOutOfScopeError when `..` would escape the start of the path. The
 *   guard treats this as out-of-scope rather than returning a sentinel because
 *   that's the security-relevant interpretation.
 */
export function normalizePath(path: string): string {
  if (typeof path !== 'string') {
    throw new WriteOutOfScopeError(String(path), '<allowed>');
  }
  // Reject NULs outright — they have no legitimate use in Drive paths and can
  // confuse downstream consumers.
  if (path.includes('\0')) {
    throw new WriteOutOfScopeError(path, '<allowed>');
  }

  const nfc = path.normalize('NFC').replace(/\\/g, '/');
  const segments = nfc.split('/');
  const stack: string[] = [];

  for (const raw of segments) {
    if (raw === '' || raw === '.') continue;
    if (raw === '..') {
      if (stack.length === 0) {
        // Escapes the start of the path — the caller is trying to climb out.
        throw new WriteOutOfScopeError(path, '<allowed>');
      }
      stack.pop();
      continue;
    }
    stack.push(raw);
  }

  return stack.join('/');
}

/**
 * Returns the canonical, normalized prefix from a configured allowed prefix
 * (e.g. `MyVault/Travel/`). Strips trailing slash and resolves segments. An
 * empty prefix (after normalization) is rejected — it would allow any path.
 */
export function normalizePrefix(prefix: string): string {
  const normalized = normalizePath(prefix);
  if (normalized.length === 0) {
    throw new Error('WRITE_ALLOWED_PREFIX must be a non-empty path; got an empty/root prefix.');
  }
  return normalized;
}

/**
 * True iff `candidate` resolves to a path strictly under (or equal to) `prefix`.
 *
 * "Strictly under" means we compare on segment boundaries — a prefix
 * `Travel` does NOT match `TravelClub/x` even though it's a string prefix.
 */
export function isUnderPrefix(candidate: string, prefix: string): boolean {
  let normalizedCandidate: string;
  let normalizedPrefix: string;
  try {
    normalizedCandidate = normalizePath(candidate);
    normalizedPrefix = normalizePrefix(prefix);
  } catch {
    return false;
  }
  if (normalizedCandidate === normalizedPrefix) return true;
  return normalizedCandidate.startsWith(normalizedPrefix + '/');
}

/**
 * Throws {@link WriteOutOfScopeError} if `candidate` does not resolve under
 * `prefix`. Returns the canonical normalized path on success.
 */
export function assertUnderPrefix(candidate: string, prefix: string): string {
  let normalizedPrefix: string;
  try {
    normalizedPrefix = normalizePrefix(prefix);
  } catch (cause) {
    // Configuration bug — surface as out-of-scope to keep the failure mode uniform.
    throw new WriteOutOfScopeError(
      candidate,
      prefix + ` (invalid prefix: ${(cause as Error).message})`,
    );
  }

  let normalizedCandidate: string;
  try {
    normalizedCandidate = normalizePath(candidate);
  } catch {
    throw new WriteOutOfScopeError(candidate, normalizedPrefix);
  }

  if (
    normalizedCandidate === normalizedPrefix ||
    normalizedCandidate.startsWith(normalizedPrefix + '/')
  ) {
    return normalizedCandidate;
  }

  throw new WriteOutOfScopeError(candidate, normalizedPrefix);
}

/**
 * Wrap a {@link DriveClient}-compatible mutator with the guard. Used by both the
 * real client and the fake to make the safety net non-bypassable: every write
 * has to go through this check.
 */
export interface GuardedWrite {
  resolvedPath: string;
}

export function guardWrite<W extends GuardedWrite>(input: W, prefix: string): W {
  assertUnderPrefix(input.resolvedPath, prefix);
  return input;
}
