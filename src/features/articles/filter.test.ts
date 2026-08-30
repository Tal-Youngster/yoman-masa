import { describe, expect, it } from 'vitest';

import { newArticle } from '@/domain/article';
import { newTripId } from '@/domain/ids';

import { collectTags, filterArticles, sortArticles, urlHost } from './filter';

const tripId = newTripId();

const make = (title: string, url: string, tags: string[] = []) =>
  newArticle({ trip_id: tripId, url, title, tags });

const food = make('Best Hanoi Street Food', 'https://www.legalnomads.com/hanoi', [
  'food',
  'hanoi',
]);
const trains = make('Vietnam by train', 'https://seat61.com/vietnam', ['transport']);
const visa = make('Visa on arrival', 'https://example.com/visa', ['admin', 'hanoi']);
const all = [food, trains, visa];

describe('urlHost', () => {
  it('strips the scheme and a leading www', () => {
    expect(urlHost('https://www.legalnomads.com/hanoi')).toBe('legalnomads.com');
  });

  it('returns empty string for an unparseable url', () => {
    expect(urlHost('not a url')).toBe('');
  });
});

describe('filterArticles', () => {
  it('returns everything with no filter', () => {
    expect(filterArticles(all)).toHaveLength(3);
  });

  it('matches the title case-insensitively', () => {
    expect(filterArticles(all, { query: 'hanoi street' }).map((a) => a.id)).toEqual([food.id]);
  });

  it('matches a tag and the url host', () => {
    expect(filterArticles(all, { query: 'transport' }).map((a) => a.id)).toEqual([trains.id]);
    expect(filterArticles(all, { query: 'seat61' }).map((a) => a.id)).toEqual([trains.id]);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(filterArticles(all, { query: '  visa  ' }).map((a) => a.id)).toEqual([visa.id]);
  });

  it('requires every selected tag (AND, not OR)', () => {
    expect(filterArticles(all, { tags: ['hanoi'] }).map((a) => a.id)).toEqual([food.id, visa.id]);
    expect(filterArticles(all, { tags: ['hanoi', 'food'] }).map((a) => a.id)).toEqual([food.id]);
    expect(filterArticles(all, { tags: ['hanoi', 'transport'] })).toEqual([]);
  });

  it('combines tag filter and query', () => {
    expect(filterArticles(all, { tags: ['hanoi'], query: 'visa' }).map((a) => a.id)).toEqual([
      visa.id,
    ]);
  });
});

describe('collectTags', () => {
  it('de-duplicates and sorts', () => {
    expect(collectTags(all)).toEqual(['admin', 'food', 'hanoi', 'transport']);
  });

  it('is empty for untagged articles', () => {
    expect(collectTags([make('No tags', 'https://example.com/n')])).toEqual([]);
  });
});

describe('sortArticles', () => {
  it('sorts by title without mutating the input', () => {
    const input = [visa, food, trains];
    expect(sortArticles(input).map((a) => a.title)).toEqual([
      'Best Hanoi Street Food',
      'Vietnam by train',
      'Visa on arrival',
    ]);
    expect(input[0]).toBe(visa);
  });
});
