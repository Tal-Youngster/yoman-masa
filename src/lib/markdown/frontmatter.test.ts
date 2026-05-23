import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectLineEnding, parseFrontmatter, serializeFrontmatter } from './frontmatter';

const fixturesDir = join(fileURLToPath(new URL('./__fixtures__/', import.meta.url)));

describe('parseFrontmatter — basics', () => {
  it('returns empty frontmatter and full body when no fence is present', () => {
    const input = '# Hello\n\nbody only.\n';
    const parsed = parseFrontmatter(input);
    expect(parsed.hasFrontmatter).toBe(false);
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe(input);
  });

  it('handles an empty frontmatter block', () => {
    const input = '---\n---\nbody\n';
    const parsed = parseFrontmatter(input);
    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe('body\n');
  });

  it('parses a typical frontmatter block', () => {
    const input = '---\nname: trip\ncount: 3\n---\nhi\n';
    const parsed = parseFrontmatter(input);
    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.frontmatter).toEqual({ name: 'trip', count: 3 });
    expect(parsed.body).toBe('hi\n');
  });

  it('preserves a multi-line body verbatim (LF-normalized)', () => {
    const input = '---\nk: 1\n---\nline1\n\nline3\n';
    const parsed = parseFrontmatter(input);
    expect(parsed.body).toBe('line1\n\nline3\n');
  });

  it('detects CRLF line endings and normalizes body to LF', () => {
    const input = '---\r\nk: 1\r\n---\r\nbody\r\nmore\r\n';
    const parsed = parseFrontmatter(input);
    expect(parsed.lineEnding).toBe('crlf');
    expect(parsed.body).toBe('body\nmore\n');
    expect(parsed.frontmatter).toEqual({ k: 1 });
  });

  it('tolerates a UTF-8 BOM', () => {
    const input = '﻿---\nk: 1\n---\nbody\n';
    const parsed = parseFrontmatter(input);
    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.frontmatter).toEqual({ k: 1 });
  });

  it('treats `--- foo` as not-a-fence', () => {
    const input = '--- this is not a fence\nstill body\n';
    const parsed = parseFrontmatter(input);
    expect(parsed.hasFrontmatter).toBe(false);
    expect(parsed.body).toBe(input);
  });

  it('treats an unterminated fence as not-frontmatter', () => {
    const input = '---\nkey: value\nno closing fence here\n';
    const parsed = parseFrontmatter(input);
    expect(parsed.hasFrontmatter).toBe(false);
    expect(parsed.body).toBe(input);
  });

  it('throws when the YAML root is not a mapping', () => {
    const input = '---\n- a\n- b\n---\n';
    expect(() => parseFrontmatter(input)).toThrow(/mapping/i);
  });
});

describe('serializeFrontmatter — basics', () => {
  it('emits just the body when frontmatter is empty and not forced', () => {
    expect(serializeFrontmatter({}, 'hello\n')).toBe('hello\n');
  });

  it('emits the fence when forced even with empty frontmatter', () => {
    expect(serializeFrontmatter({}, 'body\n', { alwaysEmit: true })).toBe('---\n---\nbody\n');
  });

  it('emits CRLF when requested', () => {
    const out = serializeFrontmatter({ k: 1 }, 'body\n', { lineEnding: 'crlf' });
    expect(out).toBe('---\r\nk: 1\r\n---\r\nbody\r\n');
  });

  it('preserves a body that lacks a trailing newline', () => {
    const out = serializeFrontmatter({ k: 1 }, 'body');
    expect(out).toBe('---\nk: 1\n---\nbody');
  });
});

describe('detectLineEnding', () => {
  it('returns lf for LF-only', () => {
    expect(detectLineEnding('a\nb\n')).toBe('lf');
  });
  it('returns crlf for CRLF', () => {
    expect(detectLineEnding('a\r\nb\r\n')).toBe('crlf');
  });
  it('returns lf for empty / single-line input', () => {
    expect(detectLineEnding('')).toBe('lf');
    expect(detectLineEnding('one line')).toBe('lf');
  });
});

describe('round-trip — fixture corpus (byte-for-byte after LF normalization)', () => {
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.md'));

  // Sanity check on coverage — must satisfy acceptance criterion of ≥ 10 fixtures.
  it('has at least 10 fixtures', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of files) {
    it(`${file} round-trips`, () => {
      // Read as UTF-8; git's autocrlf may rewrite, so normalize to LF as our canonical form.
      const raw = readFileSync(join(fixturesDir, file), 'utf8').replace(/\r\n/g, '\n');
      const parsed = parseFrontmatter(raw);
      const out = serializeFrontmatter(parsed.frontmatter, parsed.body, {
        alwaysEmit: parsed.hasFrontmatter,
      });
      expect(out).toBe(raw);
    });
  }
});

// ---------- Property test (the round-trip invariant for generated frontmatter) ----------

// Avoid control chars (yaml escapes them and emits quoted forms in ways that complicate equality)
// and the YAML "special" leading characters that force quoting in ways that still round-trip
// through the *object* but not byte-for-byte through the *string*. We test the structural inverse:
// parse(serialize(fm, body)) deep-equals { fm, body } — the contract callers actually rely on.
const safeString = fc.stringMatching(/^[A-Za-z0-9 _.,/:;()[\]{}@#!?+=*&^%$<>|~`'-]{0,40}$/);

const scalar = (): fc.Arbitrary<unknown> =>
  fc.oneof(
    safeString,
    fc.integer({ min: -1_000_000, max: 1_000_000 }),
    fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e9, max: 1e9 }),
    fc.boolean(),
    fc.constant(null),
  );

const arbitraryFrontmatterValue: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  value: fc.oneof(
    { weight: 8, arbitrary: scalar() },
    { weight: 2, arbitrary: fc.array(tie('value'), { maxLength: 4 }) },
    {
      weight: 2,
      arbitrary: fc.dictionary(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,12}$/), tie('value'), {
        maxKeys: 4,
      }),
    },
  ),
})).value;

const arbitraryFrontmatter = fc.dictionary(
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,16}$/),
  arbitraryFrontmatterValue,
  { maxKeys: 8 },
);

const arbitraryBody = fc.stringMatching(/^[A-Za-z0-9 \n.,!?#*_:'/-]{0,200}$/);

describe('round-trip property — parse(serialize(fm, body)) ≈ { fm, body }', () => {
  it('survives 1000 random objects', () => {
    fc.assert(
      fc.property(arbitraryFrontmatter, arbitraryBody, (fm, body) => {
        const text = serializeFrontmatter(fm, body, {
          alwaysEmit: Object.keys(fm).length === 0,
        });
        const parsed = parseFrontmatter(text);
        // Body must come back exactly. (We seeded with a body containing only LF — no CRLF.)
        expect(parsed.body).toBe(body);
        // Frontmatter must deep-equal. We compare via JSON to ignore key ordering and
        // -0 / +0 ambiguities consistently.
        expect(JSON.parse(JSON.stringify(parsed.frontmatter))).toEqual(
          JSON.parse(JSON.stringify(fm)),
        );
      }),
      { numRuns: 1000 },
    );
  });
});
