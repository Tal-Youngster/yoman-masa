import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

let initialized = false;

/**
 * Register the 'pmtiles://' protocol with MapLibre GL JS.
 * Ensures it's only added once.
 */
export function initPMTiles() {
  if (initialized) return;
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  initialized = true;
}
