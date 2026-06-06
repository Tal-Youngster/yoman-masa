import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

import { PATH_STROKE_COLOR } from '@/features/places/colors';

export interface PathLayerProps {
  /** Date-ordered list of `{lat, lng}` waypoints. */
  path: readonly google.maps.LatLngLiteral[];
  strokeColor?: string;
  strokeWeight?: number;
  strokeOpacity?: number;
}

/**
 * Renders a single `google.maps.Polyline` as a child of `<GoogleMap>` (ADR-0015).
 * Mounts the polyline once, then mutates it via `setPath` / `setOptions` on prop
 * change — recreating it flickers because Google removes the old overlay before
 * mounting the new one. Cleans up with `setMap(null)` on unmount.
 */
export function PathLayer({
  path,
  strokeColor = PATH_STROKE_COLOR,
  strokeWeight = 3,
  strokeOpacity = 0.85,
}: PathLayerProps): null {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  // Create exactly once per map. `useMap()` returns null on first render — wait for it.
  useEffect(() => {
    if (!map) return;
    const polyline = new google.maps.Polyline({
      path: [...path],
      strokeColor,
      strokeWeight,
      strokeOpacity,
      map,
    });
    polylineRef.current = polyline;
    return () => {
      polyline.setMap(null);
      polylineRef.current = null;
    };
    // Intentionally only `map`: path & styling are pushed by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    polylineRef.current?.setPath([...path]);
  }, [path]);

  useEffect(() => {
    polylineRef.current?.setOptions({ strokeColor, strokeWeight, strokeOpacity });
  }, [strokeColor, strokeWeight, strokeOpacity]);

  return null;
}
