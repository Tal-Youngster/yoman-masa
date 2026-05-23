import { parseFrontmatter, serializeFrontmatter, type LineEnding } from '@/lib/markdown';
import { Place } from '@/domain/place';

export interface ParsedPlace {
  place: Place;
  /** Extra (non-Place) frontmatter keys. Preserved on serialize. */
  extraFrontmatter: Record<string, unknown>;
  /** Body content below the frontmatter, LF-normalized. */
  body: string;
  /** Original line ending detected in the source — restored on serialize. */
  lineEnding: LineEnding;
  hasFrontmatter: boolean;
}

const PLACE_FRONTMATTER_KEYS = [
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
] as const;
type PlaceKey = (typeof PLACE_FRONTMATTER_KEYS)[number];

function partitionFrontmatter(fm: Record<string, unknown>): {
  place: Record<string, unknown>;
  extra: Record<string, unknown>;
} {
  const placeFm: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    if ((PLACE_FRONTMATTER_KEYS as readonly string[]).includes(k)) {
      placeFm[k] = v;
    } else {
      extra[k] = v;
    }
  }

  // Handle parsing numbers from string representation that yaml parser might return
  if (placeFm.lat !== undefined) placeFm.lat = Number(placeFm.lat);
  if (placeFm.lng !== undefined) placeFm.lng = Number(placeFm.lng);

  return { place: placeFm, extra };
}

export function parsePlace(content: string): ParsedPlace {
  const parsed = parseFrontmatter(content);
  const { place: placeFm, extra } = partitionFrontmatter(parsed.frontmatter);

  const place = Place.parse(placeFm);
  return {
    place,
    extraFrontmatter: extra,
    body: parsed.body,
    lineEnding: parsed.lineEnding,
    hasFrontmatter: parsed.hasFrontmatter,
  };
}

export function tryParsePlace(content: string): ParsedPlace | null {
  try {
    const parsed = parseFrontmatter(content);
    if (parsed.frontmatter['type'] !== 'place') return null;
    return parsePlace(content);
  } catch {
    return null;
  }
}

export function serializePlace(
  place: Place,
  body: string,
  opts: {
    extraFrontmatter?: Record<string, unknown>;
    lineEnding?: LineEnding;
    alwaysEmit?: boolean;
  } = {},
): string {
  const fm: Record<string, unknown> = {};
  for (const key of PLACE_FRONTMATTER_KEYS) {
    const v = (place as Record<PlaceKey, unknown>)[key];
    if (v !== undefined && v !== null) {
      fm[key] = v;
    }
  }

  if (fm.notes === '') {
    delete fm.notes;
  }
  if (fm.category === '') {
    delete fm.category;
  }
  if (fm.visited === false) {
    delete fm.visited;
  }

  if (opts.extraFrontmatter) {
    for (const [k, v] of Object.entries(opts.extraFrontmatter)) {
      if (!(PLACE_FRONTMATTER_KEYS as readonly string[]).includes(k)) {
        fm[k] = v;
      }
    }
  }
  return serializeFrontmatter(fm, body, {
    ...(opts.lineEnding ? { lineEnding: opts.lineEnding } : {}),
    alwaysEmit: opts.alwaysEmit ?? true,
  });
}
