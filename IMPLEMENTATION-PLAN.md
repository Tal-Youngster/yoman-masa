# Implementation Plan

Multi-agent dispatch plan for the Travel Journal app. Each slice is sized to be picked up by one agent and merged independently. Read `CLAUDE.md` first, then this file, then the ADRs in `docs/adr/`.

## Status

### Completed

- **S0 — Scaffolding + domain foundation** (4 commits on `main`)
  - Vite + React 19 + TS strict + Tailwind 4 + PWA scaffold
  - All 10 ADRs locked
  - Zod schemas for `Trip`, `Accommodation`, `Place`, `Expense`, `Task`, `ShoppingItem`, `Article` (multi-trip)
  - `IsoDate` with UTC-based math, tested across DST and leap years
  - `computeMissingNights` + `groupMissingGaps` with 15 cases incl. property test

## Phase map

```
Phase 1 — Foundations (parallel; no inter-dependencies)
  S1  Markdown utility (frontmatter, body preservation, line patches)
  S2  Local storage (Dexie schema, write queue table, CRUD)
  S3  Drive client + sync worker (with in-memory fake)
  S4  App shell (router, layout, bottom nav, trip switcher UI)

Phase 2 — Spine (single slice; blocks Phase 3)
  S5  Trips (CRUD, active trip, first end-to-end Drive flow)

Phase 3 — Features (parallel)
  S6  Accommodations + Missing Nights dashboard
  S7  Expenses + FX
  S8  Wishlist places + map
  S10 Tasks (vault-backed)
  S11 Shopping list (vault-backed)
  S12 Articles

Phase 4 — Composition
  S9  Path map (depends on S6 + S8)

Phase 5 — Ship
  S13 PWA polish + Cloudflare Pages deploy
```

### Critical path

`S1 → S5 → S6 → S9 → S13`

Everything else fans off the critical path. The fastest end-to-end app is: foundations → trips → accommodations → deploy.

### Coordination

- One agent per slice. Each agent works on `slice/S<N>-<short-name>`.
- Slices own non-overlapping directories. The "Owned directories" line in each slice is binding.
- If an agent needs to modify code outside its owned area (e.g. a shared type), **propose the change to the user** before touching it. The user merges the change and notifies the affected agent.
- After each phase, the user reviews and merges open PRs to `main`. Subsequent slices rebase on the merged `main`.

---

## Conventions every slice follows

- **Branch:** `slice/S<N>-<short-name>` (e.g. `slice/S1-markdown`).
- **PR title:** `S<N> — <slice title>` (e.g. `S1 — Markdown utility`).
- **Commits:** Conventional, atomic, with the Claude co-author trailer.
- **Tests:** Unit tests for pure logic; property tests where helpful (parsers, dates, currency). Tests live next to the code they cover (`foo.test.ts` beside `foo.ts`).
- **Documentation:** Update the README if a setup step changes. Add an ADR if a new locked decision is made.
- **Quality gates:** `npm run typecheck && npm run test:run && npm run lint` all pass.
- **Done means:** PR open, gates green, the slice's acceptance criteria are demonstrably satisfied (screenshot or test output), CLAUDE.md and ADRs updated if needed.

---

# Slice catalog

Each slice section ends with a **kickoff prompt** — paste it verbatim into a new agent's prompt to dispatch.

---

## S1 — Markdown utility

- **Phase:** 1 — Foundations
- **Depends on:** S0 (done)
- **Owned directories:** `src/lib/markdown/`
- **Branch:** `slice/S1-markdown`

### Goal

Provide a reusable, round-trip-safe markdown utility: parse and serialize YAML frontmatter, preserve the body verbatim, and patch list/ledger items by stable ID without touching surrounding lines.

### Scope (in)

- `parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string }` — empty frontmatter → `{}`; missing frontmatter → empty object and the full content as `body`.
- `serializeFrontmatter(frontmatter: Record<string, unknown>, body: string): string` — emits `---\n<yaml>\n---\n<body>`; omits the block if `frontmatter` is empty *and* it was empty on input.
- Round-trip invariant: for any input the app might encounter, `serialize(parse(x))` equals `x` byte-for-byte (LF normalization is acceptable, but documented and reversible).
- Line-level patching primitives:
  - `findLineByBlockRef(body: string, blockRef: string): { lineIndex, line } | null`
  - `replaceLine(body: string, blockRef: string, newLine: string): string`
  - `insertLine(body: string, newLine: string, anchor?: { afterBlockRef: string }): string`
  - `removeLine(body: string, blockRef: string): string`
- Property tests with `fast-check` for the round-trip invariant on generated frontmatter (nested objects, arrays, special chars in strings).

### Scope (out)

- Entity-specific parsers (those live in their feature slices).
- Dataview inline field parsing (lives in `src/features/tasks/` and `src/features/shopping/`).

### Sharp edges

- YAML's quirks: unquoted strings that look like dates/booleans, multi-line strings, anchors. Use `yaml` library (`eemeli/yaml` — preferred for fidelity over `js-yaml`). Note the choice in an ADR if it's not obvious.
- CRLF input: normalize to LF on parse; remember the original line ending so serialize can restore it. Add a `LineEnding` enum and pass it through.
- Block reference (`^t-xxxx`) must be detected at end-of-line, after stripping trailing whitespace.

