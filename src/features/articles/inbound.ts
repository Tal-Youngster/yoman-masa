/**
 * Inbound (Drive → Dexie) reconciler for article notes.
 *
 * Single-entity-per-file, in two valid locations per ADR-0010:
 *   - `Trips/<slug>/Articles/<article-slug>.md` — trip-scoped
 *   - `General/Articles/<article-slug>.md`      — cross-trip (trip_id: null)
 */

import type { Article } from '@/domain/article';
import { deleteArticle as deleteArticleRow, upsertArticle } from '@/lib/storage';
import type { InboundReconciler } from '@/sync/pull';

import { tryParseArticle } from './parser';

/** `Trips/<slug>/Articles/<file>.md` — trip slug per the Trip Zod schema. */
const TRIP_ARTICLE_PATH_RE = /^Trips\/[a-z0-9][a-z0-9-]*\/Articles\/[^/]+\.md$/;
/** Cross-trip "General" collection. */
const GENERAL_ARTICLE_PATH_RE = /^General\/Articles\/[^/]+\.md$/;

export const articleInboundReconciler: InboundReconciler<Article> = {
  entityType: 'article',

  matchesPath(relPath) {
    return TRIP_ARTICLE_PATH_RE.test(relPath) || GENERAL_ARTICLE_PATH_RE.test(relPath);
  },

  parseFile(content) {
    // `tryParseArticle` returns null for a file that isn't an article (wrong
    // `type`, broken yaml, a url/title that fails validation). Skipping beats
    // raising the pass's error counter for a stray file in the folder.
    const parsed = tryParseArticle(content);
    return parsed ? [parsed.article] : [];
  },

  entityId(article) {
    return article.id;
  },

  async upsertEntity(article, db) {
    await upsertArticle(article, db);
  },

  async deleteEntity(id, db) {
    await deleteArticleRow(id as Article['id'], db);
  },

  async listEntityIds(db) {
    const keys = await db.articles.toCollection().primaryKeys();
    return keys.filter((k) => typeof k === 'string');
  },
};
