import { z } from 'zod';
import { PlaceId, TripId, newPlaceId } from './ids';
import { IsoDate } from './dates';



export const Place = z.object({
  type: z.literal('place'),
  id: PlaceId,
  trip_id: TripId,
  place_id: z.string().min(1),
  place_alias: z.string().optional(),
  category: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  notes: z.string().default(''),
  visited: z.boolean().default(false),
  visited_date: IsoDate.optional(),
});
export type Place = z.infer<typeof Place>;

export type NewPlaceInput = Omit<z.input<typeof Place>, 'id' | 'type'>;

export function newPlace(input: NewPlaceInput): Place {
  return Place.parse({ type: 'place', id: newPlaceId(), ...input });
}
