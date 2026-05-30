# ADR 0011: Recurring tasks

- **Status:** Proposed
- **Date:** 2026-05-25
- **Amends:** ADR-0004 (markdown conventions)

## Context

Making tasks feel like Todoist surfaced recurrence as the top "real" feature gap.
The Obsidian Tasks plugin already has a recurrence syntax — `🔁 <rule>` — and our
parser currently preserves it blindly as an `unknown_token`, so recurring lines
authored in Obsidian survive a round-trip but the app neither understands nor
advances them. We want first-class support: show that a task repeats, and when the
user completes one occurrence, roll the date forward and reopen it.

Constraint: tasks are lines in the user's vault (ADR-0004), edited non-destructively,
and the file is the source of truth. Whatever we add must serialize to the same
`🔁 <rule>` token the Tasks plugin reads, so Obsidian and the app agree.

## Decision

1. **Domain.** Add an optional `recurrence: string` field to `Task` holding the rule
   text verbatim (e.g. `every week`, `every 2 weeks on monday`). We store the rule
   as-authored rather than a parsed structure, so any rule the Tasks plugin accepts
   round-trips even if we don't fully interpret it yet.
2. **Parse/serialize.** Recognize `🔁` as a metadata token; the following run of words
   (until the next recognized token or the block ref) is the rule. Emit it in canonical
   order: after the dates, before `#tags`. Promote it out of `unknown_tokens`.
3. **Completion behaviour.** On completing a recurring task, compute the next due
   (and scheduled/start, preserving their offset from due) from the rule, write a new
   open line with fresh dates, and mark the current one done — mirroring the Tasks
   plugin's "create next occurrence" behaviour. The interpreter supports a documented
   subset of rules first (`every N day|week|month|year`, `every <weekday>`); unknown
   rules still round-trip but don't auto-advance, and the UI says so.

## Alternatives considered

- **Structured recurrence object (RRULE/iCal)** — precise and powerful, but doesn't
  match the Tasks plugin's natural-language rule, so it wouldn't round-trip without a
  lossy translation layer. Rejected for v1.
- **Leave it in `unknown_tokens` and only display a 🔁 badge** — cheap, but the user
  has to advance the date by hand, which defeats the point.

## Consequences

- Parser/serializer change is in the highest-risk module; add corpus + property tests
  for round-trip and for the completion-advance math.
- The "complete advances the date" flow turns one mutation into two line ops (close
  current, append next); the write queue and reconciler must handle that atomically.
- Rules we don't interpret degrade gracefully (round-trip, no auto-advance).

## Sharp edges

- The rule text can contain spaces, so it isn't a single whitespace token like every
  other piece of metadata — the parser needs a "consume until next known token" mode.
- Date-rollover math must use the same UTC `IsoDate` helpers as the rest of the app to
  avoid off-by-one across timezones.
- "When done" vs "when due" recurrence (Tasks plugin's `🔁 every week when done`)
  changes the base date for the next occurrence — decide and test both.
