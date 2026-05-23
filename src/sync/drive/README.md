# `src/sync/drive` — Drive client + sync glue

Implements ADR-0003 (Drive integration) and ADR-0006 (offline sync + conflict
reconciliation). Two flavors of `DriveClient`:

- `FakeDrive` (`fake.ts`) — in-memory, deterministic. Used by tests and dev mode.
- `RealDriveClient` (`client.ts`) — GIS implicit OAuth + Drive v3 REST.

The companion `src/sync/queue` directory contains the write-queue worker, the
reconciler registry, and a `MemoryWriteQueue` placeholder used until S2 (Dexie
storage) lands.

## Auth flow (ADR-0003)

```
+--------------------+        prompt: ''         +--------------------------+
|   DriveAuth        |  ─────────────────────▶   |  Google Identity Services |
| (auth.ts)          |                           |    (initTokenClient)      |
+--------------------+        access_token       +--------------------------+
       │ getAccessToken()
       ▼
+-----------------------+        fetch w/ Bearer        +-------------+
|  RealDriveClient      |  ─────────────────────────▶   |  Drive v3   |
|  (client.ts)          |                                +-------------+
+-----------------------+
       │ pickFolder() (first run)
       ▼
+--------------------+
|  openFolderPicker  |   (picker.ts — loads Picker SDK on demand)
+--------------------+
```

`DriveAuth` keeps the most recent access token in memory and refreshes it
silently via `prompt: ''` on demand. Silent re-auth fails in incognito and
strict tracking-protection settings — when that happens we emit a typed
`AuthEvent` of `{ type: 'reconnect-required', reason }`. Subscribe with
`auth.onEvent(listener)` to drive a "Reconnect Drive" UI. We never throw
synchronously from auth flows during a normal request — the calling Drive
method will throw `ReauthRequiredError` after the GIS callback rejects.

No refresh tokens are stored client-side (ADR-0003).

## WRITE_ALLOWED_PREFIX guard

The `assertUnderPrefix(path, prefix)` function in `guard.ts` is the only thing
standing between a bug and arbitrary writes to the user's Drive. It is invoked:

1. Inside `RealDriveClient.createFile` / `updateFile`.
2. Inside `FakeDrive.createFile` / `updateFile`.
3. Inside the write-queue worker's `processItem` before any reconciler runs.

It rejects:

- Empty / root prefixes (configuration bug).
- Paths containing NUL bytes.
- `..` segments that escape the start of the path.
- Sibling directories that share a string prefix but not a segment boundary
  (`MyVault/TravelClub` vs prefix `MyVault/Travel`).
- Case-mismatched paths (Drive is case-sensitive).
- Unicode-decomposed inputs whose NFC form lies outside the prefix.

See `guard.test.ts` for the full coverage.

## Conflict reconciliation (ADR-0006)

The algorithm lives in `reconcile.ts` and runs per queue item:

1. Re-fetch `headRevisionId` + content.
2. Hand the fresh content + queued item to the reconciler's `applyEdit` — the
   reconciler returns new content with the structured edit re-applied.
3. `files.update` the new content.
4. Re-fetch `headRevisionId`. If it changed beyond what we just wrote, another
   writer raced us — back off (exponential, default 100ms base) and retry. The
   default budget is 3 attempts (`ConflictExhaustedError` after that).

If `applyEdit` throws `EditPointMissingError`, the worker dead-letters the
item — the user will see a "needs attention" toast (ADR-0006).

## Extending reconcilers

Feature slices register their reconciler with the registry:

```ts
import { reconcilers, type Reconciler } from '@/sync/queue';
import type { Trip } from '@/domain';

const tripReconciler: Reconciler<Trip, TripPatch> = {
  entityType: 'trip',
  fromMarkdown(content) {
    /* parse */ return null;
  },
  toMarkdown(entity, original) {
    /* serialize, preserve body */ return '';
  },
  applyEdit(originalContent, item) {
    // surgical patch: update frontmatter, leave body verbatim.
    // throw new EditPointMissingError(item.fileId, 'frontmatter.id') if the entity id is gone.
    return originalContent;
  },
};

reconcilers.register(tripReconciler);
```

The discriminant is `entityType`. Write-queue items carry the same field; the
worker routes by it.

## Manual integration test (real Drive)

CI does not run real OAuth — the access token would expire and tests would be
flaky. The following walks through a hand verification when wiring `S5 — Trips`:

1. Set `VITE_GOOGLE_CLIENT_ID` in `.env.local`. Console project must be in
   Testing mode (ADR-0003) with your account as a tester.
2. Set `VITE_GOOGLE_PICKER_DEVELOPER_KEY` for the folder picker.
3. `npm run dev` and load the app in a non-incognito Chromium-based browser.
4. From a temporary route, instantiate `DriveAuth({ clientId, loginHint })` and
   call `getAccessToken()`. Verify the consent popup appears once, then silent
   re-auth on focus does not.
5. Call `RealDriveClient.startChangeToken()`, then `pickFolder()` (the Picker
   should open). Pick the vault root → confirm a `FolderPick` resolves with
   the folder name and path.
6. Create a test file under the picked folder via `createFile`; confirm a
   write outside the picked folder raises `WriteOutOfScopeError`.
7. Update the file with `updateFile`; confirm `headRevisionId` advances.
8. From a separate Drive client (Obsidian, web), edit the same file. Then
   queue an `update` and run the worker — confirm the worker logs reapply +
   write and the file content ends up correctly merged.

If anything misbehaves, capture the network panel (Drive request + response)
and post it before changing client code.
