# ADR 0018: Remove the expenses feature

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

Expenses (S7) shipped as the app's heaviest slice: a monthly ledger format with
line-level Dataview patching, a Dexie compound index for the month range query,
category summaries and a pie chart, plus the whole FX stack behind ADR-0008 —
Frankfurter + a fallback provider, a rates snapshot cached to
`<vault>/Travel/.travel/rates/<yyyy-mm-dd>.json`, its own reconciler and
entity type, and snapshot conversions stored on every expense.

That machinery is the most expensive thing in the repo to keep correct — it has
the most moving parts, the most external dependencies, and the most edge cases
(historical rates, stale-rate labelling, currencies Frankfurter doesn't cover) —
and the user does not want the feature. Keeping it dormant is not free either:
every schema change, every sync refactor and every dependency bump has to carry
it.

## Decision

Remove the expenses feature outright.

- Delete `src/features/expenses/`, `src/domain/expense.ts`, the `/expenses`
  route and nav tab, and the `expensesAdmin` service.
- Delete the FX modules in `src/lib/currency/`: `frankfurter`, `fallback`,
  `convert`, `cache`, `paths`, `types`, `reconciler`. The **currency list**
  (`list.ts`) stays — `CurrencyPicker` and `Trip.home_currency` use it — as does
  `src/domain/money.ts`, which shopping and accommodations depend on.
- Drop the `expenses` Dexie store in schema **v5**. The same upgrade purges
  queued `expense` writes, their `file_meta` rows and the `rates_snapshot` KV
  entry, so nothing is left to dead-letter once the reconciler is unregistered.
- Remove `'expense'` and `'rates_snapshot'` from `EntityType` / `KVKey`.
- **Vault files are not touched.** Existing `Trips/<slug>/Expenses/<yyyy-mm>.md`
  ledgers and `.travel/rates/*.json` stay on Drive; the app simply stops reading
  and writing them. Deleting them is the user's call, in Obsidian.

This **supersedes ADR-0008** (multi-currency). Multi-currency as a *display*
concern survives only as `Trip.home_currency` and per-item `Money` values —
there is no conversion anywhere in the app any more.

## Alternatives considered

- **Keep it dormant** (feature deleted, domain + table + FX code retained "in
  case") — leaves the maintenance tax in place without any of the value; the
  code is recoverable from git history if expenses ever comes back.
- **Keep the FX stack for future features** — nothing else has asked for
  conversion, and a speculative dependency on two rate providers is exactly the
  kind of abstraction CLAUDE.md tells us not to keep.
- **Delete the vault ledger files too** — destructive, irreversible from the
  app's side, and against the non-destructive-vault-edits constraint.

## Consequences

- Dexie schema v5. First open after this ships runs the store drop; the app
  must not be rolled back past v5 with the old build (Dexie would try to
  re-create the table, which is harmless, but the purged rows are gone).
- ADR-0008 is historical. ADR-0004's "Expenses ledger (monthly file)" section
  documents a format the app no longer reads — kept because vaults still
  contain those files.
- The bottom/side nav drops from seven per-trip tabs to six. No `navStore`
  migration is needed: `reconcileOrder()` already discards persisted paths that
  are no longer in `TABS`.
- `S7 — Expenses` in `IMPLEMENTATION-PLAN.md` is marked removed rather than
  deleted, so the history of what shipped stays readable.

## Sharp edges

- Dexie versions are append-only: v1 and v2 keep their `expenses` store lines
  forever, and the migration test replays them to build legacy databases. Do not
  "tidy" them to match the current schema.
- `Money` / `Currency` in `src/domain/money.ts` are **not** part of this removal.
  Shopping's `estimated_cost` and accommodation `cost` still use them.
