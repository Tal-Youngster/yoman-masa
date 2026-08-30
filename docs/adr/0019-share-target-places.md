# ADR 0019: Adding places by sharing into the app (Web Share Target)

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

Places is fully Google-native (ADR-0013): `Place.place_id` **is** a Google Place ID, and
the create flow already resolves a pasted Google Maps URL through
`parseGoogleMapsUrl()` → Places Text Search → Place Details.

The capture flow is the weak part. Finding somewhere in the Google Maps app and getting it
into the journal means: share → copy link → switch apps → paste. Worse, what Google Maps
actually puts on the clipboard is a **`maps.app.goo.gl` short link**, and expanding it
requires reading a cross-origin redirect, which is CORS-blocked and would need a backend
(forbidden by ADR-0001). So the fastest path from Google Maps produces exactly the one
input the form has to reject — `parseGoogleMapsUrl` returns `{ shortened: true }` and the
UI tells the user to go open the link and copy the address bar instead.

The target platform is a Pixel plus Chrome on desktop (ADR-0002; iOS is explicitly not a
v1 target), which is where the Web Share Target API is supported.

## Decision

Register the installed PWA as a **Web Share Target** so "Share" in Google Maps offers
Travel Journal directly.

- **Manifest** (`vite.config.ts`, `VitePWA.manifest`):

  ```jsonc
  "share_target": {
    "action": "/places/share",
    "method": "GET",
    "params": { "title": "title", "text": "text", "url": "url" }
  }
  ```

- **`method: "GET"`, not POST.** A GET share target is a plain navigation to
  `/places/share?title=…&text=…&url=…`, which the existing router handles like any other
  route and which Workbox's `navigateFallback: '/index.html'` already serves. POST exists
  for sharing *files*, and costs a service-worker `fetch` interceptor plus a switch from
  `generateSW` to `injectManifest`. We share text, so GET.

- **Do not trust the `url` param.** Android senders are inconsistent about `text` vs
  `url`, and Google Maps commonly puts the whole payload in `text`:

  ```
  Kadikoy Fish Market
  Caferağa, Kadıköy/İstanbul, Türkiye
  https://maps.app.goo.gl/xY7…
  ```

  A pure `parseSharePayload({ title, text, url })` scans all three fields for a URL and
  treats the remaining lines as name/address hints.

- **Resolution order**, reusing the existing pipeline:
  1. `parseGoogleMapsUrl(url)` → if it yields a `placeId` (`?api=1` links), use it.
  2. Otherwise Places Text Search on the name/address text, with `locationBias` when the
     payload carried coordinates.
  3. Otherwise fall through to the manual form, prefilled with whatever was extracted.

  Step 2 is what makes short links workable **in the share flow specifically**: the share
  payload carries the name and address as plain text next to the unexpandable link, which
  is enough to resolve a canonical place. A bare pasted short link stays unresolvable.
  We are not adding a proxy to expand short links.

- **The share lands on a confirm screen, never a silent create.** `Place.trip_id` is
  required (Places has no cross-trip "General" scope, unlike Task/ShoppingItem/Article),
  so a trip must be chosen; and a Text Search match needs to be visible before it is
  persisted.

- **The resolution logic moves out of `Form.tsx`** into a shared, testable module so the
  form and the share route cannot drift apart.

## Alternatives considered

- **POST share target with a service-worker interceptor.** Required only for file shares;
  forces `injectManifest` and hand-written Workbox routing. Rejected as unearned plumbing.
- **Custom URL scheme / Android intent filter.** Needs a native wrapper; ADR-0002 deferred
  Capacitor and pure-PWA install is sufficient.
- **A user-configured Shortcut that opens `/places/new?url=…`.** Works, including on iOS,
  but is per-device manual setup with no discoverability. Noted as the iOS escape hatch if
  iOS ever becomes a target; not built.
- **A backend endpoint to expand `maps.app.goo.gl`.** Would resolve short links properly
  and fix pasted links too. Rejected — ADR-0001, no backend.
- **Silent create on share.** Fastest, but there is no trip to attribute to and no chance
  to catch a wrong Text Search match.
- **Google Takeout list import.** Solves a different problem (backfilling lists already
  saved) and is a one-shot manual export. Deferred to its own slice; the share target is
  the ongoing capture flow.

## Consequences

- Positive: two taps from Google Maps to a saved place, and the short-link dead end stops
  mattering for the common case.
- **Android + installed only.** iOS Safari does not implement `share_target`; desktop
  Chrome on Windows participates via the OS share sheet, which is of marginal value. This
  is consistent with ADR-0002's platform target.
- The manifest change only reaches an already-installed PWA after the browser re-fetches
  the manifest; a reinstall is the reliable way to see the entry appear.
- `/places/share` is a route outside the tab set and is a **cold-start entry point** — it
  can arrive logged out, with no Drive folder picked, or with no active trip. Each of those
  is a state the screen must render, not a crash.
- Additional billed Places Text Search calls, one per share that lacks a `placeId`.

## Sharp edges

- `share_target.action` must be inside the manifest `scope` (`/`). It is.
- The share payload's `text` may contain the URL *and* the name; splitting on whitespace
  and taking "the last token" is wrong for multi-line payloads. Parse lines, not tokens.
- A shared **dropped pin** carries a short link with no name — genuinely unresolvable.
  Fall through to the manual form rather than showing an error.
- Duplicate shares are expected. `Form.tsx`'s existing "already in your list" check keys on
  `place_id`; the share route must offer to open the existing place, not report a failure.
- Text Search must keep the existing `maxResultCount: 1` + `X-Goog-FieldMask` discipline —
  an unmasked request bills at a higher SKU.
