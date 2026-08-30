# ADR 0019: Continuous sync engine — Drive as the database, no sync buttons

- **Status:** Accepted
- **Date:** 2026-08-30
- **Supersedes:** ADR-0014 (inbound pull triggers + orchestration; its reconciler contract and backfill sweep policy survive)
- **Amends:** ADR-0006 (adds the queue-level retry/backoff policy ADR-0006 delegated to "the worker")

## Context

The product promise is that the Obsidian vault on Drive behaves like a
database: the app writes to it, the app reads from it, and neither direction
needs a button. What shipped through S3–S12 was two uncoordinated half-loops
plus manual escape hatches, and in practice it wedged permanently.

Four concrete defects, all in the orchestration layer above the (correct,
tested) reconcilers and parsers:

1. **The change token never advanced.** `RealDriveClient.getChanges` requested
   `fields=nextPageToken,changes(...)`. `newStartPageToken` was absent from
   the field mask, so Drive never returned it, so the final-page fallback
   `raw.nextPageToken ?? raw.newStartPageToken ?? pageToken` resolved to the
   *same token that was passed in*. `pullAll` then persisted that identical
   token. Every subsequent pull replayed the entire change window since the
   token was first minted, and that window grows without bound. Each replayed
   change costs a parent-walk `getMetadata` plus a `getContent`, so each pull
   was strictly slower than the one before it and never recorded progress.
   This is the "sync spins forever" symptom.

2. **Outbound latched dead on first error.** The auto-sync effect in
   `SyncStatus` was gated on `!errorMsg`. Any single transient failure set
   `errorMsg`, which disabled the effect until an `online` event or a manual
   click. There was no backoff — there was an off switch.

3. **Head-of-line blocking.** `drainAll` returned on the first `retry` or
   `blocked` outcome, so one poisoned item froze every unrelated write behind
   it indefinitely.

4. **No attempt cap.** `recordQueueFailure` incremented `attempts` and nothing
   read it. A permanently-failing item retried forever.

Underneath all four: sync state lived inside a React component's `useEffect`,
with `syncing` in its own dependency array, racing a second independent
inbound loop in `useDriveInboundSync` with no ordering between them.

## Decision

**One engine owns the whole lifecycle.** `src/sync/engine.ts` is a
non-React, single-threaded, self-scheduling loop. It replaces the outbound
effect in `SyncStatus`, the `useDriveInboundSync` hook, and
`tripsAdmin.syncNow`.

### The loop

A **pass** is always `push()` then `pull()`, in that order, never
concurrently with another pass. Push-before-pull guarantees local edits reach
Drive before we read remote state back, so a pull can never resurrect a row
the user just changed.

Wake triggers, all equivalent — each just requests "a pass, soon":

| Trigger                                    | Rationale                 |
| ------------------------------------------ | ------------------------- |
| App start                                  | Cold-start reconciliation |
| A row is inserted into `write_queue`       | Local edit → push it      |
| `visibilitychange` → visible, and `focus`  | User came back to the tab |
| `online`                                   | Connectivity returned     |
| **Periodic tick, 15s, only while visible** | Remote edits → pull them  |

The periodic tick is the piece that was missing. The app is static by
ADR-0001, so there is no server to receive a Drive push notification: DB-like
liveness necessarily means polling `changes.list`. That call is one request
returning an empty `changes` array when nothing happened. Ticks stop entirely
when the document is hidden, and a `visibilitychange` fires an immediate pass
on return, so a backgrounded tab costs nothing.

The local-write trigger is wired via a Dexie `write_queue` creating-hook
rather than by calling the engine from each admin service. Any code path that
enqueues a write — present or future — wakes the engine without knowing the
engine exists.

### Failure is backoff, never a latch

Pass-level failures schedule the next attempt with exponential backoff
(1s, 2s, 4s … capped at 60s), reset to zero on any successful pass. `offline`
suspends scheduling; `online` resets the backoff to zero and passes
immediately. **No failure state ever disables a trigger.**

### Queue policy (amends ADR-0006)

ADR-0006 specified the read-reread-reapply conflict algorithm and delegated
retry policy to "the worker" without defining it. Defined here:

- Each `write_queue` row carries `next_attempt_at` (epoch ms; `0` = ready).
- The drain selects the oldest **ready** row, so a backing-off item is
  **skipped, not blocked on**. One bad write can no longer stall the other
  seven.
- A transient failure sets `next_attempt_at = now + backoff(attempts)` with
  the same 1s→60s curve.
- `attempts >= 5`, or any terminal error (`EditPointMissingError`,
  `WriteOutOfScopeError`, `ZodError`, unknown `entityType`), marks the row
  `dead = 1`.
- **Dead rows are retained, not deleted.** The previous implementation
  deleted them, silently discarding the user's edit. A retained dead row is
  visible to the status indicator and recoverable.
- `hasPendingWrite` — the inbound suppression predicate — ignores dead rows.
  Otherwise one permanently-failed write would suppress inbound updates for
  that entity forever, which is the same wedge in a different costume.

