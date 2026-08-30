import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

import { newArticle } from '@/domain/article';
import { newTripId } from '@/domain/ids';
import { makeTestDb } from '@/lib/storage/test-helpers';

import { articleInboundReconciler as r } from './inbound';
import { serializeArticle } from './parser';

const tripId = newTripId();

describe('articleInboundReconciler.matchesPath', () => {
  it('claims trip and General article files', () => {
    expect(r.matchesPath('Trips/vietnam-2026/Articles/best-hanoi-food.md')).toBe(true);
    expect(r.matchesPath('General/Articles/packing-list.md')).toBe(true);
  });

  it('ignores other vault files', () => {
    expect(r.matchesPath('Trips/vietnam/Trip.md')).toBe(false);
    expect(r.matchesPath('Trips/vietnam/Places/hanoi.md')).toBe(false);
    expect(r.matchesPath('Trips/vietnam/Shopping.md')).toBe(false);
    expect(r.matchesPath('General/Tasks.md')).toBe(false);
    // Nested folders below Articles/ aren't part of the layout.
    expect(r.matchesPath('Trips/vietnam/Articles/sub/deep.md')).toBe(false);
    // Uppercase trip slugs violate the Trip schema's slug regex.
    expect(r.matchesPath('Trips/Vietnam/Articles/x.md')).toBe(false);
  });
});

describe('articleInboundReconciler.parseFile', () => {
  it('yields the single article in the file', () => {
    const article = newArticle({
      trip_id: tripId,
      url: 'https://example.com/x',
      title: 'X',
      slug: 'x',
    });
    const parsed = r.parseFile(serializeArticle(article, 'Notes.\n'), 'Trips/v/Articles/x.md');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe(article.id);
    expect(parsed[0]?.notes).toBe('Notes.\n');
  });

  it('skips a file in the folder that is not an article', () => {
    expect(r.parseFile('# just a note\n', 'Trips/v/Articles/stray.md')).toEqual([]);
    expect(r.parseFile('---\ntype: place\n---\n', 'Trips/v/Articles/stray.md')).toEqual([]);
  });
});

describe('articleInboundReconciler Dexie lifecycle', () => {
  it('upserts, lists and deletes', async () => {
    const db = makeTestDb('articles-inbound');
    const article = newArticle({
      trip_id: tripId,
      url: 'https://example.com/x',
      title: 'X',
      slug: 'x',
    });

    await r.upsertEntity(article, db);
    expect(await r.listEntityIds(db)).toEqual([article.id]);
    expect(await db.articles.get(article.id)).toMatchObject({ title: 'X' });

    await r.deleteEntity(article.id, db);
    expect(await r.listEntityIds(db)).toEqual([]);

    db.close();
  });
});
