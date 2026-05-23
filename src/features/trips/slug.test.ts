import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isoDate } from '@/domain/dates';
import { currency } from '@/domain/money';
import { newTrip } from '@/domain/trip';
import { upsertTrip } from '@/lib/storage';
import { deleteDatabase, makeTestDb } from '@/lib/storage/test-helpers';
import type { TravelDB } from '@/lib/storage';

import { deriveSlug, isSlugUnique, suggestUniqueSlug } from './slug';

describe('deriveSlug', () => {
  it('basic ASCII kebab', () => {
    expect(deriveSlug('Kyoto 2026')).toBe('kyoto-2026');
  });

  it('strips combining marks (NFKD)', () => {
    expect(deriveSlug("Côte d'Azur")).toBe('cote-d-azur');
    expect(deriveSlug('São Paulo')).toBe('sao-paulo');
  });

  it('collapses runs of separators', () => {
    expect(deriveSlug('a   b   c')).toBe('a-b-c');
    expect(deriveSlug('a//b\\\\c')).toBe('a-b-c');
  });

  it('drops non-latin scripts (Hebrew, Japanese) and falls back to trip-untitled', () => {
    expect(deriveSlug('טיול ליפן')).toBe('trip-untitled');
    expect(deriveSlug('日本旅行')).toBe('trip-untitled');
  });

  it('preserves embedded ASCII when mixed-script', () => {
    expect(deriveSlug('Trip to 日本 2026')).toBe('trip-to-2026');
  });

  it('prefixes "trip-" when the slug starts with a digit', () => {
    expect(deriveSlug('2026 Japan')).toBe('trip-2026-japan');
  });

  it('caps length at 64 chars and trims trailing hyphens', () => {
    const longName = 'a'.repeat(80) + ' ' + 'b'.repeat(80);
    const slug = deriveSlug(longName);
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug).not.toMatch(/-$/);
  });

  it('returns "trip-untitled" for empty / emoji-only input', () => {
    expect(deriveSlug('')).toBe('trip-untitled');
    expect(deriveSlug('   ')).toBe('trip-untitled');
    expect(deriveSlug('✈️🌍')).toBe('trip-untitled');
  });

  it('result is always valid per Trip.slug Zod regex', () => {
    const samples = ['Kyoto 2026', 'São Paulo', "Côte d'Azur", '日本', '2026', '!!!'];
    const regex = /^[a-z0-9][a-z0-9-]*$/;
    for (const name of samples) {
      expect(deriveSlug(name)).toMatch(regex);
    }
  });
});

let db: TravelDB;
beforeEach(() => {
  db = makeTestDb('slug');
});
afterEach(async () => {
  db.close();
  await deleteDatabase(db.name);
});

describe('isSlugUnique', () => {
  it('returns true for an unused slug, false once taken', async () => {
    expect(await isSlugUnique('kyoto-2026', db)).toBe(true);
    await upsertTrip(
      newTrip({
        slug: 'kyoto-2026',
        name: 'Kyoto 2026',
        start_date: isoDate('2026-09-01'),
        end_date: isoDate('2026-09-15'),
        home_currency: currency('USD'),
        status: 'planned',
      }),
      db,
    );
    expect(await isSlugUnique('kyoto-2026', db)).toBe(false);
    expect(await isSlugUnique('kyoto-2027', db)).toBe(true);
  });
});

describe('suggestUniqueSlug', () => {
  it('returns the base slug when unused', async () => {
    expect(await suggestUniqueSlug('Kyoto 2026', db)).toBe('kyoto-2026');
  });

  it('appends -2, -3… on collision', async () => {
    await upsertTrip(
      newTrip({
        slug: 'kyoto-2026',
        name: 'Kyoto 2026',
        start_date: isoDate('2026-09-01'),
        end_date: isoDate('2026-09-15'),
        home_currency: currency('USD'),
        status: 'planned',
      }),
      db,
    );
    expect(await suggestUniqueSlug('Kyoto 2026', db)).toBe('kyoto-2026-2');
    await upsertTrip(
      newTrip({
        slug: 'kyoto-2026-2',
        name: 'Kyoto 2026',
        start_date: isoDate('2026-09-01'),
        end_date: isoDate('2026-09-15'),
        home_currency: currency('USD'),
        status: 'planned',
      }),
      db,
    );
    expect(await suggestUniqueSlug('Kyoto 2026', db)).toBe('kyoto-2026-3');
  });
});
