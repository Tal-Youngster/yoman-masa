# Implementation Plan

Multi-agent dispatch plan for the Travel Journal app. Each slice is sized to be picked up by one agent and merged independently. Read `CLAUDE.md` first, then this file, then the ADRs in `docs/adr/`.

## Status

### In-flight (open PRs)

- **S15 — Accommodation from Gmail** (`slice/S15-gmail-accommodation`, ADR-0016). Adds Gmail as a third AI-extraction source for accommodations, alongside the existing URL + screenshot flow. New `src/lib/gmail/` read-only client (`listRecentInbox` / `getMessageText`, real REST + `FakeGmail`, pure MIME decode in `mime.ts`), `gmail.readonly` added to the GIS scope in `main.tsx` (same token authorizes Drive + Gmail), `AiClient.extractData` gains an optional `text` input, and a `GmailPicker` (recent-inbox list) wired into `AiExtractionDialog`. Shared prompt/types extracted to `features/accommodations/ai-extraction.ts`. Body text only — attachments deferred. Gates green; 16 new tests (MIME decode + client auth paths).

Next up: **S9 — Path map** (re-spec'd against Google Maps), still unstarted; see the slice catalog below.

### Completed

- **S0 — Scaffolding + domain foundation** (4 commits on `main`)
  - Vite + React 19 + TS strict + Tailwind 4 + PWA scaffold
  - All 10 ADRs locked
  - Zod schemas for `Trip`, `Accommodation`, `Place`, `Expense`, `Task`, `ShoppingItem`, `Article` (multi-trip)
  - `IsoDate` with UTC-based math, tested across DST and leap years
  - `computeMissingNights` + `groupMissingGaps` with 15 cases incl. property test

- **Phase 1 — Foundations** (S1 + S2 + S3 + S4, dispatched in parallel, merged into `main`)
  - **S1 — Markdown utility** (5 commits): `src/lib/markdown/` — `parseFrontmatter` / `serializeFrontmatter` (eemeli/yaml, LF-normalizing, lineEnding-restoring), line primitives by Obsidian block-ref, 12 fixture round-trips, fast-check property test (1000 runs).
  - **S2 — Local storage** (5 commits): `src/lib/storage/` — Dexie schema (`trips`, `accommodations`, `places`, `expenses`, `tasks`, `shopping_items`, `articles`, `file_meta`, `write_queue`, `kv`) + typed CRUD + `enqueueWrite` / `drainNext` / `recordQueueFailure` + `getKV` / `setKV` / `deleteKV`. v1→v2 migration adds `[trip_id+date]` compound index. 47 tests via `fake-indexeddb`.
  - **S3 — Drive client + sync worker** (7 commits): `src/sync/drive/` + `src/sync/queue/` — `WRITE_ALLOWED_PREFIX` guard (25 hostile cases), `FakeDrive` in-memory client, real GIS-backed `DriveClient` (compiles, manual integration only), conflict reconciliation per ADR-0006 (3-attempt budget, exponential backoff), `MemoryWriteQueue` placeholder, reconciler registry. 54 new tests.
  - **S4 — App shell** (8 commits): `src/app/` + `src/ui/{components,layout}/` — TanStack Router (code-based, 8 placeholder routes), `Shell` / `TopBar` / `SideNav` / `BottomNav` / `TripSwitcher`, `Button` / `Input` / `Card` / `Sheet` primitives (native `<dialog>`), in-memory `KVStore` interface ready for Dexie swap. jsdom@25 pinned (Node 20.17 floor). 28 new tests.
  - **Merge & integration**: 4 `--no-ff` merges into `main`; trivial `package.json` resolution on S4; `src/app/dexie-kv-store.ts` adapter wires S4's `KVStore` to S2's `getKV` / `setKV` / `deleteKV`. All gates green: typecheck, lint, 177/177 tests, `vite build` (321 KB / 100 KB gzipped).

- **Phase 2 — Spine** (S5, merged via `slice/S5-trips`)
  - **S5 — Trips**: first end-to-end Drive-backed flow. v2→v3 write_queue migration adds `file_id` + `resolved_path` columns plus non-destructive `peekNextPending` / `dequeueById` helpers (keeping `drainNext` destructive for Phase-1 callers). Dexie-backed `WriteQueue` adapter (`src/sync/queue/dexie-queue.ts`) translates between S2's snake_case + epoch-ms rows and S3's camelCase + ISO `WriteQueueItem`; deadletters legacy v2 rows with empty `resolved_path`. `src/features/trips/` ships the trip parser/serializer with body preservation (8 fixture tests + 1000-run fast-check), slug derivation with NFKD + Unicode fallback, Dexie + Drive queries, the trip reconciler (creates emit frontmatter-only files), the JSON `activeConfigReconciler` for `<travel>/.travel/config.json`, and the full UI: `TripsList` (status-filter chips), `TripForm` (live slug preview, immutable post-create slug, editable currency + status + dates), `FirstRunFolderPrompt` (wraps S3's `pickFolder`), and `TripsRoute`. `src/app/trips-admin.ts` combines local persistence + write-queue enqueue + drainAll into one service exposed via the AppServices context.

- **Phase 3 — Features** (S6, S7, S8, S10 baseline — merged)
  - **S6 — Accommodations + Missing Nights** (PR #6): file-per-accommodation under `Travel/Trips/<slug>/Accommodations/`, parser with body preservation, attachments path, missing-nights dashboard card wired to `computeMissingNights`.
  - **S7 — Expenses + FX**: shipped, then **removed** on 2026-08-30 (ADR-0018). The curated `CurrencyPicker` it introduced survives in `src/ui/components/` and is still used by `TripForm`.
  - **S8 — Wishlist places + map** (PR #7): place CRUD with map view. Originally built on MapLibre + Protomaps PMTiles per ADR-0005. **Superseded mid-feature by S8b (ADR-0013)** — see In-flight above for the Google Maps pivot.
  - **S10 — Tasks baseline** (3 commits direct to `main`): line parser + serializer (Obsidian Tasks emoji syntax per ADR-0004), reconciler registered with the queue worker, queries + `tasksAdmin` service, and the UI (`TasksRoute`, `TasksList`, `TaskForm`, `TasksDashboardCard`). The quick-add UX + ADR-0011 (recurrence) + ADR-0012 (manual order) are the in-flight follow-up PR above.

- **Phase 5 — Ship** (S13, PR #12)
  - **S13 — PWA polish + Cloudflare Workers deploy**: app icons generated from `public/logo.svg` (192, 512, maskable 512, favicon, apple-touch), install-prompt banner (`InstallBanner.tsx`) on `beforeinstallprompt` capture, `wrangler.jsonc` Cloudflare Workers config (secrets injected, not baked), GitHub Actions CI (`.github/workflows/ci.yml`) running lint + typecheck + test + deploy on push to `main`, Node 22 for wrangler v4. README updated with deploy + setup. Followed up by PR #13 (sync stabilization: `fix(sync): stop the stale-Drive-folder 404 sync loop` + `auto-resume sync when the Travel folder is re-picked`).

- **Post-ship batch — landed after S13**
  - **S10 — Tasks: quick-add + recurrence/manual-order ADRs** (PR #16, `slice/S10-tasks`). Built on top of the S10 baseline (parser/queries/reconciler/list-form-dashboard that shipped directly to `main` earlier) with the `QuickAddTask` + `TaskRow` components, `quick-parse` utility (8 tests), and ADR-0011 (recurrence) + ADR-0012 (manual order) as forward-looking decisions. No schema migration. Gates at merge: 371/371.
  - **S8b — Places: Google Maps pivot** (PR #17, `slice/S8b-places-google-maps`, ADR-0013 supersedes ADR-0005). Drops `maplibre-gl` + `pmtiles`, adds `@vis.gl/react-google-maps`, replaces `lib/maps/MapLibreMap` with `lib/maps/GoogleMap` (thin `<APIProvider>` + `<Map>` wrapper), introduces `features/places/components/PlacesMap` (Advanced Markers + bounds-fit controller), and a `google-maps-link` helper. `.env.example` switches `VITE_PROTOMAPS_API_KEY` → `VITE_GOOGLE_MAP_ID`. Gates at merge: 369/369.
  - **Drive auth persistence** (PR #14, `fix/auth-persist-token`, ADR-0003 amendment). Adds optional `AuthPersistence` to `DriveAuth` so a page refresh rehydrates the short-lived (~1h) access token from `localStorage` and skips the GIS round-trip; caches the user's email from `oauth2/v3/userinfo` for `loginHint` on silent re-auth. Refresh-token rule stands. Wired in `main.tsx` with a localStorage-backed implementation; tests cover load/save/expiry. Gates at merge: 368/368.
  - **S14 — Inbound Drive sync** (PR #19, `slice/S14-inbound-sync`, ADR-0014). Closes the "Drive as source of truth" gap. Adds the inbound pull subsystem at `src/sync/pull/` (change-feed worker + first-run backfill, parallel to the outbound `src/sync/queue/`), a per-entity inbound reconciler interface (first registration is `tripInboundReconciler`), `useDriveInboundSync` hook mounted in the shell that fires on mount / focus / `online` / folder change with overlapping-trigger coalescing. Gates at merge: 377/377.
  - **Plan doc backfill + S9 re-spec** (PR #20, `docs/plan-and-s9`). Status section brought current; S9 rewritten against `@vis.gl/react-google-maps` (ADR-0015 locks the path-rendering choice as a `google.maps.Polyline` driven by a small `<PathLayer>` child of `<GoogleMap>`).
  - **Sync folder prefix fix + Drive config UI move** (`fix/sync-folder-prefix-and-config-ui`). Outbound `resolveParent` was double-counting the `Travel/` WRITE_ALLOWED_PREFIX, writing files at `<picked>/Travel/Trips/<slug>/Trip.md` instead of `<picked>/Trips/<slug>/Trip.md`. Single-device round-trip hid it; the moment a second device pulled, `tripInboundReconciler.matchesPath` (`^Trips/<slug>/Trip\.md$`) rejected the nested paths and trips silently failed to converge. Extracted `resolveParent` into `src/app/resolve-parent.ts` with 9 FakeDrive-backed regression tests. Same PR moves the "Drive Config" card from the profile menu into the `SyncStatus` cloud-icon popover, adds a new `travel_folder_name` KV key captured at pick time so the popover renders the configured folder + status text offline-safe. Existing nested files need a one-time manual move in Drive UI.
  - **S16 — Trip-centric UI/UX refactor** (`slice/S16-nav-overview`, ADR-0017). Lifts Trips out of the flat tab set into a distinct master tab (elevated side-nav block + accented bottom-nav slot); tapping a trip activates it and drops into the Overview. Rebuilds `/` as the trip-scoped **Trip Overview** (hero General card + four tappable tiles: Trip Map static-map preview, missing-nights countdown, tasks, shopping). Relabels Places → **Trip Map** and surfaces accommodations as blue "stay" pins there (tap → read-only `AccommodationView`). Adds Static-Maps thumbnails to accommodation rows via a new `src/lib/maps/static-map.ts`. **Removes the standalone Path map** (S9) — supersedes ADR-0015. Welcoming polish across login, top bar, and empty states (shared `EmptyState`). Gates green; 520 tests. **Action item:** enable the **Maps Static API** on `VITE_GOOGLE_API_KEY` for the thumbnails/preview to render.

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
  S7  Expenses + FX  (removed — ADR-0018)
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
- `serializeFrontmatter(frontmatter: Record<string, unknown>, body: string): string` — emits `---\n<yaml>\n---\n<body>`; omits the block if `frontmatter` is empty _and_ it was empty on input.
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

## S7 — Expenses + FX — **REMOVED (ADR-0018)**

Shipped in Phase 3, removed 2026-08-30. The feature, `src/lib/currency/`'s FX
modules, the `expenses` Dexie store and the `/expenses` tab are gone; the spec
that produced them is recoverable from git history along with the code. Vault
ledger files (`Trips/<slug>/Expenses/<yyyy-mm>.md`) were left in place.

See `docs/adr/0018-remove-expenses.md`. ADR-0008 is superseded.

---

## S8 — Wishlist places + map

- **Phase:** 3 — Features
- **Depends on:** S5
- **Owned directories:** `src/features/places/`, `src/lib/maps/`
- **Branch:** `slice/S8-places`

> **Pivot (2026-05-30):** S8 merged on MapLibre + Protomaps PMTiles, then was superseded mid-feature by **S8b** (ADR-0013) — `@vis.gl/react-google-maps`, Advanced Markers, no PMTiles pre-download. The S8 spec below is preserved for history; the live implementation matches S8b. S9 builds on S8b's `lib/maps/GoogleMap`, not the deprecated `MapLibreMap`.

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
- **Depends on:** S6 (accommodations), S8b (Google Maps pivot — `lib/maps/GoogleMap` must be on `main`)
- **Owned directories:** `src/features/path-map/`
- **Branch:** `slice/S9-path-map`

> **Re-spec note (2026-05-30):** The original S9 spec targeted MapLibre — that stack is gone (ADR-0013). This spec composes with `@vis.gl/react-google-maps` instead. **Read ADR-0015 first** — it locks the path-rendering choice (native `google.maps.Polyline` via a `<PathLayer>` child) and explains why the alternatives (Directions, Deck.gl) were rejected.

### Goal

The "where I've been" map: a date-ordered polyline drawn from accommodation check-ins + visited places, rendered atop the shared `GoogleMap` from S8b. Per ADR-0015 the polyline is a `google.maps.Polyline` managed by a small `<PathLayer>` component using `useMap()`.

### Scope (in)

- **`computePath` (pure function).** Date-ordered concatenation of accommodation coordinates (by `check_in`) and visited places (by `visited_date`). Returns `LatLngLiteral[]`. Framework-free so tests run in Node. Tie-breaking, ties on the same date, and accommodations with missing coordinates are spelled out in the test corpus.
- **`<PathLayer>` component.** Child of `<GoogleMap>`. Calls `useMap()`, creates a single `google.maps.Polyline`, applies styling per ADR-0015 (`#2563eb` stroke, 3 px, 0.85 opacity), `setPath`s on prop change, `setMap(null)` on unmount. Returns `null`.
- **`<PathMapRoute>`** — the route. Mounts `<GoogleMap>` directly (not via `PlacesMap`); renders an `<AdvancedMarker>` for each accommodation + visited place, the `<PathLayer>`, and the date scrubber underneath.
- **Toggle:** "include wishlist" vs "path only". When wishlist is on, render non-visited places with the wishlist pin colour from `PlacesMap` (`#e0413e`). Off by default.
- **Date scrubber.** A range input that filters the polyline points and markers up to a chosen date. Filtering happens in React state from the full `computePath` output — `computePath` itself stays deterministic.
- **Deep-link from Dashboard.** The Path-map route is reachable from the existing Dashboard tab and the bottom nav slot already wired in S4.

### Scope (out)

- Animation playback (deferred — covered by an "if/when" clause in ADR-0015).
- Antimeridian segment splitting (deferred — see ADR-0015 sharp edges).
- Editing waypoints from the map (read-only view; editing lives in S6 / S8b).

### Sharp edges (extending ADR-0015)

- **`useMap()` returns `null` on first render.** Same guard the existing `MapController` inside `PlacesMap` uses — `if (!map) return;` inside the effect.
- **`setPath` vs new `Polyline`.** Mutate, don't recreate. Recreating flickers because Google removes the old overlay before mounting the new one.
- **Cleanup on unmount.** `polyline.setMap(null)` in the effect cleanup is non-negotiable.
- **`computePath` purity.** Don't compute live in the JSX — memoize once per `(accommodations, places)` input pair via `useMemo`. The scrubber slices the memoized array, doesn't recompute.
- **Reused styling.** Pull the wishlist / visited pin colours from a shared constant rather than redefining them — they have to match `PlacesMap`.

### Deliverables

- `src/features/path-map/computePath.ts`, `computePath.test.ts` (pure function — fixture corpus with tie-breaking, missing-coord, and date-ordering cases)
- `src/features/path-map/components/PathLayer.tsx` (the `useMap()` + `Polyline` controller)
- `src/features/path-map/components/PathMapRoute.tsx`
- `src/features/path-map/components/DateScrubber.tsx`
- Optional: a shared `src/features/places/colors.ts` (or similar) if the pin-colour constants need extracting from `PlacesMap` to avoid drift.

### Acceptance

- `computePath` round-trips a 10+ entry fixture with the expected `LatLngLiteral[]`.
- `PathLayer` mounts inside `GoogleMap`, draws the polyline, and updates without remounting the map when the path or scrubber changes (assert via render counts in test).
- Toggles and scrubber update the visible layer without remounting `<APIProvider>` / `<Map>`.
- ADR-0015 referenced from the PR description.

### Kickoff prompt

> You are picking up slice **S9 — Path map** for the Travel Journal project. Read `CLAUDE.md`, then `IMPLEMENTATION-PLAN.md` (your slice section), then **`docs/adr/0015-path-map-on-google-maps.md`** (it locks the rendering choice), then `docs/adr/0013-places-google-maps.md` for context. You depend on S6 (accommodations) and the merged S8b Google Maps pivot.
>
> Your goal: a pure `computePath` function (date-ordered, framework-free), a `<PathLayer>` component that composes with `lib/maps/GoogleMap` via `useMap()`, a `<DateScrubber>`, and a `<PathMapRoute>` that mounts the map directly with its own marker set (do **not** route through `PlacesMap`).
>
> Branch: `slice/S9-path-map`. Don't fork `GoogleMap` — consume it. The polyline must be mutated via `setPath`, not recreated. Open a PR titled `S9 — Path map` when gates are green.

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
- `(qty::)` and `(cost::)` are Dataview inline fields with parens; the bare `qty::` form is _not_ used (it doesn't render inside text).

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

## S15 — Accommodation from Gmail

- **Phase:** 3 — Features (follow-up to S6)
- **Depends on:** S6 (accommodations), existing AI extraction (`src/lib/ai/`)
- **Owned directories:** `src/lib/gmail/`, `src/features/accommodations/`
- **Branch:** `slice/S15-gmail-accommodation`

### Goal

Let the user pick a confirmation email from their Gmail inbox and AI-extract it
into a prefilled accommodation form — a third input source next to the existing
URL and screenshot extraction.

### Scope (in)

- **`gmail.readonly` OAuth scope** added to the GIS token request (ADR-0016).
  The single ~1h access token authorizes both Drive and Gmail; scope composed
  in `main.tsx`, not in the `drive/` module.
- **`src/lib/gmail/`** — read-only `GmailClient` (`listRecentInbox`,
  `getMessageText`), real REST implementation reusing the Drive access-token
  getter, in-memory `FakeGmail`, and pure MIME helpers (`mime.ts`: base64url
  decode, multipart body extraction, metadata parse).
- **`AiClient.extractData`** gains an optional `text` input (raw email body).
- **`GmailPicker`** — recent-inbox list (sender / subject / date), tap a row →
  fetch body → extract → prefill the form. Wired into `AiExtractionDialog`.
- Shared prompt/types/sanitizer extracted to
  `features/accommodations/ai-extraction.ts`.

### Scope (out)

- PDF/image email attachments (body text only for v1).
- Gmail search / labels (recent-inbox list only).
- Other entity types (accommodations only).

### Acceptance

- MIME decode + body extraction unit-tested (base64url, nested multipart,
  attachment skipping, HTML fallback).
- Gmail client maps the inbox list and surfaces `GmailAuthError` on 401/403.
- Picker handles not-connected / needs-reconnect / empty-inbox states.
- ADR-0016 referenced from the PR. Gates green.

---

## Shared interfaces (Phase 1 ↔ later phases)

These are the public APIs Phase 1 must commit to and later phases consume. Changes require coordination.

Signatures below reflect what `main` actually exports after Phase 1 merged. Where an agent diverged from the original spec, the change is noted.

### From S1 (markdown) — `src/lib/markdown/`

```ts
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
  lineEnding: 'lf' | 'crlf';
  hadFrontmatter: boolean;
};
export function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
  opts?: { lineEnding?: 'lf' | 'crlf'; alwaysEmit?: boolean },
): string;

export function findLineByBlockRef(
  body: string,
  blockRef: string,
): { lineIndex: number; line: string } | null;
export function replaceLine(body: string, blockRef: string, newLine: string): string;
export function insertLine(
  body: string,
  newLine: string,
  anchor?: { afterBlockRef: string },
): string;
export function removeLine(body: string, blockRef: string): string;

export class AmbiguousBlockRefError extends Error {}
```

`parseFrontmatter` returns `lineEnding` and `hadFrontmatter` so callers can round-trip CRLF inputs and decide whether to emit an empty fence. `serializeFrontmatter` accepts `alwaysEmit` to force a fence when an input had one but parsed to `{}`.

### From S2 (storage) — `src/lib/storage/`

```ts
export const db: TravelDB; // singleton; tests can construct via `new TravelDB(name)`
export async function upsertTrip(t: Trip, db?: TravelDB): Promise<void>;
export async function listTripsByStatus(s: TripStatus, db?: TravelDB): Promise<Trip[]>;
// ... one upsert + one or more queries per entity (accommodations, places, expenses, tasks, shopping_items, articles)

// Schema is at v3 after S5. Migration backfills pre-v3 rows with
// file_id=null and resolved_path=''. The Dexie WriteQueue adapter
// dead-letters rows with resolved_path === ''.
export interface WriteQueueItem {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  op: WriteOp;
  payload: unknown;
  base_revision: string | null;
  file_id: string | null; // ADDED v3 (S5)
  resolved_path: string; // ADDED v3 (S5)
  attempts: number;
  last_error: string | null;
  created_at: number; // epoch ms
}
export async function enqueueWrite(item: EnqueueInput, db?: TravelDB): Promise<void>;
// Destructive: pops the head AND removes it. Kept for Phase-1 callers.
export async function drainNext(db?: TravelDB): Promise<WriteQueueItem | null>;
// Non-destructive helpers added in S5 for the Dexie WriteQueue adapter.
export async function peekNextPending(db?: TravelDB): Promise<WriteQueueItem | null>;
export async function dequeueById(id: string, db?: TravelDB): Promise<void>;
export async function peekQueue(limit?: number, db?: TravelDB): Promise<WriteQueueItem[]>;
export async function recordQueueFailure(id: string, error: string, db?: TravelDB): Promise<void>;
export async function deleteQueueItem(id: string, db?: TravelDB): Promise<void>;

export async function getKV<K extends KVKey>(key: K, db?: TravelDB): Promise<KVValue<K> | null>;
export async function setKV<K extends KVKey>(
  key: K,
  value: KVValue<K>,
  db?: TravelDB,
): Promise<void>;
export async function deleteKV(key: KVKey, db?: TravelDB): Promise<void>;
```

All queries accept an optional `db` for test isolation. KVKey is exhaustive over `active_trip_id` / `vault_root_file_id` / `travel_folder_file_id` / `drive_changes_page_token`. `EntityType` was extended in S5 with `'active_config'` for the `.travel/config.json` pointer file.

### From S3 (Drive + sync) — `src/sync/drive/`, `src/sync/queue/`

```ts
export interface DriveClient {
  getMetadata(fileId: FileId): Promise<FileMetadata>;
  getContent(fileId: FileId): Promise<{ content: string; revision: RevisionId }>;
  listFolder(folderId: FileId): Promise<readonly FileMetadata[]>;
  createFile(input: CreateFileInput): Promise<FileMetadata>;
  updateFile(input: UpdateFileInput): Promise<FileMetadata>;
  pickFolder(): Promise<FolderPick>;
  getChanges(pageToken: string): Promise<DriveChangeBatch>;
  startChangeToken(): Promise<string>; // ADDED — Drive `changes.list` needs an initial token
}

export interface Reconciler<Entity, Payload = unknown> {
  readonly entityType: string;
  fromMarkdown(content: string): Entity | null;
  toMarkdown(entity: Entity, originalContent: string | null): string;
  applyEdit(originalContent: string, item: WriteQueueItem<Payload>): string; // takes the queue row, not the entity, so reconcilers see baseRevision + payload
}

export interface WriteQueueItem<P = unknown> {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly op: WriteOp;
  readonly payload: P;
  readonly baseRevision: string | null;
  readonly fileId: string | null; // NEW — null on first-time creates
  readonly resolvedPath: string; // NEW — re-checked by WRITE_ALLOWED_PREFIX at write time
  readonly attempts: number;
  readonly lastError: string | null;
  readonly createdAt: string; // ISO
}
export interface WriteQueue {
  enqueue(item: WriteQueueItem): Promise<void>;
  drainNext(): Promise<WriteQueueItem | null>;
  markFailed(id: string, error: string, terminal: boolean): Promise<void>;
}

export const reconcilers: ReconcilerRegistry; // .register(r) / .get(type) / .has(type) / .unregister(type)
export async function drainAll(opts: WorkerOptions): Promise<SyncReport>; // primary entry point; replaces the spec's `syncNow()`

// Added in S5 — Dexie-backed adapter that satisfies the WriteQueue interface.
export function createDexieWriteQueue(db?: TravelDB): DexieWriteQueue;
export interface DexieWriteQueue extends WriteQueue {
  markApplied(id: string): Promise<void>;
}
```

S3's deviations from the original spec:

- Added `startChangeToken()` (Drive `changes.list` needs an initial page token).
- `Reconciler.applyEdit` receives the `WriteQueueItem`, not the bare entity, so it can see `baseRevision` and the original `payload`.
- Worker entry point is `drainAll(opts)` over a parameterized bundle (registry + queue + client + guard); no thinner `syncNow()` facade yet.
- S5 added `markApplied(id)` to the `WriteQueue` interface (optional). The Dexie adapter uses it to delete the row after a successful write (`drainNext` is non-destructive there); `MemoryWriteQueue`'s implementation is a no-op for backward compatibility. The worker calls `queue.markApplied?.(item.id)` after each `applied` / `no-op` outcome.

### S4 (app shell) → S2 wiring — `src/app/dexie-kv-store.ts`

```ts
export function createDexieKVStore(db?: TravelDB): KVStore;
```

Wraps S2's `getKV` / `setKV` / `deleteKV` to satisfy S4's `KVStore` interface. `set(key, null)` clears the row.

### Integration: S2 ↔ S3 write queue (resolved in S5)

Resolved in S5 by extending S2's `write_queue` schema (option 1, as recommended):

- **v3 migration** adds `file_id: string | null` and `resolved_path: string` columns and indexes both. The upgrade hook backfills pre-v3 rows with `file_id=null` and `resolved_path=''`. The migration test covers v1→v3, v2→v3 (with a synthetic legacy row), and a fresh-DB-at-v3 case.
- **`enqueueWrite`** now requires both fields. The `EnqueueInput` type enforces this at the type system.
- **`peekNextPending` + `dequeueById`** are non-destructive helpers added alongside the destructive `drainNext` (kept as-is so existing Phase-1 callers/tests stay green).
- **Dexie adapter at `src/sync/queue/dexie-queue.ts`** translates snake*case rows ↔ camelCase `WriteQueueItem`, and epoch ms ↔ ISO `createdAt`. It implements `WriteQueue` for the S3 worker. `drainNext` claims (returns + hides) without deleting; `markApplied(id)` / terminal `markFailed(id, *, true)`delete; non-terminal`markFailed`bumps attempts via`recordQueueFailure`. Rows with empty `resolved_path` (the v2 migration sentinel) are silently dead-lettered to prevent ever forwarding them to Drive.
- **`WriteQueue.markApplied` (optional)** added to the S3 surface for queues that need an explicit success confirmation. The worker calls it after `applied` / `no-op` outcomes; `MemoryWriteQueue` implements it as a no-op for backward compatibility (its `drainNext` already removes the item from the visible queue).

Feature slices import from these surfaces and **do not** add competing utilities in their own folders.

---

## Updating the plan

The user owns this file. Agents propose changes (in a PR or via a message to the user) but don't edit slice specs unilaterally. New slices get the next ID. Slice IDs are stable — don't renumber.

When a slice merges:

- Move it from "open" to a "Completed" list at the top.
- Update the **Status** section.
- If the merge changed a public interface in "Shared interfaces", update that section in the same PR.
