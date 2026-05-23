import type { Expense } from '@/domain/expense';
import type { RatesSnapshot } from '@/lib/currency';
import { isStale } from '@/lib/currency';

export interface ExpensesListProps {
  expenses: readonly Expense[];
  /** Today's date, used to decide whether to label conversions as stale. */
  today: string;
  /** Most recent cached snapshot — used only for the stale label. */
  ratesSnapshot?: RatesSnapshot;
  onEdit?: (e: Expense) => void;
  onDelete?: (e: Expense) => void;
}

export function ExpensesList({
  expenses,
  today,
  ratesSnapshot,
  onEdit,
  onDelete,
}: ExpensesListProps): React.JSX.Element {
  if (expenses.length === 0) {
    return (
      <p className="text-sm text-on-surface-variant">
        No expenses yet. Add one with the + button.
      </p>
    );
  }

  const ratesStale = ratesSnapshot ? isStale(ratesSnapshot, today) : false;

  return (
    <ul className="flex flex-col gap-2">
      {expenses.map((e) => (
        <li
          key={e.id}
          className="flex items-center gap-3 rounded-lg border border-outline bg-surface-container p-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-on-surface">
                {formatAmount(e.amount, e.currency)}
              </span>
              <span className="text-xs text-on-surface-variant">{e.date}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-on-surface-variant">
              <span className="rounded bg-surface px-2 py-0.5">{e.category}</span>
              {e.description && <span className="truncate">{e.description}</span>}
            </div>
            {e.home_conversion && (
              <div className="mt-1 text-[11px] text-on-surface-variant">
                ≈ {formatAmount(e.home_conversion.amount, e.home_conversion.currency)}{' '}
                {ratesStale && <span className="text-amber-500">(rate {e.home_conversion.rate_date})</span>}
              </div>
            )}
          </div>
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(e)}
              className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface hover:text-on-surface"
              aria-label={`Edit expense ${e.description || e.id}`}
            >
              ✎
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(e)}
              className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface hover:text-red-500"
              aria-label={`Delete expense ${e.description || e.id}`}
            >
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function formatAmount(amount: number, ccy: string): string {
  // Round to 2 dp, preserve trailing zeros. Currency printed after for parity
  // with the ledger format.
  return `${(Math.round(amount * 100) / 100).toFixed(2)} ${ccy}`;
}
