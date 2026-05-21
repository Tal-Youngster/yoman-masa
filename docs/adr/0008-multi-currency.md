# ADR 0008: Multi-currency — Frankfurter rates, snapshot conversions

- **Status:** Accepted
- **Date:** 2026-05-21

## Context

The trip spans multiple countries. Expenses are entered in local currency. The user wants summaries in a home currency.

## Decision

- **Source:** Frankfurter (`api.frankfurter.dev`) — free, no API key, ECB daily rates. Fallback: `open.er-api.com` for currencies Frankfurter doesn't cover.
- **Storage:**
  - Every expense stores native `{ amount, currency }` forever — source of truth.
  - At entry time, also store a snapshot conversion `{ home_amount, home_currency, rate, rate_date }` so historical totals don't drift if rates change later.
  - Lazy "current value" conversion in UI when the user explicitly asks.
- **Caching:** Daily fetch on app start when online. Stored in `<vault>/Travel/.travel/rates/<yyyy-mm-dd>.json` so the cache syncs across devices.
- **Offline:** Use most recent cached day. UI labels conversions as "estimated, rate from 2026-05-19" when stale > 1 day.

## Alternatives considered

- **Manual rate entry.** Too much friction across a multi-country trip.
- **Paid API (open-exchange-rates).** Free tier is fine; pay only if Frankfurter coverage proves insufficient.

## Consequences

- Expense totals are stable over time.
- A `currency` module owns the cache, fetch, conversion, and stale-label rules.

## Sharp edges

- Rare currencies (e.g. Lao kip) may be missing from Frankfurter — fallback path matters.
- Don't compute conversions during list rendering. Compute once on insert; persist.
