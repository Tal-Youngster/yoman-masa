/**
 * Trip markdown parser / serializer.
 *
 * Frontmatter shape (ADR-0004): all Zod fields of `Trip` plus `type: 'trip'`.
 * Body is whatever the user has typed below the frontmatter — preserved
 * verbatim on round-trip (LF normalization is acceptable, line ending
 * restored on serialize).
 *
 * Unknown frontmatter keys are *preserved* in `extraFrontmatter`; serializing
 * merges them back over the canonical Trip fields so user-added keys in
 * Obsidian survive an app write.
 */

import {
  parseFrontmatter,
  serializeFrontmatter,
  type LineEnding,
} from '@/lib/markdown';
import { Trip } from '@/domain/trip';

export interface ParsedTrip {
  trip: Trip;
  /** Extra (non-Trip) frontmatter keys. Preserved on serialize. */
  extraFrontmatter: Record<string, unknown>;
  /** Body content below the frontmatter, LF-normalized. */
  body: string;
  /** Original line ending detected in the source — restored on serialize. */
  lineEnding: LineEnding;
  hasFrontmatter: boolean;
}

const TRIP_FRONTMATTER_KEYS = [
  'type',
  'id',
  'slug',
  'name',
  'start_date',
  'end_date',
  'home_currency',
  'status',
  'notes',
] as const;
type TripKey = (typeof TRIP_FRONTMATTER_KEYS)[number];

function partitionFrontmatter(fm: Record<string, unknown>): {
  trip: Record<string, unknown>;
  extra: Record<string, unknown>;
} {
  const tripFm: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    if ((TRIP_FRONTMATTER_KEYS as readonly string[]).includes(k)) {
      tripFm[k] = v;
    } else {
      extra[k] = v;
    }
  }
  return { trip: tripFm, extra };
}

/**
 * Parse a `Trip.md` file. Throws if the frontmatter has `type` ≠ `'trip'` or
 * the Trip Zod validation fails. Callers that want a soft check should catch
 * and return `null`.
 */
export function parseTrip(content: string): ParsedTrip {
  const parsed = parseFrontmatter(content);
  const { trip: tripFm, extra } = partitionFrontmatter(parsed.frontmatter);
  // If `type` is missing the call still surfaces as a Zod failure, which is
  // what we want: a Trip.md without `type: trip` is malformed.
  const trip = Trip.parse(tripFm);
  return {
    trip,
    extraFrontmatter: extra,
    body: parsed.body,
    lineEnding: parsed.lineEnding,
    hasFrontmatter: parsed.hasFrontmatter,
  };
}

/**
 * Best-effort guard: returns null if the content isn't a Trip file (wrong
 * `type`, missing frontmatter, or Zod refusal). Useful from reconcilers that
 * need to distinguish "this file is something else" from "this file is broken".
 */
export function tryParseTrip(content: string): ParsedTrip | null {
  try {
    const parsed = parseFrontmatter(content);
    if (parsed.frontmatter['type'] !== 'trip') return null;
    return parseTrip(content);
  } catch {
    return null;
  }
}

/**
 * Serialize a Trip back to markdown, restoring CRLF if the source had it and
 * preserving any unknown frontmatter keys the user added in Obsidian.
 *
 * Field order: canonical Trip keys (in declaration order) followed by
 * unknown keys — stable so unchanged files survive round-trip byte-for-byte
 * after LF normalization.
 */
export function serializeTrip(
  trip: Trip,
  body: string,
  opts: {
    extraFrontmatter?: Record<string, unknown>;
    lineEnding?: LineEnding;
    /** If false and body is empty + no extras, the trailing fence still emits — frontmatter is required. */
    alwaysEmit?: boolean;
  } = {},
): string {
  const fm: Record<string, unknown> = {};
  for (const key of TRIP_FRONTMATTER_KEYS) {
    const v = (trip as Record<TripKey, unknown>)[key];
    if (v !== undefined) fm[key] = v;
  }
  if (opts.extraFrontmatter) {
    for (const [k, v] of Object.entries(opts.extraFrontmatter)) {
      // Don't let extras clobber canonical fields.
      if (!(TRIP_FRONTMATTER_KEYS as readonly string[]).includes(k)) {
        fm[k] = v;
      }
    }
  }
  return serializeFrontmatter(fm, body, {
    ...(opts.lineEnding ? { lineEnding: opts.lineEnding } : {}),
    alwaysEmit: opts.alwaysEmit ?? true,
  });
}