`blocked` (Travel folder unconfigured / 404) is no longer a distinct stall
state. It is an ordinary transient failure and backs off like any other; the
folder picker is what resolves it, and re-picking wakes the engine.

### Change feed, fixed

- `newStartPageToken` added to the field mask.
- `DriveChangeBatch` splits the two tokens instead of collapsing them into
  one string: `nextPageToken: string | null` means "more pages",
  `newStartPageToken: string | null` means "you are caught up, persist this".
  The old single-field shape made "no progress" indistinguishable from
  progress; the new one makes it a `null` rather than a silent identity.
- The token is persisted **only** when `newStartPageToken` arrives.
- The token is scoped to the folder it was minted against
  (`drive_changes_token_folder`). Re-picking a folder invalidates it.
- A 404/410 on `changes.list` throws `InvalidPageTokenError`, which the pull
  worker catches by dropping the token and falling through to `backfill`.

### Echo suppression

After an outbound write we know the resulting `headRevisionId`. On ingest, if
`file_meta.head_revision_id` already equals the incoming revision, the file is
skipped before `getContent`. This stops the app re-parsing its own writes and
collapses duplicate change events.

### UI

The engine exposes an observable `SyncState`
(`idle | syncing | offline | error`) plus counts. `SyncStatus` becomes a
passive indicator over that state.

- **"Sync now" is deleted.** Every trigger it stood in for is automatic.
- **"Resync from Drive" is deleted.** Its function — recover from local drift
  — is now automatic: an invalid token falls back to `backfill`, and
  `backfill` still runs the ADR-0014 source-of-truth sweep.
- The folder picker stays. It is configuration, not sync.

## Alternatives considered

- **Keep the buttons, fix the bugs.** Cheapest, and would have stopped the
  spinner. Rejected because the buttons exist to paper over the absence of a
  scheduler; with a real scheduler there is nothing for a user to decide, and
  a "Sync now" button on a database is an admission that sync doesn't work.
- **Drive push notifications (`files.watch`).** True push, no polling.
  Requires an HTTPS webhook endpoint to receive channel callbacks, i.e. a
  backend. Forbidden by ADR-0001.
- **Poll at 5s / 30s.** 5s is closer to instant but is 6× the request volume
  of 30s for a difference the user can rarely perceive; 30s makes deliberate
  "edit in Drive, watch the app" feel broken. 15s while visible is the
  compromise, and the visibility gate matters far more than the interval.
- **Persistent Dexie path cache across passes.** Would make the parent walk
  free in steady state. Rejected as premature: once the token advances
  correctly, steady state has zero changes per pass, so the walk almost never
  runs. The per-pass in-memory `PathCache` is retained.
- **Full teardown of `src/sync`.** Rejected. The reconcilers, parsers,
  inbound registry, ADR-0006 revision-race retry and backfill walk are tested
  and are not implicated in any of the four defects. Rewriting them would
  discard working code and re-risk correct logic.

## Consequences

**Positive.** No sync affordance in the UI. A failure can degrade throughput
but can no longer wedge the app. Remote vault edits appear within ~15s
unattended. Dead writes are retained and countable rather than silently
dropped. The token bug class is caught by types.

**Negative.** A visible tab issues ~4 requests/min at idle — negligible
against Google's 12k req/min/user quota, but non-zero battery on mobile.
There is no longer a manual "make it work now" control, so a bug in the
engine has no user-facing workaround short of clearing site data; this raises
the bar on the engine's own tests.

**Follow-up.** Dead-lettered rows are counted in the status indicator but
have no dedicated review surface. If they ever occur in practice, that is the
next slice.

## Sharp edges

- `newStartPageToken` **must** stay in the `fields` mask. Drive returns only
  the fields you ask for; dropping it silently reintroduces defect #1 with no
  error anywhere. `client.test.ts` pins the mask.
- Persisting the page token on a *partial* pass is wrong and now impossible:
  only `newStartPageToken` is persisted, and Drive emits it only at the end
  of the change list. Individual ops remain idempotent, so an interrupted
  pass simply replays.
- The `write_queue` creating-hook fires inside the Dexie transaction. It must
  only schedule (`queueMicrotask` → `wake()`), never await, or it will
  deadlock the transaction that enqueued the write.
- Push runs before pull *within* a pass, but `hasPendingWrite` is still
  required: a write enqueued *during* a pass's pull phase has not been pushed
  yet, and inbound must not clobber it.
- `MAX_PASS_MS` caps a single pass. Without it a vault with a huge change
  backlog would keep one pass running past several scheduled ticks, and the
  coalescing logic would look identical to a hang.
- Backoff state is in-memory, so a reload resets it to zero and retries
  immediately. Intentional: a reload is a user signal that they want it to
  work now. Per-item `next_attempt_at` *is* persisted, so a poison row does
  not get a fresh retry storm on every reload.
