# WeatherTeam6: Design System

Version: v1 · Date: 2026-06-11 · Client-agnostic.

> **The visual and interaction design is open** (owner, 2026-10-01: *"I am not hard set on
> anything design wise"*). Colours, layout, spacing, type, motion and press feedback below
> are the current design, not settled decisions. Propose changes, show them as variants, and
> talk them through with the owner, rather than treating any of it as fixed. Two things here
> are not taste, and stay unless the owner says otherwise: the **copy rules**, which keep a
> reading from claiming more than the data supports, and the **contrast floors**, which keep
> text readable.
>
> **What this is.** The visual and copy contract every screen obeys. It was extracted on
> 2026-09-23 from `weatherteam6-ui-handoff-v1.md`, a 682-line handoff for the React Native
> app: that app was deleted, its twelve per-screen phases (7b through 12) went with it, and
> only this part was ever in force for the web client. The original is recoverable from the
> `archive/2026-09-23-pre-cleanup` tag.
>
> The client's own spec is `docs/handoffs/miniapp-design-v1.md`, which describes what is
> built. **Where it and this document disagree, it wins** — but it *extends* this rather
> than replacing it, so everything below still applies unless that spec says otherwise.

## Token source

All visual values come from `packages/design/src/tokens.ts`. **Never hardcode a colour, font
size, spacing value, or border radius anywhere in the codebase.**

In the web client this is not a direct import for every token: `colors`, `uvScale`, `units`,
`spacing` and `radius` come straight from `@weatherteam6/design/tokens`, while `type`,
`shadow` and `layout` are React Native shaped and must come through
`apps/miniapp/src/theme/tokens.css.ts`. The adapter **derives** every value from an import
and never restates a literal. See the `miniapp-patterns` skill.

## Contrast floors (readability)

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
- Top safe area: `spacing.topSafe` (48px) on native; the web app uses `spacing.topWeb` (16px) on top of `env(safe-area-inset-top)`, which already clears the status bar (owner, 2026-09-29: 48 read as too much cushion)
- Card padding: `spacing.cardPad` (14px)
- Bottom inset: `spacing.bottomInset` (24px)

All mockup screens are drawn at **375 × 812** (iPhone logical resolution).

## Copy rules (honesty, not taste)

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

## Not built yet

- A light theme. There is no light token set and every contrast floor above assumes near-white on dark — open to discussion like the rest
- ~~Bottom navigation~~ — built 2026-09-30 (`miniapp-design-v1.md` §2). `/add` is still not a tab

## CSS and motion

**Allowed** (owner decision 2026-10-01, reversing the earlier ban: *"if it works it
works"*). Stylesheets, classes, `:hover`, transitions, keyframes, media and container
queries may be used wherever they make a screen better; inline styles are no longer the
only tool. What still holds:

- **Values come from the tokens.** A stylesheet reads them through the `--wt6-*` custom
  properties `cssVars.ts` emits, never a restated literal — the token rule above applies to
  CSS exactly as to inline styles.
- **Every animation honours `prefers-reduced-motion`**: it settles at once rather than
  moving.
- **The contrast floors still bind.** A fade or state may not leave text below them at
  rest — which is why remembered figures are not dimmed, and the header's "updated … ·
  refreshing" carries their age instead.
- **Durations and curves are the `motion` tokens** (`packages/design`), and
  `globals.css` settles every transition at once under `prefers-reduced-motion`.
- Motion answers something: a person's action, or data arriving. The behaviours shipped
  (owner picks, 2026-10-01) — the bottom bar's sliding pill (no overshoot); the press,
  which dims at once so a tap shows before a slow screen arrives and shrinks to 97% over
  160 ms; the location tabs' underline and the Hourly day chips' fill sliding to the
  choice; Measurements growing open; a score that a new run changes rolling to its new
  value with "was 64" beside it; pull-to-refresh on the list and a location's forecast tabs, which says how fresh the
  scores are; the smooth scroll-to-top on the lit tab; `FadeIn` on a card's late weather —
  are the current motion, not exceptions and not fixed. Any of them can be proposed
  differently.
- **Every figure uses tabular digits** (`globals.css`), so a figure that updates does not
  shift what sits beside it.
