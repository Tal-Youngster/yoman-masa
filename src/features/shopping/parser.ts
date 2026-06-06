/**
 * Shopping-list line parser (ADR-0004).
 *
 *   - [ ] Trail runners (qty:: 1) (cost:: 120 USD) #gear/shoes ^s-e5f6
 *   - [x] Sunscreen (qty:: 2) ✅ 2026-05-10 #toiletries ^s-g7h8
 *
 * One item is one list-item line. The app patches a single line by its trailing
 * `^s-<ulid>` block ref; everything else in the file is left untouched.
 *
 * Canonical token order the serializer emits (and the corpus must use to
 * round-trip byte-for-byte):
 *
 *   {indent}- [{bought ? 'x' : ' '}] {name} (qty:: N)? (cost:: AMT CCY)?
 *           {✅ bought_date}? {#tag}* {unknown}* ^s-<ulid>
 *
 * The shopping schema has no `priority` / `due_date` analogue, so the metadata
 * table is much shorter than Tasks'. `category` exists in `ShoppingItem` but
 * has no representation in ADR-0004's line syntax — it's a Dexie/UI-only field
 * in v1 and round-trips as `undefined` through this parser. (If you need
 * categorisation in the vault, use a `#tag`.)
 *
 * Unrecognised tokens between the tags and the block ref are preserved verbatim
 * in `unknown_tokens`, the same way Tasks preserves `🔁 every-week`.
 */

import { parseFrontmatter, type LineEnding } from '@/lib/markdown';
import { ShoppingItem } from '@/domain/shopping-item';
import { ShoppingItemId, TripId } from '@/domain/ids';
import { IsoDate } from '@/domain/dates';

export interface ParsedShoppingItemLine {
  item: ShoppingItem;
  /** `s-<ulid>` — the Obsidian block ref without the leading caret. */
  blockRef: string;
  /** Leading whitespace of the source line, preserved for surgical edits. */
  indent: string;
}

export interface ParsedShoppingFile {
  /** `null` for the cross-trip General list. */
  tripId: TripId | null;
  items: ShoppingItem[];
  /** Unrecognised lines preserved verbatim so re-serialisation is non-destructive. */
  trailingBody: string;
  lineEnding: LineEnding;
}

export class ShoppingItemLineParseError extends Error {
  override readonly name = 'ShoppingItemLineParseError';
  constructor(
    message: string,
    public readonly line: string,
  ) {
    super(message);
  }
}

const CHECKBOX_RE = /^(\s*)- \[(.)\]\s+(.*)$/;
const BLOCK_REF_RE = /\s*\^(s-[A-Za-z0-9_-]+)\s*$/;
const QTY_RE = /\(qty::\s*(\d+)\)/;
const COST_RE = /\(cost::\s*(-?\d+(?:\.\d+)?)\s+([A-Z]{3})\)/;
const BOUGHT_DATE_RE = /✅\s+(\d{4}-\d{2}-\d{2})/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Replace a regex match with `' '` (rather than `''`) so adjacent words don't
 * fuse — `"Trail runners (qty:: 1) (cost:: 120 USD)"` collapsing to
 * `"Trail runners  "` is fine; collapsing to `"Trail runners"` is also fine,
 * but `"x(qty:: 1)y"` becoming `"xy"` would falsely concatenate tokens.
 */
function blankOut(s: string, range: { index: number; length: number }): string {
  return s.slice(0, range.index) + ' '.repeat(range.length) + s.slice(range.index + range.length);
}

/**
 * Parse a single shopping line. `tripId` is stamped onto the resulting entity
 * (the file, not the line, knows which trip it belongs to). Throws
 * `ShoppingItemLineParseError` if the line isn't a parseable shopping item.
 */
