---
name: miniapp-patterns
description: Client patterns and invariants for the WeatherTeam6 web app (apps/miniapp) — the design-token adapter, the session token and the back affordance, React Query rules, null-safe formatting, score suppression and the is_today flag. Use when writing, reviewing or changing anything under apps/miniapp, or any packages/design token consumed by it.
paths: apps/miniapp/**, packages/design/**
---

# Web App Patterns

**The app is styled entirely with inline styles**, which cannot express hover,
transitions, keyframes or breakpoints. That ceiling is real and it is why the charts
carry no hover layer. The one exception is the bottom bar's sliding pill (`TabBar.tsx`,
owner decision 2026-09-30), which honours `prefers-reduced-motion`. The other is the press dim: one `:active` rule
in `globals.css` at `press.opacity`, instant, for links, buttons and `role="button"`/`"tab"`
(owner decision 2026-09-30). **Scroll position is `ScrollMemory`'s** (`App.tsx`, rule in
`arrivalScrollY`): a section's first screen keeps its place however you return, any other
screen only on back.
**Starting a CSS or motion architecture is still not authorised**
— that is a separate decision from drawing charts, and Phase 5 of
`docs/handoffs/miniapp-hourly-dataviz-handoff-v1.md` is where it gets settled.

## Charts (`apps/miniapp/src/components/charts/`)

Inline SVG, no chart library — `miniapp-design-v1.md` §8. Each rule below is one that
renders wrong-but-plausible if broken:

- **A rain bar covers the hour *before* its timestamp.** Precipitation is stamped at the end
  of the hour it fell in, so an 02:00 sample describes 01:00-02:00 — the same convention
  the API layer stores it under. Drawing it forward moves every shower an hour later and nothing
  typechecks differently.
- **Two different things break a series, and both are real gaps**: a null value, and a
  missing row. An hour with no values at all is never stored, so its absence is a two-hour
  step between two good rows. `contiguousRuns` takes an adjacency predicate for that.
- **A one-point path paints nothing.** `M x,y` with no line command is invisible at any
  stroke width, so `linePath` returns `''` and the caller draws a dot. Same family as a
  `NaN` coordinate, which is why `extent` skips non-finite values and `linearScale` answers
  a zero-width domain with the middle of the range.
- **Values stay in the API's metric units; only the formatter converts.** Converting in the
  adapter forces every threshold to be restated in the other unit.
- **Labels describe the series, not the band around it.** The domain must cover p10-p90 or
  it clips, but labelling its outer edge prints one member's worst hour as the forecast.
- **The ensemble size is quoted only when every hour reported the same one** — the far end
  of the window is reached by fewer members.
- **`good`, `fair` and `poor` are the conditions ladder's status colours and are not
  available for data marks.** Temperature uses `sun`; rain uses the `radar*` intensity ramp.
  **One exception: a mark that draws the score itself** — the Overview's Today line
  (`charts/TodayChart.tsx`) is coloured by the hour's score on `scoreScale`, a continuous
  ramp with its stops at the middle of each `SCORE_BANDS` rung (owner, 2026-09-30: a range,
  not hard cut-offs). `scoreRampColor` is that ramp; `scoreColor` stays the stepped ladder the
  pills and tints use. Without a score on screen (a city, a Severe+ alert, alerts loading) the
  line is neutral ink, because a tint with no number is the number leaking.
- **A chart that cannot be drawn says so — and says only what *it* could not draw.** A
  dropped section reads as a forecast of nothing, because a reader cannot notice a section
  they were never shown. But these charts draw the **ensemble**, and a response with no
  ensemble columns can still carry a full deterministic forecast, so "no hourly forecast
  for this location" is a claim about the response that the section is not entitled to
  make. There is deliberately no whole-section empty state.
- **The accessible summary counts what was drawn.** "over N days" over a padded window is
  the same false claim as naming a model that did not answer, and it is the only part of a
  chart a screen-reader user gets.
- **`HourlySeries.fetched_at` is the older of the two runs behind the response**, not the
  run that produced any particular column. The deterministic and ensemble runs are cached
  independently and can be an hour apart; an age line is a freshness claim about what the
  reader is looking at, and the staler half bounds it.
- **An accumulation and an instantaneous reading are placed differently on the same axis,
  and the rain rule does not generalise.** `precip_mm_mean` at 15:00 is the rain that fell
  between 14:00 and 15:00, so its bar spans the hour *before* its timestamp. `temp_c_p50`
  at 15:00 is the temperature *at* 15:00, so its mark is **centred** on it. Reusing the
  rain placement for temperature put the peak an hour early under a correct-looking axis —
  self-consistent, and caught by review rather than by any gate. `Series.tsx` has one
  helper per convention (`accumulationLeft`, `instantLeft`) so the choice is made
  explicitly; `HourlyChart` widens the x-window to match (an hour back for bars, half a
  slot each side for range marks).
- **Temperature is a bar rising from a *labelled non-zero floor*, with a whisker over it.**
  The reasoning that produced a floating translucent box instead was sound and the
  conclusion was wrong: a temperature genuinely has no meaningful zero, but the answer is
  to set the floor just under the coldest p10 **and print it on the axis**, not to stop
  drawing bars. The floating version was technically defensible and visually unreadable —
  pale boxes covering a fraction of the plot where bars now span 15-81 units of 106. Rain,
  chance of rain and wind are real magnitudes and keep a zero floor.
- **`BAR_MIN_H` gives every measured hour a visible stub**, which is what keeps "no rain"
  and "no forecast" different pictures — a zero-height bar and an absent bar would
  otherwise look the same.
- **What the two edge labels say depends on whether anything else states the series.** A
  bar chart's caller prints the day's range in the heading, so the labels are the *scale* —
  and for a non-zero floor they must be, because the floor is the one thing the picture
  cannot show. A line chart (the seven-day strip) has no heading figure, so its labels are
  the series' own extremes; labelling its padded domain there put **113°F on screen over a
  median that never passes 63°F**.
- **A ramp built for one quantity keeps its own scale.** Rain was briefly shaded relative
  to each day's peak so a light day would show a shape; 0.3 mm then painted `radarSevere`
  beside a header reading `0.02 in`, and the same hour was a different colour on the
  seven-day strip. Bar *height* already carries the day's shape, because the domain is the
  day's own peak. Colour means what the ramp says it means.
- **`colorForValue` is fed the median, never a band edge.** Colouring by p90 paints an hour
  as too hot on the strength of one member's worst run.
- **The temperature ramp is centred on `IDEAL_TEMP_C`, derived from `TEMP_BAND_C` in
  `packages/types`.** Copy the band into a component and two charts will drift apart. **No score
  reads `TEMP_BAND_C` any more** — Crag A docks friction from its own 30–60 °F range — so the
  chart can paint an hour neutral that the score docked for warmth (an open owner decision).
  `SCORE_BANDS` rungs Crag A's number and colours the daily score bar.
- **Every data ramp is a named scale in `packages/design`** — `tempScale`, `windScale`,
  `chanceScale`, beside the older `uvScale`. A ramp is one encoding; splitting it into
  loose colours lets a consumer use half of it, and writing its stops as hex in a component
  breaks the tokens rule however sensible the values look.
- **A ramp built for one quantity does not colour another.** Chance of rain was briefly
  drawn with `rainColor(pct / 100)`; that ramp's thresholds are *rates* in mm/h, so two of
  its four steps were unreachable and every value above 50% came out identical. A
  probability is not a rate.
- **The temperature ramp is continuous, and that is what makes `fair` and `poor` safe
  inside it.** As four discrete steps they measured **ΔE 13.0** apart to normal vision —
  below the floor for telling two hues apart — and the cold side had one band where the
  warm side had two, so -15 °C and +5 °C came out identical. Interpolating fixes both:
  neighbouring values in a continuous scale are *meant* to be similar, and only the ends
  must separate. Do not re-step it.
- **Any bar drawn across several rows shares one scale.** Normalising each row to its own
  min/max draws the identical bar on every row whatever the values are — a chart that
  cannot be wrong. Score is a **fixed** 0-100, because its scale is defined rather than
  measured. (The Daily tab drew such bars until the V2 card replaced them with figure
  chips on 2026-09-28; the rule stands for the next one.)
- **A day's score pill is `ScorePill` on `DayRowShell` (`components/DayRow.tsx`),** fed
  through `scoredDays` in `lib/overview.ts`, which suppress it via
  `summarizeReadings`. The Overview and Daily tabs share both, so one day cannot wear two
  numbers or two colours.
- **The Hourly tab (`charts/DayCharts.tsx`, decisions in `lib/hourlyDay.ts`) draws two
  models on one chart.** Air, rain, chance and wind are the ensemble; dew point and
  humidity are `HourlySeries.model`'s deterministic columns, and a caption names that model
  from the response. The friction strip joins `readings.hours` to the hours **on
  `valid_at`**, shows levels never factors, and reads aloud as runs of words. Rain's scale
  runs to at least 0.02 in — below that every tick rounds to `0` and the de-duplication
  labels the *top* of the plot zero.
- **The Precip tab (`PrecipTab.tsx`, decisions in `lib/precipHistory.ts`) is model
  estimates, and says so.** It names no gauge, radar or confidence, and an event's kind comes
  only from `rain_mm`/`snowfall_cm` — a missing one withholds the pill rather than calling it
  rain. A date the response skipped is `totalMm: null`, drawn as an empty well, never a
  dry stub. Its source is `RECENT_PRECIP_SOURCE_LABEL`, which differs from the drying
  model's `rainfallSourceLabel` and is named beside it in the footer.
- **An hourly axis reads the location's clock, from `utc_offset_seconds`.** The four labels
  are the same strings either way, so only their *positions* move — a chart on the viewer's
  clock prints a correct-looking axis against the wrong hours. Issue #33's shape exactly.
- **A legend swatch is drawn the way its mark is drawn.** The keys briefly pointed at
  colours no mark on either chart used. A key naming a colour that is not in the chart is
  worse than no key: it sends the reader looking for something absent.
- **A header figure says which figure it is.** "gusts 21 mph" and "peak 70%" are labelled;
  a bare "70%" beside *Chance of rain* reads as the day's chance when it is one hour's.
  And a total built with `?? 0` across null hours reports a measured zero — an all-null day
  printed "none", a forecast of a dry day, beside its own "no hourly rainfall for this day".
- **Do not spread `card` into a small fixed-size control.** It carries `padding: 14px`,
  which inside a 28px pager button pushes the glyph out of the box entirely — the arrows
  rendered as empty rounded squares. Take the surface piece by piece at that size.
- **Only the current hour may be called "now".** Every daily field is an extreme —
  `temp_c_max` is a *maximum*, and labelling it a present reading is the factual error §3
  names. `currentHour` reads the hour covering this moment from the hourly run and returns
  `null` past `CURRENT_HOUR_TOLERANCE_MS` rather than the nearest one. **And a day's high
  and low are labelled wherever they appear beside it**: unlabelled, the pair reads as the
  headline the moment the current reading is absent, which is a pending query away.
- **A score is never shown before the alerts query settles.** `severeAlertEvent` answers
  `null` for a query in flight exactly as it does for "no severe alert", and the banner
  renders nothing in that window — so a location under a Severe+ warning shows an
  unsuppressed score with nothing above it. **The gate lives in `summarizeReadings`**,
  which takes `alertsPending` and withholds the number itself; a surface passes the flag
  through rather than deciding. Anything new that renders a score passes it too.
- **A day is tappable on `has_ensemble`, not on a forecast row existing.** `/forecast/:id`
  returns seven days whatever the hourly models reached; these charts draw the ensemble, so
  a day it never reached opens two empty charts. A selected day is also dropped once the
  window stops covering it.
- **`hourly` and its `tabs` are one prop, nested.** Apart, they admit two silent failures:
  hourly data with no tabs renders no charts at all, and tabs with no hourly data offer a
  second tab that can never have anything in it. Neither changes a type.

## Client Mandate — the web app

`apps/miniapp` is a standalone web app and the only client; it runs in an ordinary browser.

- **The locked contrast, layout and copy rules are in `docs/handoffs/design-system-v1.md`.**
- **No hardcoded mock data in production components.** `MOCK_*` constants, `mockXyz()` functions, and bell-curve approximations are stubs that must be replaced before a feature is complete. Stubs are only acceptable during the phase that explicitly introduces them, and must be wired to real data in that phase or the immediately following one.
- **Auth:** the app authenticates with a session token from `POST /api/v1/auth/login`, sent as `Authorization: Session <token>` and held in `localStorage` by `src/lib/authToken.ts`. **A 401 on an authenticated call clears the token** — in `api.ts`, once, for every call — and `RequireAuth` in `App.tsx` redirects on the token being gone rather than on a status it saw. Three things not to reinvent: `apiLogin` is the one **unauthenticated** call and must not clear on its 401, which means a wrong passphrase rather than a dead session; a **503** must not clear either, because it means the server has no signing key and the login screen cannot work; and `expires_at` is **deliberately not stored**, because a client-side expiry check on a device with a wrong clock discards a token it was just issued and bounces to `/login` with nothing to explain it.
- **The query cache is cleared when the token goes**, from a module-scope subscription in `App.tsx` rather than an effect in the component the redirect is unmounting. Two partners on one tablet: the second signs in with their own valid token, nothing 401s, nothing refetches, and the first one's crags stay on the list.
- **`API_SHARED_SECRET` must never reach this bundle**, and nothing about auth is a build-time value. Preview deployments are behind Vercel SSO (`ssoProtection: all_except_custom_domains`), so a preview URL answers 302 to a Vercel login page; turning that off is a security setting and the owner's call.

## Client Patterns
- **Design tokens reach the web through the adapter, never directly.** `packages/design` targets React Native. `colors`, `spacing`, `radius`, `uvScale` and `units` are plain data and are imported straight from `@weatherteam6/design/tokens`; **`type`, `shadow` and `layout` are RN-shaped and must come from `apps/miniapp/src/theme/tokens.css.ts`** — RN's unitless `fontSize`, string `fontWeight`, `shadowColor`/`shadowOffset`/`shadowOpacity`, `flex: 1` and `paddingHorizontal` have no CSS meaning, and `fonts.display` (`'BarlowCondensed'`) matches no CSS family, so it falls back to the system font without saying so. The adapter **derives** every value from an import and never restates a literal — that is what keeps it inside "never redefine colors, spacing, or type scale in an app". A component that hardcodes a hex, a px size, or a font name has broken this rule even if it looks right on screen.
- **The adapter must map every token property, and it is wired to say so.** RN and CSS disagree in ways that render wrong rather than error — CSS flex defaults to `row` where RN defaults to `column`, and `border-width` without `border-style` computes to `0`, so a card silently loses its border. Both are corrected in `boxStyle`. A property with no mapping is a compile error for `type`/`layout`/`shadow` (converted wholesale) and a thrown error for `components` (converted per-entry, where TypeScript's excess-property check does not apply). **Do not "fix" either by widening a type or swallowing the throw** — add the mapping.
- **Browser default margins are reset in `globals.css`, and vertical spacing comes only from tokens.** `<h1>`'s UA margin was adding 20px on top of `spacing.topSafe` and collapsing over `type.screenSub`'s `marginTop` entirely, so the locked layout constants were not what rendered.
- **Token custom properties are emitted once, from the tokens.** `src/theme/cssVars.ts` renders the `:root` block and `vite.config.ts` serves it as `virtual:wt6-tokens.css`. Do not hand-write a `--wt6-*` declaration anywhere else, and do not add a second source of custom properties.
- **The client never asks for a score it must not show.** The model would score a city if asked, so `useConditions` is gated on the location being a climbing location, and the readings section is absent otherwise. Do not "fix" a missing score by relaxing that gate.
- **The sources footer is computed from the response, never written down.** The forecast models come from `model_sources`. A source is omitted rather than guessed when the data is absent — including NWS when the alerts call failed. Naming a source that never ran is a false attribution, which is what the "quote data sources by name" rule exists to prevent.
- **"Today" is whichever row the server flagged `is_today`, and the client must not re-derive it** (issue #33). `findToday` reads the flag. It falls back to a UTC date comparison **only** when no row in the response carries the flag at all, which means a response cached from before the fix; a row that simply has `is_today: false` is a real answer. When nothing matches, the screen says so — it must never fall back to the first row, which relabels tomorrow's numbers as today's.
- **The words and the suppression live in `packages/types/src/readingsCopy.ts`**, because every surface must say the same thing about the same crag. **The words are the two readings themselves, never a phrase derived from the number** — `stateLabel` and `summarizeConditions` were deleted in Phase 3b for exactly that reason, and a ladder must not be reintroduced. **They are labelled fields rather than prose** (`Dryness: Dry`, `Friction: Great`, `Score: 100`): the owner's verdict on the first version was that plain-English readings read as fact. `ScoreChip` was deleted with it — the score is the third gauge in the row, drawn by `ReadingsSection`. Suppression under a Severe+ alert drops the **number** and keeps the readings, which is the reverse of the rule it replaced: the words now come from physics that sees heat, and the number is the part that reads as actionable.
- **A card that is itself a tap target must not be a `<button>`** if anything inside it is interactive. `LocationCard` contains a retry control, and a `<button>` inside a `<button>` is invalid markup the browser reparses, moving the inner control out of the card.
- **React Query** remains the agreed state management layer for server data. No Redux, no Zustand, no Context for server state.
- All API calls go through React Query hooks. Components never call `fetch` directly.
- **The deployed app calls its own address** (`/api/...`, forwarded by `vercel.json`); `VITE_API_BASE_URL` points a development build at an API and a production build ignores it (`config/env.ts`). Two origins cost a CORS preflight per request. Never hardcode an API URL in a component.
- **Back is an in-app control and `backTarget` decides where it goes.** `miniapp-design-v1.md` §2 and §8 once forbade an in-app back arrow, on the assumption of a platform-provided one; there is none in a browser, so this is it, and those rules are overridden. **The per-route back targets in §2 are unchanged**, and one of them is not a navigation: back from the `/add` save form returns to the search with its query and results intact. `lib/backTarget.ts` is pure and **overloaded per route**, so each caller is handed only the actions it can receive and a new action is a type error rather than a back button that silently does nothing. `Screen` renders the control when given `onBack`, and the list passes none — a control that navigates to the screen already showing is the same bug with the destination wrong instead of the count. **A saved location has no back control** since the bottom bar arrived: the lit Conditions tab returns to the list. `sectionFor` (`lib/bottomNav.ts`) decides which section a path is in and hides the bar on `/add`, `/feedback` and a location's editor (`/location/:id/edit`, whose form logic is `lib/editLocation.ts`: only changed fields are sent, a locked rock type never); screens under the bar pad by `navClearance`, the rest by `bottomClearance`.
- **The PWA manifest and `theme-color` are generated from the tokens** by the `wt6-webmanifest` plugin in `vite.config.ts` (source: `src/theme/webManifest.ts`), and the `public/icons/` PNGs by `scripts/generate-icons.mjs`, guarded by the root `check:icons`. None of it may become a static file with a hex in it. **The service worker caches the app shell and nothing else** (`src/theme/serviceWorker.ts`, written into `dist/sw.js` at build): same-origin `index.html` and hashed assets only. It must never intercept the API or serve a reading — a cached forecast on screen is a stale number that looks live. Retire it by shipping an `sw.js` that unregisters, never by deleting the file.
- **The crag screen opens on what the list already has.** `useLocation` is seeded from the `['locations']` cache (same `mapLocation` row), and a card's `pointerdown` runs `prefetchDetail`, which uses the screen's own query definitions and repeats the climbing-only gates because `prefetchQuery` ignores `enabled`. Prefetching every card on load was rejected for upstream cost. **A tapped card opens its crag at once.** Waiting up to 300 ms for the crag's hourly series first (so the screen opened whole) shipped and was removed the same day: the owner found the tap laggy, and prefers a brief grey Today chart (2026-10-01). No screen transition either — the owner turned down fade, rise and slide. `check:ui` asserts the tap opens within 250 ms with the series held back. **The list's first load holds an opening splash** (`Splash.tsx`: the app icon on the manifest background, matching Android's launch screen) until every card's forecast, alerts and conditions have settled, capped at `SPLASH_MAX_MS` (1 s), and never again in that page load — so a cold open shows filled cards, not grey bars (owner, 2026-10-01). The service worker keeps the icon (`SPLASH_ICON`). The cold-open list is `rememberedLocations` as `placeholderData`, never cache data, forgotten with the token. **A reopen draws the cards' weather from `rememberedCards`** (owner decision 2026-10-01): the last forecast, conditions and alerts each card showed, saved on the device once all three were in, and drawn **whole or not at all** until all three live answers settle — never mixed, so a score is never suppressed by one moment's alerts and computed from another's conditions. When every card has one, the splash does not show; the header reads "updated … · refreshing" while any card is drawn from memory. A snapshot from another device-local day or older than `REMEMBERED_CARDS_MAX_AGE_MS` (12 h, a judgement call) is ignored — yesterday's `is_today` would print yesterday as today. Remembered figures are not dimmed (contrast floors); weather that arrives after a card is drawn fades in through `FadeIn`. Prop-passed to `LocationCard`, never cache data; forgotten with the token. `check:ui` holds the weather calls back 3 s and asserts the reopen draws from memory.
