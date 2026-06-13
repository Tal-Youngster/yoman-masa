import { useLiveQuery } from 'dexie-react-hooks';
import { Map as MapIcon } from 'lucide-react';
import type { Trip } from '@/domain/trip';
import { listAccommodationsByTrip } from '@/features/accommodations/queries';
import { placesByTrip } from '@/features/places/queries';
import {
  PLACE_PIN_ACCOMMODATION,
  PLACE_PIN_VISITED,
  PLACE_PIN_WISHLIST,
} from '@/features/places/colors';
import { staticMapUrl, type StaticMapMarker } from '@/lib/maps/static-map';
import { OverviewCard } from './OverviewCard';

export function TripMapPreviewCard({ trip }: { trip: Trip }): React.JSX.Element {
  const accommodations = useLiveQuery(() => listAccommodationsByTrip(trip.id), [trip.id]) ?? [];
  const places = useLiveQuery(() => placesByTrip(trip.id), [trip.id]) ?? [];

  const markers: StaticMapMarker[] = [];
  for (const a of accommodations) {
    if (a.location) {
      markers.push({ lat: a.location.lat, lng: a.location.lng, color: PLACE_PIN_ACCOMMODATION });
    }
  }
  for (const p of places) {
    if (p.lat !== undefined && p.lng !== undefined) {
      markers.push({
        lat: p.lat,
        lng: p.lng,
        color: p.visited ? PLACE_PIN_VISITED : PLACE_PIN_WISHLIST,
      });
    }
  }

  const url = markers.length > 0 ? staticMapUrl({ width: 640, height: 288, markers }) : null;

  return (
    <OverviewCard to="/places" title="Trip Map" icon={<MapIcon className="h-4 w-4" />} cta="Open trip map">
      {url ? (
        <div className="overflow-hidden rounded-lg border border-outline-variant">
          <img
            src={url}
            alt={`Map of ${trip.name}`}
            loading="lazy"
            className="h-36 w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex h-36 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-outline-variant bg-surface-container-low text-center">
          <MapIcon className="h-6 w-6 text-on-surface-variant" aria-hidden />
          <p className="px-4 text-xs text-on-surface-variant">
            {markers.length === 0
              ? 'Add places or stays with a location to map them.'
              : 'Map preview unavailable.'}
          </p>
        </div>
      )}
      <p className="mt-2 text-xs text-on-surface-variant">
        {markers.length} pinned location{markers.length === 1 ? '' : 's'}
      </p>
    </OverviewCard>
  );
}
