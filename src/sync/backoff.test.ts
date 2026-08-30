import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { backoffMs, MAX_ATTEMPTS } from './backoff.js';

describe('backoffMs', () => {
  it('doubles from 1s and caps at 60s', () => {
    expect(backoffMs(0)).toBe(1_000);
    expect(backoffMs(1)).toBe(2_000);
    expect(backoffMs(2)).toBe(4_000);
    expect(backoffMs(3)).toBe(8_000);
    expect(backoffMs(4)).toBe(16_000);
    expect(backoffMs(10)).toBe(60_000);
  });

  it('never returns a non-positive delay', () => {
    // A zero or negative delay would turn a retry loop into a busy loop, which
    // is the failure mode this whole module exists to prevent. Large attempt
    // counts must saturate at the ceiling rather than overflow.
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 100_000 }), (attempts) => {
        const delay = backoffMs(attempts);
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThanOrEqual(60_000);
      }),
    );
  });

  it('is monotonically non-decreasing in attempts', () => {
    fc.assert(
      fc.property(fc.nat({ max: 64 }), (n) => {
        expect(backoffMs(n + 1)).toBeGreaterThanOrEqual(backoffMs(n));
      }),
    );
  });

  it('keeps the whole retry budget under a minute of cumulative delay', () => {
    // Sanity check on the pairing of the curve and the cap: a poison write
    // should retire promptly, not linger for an hour of doubling.
    let total = 0;
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) total += backoffMs(i);
    expect(total).toBeLessThan(60_000);
  });
});
