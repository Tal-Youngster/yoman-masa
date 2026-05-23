import { describe, it, expect } from 'vitest';
import { TripId, ExpenseId } from '@/domain/ids';
import { Currency } from '@/domain/money';
import { IsoDate } from '@/domain/dates';
import { Expense, ExpenseCategory } from '@/domain/expense';
import { summarizeByCategory, summarizeByPeriod, totalInHome } from './summaries';

const TRIP = TripId.parse('trp_01HABCDEFGHJKMNPQRSTVWXYZ0');
const USD = Currency.parse('USD');

// Crockford base32 alphabet used by ULID (no I, L, O, U).
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let __idCounter = 0;
function nextExpenseId() {
  const n = __idCounter++;
  let suffix = '';
  let x = n;
  for (let i = 0; i < 4; i++) {
    suffix = ULID_ALPHABET[x & 31] + suffix;
    x = Math.floor(x / 32);
  }
  return ExpenseId.parse(`exp_01HABCDEFGHJKMNPQRSTVW${suffix}`);
}

interface ExpSeed {
  date: string;
  amount: number;
  currency: string;
  category: string;
  description?: string;
  home_conversion?: Expense['home_conversion'];
}

function exp(partial: ExpSeed): Expense {
  return Expense.parse({
    type: 'expense',
    id: nextExpenseId(),
    trip_id: TRIP,
    date: IsoDate.parse(partial.date),
    amount: partial.amount,
    currency: Currency.parse(partial.currency),
    category: ExpenseCategory.parse(partial.category),
    description: partial.description ?? '',
    ...(partial.home_conversion ? { home_conversion: partial.home_conversion } : {}),
  });
}

describe('summarizeByCategory', () => {
  it('groups by category and keeps per-currency totals', () => {
    const out = summarizeByCategory([
      exp({ date: '2026-05-01', amount: 10, currency: 'USD', category: 'food' }),
      exp({ date: '2026-05-02', amount: 5, currency: 'USD', category: 'food' }),
      exp({ date: '2026-05-03', amount: 7, currency: 'EUR', category: 'transport' }),
    ]);
    const food = out.find((r) => r.category === 'food')!;
    expect(food.totals.USD).toBe(15);
    expect(food.count).toBe(2);
    const transport = out.find((r) => r.category === 'transport')!;
    expect(transport.totals.EUR).toBe(7);
  });
});

describe('totalInHome', () => {
  it('sums same-currency expenses directly', () => {
    const out = totalInHome(
      [
        exp({ date: '2026-05-01', amount: 10, currency: 'USD', category: 'food' }),
        exp({ date: '2026-05-02', amount: 5, currency: 'USD', category: 'food' }),
      ],
      USD,
    );
    expect(out.amount).toBe(15);
    expect(out.missingSnapshots).toBe(0);
  });

  it('uses home_conversion snapshots and reports missing', () => {
    const out = totalInHome(
      [
        exp({ date: '2026-05-01', amount: 10, currency: 'USD', category: 'food' }),
        exp({
          date: '2026-05-02',
          amount: 10,
          currency: 'EUR',
          category: 'food',
          home_conversion: { amount: 11, currency: USD, rate: 1.1, rate_date: IsoDate.parse('2026-05-02') },
        }),
        exp({ date: '2026-05-03', amount: 100, currency: 'JPY', category: 'food' }), // no snapshot
      ],
      USD,
    );
    expect(out.amount).toBe(21);
    expect(out.missingSnapshots).toBe(1);
  });
});

describe('summarizeByPeriod', () => {
  it('buckets by month', () => {
    const buckets = summarizeByPeriod(
      [
        exp({ date: '2026-04-30', amount: 1, currency: 'USD', category: 'food' }),
        exp({ date: '2026-05-01', amount: 2, currency: 'USD', category: 'food' }),
        exp({ date: '2026-05-31', amount: 4, currency: 'USD', category: 'food' }),
      ],
      'month',
    );
    expect(buckets).toHaveLength(2);
    expect(buckets[0].key).toBe('2026-04');
    expect(buckets[0].totals.USD).toBe(1);
    expect(buckets[1].key).toBe('2026-05');
    expect(buckets[1].totals.USD).toBe(6);
  });

  it('buckets by week with Monday anchor', () => {
    // 2026-05-04 is a Monday. 2026-05-08 is the following Friday.
    const buckets = summarizeByPeriod(
      [
        exp({ date: '2026-05-04', amount: 1, currency: 'USD', category: 'food' }),
        exp({ date: '2026-05-08', amount: 2, currency: 'USD', category: 'food' }),
        exp({ date: '2026-05-11', amount: 4, currency: 'USD', category: 'food' }), // next week
      ],
      'week',
    );
    expect(buckets).toHaveLength(2);
    expect(buckets[0].key).toBe('2026-05-04');
    expect(buckets[0].totals.USD).toBe(3);
    expect(buckets[1].key).toBe('2026-05-11');
    expect(buckets[1].totals.USD).toBe(4);
  });

  it('all-time produces one bucket', () => {
    const buckets = summarizeByPeriod(
      [
        exp({ date: '2026-01-01', amount: 1, currency: 'USD', category: 'food' }),
        exp({ date: '2026-12-31', amount: 2, currency: 'USD', category: 'food' }),
      ],
      'all',
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0].key).toBe('all');
    expect(buckets[0].totals.USD).toBe(3);
  });
});
