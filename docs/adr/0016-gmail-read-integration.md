# ADR 0016: Gmail read integration — `gmail.readonly` scope, body → Gemini extraction

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

Booking confirmations land in the user's Gmail. The accommodation "+" flow
already has an AI extraction pipeline (`src/lib/ai/`, `GeminiClient`) that
turns a Booking/Airbnb URL or an uploaded screenshot into a prefilled
accommodation form. The user wants a third input source: pick a confirmation
email straight from the inbox and let the same pipeline fill the form.

The app is static with no backend (ADR-0001) and already authenticates to
Google via GIS implicit tokens for Drive (ADR-0003). Reading Gmail from the
browser is the same shape of problem Drive already solved: one OAuth scope,
REST calls with the bearer token, an in-memory fake for tests.

## Decision

- **OAuth scope:** add `https://www.googleapis.com/auth/gmail.readonly` to the
  existing GIS token request. The single short-lived (~1h) access token then
  authorizes both Drive and Gmail REST calls. No second token client, no
  refresh token (ADR-0003's rule stands).
- **Scope is composed in `main.tsx`, not in `DriveAuth`.** `DriveAuth` already
  accepts a `scope` override; the app passes the combined Drive + Gmail scope
  there. The `drive/` module's `DEFAULT_SCOPE` stays Drive-only so the Gmail
  concern doesn't leak into the Drive client.
- **Gmail client lives at `src/lib/gmail/`**, parallel to the Drive client: a
  `GmailClient` interface (`listRecentInbox`, `getMessageText`), a real REST
  implementation that takes the same `getAccessToken` getter the Drive client
  uses, and an in-memory `FakeGmail` for tests. It is **read-only** — the
  interface has no write/send surface, matching the scope.
- **Email selection UX:** a recent-inbox list (newest ~25 `INBOX` messages,
  sender / subject / date). Tap a row → fetch its body → feed to the existing
  extractor. No in-app search in v1.
- **What's sent to the model:** the email's decoded `text/plain` body (falling
  back to stripped `text/html`). `AiClient.extractData` gains an optional
  `text` input alongside the existing `url` / `imageBase64`. Attachments
  (PDF/image confirmations) are **out of scope for v1** — body text only.

## Alternatives considered

- **`gmail.metadata` (headers only, no body).** Enough to render the picker
  but not the confirmation details, so AI extraction would have nothing useful
  to read. Rejected — defeats the feature.
- **Forward-to-an-address / paste raw email.** No new scope, but it's manual
  friction and the user explicitly asked to select from the inbox.
- **A backend that reads Gmail with a service account.** Forbidden by ADR-0001
  and would require domain-wide delegation. Rejected.
- **Parsing PDF/image attachments in v1.** Most confirmations carry the key
  facts in the body; attachments add multipart download + the existing image
  branch. Deferred, not precluded — the image branch already exists.

## Consequences

- The consent screen now requests a Google **restricted** scope. In the
  current External / **Testing** mode with the developer as the sole test
  user this works without verification, the same posture ADR-0003 accepts for
  the full `drive` scope. Shipping publicly would require a CASA security
  assessment for `gmail.readonly` — a known, deferred cost, consistent with
  ADR-0003's "single-user, no wide launch without verification" stance.
- After this change, the next sign-in re-prompts consent to grant the new
  scope. A token minted before the change (Drive-only) will 403 on Gmail
  calls until the user re-auths; the picker surfaces this as a clear
  "reconnect" message rather than a raw error.
- Email content leaves the device for the Gemini API (Google → Google, but
  still a third call). This is the same trust boundary the URL/screenshot
  extraction already crosses; no new data-handling promise is broken, but it
  is now email content rather than a public listing page.

## Sharp edges

- **Scope upgrade is silent-unfriendly.** `prompt: ''` silent re-auth won't
  surface consent for a newly added scope. The first Gmail call after the
  upgrade may 403; recovery is an interactive reconnect (reusing the existing
  "Reconnect Drive" flow, since the token is shared). The Gmail client throws
  a typed auth error on 401/403 so the UI can route to reconnect.
- **MIME decoding.** Gmail returns body parts base64url-encoded and bodies are
  often nested `multipart/alternative` / `multipart/mixed`. The client walks
  the part tree, prefers `text/plain`, falls back to `text/html` (tags
  stripped). Unit-tested against representative payloads.
- **Quotas.** Gmail API is generous for single-user, but the picker does one
  `messages.list` + one `messages.get` per opened email (lazy — bodies are
  only fetched on tap, not for the whole list). No background polling.
- **Read-only by construction.** The scope and the client interface are both
  read-only; there is no code path that could mutate the mailbox even if a bug
  tried to.
