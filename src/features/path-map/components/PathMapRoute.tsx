import { useMemo, useState } from 'react';
import { AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { useLiveQuery } from 'dexie-react-hooks';

import { GoogleMap } from '@/lib/maps/GoogleMap';
import { useActiveTrip } from '@/ui/layout/useActiveTrip';
import { Card } from '@/ui/components';
import { listAccommodationsByTrip } from '@/features/accommodations/queries';
import { placesByTrip } from '@/features/places/queries';
import {
  PATH_PIN_ACCOMMODATION,
  PATH_STROKE_COLOR,
  PLACE_PIN_VISITED,
  PLACE_PIN_WISHLIST,
} from '@/features/places/colors';

import { computePath, type PathPoint } from '../computePath';
import { PathLayer } from './PathLayer';
import { DateScrubber } from './DateScrubber';

export function PathMapRoute(): React.JSX.Element {
  const { activeTrip, loading } = useActiveTrip();

  const accommodations = useLiveQuery(
    () => (activeTrip ? listAccommodationsByTrip(activeTrip.id) : Promise.resolve([])),
    [activeTrip?.id],
  );

  const places = useLiveQuery(
    () => (activeTrip ? placesByTrip(activeTrip.id) : Promise.resolve([])),
    [activeTrip?.id],
  );

  // Pure date-ordered series; the scrubber slices this memoized result, it
  // does not re-run computePath (ADR-0015). useLiveQuery's reference is stable
  // between Dexie updates, so depending on the possibly-undefined value is fine.
  const allPoints = useMemo<PathPoint[]>(
    () => computePath({ accommodations: accommodations ?? [], places: places ?? [] }),
    [accommodations, places],
  );

  const allDates = useMemo(() => allPoints.map((p) => p.date), [allPoints]);
  const lastDate = allDates[allDates.length - 1] ?? '';

  // The scrubber's value starts unset, which means "show everything up to
  // the last date" (the natural full-trip view).
  const [scrubberDate, setScrubberDate] = useState<string>('');
  const effectiveDate = scrubberDate || lastDate;

  const [includeWishlist, setIncludeWishlist] = useState<boolean>(false);

  const visiblePoints = useMemo<PathPoint[]>(
    () => (effectiveDate ? allPoints.filter((p) => p.date <= effectiveDate) : allPoints),
    [allPoints, effectiveDate],
  );

  const polylinePath = useMemo(
    () => visiblePoints.map((p) => p.position),
    [visiblePoints],
  );

  const wishlistPlaces = useMemo(
    () =>
      includeWishlist
        ? (places ?? []).filter((p) => !p.visited && p.lat !== undefined && p.lng !== undefined)
        : [],
    [includeWishlist, places],
  );

  if (loading) {
    return <p className="text-sm text-on-surface-variant">Loading…</p>;
  }

  if (!activeTrip) {
    return (
      <Card title="Path map" description="The 'where I've been' map.">
        <p className="text-sm text-on-surface-variant">
          Pick an active trip first in the Trips tab.
        </p>
      </Card>
    );
  }

  if (allPoints.length === 0) {
    return (
      <Card title="Path map" description={`No coordinates yet for ${activeTrip.name}.`}>
        <p className="text-sm text-on-surface-variant">
          Add accommodations with a location, or mark places as visited with a date.
        </p>
      </Card>
    );
  }

  const center = allPoints[0]?.position ?? { lat: 0, lng: 0 };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Path map</h2>
          <p className="text-xs text-on-surface-variant">
            Where you've been on {activeTrip.name}.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-on-surface-variant">
          <input
            type="checkbox"
            checked={includeWishlist}
            onChange={(e) => setIncludeWishlist(e.target.checked)}
          />
          Include wishlist
        </label>
      </div>

      <div className="h-[60vh] overflow-hidden rounded-lg">
        <GoogleMap defaultCenter={center} defaultZoom={6}>
          {visiblePoints.map((p) => (
            <AdvancedMarker
              key={`${p.kind}-${p.entityId}`}
              position={p.position}
              title={p.label}
            >
              <Pin
                background={p.kind === 'accommodation' ? PATH_PIN_ACCOMMODATION : PLACE_PIN_VISITED}
                borderColor="#ffffff"
                glyphColor="#ffffff"
              />
            </AdvancedMarker>
          ))}
          {wishlistPlaces.map((p) => (
            <AdvancedMarker
              key={`wishlist-${p.id}`}
              position={{ lat: p.lat as number, lng: p.lng as number }}
              title={p.place_alias || p.place_id}
            >
              <Pin background={PLACE_PIN_WISHLIST} borderColor="#ffffff" glyphColor="#ffffff" />
            </AdvancedMarker>
          ))}
          <PathLayer path={polylinePath} strokeColor={PATH_STROKE_COLOR} />
        </GoogleMap>
      </div>

      <DateScrubber dates={allDates} value={effectiveDate} onChange={setScrubberDate} />
    </div>
  );
}
