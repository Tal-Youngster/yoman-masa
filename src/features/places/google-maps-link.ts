/**
 * Parse a pasted Google Maps URL (or raw "lat,lng") into the signals we can act on.
 *
 * Google does not expose a clean Places `place_id` in most share/desktop URLs — the
 * `!1s0x…:0x…` token in `/data=` is a hex feature id, not a Places v1 id, so we
 * deliberately ignore it. The only reliable id is the `query_place_id`/`place_id`
 * query param (present on `?api=1` share links). Everything else we resolve from
 * coordinates + name downstream (Text Search / reverse geocode).
 *
 * Shortened links (maps.app.goo.gl, goo.gl/maps) redirect to the real URL, but reading
 * that redirect is CORS-blocked in the browser and we have no backend (ADR-0001), so we
 * flag them as `shortened` for the UI to handle rather than pretending we can resolve them.
 */
export interface ParsedGoogleMapsUrl {
  placeId?: string;
  lat?: number;
  lng?: number;
  /** Human label lifted from `/maps/place/<name>/`, when present and not itself coords. */
  name?: string;
  /** True for goo.gl / maps.app.goo.gl links we cannot expand client-side. */
  shortened: boolean;
}

const SHORT_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'g.co'];

// A Places id is the opaque token after query_place_id= / place_id= (ChIJ…, Ei…, Gh…).
const PLACE_ID_RE = /(?:query_place_id|place_id)[=:]([A-Za-z0-9_-]{10,})/;
// `@lat,lng` (map viewport) or a `/place/lat,lng` path segment.
const AT_COORDS_RE = /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/;
// Coords carried in a query param: q=, query=, ll=, center=, destination=.
const PARAM_COORDS_RE =
  /[?&](?:q|query|ll|center|destination|daddr|sll)=(-?\d{1,3}(?:\.\d+)?)(?:,|%2C)(-?\d{1,3}(?:\.\d+)?)/i;
// A bare "lat, lng" string a user might paste directly.
const BARE_COORDS_RE = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
const PLACE_NAME_RE = /\/maps\/place\/([^/@]+)/;

function isLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Returns null when the input is not a Google Maps URL / coordinate pair at all. */
export function parseGoogleMapsUrl(input: string): ParsedGoogleMapsUrl | null {
  const raw = input.trim();
  if (!raw) return null;

  // Raw "lat,lng" with no URL around it.
  const bare = BARE_COORDS_RE.exec(raw);
  if (bare) {
    const lat = Number(bare[1]);
    const lng = Number(bare[2]);
    return isLatLng(lat, lng) ? { lat, lng, shortened: false } : null;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');
  const isGoogleMaps =
    SHORT_HOSTS.includes(host) ||
    (/(^|\.)google\.[a-z.]+$/.test(host) && url.pathname.includes('maps')) ||
    host === 'maps.google.com';
  if (!isGoogleMaps) return null;

  if (SHORT_HOSTS.includes(host)) {
    return { shortened: true };
  }

  const result: ParsedGoogleMapsUrl = { shortened: false };

  const placeId = PLACE_ID_RE.exec(raw);
  if (placeId) result.placeId = placeId[1];

  // Prefer the explicit query-param coords (the actual pin) over the `@` viewport center.
  const paramCoords = PARAM_COORDS_RE.exec(raw);
  const atCoords = AT_COORDS_RE.exec(raw);
  const coords = paramCoords ?? atCoords;
  if (coords) {
    const lat = Number(coords[1]);
    const lng = Number(coords[2]);
    if (isLatLng(lat, lng)) {
      result.lat = lat;
      result.lng = lng;
    }
  }

  const nameMatch = PLACE_NAME_RE.exec(url.pathname);
  if (nameMatch) {
    const decoded = decodeURIComponent(nameMatch[1]).replace(/\+/g, ' ').trim();
    // A `/place/<lat,lng>` segment is coords, not a name.
    const asCoords = BARE_COORDS_RE.exec(decoded);
    if (asCoords) {
      if (result.lat === undefined) {
        const lat = Number(asCoords[1]);
        const lng = Number(asCoords[2]);
        if (isLatLng(lat, lng)) {
          result.lat = lat;
          result.lng = lng;
        }
      }
    } else if (decoded) {
      result.name = decoded;
    }
  }

  // Nothing actionable found.
  if (!result.placeId && result.lat === undefined && !result.name) return null;

  return result;
}
