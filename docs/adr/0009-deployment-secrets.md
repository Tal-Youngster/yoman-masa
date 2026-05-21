# ADR 0009: Deployment and secrets — Cloudflare Pages, no backend secrets

- **Status:** Accepted
- **Date:** 2026-05-21

## Context

A static PWA needs a host. The Google OAuth client ID is the only "secret" — and it's public by design in implicit flow.

## Decision

- **Host:** Cloudflare Pages, deployed from GitHub on push to `main`.
- **Build:** `npm run build` → static `dist/`.
- **Env vars:** `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY` (for Picker). Both injected by Cloudflare Pages and baked into the bundle at build time. Public by design.
- **Custom domain:** Optional. A `*.pages.dev` URL is fine for personal use.
- **OAuth setup:** See README.

## Alternatives considered

- **GitHub Pages.** Works, but Cloudflare's edge perf and rollback story are nicer.
- **Self-host on a VPS.** Cost and ops for zero benefit.

## Consequences

- Zero recurring cost.
- Rollbacks are one click in Cloudflare Pages.

## Sharp edges

- Cloudflare Pages preview URLs (`<branch>.<project>.pages.dev`) must be added to Authorized JS origins in the OAuth client if you want auth to work in previews.
- Service worker caching can survive across deploys if `registerType: 'autoUpdate'` isn't doing its job — verify after each deploy.
