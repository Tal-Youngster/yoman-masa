import type { Accommodation } from '@/domain/accommodation';
import type { Place } from '@/domain/place';

export type PathPointKind = 'accommodation' | 'place';

export interface PathPoint {
  /** ISO yyyy-mm-dd. For accommodations this is `checkin`; for places, `visited_date`. */
  date: string;
  position: { lat: number; lng: number };
  kind: PathPointKind;
  entityId: string;
  /** Marker title (accommodation name, or place alias / place_id fallback). */
  label: string;
}

export interface ComputePathInput {
  accommodations: readonly Accommodation[];
  places: readonly Place[];
}

/**
 * Date-ordered concatenation of accommodation check-ins and visited-place
 * dates. Pure (no Google Maps types — `position` is a plain `{lat, lng}`),
 * so the function is testable in Node.
 *
 * Drops:
 * - cancelled accommodations,
 * - accommodations without `location`,
 * - non-visited places,
 * - visited places without `visited_date` or coordinates.
 *
 * Tie-breaking on the same date:
 * 1. accommodations before places (a stay anchors the day),
 * 2. then by `entityId` lexicographic order (deterministic for tests).
 */
export function computePath({ accommodations, places }: ComputePathInput): PathPoint[] {
  const points: PathPoint[] = [];

  for (const a of accommodations) {
    if (a.status === 'cancelled') continue;
    const loc = a.location;
    if (!loc) continue;
    points.push({
      date: a.checkin,
      position: { lat: loc.lat, lng: loc.lng },
      kind: 'accommodation',
      entityId: a.id,
      label: a.name,
    });
  }

  for (const p of places) {
    if (!p.visited) continue;
    if (!p.visited_date) continue;
    if (p.lat === undefined || p.lng === undefined) continue;
    points.push({
      date: p.visited_date,
      position: { lat: p.lat, lng: p.lng },
      kind: 'place',
      entityId: p.id,
      label: p.place_alias || p.place_id,
    });
  }

  points.sort((x, y) => {
    if (x.date !== y.date) return x.date < y.date ? -1 : 1;
    if (x.kind !== y.kind) return x.kind === 'accommodation' ? -1 : 1;
    return x.entityId < y.entityId ? -1 : 1;
  });

  return points;
}
