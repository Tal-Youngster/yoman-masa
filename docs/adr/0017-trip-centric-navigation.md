# ADR 0017: Trip-centric navigation + UI/UX refactor

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

The app shipped (S4) with eight peer tabs in the bottom/side nav — Dashboard,
Trips, Accommodations, Expenses, Places, Tasks, Shopping, Articles — all
rendered as equals in a single reorderable list. In practice the model is not
flat: **Trips is a context switcher**, and every other tab is scoped to the
currently active trip (`useActiveTrip`). Treating Trips as just-another-tab
buried that relationship and made "which trip am I looking at?" ambiguous.

Separately, the original `Dashboard` (`/`) was a placeholder grid and the
"where I've been" **Path map** (S9, ADR-0015) was only reachable from a card on
that dashboard — a dead-end surface that duplicated the map already on the
Places tab.

## Decision

1. **Trips is the master tab.** It is lifted out of the reorderable `TABS` set
   into a standalone `TRIPS_TAB` and rendered with distinct, elevated styling —
   a separate block above an "Active trip" group in the side nav, and an
   accented leftmost slot in the bottom nav. Selecting a trip from the Trips
   list **activates it and navigates to the Overview** (`/`).

2. **`/` is the Trip Overview** (relabeled from "Dashboard"): a trip-scoped
   summary built from interactive cards that deep-link into their tabs.

3. **The Places tab becomes "Trip Map"** (`/places` path unchanged): it manages
   wishlist/visited places *and* surfaces accommodations on the same map.

4. **The standalone Path map is removed.** The S9 `path-map` feature
   (`computePath`, `<PathLayer>`, `<PathMapRoute>`, `<DateScrubber>`) and its
   `/path-map` route are deleted. This **supersedes ADR-0015**. The polyline
   trace is not part of the trip-centric overview; if a "journey" view is wanted
   later it is recoverable from git history + ADR-0015.

5. **Accommodation context uses Static Maps.** Where a small, non-interactive
   location preview is useful (accommodation list rows, the Overview map card)
   the app uses a Google **Maps Static API** image rather than an interactive
   `<Map>` instance — cheap, no per-row map load, lazy-loaded. Reuses the
   existing `VITE_GOOGLE_API_KEY` (the Maps Static API must be enabled on it).

## Alternatives considered

- **Keep Trips as a peer tab** — least change, but preserves the ambiguity the
  refactor exists to remove.
- **Fold Path map into Trip Map as a toggle** — keeps the polyline reachable,
  but doubles the Trip Map's modes for a feature with little demonstrated use;
  removal keeps the surface small (revisit if needed).
- **Interactive mini-maps in the accommodation list** — visually consistent but
  N live `<Map>` instances lag a long list and bill per load; Static images win
  on performance and offline-fallback simplicity.

## Consequences

- `navStore` gains a v2 persisted-state migration that drops `/trips` and the
  dead `/path-map` entry from any stored tab order, and reconciles unknown /
  missing tabs on every load.
- The bottom nav pins three per-trip tabs (down from four) since slot one is now
  the Trips master tab.
- `Shell.test` asserts the separated Trips tab and the new labels.
- Enabling the Maps Static API is a one-time console step on the existing key.

## Sharp edges

- `useNavigate()` requires a `RouterProvider`; the isolated `TripsRoute` unit
  test stubs it (navigation itself is covered by the Shell integration test).
- The `/` and `/places` route **headings must match their tab labels** ("Trip
  Overview", "Trip Map") in every state — the Shell nav test couples them.
