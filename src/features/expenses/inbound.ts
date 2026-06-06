/**
 * Inbound (Drive → Dexie) reconciler for the monthly expenses ledger.
 *
 * A ledger file holds N expenses (one per line, see `parser.ts`). The pull
 * worker handles the delete-by-diff bookkeeping via `file_meta.last_entity_ids`
 * (ADR-0014 addendum 2026-06-06) — we only have to parse and return the
 * current set of expenses.
 *
 * If the file fails to parse (bad frontmatter, etc.) we return `[]` instead
 * of throwing — keeps a single corrupt month from blocking the rest of the
 * pull pass.
 */

import type { Expense } from '@/domain/expense';
import { deleteExpense as deleteExpenseRow, upsertExpense } from '@/lib/storage';
import type { InboundReconciler } from '@/sync/pull';

import { parseExpensesLedger } from './parser';

/** `Trips/<slug>/Expenses/<yyyy-mm>.md`. */
const EXPENSES_LEDGER_PATH_RE =
  /^Trips\/[a-z0-9][a-z0-9-]*\/Expenses\/\d{4}-(0[1-9]|1[0-2])\.md$/;

export const expenseInboundReconciler: InboundReconciler<Expense> = {
  entityType: 'expense',

  matchesPath(relPath) {
    return EXPENSES_LEDGER_PATH_RE.test(relPath);
  },

  parseFile(content) {
    try {
      return parseExpensesLedger(content).expenses;
    } catch {
      return [];
    }
  },

  entityId(expense) {
    return expense.id;
  },

  async upsertEntity(expense, db) {
    await upsertExpense(expense, db);
  },

  async deleteEntity(id, db) {
    await deleteExpenseRow(id as Expense['id'], db);
  },

  async listEntityIds(db) {
    const keys = await db.expenses.toCollection().primaryKeys();
    return keys.filter((k) => typeof k === 'string');
  },
};
