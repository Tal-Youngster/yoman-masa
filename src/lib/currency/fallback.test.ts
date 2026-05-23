import { describe, it, expect, vi } from 'vitest';
import { currency } from '@/domain/money';
import { fetchFallbackRates } from './fallback';

const ENVELOPE = {
  result: 'success' as const,
  base_code: 'USD',
  time_last_update_utc: 'Fri, 22 May 2026 00:00:01 +0000',
  rates: { USD: 1, EUR: 0.92, LAK: 21_500 },
};

describe('fetchFallbackRates', () => {
  it('parses the open.er-api envelope and strips the self-entry', async () => {
    const f = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(ENVELOPE),
      } as unknown as Response),
    );
    const snap = await fetchFallbackRates(currency('USD'), { fetch: f });
    expect(snap.base).toBe(currency('USD'));
    expect(snap.date).toBe('2026-05-22');
    expect(snap.source).toBe('fallback');
    expect(snap.rates.USD).toBeUndefined();
    expect(snap.rates.EUR).toBe(0.92);
    expect(snap.rates.LAK).toBe(21_500);
  });

  it('throws on HTTP error', async () => {
    const f = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      } as unknown as Response),
    );
    await expect(fetchFallbackRates(currency('USD'), { fetch: f })).rejects.toThrow(/HTTP 503/);
  });
});
