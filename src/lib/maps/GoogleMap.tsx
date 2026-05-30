import React from 'react';
import { APIProvider, Map, type MapMouseEvent } from '@vis.gl/react-google-maps';

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
// Advanced Markers require a Map ID. DEMO_MAP_ID works for dev (shows a Google watermark);
// set VITE_GOOGLE_MAP_ID to a real cloud-configured style for production. See ADR-0013.
const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

export interface GoogleMapProps {
  defaultCenter: google.maps.LatLngLiteral;
  defaultZoom: number;
  onClick?: (e: MapMouseEvent) => void;
  /** Marker / overlay / controller children, rendered inside the <Map>. */
  children?: React.ReactNode;
}

/**
 * Thin, declarative wrapper over the Google Maps JS API (ADR-0013). The map is
 * uncontrolled (`defaultCenter`/`defaultZoom`) so React re-renders don't fight user
 * panning — imperative recentering is done by child components via `useMap()`.
 */
export const GoogleMap: React.FC<GoogleMapProps> = ({ defaultCenter, defaultZoom, onClick, children }) => {
  if (!API_KEY) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-container p-4 text-center text-sm text-on-surface-variant">
        Map unavailable — set VITE_GOOGLE_API_KEY (with the Maps JavaScript API enabled).
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY}>
      <Map
        mapId={MAP_ID}
        defaultCenter={defaultCenter}
        defaultZoom={defaultZoom}
        gestureHandling="greedy"
        disableDefaultUI={false}
        clickableIcons={false}
        className="h-full w-full"
        {...(onClick ? { onClick } : {})}
      >
        {children}
      </Map>
    </APIProvider>
  );
};
