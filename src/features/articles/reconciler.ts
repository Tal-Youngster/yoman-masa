/**
 * Outbound (Dexie → Drive) reconciler for article notes.
 *
 * File-per-entity, so the "structured edit" is: rewrite the app-owned
 * frontmatter, keep everything else. The body is the user's notes — a payload
 * that carries one replaces it (the user just edited the note in the app),
 * a payload without one leaves the file's body untouched, so a frontmatter-only
 * change can never clobber an Obsidian edit.
 */

import { z } from 'zod';

import { Article } from '@/domain/article';
import type { Reconciler, WriteQueueItem } from '@/sync/queue';

import { parseArticle, serializeArticle, tryParseArticle } from './parser';
import type { ParsedArticle } from './parser';

export interface ArticlePayload {
  article: Article;
  body?: string;
}

const ArticlePayloadSchema = z.object({
  article: Article,
  body: z.string().optional(),
});

export const articleReconciler: Reconciler<Article, ArticlePayload> = {
  entityType: 'article',

  fromMarkdown(content: string): Article | null {
    return tryParseArticle(content)?.article ?? null;
  },

  toMarkdown(entity: Article, originalContent: string | null): string {
    if (originalContent === null || originalContent === '') {
      return serializeArticle(entity, entity.notes);
    }
    const original = tryParseArticle(originalContent);
    if (!original) return serializeArticle(entity, entity.notes);
    return serializeArticle(entity, original.body, {
      extraFrontmatter: original.extraFrontmatter,
      lineEnding: original.lineEnding,
    });
  },

  applyEdit(originalContent: string, item: WriteQueueItem<unknown>): string {
    const payload = ArticlePayloadSchema.parse(item.payload);
    if (originalContent === '') {
      return serializeArticle(payload.article, payload.body ?? payload.article.notes);
    }

    let original: ParsedArticle | null;
    try {
      original = parseArticle(originalContent);
    } catch {
      original = null;
    }
    if (!original) {
      return serializeArticle(payload.article, payload.body ?? payload.article.notes);
    }

    return serializeArticle(payload.article, payload.body ?? original.body, {
      extraFrontmatter: original.extraFrontmatter,
      lineEnding: original.lineEnding,
    });
  },
};
