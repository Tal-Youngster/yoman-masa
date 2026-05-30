# ADR 0013: Places map — Google Maps JavaScript API

- **Status:** Accepted (supersedes the Places-map renderer portion of ADR-0005)
- **Date:** 2026-05-25

## Context

ADR-0005 chose MapLibre GL + Protomaps PMTiles for both map surfaces, primarily to keep
the map usable offline. In practice the Places feature drifted fully Google-native: a
`Place.place_id` **is** a Google Place ID, and the create/detail flows already call Google
Places Autocomplete, Place Details, Static Maps, and Place Photos. The only non-Google
piece left was the interactive map itself — and it was rendering blank.

The product goal for Places is now explicit: a place should be addable straight from a
Google Maps link or search, and shown on a map that behaves like Google Maps (same POIs,
same place objects, same markers). Keeping a separate open-source renderer on top of a
Google data layer was the source of the impedance mismatch.

The user accepted the trade-off below (offline map vs. Google-native UX) when this was
proposed.

## Decision

- **Renderer for the Places tab:** Google Maps JavaScript API, via the official React
  wrapper `@vis.gl/react-google-maps` (`<APIProvider>`, `<Map>`, `<AdvancedMarker>`).
- **Key:** reuse the existing `VITE_GOOGLE_API_KEY`. It must have **Maps JavaScript API**
  enabled (in addition to the already-required Places API New). Advanced Markers need a
  Map ID — `VITE_GOOGLE_MAP_ID` (optional; falls back to Google's `DEMO_MAP_ID`).
- **Add-by-link:** a pure `parseGoogleMapsUrl()` extracts `{ placeId?, lat, lng, name? }`
  from pasted URLs. When a `query_place_id` is present it is used directly; otherwise the
  coordinates/name are resolved to a canonical Google place via Places Text Search /
  reverse geocode.
- **Offline:** the Places map is **online-only**. This is the accepted regression from
  ADR-0005. Offline *reads* of place data (names, notes, coords) still work from Dexie;
  only the basemap tiles require connectivity.

## Alternatives considered

- **Keep MapLibre + Protomaps, fix the blank.** Preserves offline. Rejected: leaves a
  permanent data/renderer mismatch and can't natively render Google POIs or "paste a
  Google link and see exactly what Google shows."
- **Hybrid: MapLibre render + Google add-by-link pipeline.** Keeps offline and the paste
  UX, but the map still wouldn't look/behave like Google. Rejected for v1; revisitable if
  offline maps become a hard requirement again.
- **`@googlemaps/js-api-loader` (imperative).** Works, but the imperative lifecycle is
  exactly what caused the teardown/blank bug here. The declarative wrapper removes that
  class of bug.

## Consequences

- Positive: one mental model (Google) for both data and rendering; markers, info windows,
  and POIs match what users see in Google Maps; add-by-link/search is straightforward.
- Negative: no offline basemap on the Places tab; a network dependency on Google for tiles
  and usage cost beyond Google's free tier.
- Follow-up: MapLibre GL + PMTiles dependencies and `src/lib/maps/MapLibreMap.tsx` /
  `pmtiles-loader.ts` are removed. The not-yet-built date-ordered **path map** (ADR-0005
  `accommodations` layer) will also use Google Maps when implemented.

## Sharp edges

- **Advanced Markers require a Map ID.** Without `VITE_GOOGLE_MAP_ID`, `DEMO_MAP_ID` works
  for development but shows a Google watermark; set a real Map ID for production.
- **Shortened links (`maps.app.goo.gl`, `goo.gl/maps`) cannot be expanded client-side** —
  reading the redirect target is CORS-blocked and we have no backend (ADR-0001). The parser
  detects these and the UI asks the user to paste the full URL or use search.
- **Key referrer restrictions** must allow the deploy origin for the JS API, not just the
  REST referer rules already in place.
