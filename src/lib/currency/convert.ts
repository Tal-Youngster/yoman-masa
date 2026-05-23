import { currency, type Currency, type ConversionSnapshot } from '@/domain/money';
import type { RatesSnapshot } from './types';

export interface ConvertInput {
  amount: number;
  from: Currency;
  to: Currency;
  snapshot: RatesSnapshot;
}

/**
 * Convert a native amount into the target currency using a snapshot.
 *
 * Returns `null` when the snapshot can't bridge `from → to`. The caller
 * decides whether to persist the expense without a home_conversion or to
 * surface a "no rate" warning.
 *
 * The math works in two steps so callers can reuse a snapshot in either
 * direction: native → base → target.
 */
export function convert({ amount, from, to, snapshot }: ConvertInput): ConversionSnapshot | null {
  if (from === to) {
    return {
      amount,
      currency: to,
      rate: 1,
      rate_date: snapshot.date,
    };
  }
  const base = snapshot.base;
  const fromRate = from === base ? 1 : snapshot.rates[from];
  const toRate = to === base ? 1 : snapshot.rates[to];
  if (fromRate === undefined || toRate === undefined) return null;
  // amount_in_base = amount / fromRate; amount_in_to = amount_in_base * toRate.
  const rate = toRate / fromRate;
  return {
    amount: amount * rate,
    currency: currency(to),
    rate,
    rate_date: snapshot.date,
  };
}

/**
 * A snapshot is "stale" when its date is older than today by more than one day.
 * UI uses this to label conversions as estimated (per ADR-0008).
 */
export function isStale(snapshot: RatesSnapshot, today: string): boolean {
  // String compare is safe — both are zero-padded ISO yyyy-mm-dd.
  return snapshot.date < addDays(today, -1);
}

function addDays(yyyy_mm_dd: string, days: number): string {
  const d = new Date(`${yyyy_mm_dd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
