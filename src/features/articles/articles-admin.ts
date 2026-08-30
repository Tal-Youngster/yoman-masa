/**
 * Wiring between the articles UI and the persistence + sync layers.
 *
 * Each mutation:
 *  1. Upserts the article in Dexie (the UI reads from Dexie, so this is instant).
 *  2. Enqueues a whole-file write against the article's own vault file.
 *
 * A "scope" is either a trip (`Trips/<slug>/Articles/`) or `null`/`null` for the
 * cross-trip General collection. Like the other slices we enqueue with
 * `fileId`/`baseRevision` null and let the worker resolve the file by path and
 * reconcile on conflict.
 *
 * The file's *stem* is fixed at creation (`Article.slug`) so retitling an
 * article keeps writing to the same file instead of orphaning the old one.
 */

import { ulid } from 'ulid';
import { z } from 'zod';

import { Article, newArticle } from '@/domain/article';
import type { TripId } from '@/domain/ids';
import type { TravelDB } from '@/lib/storage';
import type { WriteQueue } from '@/sync/queue';

import { articleFilePath, articleSlug, deriveArticleSlug } from './paths';
import { listArticlesByTrip, listGeneralArticles, deleteArticle, upsertArticle } from './queries';
import type { ArticlePayload } from './reconciler';

/** Identifies which `Articles/` folder a mutation targets. `null` = General. */
export interface ArticleScope {
  tripId: TripId | null;
  slug: string | null;
}

const AddInput = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  place_id: z.string().nullable().default(null),
  notes: z.string().default(''),
});
export type AddArticleInput = z.input<typeof AddInput>;

export interface ArticlesAdminDeps {
  db?: TravelDB;
  writeQueue: WriteQueue;
  /** Vault path of the Travel folder, used to resolve the article's path. */
  travelFolderPath: string;
  /**
   * Random suffix used when a slug is already taken in the scope. Injected so
   * the collision path is deterministic under test.
   */
  randomSuffix?: () => string;
}

export interface ArticlesAdminService {
  addArticle(scope: ArticleScope, input: AddArticleInput): Promise<Article>;
  updateArticle(scope: ArticleScope, article: Article): Promise<void>;
  /**
   * Forget the article locally. The vault file is left alone — the write queue
   * has no delete op for vault files (see `sync/queue/worker.ts`) and Obsidian
   * owns the user's notes. A full inbound pull will re-import it while the file
   * is still on Drive, so the UI says as much before confirming.
   */
  removeArticle(article: Article): Promise<void>;
  listByScope(scope: ArticleScope): Promise<Article[]>;
}

/** 4 chars of a fresh ULID's random tail — short, lowercase, filename-safe. */
function defaultRandomSuffix(): string {
  return ulid().slice(-4).toLowerCase();
}

export function createArticlesAdmin(deps: ArticlesAdminDeps): ArticlesAdminService {
  const randomSuffix = deps.randomSuffix ?? defaultRandomSuffix;

  async function enqueue(
    scope: ArticleScope,
    article: Article,
    op: 'create' | 'update',
  ): Promise<void> {
    const payload: ArticlePayload = { article, body: article.notes };
    await deps.writeQueue.enqueue({
      id: ulid(),
      entityType: 'article',
      entityId: article.id,
      op,
      payload,
      baseRevision: null,
      fileId: null,
      resolvedPath: articleFilePath(deps.travelFolderPath, scope.slug, articleSlug(article)),
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    });
  }

  async function listByScope(scope: ArticleScope): Promise<Article[]> {
    return scope.tripId === null
      ? listGeneralArticles(deps.db)
      : listArticlesByTrip(scope.tripId, deps.db);
  }

  /**
   * Slug collision (S12 sharp edge): two articles in the same folder can't
   * share a filename, so the second one gets a short random suffix rather than
   * a counter — counters would renumber if an earlier note is deleted by hand.
   */
  async function uniqueSlug(scope: ArticleScope, title: string): Promise<string> {
    const base = deriveArticleSlug(title);
    const taken = new Set((await listByScope(scope)).map((a) => articleSlug(a)));
    if (!taken.has(base)) return base;
    for (let i = 0; i < 10; i += 1) {
      const candidate = `${base}-${randomSuffix()}`;
      if (!taken.has(candidate)) return candidate;
    }
    // 10 collisions on a random 4-char suffix means something is very wrong;
    // a ULID tail is long enough to be unique on its own.
    return `${base}-${ulid().toLowerCase()}`;
  }

  return {
    async addArticle(scope, input): Promise<Article> {
      const fields = AddInput.parse(input);
      const article = newArticle({
        trip_id: scope.tripId,
        url: fields.url,
        title: fields.title,
        tags: fields.tags,
        place_id: fields.place_id,
        notes: fields.notes,
        slug: await uniqueSlug(scope, fields.title),
      });
      await upsertArticle(article, deps.db);
      await enqueue(scope, article, 'create');
      return article;
    },

    async updateArticle(scope, article): Promise<void> {
      const updated = Article.parse(article);
      await upsertArticle(updated, deps.db);
      await enqueue(scope, updated, 'update');
    },

    async removeArticle(article): Promise<void> {
      await deleteArticle(article.id, deps.db);
    },

    listByScope,
  };
}
