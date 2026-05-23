import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { initPMTiles } from './pmtiles-loader';

const PROTOMAPS_API_KEY = import.meta.env.VITE_PROTOMAPS_API_KEY || '';

// Protomaps hosted vector basemap (ADR-0005). Without a key the request 401s and
// the map renders blank, so fall back to MapLibre's demo style and warn instead.
const MAP_STYLE = PROTOMAPS_API_KEY
  ? `https://api.protomaps.com/styles/v5/light/en.json?key=${PROTOMAPS_API_KEY}`
  : 'https://demotiles.maplibre.org/style.json';

if (!PROTOMAPS_API_KEY) {
  console.warn(
    '[maps] VITE_PROTOMAPS_API_KEY is not set — falling back to the MapLibre demo basemap. ' +
      'Set the key in .env.local for a full basemap.'
  );
}

export interface MapLibreMapProps {
  className?: string;
  styleUrl?: any;
  initialCenter?: [number, number]; // [lng, lat]
  initialZoom?: number;
  onMapLoad?: (map: maplibregl.Map) => void;
  onClick?: (e: maplibregl.MapMouseEvent) => void;
  children?: React.ReactNode;
}

export const MapLibreMap: React.FC<MapLibreMapProps> = ({
  className,
  styleUrl = MAP_STYLE,
  initialCenter = [0, 0],
  initialZoom = 1,
  onMapLoad,
  onClick,
  children,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    try {
      initPMTiles();
    } catch (e) {
      console.warn('initPMTiles failed', e);
    }

    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: styleUrl,
      center: initialCenter,
      zoom: initialZoom,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      setMapLoaded(true);
      if (onMapLoad && map.current) {
        onMapLoad(map.current);
      }
    });

    if (onClick) {
      map.current.on('click', onClick);
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [styleUrl]);

  return (
    <div className={`relative w-full h-full ${className || ''}`}>
      <div ref={mapContainer} className="absolute inset-0 z-0" />
      {mapLoaded && map.current && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {children}
        </div>
      )}
    </div>
  );
};
