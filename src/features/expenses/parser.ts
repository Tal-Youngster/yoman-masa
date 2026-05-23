/**
 * Monthly expenses ledger format (ADR-0004):
 *
 *   ---
 *   type: expenses-ledger
 *   trip_id: trp_01H...
 *   month: 2026-05
 *   ---
 *
 *   - 2026-05-04 (id:: exp_01H...) (amt:: 12.40 EUR) (cat:: food) Café in Lisbon ^e-01H...
 *
 * One line per expense; line-level patching via S1 primitives keyed by the
 * trailing block reference. Description is whatever sits between the last
 * inline field and the block ref — leading/trailing whitespace is trimmed.
 */

import { z } from 'zod';
import { parseFrontmatter, type LineEnding } from '@/lib/markdown';
import { Expense, ExpenseCategory } from '@/domain/expense';
import { ExpenseId, TripId } from '@/domain/ids';
import { IsoDate } from '@/domain/dates';
import { Currency } from '@/domain/money';

export interface ParsedExpensesLedger {
  tripId: TripId;
  month: string;
  expenses: Expense[];
  /** Unrecognized lines preserved verbatim so re-serialization is non-destructive. */
  trailingBody: string;
  lineEnding: LineEnding;
}

export interface ParsedExpenseLine {
  expense: Expense;
  blockRef: string;
}

const LedgerFrontmatter = z.object({
  type: z.literal('expenses-ledger'),
  trip_id: TripId,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

// Anchor each field at its `(key:: value)` form so a description containing
// parens or `::` doesn't shadow them. The date sits at the start (after the
// list bullet); the block ref at the end.
const DATE_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s+/;
const ID_RE = /\(id::\s*(exp_[0-9A-HJKMNP-TV-Z]{26})\)/;
const AMT_RE = /\(amt::\s*(-?\d+(?:\.\d+)?)\s+([A-Z]{3})\)/;
const CAT_RE = /\(cat::\s*([a-z_]+)\)/;
const BLOCK_REF_RE = /\^(e-[A-Za-z0-9_-]+)\s*$/;

export class ExpenseLineParseError extends Error {
  override readonly name = 'ExpenseLineParseError';
  constructor(
    message: string,
    public readonly line: string,
  ) {
    super(message);
  }
}

export function parseExpenseLine(line: string, tripId: TripId): ParsedExpenseLine {
  const trimmed = line.replace(/\s+$/, '');
  const dateMatch = DATE_RE.exec(trimmed);
  if (!dateMatch) throw new ExpenseLineParseError('missing leading "- <date>"', line);
  const idMatch = ID_RE.exec(trimmed);
  if (!idMatch) throw new ExpenseLineParseError('missing (id:: …) field', line);
  const amtMatch = AMT_RE.exec(trimmed);
  if (!amtMatch) throw new ExpenseLineParseError('missing (amt:: <n> <CCC>) field', line);
  const catMatch = CAT_RE.exec(trimmed);
  if (!catMatch) throw new ExpenseLineParseError('missing (cat:: …) field', line);
  const blockMatch = BLOCK_REF_RE.exec(trimmed);
  if (!blockMatch) throw new ExpenseLineParseError('missing trailing ^e-<id> block ref', line);

  // Description = whatever sits between the last `(...)` field and the block ref.
  const lastFieldEnd = Math.max(
    idMatch.index + idMatch[0].length,
    amtMatch.index + amtMatch[0].length,
    catMatch.index + catMatch[0].length,
  );
  const blockRefStart = blockMatch.index;
  const description = trimmed.slice(lastFieldEnd, blockRefStart).trim();

  const expense = Expense.parse({
    type: 'expense',
    id: ExpenseId.parse(idMatch[1]),
    trip_id: tripId,
    date: IsoDate.parse(dateMatch[1]),
    amount: Number(amtMatch[1]),
    currency: Currency.parse(amtMatch[2]),
    category: ExpenseCategory.parse(catMatch[1]),
    description,
  });

  return { expense, blockRef: blockMatch[1] };
}

export interface ParseLedgerOptions {
  /** Strict mode throws on unparseable expense-lookalike lines. Default: false
   *  — unknown lines fall through to `trailingBody`, which is how we preserve
   *  user comments and any content above/below the expense block. */
  strict?: boolean;
}

export function parseExpensesLedger(
  content: string,
  opts: ParseLedgerOptions = {},
): ParsedExpensesLedger {
  const { frontmatter, body, lineEnding } = parseFrontmatter(content);
  const fm = LedgerFrontmatter.parse(frontmatter);
  const expenses: Expense[] = [];
  const preserved: string[] = [];
  for (const line of body.split('\n')) {
    if (DATE_RE.test(line)) {
      try {
        const { expense } = parseExpenseLine(line, fm.trip_id);
        expenses.push(expense);
        continue;
      } catch (err) {
        if (opts.strict) throw err;
        preserved.push(line);
        continue;
      }
    }
    preserved.push(line);
  }
  return {
    tripId: fm.trip_id,
    month: fm.month,
    expenses,
    trailingBody: preserved.join('\n'),
    lineEnding,
  };
}

/** True if a line looks like an expense entry (used by reconciler line search). */
export function isExpenseLine(line: string): boolean {
  return DATE_RE.test(line) && ID_RE.test(line) && BLOCK_REF_RE.test(line);
}
