import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { currency } from '@/domain/money';
import { IsoDate } from '@/domain/dates';
import { convert, isStale } from './convert';
import { RatesSnapshot } from './types';

const USD = currency('USD');
const EUR = currency('EUR');
const JPY = currency('JPY');
const GBP = currency('GBP');

const snap = (overrides: Partial<RatesSnapshot> = {}): RatesSnapshot =>
  RatesSnapshot.parse({
    base: USD,
    date: IsoDate.parse('2026-05-22'),
    rates: { EUR: 0.92, JPY: 156.4, GBP: 0.79 },
    source: 'frankfurter',
    ...overrides,
  });

describe('convert', () => {
  it('returns identity when from === to', () => {
    const out = convert({ amount: 42, from: EUR, to: EUR, snapshot: snap() });
    expect(out).toEqual({
      amount: 42,
      currency: EUR,
      rate: 1,
      rate_date: '2026-05-22',
    });
  });

  it('converts native -> base via the inverse rate', () => {
    const out = convert({ amount: 100, from: EUR, to: USD, snapshot: snap() });
    expect(out?.rate).toBeCloseTo(1 / 0.92, 8);
    expect(out?.amount).toBeCloseTo(100 / 0.92, 6);
    expect(out?.currency).toBe(USD);
  });

  it('converts base -> non-base directly', () => {
    const out = convert({ amount: 100, from: USD, to: JPY, snapshot: snap() });
    expect(out?.rate).toBe(156.4);
    expect(out?.amount).toBeCloseTo(15_640, 6);
  });

  it('converts non-base -> non-base via the base', () => {
    const out = convert({ amount: 1000, from: JPY, to: EUR, snapshot: snap() });
    expect(out?.rate).toBeCloseTo(0.92 / 156.4, 10);
    expect(out?.amount).toBeCloseTo(1000 * (0.92 / 156.4), 6);
  });

  it('returns null when the snapshot lacks a needed currency', () => {
    const out = convert({ amount: 1, from: currency('LAK'), to: USD, snapshot: snap() });
    expect(out).toBeNull();
  });

  it('round-trip property: USD -> X -> USD recovers within fp tolerance', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(EUR, JPY, GBP),
        fc.double({ min: 0.01, max: 1_000_000, noNaN: true }),
        (target, amount) => {
          const s = snap();
          const forward = convert({ amount, from: USD, to: target, snapshot: s });
          expect(forward).not.toBeNull();
          const back = convert({
            amount: forward!.amount,
            from: target,
            to: USD,
            snapshot: s,
          });
          expect(back).not.toBeNull();
          expect(back!.amount).toBeCloseTo(amount, 6);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('isStale', () => {
  it('returns false for today and yesterday', () => {
    expect(isStale(snap({ date: IsoDate.parse('2026-05-22') }), '2026-05-22')).toBe(false);
    expect(isStale(snap({ date: IsoDate.parse('2026-05-21') }), '2026-05-22')).toBe(false);
  });

  it('returns true beyond yesterday', () => {
    expect(isStale(snap({ date: IsoDate.parse('2026-05-20') }), '2026-05-22')).toBe(true);
    expect(isStale(snap({ date: IsoDate.parse('2026-04-01') }), '2026-05-22')).toBe(true);
  });
});
