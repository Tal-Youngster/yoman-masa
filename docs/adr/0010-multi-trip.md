# ADR 0010: Multi-trip support

- **Status:** Accepted
- **Date:** 2026-05-21

## Context

The app must support multiple trips (planned, active, archived), not just a single "current" trip. Most travel admin is trip-scoped but a few items (e.g. "renew passport") are cross-trip.

## Decision

### Entity model

- `Trip` has `id` (ULID), `slug` (kebab-case, derived from name + year), `name`, `start_date`, `end_date`, `home_currency`, `status: 'planned' | 'active' | 'completed' | 'archived'`.
- Every other entity carries a `trip_id` referencing a `Trip`. Where cross-trip items make sense (`Task`, `ShoppingItem`, `Article`), `trip_id` is nullable.
- An "active trip" pointer is stored in `<vault>/Travel/.travel/config.json: { active_trip_id }`. The UI defaults to the active trip and exposes a switcher.

### Vault layout

```
<vault>/Travel/
  General/                  # trip_id = null
    Tasks.md
    Shopping.md
    Articles/
  Trips/
    <trip-slug>/
      Trip.md
      Tasks.md              # trip_id implicit from folder
      Shopping.md
      Articles/
      Accommodations/
      Places/
      Expenses/
  .travel/
    config.json
```

The folder structure makes `trip_id` derivable from path, but `trip_id` is also written into frontmatter for robustness against file moves.

### Missing-nights, path map, expense totals

All scoped to the currently selected trip. The caller filters entities by `trip_id` before passing to pure logic.

## Alternatives considered

- **Single global namespace with `trip_id` tag only.** Harder to browse in Obsidian; encourages cross-contamination of dates. Rejected.
- **One vault folder per trip with no shared root.** Loses cross-trip Tasks/Articles. Rejected.

## Consequences

- All domain queries take a `trip_id` filter (or `null` for cross-trip).
- The dashboard and bottom nav need a trip switcher.
- Archived trips remain in Dexie and Drive; UI hides them by default.

## Sharp edges

- Moving an entity between trips is two operations: rewrite frontmatter `trip_id` _and_ move the file. The sync worker must do both atomically (within retry budget) or surface the partial state.
- A trip's `start_date` / `end_date` change can suddenly create missing nights. Recompute on trip edit.
