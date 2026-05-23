import type { TravelDB } from '@/lib/storage';
import { getKV, setKV } from '@/lib/storage';
import type { Currency } from '@/domain/money';
import { RatesSnapshot } from './types';
import { fetchLatestRates } from './frankfurter';
import { fetchFallbackRates } from './fallback';

/**
 * Read the cached rate snapshot from Dexie (if any). The kv row may have been
 * synced from another device, so re-validate the structural shape rather than
 * trusting it.
 */
export async function readCachedRates(db?: TravelDB): Promise<RatesSnapshot | null> {
  const raw = await getKV('rates_snapshot', db);
  if (raw === null) return null;
  const parsed = RatesSnapshot.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function writeCachedRates(snapshot: RatesSnapshot, db?: TravelDB): Promise<void> {
  await setKV('rates_snapshot', snapshot, db);
}

export interface RefreshDeps {
  /** Today's date in `yyyy-mm-dd` (UTC). Tests inject; production calls today(). */
  today: string;
  fetchPrimary?: typeof fetchLatestRates;
  fetchFallback?: typeof fetchFallbackRates;
  db?: TravelDB;
}

/**
 * Returns a snapshot for `base` no older than `today`. If the cached snapshot
 * is already today's, returns it. Otherwise fetches from Frankfurter; on
 * failure (or unknown base currency), falls back to open.er-api.com. The
 * resulting snapshot is persisted back to Dexie before being returned.
 *
 * Network failures are swallowed only when a stale cached snapshot exists —
 * callers can detect staleness with `isStale()` and label the UI accordingly
 * (per ADR-0008). If neither cache nor fetch succeeds, throws.
 */
export async function refreshRates(base: Currency, deps: RefreshDeps): Promise<RatesSnapshot> {
  const cached = await readCachedRates(deps.db);
  if (cached && cached.base === base && cached.date === deps.today) {
    return cached;
  }
  const primary = deps.fetchPrimary ?? fetchLatestRates;
  const fallback = deps.fetchFallback ?? fetchFallbackRates;
  try {
    const fresh = await primary(base);
    await writeCachedRates(fresh, deps.db);
    return fresh;
  } catch (primaryErr) {
    try {
      const fresh = await fallback(base);
      await writeCachedRates(fresh, deps.db);
      return fresh;
    } catch (fallbackErr) {
      if (cached) return cached;
      const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(
        `refreshRates: no usable rates for ${base} (primary: ${primaryMsg}; fallback: ${fallbackMsg})`,
      );
    }
  }
}
