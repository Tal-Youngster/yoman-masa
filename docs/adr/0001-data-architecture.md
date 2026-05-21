# ADR 0001: Data architecture — vault-as-database, IndexedDB as local index

- **Status:** Accepted
- **Date:** 2026-05-21

## Context

The app needs a place to put trip data (trips, accommodations, places, expenses) and to read/write the user's vault data (tasks, shopping). The vault is synced via Google Drive. The app must work offline, be cheap to operate (single user), and not preclude a future small-social pivot.

## Decision

**Google Drive (the user's vault) is the source of truth for all app data and vault data.** Every entity is a markdown file (or a line in a monthly ledger) under `<vault>/Travel/`. **IndexedDB (Dexie) is a local read cache and write queue** — the UI always reads from Dexie; writes are queued locally and pushed to Drive by a sync worker.

There is no hosted backend.

## Alternatives considered

- **Hosted backend (Supabase/Postgres + RLS).** Real queries, real-time, easy auth. Costs money long-term, vendor coupling, adds a second sync surface alongside Drive, and data leaves the user's control. Rejected.
- **Pure file-based with no local cache.** Drive isn't a database — listing "all expenses in May" would require reading many files on every render. Rejected.
- **Local-first DB with optional cloud sync.** Either it syncs to Drive (= this decision) or to a backend (= rejected option above).

## Consequences

- One sync mechanism end-to-end (Drive).
- Data is portable, Obsidian-inspectable, and survives the app.
- Social pivot later: introduce a backend that consumes the same file format. The data model survives.
- We carry the operational cost of building a sync layer (write queue, conflict reconciliation). This is unavoidable for offline-first.

## Sharp edges

- Drive API quotas (~12k calls / 100s / user). Debounce writes (≥ 1s), coalesce changes, never persist per-keystroke.
- Drive does not support optimistic-locked content updates. Conflict detection uses `headRevisionId` + re-read-after-write (see ADR-0006).
- `drive` OAuth scope means the app technically has full Drive access. A `WRITE_ALLOWED_PREFIX` guard at the Drive client layer must refuse writes outside `<vault>/Travel/`.
