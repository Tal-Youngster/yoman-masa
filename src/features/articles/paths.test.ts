import { describe, expect, it } from 'vitest';

import { articleFilePath, articleSlug, deriveArticleSlug } from './paths';

describe('deriveArticleSlug', () => {
  it('kebab-cases a title', () => {
    expect(deriveArticleSlug('Best Hanoi Street Food')).toBe('best-hanoi-street-food');
  });

  it('strips accents and punctuation', () => {
    expect(deriveArticleSlug("Côte d'Azur: a guide!")).toBe('cote-d-azur-a-guide');
  });

  it('keeps a leading digit — plenty of articles are listicles', () => {
    expect(deriveArticleSlug('10 things to do in Hanoi')).toBe('10-things-to-do-in-hanoi');
  });

  it('falls back when nothing alphanumeric survives', () => {
    expect(deriveArticleSlug('✈️ 🍜')).toBe('article');
  });

  it('caps the length without a trailing hyphen', () => {
    const slug = deriveArticleSlug('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('articleSlug', () => {
  it('prefers the stored slug so a retitle keeps the same file', () => {
    expect(articleSlug({ title: 'A completely new title', slug: 'original-title' })).toBe(
      'original-title',
    );
  });

  it('derives from the title for notes written by hand in Obsidian', () => {
    expect(articleSlug({ title: 'Hand written' })).toBe('hand-written');
  });
});

describe('articleFilePath', () => {
  it('places trip articles under the trip folder', () => {
    expect(articleFilePath('Vault/Travel', 'vietnam-2026', 'best-hanoi-food')).toBe(
      'Vault/Travel/Trips/vietnam-2026/Articles/best-hanoi-food.md',
    );
  });

  it('places General articles under General/Articles', () => {
    expect(articleFilePath('Vault/Travel', null, 'packing-list')).toBe(
      'Vault/Travel/General/Articles/packing-list.md',
    );
  });

  it('tolerates a trailing slash on the Travel folder path', () => {
    expect(articleFilePath('Vault/Travel/', null, 'x')).toBe(
      'Vault/Travel/General/Articles/x.md',
    );
  });
});
