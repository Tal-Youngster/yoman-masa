import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/lib/storage/test-helpers';
import { PlaceId, TripId } from '@/domain/ids';
import type { WriteQueue, WriteQueueItem } from '@/sync/queue';
import { createArticlesAdmin, type ArticleScope } from './articles-admin';
import type { ArticlePayload } from './reconciler';

class InMemoryQueue implements WriteQueue {
  public readonly items: WriteQueueItem[] = [];
  enqueue(item: WriteQueueItem): Promise<void> {
    this.items.push(item);
    return Promise.resolve();
  }
  drainNext(): Promise<WriteQueueItem | null> {
    return Promise.resolve(this.items.shift() ?? null);
  }
  markFailed(): Promise<void> {
    return Promise.resolve();
  }
}

const TRIP = TripId.parse('trp_01HABCDEFGHJKMNPQRSTVWXYZ0');
const PLACE = PlaceId.parse('plc_01HABCDEFGHJKMNPQRSTVWXYZ0');
const TRIP_SCOPE: ArticleScope = { tripId: TRIP, slug: 'vietnam' };
const GENERAL_SCOPE: ArticleScope = { tripId: null, slug: null };

function setup(name: string, suffixes: string[] = ['aa11', 'bb22']) {
  const db = makeTestDb(name);
  const queue = new InMemoryQueue();
  let i = 0;
  const admin = createArticlesAdmin({
    db,
    writeQueue: queue,
    travelFolderPath: 'Vault/Travel',
    randomSuffix: () => suffixes[i++ % suffixes.length] ?? 'zzzz',
  });
  return { db, queue, admin };
}

describe('articlesAdmin.addArticle', () => {
  it('persists a trip article and enqueues a create against its own file', async () => {
    const { db, queue, admin } = setup('articles-add-trip');
    const article = await admin.addArticle(TRIP_SCOPE, {
      url: 'https://example.com/best-hanoi-food',
      title: 'Best Hanoi Street Food',
      tags: ['food', 'hanoi'],
      place_id: PLACE,
      notes: 'Bun cha at 24 Le Van Huu.',
    });

    expect(article.trip_id).toBe(TRIP);
    expect(article.slug).toBe('best-hanoi-street-food');
    expect(article.place_id).toBe(PLACE);
    expect(await db.articles.get(article.id)).toMatchObject({ title: 'Best Hanoi Street Food' });

    expect(queue.items).toHaveLength(1);
    const enq = queue.items[0] as WriteQueueItem<ArticlePayload>;
    expect(enq.entityType).toBe('article');
    expect(enq.op).toBe('create');
    expect(enq.resolvedPath).toBe(
      'Vault/Travel/Trips/vietnam/Articles/best-hanoi-street-food.md',
    );
    expect(enq.payload.body).toBe('Bun cha at 24 Le Van Huu.');
    expect(enq.fileId).toBeNull();
    expect(enq.baseRevision).toBeNull();
  });

  it('routes a General article to General/Articles/', async () => {
    const { queue, admin } = setup('articles-add-general');
    const article = await admin.addArticle(GENERAL_SCOPE, {
      url: 'https://example.com/packing',
      title: 'Packing list ideas',
    });

    expect(article.trip_id).toBeNull();
    expect(article.tags).toEqual([]);
    expect(article.place_id).toBeNull();
    expect(queue.items[0]?.resolvedPath).toBe(
      'Vault/Travel/General/Articles/packing-list-ideas.md',
    );
  });

  it('rejects a non-url link', async () => {
    const { admin } = setup('articles-add-bad-url');
    await expect(
      admin.addArticle(TRIP_SCOPE, { url: 'not a link', title: 'x' }),
    ).rejects.toThrow();
  });
});

describe('articlesAdmin slug collisions', () => {
  it('appends a random suffix when the scope already holds that slug', async () => {
    const { admin, queue } = setup('articles-collision');
    const first = await admin.addArticle(TRIP_SCOPE, {
      url: 'https://a.example/1',
      title: 'Street food',
    });
    const second = await admin.addArticle(TRIP_SCOPE, {
      url: 'https://b.example/2',
      title: 'Street food',
    });

    expect(first.slug).toBe('street-food');
    expect(second.slug).toBe('street-food-aa11');
    expect(queue.items.map((i) => i.resolvedPath)).toEqual([
      'Vault/Travel/Trips/vietnam/Articles/street-food.md',
      'Vault/Travel/Trips/vietnam/Articles/street-food-aa11.md',
    ]);
  });

  it('does not collide across scopes — the same title is fine in trip + General', async () => {
    const { admin } = setup('articles-collision-scopes');
    const tripOne = await admin.addArticle(TRIP_SCOPE, {
      url: 'https://a.example/1',
      title: 'Street food',
    });
    const general = await admin.addArticle(GENERAL_SCOPE, {
      url: 'https://b.example/2',
      title: 'Street food',
    });
    expect(tripOne.slug).toBe('street-food');
    expect(general.slug).toBe('street-food');
  });

  it('falls back for a title with no alphanumerics', async () => {
    const { admin } = setup('articles-emoji-title');
    const article = await admin.addArticle(TRIP_SCOPE, {
      url: 'https://a.example/1',
      title: '✈️✈️',
    });
    expect(article.slug).toBe('article');
  });
});

describe('articlesAdmin.updateArticle', () => {
  it('keeps writing to the original file after a retitle', async () => {
    const { db, queue, admin } = setup('articles-retitle');
    const article = await admin.addArticle(TRIP_SCOPE, {
      url: 'https://example.com/x',
      title: 'Original title',
    });

    await admin.updateArticle(TRIP_SCOPE, { ...article, title: 'A completely new title' });

    expect((await db.articles.get(article.id))?.title).toBe('A completely new title');
    const update = queue.items[1] as WriteQueueItem<ArticlePayload>;
    expect(update.op).toBe('update');
    expect(update.resolvedPath).toBe('Vault/Travel/Trips/vietnam/Articles/original-title.md');
  });
});

describe('articlesAdmin.removeArticle', () => {
  it('drops the local row and enqueues nothing — the vault file is the user’s', async () => {
    const { db, queue, admin } = setup('articles-remove');
    const article = await admin.addArticle(TRIP_SCOPE, {
      url: 'https://example.com/x',
      title: 'Doomed',
    });
    queue.items.length = 0;

    await admin.removeArticle(article);

    expect(await db.articles.get(article.id)).toBeUndefined();
    expect(queue.items).toHaveLength(0);
  });
});

describe('articlesAdmin.listByScope', () => {
  it('separates trip articles from General articles', async () => {
    const { admin } = setup('articles-scopes');
    await admin.addArticle(TRIP_SCOPE, { url: 'https://a.example/1', title: 'Trip one' });
    await admin.addArticle(GENERAL_SCOPE, { url: 'https://b.example/2', title: 'General one' });

    expect((await admin.listByScope(TRIP_SCOPE)).map((a) => a.title)).toEqual(['Trip one']);
    expect((await admin.listByScope(GENERAL_SCOPE)).map((a) => a.title)).toEqual(['General one']);
  });
});