export function parseShoppingItemLine(line: string, tripId: TripId | null): ParsedShoppingItemLine {
  const checkbox = CHECKBOX_RE.exec(line.replace(/\s+$/, ''));
  if (!checkbox) throw new ShoppingItemLineParseError('not a "- [ ] …" item line', line);
  const [, indent, statusChar, afterCheckbox] = checkbox as unknown as [
    string,
    string,
    string,
    string,
  ];

  let bought: boolean;
  if (statusChar === ' ') bought = false;
  else if (statusChar === 'x' || statusChar === 'X') bought = true;
  else {
    throw new ShoppingItemLineParseError(`unsupported status marker "[${statusChar}]"`, line);
  }

  const blockMatch = BLOCK_REF_RE.exec(afterCheckbox);
  if (!blockMatch) throw new ShoppingItemLineParseError('missing trailing ^s-<id> block ref', line);
  const blockRef = blockMatch[1];

  // Strip the block ref from the working buffer first, then blank-out the
  // structured fields wherever they appear so the leftover string contains
  // only the name + tags + unknown tokens, position-preserved.
  let middle = afterCheckbox.slice(0, blockMatch.index);

  let quantity: number | undefined;
  const qtyMatch = QTY_RE.exec(middle);
  if (qtyMatch) {
    const value = Number(qtyMatch[1]);
    if (!Number.isInteger(value) || value <= 0) {
      throw new ShoppingItemLineParseError(`(qty:: ${qtyMatch[1]}) must be a positive integer`, line);
    }
    quantity = value;
    middle = blankOut(middle, { index: qtyMatch.index, length: qtyMatch[0].length });
  }

  let estimatedCost: { amount: number; currency: string } | undefined;
  const costMatch = COST_RE.exec(middle);
  if (costMatch) {
    estimatedCost = { amount: Number(costMatch[1]), currency: costMatch[2] };
    middle = blankOut(middle, { index: costMatch.index, length: costMatch[0].length });
  }

  let boughtDate: string | undefined;
  const boughtDateMatch = BOUGHT_DATE_RE.exec(middle);
  if (boughtDateMatch) {
    boughtDate = boughtDateMatch[1];
    middle = blankOut(middle, { index: boughtDateMatch.index, length: boughtDateMatch[0].length });
  }

  // Whatever's left is `{name} {#tag|unknown}*`. Split into tokens and walk
  // left-to-right: leading non-special words form the name; the first `#tag`
  // or a stray ISO-date / emoji switches us into metadata mode.
  const tokens = middle.trim().length === 0 ? [] : middle.trim().split(/\s+/);
  const nameParts: string[] = [];
  const tags: string[] = [];
  const unknownTokens: string[] = [];
  let inMetadata = false;
  for (const token of tokens) {
    const looksLikeTag = token.startsWith('#') && token.length > 1;
    const looksLikeUnknownEmoji = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(token);
    const looksLikeDate = ISO_DATE_RE.test(token);
    const isMetadata = looksLikeTag || looksLikeUnknownEmoji || looksLikeDate;
    if (!inMetadata && !isMetadata) {
      nameParts.push(token);
      continue;
    }
    inMetadata = true;
    if (looksLikeTag) {
      tags.push(token.slice(1));
    } else {
      unknownTokens.push(token);
    }
  }

  const name = nameParts.join(' ');
  if (name.length === 0) throw new ShoppingItemLineParseError('empty item name', line);

  const item = ShoppingItem.parse({
    type: 'shopping_item',
    id: ShoppingItemId.parse(`shp_${blockRef.replace(/^s-/, '')}`),
    trip_id: tripId,
    name,
    bought,
    ...(quantity !== undefined ? { quantity } : {}),
    ...(estimatedCost
      ? { estimated_cost: { amount: estimatedCost.amount, currency: estimatedCost.currency } }
      : {}),
    ...(boughtDate ? { bought_date: IsoDate.parse(boughtDate) } : {}),
    tags,
    unknown_tokens: unknownTokens,
  });

  return { item, blockRef, indent };
}

/** True if a line looks like a shopping item we own (checkbox + trailing `^s-` ref). */
export function isShoppingItemLine(line: string): boolean {
  const trimmed = line.replace(/\s+$/, '');
  return CHECKBOX_RE.test(trimmed) && BLOCK_REF_RE.test(trimmed);
}

const SHOPPING_FRONTMATTER_TYPE = 'shopping';

export interface ParseShoppingOptions {
  /** Strict mode throws on item-shaped lines that fail to parse. Default: false
   *  — those lines fall through to `trailingBody`, preserving user content. */
  strict?: boolean;
}

/**
 * Parse a `Shopping.md` file. `trip_id` comes from frontmatter (`null` for the
 * General list). Lines that don't parse as items are preserved verbatim in
 * `trailingBody` so headings, notes, and hand-authored content survive a write.
 */
export function parseShoppingFile(
  content: string,
  opts: ParseShoppingOptions = {},
): ParsedShoppingFile {
  const { frontmatter, body, lineEnding } = parseFrontmatter(content);
  const rawTripId = frontmatter['trip_id'];
  const tripId = rawTripId == null ? null : TripId.parse(rawTripId);

  const items: ShoppingItem[] = [];
  const preserved: string[] = [];
  for (const line of body.split('\n')) {
    if (isShoppingItemLine(line)) {
      try {
        items.push(parseShoppingItemLine(line, tripId).item);
        continue;
      } catch (err) {
        if (opts.strict) throw err;
      }
    }
    preserved.push(line);
  }

  return { tripId, items, trailingBody: preserved.join('\n'), lineEnding };
}

export { SHOPPING_FRONTMATTER_TYPE };
