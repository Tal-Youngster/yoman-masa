import { useEffect, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

export interface MapPreviewPoint {
  lat: number;
  lng: number;
  /** Pin background colour (hex). */
  color: string;
}

export interface MapPreviewProps {
  points: MapPreviewPoint[];
  className?: string;
}

/**
 * A non-interactive map thumbnail rendered with the Maps **JavaScript** API
 * (the same one the interactive Trip Map uses) rather than the Static Maps API,
 * which requires a separately-enabled, separately-billed API. Gestures and UI
 * are disabled so it reads as a preview; callers overlay their own click target.
 *
 * Returns `null` when no API key is configured so callers render a fallback.
 */
export function MapPreview({ points, className }: MapPreviewProps): React.JSX.Element | null {
  if (!API_KEY) return null;

  const first = points[0] ?? { lat: 0, lng: 0 };

  return (
    <APIProvider apiKey={API_KEY}>
      <Map
        mapId={MAP_ID}
        defaultCenter={{ lat: first.lat, lng: first.lng }}
        defaultZoom={points.length > 0 ? 9 : 2}
        gestureHandling="none"
        disableDefaultUI
        clickableIcons={false}
        keyboardShortcuts={false}
        className={className ?? 'h-full w-full'}
      >
        {points.map((p, i) => (
          <AdvancedMarker key={`${p.lat},${p.lng},${i}`} position={{ lat: p.lat, lng: p.lng }}>
            <Pin background={p.color} borderColor="#ffffff" glyphColor="#ffffff" />
          </AdvancedMarker>
        ))}
        <FitBounds points={points} />
      </Map>
    </APIProvider>
  );
}

/** Imperatively fits the viewport to all points once per point-set. */
function FitBounds({ points }: { points: MapPreviewPoint[] }): null {
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

    if (points.length === 1) {
      const only = points[0];
      map.setCenter({ lat: only.lat, lng: only.lng });
      map.setZoom(12);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 24);
    // Clamp a tight cluster so we don't land at street level.
    google.maps.event.addListenerOnce(map, 'idle', () => {
      if ((map.getZoom() ?? 0) > 14) map.setZoom(14);
    });
  }, [map, points]);

  return null;
}
