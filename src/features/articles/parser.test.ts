import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { newArticle } from '@/domain/article';
import { newPlaceId, newTripId } from '@/domain/ids';

import { parseArticle, serializeArticle, tryParseArticle } from './parser';

const tripId = newTripId();
const placeId = newPlaceId();

const sample = newArticle({
  trip_id: tripId,
  url: 'https://example.com/best-hanoi-food',
  title: 'Best Hanoi Street Food',
  tags: ['food', 'hanoi'],
  place_id: placeId,
  slug: 'best-hanoi-street-food',
  notes: '',
});

describe('parseArticle', () => {
  it('parses a canonical article file', () => {
    const md = serializeArticle(sample, '');
    const out = parseArticle(md);
    expect(out.article).toEqual(sample);
    expect(out.body).toBe('');
    expect(out.lineEnding).toBe('lf');
    expect(out.extraFrontmatter).toEqual({});
  });

  it('reads the body as the article notes', () => {
    const body = "%% Source: a friend's blog %%\n\nTop picks:\n\n- Bun cha at 24 Le Van Huu\n";
    const md = serializeArticle(sample, body);
    const out = parseArticle(md);
    expect(out.body).toBe(body);
    expect(out.article.notes).toBe(body);
  });

  it('accepts a General article (trip_id: null)', () => {
    const general = newArticle({
      trip_id: null,
      url: 'https://example.com/packing',
      title: 'Packing list ideas',
    });
    const md = serializeArticle(general, '');
    expect(md).toContain('trip_id: null');
    expect(parseArticle(md).article.trip_id).toBeNull();
  });

  it('parses a hand-written note with no slug key', () => {
    const md = [
      '---',
      'type: article',
      `id: ${sample.id}`,
      `trip_id: ${tripId}`,
      'url: https://example.com/best-hanoi-food',
      'title: Best Hanoi Street Food',
      '---',
      '',
      'Written in Obsidian.',
      '',
    ].join('\n');
    const out = parseArticle(md);
    expect(out.article.slug).toBeUndefined();
    expect(out.article.tags).toEqual([]);
    expect(out.article.place_id).toBeNull();
    // The blank line after the closing `---` belongs to the body — the parser
    // preserves it rather than trimming, so a round-trip stays byte-identical.
    expect(out.article.notes).toBe('\nWritten in Obsidian.\n');
  });

  it('preserves unknown frontmatter keys through a round-trip', () => {
    const md = serializeArticle(sample, 'Body.\n', {
      extraFrontmatter: { cssclass: 'reading', 'obsidian-plugin-key': [1, 2] },
    });
    const out = parseArticle(md);
    expect(out.extraFrontmatter).toEqual({ cssclass: 'reading', 'obsidian-plugin-key': [1, 2] });

    const back = serializeArticle(out.article, out.body, {
      extraFrontmatter: out.extraFrontmatter,
      lineEnding: out.lineEnding,
    });
    expect(back).toBe(md);
  });

  it('restores CRLF on serialize when the source used CRLF', () => {
    const lfMd = serializeArticle(sample, 'First line\nSecond line\n');
    const crlf = lfMd.replace(/\n/g, '\r\n');
    const out = parseArticle(crlf);
    expect(out.lineEnding).toBe('crlf');
    const back = serializeArticle(out.article, out.body, { lineEnding: out.lineEnding });
    expect(back).toBe(crlf);
  });

  it('omits empty tags and a null place_id from the frontmatter', () => {
    const bare = newArticle({
      trip_id: tripId,
      url: 'https://example.com/x',
      title: 'Bare',
    });
    const md = serializeArticle(bare, '');
    expect(md).not.toContain('tags:');
    expect(md).not.toContain('place_id:');
  });

  it('preserves a Unicode title through a round-trip', () => {
    const article = { ...sample, title: 'טיול ליפן 京都へ 2026 ✈️' };
    const out = parseArticle(serializeArticle(article, ''));
    expect(out.article.title).toBe(article.title);
  });
});

describe('tryParseArticle', () => {
  it('returns null for a file that is not an article', () => {
    expect(tryParseArticle('---\ntype: place\nid: plc_x\n---\n')).toBeNull();
  });

  it('returns null for broken frontmatter rather than throwing', () => {
    expect(tryParseArticle('---\ntype: article\n  bad: [unclosed\n---\n')).toBeNull();
  });

  it('returns null when a required field fails validation', () => {
    const md = ['---', 'type: article', 'id: not-an-ulid', 'title: x', '---', ''].join('\n');
    expect(tryParseArticle(md)).toBeNull();
  });
});

describe('parseArticle round-trip property', () => {
  it('serialize(parse(md)) === md for byte-for-byte LF inputs', () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0),
          tags: fc.array(fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/), { maxLength: 4 }),
          body: fc.string({ maxLength: 200 }),
        }),
        ({ title, tags, body }) => {
          const article = newArticle({
            trip_id: tripId,
            url: 'https://example.com/post',
            title,
            tags,
            slug: 'post',
          });
          const md = serializeArticle(article, body);
          const out = parseArticle(md);
          const back = serializeArticle(out.article, out.body, {
            extraFrontmatter: out.extraFrontmatter,
            lineEnding: out.lineEnding,
          });
          expect(back).toBe(md);
        },
      ),
      { numRuns: 300 },
    );
  });
});
