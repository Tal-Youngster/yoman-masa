import { z } from 'zod';
import { ExpenseId, TripId, newExpenseId } from './ids';
import { IsoDate } from './dates';
import { Currency, ConversionSnapshot } from './money';

export const ExpenseCategory = z.enum([
  'food',
  'transport',
  'accommodation',
  'activity',
  'shopping',
  'visa',
  'gear',
  'fees',
  'other',
]);
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;

export const Expense = z.object({
  type: z.literal('expense'),
  id: ExpenseId,
  trip_id: TripId,
  date: IsoDate,
  amount: z.number().finite().positive(),
  currency: Currency,
  category: ExpenseCategory,
  description: z.string().default(''),
  location: z.string().optional(),
  home_conversion: ConversionSnapshot.optional(),
});
export type Expense = z.infer<typeof Expense>;

export type NewExpenseInput = Omit<z.input<typeof Expense>, 'id' | 'type'>;

export function newExpense(input: NewExpenseInput): Expense {
  return Expense.parse({ type: 'expense', id: newExpenseId(), ...input });
}
