import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/lib/storage/test-helpers';
import { currency } from '@/domain/money';
import { IsoDate } from '@/domain/dates';
import { RatesSnapshot } from './types';
import { readCachedRates, writeCachedRates, refreshRates } from './cache';

const USD = currency('USD');

const snap = (overrides: Partial<RatesSnapshot> = {}): RatesSnapshot =>
  RatesSnapshot.parse({
    base: USD,
    date: IsoDate.parse('2026-05-22'),
    rates: { EUR: 0.92, JPY: 156.4 },
    source: 'frankfurter',
    ...overrides,
  });

describe('cache read/write', () => {
  it('round-trips a snapshot through Dexie', async () => {
    const db = makeTestDb('rates-rw');
    expect(await readCachedRates(db)).toBeNull();
    await writeCachedRates(snap(), db);
    const got = await readCachedRates(db);
    expect(got).toEqual(snap());
  });

  it('returns null when the stored row fails validation', async () => {
    const db = makeTestDb('rates-bad');
    // Directly write a malformed row to simulate a corrupted Dexie cache.
    await db.kv.put({ key: 'rates_snapshot', value: { junk: true } as never });
    expect(await readCachedRates(db)).toBeNull();
  });
});

describe('refreshRates', () => {
  it('returns the cached snapshot when it matches today', async () => {
    const db = makeTestDb('rates-cache-hit');
    await writeCachedRates(snap({ date: IsoDate.parse('2026-05-22') }), db);
    const out = await refreshRates(USD, {
      today: '2026-05-22',
      db,
      fetchPrimary: () => Promise.reject(new Error('should not call')),
    });
    expect(out.date).toBe('2026-05-22');
  });

  it('fetches when cache is stale and persists the new snapshot', async () => {
    const db = makeTestDb('rates-stale');
    await writeCachedRates(snap({ date: IsoDate.parse('2026-05-20') }), db);
    const fresh = snap({ date: IsoDate.parse('2026-05-22'), rates: { EUR: 0.93 } });
    const out = await refreshRates(USD, {
      today: '2026-05-22',
      db,
      fetchPrimary: () => Promise.resolve(fresh),
    });
    expect(out.rates.EUR).toBe(0.93);
    const persisted = await readCachedRates(db);
    expect(persisted?.rates.EUR).toBe(0.93);
  });

  it('falls back to open.er-api when primary fails', async () => {
    const db = makeTestDb('rates-fallback');
    const fb = snap({ source: 'fallback', rates: { LAK: 21_500 } });
    const out = await refreshRates(USD, {
      today: '2026-05-22',
      db,
      fetchPrimary: () => Promise.reject(new Error('frankfurter down')),
      fetchFallback: () => Promise.resolve(fb),
    });
    expect(out.source).toBe('fallback');
    expect(out.rates.LAK).toBe(21_500);
  });

  it('returns the stale cache when both fetches fail', async () => {
    const db = makeTestDb('rates-degraded');
    await writeCachedRates(snap({ date: IsoDate.parse('2026-05-19') }), db);
    const out = await refreshRates(USD, {
      today: '2026-05-22',
      db,
      fetchPrimary: () => Promise.reject(new Error('p')),
      fetchFallback: () => Promise.reject(new Error('f')),
    });
    expect(out.date).toBe('2026-05-19');
  });

  it('throws when no cache exists AND both fetches fail', async () => {
    const db = makeTestDb('rates-disaster');
    await expect(
      refreshRates(USD, {
        today: '2026-05-22',
        db,
        fetchPrimary: () => Promise.reject(new Error('p')),
        fetchFallback: () => Promise.reject(new Error('f')),
      }),
    ).rejects.toThrow(/no usable rates/);
  });
});
