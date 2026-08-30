# ADR 0004: Markdown conventions for vault data

- **Status:** Accepted
- **Date:** 2026-05-21

## Context

Tasks and shopping items live in the vault, hand-edited in Obsidian and edited by the app. We need a syntax that (a) the app can parse/serialize round-trip, (b) renders nicely in Obsidian with or without plugins, (c) doesn't lose unrelated content on edit.

## Decision

### Tasks (Obsidian Tasks plugin syntax)

```md
- [ ] Book Vietnam flights ⏫ 📅 2026-06-15 ➕ 2026-05-21 #travel/flights ^t-a1b2
- [x] Renew passport ✅ 2026-04-02 #travel/admin ^t-c3d4
```

- Status: `[ ]` open, `[x]` done, `[/]` in-progress, `[-]` cancelled.
- Priority emojis (Tasks plugin canon): `🔺` highest, `⏫` high, `🔼` medium, `🔽` low, `⏬` lowest.
- Dates: `📅` due, `➕` created, `✅` done, `⏳` scheduled, `🛫` start.
- Categories: `#travel/<area>` tags.
- Stable line ID: Obsidian block reference `^t-<ulid-suffix>`. App-generated, never reused.
- Any unknown trailing content / unknown tags / inline links preserved verbatim on round-trip.

### Shopping (checkboxes + inline Dataview-style fields)

```md
- [ ] Trail runners (qty:: 1) (cost:: 120 USD) #gear/shoes ^s-e5f6
- [x] Sunscreen (qty:: 2) ✅ 2026-05-10 #toiletries ^s-g7h8
```

- `(key:: value)` inline fields for `qty`, `cost`. Survive without Dataview; renderable in Obsidian regardless.
- Same checkbox / tag / block-ref conventions as tasks.

### App entities (frontmatter + free-form body)

```md
---
type: accommodation
id: acc_01HXYZ...
trip_id: trp_01HABC...
status: booked
name: Hanoi Old Quarter Homestay
service: airbnb
confirmation: HMR-9921
checkin: 2026-07-12
checkout: 2026-07-15
cost: { amount: 142.50, currency: USD }
location:
  address: 15 Hàng Bè, Hoàn Kiếm, Hà Nội
  lat: 21.0333
  lng: 105.8542
url: https://airbnb.com/...
host: { name: Linh, phone: '+84...' }
attachments: [.travel/attachments/ab12...pdf]
---

# Check-in instructions

Buzzer at gate, code 4421. Linh meets at 14:00.
```

- Frontmatter is app-owned. Body is yours; the app never touches it on write.
- `id` (ULID) is the stable identifier; filename is a human-friendly slug and can be renamed without breaking references.

### Expenses ledger (monthly file) — historical

> Superseded by ADR-0018: the app no longer reads or writes these files. The
> format is documented because vaults still contain them.

```md
---
type: expenses-ledger
trip_id: trp_01HABC...
month: 2026-05
---

- 2026-05-04 (id:: e_01H...) (amt:: 12.40 EUR) (cat:: food) Café in Lisbon
- 2026-05-04 (id:: e_01H...) (amt:: 38.00 EUR) (cat:: transport) Train Lisbon→Porto
```

One line per expense; line-level patching keyed by `id`.

## Alternatives considered

- **YAML frontmatter for tasks** — too heavy for many small items; doesn't play with Obsidian Tasks UI.
- **Dataview inline fields for tasks** — works but the Tasks plugin ecosystem is bigger; we'd lose those affordances.
- **Note-per-task** — explodes the vault.

## Consequences

- Parser/serializer is the highest-risk code; property-tested.
- Renders fine in Obsidian without any plugin; nicer with Tasks/Dataview installed.

## Sharp edges

- Block references (`^id`) are sensitive to whitespace and must always be the last token on the line.
- Round-trip invariant: `serialize(parse(x))` must equal `x` for any vault-realistic input. Tested with a corpus.
- Inline fields use Dataview's `(key:: value)` form (with parens), not the bare `key:: value` form, so they survive in any context.