### Deliverables

- `src/lib/markdown/frontmatter.ts`
- `src/lib/markdown/lines.ts`
- `src/lib/markdown/index.ts` (barrel)
- `src/lib/markdown/*.test.ts`
- Corpus of realistic fixtures under `src/lib/markdown/__fixtures__/`

### Acceptance

- Round-trip property test passes 1000+ runs.
- A fixture corpus of ≥ 10 realistic markdown samples round-trips byte-for-byte (LF normalized).
- Line patching primitives have tests covering: not-found, found-mid-file, found-at-EOF, multiple ref candidates (error).

### Kickoff prompt

> You are picking up slice **S1 — Markdown utility** for the Travel Journal project. Read `CLAUDE.md`, then `IMPLEMENTATION-PLAN.md` (your slice section), then `docs/adr/0004-markdown-conventions.md` and `docs/adr/0006-offline-sync.md`.
>
> Your goal: a reusable, round-trip-safe markdown utility for YAML frontmatter and line-level patching of list/ledger items by Obsidian block reference. Read the **Scope**, **Sharp edges**, **Deliverables**, and **Acceptance** sections of S1 carefully.
>
> Branch: `slice/S1-markdown`. Don't expand scope. Entity-specific parsers live in feature slices — you build the building blocks. Property tests with `fast-check` on the round-trip invariant are required. Open a PR titled `S1 — Markdown utility` when gates are green.

---

## S2 — Local storage (Dexie)

- **Phase:** 1 — Foundations
- **Depends on:** S0 (done)
- **Owned directories:** `src/lib/storage/`
- **Branch:** `slice/S2-storage`

### Goal

A typed Dexie wrapper for all entities (the local read cache and write queue), with versioned migrations.

### Scope (in)

- Dexie schema with one table per entity: `trips`, `accommodations`, `places`, `expenses`, `tasks`, `shopping_items`, `articles`.
- One auxiliary table `file_meta` keyed by Drive `file_id`, storing `entity_id`, `entity_type`, `head_revision_id`, `modified_time`, `path`.
- One auxiliary table `write_queue` (rows: `{ id, entity_type, entity_id, op, payload, base_revision, attempts, last_error, created_at }`).
- One auxiliary table `kv` for app config (`active_trip_id`, `vault_root_file_id`, `travel_folder_file_id`, `drive_changes_page_token`).
- CRUD helpers per entity, typed against the Zod schemas: `getTrip(id)`, `listTripsByStatus(...)`, `upsertAccommodation(...)`, etc.
- Query helpers used elsewhere: `accommodationsByTrip(tripId)`, `expensesByTripAndMonth(tripId, yyyy_mm)`, etc.
- Versioned migration framework: `db.version(N).stores({...}).upgrade(async tx => {...})`.

### Scope (out)

- The sync worker (S3 owns that).
- React hooks on top of these queries (each feature slice writes its own thin hook using `dexie-react-hooks`).

### Sharp edges

- IndexedDB and `exactOptionalPropertyTypes`: keys that are absent must not be `undefined`. Strip `undefined` before `put` to avoid Dexie indexing surprises.
- ULID IDs are strings; indexing works fine.
- Dexie `Table<T, K>` types: use Zod-inferred types as `T`.

### Deliverables

- `src/lib/storage/db.ts` (Dexie instance + schema)
- `src/lib/storage/queries.ts` (typed CRUD + queries)
- `src/lib/storage/types.ts` (auxiliary table row types)
- `src/lib/storage/*.test.ts` using `fake-indexeddb`

### Acceptance

- All CRUD round-trips an entity unchanged through Dexie.
- Querying by `trip_id` returns the expected entities; cross-trip null filter works for `tasks` / `shopping_items` / `articles`.
- Migration test: simulate v1 → v2 schema change with sample data.
- Type safety: `upsertTrip` rejects a `Trip` shape missing required fields at compile time.

### Kickoff prompt

> You are picking up slice **S2 — Local storage** for the Travel Journal project. Read `CLAUDE.md`, then `IMPLEMENTATION-PLAN.md` (your slice section), then `docs/adr/0001-data-architecture.md` and `docs/adr/0006-offline-sync.md`.
>
> Your goal: a typed Dexie wrapper for entities, write queue, and file-meta tables, with versioned migrations and a tested CRUD + query API. Use `fake-indexeddb` for tests.
>
> Branch: `slice/S2-storage`. Use the Zod schemas in `src/domain/` as your source of truth for types. Don't implement the sync worker — S3 owns that. Open a PR titled `S2 — Local storage (Dexie)` when gates are green.

---

## S3 — Drive client + sync worker

- **Phase:** 1 — Foundations
- **Depends on:** S0 (done). Develops against an in-memory fake; integrates with S2's write queue at PR review time.
- **Owned directories:** `src/sync/drive/`, `src/sync/queue/`
- **Branch:** `slice/S3-drive`

### Goal

