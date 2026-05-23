import { describe, it, expect, vi } from 'vitest';
import { currency } from '@/domain/money';
import { fetchLatestRates, fetchHistoricalRates } from './frankfurter';

function mockFetch(body: unknown, init: { status?: number } = {}) {
  return vi.fn(() =>
    Promise.resolve({
      ok: (init.status ?? 200) < 400,
      status: init.status ?? 200,
      json: () => Promise.resolve(body),
    } as unknown as Response),
  );
}

describe('fetchLatestRates', () => {
  it('parses the Frankfurter latest envelope', async () => {
    const f = mockFetch({
      amount: 1,
      base: 'USD',
      date: '2026-05-22',
      rates: { EUR: 0.92, JPY: 156.4 },
    });
    const snap = await fetchLatestRates(currency('USD'), { fetch: f });
    expect(snap.base).toBe(currency('USD'));
    expect(snap.date).toBe('2026-05-22');
    expect(snap.rates.EUR).toBe(0.92);
    expect(snap.source).toBe('frankfurter');
    expect(f).toHaveBeenCalledWith(expect.stringContaining('/latest?base=USD'));
  });

  it('throws on non-2xx', async () => {
    const f = mockFetch({}, { status: 500 });
    await expect(fetchLatestRates(currency('USD'), { fetch: f })).rejects.toThrow(/HTTP 500/);
  });
});

describe('fetchHistoricalRates', () => {
  it('queries the dated endpoint', async () => {
    const f = mockFetch({
      amount: 1,
      base: 'EUR',
      date: '2026-04-01',
      rates: { USD: 1.08 },
    });
    const snap = await fetchHistoricalRates(currency('EUR'), '2026-04-01' as never, { fetch: f });
    expect(snap.base).toBe(currency('EUR'));
    expect(snap.date).toBe('2026-04-01');
    expect(f).toHaveBeenCalledWith(expect.stringContaining('/2026-04-01?base=EUR'));
  });
});
