---
name: telegram-patterns
description: Chat-rendering patterns and invariants for the WeatherTeam6 Telegram bot (apps/api/src/lib/telegram) — the two opposite escaping homes, native Rich Message table rules, unit and label conventions, and the inline-chart attempts that failed on a real device. Use when writing, reviewing or changing anything that renders a bot message or panel.
paths: apps/api/src/lib/telegram/**, apps/api/src/routes/telegramWebhook.ts
---

# Telegram Rendering Patterns

> Extracted from `.claude/docs/STATE.md` on 2026-09-16. That file named this section as
> its own clearest trim candidate: ~450 words of **bot** rendering rules that every Mini
> App session was also loading, and the only domain in the repo without a skill of its
> own. **Unchanged in substance and still binding** — they now load when you open a file
> they govern.
>
> The reasoning and the four rounds of device feedback behind them are in
> `.claude/docs/session-archive.md` — grep for "native Telegram tables".

## Escaping has exactly two homes and they are opposites

- **Rich blocks (JSON): never escape.**
- **HTML (`panelToHtml`, `sendPlain`, `alertMessage`): always escape.**

Every plain-text reply goes through `sendPlain`. Three once didn't, and it reintroduced
issue #26.

**A string literal in the source needs escaping as much as an interpolated one.** `/start`
shipped containing `<location name>`, which Telegram rejects as an unsupported start tag;
the webhook swallowed the 400 and the command had **never once worked**. An escaping audit
that only looks at `${...}` misses this — see `.claude/rules/defect-patterns.md` §5.

## Table and label conventions

- **No fixed column widths.**
- **Units live on the value, never the header** — `6 mph`, not a `mph` column heading.
- `t` means **trace**. `0 mph` reads **calm**.
- **`clockLabel` is for sentences; `clockShort`/`clockCell` are for cells.** "midnight" in a
  column widens the whole table.

## Do not add a fourth inline chart

**Three attempts — sparkline, dithered bar, block bar — all failed on a real device and were
removed.** Do not add another without the owner asking for it.

**This does not apply to the Mini App.** SVG charts there are wanted and shipped; see the
`miniapp-patterns` skill.

## Two figures that must not be rendered the wrong way

Both are enforced by `.claude/rules/architecture.md` and both have shipped wrong somewhere
in this repo's history:

- **A precipitation total over more than one hour comes from `precip_mm_mean`**, never from
  summing `precip_mm_p10/p50/p90`. A percentile is not additive and a summed p50 is the
  median of nothing. A percentile shown against a multi-hour step describes **one hour** of
  it, and the surface must say so.
- **A chance of rain is `members_wet / member_count`**, never `precipitation_probability`.
  A null wet count or a zero member count **withholds** the figure rather than showing 0%.
