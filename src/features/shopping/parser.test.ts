import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { TripId } from '@/domain/ids';
import { ShoppingItem } from '@/domain/shopping-item';
import {
  parseShoppingItemLine,
  parseShoppingFile,
  isShoppingItemLine,
  ShoppingItemLineParseError,
} from './parser';
import { serializeShoppingItemLine } from './serializer';

const TRIP = TripId.parse('trp_01HABCDEFGHJKMNPQRSTVWXYZ0');

/**
 * Corpus of canonically-ordered shopping lines (ADR-0004). Each round-trips
 * byte-for-byte through parse → serialize. Covers: bought/not-bought, qty only,
 * cost only, both, bought_date with ✅, multi-word names, multiple tags, unknown
 * trailing tokens, names containing parens that are NOT inline fields.
 */
const CORPUS: string[] = [
  '- [ ] Trail runners ^s-01HABCDEFGHJKMNPQRSTVWXYZ0',
  '- [x] Sunscreen ✅ 2026-05-10 ^s-01HABCDEFGHJKMNPQRSTVWXYZ1',
  '- [ ] Hiking poles (qty:: 2) ^s-01HABCDEFGHJKMNPQRSTVWXYZ2',
  '- [ ] Trail runners (cost:: 120.00 USD) ^s-01HABCDEFGHJKMNPQRSTVWXYZ3',
  '- [ ] Trail runners (qty:: 1) (cost:: 120.00 USD) #gear/shoes ^s-01HABCDEFGHJKMNPQRSTVWXYZ4',
  '- [x] Sunscreen (qty:: 2) ✅ 2026-05-10 #toiletries ^s-01HABCDEFGHJKMNPQRSTVWXYZ5',
  '- [ ] Multi word item name with several words ^s-01HABCDEFGHJKMNPQRSTVWXYZ6',
  '- [ ] Tagged item #gear #urgent ^s-01HABCDEFGHJKMNPQRSTVWXYZ7',
  '- [ ] Item with unknown token (qty:: 3) 🔁 weekly ^s-01HABCDEFGHJKMNPQRSTVWXYZ8',
  '- [x] Everything (qty:: 5) (cost:: 99.99 EUR) ✅ 2026-04-01 #gear/shoes #urgent ^s-01HABCDEFGHJKMNPQRSTVWXYZ9',
  '- [ ] Hat (red) (qty:: 1) ^s-01HABCDEFGHJKMNPQRSTVWXYZA',
  '- [ ] Item with link [docs](https://example.com) (qty:: 1) ^s-01HABCDEFGHJKMNPQRSTVWXYZB',
  '- [ ] Plain with trailing tag only #misc ^s-01HABCDEFGHJKMNPQRSTVWXYZC',
];

