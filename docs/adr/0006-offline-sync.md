# ADR 0006: Offline-first sync and conflict resolution

- **Status:** Accepted
- **Date:** 2026-05-21

## Context

The app must work fully offline for reads and must accept edits offline that converge with Drive when connectivity returns. Drive is shared with Obsidian — files can change out from under the app at any moment.

## Decision

### Layers

1. **App shell** — precached by Workbox; updated on each deploy (`registerSW({ immediate: true })`).
2. **Read cache** — Dexie tables, one per entity type. UI reads from Dexie exclusively, via TanStack Query (Dexie persister).
3. **Write queue** — Dexie table of pending mutations: `{ id, entityType, entityId, op, payload, baseRevision, attempts, lastError, createdAt }`.
4. **Sync worker** — async loop that drains the write queue. Trigger points: app start, `online` event, focus, `Background Sync` API where available, manual "Sync now" action.

### Conflict resolution

- Every read from Drive captures `headRevisionId` + `modifiedTime` per file and stores them in Dexie alongside the entity.
- On write:
  1. Re-fetch the file's `headRevisionId`.
  2. If unchanged: serialize new content, `files.update`.
  3. If changed: download, locate the structured edit point by stable ID (entity `id` in frontmatter, line block-ref for ledger/list items), reapply the edit on top of fresh content, then write.
  4. After write, re-fetch `headRevisionId`. If a third writer landed in between, repeat (budget: 3 attempts, exponential backoff).
- If the edit point disappeared (e.g. user deleted the task in Obsidian): surface a conflict toast with options: "keep my change" / "accept vault" / "merge manually".

### Round-trip invariant

Every parser/serializer pair satisfies `serialize(parse(x)) === x` byte-for-byte for any file the app might encounter, including:

- Frontmatter with unknown keys (preserved).
- Mid-body Obsidian comments (`%% ... %%`).
- Trailing whitespace, tabs, CRLF — normalized to LF on read but preserved if the file already used CRLF (TBD; test corpus will decide).
- Unknown Tasks emojis or Dataview fields (preserved).

### Idempotency

Each queued mutation has a client-generated ULID. Replays are safe — the sync worker may run multiple times; each mutation either lands or fails terminally and is dead-lettered to a "needs attention" table.

## Alternatives considered

- **CRDTs (Yjs / Automerge).** Overkill for slow-changing markdown; the user is the only writer 99% of the time. Adds a layer of abstraction over the markdown that we'd then have to flatten back to disk.
- **Last-writer-wins.** Quietly drops user edits made in Obsidian. Unacceptable.

## Consequences

- Domain logic (parsers, write planning) is independent of Drive. Easy to unit-test.
- All UI is offline-capable by construction (it reads Dexie).
- Write latency = local (instant). Sync latency = network. The two are decoupled.

## Sharp edges

- Replays of in-flight writes when the page reloads mid-sync: writes must be safe to retry. Achieved by always re-reading and re-applying structured edits.
- Dexie quota on iOS Safari is small; not a target now but worth noting.
- A user editing the same file in Obsidian *on the phone* while the app has stale revision is the worst case. Mitigated, not eliminated.
