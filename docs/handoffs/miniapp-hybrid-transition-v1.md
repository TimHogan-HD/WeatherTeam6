# WeatherTeam6 Web App — Hybrid Look Transition

Version: v1
Date: 2026-10-19
Status: **Decided by the owner; Phases 1, 2 and 2b built.** Moves `apps/miniapp` to the look in
`docs/handoffs/design-mockups/weatherteam6-hybrid.html`. That mockup is also published
privately to the owner as https://claude.ai/artifact/18s8fy1HY5D1jR7AxmwE6p, but the
repo copy is the reference. Where this document and `miniapp-design-v1.md` disagree, this
document wins for the items it lists. Everything it does not list stays as
`miniapp-design-v1.md` says. Design is still a conversation (CLAUDE.md § Rules). The honesty
rules on copy and the contrast floors still apply.

Open the mockup in a browser before building anything. Do not build from this summary
alone; one phase was once built twice that way. The figures, trips and guidebook routes in
the mockup are sample data. Only the crag names are real.

## Owner decisions (2026-10-19)

- **Look:** a clean, dark liquid-glass style on a still background. There is no
  time-of-day sky and no weather drawn behind the content. Each section is a frosted
  glass card. Motion is only in front, and only when a reading changes.
- **Chart glow: Soft.** The line charts keep a soft glow and a thin highlight, well
  short of the old neon. In the mockup this is `GL.soft` (`{sd:1.6, a:.4, w:.55}`): blur
  std-dev 1.6, glow alpha 0.4, stroke widths at 0.55×. Put the numbers into tokens in
  `packages/design`; do not restate them in the app.
- **Overview graph: score bars.** The mockup still contains timeline and three-days
  code, and its control bar has been removed. Build only the score bars.
- **Map, Profile, Add a crag and Feedback** are not drawn in the mockup. Restyle them in
  the same look; there is no separate mockup round.

## What changes against the live app

- **Navigation.** A crag is a screen you open from the list. Opening it slides the
  app bar away and brings up a floating glass dock holding the crag's tabs (Overview, Daily,
  Hourly, Precip, Rock, Crag) within thumb reach. Back, or a swipe in from the left edge,
  brings the app bar back.
- **Header.** The large Overview score shrinks into a slim sticky header when you leave
  Overview, and the header follows the tab: the best day on Daily, the hour being read on
  Hourly, today's chance of rain on Precip, the margin above dew point on Rock.
- **Hourly.** There are four charts, all scrubbed together:
  - temperature, with humidity on its own right-hand scale
  - rain chance and amount on one chart
  - wind
  - the strip

  Air and dew point share one row in the readout. The scrub marker is a ring with a
  coloured dot, never two stacked dots.
- **Dry all day on Hourly** (every hour's median amount is 0 and the highest chance is
  under 10%): the rain card keeps its frame, gridlines and hour labels. It draws no chance
  columns, no amount line or range, no scrub dot, no now line, no right-hand inch scale
  and no key. Instead it says "Dry all day" and gives the highest chance and its hour.
- **Daily.** The summary under each day wraps across the full row and is never cut off.
- **Precip.** The running-total chart is removed (`PrecipRunningTotal.tsx`). The tab
  keeps:
  - last rain
  - today
  - this week
  - dry again
  - the past week's hour grid
  - the next 48 hours
  - the wettest hour each day
- **Rock.** The field guide stays exactly as live (`rockGuide.ts`):
  - the texture art
  - the drying-pace and wet-strength gauges
  - formed, holds, styles, rain, sun, care and avoid
  - the crag facts, with "Wrong rock type?"

  Above it go back the **drying clock** and the **48-hour condensation chart** (owner,
  2026-10-19; this reverses the 2026-09-30 removal of the drying card).
- **Rock surface temperature is not shown** anywhere (owner: not accurate).
  `t_surface_c` and `rock_sun_shade` stay in the API and stay unrendered.

## Live features that must survive the move

The mockup was checked against the live app for all of these. A transition phase that
drops one is a regression:

- the list with alerts
- last and next rain
- "How the score works" (`ScoreExplainer`)
- Sources (`SourcesFooter`)
- Feedback
- Agreement on trip days (`agreementShare`, `AGREEMENT_MEANING`)
- rain amount and peak wind on Daily
- an alert withholding the score while keeping every reading
- the location identity facts
- the Crag tab: the OpenBeta area, grades, walls, a wall's week, routes, and a route's
  to-do, tick and ticks
- all of Trips:
  - the list soonest first, with when the forecast opens
  - the crag-by-day grid ("Dashed: not scored yet.")
  - one crag's day tiles
  - rain over the trip with its range
  - the trend by day and for the whole trip
  - the ended-trip look back
  - new and edit trip, with their validation copy
  - delete on a second tap

## Phases

1. **Look and navigation.** Tokens for the glass surfaces, the glow and the radii, then the
   card wrapper, the app bar and dock hand-off, and the slim header. No change to what any
   reading says. **Built 2026-10-19**, then the owner's four calls on it the same day: the
   mockup's aqua for what is chosen (`colorsV2.brand`), the five app-bar sections with no
   Main tab, the crag switcher across a crag's top (`CragBar`), and the mockup's page
   transitions (`lib/pageMotion.ts`). Hourly's header shows the open day's score until Phase 2's scrub.
