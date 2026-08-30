/**
 * Pure list filtering for the Articles route — kept out of the component so
 * search/tag semantics are unit-testable.
 */

import type { Article } from '@/domain/article';

export interface ArticleFilter {
  /** Free text matched against the title, the tags and the url host. */
  query?: string;
  /** Every tag here must be present on the article (AND, not OR). */
  tags?: readonly string[];
}

/** Host of a url, or '' when it isn't parseable. Also used by the list rows. */
export function urlHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function filterArticles(
  articles: readonly Article[],
  filter: ArticleFilter = {},
): Article[] {
  const q = filter.query?.trim().toLowerCase() ?? '';
  const required = filter.tags ?? [];

  return articles.filter((a) => {
    if (required.length > 0 && !required.every((t) => a.tags.includes(t))) return false;
    if (q === '') return true;
    return (
      a.title.toLowerCase().includes(q) ||
      urlHost(a.url).toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q))
    );
  });
}

/** Every tag across the given articles, de-duplicated, alphabetically sorted. */
export function collectTags(articles: readonly Article[]): string[] {
  const seen = new Set<string>();
  for (const a of articles) for (const t of a.tags) seen.add(t);
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** Title first, case-insensitive — the list's stable display order. */
export function sortArticles(articles: readonly Article[]): Article[] {
  return [...articles].sort((a, b) => a.title.localeCompare(b.title));
}