A Drive client and sync worker that implement ADR-0003 and ADR-0006: GIS implicit OAuth, scoped Drive REST calls, WRITE_ALLOWED_PREFIX guard, re-read-on-conflict, retry-with-backoff. Provide an in-memory fake usable from feature slices and tests.

### Scope (in)

- `DriveClient` interface: `getMetadata`, `getContent`, `listFolder`, `createFile`, `updateFile`, `pickFolder`, `getChanges`.
- Real implementation: GIS implicit token client + Drive v3 REST.
- In-memory fake: same interface, backed by a JS Map; emits revision changes deterministically; usable by tests and feature dev.
- WRITE_ALLOWED_PREFIX guard: rejects any write whose resolved path doesn't start with the configured Travel folder. Throws a typed `WriteOutOfScopeError`.
- Conflict reconciliation per ADR-0006: read → write → re-read; on mismatch, refetch, reapply structured edit (provided by caller as a callback), retry up to 3× with exponential backoff.
- Sync worker (`src/sync/queue/worker.ts`): drains `write_queue` from S2, hands each row to the right entity-specific reconciler. Reconcilers are registered by `entity_type` — defaults provided for frontmatter-only entities; feature slices register their own as needed.
- Triggers: app start, `online`, `focus`, `BackgroundSync` where available, manual `syncNow()`.

### Scope (out)

- Entity-specific edit reappliers (feature slices supply these as callbacks).
- Picker UI styling (S4 owns layout polish; S3 just opens the Picker).

### Sharp edges

- Drive `files.update` does not honor `If-Match` on content. The pattern is read-headRevision → write → re-read headRevision → if changed, retry. Implement and test exactly that.
- GIS silent re-auth (`prompt: ''`) fails in incognito. Surface a clean "Reconnect Drive" event for the UI to consume; don't throw.
- Drive ETag-on-metadata is supported but content updates ignore it. Don't confuse the two.
- Test the WRITE_ALLOWED_PREFIX guard extensively — it's the only thing standing between a bug and arbitrary writes.

### Deliverables

- `src/sync/drive/client.ts` (real implementation)
- `src/sync/drive/fake.ts` (in-memory implementation)
- `src/sync/drive/types.ts` (shared interface, errors)
- `src/sync/drive/auth.ts` (GIS wrapper)
- `src/sync/drive/picker.ts` (Picker SDK wrapper)
- `src/sync/queue/worker.ts`
- `src/sync/queue/reconciler.ts` (registry)
- `src/sync/**/*.test.ts`

### Acceptance

