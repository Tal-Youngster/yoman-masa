import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { TripId, ExpenseId } from '@/domain/ids';
import { Currency } from '@/domain/money';
import { IsoDate } from '@/domain/dates';
import { Expense, ExpenseCategory } from '@/domain/expense';
import {
  parseExpenseLine,
  parseExpensesLedger,
  isExpenseLine,
  ExpenseLineParseError,
} from './parser';
import { serializeExpenseLine, serializeExpensesLedger } from './serializer';

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
    description: 'Café in Lisbon',
    ...partial,
  });
}

describe('parseExpenseLine', () => {
  it('parses the canonical example from ADR-0004', () => {
    const line =
      '- 2026-05-04 (id:: exp_01HABCDEFGHJKMNPQRSTVWXYZ0) (amt:: 12.40 EUR) (cat:: food) Café in Lisbon ^e-01HABCDEFGHJKMNPQRSTVWXYZ0';
    const { expense, blockRef } = parseExpenseLine(line, TRIP);
    expect(expense.amount).toBe(12.4);
    expect(expense.currency).toBe(Currency.parse('EUR'));
    expect(expense.category).toBe('food');
    expect(expense.description).toBe('Café in Lisbon');
    expect(blockRef).toBe('e-01HABCDEFGHJKMNPQRSTVWXYZ0');
  });

  it('treats an empty description as ""', () => {
    const line =
      '- 2026-05-04 (id:: exp_01HABCDEFGHJKMNPQRSTVWXYZ0) (amt:: 5.00 USD) (cat:: fees) ^e-01HABCDEFGHJKMNPQRSTVWXYZ0';
    const { expense } = parseExpenseLine(line, TRIP);
    expect(expense.description).toBe('');
  });

  it('tolerates extra whitespace between fields', () => {
    const line =
      '-   2026-05-04   (id::  exp_01HABCDEFGHJKMNPQRSTVWXYZ0)   (amt:: 5.00 USD)   (cat:: food)  thing  ^e-01HABCDEFGHJKMNPQRSTVWXYZ0';
    const { expense } = parseExpenseLine(line, TRIP);
    expect(expense.description).toBe('thing');
  });

  it('throws on missing block ref', () => {
    const line =
      '- 2026-05-04 (id:: exp_01HABCDEFGHJKMNPQRSTVWXYZ0) (amt:: 5.00 USD) (cat:: food) thing';
    expect(() => parseExpenseLine(line, TRIP)).toThrow(ExpenseLineParseError);
  });

  it('throws on missing amt', () => {
    const line =
      '- 2026-05-04 (id:: exp_01HABCDEFGHJKMNPQRSTVWXYZ0) (cat:: food) thing ^e-01HABCDEFGHJKMNPQRSTVWXYZ0';
    expect(() => parseExpenseLine(line, TRIP)).toThrow(/amt/);
  });
});

describe('parseExpensesLedger', () => {
  it('parses frontmatter + multiple expense lines', () => {
    const content = `---
type: expenses-ledger
trip_id: trp_01HABCDEFGHJKMNPQRSTVWXYZ0
month: 2026-05
---

- 2026-05-04 (id:: exp_01HABCDEFGHJKMNPQRSTVWXYZ0) (amt:: 12.40 EUR) (cat:: food) Café ^e-01HABCDEFGHJKMNPQRSTVWXYZ0
- 2026-05-04 (id:: exp_01HABCDEFGHJKMNPQRSTVWXYZ1) (amt:: 38.00 EUR) (cat:: transport) Train ^e-01HABCDEFGHJKMNPQRSTVWXYZ1
`;
    const parsed = parseExpensesLedger(content);
    expect(parsed.month).toBe('2026-05');
    expect(parsed.expenses).toHaveLength(2);
    expect(parsed.expenses[0].description).toBe('Café');
    expect(parsed.expenses[1].category).toBe('transport');
  });

  it('preserves unrecognized lines in trailingBody', () => {
    const content = `---
type: expenses-ledger
trip_id: trp_01HABCDEFGHJKMNPQRSTVWXYZ0
month: 2026-05
---

# Notes
Don't forget the receipts for accommodation
- 2026-05-04 (id:: exp_01HABCDEFGHJKMNPQRSTVWXYZ0) (amt:: 12.40 EUR) (cat:: food) Café ^e-01HABCDEFGHJKMNPQRSTVWXYZ0
A random comment line
`;
    const parsed = parseExpensesLedger(content);
    expect(parsed.expenses).toHaveLength(1);
    expect(parsed.trailingBody).toContain('# Notes');
    expect(parsed.trailingBody).toContain('A random comment line');
  });
});

