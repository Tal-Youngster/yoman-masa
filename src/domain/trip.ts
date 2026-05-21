import { z } from 'zod';
import { TripId, newTripId } from './ids';
import { IsoDate } from './dates';
import { Currency } from './money';

export const TripStatus = z.enum(['planned', 'active', 'completed', 'archived']);
export type TripStatus = z.infer<typeof TripStatus>;

export const Trip = z
  .object({
    type: z.literal('trip'),
    id: TripId,
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'kebab-case, starts alphanumeric'),
    name: z.string().min(1),
    start_date: IsoDate,
    end_date: IsoDate,
    home_currency: Currency,
    status: TripStatus,
    notes: z.string().default(''),
  })
  .refine((t) => t.start_date <= t.end_date, {
    message: 'start_date must be ≤ end_date',
    path: ['end_date'],
  });
export type Trip = z.infer<typeof Trip>;

export type NewTripInput = Omit<z.input<typeof Trip>, 'id' | 'type'>;

export function newTrip(input: NewTripInput): Trip {
  return Trip.parse({ type: 'trip', id: newTripId(), ...input });
}
