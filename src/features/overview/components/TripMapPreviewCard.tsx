import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from '@tanstack/react-router';
import { Map as MapIcon, ChevronRight } from 'lucide-react';
import type { Trip } from '@/domain/trip';
import { listAccommodationsByTrip } from '@/features/accommodations/queries';
import { placesByTrip } from '@/features/places/queries';
import {
  PLACE_PIN_ACCOMMODATION,
  PLACE_PIN_VISITED,
  PLACE_PIN_WISHLIST,
} from '@/features/places/colors';
import { MapPreview, type MapPreviewPoint } from '@/lib/maps/MapPreview';

export function TripMapPreviewCard({ trip }: { trip: Trip }): React.JSX.Element {
  const accommodations = useLiveQuery(() => listAccommodationsByTrip(trip.id), [trip.id]) ?? [];
  const places = useLiveQuery(() => placesByTrip(trip.id), [trip.id]) ?? [];

  const points: MapPreviewPoint[] = [];
  for (const a of accommodations) {
    if (a.location) {
      points.push({ lat: a.location.lat, lng: a.location.lng, color: PLACE_PIN_ACCOMMODATION });
    }
  }
  for (const p of places) {
    if (p.lat !== undefined && p.lng !== undefined) {
      points.push({
        lat: p.lat,
        lng: p.lng,
        color: p.visited ? PLACE_PIN_VISITED : PLACE_PIN_WISHLIST,
      });
    }
  }

  // The whole card drills into the Trip Map. We can't wrap the map in the link
  // (the Google Map renders its own anchors — nested <a> is invalid HTML and the
  // browser breaks the outer link), so a stretched-link overlay sits on top: it
  // owns the click target and doubles as a shield keeping the preview inert.
  return (
    <div className="group relative flex flex-col rounded-xl border border-outline-variant bg-surface-container p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-floating focus-within:outline focus-within:outline-2 focus-within:outline-primary">
      <Link to="/places" aria-label="Open trip map" className="absolute inset-0 z-20 rounded-xl" />
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MapIcon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold text-on-surface">Trip Map</h3>
        <ChevronRight className="ml-auto h-4 w-4 text-on-surface-variant transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>

      {points.length > 0 ? (
        <div className="h-36 overflow-hidden rounded-lg border border-outline-variant">
          <MapPreview points={points} />
        </div>
      ) : (
        <div className="flex h-36 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-outline-variant bg-surface-container-low text-center">
          <MapIcon className="h-6 w-6 text-on-surface-variant" aria-hidden />
          <p className="px-4 text-xs text-on-surface-variant">
            Add places or stays with a location to map them.
          </p>
        </div>
      )}

      <p className="mt-2 text-xs text-on-surface-variant">
        {points.length} pinned location{points.length === 1 ? '' : 's'}
      </p>
    </div>
  );
}