describe('isExpenseLine', () => {
  it('detects expense-shaped lines', () => {
    expect(
      isExpenseLine(
        '- 2026-05-04 (id:: exp_01HABCDEFGHJKMNPQRSTVWXYZ0) (amt:: 5.00 USD) (cat:: food) thing ^e-01HABCDEFGHJKMNPQRSTVWXYZ0',
      ),
    ).toBe(true);
    expect(isExpenseLine('- 2026-05-04 just a regular bullet')).toBe(false);
    expect(isExpenseLine('# heading')).toBe(false);
  });
});

describe('serialize round-trip', () => {
  it('serializeExpenseLine -> parseExpenseLine is identity', () => {
    const e = buildExpense();
    const line = serializeExpenseLine(e);
    const { expense } = parseExpenseLine(line, TRIP);
    expect(expense).toEqual(e);
  });

  it('serializeExpensesLedger -> parseExpensesLedger preserves all expenses', () => {
    const expenses = [
      buildExpense({
        id: ExpenseId.parse('exp_01HABCDEFGHJKMNPQRSTVWXYZ0'),
        date: IsoDate.parse('2026-05-04'),
        description: 'Café',
      }),
      buildExpense({
        id: ExpenseId.parse('exp_01HABCDEFGHJKMNPQRSTVWXYZ1'),
        date: IsoDate.parse('2026-05-09'),
        category: 'transport',
        amount: 38,
        description: 'Train',
      }),
    ];
    const content = serializeExpensesLedger({
      tripId: TRIP,
      month: '2026-05',
      expenses,
    });
    const parsed = parseExpensesLedger(content);
    expect(parsed.expenses).toHaveLength(2);
    expect(parsed.expenses[0].description).toBe('Café');
    expect(parsed.expenses[1].description).toBe('Train');
  });

  it('round-trip property on randomized expenses', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            // ULID body is deterministic length and alphabet — generate from
            // a small pool plus a positional suffix to keep ids unique.
            suffix: fc.string({ minLength: 1, maxLength: 4 }).map((s) =>
              s.replace(/[^0-9A-HJKMNP-TV-Z]/g, '0').padEnd(4, '0').toUpperCase(),
            ),
            day: fc.integer({ min: 1, max: 28 }),
            amount: fc.double({ min: 0.01, max: 9_999.99, noNaN: true }),
            category: fc.constantFrom('food', 'transport', 'shopping', 'other'),
            currency: fc.constantFrom('USD', 'EUR', 'JPY', 'GBP'),
            description: fc
              .string({ maxLength: 40 })
              // Description must not contain parens, "::", or block refs.
              .map((s) =>
                s
                  .replace(/[\n\r()^]/g, ' ')
                  .replace(/::/g, '  ')
                  .trim(),
              ),
          }),
          { minLength: 0, maxLength: 8 },
        ),
        (specs) => {
          // Build unique ULID-shaped ids by index.
          const expenses = specs.map((spec, i) =>
            buildExpense({
              id: ExpenseId.parse(
                `exp_${('01HABCDEFGHJKMNPQRSTVWXYZ' + i.toString(36).toUpperCase()).slice(0, 26)}${spec.suffix.slice(0, 0)}`,
              ),
              date: IsoDate.parse(`2026-05-${spec.day.toString().padStart(2, '0')}`),
              amount: Math.round(spec.amount * 100) / 100,
              category: spec.category as Expense['category'],
              currency: Currency.parse(spec.currency),
              description: spec.description,
            }),
          );
          const content = serializeExpensesLedger({
            tripId: TRIP,
            month: '2026-05',
            expenses,
          });
          const reparsed = parseExpensesLedger(content);
          expect(reparsed.expenses).toHaveLength(expenses.length);
          for (const original of expenses) {
            const match = reparsed.expenses.find((e) => e.id === original.id);
            expect(match).toBeDefined();
            expect(match!.amount).toBeCloseTo(original.amount, 6);
            expect(match!.description).toBe(original.description);
            expect(match!.currency).toBe(original.currency);
            expect(match!.category).toBe(original.category);
            expect(match!.date).toBe(original.date);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
