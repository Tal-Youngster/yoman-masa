/**
 * Line-level patching primitives keyed by Obsidian block references (`^abc-123`).
 *
 * Operates on the LF-normalized body returned by `parseFrontmatter`. Callers that need to round-trip
 * CRLF input should normalize on read (parseFrontmatter does this) and re-apply the line ending
 * via `serializeFrontmatter`.
 *
 * Invariants:
 * - A block reference is the last token on its line, after any trailing whitespace is stripped:
 *   matches the pattern `\^[A-Za-z0-9][A-Za-z0-9_-]*` at end-of-line.
 * - Multiple lines carrying the same block-ref are an integrity error — the caller's vault is broken.
 *   `findLineByBlockRef` returns the first match, but `replaceLine` / `removeLine` throw an
 *   `AmbiguousBlockRefError` so a malformed vault is loud, not silently destructive.
 */

const BLOCK_REF_TOKEN = /\^([A-Za-z0-9][A-Za-z0-9_-]*)\s*$/;

export class BlockRefNotFoundError extends Error {
  override readonly name = 'BlockRefNotFoundError';
  constructor(public readonly blockRef: string) {
    super(`Block reference not found: ^${blockRef}`);
  }
}

export class AmbiguousBlockRefError extends Error {
  override readonly name = 'AmbiguousBlockRefError';
  constructor(
    public readonly blockRef: string,
    public readonly lineIndices: readonly number[],
  ) {
    super(
      `Block reference ^${blockRef} matches ${String(lineIndices.length)} lines (${lineIndices.join(', ')}); the vault is inconsistent`,
    );
  }
}

/** Normalize a user-supplied block ref: strip a leading `^` and outer whitespace. */
function normalizeRef(ref: string): string {
  const trimmed = ref.trim();
  return trimmed.startsWith('^') ? trimmed.slice(1) : trimmed;
}

/**
 * Split a body into lines preserving terminator information. We split on `\n` and remember whether
 * the final line had a terminator, so joining back is lossless for LF input.
 */
interface SplitBody {
  lines: string[];
  trailingNewline: boolean;
}

function splitLines(body: string): SplitBody {
  if (body === '') return { lines: [], trailingNewline: false };
  const trailingNewline = body.endsWith('\n');
  const trimmed = trailingNewline ? body.slice(0, -1) : body;
  return { lines: trimmed.split('\n'), trailingNewline };
}

function joinLines({ lines, trailingNewline }: SplitBody): string {
  if (lines.length === 0) return trailingNewline ? '\n' : '';
  return lines.join('\n') + (trailingNewline ? '\n' : '');
}

/** Returns true if the line ends with the given block ref (after trailing whitespace). */
function lineHasRef(line: string, ref: string): boolean {
  const match = BLOCK_REF_TOKEN.exec(line);
  return match !== null && match[1] === ref;
}

function findAllIndices(lines: readonly string[], ref: string): number[] {
  const indices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lineHasRef(lines[i], ref)) indices.push(i);
  }
  return indices;
}

export function findLineByBlockRef(
  body: string,
  blockRef: string,
): { lineIndex: number; line: string } | null {
  const ref = normalizeRef(blockRef);
  if (ref === '') return null;
  const { lines } = splitLines(body);
  const hits = findAllIndices(lines, ref);
  if (hits.length === 0) return null;
  if (hits.length > 1) throw new AmbiguousBlockRefError(ref, hits);
  const lineIndex = hits[0];
  return { lineIndex, line: lines[lineIndex] };
}

/**
 * Replace the line matching `blockRef` with `newLine`. The new line must itself end in the same
 * block reference; we do not auto-append it because that would surprise callers and conflict with
 * lines that intentionally rename their refs. (For renames, replace then re-find by the new ref.)
 */
export function replaceLine(body: string, blockRef: string, newLine: string): string {
  const ref = normalizeRef(blockRef);
  const split = splitLines(body);
  const hits = findAllIndices(split.lines, ref);
  if (hits.length === 0) throw new BlockRefNotFoundError(ref);
  if (hits.length > 1) throw new AmbiguousBlockRefError(ref, hits);
  const idx = hits[0];
  if (newLine.includes('\n')) {
    throw new Error('replaceLine: newLine must not contain a newline');
  }
  split.lines[idx] = newLine;
  return joinLines(split);
}

export interface InsertAnchor {
  afterBlockRef: string;
}

/**
 * Insert `newLine` either after the line carrying `anchor.afterBlockRef`, or at the end of the
 * body if no anchor is given. Inserting into an empty body yields a single-line body (with the
 * same trailing-newline convention as the input — none, since input was empty).
 */
export function insertLine(body: string, newLine: string, anchor?: InsertAnchor): string {
  if (newLine.includes('\n')) {
    throw new Error('insertLine: newLine must not contain a newline');
  }
  const split = splitLines(body);
  if (anchor) {
    const ref = normalizeRef(anchor.afterBlockRef);
    const hits = findAllIndices(split.lines, ref);
    if (hits.length === 0) throw new BlockRefNotFoundError(ref);
    if (hits.length > 1) throw new AmbiguousBlockRefError(ref, hits);
    const idx = hits[0];
    split.lines.splice(idx + 1, 0, newLine);
    return joinLines(split);
  }
  // Append at end. If the body has no trailing newline but is non-empty, the new line becomes a
  // sibling of the last line (no trailing newline added).
  split.lines.push(newLine);
  return joinLines(split);
}

/**
 * Remove the line carrying `blockRef`. If it was the only line, the body becomes empty (no
 * dangling newline).
 */
export function removeLine(body: string, blockRef: string): string {
  const ref = normalizeRef(blockRef);
  const split = splitLines(body);
  const hits = findAllIndices(split.lines, ref);
  if (hits.length === 0) throw new BlockRefNotFoundError(ref);
  if (hits.length > 1) throw new AmbiguousBlockRefError(ref, hits);
  const idx = hits[0];
  split.lines.splice(idx, 1);
  if (split.lines.length === 0) return '';
  return joinLines(split);
}
