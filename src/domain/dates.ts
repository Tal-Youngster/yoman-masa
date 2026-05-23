import { z } from 'zod';

const ISO_DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const IsoDate = z
  .string()
  .regex(ISO_DATE_RE, 'Expected YYYY-MM-DD')
  .refine(
    (s) => {
      const [y, m, d] = s.split('-').map(Number) as [number, number, number];
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    },
    { message: 'Not a valid calendar date' },
  )
  .brand<'IsoDate'>();
export type IsoDate = z.infer<typeof IsoDate>;

export const isoDate = (s: string): IsoDate => IsoDate.parse(s);

const parts = (d: IsoDate): [number, number, number] =>
  d.split('-').map(Number) as [number, number, number];

const fromParts = (y: number, m: number, d: number): IsoDate => {
  const yyyy = String(y).padStart(4, '0');
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return isoDate(`${yyyy}-${mm}-${dd}`);
};

export function todayIso(now: Date = new Date()): IsoDate {
  return fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function isValidIsoDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str);
  return !isNaN(d.getTime()) && str === d.toISOString().split('T')[0];
}

export function getDatesBetween(startIso: string, endIso: string): IsoDate[] {
  const dates: IsoDate[] = [];
  let current = new Date(startIso);
  const end = new Date(endIso);
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0] as IsoDate);
    current = new Date(current.getTime() + 86400000);
  }
  return dates;
}

export function addDays(date: IsoDate, n: number): IsoDate {
  const [y, m, d] = parts(date);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function compareDates(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Days from `a` to `b` (b − a). Positive when `b` is later. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  const aMs = Date.UTC(ay, am - 1, ad);
  const bMs = Date.UTC(by, bm - 1, bd);
  return Math.round((bMs - aMs) / 86_400_000);
}

/** Half-open: yields every date in [start, end). Empty if start ≥ end. */
export function* eachDayInRange(start: IsoDate, end: IsoDate): Generator<IsoDate> {
  let cur = start;
  while (cur < end) {
    yield cur;
    cur = addDays(cur, 1);
  }
}

export function dateRangeArray(start: IsoDate, end: IsoDate): IsoDate[] {
  return [...eachDayInRange(start, end)];
}
