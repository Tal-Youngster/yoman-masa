import { z } from 'zod';
import { ulid } from 'ulid';

const ULID_BODY = '[0-9A-HJKMNP-TV-Z]{26}';

const branded = <B extends string>(prefix: string, _brand: B) =>
  z
    .string()
    .regex(new RegExp(`^${prefix}_${ULID_BODY}$`))
    .brand<B>();

export const TripId = branded('trp', 'TripId');
export type TripId = z.infer<typeof TripId>;
export const newTripId = (): TripId => TripId.parse(`trp_${ulid()}`);

export const AccommodationId = branded('acc', 'AccommodationId');
export type AccommodationId = z.infer<typeof AccommodationId>;
export const newAccommodationId = (): AccommodationId => AccommodationId.parse(`acc_${ulid()}`);

export const PlaceId = branded('plc', 'PlaceId');
export type PlaceId = z.infer<typeof PlaceId>;
export const newPlaceId = (): PlaceId => PlaceId.parse(`plc_${ulid()}`);

export const TaskId = branded('tsk', 'TaskId');
export type TaskId = z.infer<typeof TaskId>;
export const newTaskId = (): TaskId => TaskId.parse(`tsk_${ulid()}`);

export const ShoppingItemId = branded('shp', 'ShoppingItemId');
export type ShoppingItemId = z.infer<typeof ShoppingItemId>;
export const newShoppingItemId = (): ShoppingItemId => ShoppingItemId.parse(`shp_${ulid()}`);

export const ArticleId = branded('art', 'ArticleId');
export type ArticleId = z.infer<typeof ArticleId>;
export const newArticleId = (): ArticleId => ArticleId.parse(`art_${ulid()}`);
