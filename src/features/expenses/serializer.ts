/**
 * Serializer for ledger files and individual expense lines.
 *
 * The amount is formatted with up to 2 decimal places (currency-agnostic for
 * v1; we don't model minor-unit precision per currency yet). Trailing zeros
 * are preserved so a $12.40 expense stays "12.40", not "12.4" — that's the
 * shape humans expect for money in a vault.
 */

import { serializeFrontmatter, type LineEnding } from '@/lib/markdown';
import type { Expense } from '@/domain/expense';
import { expenseBlockRef } from './paths';

export interface SerializeLedgerInput {
  tripId: string;
  month: string;
  expenses: readonly Expense[];
  trailingBody?: string;
  lineEnding?: LineEnding;
}

export function serializeExpenseLine(expense: Expense): string {
  const blockRef = expenseBlockRef(expense.id);
  const amt = formatAmount(expense.amount);
  const parts = [
    `- ${expense.date}`,
    `(id:: ${expense.id})`,
    `(amt:: ${amt} ${expense.currency})`,
    `(cat:: ${expense.category})`,
  ];
  // Description may be empty — omit the gap rather than emit a trailing space
  // before the block ref.
  if (expense.description.trim() !== '') {
    parts.push(expense.description.trim());
  }
  parts.push(`^${blockRef}`);
  return parts.join(' ');
}

export function serializeExpensesLedger(input: SerializeLedgerInput): string {
  const frontmatter = {
    type: 'expenses-ledger',
    trip_id: input.tripId,
    month: input.month,
  };
  const sortedExpenses = [...input.expenses].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.id.localeCompare(b.id);
  });
  const expenseLines = sortedExpenses.map(serializeExpenseLine);
  // Keep the user's preserved content (comments, etc.) appended below the
  // expense block. Empty leading line for readability matches Obsidian's
  // typical layout.
  const trailing = input.trailingBody?.trimEnd() ?? '';
  const body = trailing === ''
    ? `\n${expenseLines.join('\n')}\n`
    : `\n${expenseLines.join('\n')}\n\n${trailing}\n`;
  return serializeFrontmatter(frontmatter, body, { lineEnding: input.lineEnding ?? 'lf' });
}

function formatAmount(n: number): string {
  // Use minor units rounded; format with trailing zeros preserved.
  const rounded = Math.round(n * 100) / 100;
  const fixed = rounded.toFixed(2);
  // Trim a trailing ".00" -> show "12" only for whole-currency amounts? No —
  // keep the two-decimal form so the vault display is uniform.
  return fixed;
}
