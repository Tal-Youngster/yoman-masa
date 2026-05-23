import { z } from 'zod';
import { currency, type Currency } from '@/domain/money';
import { IsoDate } from '@/domain/dates';
import { RatesSnapshot } from './types';

const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';

const FrankfurterResponse = z.object({
  amount: z.number(),
  base: z.string(),
  date: z.string(),
  rates: z.record(z.string(), z.number().finite().positive()),
});

export interface FrankfurterDeps {
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
}

async function frankfurterCall(path: string, deps: FrankfurterDeps = {}): Promise<unknown> {
  const f = deps.fetch ?? globalThis.fetch;
  const base = deps.baseUrl ?? FRANKFURTER_BASE;
  const res = await f(`${base}${path}`);
  if (!res.ok) {
    throw new Error(`frankfurter: HTTP ${String(res.status)} for ${path}`);
  }
  return (await res.json()) as unknown;
}

/** Fetch today's ECB-published rates against the given base. */
export async function fetchLatestRates(base: Currency, deps?: FrankfurterDeps): Promise<RatesSnapshot> {
  const raw = await frankfurterCall(`/latest?base=${base}`, deps);
  const parsed = FrankfurterResponse.parse(raw);
  return RatesSnapshot.parse({
    base: currency(parsed.base),
    date: IsoDate.parse(parsed.date),
    rates: parsed.rates,
    source: 'frankfurter',
  });
}

/** Fetch rates for a specific historical date (e.g. for backfilled expenses). */
export async function fetchHistoricalRates(
  base: Currency,
  date: IsoDate,
  deps?: FrankfurterDeps,
): Promise<RatesSnapshot> {
  const raw = await frankfurterCall(`/${date}?base=${base}`, deps);
  const parsed = FrankfurterResponse.parse(raw);
  return RatesSnapshot.parse({
    base: currency(parsed.base),
    date: IsoDate.parse(parsed.date),
    rates: parsed.rates,
    source: 'frankfurter',
  });
}
