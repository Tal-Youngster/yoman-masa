import { z } from 'zod';
import { ArticleId, PlaceId, TripId, newArticleId } from './ids';

export const Article = z.object({
  type: z.literal('article'),
  id: ArticleId,
  trip_id: TripId.nullable(),
  url: z.string().url(),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  place_id: PlaceId.nullable().default(null),
  notes: z.string().default(''),
});
export type Article = z.infer<typeof Article>;

export type NewArticleInput = Omit<z.input<typeof Article>, 'id' | 'type'>;

export function newArticle(input: NewArticleInput): Article {
  return Article.parse({ type: 'article', id: newArticleId(), ...input });
}
