import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { newTrip } from '@/domain/trip';
import { isoDate } from '@/domain/dates';
import { currency } from '@/domain/money';

import { parseTrip, serializeTrip, tryParseTrip } from './parser';

const sample = newTrip({
  slug: 'kyoto-2026',
  name: 'Kyoto 2026',
  start_date: isoDate('2026-09-01'),
  end_date: isoDate('2026-09-21'),
  home_currency: currency('USD'),
  status: 'planned',
});

describe('parseTrip', () => {
  it('parses a canonical Trip.md', () => {
    const md = serializeTrip(sample, '');
    const out = parseTrip(md);
    expect(out.trip).toEqual(sample);
    expect(out.body).toBe('');
    expect(out.lineEnding).toBe('lf');
    expect(out.extraFrontmatter).toEqual({});
  });

  it('preserves a Unicode trip name through round-trip', () => {
    const trip = { ...sample, name: 'טיול ליפן 京都へ 2026 ✈️' };
    const md = serializeTrip(trip, '');
    const out = parseTrip(md);
    expect(out.trip.name).toBe(trip.name);
  });

  it('preserves multi-paragraph body verbatim (LF)', () => {
    const body = 'Itinerary:\n\nDay 1 — Arashiyama\nDay 2 — Fushimi Inari\n\nNotes welcome.\n';
    const md = serializeTrip(sample, body);
    const out = parseTrip(md);
    expect(out.body).toBe(body);
  });

  it('restores CRLF on serialize when source used CRLF', () => {
    const lfMd = serializeTrip(sample, 'First line\nSecond line\n');
    const crlf = lfMd.replace(/\n/g, '\r\n');
    const out = parseTrip(crlf);
    expect(out.lineEnding).toBe('crlf');
    expect(out.body).toBe('First line\nSecond line\n'); // body normalized to LF internally

    const back = serializeTrip(out.trip, out.body, {
      lineEnding: out.lineEnding,
    });
    expect(back).toBe(crlf);
  });

  it('preserves extra (non-Trip) frontmatter keys', () => {
    const md = serializeTrip(sample, '', {
      extraFrontmatter: { theme: 'sakura', tags: ['travel', 'japan'] },
    });
    const out = parseTrip(md);
    expect(out.trip).toEqual(sample);
    expect(out.extraFrontmatter).toEqual({
      theme: 'sakura',
      tags: ['travel', 'japan'],
    });

    const back = serializeTrip(out.trip, out.body, {
      extraFrontmatter: out.extraFrontmatter,
    });
    expect(back).toBe(md);
  });

  it('throws if `type` is not `trip`', () => {
    const md = serializeTrip(sample, '').replace('type: trip', 'type: accommodation');
    expect(() => parseTrip(md)).toThrow();
  });

  it('tryParseTrip returns null for non-trip files', () => {
    expect(tryParseTrip('---\ntype: accommodation\nname: Foo\n---\n')).toBeNull();
    expect(tryParseTrip('no frontmatter here')).toBeNull();
  });
});

describe('parseTrip round-trip property', () => {
  it('serialize(parse(md)) === md for byte-for-byte LF inputs', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.unicodeString({ minLength: 1, maxLength: 40 }).filter((s) => !!s.trim()),
          slug: fc
            .stringMatching(/^[a-z][a-z0-9-]{0,40}$/)
            .filter((s) => /^[a-z0-9][a-z0-9-]*$/.test(s)),
          status: fc.constantFrom(
            'planned' as const,
            'active' as const,
            'completed' as const,
            'archived' as const,
          ),
          notes: fc.string({ maxLength: 50 }),
          body: fc.string({ maxLength: 200 }),
          extras: fc.dictionary(
            fc
              .stringMatching(/^[a-z_][a-z0-9_]{0,12}$/)
              .filter(
                (k) =>
                  ![
                    'type',
                    'id',
                    'slug',
                    'name',
                    'start_date',
                    'end_date',
                    'home_currency',
                    'status',
                    'notes',
                  ].includes(k),
              ),
            fc.oneof(fc.integer(), fc.string({ maxLength: 20 })),
            { maxKeys: 3 },
          ),
        }),
        ({ name, slug, status, notes, body, extras }) => {
          const trip = newTrip({
            slug,
            name,
            start_date: isoDate('2026-06-01'),
            end_date: isoDate('2026-06-15'),
            home_currency: currency('USD'),
            status,
            notes,
          });
          const md = serializeTrip(trip, body, { extraFrontmatter: extras });
          const parsed = parseTrip(md);
          const back = serializeTrip(parsed.trip, parsed.body, {
            extraFrontmatter: parsed.extraFrontmatter,
          });
          expect(back).toBe(md);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
