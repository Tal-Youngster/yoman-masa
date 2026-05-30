# ADR 0015: Path map rendering on Google Maps

- **Status:** Accepted
- **Date:** 2026-05-30

## Context

ADR-0013 swapped the maps stack from MapLibre + Protomaps PMTiles to
`@vis.gl/react-google-maps`. The S9 spec in `IMPLEMENTATION-PLAN.md` was
written against MapLibre — it composes a polyline layer atop a shared
`MapLibreMap` component that no longer exists. Before S9 starts we need
to lock in:

1. **How the polyline is rendered.** Three real choices exist on the
   Google Maps JS API: native `google.maps.Polyline`, the Directions
   service (returns route geometry that follows roads), or a Deck.gl
   `PathLayer` integrated via `@vis.gl/react-google-maps`'s deck.gl
   bridge.
2. **How it composes with the existing map.** S8b's `lib/maps/GoogleMap`
   is a thin `<APIProvider>` + `<Map>` wrapper; `PlacesMap` adds the
   place-marker layer on top. S9 needs its own route with its own marker
   set, so it has to plug into the same primitive.
3. **What "offline" means now.** The MapLibre plan included a PMTiles
   pre-download for a per-trip bounding box. Google Maps tiles cannot be
   pre-downloaded — the tile cache is opaque, served by the browser
   honouring tile-response cache headers. ADR-0013 accepted this for
   places; S9 inherits the same constraint.

## Decision

Use native `google.maps.Polyline` for the path, drawn via a small
`<PathLayer>` component that mounts inside the shared `GoogleMap`
wrapper. Reject Directions (wrong semantic — we want straight segments
between waypoints, not driving routes) and Deck.gl (no current need —
adding a 70 KB layer engine for one polyline is over-engineering; the
choice can be revisited if/when animation lands).

### Layers

1. **`src/features/path-map/components/PathLayer.tsx`** — a child of
   `<Map>` that calls `useMap()` to obtain the live map instance and
   imperatively manages a single `google.maps.Polyline`. Props:
   `path: google.maps.LatLngLiteral[]`, plus styling overrides. Creates
   the polyline on first render, updates `setPath` on prop change,
   removes from the map on unmount. No JSX output (`return null`).
2. **`src/features/path-map/components/PathMapRoute.tsx`** — the route.
   Mounts `<GoogleMap>` directly (not via `PlacesMap` — different
   marker set, different toggles), drops `<AdvancedMarker>` for each
   accommodation + visited place, renders `<PathLayer>` with the
   date-ordered point list, and wraps a `<DateScrubber>` underneath.
3. **`src/features/path-map/computePath.ts`** — pure function unchanged
   in spirit from the original S9 spec: date-ordered concatenation of
   accommodation check-in coordinates and visited-place coordinates,
   returning `LatLngLiteral[]`. Stays framework-free so tests run in
   Node.

### Composition contract

- S9 does **not** modify `lib/maps/GoogleMap` or `features/places/PlacesMap`.
  It consumes `GoogleMap` directly. This keeps the S8b primitive stable
  and avoids cross-slice coupling.
- `PathLayer` uses `useMap()` exactly the way the existing
  `MapController` inside `PlacesMap` does — that pattern is already in
  the codebase, so reviewers don't need new mental model.
- The polyline's z-order is below `AdvancedMarker`s (Google's default
  ordering: overlays < advanced markers). No `zIndex` workaround
  needed for v1.

### Styling

- Stroke colour: home-currency neutral (`#2563eb`, the same blue used
  for selection in `PlacesMap`). Width: 3 px. Opacity: 0.85.
- No icons-along-path or arrowheads for v1; the polyline is just the
  trace. Direction is implied by the date scrubber.

## Consequences

- **No offline path map.** The polyline coordinates themselves come from
  Dexie (offline-fine), but the tile basemap requires a live tile
  fetch. This is the same trade-off ADR-0013 already accepted for
  Places. Marked here so future "fully offline" requirements come back
  through an ADR.
- **Single polyline cap.** `google.maps.Polyline` handles ≤ ~5000 points
  smoothly; beyond that, render perf degrades. For a single trip of
  reasonable duration this is many orders of magnitude over the real
  upper bound, but if multi-trip overlays ever land we'd switch to
  Deck.gl `PathLayer` (cheap migration — only `PathLayer.tsx` changes).
- **Antimeridian crossings.** `google.maps.Polyline` draws a straight
  segment in screen space; a Honolulu → Tokyo leg cuts across the map
  instead of round-tripping the Pacific. Out of scope for v1; if it
  ever matters we'd split segments around longitude ±180 in
  `computePath`.
- **Date scrubber state.** Filtering happens in React state, not in
  `computePath`. `computePath` returns the full series; the scrubber
  slices it. Keeps `computePath` deterministic and easy to test.

## Alternatives considered

- **`DirectionsService`** — fetches a road-following route between
  consecutive waypoints. Rejected because (a) we want straight-line
  visualisation, not road routes; (b) quota cost per session; (c)
  flights and ferries would render as nonsense.
- **Deck.gl `PathLayer`** — first-class GPU-rendered layer with smooth
  zoom and animation. Rejected for v1: one polyline doesn't need it,
  and the bridge adds ~70 KB to the bundle. Cheap to revisit if
  animation playback (currently deferred per the original S9 spec)
  comes back into scope.
- **Custom `OverlayView` with canvas** — rendering the polyline ourselves
  for full control. Rejected: reinvents `google.maps.Polyline` with no
  current need.

## Sharp edges

- **`useMap()` returns null on first render.** Guard with
  `if (!map) return;` inside the effect. Same pattern as
  `PlacesMap`'s `MapController`.
- **`setPath` vs new Polyline.** Always mutate the existing polyline
  rather than re-creating it on every prop change — re-creating
  flickers because Google removes the old overlay before mounting the
  new one.
- **Cleanup on unmount.** `polyline.setMap(null)` in the effect cleanup
  is mandatory; otherwise stale polylines stack up across route
  changes.
