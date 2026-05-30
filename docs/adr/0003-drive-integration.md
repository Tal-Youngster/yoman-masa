# ADR 0003: Google Drive integration — full `drive` scope, GIS implicit flow

- **Status:** Accepted
- **Date:** 2026-05-21

## Context

The app must read and write existing files in the user's Obsidian vault (Tasks.md, Shopping.md, etc.) and also create new files under `<vault>/Travel/`. The `drive.file` scope only grants access to files the app created or files explicitly opened via the Google Picker — too restrictive for the everyday flow. The app is single-user with the developer as the only test user.

## Decision

- **OAuth scope:** `https://www.googleapis.com/auth/drive` plus `openid email profile`.
- **Consent screen:** External, **Testing** mode, developer added as a test user. No verification needed at this stage.
- **Auth flow:** Google Identity Services `initTokenClient` (implicit token client). Access tokens live ~1h. Silent re-auth on focus or 401 via `prompt: ''`. No refresh tokens stored client-side.
- **Folder discovery:** First-run, Google Picker pops to select the vault root and the `Travel/` subfolder. Both `fileId`s persisted in IndexedDB.
- **Incremental sync:** `changes.list` with a `startPageToken`, persisted per device.
- **Safety guard:** A `WRITE_ALLOWED_PREFIX` enforced at the Drive client layer. Any write whose target path doesn't resolve under the configured Travel folder is rejected at runtime.

## Alternatives considered

- **`drive.file` + Picker for everything.** Existing vault files invisible until each is Picked. Unworkable for many files.
- **`drive.readonly` + `drive.file`.** Can't write the existing `Tasks.md`. Rejected.
- **Backend proxy for token refresh.** Adds infra we explicitly don't want.

## Consequences

- Single-user, no shipping wide without OAuth verification.
- Sign-out of Google in the browser → app blocks until re-auth popup. Acceptable for a personal app; surface a clear "Reconnect Drive" UI.
- Drive client API surface is small and ours to design — see `src/sync/drive/`.

## Sharp edges

- Drive `update` doesn't honor `If-Match` on file _content_ — conflict detection is "re-GET headRevisionId after write, retry if it changed mid-flight". Bounded retry budget (3); after that, surface to user.
- Incognito mode and tracking-protection settings can break silent re-auth.
- The safety guard is the only thing standing between a bug and arbitrary writes to the user's Drive. Cover it with tests.

## Amendments

### 2026-05-28 — Access-token persistence + cached login hint

The "no refresh tokens client-side" rule stands. Two narrow additions:

- The **access token** (the same short-lived ~1h token GIS already returns) is persisted to `localStorage` so a page refresh doesn't have to round-trip GIS at all. After expiry, the silent flow runs normally. This is not a refresh token; it cannot mint new tokens.
- The user's **email** is fetched once via `oauth2/v3/userinfo` after the first successful token, persisted, and supplied as `loginHint` on subsequent silent requests. This makes GIS's silent flow resolve without showing the account chooser when multiple Google accounts are signed in.

Trade-off: a live access token sits in `localStorage`. Any XSS on the app origin can read it. Mitigations stay the same as for the rest of the app: no untrusted third-party JS, strict dependency review.
