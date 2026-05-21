# ADR 0007: Identity and auth — Google OAuth is the only identity

- **Status:** Accepted
- **Date:** 2026-05-21

## Context

Single user today; possible small-social pivot later. We already require Google OAuth for Drive (ADR-0003).

## Decision

- No separate auth system. The Google account that authorizes Drive *is* the user.
- No `user_id` field on entities in v1 — the user is implicit.
- For the future social pivot: introduce a backend that consumes the same file format. Identity becomes the `sub` claim from a Google ID token. Multi-user data gains `owner_id`, which retroactively maps to "whoever's Drive this came from".

## Alternatives considered

- **Build a user system now.** Pure cost; nothing to show for it in v1.
- **Skip auth entirely.** Drive isn't optional, so we already have a sign-in flow.

## Consequences

- One auth surface to maintain.
- No password reset, no email verification, no 2FA — Google handles it.

## Sharp edges

- Loss of Google account access = loss of app data. Mitigated by Drive itself being the source of truth; data is recoverable from any device that re-signs-in.
