import type { Expense, ExpenseCategory } from '@/domain/expense';
import type { Currency } from '@/domain/money';
import { categoryHomeTotals } from '../summaries';

export interface CategoryPieChartProps {
  expenses: readonly Expense[];
  homeCurrency: Currency;
}

/**
 * Stable per-category colors drawn from the app's warm earth-tone palette so a
 * category keeps the same hue across renders (and matches the swatch in the
 * legend). Distinct enough to read side by side on a small mobile screen.
 */
const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  food: '#c25e00',
  transport: '#4f6d7a',
  accommodation: '#8b4513',
  activity: '#d99a4e',
  shopping: '#6b8e6f',
  visa: '#a23b4d',
  gear: '#5c6b8a',
  fees: '#b07a52',
  other: '#9a8c7a',
};

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: 'Food',
  transport: 'Transport',
  accommodation: 'Accommodation',
  activity: 'Activity',
  shopping: 'Shopping',
  visa: 'Visa',
  gear: 'Gear',
  fees: 'Fees',
  other: 'Other',
};

const SIZE = 168;
const STROKE = 30;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Small visual gap between slices, in user units of arc length.
const GAP = 2;

function formatAmount(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CategoryPieChart({
  expenses,
  homeCurrency,
}: CategoryPieChartProps): React.JSX.Element | null {
  const rows = categoryHomeTotals(expenses, homeCurrency).filter((r) => r.amount > 0);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const missing = categoryHomeTotals(expenses, homeCurrency).reduce(
    (sum, r) => sum + r.missingSnapshots,
    0,
  );

  if (total <= 0) {
    return (
      <p className="text-xs text-on-surface-variant">
        No converted totals to chart yet
        {missing > 0 && <span className="text-amber-500"> ({missing} unrated)</span>}.
      </p>
    );
  }

  // Build cumulative arc segments. Start at 12 o'clock by rotating the SVG.
  let offset = 0;
  const segments = rows.map((row) => {
    const fraction = row.amount / total;
    const arc = fraction * CIRCUMFERENCE;
    const seg = {
      category: row.category,
      color: CATEGORY_COLORS[row.category],
      // Trim the dash by the gap so neighboring slices don't touch (but never
      // below zero for a hairline slice).
      dash: Math.max(arc - GAP, 0.0001),
      offset,
      pct: fraction * 100,
      amount: row.amount,
    };
    offset += arc;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label="Expenses by category"
        >
          {/* Track behind the slices for a soft, finished look. */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-surface-container-highest)"
            strokeWidth={STROKE}
          />
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {segments.map((s) => (
              <circle
                key={s.category}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                strokeLinecap="butt"
                strokeDasharray={`${s.dash} ${CIRCUMFERENCE - s.dash}`}
                strokeDashoffset={-s.offset}
              >
                <title>{`${CATEGORY_LABELS[s.category]}: ${formatAmount(s.amount)} ${homeCurrency} (${s.pct.toFixed(0)}%)`}</title>
              </circle>
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-semibold text-on-surface">
            {formatAmount(total)}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-on-surface-variant">
            {homeCurrency}
          </span>
        </div>
      </div>

      <ul className="flex w-full flex-col gap-1.5">
        {segments.map((s) => (
          <li key={s.category} className="flex items-center gap-2 text-xs">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            <span className="text-on-surface">{CATEGORY_LABELS[s.category]}</span>
            <span className="ml-auto tabular-nums text-on-surface-variant">
              {formatAmount(s.amount)} {homeCurrency}
            </span>
            <span className="w-9 shrink-0 text-right tabular-nums text-on-surface-variant">
              {s.pct.toFixed(0)}%
            </span>
          </li>
        ))}
        {missing > 0 && (
          <li className="mt-0.5 text-[11px] text-amber-500">
            {missing} expense{missing === 1 ? '' : 's'} excluded (no converted rate)
          </li>
        )}
      </ul>
    </div>
  );
}
