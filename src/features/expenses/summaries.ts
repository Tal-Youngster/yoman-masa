/**
 * Pure summary helpers — no I/O, no Dexie. Caller decides whether to sum in
 * native amounts (when all rows share a currency) or in the home_conversion
 * snapshot (cross-currency). Mixing currencies without a snapshot returns the
 * union as separate buckets.
 */

import type { Expense, ExpenseCategory } from '@/domain/expense';
import type { Currency } from '@/domain/money';

export interface AmountByCurrency {
  /** Map keyed by currency code, e.g. { USD: 120.4, EUR: 12.4 }. */
  totals: Record<string, number>;
}

export interface CategoryBreakdown extends AmountByCurrency {
  category: ExpenseCategory;
  count: number;
}

/** Group expenses by category. Each bucket keeps a per-currency total. */
export function summarizeByCategory(expenses: readonly Expense[]): CategoryBreakdown[] {
  const byCat = new Map<ExpenseCategory, CategoryBreakdown>();
  for (const e of expenses) {
    let row = byCat.get(e.category);
    if (!row) {
      row = { category: e.category, count: 0, totals: {} };
      byCat.set(e.category, row);
    }
    row.count += 1;
    row.totals[e.currency] = (row.totals[e.currency] ?? 0) + e.amount;
  }
  // Sort descending by largest single-currency total — good default for "where
  // is the money going". Stable per category id for ties.
  return Array.from(byCat.values()).sort((a, b) => {
    const aMax = Math.max(...Object.values(a.totals));
    const bMax = Math.max(...Object.values(b.totals));
    if (aMax !== bMax) return bMax - aMax;
    return a.category.localeCompare(b.category);
  });
}

/**
 * Sum home_conversion amounts where present. Returns the total in `home`
 * along with a count of expenses that lacked a snapshot (UI surfaces this
 * as "N missing rates").
 */
export interface HomeTotal {
  home: Currency;
  amount: number;
  missingSnapshots: number;
}

export function totalInHome(expenses: readonly Expense[], home: Currency): HomeTotal {
  let amount = 0;
  let missing = 0;
  for (const e of expenses) {
    if (e.currency === home) {
      amount += e.amount;
      continue;
    }
    const snap = e.home_conversion;
    if (snap && snap.currency === home) {
      amount += snap.amount;
    } else {
      missing += 1;
    }
  }
  return { home, amount, missingSnapshots: missing };
}

export type PeriodGrain = 'week' | 'month' | 'all';

export interface PeriodBucket extends AmountByCurrency {
  /** ISO yyyy-mm-dd for week (start of week) and yyyy-mm for month. 'all' for the all-time bucket. */
  key: string;
  count: number;
}

export function summarizeByPeriod(
  expenses: readonly Expense[],
  grain: PeriodGrain,
): PeriodBucket[] {
  const buckets = new Map<string, PeriodBucket>();
  for (const e of expenses) {
    const key = bucketKey(e.date, grain);
    let row = buckets.get(key);
    if (!row) {
      row = { key, count: 0, totals: {} };
      buckets.set(key, row);
    }
    row.count += 1;
    row.totals[e.currency] = (row.totals[e.currency] ?? 0) + e.amount;
  }
  return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function bucketKey(date: string, grain: PeriodGrain): string {
  switch (grain) {
    case 'month':
      return date.slice(0, 7);
    case 'week':
      return weekStart(date);
    case 'all':
      return 'all';
  }
}

/** Monday-anchored ISO week start, in UTC. */
function weekStart(yyyy_mm_dd: string): string {
  const d = new Date(`${yyyy_mm_dd}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sun, 1 = Mon, ...
  const offset = (dow + 6) % 7; // days back to Monday
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}
