import { z } from 'zod';
import { currency, type Currency } from '@/domain/money';
import { IsoDate } from '@/domain/dates';
import { RatesSnapshot } from './types';

const FALLBACK_BASE = 'https://open.er-api.com/v6/latest';

const FallbackResponse = z.object({
  result: z.literal('success'),
  base_code: z.string(),
  time_last_update_utc: z.string(),
  rates: z.record(z.string(), z.number().finite().positive()),
});

export interface FallbackDeps {
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
}

/**
 * Last-resort provider for currencies Frankfurter doesn't cover (e.g. LAK).
 * Caller composes it with Frankfurter — see `cache.ts`'s refresh helper.
 */
export async function fetchFallbackRates(
  base: Currency,
  deps: FallbackDeps = {},
): Promise<RatesSnapshot> {
  const f = deps.fetch ?? globalThis.fetch;
  const url = `${deps.baseUrl ?? FALLBACK_BASE}/${base}`;
  const res = await f(url);
  if (!res.ok) {
    throw new Error(`fallback: HTTP ${String(res.status)} for ${url}`);
  }
  const parsed = FallbackResponse.parse(await res.json());
  // open.er-api gives an RFC date in `time_last_update_utc`. Normalize to ISO
  // yyyy-mm-dd in UTC so it slots into the same comparison logic as Frankfurter.
  const isoDate = new Date(parsed.time_last_update_utc).toISOString().slice(0, 10);
  // Strip the self-entry (`USD` when base is `USD`) for parity with Frankfurter.
  const { [parsed.base_code]: _self, ...rates } = parsed.rates;
  return RatesSnapshot.parse({
    base: currency(parsed.base_code),
    date: IsoDate.parse(isoDate),
    rates,
    source: 'fallback',
  });
}
