# ADR 0002: Frontend stack — Vite + React 19 + TS, static PWA

- **Status:** Accepted
- **Date:** 2026-05-21

## Context

Phone + laptop. Mobile-first. Installable / standalone. No backend (per ADR-0001), so SSR is unwanted overhead.

## Decision

| Concern        | Choice                                       |
| -------------- | -------------------------------------------- |
| Build / dev    | Vite 6                                       |
| Framework      | React 19                                     |
| Language       | TypeScript 5.7, `strict`                     |
| Styling        | Tailwind 4 (CSS-based config, Vite plugin)   |
| Routing        | TanStack Router (code-based to start)        |
| Server state   | TanStack Query + Dexie persister             |
| Client state   | Zustand                                      |
| Forms          | React Hook Form + Zod resolvers              |
| PWA            | `vite-plugin-pwa` (Workbox)                  |
| Maps           | MapLibre GL + Protomaps PMTiles (ADR-0005)   |
| Tests          | Vitest, fast-check (property tests)          |

## Alternatives considered

- **Next.js.** Adds an SSR runtime that buys nothing here; deployment becomes serverful.
- **SvelteKit.** Smaller bundles, but fewer libs in our ecosystem; not worth the swap.
- **Capacitor wrapper.** Defer. Pure PWA install is sufficient on Pixel + Chrome desktop. If iOS becomes a target, revisit.

## Consequences

- Single-file deploy target (static `dist/`). Host on Cloudflare Pages.
- All app logic runs in the browser. Drive API is called directly from JS.
- TypeScript `strict` + `exactOptionalPropertyTypes` raises the floor on correctness; parser code especially benefits.

## Sharp edges

- Tailwind 4 uses CSS-native config (`@import "tailwindcss"; @theme { ... }`). Plugins that read `tailwind.config.js` may not apply.
- React 19's `use()` and form actions are nice-to-haves; don't rely on them in domain code that must run in Node tests.
