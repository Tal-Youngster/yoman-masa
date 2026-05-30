import { useEffect, useMemo, useRef } from 'react';
import { AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';
import { GoogleMap } from '@/lib/maps/GoogleMap';
import type { Place } from '@/domain/place';

type PlacedPlace = Place & { lat: number; lng: number };

function hasCoords(p: Place): p is PlacedPlace {
  return p.lat !== undefined && p.lng !== undefined;
}

export interface PlacesMapProps {
  places: Place[];
  selected: Place | null;
  onMarkerClick: (place: Place) => void;
  onMapClick?: () => void;
}

export function PlacesMap({ places, selected, onMarkerClick, onMapClick }: PlacesMapProps): React.JSX.Element {
  const withCoords = useMemo(() => places.filter(hasCoords), [places]);

  const defaultCenter = withCoords[0]
    ? { lat: withCoords[0].lat, lng: withCoords[0].lng }
    : { lat: 0, lng: 0 };
  const defaultZoom = withCoords.length > 0 ? 11 : 2;

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
            background={p.visited ? '#1f8a4c' : '#e0413e'}
            borderColor="#ffffff"
            glyphColor="#ffffff"
            scale={selected?.id === p.id ? 1.4 : 1}
          />
        </AdvancedMarker>
      ))}
      <MapController places={withCoords} selected={selected} />
    </GoogleMap>
  );
}

/** Imperatively fits the map to all markers (once per marker-set) and pans to the selection. */
function MapController({ places, selected }: { places: PlacedPlace[]; selected: Place | null }): null {
  const map = useMap();
  const fittedKey = useRef<string>('');

  useEffect(() => {
    if (!map || places.length === 0) return;
    const key = places
      .map((p) => p.id)
      .sort()
      .join(',');
    if (key === fittedKey.current) return;
    fittedKey.current = key;

    const bounds = new google.maps.LatLngBounds();
    places.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 64);
    // A single marker fits at max zoom — clamp so we don't land at street level.
    google.maps.event.addListenerOnce(map, 'idle', () => {
      if ((map.getZoom() ?? 0) > 15) map.setZoom(15);
    });
  }, [map, places]);

  useEffect(() => {
    if (!map || !selected || selected.lat === undefined || selected.lng === undefined) return;
    map.panTo({ lat: selected.lat, lng: selected.lng });
    if ((map.getZoom() ?? 0) < 14) map.setZoom(14);
  }, [map, selected]);

  return null;
}
