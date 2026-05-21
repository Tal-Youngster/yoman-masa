import { z } from 'zod';
import { PlaceId, TripId, newPlaceId } from './ids';
import { IsoDate } from './dates';

export const PlacePriority = z.number().int().min(0).max(5);
export type PlacePriority = z.infer<typeof PlacePriority>;

export const Place = z.object({
  type: z.literal('place'),
  id: PlaceId,
  trip_id: TripId,
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  category: z.string().optional(),
  notes: z.string().default(''),
  priority: PlacePriority.default(0),
  visited: z.boolean().default(false),
  visited_date: IsoDate.optional(),
});
export type Place = z.infer<typeof Place>;

export type NewPlaceInput = Omit<z.input<typeof Place>, 'id' | 'type'>;

export function newPlace(input: NewPlaceInput): Place {
  return Place.parse({ type: 'place', id: newPlaceId(), ...input });
}
