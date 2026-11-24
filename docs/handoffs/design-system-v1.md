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

- **The floor is a measured ratio: 4.5:1 for text under 24 px (18.5 px bold), on the surface
  it is drawn on** (WCAG 1.4.3). An opacity gives a different ratio on every surface:
  `txt5` (38%) measured 2.76–3.70:1 on the Rock tab (#648). `apps/miniapp/src/theme/contrast.test.ts`
  checks every `colorsV2` text colour on every surface; a new text or surface token goes in
  its lists. The opacity minimums below are the older form of this rule and still hold.
- Labels (`txt4`): min opacity 0.50
- Body copy (`txt3`): min opacity 0.62
- Stat values (`txt2`): min opacity 0.82
- Lime (`good`) is reserved for numbers, accents, primary actions — never for body copy on a dark background.
  Since 2026-11-23 (#644, owner's pick) the chrome is off lime too: Feedback is muted text and
  the list's Add is a raised pill, so lime on the Conditions screen means a score
- **The smallest text is 12 px** (#644): every `typeV2` token, axis ticks included. A chart's SVG
  labels are `LABEL_SIZE` (11) viewBox units (`charts/liquid.tsx`), which draw at 12 px or more
  on a screen 425 px wide or wider. Headings are sentence case; no `typeV2` token is tracked caps
- On lime fills: text colour must be `colors.onGood` (`#0d1117`)

The conditions colours are **semantic, not decorative**: `good` lime, `fair` amber and
`poor` red carry meaning, and they are not available for data marks. Data ramps are named
scales in `packages/design` — `tempScale`, `windScale`, `chanceScale`, `uvScale`.

## Layout constants

- Horizontal screen gutter: `spacing.screenH` (20px)
- Top safe area: `spacing.topSafe` (48px) on native; the web app uses `spacing.topWeb` (16px) on top of `env(safe-area-inset-top)`, which already clears the status bar (owner, 2026-09-29: 48 read as too much cushion)
- Card padding: `spacing.cardPad` (14px)
- Bottom inset: `spacing.bottomInset` (24px)

Mockups draw a phone frame **390 px** wide (CLAUDE.md § Rules); the owner's phone is about
480 × 1000, which `check:ui` uses.

## Copy rules (honesty, not taste)

- **No climbing opinions** — no "go / don't go", no "send conditions"
- **No p10/p50/p90 jargon** — plain language only ("models broadly agree", "firms up inside a week")
- Charts fill the full time axis with no gaps
- **Score is a derived signal** — it headlines only beside the hour it is (owner, 2026-10-19; `.claude/rules/readings.md`)
- **Always quote data sources by name** (NWS, HRRR/ensemble, OpenBeta) — and derive the name from the response, never write it down
- **Imperial units throughout**: °F, mph, in, ft, mi. The API returns metric; the formatters in `packages/types` convert

Two rules the client added that belong here now:

- **A reading is a label and a value, never a sentence.** `Dryness: Dry`,
  `Score: 100`. (No `Friction` word since 2026-10-05; its causes are in Score breakdown.) A fluent sentence claims a confidence an estimate has not earned.
- **Write like a weather app** (owner, 2026-10-02). Standard weather words over coined
  labels ("Last rain", not "Last real rain"; "Range", not "8 in 10 runs"; "Score breakdown",
  not "Held back by"). A caveat is said **once** — in the Measurements disclosure and on How
  the score works — not repeated on every card ("estimated, not measured", "not a gauge").
  A rule is defined once, where it is explained, never re-explained inline ("each hour under
  0.02 in, so they don't count"). Error and empty states are one short sentence, no em-dash
  aside. The rock guide is exempt: its prose was reviewed rock by rock.
- **The words come from the readings, never from the number.** A ladder mapping a score to a
  phrase can only be as right as the score, which is how 104 °F came to read *"Dry, settled"*.

## Mockup reference

Every mockup is a standalone `.html` file in `docs/handoffs/design-mockups/` (CLAUDE.md §
Rules, owner 2026-11-23). `field-guide-direction.html` is a direction proposal for #637, not
the current look. `look-variants-644.html` holds the #644 variants; the owner picked C, "Open list", and
the model dots (U1) on 2026-11-23, and C was carried to every screen on 2026-11-24
(`sectionV2` and `surfaceV2` in `theme/styles.ts`).

`docs/handoffs/design-mockups/weatherteam6-hybrid.html` — the layout of every screen (owner,
2026-10-19); its glass cards, tracked caps, sub-12 px labels and lime Feedback pill are
superseded by variant C in `look-variants-644.html`, as is every mockup drawn before
2026-11-23. Open both directly in a browser; `miniapp-hybrid-transition-v1.md` says what it
covers and where the app departs from it. **Open the mockup itself, not a prose summary of
it** — one phase was built twice for reading a description instead of opening the file.

The June prototype this section used to name was deleted on 2026-11-03 (it is in git). One
rule from repairing it still stands: **do not reintroduce per-hour AI analysis** such as a
*"Go"* / *"No-go"* verdict per hour. It breaks the no-opinions rule, and it needs its own
copy review if it returns.

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
