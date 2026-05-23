import { describe, expect, it } from 'vitest';

import { COUNTRIES, countryName, flagEmoji } from './countries';

describe('flagEmoji', () => {
  it('renders the correct regional-indicator pair for AR', () => {
    expect(flagEmoji('AR')).toBe('\u{1F1E6}\u{1F1F7}');
  });

  it('accepts lowercase', () => {
    expect(flagEmoji('jp')).toBe('\u{1F1EF}\u{1F1F5}');
  });

  it('returns empty string for invalid codes', () => {
    expect(flagEmoji('XX1')).toBe('');
    expect(flagEmoji('A')).toBe('');
    expect(flagEmoji('')).toBe('');
  });
});

describe('countryName', () => {
  it('returns the human name for a known code', () => {
    expect(countryName('JP')).toBe('Japan');
    expect(countryName('AR')).toBe('Argentina');
  });

  it('falls back to the raw code for unknown values', () => {
    expect(countryName('ZZ')).toBe('ZZ');
  });
});

describe('COUNTRIES dataset', () => {
  it('contains no duplicate codes', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('uses ISO 3166-1 alpha-2 codes', () => {
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
    }
  });
});
