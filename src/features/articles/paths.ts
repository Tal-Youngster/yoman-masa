/**
 * Vault path conventions for article notes (ADR-0004 / ADR-0010):
 *
 *   per trip:  <travelFolder>/Trips/<trip-slug>/Articles/<article-slug>.md
 *   General:   <travelFolder>/General/Articles/<article-slug>.md
 *
 * Pass `null` for `tripSlug` to address the cross-trip General collection.
 */

import { slugify } from '@/lib/slug';
import { tripFolderPath } from '@/features/trips/paths';
import type { Article } from '@/domain/article';

/** Slug rules for an article filename. Leading digits are fine here — plenty
 *  of articles are titled "10 things to do in Hanoi". */
export function deriveArticleSlug(title: string): string {
  return slugify(title, { fallback: 'article', maxLength: 64 });
}

/**
 * The filename stem an article's file lives under. Prefers the slug chosen at
 * creation time; falls back to deriving one from the title for notes written
 * by hand in Obsidian (which carry no `slug` key).
 */
export function articleSlug(article: Pick<Article, 'title' | 'slug'>): string {
  return article.slug && article.slug.length > 0
    ? article.slug
    : deriveArticleSlug(article.title);
}

export function articlesFolderPath(travelFolderPath: string, tripSlug: string | null): string {
  if (tripSlug === null) {
    return `${stripTrailingSlash(travelFolderPath)}/General/Articles`;
  }
  return `${tripFolderPath(travelFolderPath, tripSlug)}/Articles`;
}

export function articleFilePath(
  travelFolderPath: string,
  tripSlug: string | null,
  slug: string,
): string {
  return `${articlesFolderPath(travelFolderPath, tripSlug)}/${slug}.md`;
}

function stripTrailingSlash(p: string): string {
  return p.endsWith('/') ? p.slice(0, -1) : p;
}
