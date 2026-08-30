/**
 * Serialiser for shopping item lines and `Shopping.md` files.
 *
 * Canonical token order matches `parser.ts`'s emit assumptions:
 *   - [{bought ? 'x' : ' '}] {name} (qty:: N)? (cost:: AMT CCY)? {✅ bought_date}?
 *       {#tag}* {unknown}* ^s-<ulid>
 *
 * A shopping item with the same fields always serialises to the same bytes, so
 * a canonically-ordered line round-trips byte-for-byte. Unknown tokens are
 * re-emitted verbatim (after the tags, before the block ref). Cost is formatted
 * as a two-decimal amount so the vault display is
 * consistent.
 */

import { serializeFrontmatter, type LineEnding } from '@/lib/markdown';
import type { ShoppingItem } from '@/domain/shopping-item';
import { SHOPPING_FRONTMATTER_TYPE } from './parser';
import { shoppingItemBlockRef } from './paths';

export function serializeShoppingItemLine(item: ShoppingItem, indent = ''): string {
  const parts: string[] = [`${indent}- [${item.bought ? 'x' : ' '}]`, item.name];

  if (item.quantity !== undefined) parts.push(`(qty:: ${item.quantity})`);
  if (item.estimated_cost) {
    parts.push(`(cost:: ${formatAmount(item.estimated_cost.amount)} ${item.estimated_cost.currency})`);
  }
  if (item.bought_date) parts.push('✅', item.bought_date);

  for (const tag of item.tags) parts.push(`#${tag}`);
  for (const token of item.unknown_tokens) parts.push(token);

  parts.push(`^${shoppingItemBlockRef(item.id)}`);
  return parts.join(' ');
}

export interface SerializeShoppingFileInput {
  /** `null` for the cross-trip General list. */
  tripId: string | null;
  items: readonly ShoppingItem[];
  trailingBody?: string;
  lineEnding?: LineEnding;
}

export function serializeShoppingFile(input: SerializeShoppingFileInput): string {
  const frontmatter: Record<string, unknown> = { type: SHOPPING_FRONTMATTER_TYPE };
  if (input.tripId !== null) frontmatter['trip_id'] = input.tripId;

  const itemLines = input.items.map((i) => serializeShoppingItemLine(i));
  const trailing = input.trailingBody?.trimEnd() ?? '';
  const body =
    trailing === ''
      ? `\n${itemLines.join('\n')}\n`
      : `\n${itemLines.join('\n')}\n\n${trailing}\n`;
  return serializeFrontmatter(frontmatter, body, { lineEnding: input.lineEnding ?? 'lf' });
}

function formatAmount(n: number): string {
  // Round to minor units and keep trailing zeros so
  // a $120 cost stays "120.00", not "120". Uniform money display in the vault.
  const rounded = Math.round(n * 100) / 100;
  return rounded.toFixed(2);
}
