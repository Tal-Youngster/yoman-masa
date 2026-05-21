import { z } from 'zod';
import { IsoDate } from './dates';

export const Currency = z
  .string()
  .regex(/^[A-Z]{3}$/, 'ISO 4217 currency code expected (e.g. USD)')
  .brand<'Currency'>();
export type Currency = z.infer<typeof Currency>;

export const currency = (code: string): Currency => Currency.parse(code.toUpperCase());

export const Money = z.object({
  amount: z.number().finite(),
  currency: Currency,
});
export type Money = z.infer<typeof Money>;

/** Snapshot of a conversion at entry time. See ADR-0008. */
export const ConversionSnapshot = z.object({
  amount: z.number().finite(),
  currency: Currency,
  rate: z.number().finite().positive(),
  rate_date: IsoDate,
});
export type ConversionSnapshot = z.infer<typeof ConversionSnapshot>;
