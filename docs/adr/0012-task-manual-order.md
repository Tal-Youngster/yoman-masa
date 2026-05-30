# ADR 0012: Manual task ordering

- **Status:** Proposed
- **Date:** 2026-05-25
- **Amends:** ADR-0004 (markdown conventions), ADR-0006 (offline sync)

## Context

Todoist lets you drag tasks into an arbitrary order within a list. Today our tasks
have no explicit order: the list view derives sections (Overdue/Today/Upcoming/…) and
sorts within them, and the vault file's line order is whatever the parser read. To
support manual reordering we need a stable, user-controlled order that survives a
round-trip to the vault and reconciles cleanly when Obsidian and the app both edit.

The hard question is *where the order lives*. ADR-0004 patches one line at a time keyed
by its block ref and never rewrites the whole file; ADR-0006 reconciles per-line. A
naive "drag = rewrite the file in the new order" breaks both invariants.

## Decision

**Order is the line order within each `Tasks.md` file.** Reordering moves the task's
line; no new field is added to the task line itself. Specifically:

1. The parser already reads tasks in file order; preserve that order through to the UI
   instead of re-deriving it, and expose it as the default "Manual" sort.
2. A reorder enqueues a **`move` op** (new op type in the write queue) carrying the
   block ref and its target neighbours, not a whole-file write. The sync worker
   relocates exactly that line, leaving every other line — including hand-authored
   notes and headings between tasks — untouched.
3. Reconciliation: if the file changed underneath, re-locate the line by block ref and
   re-apply the move relative to its neighbours; if a neighbour vanished, fall back to
   appending at the section boundary rather than failing the op.
4. Sectioned views (Today/Upcoming) keep sorting by date; manual order applies within a
   section and as the order of the flat/"All" view.

## Alternatives considered

- **An `order:` integer via a Dataview inline field on each line** — explicit and
  sort-stable, but every reorder rewrites the order field on many lines (a fractional
  index mitigates this), it clutters the line, and it duplicates information the file's
  own line order already encodes. Rejected.
- **Order stored in app state / Dexie only** — no vault churn, but the order is invisible
  in Obsidian and lost on any other device until it syncs out-of-band. Violates
  "the vault is the source of truth." Rejected.
- **Whole-file rewrite on drag** — simplest to implement, but breaks the non-destructive,
  line-level write contract (ADR-0004) and is hostile to reconciliation. Rejected.

## Consequences

- New `move` write-queue op + reconciliation path; both need tests, including the
  concurrent-edit cases.
- The parser/loaders must treat order as significant and stop any incidental re-sorting.
- Drag-and-drop UI (touch-friendly, since the app is mobile-first) is additional work
  and should be specced as its own slice once this op exists.

## Sharp edges

- Moving a line must keep the block ref the last token on the line (ADR-0004 sharp edge)
  and preserve surrounding blank lines / headings.
- "Target neighbours" can both disappear between enqueue and apply — define the fallback
  explicitly and test it.
- Manual order and date-based sections coexist; be clear in the UI which one is active so
  a drag in a date-sorted view doesn't silently no-op.
