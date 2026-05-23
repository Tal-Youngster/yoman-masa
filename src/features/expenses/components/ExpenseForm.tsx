import { useState, type FormEvent } from 'react';
import { Button, Input } from '@/ui/components';
import type { Currency} from '@/domain/money';
import { currency } from '@/domain/money';
import { IsoDate } from '@/domain/dates';
import { ExpenseCategory } from '@/domain/expense';
import type { Expense } from '@/domain/expense';
import type { Trip } from '@/domain/trip';
import type { ExpensesAdminService, AddExpenseInput } from '../expenses-admin';

export interface ExpenseFormProps {
  trip: Trip;
  admin: ExpensesAdminService;
  /** Pass to edit an existing expense; omit to create. */
  expense?: Expense;
  onSuccess: () => void;
  onCancel: () => void;
}

const CATEGORIES = ExpenseCategory.options;

export function ExpenseForm({
  trip,
  admin,
  expense,
  onSuccess,
  onCancel,
}: ExpenseFormProps): React.JSX.Element {
  const editing = expense !== undefined;
  const [date, setDate] = useState(expense?.date ?? todayIso());
  const [amount, setAmount] = useState<string>(expense ? String(expense.amount) : '');
  const [ccy, setCcy] = useState<string>(expense?.currency ?? trip.home_currency);
  const [category, setCategory] = useState<string>(expense?.category ?? 'food');
  const [description, setDescription] = useState(expense?.description ?? '');
  const [location, setLocation] = useState(expense?.location ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Amount must be a positive number');
      return;
    }
    let parsedDate: IsoDate;
    let parsedCcy: Currency;
    try {
      parsedDate = IsoDate.parse(date);
      parsedCcy = currency(ccy);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid input');
      return;
    }
    const cat = ExpenseCategory.safeParse(category);
    if (!cat.success) {
      setError('Unknown category');
      return;
    }
    setSubmitting(true);
    try {
      const input: AddExpenseInput = {
        trip_id: trip.id,
        date: parsedDate,
        amount: amt,
        currency: parsedCcy,
        category: cat.data,
        description,
        ...(location.trim() ? { location: location.trim() } : {}),
      };
      if (editing && expense) {
        await admin.updateExpense(trip, {
          ...expense,
          date: parsedDate,
          amount: amt,
          currency: parsedCcy,
          category: cat.data,
          description,
          ...(location.trim() ? { location: location.trim() } : {}),
        });
      } else {
        await admin.addExpense(trip, input);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-on-surface-variant">Date</span>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-on-surface-variant">Amount</span>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-on-surface-variant">Currency</span>
          <Input
            type="text"
            value={ccy}
            onChange={(e) => setCcy(e.target.value.toUpperCase())}
            maxLength={3}
            pattern="[A-Z]{3}"
            placeholder="USD"
            required
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-on-surface-variant">Category</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-outline bg-surface px-3 py-2 text-sm text-on-surface"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-on-surface-variant">Description</span>
        <Input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What was this for?"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-on-surface-variant">Location (optional)</span>
        <Input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Lisbon"
        />
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel} variant="ghost">
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : editing ? 'Save' : 'Add expense'}
        </Button>
      </div>
    </form>
  );
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
