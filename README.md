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
- **Google Maps** (`@vis.gl/react-google-maps`) + **Places API (New)** for map surfaces (ADR-0013)
- **Google Drive API** as the only sync backend; OAuth implicit flow via Google Identity Services
- **Frankfurter** for FX rates (cached)
- **Vitest** + **fast-check** for unit/property tests

See `docs/adr/` for the locked architectural decisions.

## Repo layout

```
src/
  domain/        # Zod schemas + types for every entity (Trip, Accommodation, ...)
  features/      # Vertical slices: missing-nights, articles, places, ...
  lib/           # Parsers, date utils, currency list, etc.
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
  .travel/                              # app-internal
    config.json                         # active trip, vault root pointer
    attachments/<sha256>.<ext>
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
   - Authorized JS origins: `http://localhost:5173` and your deployed URL (e.g. `https://yoman-masa.<you>.workers.dev`). Add Cloudflare preview URLs too if you use them.

### Environment variables

All config is `VITE_*` and **baked into the JS bundle at `vite build` time** — there is no runtime/backend config. Copy `.env.example` to `.env.local` and fill it in for local dev:

```bash
cp .env.example .env.local
```

| Var | Required | Notes |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | yes | OAuth client ID. Public by design (implicit flow). |
| `VITE_GOOGLE_API_KEY` | yes | Drive Picker API key. Public by design. |
| `VITE_GOOGLE_MAP_ID` | no | Cloud-configured Map ID for Advanced Markers. Falls back to Google's `DEMO_MAP_ID`. |
| `VITE_GEMINI_API_KEY` | for AI | **Billable** and ends up in the client bundle — restrict it in Google Cloud or omit to disable AI. |

If `VITE_GOOGLE_CLIENT_ID` / `VITE_GOOGLE_API_KEY` are absent, the app falls back to an in-memory fake Drive (no real sync).

> `.env.local` is git-ignored. Do **not** put these in `wrangler.jsonc` `vars` — those are Worker *runtime* bindings and never reach `import.meta.env` in a static SPA.

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
npm run build        # tsc -b && vite build → dist/
npm run preview      # build, then serve dist/ via `wrangler dev`
```

`npm run build` reads `.env.local` (or the shell env). Without the Google vars set it still builds, but the bundle ships the fake Drive.

## Deploying

Host: **Cloudflare Workers** (Static Assets), configured in `wrangler.jsonc` (`assets.directory: dist`, no Worker script — it just serves the build). The `*.workers.dev` URL is fine for personal use.

### Continuous deploy (recommended)

`.github/workflows/ci.yml` runs typecheck + lint + test + build on every PR, and on push to `main` it additionally **builds and deploys** to Cloudflare via `cloudflare/wrangler-action`. Because `VITE_*` are baked in at build time, the real values live in **GitHub repo secrets** (Settings → Secrets and variables → **Actions → Secrets**). The workflow reads `secrets.*` only — a value stored on the *Variables* tab resolves to empty:

| Secret | What |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Token with the *Edit Cloudflare Workers* permission. |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID. |
| `VITE_GOOGLE_CLIENT_ID` | OAuth client ID. |
| `VITE_GOOGLE_API_KEY` | Drive Picker key. |
| `VITE_GOOGLE_MAP_ID` | Maps Map ID (optional). |
| `VITE_GEMINI_API_KEY` | AI features (optional). |

Create the API token at <https://dash.cloudflare.com/profile/api-tokens> using the **Edit Cloudflare Workers** template. Push to `main` → the app deploys.

**After rotating a key**, changing the secret does nothing on its own — the deployed bundle still holds the old value, since `VITE_*` are baked in at build time. Trigger a rebuild: Actions → CI → **Run workflow** on `main` (or re-run the last `main` run).

### Manual deploy

With `.env.local` populated and `wrangler` authenticated (`npx wrangler login`):

```bash
npm run deploy       # npm run build && wrangler deploy
```

## Regenerating PWA icons

Icons live in `public/icons/` (+ `public/apple-touch-icon-180x180.png`, `public/favicon.ico`) and are committed, generated once from `public/logo.svg`. They are **not** built on every `vite build` — the generator depends on the native `sharp` module, which fails to load from a non-ASCII path on Windows (this repo's folder name is Hebrew). To regenerate after editing `logo.svg`, run the generator from a temporary ASCII-only path:

```bash
mkdir /c/tmp-icons && cp public/logo.svg /c/tmp-icons/ && cd /c/tmp-icons
npm init -y && npm i -D @vite-pwa/assets-generator
npx pwa-assets-generator --preset minimal-2023 logo.svg
# copy pwa-192x192.png, pwa-512x512.png, maskable-icon-512x512.png → public/icons/
# copy apple-touch-icon-180x180.png, favicon.ico → public/
```

(On Linux/macOS the temp-dir dance is unnecessary — `sharp` loads fine.)

## Install on the Pixel

1. Deploy (see above) and open the deployed `https://…workers.dev` URL in Chrome on the Pixel.
2. Either tap **Install** on the in-app banner, or use the Chrome menu → **Install app**.
3. The app appears on the home screen and launches standalone. After the first load it works offline; the service worker (`registerType: 'autoUpdate'`) silently picks up new deploys on next launch.

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
