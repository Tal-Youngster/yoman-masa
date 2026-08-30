import { describe, expect, it } from 'vitest';

import { newArticle } from '@/domain/article';
import { newTripId } from '@/domain/ids';
import type { WriteQueueItem } from '@/sync/queue';

import { articleReconciler } from './reconciler';
import type { ArticlePayload } from './reconciler';
import { serializeArticle } from './parser';

const tripId = newTripId();

const article = newArticle({
  trip_id: tripId,
  url: 'https://example.com/best-hanoi-food',
  title: 'Best Hanoi Street Food',
  tags: ['food'],
  slug: 'best-hanoi-street-food',
  notes: 'App-side notes.\n',
});

function queueItem(payload: ArticlePayload): WriteQueueItem<ArticlePayload> {
  return {
    id: '01HQ',
    entityType: 'article',
    entityId: article.id,
    op: 'update',
    payload,
    baseRevision: null,
    fileId: null,
    resolvedPath: 'Travel/Trips/v/Articles/best-hanoi-street-food.md',
    attempts: 0,
    lastError: null,
    createdAt: '2026-08-30T00:00:00.000Z',
  };
}

describe('articleReconciler.fromMarkdown', () => {
  it('parses an article file and rejects anything else', () => {
    expect(articleReconciler.fromMarkdown(serializeArticle(article, ''))?.id).toBe(article.id);
    expect(articleReconciler.fromMarkdown('# not an article\n')).toBeNull();
  });
});

describe('articleReconciler.toMarkdown', () => {
  it('creates a fresh file from the entity notes when there is no original', () => {
    const md = articleReconciler.toMarkdown(article, null);
    expect(md).toContain('title: Best Hanoi Street Food');
    expect(md).toContain('App-side notes.');
  });

  it('keeps the original body and unknown frontmatter on an update', () => {
    const original = serializeArticle(article, '%% private %%\n\nVault-side body.\n', {
      extraFrontmatter: { cssclass: 'reading' },
    });
    const md = articleReconciler.toMarkdown({ ...article, title: 'Renamed' }, original);
    expect(md).toContain('title: Renamed');
    expect(md).toContain('cssclass: reading');
    expect(md).toContain('Vault-side body.');
    expect(md).not.toContain('App-side notes.');
  });
});

describe('articleReconciler.applyEdit', () => {
  it('writes the payload body over the vault body when the app edited the notes', () => {
    const original = serializeArticle(article, 'Vault-side body.\n');
    const md = articleReconciler.applyEdit(original, queueItem({ article, body: 'Edited.\n' }));
    expect(md).toContain('Edited.');
    expect(md).not.toContain('Vault-side body.');
  });

  it('preserves the vault body when the payload carries none', () => {
    const original = serializeArticle(article, 'Vault-side body.\n', {
      extraFrontmatter: { cssclass: 'reading' },
    });
    const md = articleReconciler.applyEdit(
      original,
      queueItem({ article: { ...article, tags: ['food', 'hanoi'] } }),
    );
    expect(md).toContain('Vault-side body.');
    expect(md).toContain('cssclass: reading');
    expect(md).toContain('- hanoi');
  });

  it('creates the file from scratch when the original is empty', () => {
    const md = articleReconciler.applyEdit('', queueItem({ article, body: 'First write.\n' }));
    expect(md).toContain('type: article');
    expect(md).toContain('First write.');
  });

  it('rebuilds a file whose frontmatter no longer parses', () => {
    const md = articleReconciler.applyEdit(
      'garbage, no frontmatter at all\n',
      queueItem({ article, body: 'Recovered.\n' }),
    );
    expect(md).toContain('type: article');
    expect(md).toContain('Recovered.');
  });

  it('rejects a payload that is not an article', () => {
    expect(() =>
      articleReconciler.applyEdit(
        '',
        queueItem({ article: { ...article, url: 'nope' } }),
      ),
    ).toThrow();
  });
});
