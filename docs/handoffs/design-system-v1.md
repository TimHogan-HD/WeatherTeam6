# WeatherTeam6: Design System

Version: v1 · Date: 2026-06-11 · **Locked. Client-agnostic.**

> **What this is.** The visual and copy contract every screen obeys. It was extracted on
> 2026-09-23 from `weatherteam6-ui-handoff-v1.md`, a 682-line handoff for the React Native
> app: that app was deleted, its twelve per-screen phases (7b through 12) went with it, and
> only this part was ever in force for the web client. The original is recoverable from the
> `archive/2026-09-23-pre-cleanup` tag.
>
> The client's own spec is `docs/handoffs/miniapp-design-v1.md` and it is binding. **Where
> it and this document disagree, it wins** — but it *extends* this rather than replacing it,
> so everything below still applies unless that spec says otherwise.

## Token source

All visual values come from `packages/design/src/tokens.ts`. **Never hardcode a colour, font
size, spacing value, or border radius anywhere in the codebase.**

In the web client this is not a direct import for every token: `colors`, `uvScale`, `units`,
`spacing` and `radius` come straight from `@weatherteam6/design/tokens`, while `type`,
`shadow` and `layout` are React Native shaped and must come through
`apps/miniapp/src/theme/tokens.css.ts`. The adapter **derives** every value from an import
and never restates a literal. See the `miniapp-patterns` skill.

## Contrast rules (locked — never override)

- Labels (`txt4`): min opacity 0.50
- Body copy (`txt3`): min opacity 0.62
- Stat values (`txt2`): min opacity 0.82
- Lime (`good`) is reserved for numbers, accents, primary actions — never for body copy on a dark background
- On lime fills: text colour must be `colors.onGood` (`#0d1117`)

The conditions colours are **semantic, not decorative**: `good` lime, `fair` amber and
`poor` red carry meaning, and they are not available for data marks. Data ramps are named
scales in `packages/design` — `tempScale`, `windScale`, `chanceScale`, `uvScale`.

## Layout constants

- Horizontal screen gutter: `spacing.screenH` (20px)
- Top safe area: `spacing.topSafe` (48px)
- Card padding: `spacing.cardPad` (14px)
- Bottom inset: `spacing.bottomInset` (24px)

All mockup screens are drawn at **375 × 812** (iPhone logical resolution).

## Copy rules (locked)

- **No climbing opinions** — no "go / don't go", no "send conditions"
- **No p10/p50/p90 jargon** — plain language only ("models broadly agree", "firms up inside a week")
- Charts fill the full time axis with no gaps
- **Score is a derived signal, never the headline** — weather leads on every screen
- **Always quote data sources by name** (NWS, HRRR/ensemble, ACIS climatology, OpenBeta) — and derive the name from the response, never write it down
- **Imperial units throughout**: °F, mph, in, ft, mi. The API returns metric; the formatters in `packages/types` convert

Two rules the client added that belong here now:

- **A reading is a label and a value, never a sentence.** `Dryness: Dry`, `Friction: Great`,
  `Score: 100`. A fluent sentence claims a confidence an estimate has not earned.
- **The words come from the readings, never from the number.** A ladder mapping a score to a
  phrase can only be as right as the score, which is how 104 °F came to read *"Dry, settled"*.

## Mockup reference

`docs/handoffs/design-mockups/weatherteam6UI.html` — a self-contained HTML/CSS/vanilla-JS
prototype covering Home, Locations, Crag Detail, the weather data sheets and the hourly
analysis screen. Open it directly in a browser. Read it for exact layout geometry, SVG
maths, component structure and token usage.

**It is visual reference only.** Where it and `miniapp-design-v1.md` disagree, the spec
wins. **And the mockup itself is the spec, not a prose summary of it** — one phase was built
twice for reading a description instead of opening the file.

The mockups for radar, walls and trip creation were drawn for the deleted mobile app and
were removed with it.

### Two copy-rule repairs already made to that file — do not undo them

1. An earlier draft of the hourly screen called the Claude API to generate a
   *"Go — conditions are suitable for climbing"* / *"No-go — [reason]"* verdict per hour.
   That violates the locked no-opinions rule and was removed entirely — markup, JS and CSS.
   **Do not reintroduce per-hour AI analysis**; it needs its own copy review if it returns.
2. Several "What This Means" cells in the Temperature, Wind and Cloud Cover sheets carried
   hardcoded text inferring climbing suitability or gear behaviour — a *"Sweet Spot ·
   Climbing Temp"* cell, a wind note quoting a **fabricated** drying-speed percentage for a
   given wall aspect, a *"For Climbing · Good — rope easy to manage"* cell. They were
   rewritten to plain factual readouts. Use the corrected copy as written, not as a template
   for inferring new climbing-opinion phrasing elsewhere.

## Non-goals

- A light theme. There is no light token set and every contrast rule above assumes near-white on dark
- Bottom navigation. The client has four routes and `/add` is a task you finish and leave, not a peer of the location list
- A CSS or motion architecture. **Still not authorised** — the client is styled entirely with inline styles, which cannot express hover, transitions or breakpoints. That ceiling is real and deliberate
