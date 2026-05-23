/**
 * Expenses reconciler — line-level patching via S1 primitives.
 *
 * Unlike file-per-entity reconcilers (trips, accommodations), one expense is
 * one line in a monthly ledger. `applyEdit` looks up the target line by its
 * `^e-<ulid>` block ref and either inserts, replaces, or removes it without
 * disturbing the rest of the file (or any non-expense lines the user added).
 *
 * On first write of a month, the ledger file doesn't exist yet. The worker
 * passes empty `originalContent` in that case — we generate a minimal
 * frontmatter + the single line.
 */

import { z } from 'zod';
import {
  parseFrontmatter,
  serializeFrontmatter,
  findLineByBlockRef,
  replaceLine,
  insertLine,
  removeLine,
} from '@/lib/markdown';
import type { Reconciler, WriteQueueItem } from '@/sync/queue';
import { Expense } from '@/domain/expense';
import type { TripId } from '@/domain/ids';
import { parseExpensesLedger } from './parser';
import { serializeExpenseLine } from './serializer';
import { expenseBlockRef } from './paths';

export interface ExpensePayload {
  expense: Expense;
  /** `yyyy-mm` the expense belongs to. Caller derives from expense.date. */
  month: string;
}

const ExpensePayloadSchema = z.object({
  expense: Expense,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

function emptyLedger(tripId: TripId, month: string, expenseLine: string): string {
  // Frontmatter + a single blank line + the expense line. This mirrors what
  // `serializeExpensesLedger` would emit for a single-expense ledger.
  return serializeFrontmatter(
    {
      type: 'expenses-ledger',
      trip_id: tripId,
      month,
    },
    `\n${expenseLine}\n`,
  );
}

export const expenseReconciler: Reconciler<Expense, ExpensePayload> = {
  entityType: 'expense',

  /**
   * Used by S3 when a re-read is needed for entity-vs-file comparison. We
   * return any expense from the ledger that matches the entity id; if the
   * file is unparseable, return null and let the worker decide.
   */
  fromMarkdown(content: string): Expense | null {
    try {
      const parsed = parseExpensesLedger(content);
      return parsed.expenses[0] ?? null;
    } catch {
      return null;
    }
  },

  /**
   * Not the primary path for expenses (entity-as-file rewrite would lose
   * sibling lines). Returns the original content if we can parse it as a
   * ledger, otherwise replaces with a single-line ledger built around the
   * entity. The worker should prefer `applyEdit` for expenses.
   */
  toMarkdown(entity: Expense, originalContent: string | null): string {
    if (originalContent === null || originalContent === '') {
      const month = entity.date.slice(0, 7);
      return emptyLedger(entity.trip_id, month, serializeExpenseLine(entity));
    }
    return originalContent;
  },

  applyEdit(originalContent: string, item: WriteQueueItem<unknown>): string {
    const payload = ExpensePayloadSchema.parse(item.payload);
    const expense = payload.expense;
    const blockRef = expenseBlockRef(expense.id);
    const newLine = serializeExpenseLine(expense);

    if (originalContent === '') {
      if (item.op === 'delete') return '';
      return emptyLedger(expense.trip_id, payload.month, newLine);
    }

    // Split into frontmatter + body so the line primitives operate on a clean body.
    const parsed = parseFrontmatter(originalContent);
    const body = parsed.body;
    const existing = findLineByBlockRef(body, blockRef);

    let nextBody: string;
    if (item.op === 'delete') {
      if (!existing) return originalContent;
      nextBody = removeLine(body, blockRef);
    } else if (existing) {
      nextBody = replaceLine(body, blockRef, newLine);
    } else {
      // Insert at end of body. The ledger doesn't have a strict ordering
      // requirement (reader re-sorts on read), so appending is correct.
      nextBody = insertLine(body, newLine);
    }

    return serializeFrontmatter(parsed.frontmatter, nextBody, { lineEnding: parsed.lineEnding });
  },
};
