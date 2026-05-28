# ADR 0014: Inbound Drive sync — change-feed pull + backfill

- **Status:** Accepted
- **Date:** 2026-05-28

## Context

ADR-0001 / ADR-0006 declared the user's Drive vault the source of truth and
described an offline-first sync layer. Through S5–S12 the slices only wired
the **outbound** half: app-side mutations flow into the write queue and
`drainAll` pushes them to Drive. There is no inbound path — files created or
edited outside this device (by Obsidian, by another phone, or by hand in
Drive) never reach Dexie, so the app reads a stale subset of the vault.

Concretely: a `Travel/Trips/<slug>/Trip.md` that exists on Drive but was
never created via the local `tripsAdmin.createTrip` is invisible in the UI.
This makes "Drive is source of truth" demonstrably false today and breaks
the multi-device story.

`DriveClient` already exposes `startChangeToken` / `getChanges` and
`listFolder`. The Drive Changes feed is the right mechanism — it is
incremental, batched, paginated, and covers creates, updates, removes, and
moves across the whole drive.

## Decision

A separate **inbound pull subsystem** alongside the existing outbound
worker. Both share the reconciler registry's discriminator (`EntityType`)
but they have independent interfaces because the directions have different
needs (outbound serializes one entity per queue row; inbound parses one
file into 0..N entities and persists them).

### Layers

1. **Inbound reconciler interface** — each entity slice registers one. It
   declares which paths it claims, parses a file into entities, and knows
   how to upsert/delete them in Dexie. Lives in `src/sync/pull/types.ts`.
2. **Inbound registry** — parallel to `ReconcilerRegistry`. First-match
   wins on path. Lives in `src/sync/pull/registry.ts`.
3. **Path resolver** — walks a file's parent chain with a memoization
   cache to produce a path relative to the Travel folder (e.g.
   `Trips/argentina/Trip.md`). The placeholder `resolvePath` callback in
   `RealDriveClient` is unreliable; the pull subsystem owns its own
   resolver. Lives in `src/sync/pull/path.ts`.
4. **Pull worker** — `pullAll(deps)`. Reads the KV-persisted change token.
   On first run (no token) calls `backfill`. On subsequent runs walks the
   Drive Changes feed paginated to exhaustion, dispatches each change
   through the registry, and persists the new token. Lives in
   `src/sync/pull/worker.ts`.
5. **Backfill** — `backfill(deps)`. Captures a fresh `startPageToken`
   *before* walking (so writes during the walk are picked up on the next
   tick), recursively lists `Travel/`, dispatches each file, and persists
   the token. Lives in `src/sync/pull/backfill.ts`.

### KV key

`drive_changes_page_token: string`. Absence ⇒ first run ⇒ backfill.
Already typed in `KVValueMap` (S2 anticipated this).

### Conflict policy (inbound vs. pending local write)

**Drive wins on inbound updates, but pending local writes are suppressed.**

Before every inbound upsert or delete, the worker checks the `write_queue`
table for any row with `(entity_type, entity_id)` matching the incoming
change. If one exists, the inbound change is *skipped*. Reasoning:

- The queued local write was based on the user's intent on this device.
- Once the outbound drain runs, that write lands on Drive and bumps the
  revision.
- The next pull tick will see that revision and propagate it back to
  Dexie via the normal inbound path.

This keeps the local edit authoritative until it actually reaches Drive,
without needing a CRDT or a hand-rolled three-way merge.

### Inbound delete

When Drive reports `removed: true` for a file, or when a file's path
leaves the Travel folder (move out), the worker looks up `file_meta` by
`file_id`. If a row exists, the corresponding entity is **deleted** from
Dexie and the `file_meta` row is dropped. Same pending-write suppression
applies.

This is asymmetric with `deleteTrip` (which deliberately does *not* push
deletions to Drive — the user removes the folder in Obsidian instead),
and that's intentional: outbound deletes are too easy to do by accident;
inbound deletes are the user's explicit intent expressed in the vault.

### Triggers

`syncAll(): { push: SyncReport; pull: PullReport }` runs:

1. `pullAll` — pick up anything that landed since last tick.
2. `drainAll` — push out our pending writes.
3. `pullAll` again — propagate the revisions our writes just created back
   into Dexie.

Caller-driven triggers: app startup (after auth + Travel-folder resolved),
`window` focus, `online` event, the existing manual "Sync now" button, and
after every mutation (the current behavior of post-mutation `syncNow`
becomes `syncAll`).

### Ledger files (multi-entity per file)

Out of scope for this ADR's first wiring. The interface supports it —
`parseFile` returns `readonly E[]` — but inbound deletes for ledger
entries (when one row disappears from a multi-row file) need an additional
"what entities did this file contain last time" snapshot. Deferred to the
slice that wires expenses/tasks inbound.

## Alternatives considered

- **Folder-scan polling (no Changes feed).** Re-walk `Travel/` periodically
  and diff. Simple but quadratic in vault size, hits the Drive API hard,
  and can't see deletions of moved-out files cheaply. The Changes feed
  exists for exactly this use case.
- **CRDT/Yjs sync.** Same objection as ADR-0006: massive abstraction for
  a slow-changing single-writer-most-of-the-time markdown vault.
- **Server-mediated sync.** Forbidden by ADR-0001 (no backend).

## Consequences

- Drive becomes the actual source of truth: Obsidian edits, multi-device
  changes, and hand edits in Drive all converge into the app within one
  sync tick.
- The change-feed approach is incremental — pull cost scales with churn,
  not vault size, after the first backfill.
- Adding an entity type to inbound is a small per-slice change (write the
  inbound reconciler, register it).
- The path resolver adds one extra `getMetadata` round-trip per
  unfamiliar ancestor folder per session. Cached for the rest of the
  session, so steady-state cost is one call per change.

## Sharp edges

- **Path resolution.** The change-feed `file.parents` only gives parent
  ids, not paths. The resolver must walk up until it hits
  `travelFolderId`; anything that *doesn't* hit Travel/ is "out of scope"
  and treated as a removal of any prior known file_meta. Be careful with
  cycles (Drive shouldn't produce them, but a defensive depth cap is
  cheap).
- **Pending-write suppression depends on the write_queue table.** If a
  pending write is dead-lettered (e.g. user dismisses), the inbound
  change that was suppressed will be picked up on the next tick because
  the queue row is gone. This is the correct behavior but means inbound
  is one tick behind for the dead-lettered case.
- **Backfill captures the token before walking** to avoid a race where a
  file is created during the walk and we miss it. The trade-off is that
  we may process the same file twice (once during backfill, once via the
  change emitted for its creation). Both paths are idempotent upserts so
  this is safe.
- **Singleton files (`.travel/config.json`).** The active-config
  reconciler is outbound-only for now; inbound wiring for it lives in
  the follow-up slice (S15). Until then, switching the active trip on
  another device won't propagate.
- **First-app-start with many existing trips** triggers a full backfill.
  Each Trip.md is a `getContent` round-trip. Acceptable for the personal-
  scale vault target but worth surfacing in the UI as "Importing…" if
  the count grows.
