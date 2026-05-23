import type { Expense } from '@/domain/expense';
import type { Currency } from '@/domain/money';
import { summarizeByCategory, summarizeByPeriod, totalInHome } from '../summaries';

export interface ExpenseSummariesProps {
  expenses: readonly Expense[];
  homeCurrency: Currency;
}

export function ExpenseSummaries({
  expenses,
  homeCurrency,
}: ExpenseSummariesProps): React.JSX.Element {
  if (expenses.length === 0) return <></>;
  const totalAll = totalInHome(expenses, homeCurrency);
  const byCategory = summarizeByCategory(expenses);
  const byMonth = summarizeByPeriod(expenses, 'month');

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-outline bg-surface-container p-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-on-surface">Summary</h3>
        <div className="text-sm text-on-surface">
          {totalAll.amount.toFixed(2)} {totalAll.home}
          {totalAll.missingSnapshots > 0 && (
            <span className="ml-2 text-xs text-amber-500">
              ({totalAll.missingSnapshots} unrated)
            </span>
          )}
        </div>
      </header>

      <div>
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-on-surface-variant">
          By category
        </h4>
        <ul className="flex flex-col gap-1 text-xs">
          {byCategory.map((row) => (
            <li key={row.category} className="flex items-baseline justify-between">
              <span className="text-on-surface">{row.category}</span>
              <span className="text-on-surface-variant">
                {Object.entries(row.totals)
                  .map(([ccy, amt]) => `${amt.toFixed(2)} ${ccy}`)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-on-surface-variant">
          By month
        </h4>
        <ul className="flex flex-col gap-1 text-xs">
          {byMonth.map((row) => (
            <li key={row.key} className="flex items-baseline justify-between">
              <span className="text-on-surface">{row.key}</span>
              <span className="text-on-surface-variant">
                {Object.entries(row.totals)
                  .map(([ccy, amt]) => `${amt.toFixed(2)} ${ccy}`)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