2. **Overview and Hourly.** The score bars, the four Hourly charts with the shared scrub,
   and the dry-day rain card. **Built 2026-10-19.** Overview opens on 36 hourly score bars
   (`ScoreBars.tsx`, `lib/scoreBars.ts`) with each day's best run underlined. Hourly reads
   one hour across the sky strip and the three charts (temperature with dew point and
   humidity on a right-hand scale, rain chance as columns with the amount as a line, wind),
   and the slim header follows it (`slimHeader.ts`). A day counts as dry when every hour is
   read and under 10% chance (`dryDay`); there is no hourly median amount, so the chance
   stands in for it.
   **2b, built 2026-10-19: the screens redrawn to the mockup itself** (owner: "the whole
   point of this is for it to look like the mock up"). Overview is the mockup's hero (name,
   the hour's score large, Dryness, the rock and hour, a line of figures, the day's good
   hours and score), then glass cards: score bars, Today, Next days, Score breakdown, Rain,
   Air, Rock with the wavy drying clock (`DryingClock.tsx`), and How the score works. The
   Conditions now card, the measurements panel and the slim header on Overview are gone.
   Hourly is the day words with an underline and three cards, each with the mockup's title
   and aside, glow tube, frost range and bead; the air line is coloured by score, which
   settles the first open call. **Where it departs from the mockup, for honesty:** the
   alert banner sits above the name; the line under the score is labelled fragments, not
   the mockup's sentence; models are named as the response reports them, not "ICON"; no
   night glyphs, since the sky series covers daylight only; no rock temperature (owner);
   Hourly has no Agreement. The score bar's rain dot (50% or more) is still the owner's call.
3. **Daily, Precip and Rock.** The Daily wrap fix, removing the running total, and putting
   the drying clock and condensation chart back on Rock.
   **3a, built 2026-10-19: the Conditions list and Daily drawn to the mockup.** The list is
   the mockup's title and one glass card of rows (`LocationCard.tsx`): the name, Dryness and
   rock, the good hours and today's score, and the hour's score large with "now". Add and
   sort stay; the alert's name takes the day's line. Daily is one Seven days card
   (`DailyList.tsx`): sky, day, score, the low–high bar on the week's scale, chance of rain,
   and good hours, Dryness, rain and peak wind under them. The Overview's Rain card names the
   last storm's amount and length. **Departures, for honesty:** no sky glyph on the list
   (`/conditions` carries none); "Good hours" where the mockup says "best 11a–2p", since a
   day's score and its good hours are not one three-hour run; no rain amount beside the next
   rain (there is no hourly median amount).
   **3b, built 2026-10-20: Hourly and Daily wording and spacing to the mockup** (owner: "the
   wording at the top of hourly feels off"). Hourly's header is the mockup's line, `Air 54° ·
   dew 38° · rain 0 in, 2% · humidity 49% · wind 10/18 mph`; the charts bleed 22px past the
   card padding as the mockup's do; the temperature key is one line (`air`, the gradient
   swatch carrying the score); the footnote sits inside the Wind card with the day's chance of
   rain. Daily's rows read `good 11a–2p · Dry · 0 in · peak wind 20 mph`, and its header
   `Sunday · good 9a–12p · Dry`. **Departures:** "good" where the mockup says "best" (as 3a);
   no moon glyphs at night, because the sky series has daylight hours only and a moon would
   claim a clear night; no Agreement in the footnote, which nothing computes per day.
   **3c, built 2026-10-20: fill the space** (owner: "things should fill the space accurately
   … intentionally full, not stretched"). Daily rows carry a 24-hour strip under each day,
   each hour coloured by its score through `summarizeReadings` (`lib/dayStrip.ts`; a city's
   is shaded by chance of rain), under one `12a 6a 12p 6p` axis, so the week fills the
   screen with readings rather than padding. The Overview's Rain, Air and Rock cards drop the
   mockup's label-left, figure-right lines for **stat tiles**: label above figure, note under
   it, equal columns with a hairline between (`typeV2.statLabel`/`statFigure`). **This
   departs from the mockup at the owner's request**: a label at one edge of a card and its
   figure at the other were hard to read together. The list's rows gain the mockup's sky
   glyph, as **today's** sky from the crag's `/hourly` run (the query opening the crag
   reads), and Daily's `good 7a–11p · today 89`. A crag's screen now clears its floating
   dock plus the home-indicator inset (`dockClearance`); the bar's clearance left the last
   line under the dock on a phone with one.
4. **Crag tab and Trips** restyled.
5. **Map, Profile, Add a crag and Feedback** restyled.

Each phase is its own PR, verified with `npm run check:ui` from `apps/api`, with the
screenshots opened, plus the miniapp tests. `prefers-reduced-motion` and
`prefers-reduced-transparency` each get a fallback, as the mockup has.
