# Travel Journal (יומן מסע)

Personal travel companion. Installable PWA for phone + laptop. Offline-first. Tasks and shopping live in an Obsidian vault on Google Drive; everything else lives there too, as plain markdown.

> Single user today. Built so it could become a small social app later without throwing the data model away.

## Stack

- **Vite + React 19 + TypeScript (strict)** — static PWA, no backend
- **Tailwind 4** for styling
- **TanStack Router** + **TanStack Query** (with Dexie persister) for routing/state
- **Dexie** as the local read cache and write queue
- **Zod** for entity schemas (single source of truth, used for parsing markdown)
- **Zustand** for ephemeral UI state
- **MapLibre GL + Protomaps PMTiles** for offline-capable maps
- **Google Drive API** as the only sync backend; OAuth implicit flow via Google Identity Services
- **Frankfurter** for FX rates (cached)
- **Vitest** + **fast-check** for unit/property tests

See `docs/adr/` for the locked architectural decisions.

## Repo layout

```
src/
  domain/        # Zod schemas + types for every entity (Trip, Accommodation, ...)
  features/      # Vertical slices: missing-nights, expenses, places, ...
  lib/           # Parsers, date utils, FX, etc.
  sync/          # Drive client, write queue, conflict resolution
  ui/            # Shared components, layout, bottom nav
docs/adr/        # Architecture Decision Records
public/          # Static assets (icons, manifest)
```

## Vault layout (on Google Drive)

```
<vault>/Travel/
  General/                              # cross-trip items
    Tasks.md
    Shopping.md
    Articles/<slug>.md
  Trips/
    <trip-slug>/                        # e.g. 2026-southeast-asia
      Trip.md                           # YAML frontmatter: name, start, end, home_currency, status
      Tasks.md                          # Obsidian Tasks plugin syntax
      Shopping.md                       # checkboxes + (key:: value) inline fields
      Articles/<slug>.md
      Accommodations/<yyyy-mm-dd>-<slug>.md
      Places/<slug>.md
      Expenses/<yyyy-mm>.md             # monthly ledger
  .travel/                              # app-internal
    config.json                         # active trip, vault root pointer
    attachments/<sha256>.<ext>
    rates/<yyyy-mm-dd>.json
```

Every app-written file preserves user content below frontmatter / outside structured lines. The parser/serializer is round-trip safe.

## Setup

### Prerequisites

- Node 20.17+ and npm 10+
- A Google Cloud project with OAuth 2.0 credentials (see below)
- An Obsidian vault that already lives in Google Drive

### Google OAuth setup

1. Create a project at <https://console.cloud.google.com/>.
2. APIs & Services → **Enable** the _Google Drive API_ and _Google Picker API_.
3. OAuth consent screen → External → **Testing**. Add your Google account as a test user. Add scopes: `https://www.googleapis.com/auth/drive` and `openid email profile`.
4. Credentials → Create OAuth Client ID → **Web application**.
   - Authorized JS origins: `http://localhost:5173` and your deployed URL (e.g. `https://travel.<you>.dev`).
5. Configure your environment variables in `wrangler.jsonc` under the `vars` and `env.dev.vars` sections:
   ```jsonc
   "vars": {
     "VITE_GOOGLE_CLIENT_ID": "your-client-id",
     "VITE_GOOGLE_API_KEY": "your-api-key"
   }
   ```
### Local dev

```bash
npm install
npm run dev          # http://localhost:5173
npm run test         # vitest in watch mode
npm run test:run     # one-shot
npm run typecheck
npm run lint
```

### Build

```bash
npm run build        # outputs to dist/
npm run preview      # serves the prod build locally
```

## Install on the Pixel

1. Deploy (Cloudflare Pages: `npm run build` → upload `dist/`, or wire it to GitHub).
2. Open the deployed URL in Chrome on the Pixel.
3. Chrome menu → "Install app" → confirm. The app appears on the home screen as a standalone PWA.

## Development conventions

- **Conventional commits.** `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. One feature = one slice = one PR.
- **Thin vertical slices.** Each feature is built end-to-end (domain → storage → UI → tests) before the next.
- **Tests for non-trivial logic.** Date math, markdown round-tripping, conflict reconciliation. Property tests with `fast-check` where helpful.
- **ADRs** for any decision that locks in a tradeoff. Use `docs/adr/0000-template.md`.

## Out of scope (v1)

- Social features (friends, shared trips, feeds)
- Push notifications
- Document storage (passport / insurance scans)

The data model and auth choices were made so these don't require a rewrite later.
