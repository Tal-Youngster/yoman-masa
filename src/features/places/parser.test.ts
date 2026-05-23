import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { newPlace } from '@/domain/place';
import { newTripId } from '@/domain/ids';

import { parsePlace, serializePlace, tryParsePlace } from './parser';

const sampleTripId = newTripId();

const sample = newPlace({
  trip_id: sampleTripId,
  place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
  place_alias: 'Golden Gate Bridge',
  category: 'landmark',
  lat: 37.8199,
  lng: -122.4783,
  notes: 'Bring a jacket',
  visited: false,
});

describe('parsePlace', () => {
  it('parses a canonical Place.md', () => {
    const md = serializePlace(sample, '');
    const out = parsePlace(md);
    expect(out.place).toEqual(sample);
    expect(out.body).toBe('');
    expect(out.lineEnding).toBe('lf');
    expect(out.extraFrontmatter).toEqual({});
  });

  it('preserves a Unicode place alias through round-trip', () => {
    const place = { ...sample, place_alias: 'טיול ליפן 京都へ 2026 ✈️' };
    const md = serializePlace(place, '');
    const out = parsePlace(md);
    expect(out.place.place_alias).toBe(place.place_alias);
  });

  it('preserves multi-paragraph body verbatim (LF)', () => {
    const body = 'Itinerary:\n\nDay 1 — Walk\n\nNotes welcome.\n';
    const md = serializePlace(sample, body);
    const out = parsePlace(md);
    expect(out.body).toBe(body);
  });

  it('restores CRLF on serialize when source used CRLF', () => {
    const lfMd = serializePlace(sample, 'First line\nSecond line\n');
    const crlf = lfMd.replace(/\n/g, '\r\n');
    const out = parsePlace(crlf);
    expect(out.lineEnding).toBe('crlf');
    expect(out.body).toBe('First line\nSecond line\n'); // body normalized to LF internally

    const back = serializePlace(out.place, out.body, {
      lineEnding: out.lineEnding,
    });
    expect(back).toBe(crlf);
  });

  it('preserves extra (non-Place) frontmatter keys', () => {
    const md = serializePlace(sample, '', {
      extraFrontmatter: { theme: 'sakura', tags: ['travel', 'japan'] },
    });
    const out = parsePlace(md);
    expect(out.place).toEqual(sample);
    expect(out.extraFrontmatter).toEqual({
      theme: 'sakura',
      tags: ['travel', 'japan'],
    });

    const back = serializePlace(out.place, out.body, {
      extraFrontmatter: out.extraFrontmatter,
    });
    expect(back).toBe(md);
  });

  it('throws if `type` is not `place`', () => {
    const md = serializePlace(sample, '').replace('type: place', 'type: trip');
    expect(() => parsePlace(md)).toThrow();
  });

  it('tryParsePlace returns null for non-place files', () => {
    expect(tryParsePlace('---\ntype: trip\nplace_id: Foo\n---\n')).toBeNull();
    expect(tryParsePlace('no frontmatter here')).toBeNull();
  });
});

describe('parsePlace round-trip property', () => {
  it('serialize(parse(md)) === md for byte-for-byte LF inputs', () => {
    fc.assert(
      fc.property(
        fc.record({
          place_id: fc.unicodeString({ minLength: 1, maxLength: 40 }).filter((s) => !!s.trim()),
          place_alias: fc.unicodeString({ minLength: 1, maxLength: 40 }).filter((s) => !!s.trim()),
          category: fc.string({ maxLength: 20 }),
          lat: fc.double({ min: -90, max: 90 }),
          lng: fc.double({ min: -180, max: 180 }),
          notes: fc.string({ maxLength: 50 }),
          visited: fc.boolean(),
          body: fc.string({ maxLength: 200 }),
          extras: fc.dictionary(
            fc
              .stringMatching(/^[a-z_][a-z0-9_]{0,12}$/)
              .filter(
                (k) =>
                  ![
                    'type',
                    'id',
                    'trip_id',
                    'place_id',
                    'place_alias',
                    'category',
                    'lat',
                    'lng',
                    'notes',
                    'visited',
                    'visited_date',
                  ].includes(k),
              ),
            fc.oneof(fc.integer(), fc.string({ maxLength: 20 })),
            { maxKeys: 3 },
          ),
        }),
        ({ place_id, place_alias, category, lat, lng, notes, visited, body, extras }) => {
          const place = newPlace({
            trip_id: sampleTripId,
            place_id,
            place_alias,
            category,
            lat,
            lng,
            notes,
            visited,
          });
          const md = serializePlace(place, body, { extraFrontmatter: extras });
          const parsed = parsePlace(md);
          const back = serializePlace(parsed.place, parsed.body, {
            extraFrontmatter: parsed.extraFrontmatter,
          });
          expect(back).toBe(md);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