- All operations work against the fake. Tests exercise: happy path, mid-flight revision change, three-fold conflict, write-out-of-scope rejection, missing edit point.
- A short README in `src/sync/drive/` documents the auth flow and how to extend reconcilers.
- The real Drive client compiles; manual integration test instructions documented (don't attempt real OAuth in CI).

### Kickoff prompt

> You are picking up slice **S3 — Drive client + sync worker** for the Travel Journal project. Read `CLAUDE.md`, then `IMPLEMENTATION-PLAN.md` (your slice section), then `docs/adr/0003-drive-integration.md` and `docs/adr/0006-offline-sync.md` carefully — these define the algorithms you must implement.
>
> Your goal: a typed Drive client with a real GIS-backed implementation **and** an in-memory fake, a WRITE_ALLOWED_PREFIX guard, conflict reconciliation per ADR-0006, and a write-queue worker that drains S2's queue via a reconciler registry.
>
> Branch: `slice/S3-drive`. Do not implement entity-specific edit reappliers — feature slices register theirs. Test the WRITE_ALLOWED_PREFIX guard thoroughly. Open a PR titled `S3 — Drive client + sync worker` when gates are green.

---

## S4 — App shell

- **Phase:** 1 — Foundations
- **Depends on:** S0 (done)
- **Owned directories:** `src/app/`, `src/ui/layout/`, `src/ui/components/`
- **Branch:** `slice/S4-shell`

### Goal

Routing, layout, bottom nav, and trip switcher. Feature slices plug their routes in without touching shell internals.

### Scope (in)

- TanStack Router setup (code-based routes; file-based is fine if preferred, but document the choice).
- Root layout: top bar (app name + trip switcher), main, bottom nav with 8 tabs (Dashboard, Trips, Accommodations, Expenses, Places, Tasks, Shopping, Articles).
- Placeholder routes for each tab; feature slices replace contents.
- Trip switcher: reads/writes `active_trip_id` from the `kv` table (S2). Defaults to the first `status === 'active'` trip; if none, prompts to create one (deep-links to Trips slice).
- Tailwind tokens for color, spacing, type scale. Buttons, Inputs, Card, Sheet, Dialog primitives (no Radix yet — start with custom; revisit if needed).
- Mobile/desktop responsive: bottom nav on mobile, side nav on ≥ md breakpoint.
- App-wide providers: TanStack Query client + Dexie persister (S2 must merge first for the persister; until then, plain Query client is fine).

### Scope (out)

- Feature content (other slices).
- PWA install UX (S13).

### Sharp edges

- Safe area insets on iOS: use `env(safe-area-inset-bottom)` for the bottom nav. Test on Pixel too (notch handling).
- StrictMode + TanStack Router can double-mount; ensure router doesn't re-create on every render.

### Deliverables

- `src/app/router.tsx`, `src/app/providers.tsx`, `src/app/routes/` (one file per top-level route, all placeholders).
- `src/ui/layout/Shell.tsx`, `BottomNav.tsx`, `TopBar.tsx`, `TripSwitcher.tsx`.
- `src/ui/components/{Button,Input,Card,Sheet}.tsx`.
- Tests: render shell, switch trip, navigate between tabs.

### Acceptance

- Dev server runs; navigating between all 8 tabs works.
- Resizing between mobile and desktop layouts works without layout shift.
- Trip switcher reflects/changes `active_trip_id` (use a mock store until S2 is merged).

### Kickoff prompt

> You are picking up slice **S4 — App shell** for the Travel Journal project. Read `CLAUDE.md`, then `IMPLEMENTATION-PLAN.md` (your slice section), then `docs/adr/0002-frontend-stack.md` and `docs/adr/0010-multi-trip.md`.
>
> Your goal: TanStack Router, root layout with top bar + bottom nav, trip switcher, and a tiny primitives library (Button, Input, Card, Sheet). 8 placeholder routes — one per feature tab. Mobile-first, responsive at the `md` breakpoint.
>
> Branch: `slice/S4-shell`. Keep primitives lean; no Radix unless you justify it. Trip switcher should read from a mocked KV store until S2 lands, then swap to the real store. Open a PR titled `S4 — App shell` when gates are green.

---

## S5 — Trips

- **Phase:** 2 — Spine
- **Depends on:** S1, S2, S3, S4 (or their fakes/mocks; merge after Phase 1)
- **Owned directories:** `src/features/trips/`
- **Branch:** `slice/S5-trips`

### Goal

The first end-to-end Drive-backed flow: list, create, edit, and activate trips. Trips persist as `Trip.md` files in the vault and the active pointer in `.travel/config.json`.

### Scope (in)

- Trips list page (status filters: planned / active / completed / archived).
- Create trip form (name → slug, start/end dates, home_currency, status).
- Edit trip form.
- Active trip selection (mirrors `kv.active_trip_id`).
- Trip parser/serializer: `src/features/trips/parser.ts` — frontmatter + free-form body preserved.
- Slug uniqueness validation (Dexie query).
- First-run flow: if no Travel folder configured, prompt to pick (uses `pickFolder` from S3).
- Vault writes through S3's worker; full conflict-reconcile path exercised.

### Scope (out)

- Trip deletion (defer to S13 or later; archival is enough for v1).

### Sharp edges

- Renaming a trip changes the slug → the folder path. Don't rename folders on slug change without a confirmation; for v1 the slug is set at creation and immutable.
- Editing `start_date` / `end_date` after the trip has data must recompute missing-nights downstream (S6 handles its own invalidation).
- The first sync may take a few seconds — show a skeleton state.

### Deliverables

- `src/features/trips/parser.ts`, `parser.test.ts`
- `src/features/trips/queries.ts` (Dexie + Drive)
- `src/features/trips/components/{TripsList,TripForm,TripsRoute}.tsx`
- `src/features/trips/reconciler.ts` (registered into S3's registry)
- Integration test against the in-memory Drive fake: create trip → read back, edit → re-read, simulate concurrent edit → reconcile.

### Acceptance

- Creating a trip writes `<vault>/Travel/Trips/<slug>/Trip.md` and updates `.travel/config.json` if it's set active.
- Re-reading from Drive produces the same `Trip` entity.
- Concurrent edit (fake Drive emits a revision change) reconciles via reapply.
- Closing and reopening the app preserves the active trip.

### Kickoff prompt

> You are picking up slice **S5 — Trips** for the Travel Journal project. Read `CLAUDE.md`, then `IMPLEMENTATION-PLAN.md` (your slice section), then `docs/adr/0004-markdown-conventions.md`, `docs/adr/0006-offline-sync.md`, and `docs/adr/0010-multi-trip.md`.
>
> Your goal: trips CRUD as the first end-to-end Drive-backed flow. Trips list, create/edit forms, active trip pointer, first-run folder-picker. Build the trip parser/serializer and register a reconciler with S3's worker.
>
> Branch: `slice/S5-trips`. Slug is immutable for v1. Exercise the full S3 conflict-reconcile path in integration tests (against the in-memory fake). Open a PR titled `S5 — Trips` when gates are green.

---

## S6 — Accommodations + Missing Nights

- **Phase:** 3 — Features
- **Depends on:** S5
- **Owned directories:** `src/features/accommodations/`, `src/features/missing-nights/` (UI only; logic from S0 stays)
- **Branch:** `slice/S6-accommodations`

### Goal

Accommodations CRUD (the brief's most detailed entity) and the missing-nights dashboard view.

### Scope (in)

- Accommodations list (filterable by status).
- Create / edit form with every field from feature 8 of the brief: name, location (address + lat/lng — manual entry for v1, geocoding deferred), check-in/check-out, service (extensible enum), confirmation, cost+currency, host (name/phone/email), check-in instructions (body of the markdown file), notes, booking URL, status, attachments (paths under `.travel/attachments/`).
- File-per-accommodation: `<vault>/Travel/Trips/<slug>/Accommodations/<yyyy-mm-dd>-<accname-slug>.md`.
- Accommodation parser/serializer in `src/features/accommodations/parser.ts`. Body content below frontmatter is yours; it's preserved verbatim on write.
- Attachments: upload a screenshot/PDF; store as `<sha256>.<ext>` under `.travel/attachments/`; reference by path in frontmatter.
- Missing nights dashboard card (uses `computeMissingNights` from `src/features/missing-nights/compute.ts`).
- Calendar or list view of nights with coverage status (your call; document the choice).
- Upcoming-gaps surface on the home dashboard (deep-link from S4's Dashboard route).

### Scope (out)

- Geocoding (manual lat/lng only for v1).
- Linking expenses to accommodations (S7 handles the expense side).

### Sharp edges

- Attachment uploads use `multipart/related` to Drive `files.create`. Cap file size client-side (~10 MB) and surface a clear error.
- The accommodation parser must round-trip user notes verbatim — this is where most bugs will hide. Property-test it.
- Service `'other'` requires `service_other_label` (the Zod refine enforces this; UI must surface it).

### Deliverables

- `src/features/accommodations/parser.ts`, `parser.test.ts`
- `src/features/accommodations/queries.ts`
- `src/features/accommodations/reconciler.ts`
- `src/features/accommodations/components/{List,Form,Detail,Route}.tsx`
- `src/features/missing-nights/components/{Dashboard,Card,FullView}.tsx`

### Acceptance

- Round-trip property test on accommodation markdown.
- Creating, editing, deleting accommodations works against the fake Drive.
- Missing-nights view updates within one render of accommodation edits.
- Upcoming-gaps card on the Dashboard shows the next 30 days.

### Kickoff prompt

> You are picking up slice **S6 — Accommodations + Missing Nights** for the Travel Journal project. Read `CLAUDE.md`, then `IMPLEMENTATION-PLAN.md` (your slice section), then `docs/adr/0004-markdown-conventions.md` and `docs/adr/0010-multi-trip.md`. The pure missing-nights logic already exists at `src/features/missing-nights/compute.ts` — wire it into the UI, don't re-implement.
>
> Your goal: accommodations CRUD (the brief's most detailed entity), file-per-accommodation in the vault, attachments, and a missing-nights dashboard view that updates live.
>
> Branch: `slice/S6-accommodations`. The accommodation markdown parser must preserve user notes verbatim — property-test it. Open a PR titled `S6 — Accommodations + Missing Nights` when gates are green.

---

## S7 — Expenses + FX

- **Phase:** 3 — Features
- **Depends on:** S5
- **Owned directories:** `src/features/expenses/`, `src/lib/currency/`
- **Branch:** `slice/S7-expenses`

### Goal

Multi-currency expense tracking with snapshot conversions (ADR-0008) and category/period summaries.

### Scope (in)

- Expense entry form: date, amount, currency, category, description, optional location.
- Monthly ledger files: `<vault>/Travel/Trips/<slug>/Expenses/<yyyy-mm>.md` (one line per expense, frontmatter declares `type: expenses-ledger` and `month`).
- Line-level patching via S1's line primitives (block-ref `^e-<ulid-suffix>`).
- Frankfurter integration: daily fetch, cache to `.travel/rates/<yyyy-mm-dd>.json` (synced via Drive).
- Snapshot conversion on insert: store native `{ amount, currency }` + `home_conversion { amount, currency, rate, rate_date }`.
- Summaries: by category (current month, current trip), by period (week, month, all-time-trip).
- Stale-rate label in UI when conversion is > 1 day old.

### Scope (out)

- Currency editor (currencies are entered as 3-letter codes).
- Exchange-rate trend charts (defer).

### Sharp edges

- Frankfurter coverage: some currencies (e.g., Lao kip) may be missing. Fallback to `open.er-api.com` for missing codes; document.
- Don't compute conversions during list render — compute at insert time and persist.
- When the user changes the trip's `home_currency`, existing snapshots remain in the old currency (they're historical). Show both if requested; don't rewrite.

### Deliverables

- `src/lib/currency/frankfurter.ts`, `cache.ts`, `convert.ts`, `*.test.ts`
- `src/features/expenses/parser.ts` (ledger line format), `parser.test.ts`
- `src/features/expenses/queries.ts`, `reconciler.ts`
- `src/features/expenses/components/{Form,List,Summaries,Route}.tsx`

### Acceptance

- Property test: ledger round-trip (parse → serialize) on a corpus.
- Offline insert with cached rate works; UI labels conversion as cached.
- Switching trips switches the expense scope (multi-trip isolation).

### Kickoff prompt

> You are picking up slice **S7 — Expenses + FX** for the Travel Journal project. Read `CLAUDE.md`, then `IMPLEMENTATION-PLAN.md` (your slice section), then `docs/adr/0008-multi-currency.md` and `docs/adr/0004-markdown-conventions.md`.
>
> Your goal: multi-currency expense entry with snapshot conversions, monthly ledger files patched line-level, Frankfurter daily rates cached to the vault.
>
> Branch: `slice/S7-expenses`. Conversion is computed on insert and persisted (per ADR-0008). Property-test the ledger round-trip. Open a PR titled `S7 — Expenses + FX` when gates are green.

---

## S8 — Wishlist places + map

- **Phase:** 3 — Features
- **Depends on:** S5
- **Owned directories:** `src/features/places/`, `src/lib/maps/`
- **Branch:** `slice/S8-places`

### Goal

Wishlist places CRUD with a map view; foundation for the path map (S9).

### Scope (in)

- Place entity CRUD (name, lat/lng, category, notes, priority, visited flag, visited_date).
- File-per-place: `<vault>/Travel/Trips/<slug>/Places/<slug>.md`.
- Place parser/serializer.
- MapLibre GL integration: `<MapLibreMap>` shared component with style URL.
- Protomaps PMTiles loader: per-trip pre-download flow (bounding-box prompt, size display, progress, cancel).
- Layers: `places-wishlist`, `places-visited` (distinct icons).
- List view + tap-to-pan on map.

### Scope (out)

- Path polyline (S9 adds the line + composes with this map).
- Geocoding lat/lng from address (manual entry for v1).

### Sharp edges

- PMTiles + service worker Range request caching: validate Workbox's `RangeRequestsPlugin` with the chosen tile provider before relying on it.
- Map bundle size: lazy-load MapLibre + tile loader for routes that don't need it.
- Long-press / right-click to drop a pin at coordinates is a quick UX win; not required but nice.

### Deliverables

- `src/features/places/parser.ts`, `parser.test.ts`
- `src/features/places/queries.ts`, `reconciler.ts`
- `src/features/places/components/{List,Form,Detail,Route}.tsx`
- `src/lib/maps/MapLibreMap.tsx`, `pmtiles-loader.ts`, `*.test.ts`
- ADR if the choice between Protomaps' CDN vs self-hosted PMTiles becomes load-bearing.

### Acceptance

- Place CRUD round-trips via the fake Drive.
- Map renders, both layers visible, marker tap opens detail sheet.
- PMTiles pre-download for a small region (~10 MB) succeeds and renders offline.

### Kickoff prompt

> You are picking up slice **S8 — Wishlist places + map** for the Travel Journal project. Read `CLAUDE.md`, then `IMPLEMENTATION-PLAN.md` (your slice section), then `docs/adr/0005-maps.md`.
>
> Your goal: places CRUD, a shared `MapLibreMap` component, Protomaps PMTiles offline pre-download, two place layers (wishlist + visited).
>
> Branch: `slice/S8-places`. Validate Workbox Range-request caching against your chosen tile source before committing to the offline approach. Don't add the path polyline — S9 will compose with this. Open a PR titled `S8 — Wishlist places + map` when gates are green.

---

## S9 — Path map

- **Phase:** 4 — Composition
- **Depends on:** S6, S8
- **Owned directories:** `src/features/path-map/`
- **Branch:** `slice/S9-path-map`

### Goal

The "where I've been" map: date-ordered polyline from accommodations + visited places, layered atop S8's map.

### Scope (in)

- Date-ordered concatenation of accommodation coordinates and visited places.
- Polyline layer atop the shared `MapLibreMap` from S8.
- Toggle between "include wishlist" and "path only".
- Date scrubber: time-slider that limits the visible path up to a chosen date.

### Scope (out)

- Animation playback (defer).

### Deliverables

- `src/features/path-map/computePath.ts`, `*.test.ts` (pure function)
- `src/features/path-map/components/{Route,PathLayer,DateScrubber}.tsx`

### Acceptance

- Pure `computePath` returns correctly ordered `[lng, lat][]` for a given set of accommodations + visited places.
- Toggles and scrubber update the visible layer without remounting the map.

### Kickoff prompt

> You are picking up slice **S9 — Path map** for the Travel Journal project. Read `CLAUDE.md`, then `IMPLEMENTATION-PLAN.md` (your slice section). You depend on S6 (accommodations) and S8 (places + `MapLibreMap`).
>
> Your goal: a pure `computePath` function (date-ordered) and a `PathLayer` that composes with S8's `MapLibreMap`, plus a date scrubber.
>
> Branch: `slice/S9-path-map`. Don't fork S8's map — extend it. Open a PR titled `S9 — Path map` when gates are green.

---

## S10 — Tasks (vault-backed)

- **Phase:** 3 — Features
- **Depends on:** S5
- **Owned directories:** `src/features/tasks/`
- **Branch:** `slice/S10-tasks`

### Goal

A focused, structured editor over the user's Obsidian Tasks-formatted markdown.

### Scope (in)

- Task list per trip (and a "General" view for `trip_id === null`).
- Task line parser (Obsidian Tasks emoji syntax per ADR-0004): status, priority, dates (📅⏳➕✅🛫), tags, block-ref.
- Round-trip preservation: unknown tokens, free-form trailing text, surrounding markdown structure.
- Create / edit task UI.
- Tasks live in `<vault>/Travel/Trips/<slug>/Tasks.md` (per trip) or `<vault>/Travel/General/Tasks.md`.
- Dashboard card: overdue + due-soon (next 14 days).

### Scope (out)

- Recurring tasks (defer).
- Subtasks / nesting (defer; preserve indentation verbatim if present, don't try to model it).

### Sharp edges

- Block-ref must be the last token on the line, after any tags.
- A user might delete a task's line in Obsidian while the app is mid-edit. S3's reconciler surfaces this — handle the "edit point gone" case with a clear toast.
- Tasks files can be large (hundreds of lines). Parsing should be O(n).

### Deliverables

- `src/features/tasks/parser.ts`, `parser.test.ts` (corpus of Tasks-syntax samples)
- `src/features/tasks/queries.ts`, `reconciler.ts`
- `src/features/tasks/components/{List,Form,Route,DashboardCard}.tsx`

### Acceptance

- Corpus of ≥ 15 Tasks-syntax lines (incl. unknown tokens) round-trips byte-for-byte.
- Editing a task patches a single line; surrounding lines and unknown tokens untouched.
- Conflict path covered: simulate a vault edit that removes the line; toast shown.

### Kickoff prompt

> You are picking up slice **S10 — Tasks** for the Travel Journal project. Read `CLAUDE.md`, then `IMPLEMENTATION-PLAN.md` (your slice section), then `docs/adr/0004-markdown-conventions.md` and `docs/adr/0006-offline-sync.md`.
>
> Your goal: a structured editor over Obsidian Tasks-plugin markdown, per trip and General. Parser preserves unknown tokens verbatim. Edits are line-level via S1's primitives.
>
> Branch: `slice/S10-tasks`. Property-test the parser on a corpus of realistic Tasks-syntax lines. Open a PR titled `S10 — Tasks` when gates are green.

---

## S11 — Shopping list (vault-backed)

- **Phase:** 3 — Features
- **Depends on:** S5
- **Owned directories:** `src/features/shopping/`
- **Branch:** `slice/S11-shopping`

### Goal

A focused editor over checkbox + Dataview inline-field markdown (per ADR-0004).

### Scope (in)

- Per-trip and General shopping lists.
- Parser for `(qty:: N)` and `(cost:: 120 USD)` inline fields plus standard checkbox / tag / block-ref.
- Create / edit item UI with quantity, estimated cost, category, bought flag.
- Files: `<vault>/Travel/Trips/<slug>/Shopping.md`, `<vault>/Travel/General/Shopping.md`.

### Sharp edges

- Same line-level patching invariants as S10.
- `(qty::)` and `(cost::)` are Dataview inline fields with parens; the bare `qty::` form is *not* used (it doesn't render inside text).

### Deliverables

- `src/features/shopping/parser.ts`, `parser.test.ts`
- `src/features/shopping/queries.ts`, `reconciler.ts`
- `src/features/shopping/components/{List,Form,Route}.tsx`

### Acceptance

- Round-trip corpus passes byte-for-byte.
- Editing one item leaves all others untouched.

### Kickoff prompt

> You are picking up slice **S11 — Shopping list** for the Travel Journal project. Read `CLAUDE.md`, then `IMPLEMENTATION-PLAN.md` (your slice section), then `docs/adr/0004-markdown-conventions.md`.
>
> Your goal: a structured editor over checkbox + Dataview inline-field markdown for shopping items, per trip and General. Parser preserves unknown tokens; edits are line-level.
>
> Branch: `slice/S11-shopping`. Use `(key:: value)` Dataview form (with parens), not the bare form. Open a PR titled `S11 — Shopping list` when gates are green.

---

## S12 — Articles

- **Phase:** 3 — Features
- **Depends on:** S5; integrates with S8 if available
- **Owned directories:** `src/features/articles/`
- **Branch:** `slice/S12-articles`

### Goal

Saved-article notes with tags and an optional link to a wishlist place.

### Scope (in)

- One file per article: `<vault>/Travel/Trips/<slug>/Articles/<slug>.md` (or `General/Articles/<slug>.md`).
- Frontmatter: `url`, `title`, `tags`, `place_id` (nullable). Body is user notes.
- List view with tag filter, search by title.
- Detail view with linked place (if `place_id` set) and "open article" button.

### Sharp edges

- Slug collision: append a short random suffix.
- Linking to a `place_id` that no longer exists: surface gracefully.

### Deliverables

- `src/features/articles/parser.ts`, `parser.test.ts`
- `src/features/articles/queries.ts`, `reconciler.ts`
- `src/features/articles/components/{List,Form,Detail,Route}.tsx`

### Acceptance

- CRUD round-trips against the fake Drive.
- Tag filter and title search work offline.
- Linked place opens the corresponding S8 detail sheet if S8 is merged.

### Kickoff prompt

> You are picking up slice **S12 — Articles** for the Travel Journal project. Read `CLAUDE.md`, then `IMPLEMENTATION-PLAN.md` (your slice section), then `docs/adr/0004-markdown-conventions.md`.
>
> Your goal: saved-article notes — file per article, frontmatter for URL/title/tags/place_id, body for free-form notes. List with tag filter and title search.
>
> Branch: `slice/S12-articles`. If S8 has merged, deep-link the place_id to its detail sheet. Open a PR titled `S12 — Articles` when gates are green.

---

## S13 — PWA polish + deploy

- **Phase:** 5 — Ship
- **Depends on:** Everything in Phase 1–4 at least partially landed
- **Owned directories:** `public/`, `src/ui/install/`, deploy configs, `README.md` updates
- **Branch:** `slice/S13-ship`

### Goal

Make it install cleanly on the Pixel, deploy to Cloudflare Pages, and document the setup end-to-end.

### Scope (in)

- Icon set: 192, 512, and 512 maskable. Use a simple identity (map pin + suitcase or similar).
- Splash screens via manifest where supported.
- Install prompt UX (`beforeinstallprompt` capture + a dismissable banner).
- Offline status indicator in the top bar.
- Service worker update-available toast with one-tap reload.
- Cloudflare Pages deploy config (`wrangler.toml` if used, or just dashboard settings documented in README).
- GitHub Actions: lint + typecheck + test on PRs.
- README: deploy + install instructions, OAuth setup screenshots if helpful.

### Scope (out)

- Onboarding tutorial (defer).
- Native app wrappers (Capacitor): only if the PWA proves insufficient.

### Sharp edges

- After each deploy, verify the service worker actually picks up the new build. `registerType: 'autoUpdate'` should do it, but verify.
- iOS PWA quirks aren't our problem in v1 (Pixel + laptop) — document but don't fix.

### Deliverables

- `public/icons/*.png`
- `src/ui/install/{InstallBanner,UpdateToast,OfflineIndicator}.tsx`
- `.github/workflows/ci.yml`
- README updates
- Working deployment URL (paste into PR description)

### Acceptance

- Pixel: install from Chrome → standalone shortcut → app opens, works offline after first visit.
- Laptop Chrome: install → chromeless window.
- CI: green on a clean PR.
- README: a new developer can go from clone to local dev to deploy by following it.

### Kickoff prompt

> You are picking up slice **S13 — PWA polish + deploy** for the Travel Journal project. Read `CLAUDE.md`, then `IMPLEMENTATION-PLAN.md` (your slice section), then `docs/adr/0009-deployment-secrets.md`.
>
> Your goal: ship-ready icons, install UX, update + offline indicators, GitHub Actions CI, Cloudflare Pages deployment. Verify the install flow on the user's Pixel and laptop and document the path end-to-end in the README.
>
> Branch: `slice/S13-ship`. Don't ship without proof: paste a deployed URL into the PR description and screenshots of the install flow. Open a PR titled `S13 — PWA polish + deploy` when gates are green.

---

## Shared interfaces (Phase 1 ↔ later phases)

These are the public APIs Phase 1 must commit to and later phases consume. Changes require coordination.

### From S1 (markdown)

```ts
export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string };
export function serializeFrontmatter(frontmatter: Record<string, unknown>, body: string, opts?: { lineEnding?: 'lf' | 'crlf' }): string;

export function findLineByBlockRef(body: string, blockRef: string): { lineIndex: number; line: string } | null;
export function replaceLine(body: string, blockRef: string, newLine: string): string;
export function insertLine(body: string, newLine: string, anchor?: { afterBlockRef: string }): string;
export function removeLine(body: string, blockRef: string): string;
```

### From S2 (storage)

```ts
export const db: TravelDB; // Dexie instance
export async function upsertTrip(t: Trip): Promise<void>;
export async function listTripsByStatus(s: TripStatus): Promise<Trip[]>;
// ... one upsert + one or more queries per entity
export async function enqueueWrite(item: WriteQueueItem): Promise<void>;
export async function drainNext(): Promise<WriteQueueItem | null>;
export async function getKV<K extends KVKey>(key: K): Promise<KVValue<K> | null>;
export async function setKV<K extends KVKey>(key: K, value: KVValue<K>): Promise<void>;
```

### From S3 (Drive + sync)

```ts
export interface DriveClient {
  getMetadata(fileId: string): Promise<FileMetadata>;
  getContent(fileId: string): Promise<{ content: string; revision: string }>;
  listFolder(folderId: string): Promise<FileMetadata[]>;
  createFile(input: CreateFileInput): Promise<FileMetadata>;
  updateFile(input: UpdateFileInput): Promise<FileMetadata>;
  pickFolder(): Promise<{ id: string; name: string; path: string }>;
  getChanges(pageToken: string): Promise<{ changes: DriveChange[]; nextPageToken: string }>;
}

export interface Reconciler<E> {
  entityType: E['type']; // discriminant
  fromMarkdown(content: string): E | null;
  toMarkdown(entity: E, originalContent: string | null): string;
  applyEdit(originalContent: string, entity: E): string; // surgical patch
}

export function registerReconciler<E>(r: Reconciler<E>): void;
export function syncNow(): Promise<SyncReport>;
```

Feature slices import from these surfaces and **do not** add competing utilities in their own folders.

---

## Updating the plan

The user owns this file. Agents propose changes (in a PR or via a message to the user) but don't edit slice specs unilaterally. New slices get the next ID. Slice IDs are stable — don't renumber.

When a slice merges:

- Move it from "open" to a "Completed" list at the top.
- Update the **Status** section.
- If the merge changed a public interface in "Shared interfaces", update that section in the same PR.
