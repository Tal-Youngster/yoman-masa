import { tripFolderPath } from '@/features/trips/paths';

/** `<travelFolder>/Trips/<slug>/Expenses/<yyyy-mm>.md` (ADR-0004). */
export function expensesLedgerPath(
  travelFolderPath: string,
  tripSlug: string,
  yyyy_mm: string,
): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yyyy_mm)) {
    throw new Error(`expensesLedgerPath: bad month '${yyyy_mm}'`);
  }
  return `${tripFolderPath(travelFolderPath, tripSlug)}/Expenses/${yyyy_mm}.md`;
}

/** Extract the `yyyy-mm` ledger month an expense belongs to from its date. */
export function ledgerMonthForDate(yyyy_mm_dd: string): string {
  return yyyy_mm_dd.slice(0, 7);
}

/** Block reference for an expense line: `^e-<ulid>`. */
export function expenseBlockRef(expenseId: string): string {
  const ulid = expenseId.replace(/^exp_/, '');
  return `e-${ulid}`;
}
