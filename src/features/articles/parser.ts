/**
 * Article file parser/serializer (ADR-0004 "App entities" convention).
 *
 * One file per article: app-owned frontmatter, user-owned body. The body *is*
 * the article's notes — `Article.notes` round-trips through it rather than
 * through a frontmatter key — so anything the user writes under the
 * frontmatter in Obsidian survives, including Obsidian `%% comments %%`.
 *
 * Unknown frontmatter keys are captured in `extraFrontmatter` and re-emitted
 * on serialize; the source line ending is detected and restored.
 */

import { parseFrontmatter, serializeFrontmatter, type LineEnding } from '@/lib/markdown';
import { Article } from '@/domain/article';

export interface ParsedArticle {
  article: Article;
  /** Extra (non-Article) frontmatter keys. Preserved on serialize. */
  extraFrontmatter: Record<string, unknown>;
  /** Body content below the frontmatter, LF-normalized. Also `article.notes`. */
  body: string;
  /** Original line ending detected in the source — restored on serialize. */
  lineEnding: LineEnding;
  hasFrontmatter: boolean;
}

/** `notes` is deliberately absent: it lives in the body, not the frontmatter. */
const ARTICLE_FRONTMATTER_KEYS = [
  'type',
  'id',
  'trip_id',
  'url',
  'title',
  'tags',
  'place_id',
  'slug',
] as const;
type ArticleKey = (typeof ARTICLE_FRONTMATTER_KEYS)[number];

function partitionFrontmatter(fm: Record<string, unknown>): {
  article: Record<string, unknown>;
  extra: Record<string, unknown>;
} {
  const articleFm: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    if ((ARTICLE_FRONTMATTER_KEYS as readonly string[]).includes(k)) {
      articleFm[k] = v;
    } else {
      extra[k] = v;
    }
  }
  return { article: articleFm, extra };
}

export function parseArticle(content: string): ParsedArticle {
  const parsed = parseFrontmatter(content);
  const { article: articleFm, extra } = partitionFrontmatter(parsed.frontmatter);

  const article = Article.parse({ ...articleFm, notes: parsed.body });
  return {
    article,
    extraFrontmatter: extra,
    body: parsed.body,
    lineEnding: parsed.lineEnding,
    hasFrontmatter: parsed.hasFrontmatter,
  };
}

export function tryParseArticle(content: string): ParsedArticle | null {
  try {
    const parsed = parseFrontmatter(content);
    if (parsed.frontmatter['type'] !== 'article') return null;
    return parseArticle(content);
  } catch {
    return null;
  }
}

export function serializeArticle(
  article: Article,
  body: string,
  opts: {
    extraFrontmatter?: Record<string, unknown>;
    lineEnding?: LineEnding;
    alwaysEmit?: boolean;
  } = {},
): string {
  const fm: Record<string, unknown> = {};
  for (const key of ARTICLE_FRONTMATTER_KEYS) {
    const v = (article as Record<ArticleKey, unknown>)[key];
    // `trip_id: null` is meaningful (the General collection) and stays; every
    // other empty value is dropped so the file reads cleanly in Obsidian.
    if (v === undefined) continue;
    if (v === null && key !== 'trip_id' && key !== 'place_id') continue;
    fm[key] = v;
  }

  if (Array.isArray(fm.tags) && fm.tags.length === 0) {
    delete fm.tags;
  }
  if (fm.place_id === null) {
    delete fm.place_id;
  }

  if (opts.extraFrontmatter) {
    for (const [k, v] of Object.entries(opts.extraFrontmatter)) {
      if (!(ARTICLE_FRONTMATTER_KEYS as readonly string[]).includes(k)) {
        fm[k] = v;
      }
    }
  }

  return serializeFrontmatter(fm, body, {
    ...(opts.lineEnding ? { lineEnding: opts.lineEnding } : {}),
    alwaysEmit: opts.alwaysEmit ?? true,
  });
}
