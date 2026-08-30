/**
 * Article Dexie queries.
 *
 * Thin wrappers over `@/lib/storage` so the slice's UI has a local vocabulary
 * (mirrors `features/places/queries.ts`).
 */

import {
  upsertArticle as _upsertArticle,
  getArticle as _getArticle,
  deleteArticle as _deleteArticle,
  articlesByTrip as _articlesByTrip,
  generalArticles as _generalArticles,
} from '@/lib/storage';
import type { TravelDB } from '@/lib/storage';
import type { Article } from '@/domain/article';
import type { ArticleId, TripId } from '@/domain/ids';

/** Backfill defaults for fields added after an article was first persisted. */
function normalizeArticle(a: Article): Article {
  return { ...a, tags: a.tags ?? [], notes: a.notes ?? '', place_id: a.place_id ?? null };
}

export async function upsertArticle(article: Article, db?: TravelDB): Promise<void> {
  return _upsertArticle(article, db);
}

export async function getArticle(id: ArticleId, db?: TravelDB): Promise<Article | undefined> {
  const a = await _getArticle(id, db);
  return a ? normalizeArticle(a) : undefined;
}

export async function deleteArticle(id: ArticleId, db?: TravelDB): Promise<void> {
  return _deleteArticle(id, db);
}

export async function listArticlesByTrip(tripId: TripId, db?: TravelDB): Promise<Article[]> {
  return (await _articlesByTrip(tripId, db)).map(normalizeArticle);
}

export async function listGeneralArticles(db?: TravelDB): Promise<Article[]> {
  return (await _generalArticles(db)).map(normalizeArticle);
}
