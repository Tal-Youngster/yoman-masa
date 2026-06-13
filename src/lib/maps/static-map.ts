export interface StaticMapMarker {
  lat: number;
  lng: number;
  /** Hex (`#1f8a4c`) or a Static-API colour name. Defaults to `red`. */
  color?: string;
}

export interface StaticMapOptions {
  width: number;
  height: number;
  /** Pixel density. Defaults to 2 for crisp thumbnails on retina screens. */
  scale?: 1 | 2;
  /** Explicit centre. Omit (with markers) to let the API auto-fit. */
  center?: { lat: number; lng: number };
  /** Explicit zoom. Omit (with markers) to let the API auto-fit. */
  zoom?: number;
  markers?: StaticMapMarker[];
}

function toApiColor(color: string): string {
  // The Static API wants `0xRRGGBB`, not the CSS `#RRGGBB`.
  return color.startsWith('#') ? `0x${color.slice(1)}` : color;
}

/**
 * Build a Google Maps **Static API** image URL for a lightweight, non-interactive
 * location preview (accommodation rows, the Overview map card). Returns `null`
 * when no API key is configured so callers render a graceful fallback.
 *
 * The key is read at call time (not module load) so tests can stub the env.
 * When markers are supplied without an explicit `center`/`zoom`, the API
 * auto-fits the viewport to the markers.
 */
export function staticMapUrl(opts: StaticMapOptions): string | null {
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY || '';
  if (!apiKey) return null;

  const params = new URLSearchParams();
  params.set('size', `${opts.width}x${opts.height}`);
  params.set('scale', String(opts.scale ?? 2));
  if (opts.center) params.set('center', `${opts.center.lat},${opts.center.lng}`);
  if (opts.zoom !== undefined) params.set('zoom', String(opts.zoom));

  // Group markers by colour so each colour is one compact `markers` param.
  const byColor = new Map<string, StaticMapMarker[]>();
  for (const m of opts.markers ?? []) {
    const key = m.color ? toApiColor(m.color) : 'red';
    const group = byColor.get(key) ?? [];
    group.push(m);
    byColor.set(key, group);
  }
  for (const [color, group] of byColor) {
    const points = group.map((m) => `${m.lat},${m.lng}`).join('|');
    params.append('markers', `color:${color}|${points}`);
  }

  params.set('key', apiKey);
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
