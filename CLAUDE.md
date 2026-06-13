# Travel Journal — Agent Context

Personal travel companion PWA. Static, offline-first, integrated with the user's Obsidian vault via the Google Drive API.

> Before doing anything architectural, read the ADRs in `docs/adr/` — they are **locked decisions**, not suggestions.
> Before starting work, read `IMPLEMENTATION-PLAN.md`, find your slice, and follow its kickoff prompt.

## How agents work on this project

- **One vertical slice at a time.** Slices are defined in `IMPLEMENTATION-PLAN.md` with explicit goal, scope, deliverables, acceptance criteria.
- **Proposal-first.** If you want to deviate from a slice's spec or change an ADR, propose it to the user _before_ writing code. Don't silently expand scope.
- **Conventional commits.** `feat(<area>):`, `fix(<area>):`, `chore:`, `docs:`, `refactor:`, `test:`. Small, atomic commits that narrate progress. Co-author trailer with Claude.
- **One branch per slice.** Name: `slice/S<N>-<short-name>`. PR title mirrors the slice title.
- **ADRs are mandatory** for any new locked decision. Use `docs/adr/0000-template.md` and increment from the highest existing ADR.
- **Tests for non-trivial logic.** Date math, parsers, conflict reconciliation, currency conversions, anything with edge cases. Use `vitest` for unit tests, `fast-check` for property tests.
- **No comments that just describe what the code does.** Comment only non-obvious _why_ — hidden constraints, subtle invariants, workarounds.

## Quality gates (must pass before completing a slice)

```bash
npm run typecheck    # tsc -b --noEmit
npm run test:run     # vitest run
npm run lint         # eslint .
```

If you can't make all three pass, stop and ask. Do not merge a slice with red gates.

## Stack snapshot

| Concern  | Choice                                                                  |
| -------- | ----------------------------------------------------------------------- |
| Build    | Vite 6                                                                  |
| UI       | React 19, Tailwind 4, TanStack Router/Query                             |
| Lang     | TypeScript 5.7 strict, `exactOptionalPropertyTypes`                     |
| State    | Zustand (UI), TanStack Query (server), Dexie (cache)                    |
| Schemas  | Zod — single source of truth for entities                               |
| Sync     | Google Drive API (full `drive` scope, GIS implicit)                     |
| Maps     | MapLibre GL + Protomaps PMTiles                                         |
| FX       | Frankfurter (`api.frankfurter.dev`)                                     |
| Tests    | Vitest + fast-check (+ jsdom@25, React Testing Library, fake-indexeddb) |
| Markdown | `yaml` (eemeli/yaml) for frontmatter parse/serialize                    |
| Host     | Cloudflare Pages (static)                                               |

## Repo layout

```
src/
  domain/        # Zod schemas + types (canonical model — keep small, pure, framework-free)
  features/      # Vertical slices, one directory per feature
  lib/
    markdown/    # Frontmatter parse/serialize + body preservation
    storage/     # Dexie schema + queries (read cache, write queue table)
    currency/    # FX rates + conversions
    util/        # Shared helpers
  sync/
    drive/       # Google Drive client + GIS auth + WRITE_ALLOWED_PREFIX guard
    queue/       # Write-queue worker + conflict reconciliation
  ui/
    components/  # Reusable primitives (Button, Input, Card, etc.)
    layout/      # Shell, top bar, bottom nav, trip switcher
  app/           # Router, providers, app entry
docs/adr/        # Architecture Decision Records (0001-0010 are locked)
```

## Hard constraints (from the product brief)

- Mobile-first; must feel app-like (installable, standalone PWA).
- Offline reads are mandatory; offline edits with eventual sync are strongly desired.
- Tasks, shopping, and articles live in the user's Obsidian vault on Google Drive.
- **Vault edits must be non-destructive** — preserve unrelated content, formatting, comments, ordering. Surgical line-level edits, not whole-file rewrites.
- **No filesystem access to the vault on mobile** — talk to the Drive API directly.
- **Multi-trip from day one.** Every non-Trip entity carries `trip_id`. Some entities (`Task`, `ShoppingItem`, `Article`) accept `null` for cross-trip "General" items.

## Don'ts

- Don't add a backend. The app is static. Drive is the only sync target.
- Don't store refresh tokens client-side. Use GIS implicit token client + silent re-auth on focus.
- Don't write to Drive outside `<vault>/Travel/`. The `WRITE_ALLOWED_PREFIX` guard in `src/sync/drive/` is mandatory and tested.
- Don't blind-overwrite a Drive file. Re-fetch `headRevisionId` before write; if it changed, re-apply the structured edit and retry (budget 3, exponential backoff). See ADR-0006.
- Don't reinvent decisions in `docs/adr/`. Propose changing the ADR first.
- Don't use Node-only APIs in `src/domain/` or `src/lib/`. These modules must run in **both** Node (tests) and the browser.
- Don't add unnecessary abstractions or speculative features. Build for what's in the slice spec.
- Don't introduce libraries without checking the stack table above. If you need something new, propose it.

## Out of scope for v1

- Social features (friends, shared trips, feeds)
- Push notifications
- Document storage (passport / insurance scans)

The data model and auth choices were made so these don't require a rewrite later — but **do not build them**.

## Where to find decisions

| Question                                | Answer   |
| --------------------------------------- | -------- |
| Why no backend?                         | ADR-0001 |
| Why Vite + React 19 + Tailwind 4?       | ADR-0002 |
| Why full Drive scope?                   | ADR-0003 |
| Markdown conventions (Tasks, Dataview)? | ADR-0004 |
| Why MapLibre + PMTiles?                 | ADR-0005 — **superseded by ADR-0013** |
| Conflict resolution algorithm?          | ADR-0006 |
| Identity?                               | ADR-0007 |
| FX rate source + snapshot conversions?  | ADR-0008 |
| Hosting + secrets?                      | ADR-0009 |
| Multi-trip layout + invariants?         | ADR-0010 |
| Task recurrence model?                  | ADR-0011 |
| Task manual order?                      | ADR-0012 |
| Why Google Maps (replaces ADR-0005)?    | ADR-0013 |
| Inbound Drive → Dexie sync?             | ADR-0014 |
| Path map rendering on Google Maps?      | ADR-0015 |
| Gmail read integration (accommodations)?| ADR-0016 |

## When to ask the user

Always, when:

- A slice's scope is unclear or self-contradictory.
- You discover that a locked decision (ADR) makes the slice impossible as specified.
- You'd need to change a public API used by another slice.
- You'd need a new dependency, environment variable, OAuth scope, or external service.
- You hit a sharp edge from an ADR that isn't covered by the slice spec.

Never, for:

- Mechanical decisions inside your slice's scope.
- Naming, file layout within your slice's owned directory.
- Whether to add tests (you do).
