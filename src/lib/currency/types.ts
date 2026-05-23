import { z } from 'zod';
import { IsoDate } from '@/domain/dates';
import { Currency } from '@/domain/money';

/**
 * A snapshot of FX rates expressed against a single `base` currency.
 *
 * `rates[X]` is the multiplicative factor mapping one unit of `base` into X:
 *   amount_in_X = amount_in_base * rates[X]
 *
 * `rates` does NOT include the base itself (Frankfurter's contract).
 * `source` records which provider produced the snapshot so a stale fallback
 * snapshot is identifiable in tests and UI labels.
 */
export const RatesSnapshot = z.object({
  base: Currency,
  date: IsoDate,
  rates: z.record(z.string(), z.number().finite().positive()),
  source: z.enum(['frankfurter', 'fallback']),
});
export type RatesSnapshot = z.infer<typeof RatesSnapshot>;

export interface RateFetcher {
  fetchLatest(base: Currency): Promise<RatesSnapshot>;
}