describe('parseShoppingItemLine', () => {
  it('parses the canonical ADR-0004 example', () => {
    const line =
      '- [ ] Trail runners (qty:: 1) (cost:: 120.00 USD) #gear/shoes ^s-01HABCDEFGHJKMNPQRSTVWXYZ4';
    const { item, blockRef } = parseShoppingItemLine(line, TRIP);
    expect(item.name).toBe('Trail runners');
    expect(item.bought).toBe(false);
    expect(item.quantity).toBe(1);
    expect(item.estimated_cost).toEqual({ amount: 120, currency: 'USD' });
    expect(item.tags).toEqual(['gear/shoes']);
    expect(item.trip_id).toBe(TRIP);
    expect(blockRef).toBe('s-01HABCDEFGHJKMNPQRSTVWXYZ4');
  });

  it('reads `[x]` as bought and `[ ]` as not bought', () => {
    const open = parseShoppingItemLine('- [ ] a ^s-01HABCDEFGHJKMNPQRSTVWXYZ0', null);
    const done = parseShoppingItemLine('- [x] a ^s-01HABCDEFGHJKMNPQRSTVWXYZ0', null);
    expect(open.item.bought).toBe(false);
    expect(done.item.bought).toBe(true);
  });

  it('reads the `✅ YYYY-MM-DD` date as bought_date', () => {
    const { item } = parseShoppingItemLine(
      '- [x] Sunscreen ✅ 2026-05-10 #toiletries ^s-01HABCDEFGHJKMNPQRSTVWXYZ5',
      null,
    );
    expect(item.bought_date).toBe('2026-05-10');
    expect(item.tags).toEqual(['toiletries']);
  });

  it('keeps an unknown emoji + value verbatim', () => {
    const { item } = parseShoppingItemLine(
      '- [ ] Item with unknown token (qty:: 3) 🔁 weekly ^s-01HABCDEFGHJKMNPQRSTVWXYZ8',
      null,
    );
    expect(item.unknown_tokens).toEqual(['🔁', 'weekly']);
    expect(item.quantity).toBe(3);
  });

  it('keeps parens inside the name when they are not an inline field', () => {
    const { item } = parseShoppingItemLine(
      '- [ ] Hat (red) (qty:: 1) ^s-01HABCDEFGHJKMNPQRSTVWXYZA',
      null,
    );
    expect(item.name).toBe('Hat (red)');
    expect(item.quantity).toBe(1);
  });

  it('keeps an inline markdown link inside the name', () => {
    const { item } = parseShoppingItemLine(
      '- [ ] Item with link [docs](https://example.com) (qty:: 1) ^s-01HABCDEFGHJKMNPQRSTVWXYZB',
      null,
    );
    expect(item.name).toBe('Item with link [docs](https://example.com)');
    expect(item.quantity).toBe(1);
  });

  it('captures the source indentation', () => {
    const { indent, item } = parseShoppingItemLine(
      '    - [ ] Nested ^s-01HABCDEFGHJKMNPQRSTVWXYZ0',
      null,
    );
    expect(indent).toBe('    ');
    expect(item.name).toBe('Nested');
  });

  it('throws without a block ref', () => {
    expect(() => parseShoppingItemLine('- [ ] no ref here', null)).toThrow(
      ShoppingItemLineParseError,
    );
  });

  it('throws on an empty name', () => {
    expect(() =>
      parseShoppingItemLine(
        '- [ ] (qty:: 1) ^s-01HABCDEFGHJKMNPQRSTVWXYZ0',
        null,
      ),
    ).toThrow(/empty item name/);
  });

  it('throws on a non-positive quantity', () => {
    expect(() =>
      parseShoppingItemLine(
        '- [ ] x (qty:: 0) ^s-01HABCDEFGHJKMNPQRSTVWXYZ0',
        null,
      ),
    ).toThrow(/must be a positive integer/);
  });

  it('throws on an unsupported status marker', () => {
    expect(() =>
      parseShoppingItemLine('- [/] in progress ^s-01HABCDEFGHJKMNPQRSTVWXYZ0', null),
    ).toThrow(/unsupported status marker/);
  });
});

describe('isShoppingItemLine', () => {
  it('detects item-shaped lines', () => {
    expect(isShoppingItemLine(CORPUS[0])).toBe(true);
    expect(isShoppingItemLine('- [ ] missing block ref')).toBe(false);
    expect(isShoppingItemLine('# heading')).toBe(false);
    expect(isShoppingItemLine('just text')).toBe(false);
  });
});

describe('corpus round-trip (byte-for-byte)', () => {
  for (const line of CORPUS) {
    it(`round-trips: ${line.slice(0, 56)}…`, () => {
      const { item, indent } = parseShoppingItemLine(line, null);
      expect(serializeShoppingItemLine(item, indent)).toBe(line);
    });
  }
});

