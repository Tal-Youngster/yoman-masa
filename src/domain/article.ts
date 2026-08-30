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
  /**
   * Filename stem of the article's vault file, chosen once at creation.
   * Persisted so renaming the title doesn't orphan the file on Drive.
   * Optional: notes hand-written in Obsidian won't carry it, and readers fall
   * back to deriving it from the title (`articleSlug` in the articles slice).
   */
  slug: z.string().optional(),
  /** The markdown body below the frontmatter — never serialized as a key. */
  notes: z.string().default(''),
});
export type Article = z.infer<typeof Article>;

export type NewArticleInput = Omit<z.input<typeof Article>, 'id' | 'type'>;

export function newArticle(input: NewArticleInput): Article {
  return Article.parse({ type: 'article', id: newArticleId(), ...input });
}
