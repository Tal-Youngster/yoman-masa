import { parseFrontmatter, serializeFrontmatter, type LineEnding } from '@/lib/markdown';
import { Accommodation } from '@/domain/accommodation';

export interface ParsedAccommodation {
  accommodation: Accommodation;
  /** Extra (non-Accommodation) frontmatter keys. Preserved on serialize. */
  extraFrontmatter: Record<string, unknown>;
  /** Body content below the frontmatter, LF-normalized. */
  body: string;
  /** Original line ending detected in the source — restored on serialize. */
  lineEnding: LineEnding;
  hasFrontmatter: boolean;
}

const ACCOMMODATION_FRONTMATTER_KEYS = [
  'type',
  'id',
  'trip_id',
  'status',
  'name',
  'service',
  'service_other_label',
  'confirmation',
  'checkin',
  'checkout',
  'checkin_time',
  'checkout_time',
  'cost',
  'currency',
  'price',
  'location',
  'url',
  'host',
  'attachments',
  'notes',
] as const;
type AccommodationKey = (typeof ACCOMMODATION_FRONTMATTER_KEYS)[number];

function partitionFrontmatter(fm: Record<string, unknown>): {
  accommodation: Record<string, unknown>;
  extra: Record<string, unknown>;
} {
  const accFm: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    if ((ACCOMMODATION_FRONTMATTER_KEYS as readonly string[]).includes(k)) {
      accFm[k] = v;
    } else {
      extra[k] = v;
    }
  }
  
  if (accFm.price !== undefined) accFm.price = Number(accFm.price);
  if (typeof accFm.currency === 'string' || typeof accFm.currency === 'number') accFm.currency = String(accFm.currency);
  if (typeof accFm.checkin_time === 'string' || typeof accFm.checkin_time === 'number') accFm.checkin_time = String(accFm.checkin_time);
  if (typeof accFm.checkout_time === 'string' || typeof accFm.checkout_time === 'number') accFm.checkout_time = String(accFm.checkout_time);
  
  return { accommodation: accFm, extra };
}

export function parseAccommodation(content: string): ParsedAccommodation {
  const parsed = parseFrontmatter(content);
  const { accommodation: accFm, extra } = partitionFrontmatter(parsed.frontmatter);
  
  const accommodation = Accommodation.parse(accFm);
  return {
    accommodation,
    extraFrontmatter: extra,
    body: parsed.body,
    lineEnding: parsed.lineEnding,
    hasFrontmatter: parsed.hasFrontmatter,
  };
}

export function tryParseAccommodation(content: string): ParsedAccommodation | null {
  try {
    const parsed = parseFrontmatter(content);
    if (parsed.frontmatter['type'] !== 'accommodation') return null;
    return parseAccommodation(content);
  } catch {
    return null;
  }
}

export function serializeAccommodation(
  accommodation: Accommodation,
  body: string,
  opts: {
    extraFrontmatter?: Record<string, unknown>;
    lineEnding?: LineEnding;
    alwaysEmit?: boolean;
  } = {},
): string {
  const fm: Record<string, unknown> = {};
  for (const key of ACCOMMODATION_FRONTMATTER_KEYS) {
    const v = (accommodation as Record<AccommodationKey, unknown>)[key];
    if (v !== undefined && v !== null) {
      fm[key] = v;
    }
  }
  
  // Prune default empty arrays/strings to keep frontmatter clean, optional but good practice
  if (Array.isArray(fm.attachments) && fm.attachments.length === 0) {
    delete fm.attachments;
  }
  if (fm.notes === '') {
    delete fm.notes;
  }

  if (opts.extraFrontmatter) {
    for (const [k, v] of Object.entries(opts.extraFrontmatter)) {
      if (!(ACCOMMODATION_FRONTMATTER_KEYS as readonly string[]).includes(k)) {
        fm[k] = v;
      }
    }
  }
  return serializeFrontmatter(fm, body, {
    ...(opts.lineEnding ? { lineEnding: opts.lineEnding } : {}),
    alwaysEmit: opts.alwaysEmit ?? true,
  });
}
