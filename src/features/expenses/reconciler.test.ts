import { describe, it, expect } from 'vitest';
import { TripId, ExpenseId } from '@/domain/ids';
import { Currency } from '@/domain/money';
import { IsoDate } from '@/domain/dates';
import { Expense, ExpenseCategory } from '@/domain/expense';
import type { WriteQueueItem } from '@/sync/queue';
import { expenseReconciler, type ExpensePayload } from './reconciler';
import { parseExpensesLedger } from './parser';
import { expenseBlockRef } from './paths';

const TRIP = TripId.parse('trp_01HABCDEFGHJKMNPQRSTVWXYZ0');

function buildExpense(partial: Partial<Expense> = {}): Expense {
  return Expense.parse({
    type: 'expense',
    id: ExpenseId.parse('exp_01HABCDEFGHJKMNPQRSTVWXYZ0'),
    trip_id: TRIP,
    date: IsoDate.parse('2026-05-04'),
    amount: 12.4,
    currency: Currency.parse('EUR'),
    category: ExpenseCategory.parse('food'),
    description: 'Café',
    ...partial,
  });
}

function item(payload: ExpensePayload, op: WriteQueueItem['op'] = 'create'): WriteQueueItem<ExpensePayload> {
  return {
    id: '01',
    entityType: 'expense',
    entityId: payload.expense.id,
    op,
    payload,
    baseRevision: null,
    fileId: null,
    resolvedPath: 'Travel/Trips/x/Expenses/2026-05.md',
    attempts: 0,
    lastError: null,
    createdAt: '2026-05-04T00:00:00Z',
  };
}

describe('expenseReconciler.applyEdit', () => {
  it('creates a new ledger from empty content', () => {
    const expense = buildExpense();
    const out = expenseReconciler.applyEdit('', item({ expense, month: '2026-05' }));
    const parsed = parseExpensesLedger(out);
    expect(parsed.expenses).toHaveLength(1);
    expect(parsed.expenses[0].id).toBe(expense.id);
  });

  it('inserts a new line into an existing ledger without disturbing siblings', () => {
    const first = buildExpense({
      id: ExpenseId.parse('exp_01HABCDEFGHJKMNPQRSTVWXYZ0'),
      description: 'first',
    });
    const seed = expenseReconciler.applyEdit('', item({ expense: first, month: '2026-05' }));
    const second = buildExpense({
      id: ExpenseId.parse('exp_01HABCDEFGHJKMNPQRSTVWXYZ1'),
      description: 'second',
      amount: 5,
    });
    const out = expenseReconciler.applyEdit(seed, item({ expense: second, month: '2026-05' }));
    const parsed = parseExpensesLedger(out);
    expect(parsed.expenses).toHaveLength(2);
    expect(parsed.expenses.map((e) => e.description).sort()).toEqual(['first', 'second']);
  });

  it('replaces an existing line keyed by block ref', () => {
    const e = buildExpense({ description: 'original', amount: 10 });
    const seed = expenseReconciler.applyEdit('', item({ expense: e, month: '2026-05' }));
    const edited = { ...e, description: 'edited', amount: 12 };
    const out = expenseReconciler.applyEdit(seed, item({ expense: edited, month: '2026-05' }, 'update'));
    const parsed = parseExpensesLedger(out);
    expect(parsed.expenses).toHaveLength(1);
    expect(parsed.expenses[0].description).toBe('edited');
    expect(parsed.expenses[0].amount).toBe(12);
  });

  it('removes a line on delete', () => {
    const e = buildExpense({ description: 'goner' });
    const seed = expenseReconciler.applyEdit('', item({ expense: e, month: '2026-05' }));
    const out = expenseReconciler.applyEdit(seed, item({ expense: e, month: '2026-05' }, 'delete'));
    const parsed = parseExpensesLedger(out);
    expect(parsed.expenses).toHaveLength(0);
    // Body without the line should still contain the frontmatter.
    expect(out).toContain('type: expenses-ledger');
  });

  it('preserves user-added comment lines on update', () => {
    const e = buildExpense({ description: 'first' });
    const seed = expenseReconciler.applyEdit('', item({ expense: e, month: '2026-05' }));
    // Sneak a comment in between
    const withComment = seed.replace(`^${expenseBlockRef(e.id)}`, `^${expenseBlockRef(e.id)}\n<!-- handwritten -->`);
    const edited = { ...e, description: 'edited' };
    const out = expenseReconciler.applyEdit(withComment, item({ expense: edited, month: '2026-05' }, 'update'));
    expect(out).toContain('<!-- handwritten -->');
    const parsed = parseExpensesLedger(out);
    expect(parsed.expenses[0].description).toBe('edited');
  });

  it('idempotent delete: removing a non-existent line returns original', () => {
    const seed = expenseReconciler.applyEdit('', item({ expense: buildExpense({ description: 'a' }), month: '2026-05' }));
    const other = buildExpense({ id: ExpenseId.parse('exp_01HABCDEFGHJKMNPQRSTVWXYZ9'), description: 'b' });
    const out = expenseReconciler.applyEdit(seed, item({ expense: other, month: '2026-05' }, 'delete'));
    expect(out).toBe(seed);
  });
});
