import { useEffect, useMemo, useRef } from 'react';
import { AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';
import { GoogleMap } from '@/lib/maps/GoogleMap';
import type { Place } from '@/domain/place';
import type { Accommodation } from '@/domain/accommodation';
import { PLACE_PIN_ACCOMMODATION, PLACE_PIN_VISITED, PLACE_PIN_WISHLIST } from '../colors';

type LatLng = { lat: number; lng: number };
type PlacedPlace = Place & LatLng;
type PlacedAcc = { acc: Accommodation } & LatLng;

function hasCoords(p: Place): p is PlacedPlace {
  return p.lat !== undefined && p.lng !== undefined;
}

export interface PlacesMapProps {
  places: Place[];
  /** Accommodations with a location are rendered as distinct "stay" pins. */
  accommodations?: Accommodation[];
  selected: Place | null;
  onMarkerClick: (place: Place) => void;
  onAccommodationClick?: (acc: Accommodation) => void;
  onMapClick?: () => void;
}

export function PlacesMap({
  places,
  accommodations = [],
  selected,
  onMarkerClick,
  onAccommodationClick,
  onMapClick,
}: PlacesMapProps): React.JSX.Element {
  const withCoords = useMemo(() => places.filter(hasCoords), [places]);
  const placedAccs = useMemo<PlacedAcc[]>(
    () =>
      accommodations.flatMap((a) =>
        a.location ? [{ acc: a, lat: a.location.lat, lng: a.location.lng }] : [],
      ),
    [accommodations],
  );

  const points = useMemo<LatLng[]>(
    () => [
      ...withCoords.map((p) => ({ lat: p.lat, lng: p.lng })),
      ...placedAccs.map((a) => ({ lat: a.lat, lng: a.lng })),
    ],
    [withCoords, placedAccs],
  );

  const first = points[0];
  const defaultCenter = first ?? { lat: 0, lng: 0 };
  const defaultZoom = points.length > 0 ? 11 : 2;

  return (
    <GoogleMap
      defaultCenter={defaultCenter}
      defaultZoom={defaultZoom}
      {...(onMapClick ? { onClick: () => onMapClick() } : {})}
    >
      {withCoords.map((p) => (
        <AdvancedMarker
          key={p.id}
          position={{ lat: p.lat, lng: p.lng }}
          title={p.place_alias || p.place_id}
          onClick={() => onMarkerClick(p)}
        >
          <Pin
            background={p.visited ? PLACE_PIN_VISITED : PLACE_PIN_WISHLIST}
            borderColor="#ffffff"
            glyphColor="#ffffff"
            scale={selected?.id === p.id ? 1.4 : 1}
          />
        </AdvancedMarker>
      ))}
      {placedAccs.map(({ acc, lat, lng }) => (
        <AdvancedMarker
          key={`acc-${acc.id}`}
          position={{ lat, lng }}
          title={acc.name}
          onClick={() => onAccommodationClick?.(acc)}
        >
          <Pin background={PLACE_PIN_ACCOMMODATION} borderColor="#ffffff" glyphColor="#ffffff" />
        </AdvancedMarker>
      ))}
      <MapController points={points} selected={selected} />
    </GoogleMap>
  );
}

/** Imperatively fits the map to all markers (once per marker-set) and pans to the selection. */
function MapController({ points, selected }: { points: LatLng[]; selected: Place | null }): null {
  const map = useMap();
  const fittedKey = useRef<string>('');

  useEffect(() => {
    if (!map || points.length === 0) return;
    const key = points
      .map((p) => `${p.lat},${p.lng}`)
      .sort()
      .join('|');
    if (key === fittedKey.current) return;
    fittedKey.current = key;

    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 64);
    // A single marker fits at max zoom — clamp so we don't land at street level.
    google.maps.event.addListenerOnce(map, 'idle', () => {
      if ((map.getZoom() ?? 0) > 15) map.setZoom(15);
    });
  }, [map, points]);

  useEffect(() => {
    if (!map || !selected || selected.lat === undefined || selected.lng === undefined) return;
    map.panTo({ lat: selected.lat, lng: selected.lng });
    if ((map.getZoom() ?? 0) < 14) map.setZoom(14);
  }, [map, selected]);

  return null;
}
