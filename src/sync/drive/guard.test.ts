import { describe, expect, it } from 'vitest';

import {
  assertUnderPrefix,
  guardWrite,
  isUnderPrefix,
  normalizePath,
  normalizePrefix,
} from './guard.js';
import { WriteOutOfScopeError } from './types.js';

const PREFIX = 'MyVault/Travel';

describe('normalizePath', () => {
  it('strips leading and trailing slashes', () => {
    expect(normalizePath('/MyVault/Travel/Trips/')).toBe('MyVault/Travel/Trips');
  });

  it('collapses repeated slashes', () => {
    expect(normalizePath('MyVault//Travel///Trips')).toBe('MyVault/Travel/Trips');
  });

  it('resolves "." segments', () => {
    expect(normalizePath('MyVault/./Travel/./Trips/.')).toBe('MyVault/Travel/Trips');
  });

  it('resolves ".." segments that remain inside the path', () => {
    expect(normalizePath('MyVault/Travel/foo/../Trips')).toBe('MyVault/Travel/Trips');
  });

  it('rejects ".." escaping the start of the path', () => {
    expect(() => normalizePath('../etc/passwd')).toThrow(WriteOutOfScopeError);
    expect(() => normalizePath('MyVault/../../escape')).toThrow(WriteOutOfScopeError);
  });

  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('MyVault\\Travel\\Trips')).toBe('MyVault/Travel/Trips');
  });

  it('applies Unicode NFC normalization', () => {
    // "café" written as `cafe` + combining acute accent (U+0065 U+0301) vs `é` (U+00E9).
    const decomposed = 'MyVault/Café';
    const composed = 'MyVault/Café';
    expect(normalizePath(decomposed)).toBe(normalizePath(composed));
  });

  it('rejects strings containing NUL bytes', () => {
    expect(() => normalizePath('MyVault/Travel/foo\0bar')).toThrow(WriteOutOfScopeError);
  });

  it('handles empty input as the empty path (root)', () => {
    expect(normalizePath('')).toBe('');
    expect(normalizePath('/')).toBe('');
    expect(normalizePath('.')).toBe('');
  });
});

describe('normalizePrefix', () => {
  it('rejects empty prefixes', () => {
    expect(() => normalizePrefix('')).toThrow();
    expect(() => normalizePrefix('/')).toThrow();
    expect(() => normalizePrefix('.')).toThrow();
  });

  it('returns the canonical form', () => {
    expect(normalizePrefix('/MyVault/Travel/')).toBe('MyVault/Travel');
  });
});

describe('isUnderPrefix / assertUnderPrefix', () => {
  it('accepts a path equal to the prefix', () => {
    expect(isUnderPrefix('MyVault/Travel', PREFIX)).toBe(true);
    expect(assertUnderPrefix('MyVault/Travel', PREFIX)).toBe('MyVault/Travel');
  });

  it('accepts a deep path under the prefix', () => {
    expect(
      assertUnderPrefix('MyVault/Travel/Trips/japan-2026/Trip.md', PREFIX),
    ).toBe('MyVault/Travel/Trips/japan-2026/Trip.md');
  });

  it('accepts trailing-slash variants', () => {
    expect(assertUnderPrefix('MyVault/Travel/', PREFIX)).toBe('MyVault/Travel');
    expect(assertUnderPrefix('/MyVault/Travel/Trips/', PREFIX)).toBe('MyVault/Travel/Trips');
  });

  it('rejects ".." traversal that escapes the prefix', () => {
    expect(() =>
      assertUnderPrefix('MyVault/Travel/../Other/secret', PREFIX),
    ).toThrow(WriteOutOfScopeError);
  });

  it('rejects ".." traversal that lands outside the prefix even if it stays in the vault', () => {
    expect(() =>
      assertUnderPrefix('MyVault/Travel/Trips/../../Outside.md', PREFIX),
    ).toThrow(WriteOutOfScopeError);
  });

  it('rejects sibling directories that share a prefix string but not a segment boundary', () => {
    // `Travel` vs `TravelClub` — case the guard MUST get right.
    expect(() =>
      assertUnderPrefix('MyVault/TravelClub/secret.md', PREFIX),
    ).toThrow(WriteOutOfScopeError);
    expect(isUnderPrefix('MyVault/TravelClub/secret.md', PREFIX)).toBe(false);
  });

  it('rejects an unrelated absolute path', () => {
    expect(() => assertUnderPrefix('Other/Path/secret.md', PREFIX)).toThrow(
      WriteOutOfScopeError,
    );
  });

  it('treats case differences as out of scope (Drive is case-sensitive)', () => {
    expect(() =>
      assertUnderPrefix('MyVault/travel/Trips/Trip.md', PREFIX),
    ).toThrow(WriteOutOfScopeError);
  });

  it('handles unicode-normalized variants of the prefix', () => {
    const decomposed = 'MyVault/Café/Travel/Trips/Trip.md';
    const composedPrefix = 'MyVault/Café/Travel';
    expect(isUnderPrefix(decomposed, composedPrefix)).toBe(true);
  });

  it('rejects NUL bytes', () => {
    expect(() => assertUnderPrefix('MyVault/Travel/foo\0bar', PREFIX)).toThrow(
      WriteOutOfScopeError,
    );
  });

  it('rejects non-string inputs at runtime', () => {
    // @ts-expect-error: deliberately wrong type to exercise the runtime guard.
    expect(() => assertUnderPrefix(null, PREFIX)).toThrow(WriteOutOfScopeError);
  });

  it('rejects an empty prefix at runtime (config bug)', () => {
    expect(() => assertUnderPrefix('MyVault/Travel/Trip.md', '')).toThrow(
      WriteOutOfScopeError,
    );
    expect(() => assertUnderPrefix('MyVault/Travel/Trip.md', '/')).toThrow(
      WriteOutOfScopeError,
    );
  });
});

describe('guardWrite', () => {
  it('returns the input unchanged when in scope', () => {
    const input = { resolvedPath: 'MyVault/Travel/Trips/Trip.md', payload: 'ok' };
    expect(guardWrite(input, PREFIX)).toBe(input);
  });

  it('throws WriteOutOfScopeError when out of scope', () => {
    const input = { resolvedPath: 'MyVault/Outside.md' };
    expect(() => guardWrite(input, PREFIX)).toThrow(WriteOutOfScopeError);
  });
});