describe('parseShoppingFile', () => {
  const file = `---
type: shopping
trip_id: trp_01HABCDEFGHJKMNPQRSTVWXYZ0
---

# Shopping for the trip

- [ ] Trail runners (qty:: 1) ^s-01HABCDEFGHJKMNPQRSTVWXYZ0
- [x] Sunscreen ✅ 2026-05-10 #toiletries ^s-01HABCDEFGHJKMNPQRSTVWXYZ1

A free-form note I want preserved.
`;

  it('parses item lines and stamps trip_id from frontmatter', () => {
    const parsed = parseShoppingFile(file);
    expect(parsed.tripId).toBe(TRIP);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]?.name).toBe('Trail runners');
    expect(parsed.items[1]?.bought).toBe(true);
    expect(parsed.items.every((s) => s.trip_id === TRIP)).toBe(true);
  });

  it('preserves non-item lines in trailingBody', () => {
    const parsed = parseShoppingFile(file);
    expect(parsed.trailingBody).toContain('# Shopping for the trip');
    expect(parsed.trailingBody).toContain('A free-form note I want preserved.');
  });

  it('treats a missing trip_id as the General list', () => {
    const general = `---
type: shopping
---

- [ ] Buy travel adapter ^s-01HABCDEFGHJKMNPQRSTVWXYZ0
`;
    const parsed = parseShoppingFile(general);
    expect(parsed.tripId).toBeNull();
    expect(parsed.items[0]?.trip_id).toBeNull();
  });
});

describe('serialize → parse property', () => {
  const ulidBody = fc
    .string({ minLength: 26, maxLength: 26 })
    .map((s) => s.replace(/[^0-9A-HJKMNP-TV-Z]/g, '0').toUpperCase())
    .map((s) => s.padEnd(26, '0').slice(0, 26));

  // Name words: letters/digits only so no token is mistaken for metadata.
  const nameWord = fc
    .string({ minLength: 1, maxLength: 8 })
    .map((s) => s.replace(/[^A-Za-z0-9]/g, 'x'))
    .map((s) => (s.length === 0 ? 'x' : s));

  // Tag words: same alphabet plus '/' for nesting.
  const tagWord = fc
    .string({ minLength: 1, maxLength: 8 })
    .map((s) => s.replace(/[^a-z0-9/]/g, 'a'))
    .map((s) => (s.length === 0 ? 'a' : s));

  const dateArb = fc
    .integer({ min: 1, max: 28 })
    .map((d) => `2026-06-${String(d).padStart(2, '0')}`);

  // Cost amounts canonicalise to two decimals on serialize.
  const costAmount = fc
    .integer({ min: 1, max: 99999 })
    .map((n) => Math.round(n) / 100);

  it('parse(serialize(item)) preserves structured fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          body: ulidBody,
          bought: fc.boolean(),
          nameWords: fc.array(nameWord, { minLength: 1, maxLength: 5 }),
          quantity: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
          cost: fc.option(
            fc.record({
              amount: costAmount,
              currency: fc.constantFrom('USD', 'EUR', 'GBP', 'JPY', 'ILS'),
            }),
            { nil: undefined },
          ),
          bought_date: fc.option(dateArb, { nil: undefined }),
          tags: fc.array(tagWord, { maxLength: 3 }),
        }),
        (spec) => {
          const item = ShoppingItem.parse({
            type: 'shopping_item',
            id: `shp_${spec.body}`,
            trip_id: null,
            name: spec.nameWords.join(' '),
            bought: spec.bought,
            ...(spec.quantity !== undefined ? { quantity: spec.quantity } : {}),
            ...(spec.cost
              ? { estimated_cost: { amount: spec.cost.amount, currency: spec.cost.currency } }
              : {}),
            ...(spec.bought_date ? { bought_date: spec.bought_date } : {}),
            tags: spec.tags.filter((t) => t.length > 0),
          });
          const line = serializeShoppingItemLine(item);
          const reparsed = parseShoppingItemLine(line, null).item;
          expect(reparsed).toEqual(item);
        },
      ),
      { numRuns: 300 },
    );
  });
});
