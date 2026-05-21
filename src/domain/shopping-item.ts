import { z } from 'zod';
import { ShoppingItemId, TripId, newShoppingItemId } from './ids';
import { IsoDate } from './dates';
import { Money } from './money';

export const ShoppingItem = z.object({
  type: z.literal('shopping_item'),
  id: ShoppingItemId,
  trip_id: TripId.nullable(),
  name: z.string().min(1),
  bought: z.boolean(),
  quantity: z.number().int().positive().optional(),
  estimated_cost: Money.optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  bought_date: IsoDate.optional(),
  unknown_tokens: z.array(z.string()).default([]),
});
export type ShoppingItem = z.infer<typeof ShoppingItem>;

export type NewShoppingItemInput = Omit<z.input<typeof ShoppingItem>, 'id' | 'type'>;

export function newShoppingItem(input: NewShoppingItemInput): ShoppingItem {
  return ShoppingItem.parse({ type: 'shopping_item', id: newShoppingItemId(), ...input });
}
