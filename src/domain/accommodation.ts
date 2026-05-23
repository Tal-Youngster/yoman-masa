import { z } from 'zod';
import { AccommodationId, TripId, newAccommodationId } from './ids';
import { IsoDate } from './dates';
import { Money } from './money';

export const AccommodationStatus = z.enum(['booked', 'wishlist', 'cancelled']);
export type AccommodationStatus = z.infer<typeof AccommodationStatus>;

export const AccommodationService = z.enum([
  'airbnb',
  'booking',
  'hostelworld',
  'agoda',
  'direct',
  'other',
]);
export type AccommodationService = z.infer<typeof AccommodationService>;

export const GeoLocation = z.object({
  address: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GeoLocation = z.infer<typeof GeoLocation>;

export const Host = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});
export type Host = z.infer<typeof Host>;

export const Accommodation = z
  .object({
    type: z.literal('accommodation'),
    id: AccommodationId,
    trip_id: TripId,
    status: AccommodationStatus,
    name: z.string().min(1),
    service: AccommodationService,
    service_other_label: z.string().optional(),
    price: z.number().optional(),
    currency: z.string().optional(),
    confirmation: z.string().optional(),
    checkin: IsoDate,
    checkout: IsoDate,
    checkin_time: z.string().optional(),
    checkout_time: z.string().optional(),
    cost: Money.optional(),
    location: GeoLocation.optional(),
    url: z.string().url().optional(),
    host: Host.optional(),
    attachments: z.array(z.string()).default([]),
    notes: z.string().default(''),
  })
  .refine((a) => a.checkin <= a.checkout, {
    message: 'checkin must be ≤ checkout',
    path: ['checkout'],
  })
  .refine((a) => a.service !== 'other' || !!a.service_other_label, {
    message: 'service_other_label is required when service is "other"',
    path: ['service_other_label'],
  });
export type Accommodation = z.infer<typeof Accommodation>;

export type NewAccommodationInput = Omit<z.input<typeof Accommodation>, 'id' | 'type'>;

export function newAccommodation(input: NewAccommodationInput): Accommodation {
  return Accommodation.parse({ type: 'accommodation', id: newAccommodationId(), ...input });
}
