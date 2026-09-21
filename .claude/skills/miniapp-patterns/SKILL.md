---
name: miniapp-patterns
description: Client patterns and invariants for the WeatherTeam6 Telegram Mini App (apps/miniapp) — the design-token adapter, Telegram theming and capability gating, deep links, React Query rules, null-safe formatting, score suppression and the is_today flag. Use when writing, reviewing or changing anything under apps/miniapp, or any packages/design token consumed by it.
paths: apps/miniapp/**, packages/design/**
---

# Mini App Patterns

> Extracted from `.claude/rules/architecture.md` on 2026-08-26. These rules were
> always-loaded prose costing ~2,000 tokens in every session, including the many that
> never touch the Mini App. They are unchanged in substance and still binding — they now
> load when you actually open a file they govern.

**Current scope note — revised 2026-09-15.** The 2026-08-26 downgrade (*"the Mini App
doesn't need to be super fancy"*) was **reversed by the owner on 2026-09-04**; the Mini App
data visualisation is the active line of work and Phase 2's charts shipped on 2026-09-15.
What is still true is the mechanism: the app is styled entirely with **inline styles**,
which cannot express hover, transitions, keyframes or breakpoints. That ceiling is real and
it is why the charts carry no hover layer. **Starting a CSS or motion architecture is still
not authorised** — that is a separate decision from drawing charts, and Phase 5 of
`docs/handoffs/miniapp-hourly-dataviz-handoff-v1.md` is where it gets settled.

## Charts (`apps/miniapp/src/components/charts/`)

Inline SVG, no chart library — `miniapp-design-v1.md` §8. Shipped 2026-09-15. The rules
below are the ones that are wrong-but-plausible if broken, which is the only kind worth
always-loading:

- **A rain bar covers the hour *before* its timestamp.** Precipitation is stamped at the end
  of the hour it fell in, so an 02:00 sample describes 01:00-02:00 — the same convention the
  bot's `buildRows` follows. Drawing it forward moves every shower an hour later and nothing
  typechecks differently.
- **Two different things break a series, and both are real gaps**: a null value, and a
  missing row. An hour with no values at all is never stored, so its absence is a two-hour
  step between two good rows. `contiguousRuns` takes an adjacency predicate for that.
- **A one-point path paints nothing.** `M x,y` with no line command is invisible at any
  stroke width, so `linePath` returns `''` and the caller draws a dot. Same family as a
  `NaN` coordinate, which is why `extent` skips non-finite values and `linearScale` answers
  a zero-width domain with the middle of the range.
- **A zero-height bar and an absent bar are the same picture**, so the rain baseline runs
  only under hours that have a reading. That line is what separates "no rain" from "no
  forecast".
- **Values stay in the API's metric units; only the formatter converts.** Converting in the
  adapter forces every threshold to be restated in the other unit.
- **Labels describe the series, not the band around it.** The domain must cover p10-p90 or
  it clips, but labelling its outer edge prints one member's worst hour as the forecast.
- **The ensemble size is quoted only when every hour reported the same one** — the far end
  of the window is reached by fewer members.
- **`good`, `fair` and `poor` are the conditions ladder's status colours and are not
  available for data marks.** Temperature uses `sun`; rain uses the `radar*` intensity ramp.
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

Added by Phase 3 (2026-09-14), same test — wrong-but-plausible if broken:

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
  and "no forecast" different pictures. It replaced a run-length baseline: a per-hour stub
  says which *hours* were measured, where a line under a run only said where the run was.
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
  `packages/types`, which `conditionsScore.ts` also reads.** Copy the band into a component
  and the chart will eventually paint an hour neutral on a day the score docked for being
  too warm, with nothing able to detect the disagreement. `SCORE_BANDS` is the same
  arrangement for the daily score bar, whose rungs are the same ones.
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
- **The daily rows' bar scale is shared by all seven.** Normalising each row to its own
  min/max draws the identical bar on every row whatever the values are — a chart that
  cannot be wrong. Score is a **fixed** 0-100, because its scale is defined rather than
  measured.
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
  unsuppressed score with nothing above it. Both the score section and the now-line's chip
  gate on `isPending`; anything new that renders a score must too.
- **A day is tappable on `has_ensemble`, not on a forecast row existing.** `/forecast/:id`
  returns seven days whatever the hourly models reached; these charts draw the ensemble, so
  a day it never reached opens two empty charts. A selected day is also dropped once the
  window stops covering it.
- **`hourly` and its `tabs` are one prop, nested.** Apart, they admit two silent failures:
  hourly data with no tabs renders no charts at all, and tabs with no hourly data offer a
  second tab that can never have anything in it. Neither changes a type.
## Client Mandate — Telegram Mini App

**Direction changed 2026-07-31.** WeatherTeam6 was a native-mobile-first app; it is now a **Telegram bot + Telegram Mini App**. `apps/mobile` is being archived (Crossover Task 7) — its code stays in the repo but leaves the build. The old Mobile-First Mandate (never use WebView, `react-native-maps` for every map, native `.tsx` always real) is **superseded** and no longer applies. See `docs/handoffs/telegram-crossover-v4.md`.

- **The Mini App is the client.** `apps/miniapp` (Vite + React, static build) is the real, complete implementation of every user-facing screen. There is no second client to keep in parity.
- **Do not add features to `apps/mobile`.** It is archived. If something there is worth keeping, port it into the Mini App rather than reviving the app.
- **`apps/mobile` leaves the build through its own `package.json`, not `turbo.json`.** Turbo runs whatever scripts a workspace member declares, so a package with no `build` script is skipped and a `turbo.json` task override cannot silence one that exists — the old `@weatherteam6/mobile#build` override only zeroed the task's *outputs* while `tsc --noEmit` kept running. If mobile ever reappears in a task graph, look at its scripts. See `apps/mobile/ARCHIVED.md`.
- **Design tokens come from `packages/design`.** Do not redefine colors, spacing, or type scale in the Mini App. The locked contrast, layout, and copy rules in `docs/handoffs/weatherteam6-ui-handoff-v1.md` §Design System still apply — they are client-agnostic.
- **Telegram theming.** The Mini App reads `themeParams` and must be legible in the user's own Telegram theme. How that reconciles with the locked palette is settled in the Mini App design spec — do not improvise it per-component.
- **No hardcoded mock data in production components.** `MOCK_*` constants, `mockXyz()` functions, and bell-curve approximations are stubs that must be replaced before a feature is complete. Stubs are only acceptable during the phase that explicitly introduces them, and must be wired to real data in that phase or the immediately following one.
- **Auth (shipped 2026-08-26):** the Mini App authenticates via `Telegram.WebApp.initData` validated server-side by HMAC, as route-level middleware on `/api/v1/*` — see § Backend Patterns for the invariants. The bot token never reaches the client bundle. It is a **second accepted scheme on the same `Authorization` header**, added alongside `API_SHARED_SECRET` and never replacing it. **There is no Vercel SSO to remove and it must not be removed:** SSO covers preview deployments only, and the production alias already answers unauthenticated requests with our own Express 401 (verified 2026-08-25). The "ship it together with removing SSO" instruction that used to live here was based on a false premise; see the corrected sequencing note in `.claude/docs/plan.md`.

## Client Patterns (Mini App)
- **Design tokens reach the web through the adapter, never directly.** `packages/design` targets React Native. `colors`, `spacing`, `radius`, `uvScale` and `units` are plain data and are imported straight from `@weatherteam6/design/tokens`; **`type`, `shadow` and `layout` are RN-shaped and must come from `apps/miniapp/src/theme/tokens.css.ts`** — RN's unitless `fontSize`, string `fontWeight`, `shadowColor`/`shadowOffset`/`shadowOpacity`, `flex: 1` and `paddingHorizontal` have no CSS meaning, and `fonts.display` (`'BarlowCondensed'`) matches no CSS family, so it falls back to the system font without saying so. The adapter **derives** every value from an import and never restates a literal — that is what keeps it inside "never redefine colors, spacing, or type scale in an app". A component that hardcodes a hex, a px size, or a font name has broken this rule even if it looks right on screen.
- **The adapter must map every token property, and it is wired to say so.** RN and CSS disagree in ways that render wrong rather than error — CSS flex defaults to `row` where RN defaults to `column`, and `border-width` without `border-style` computes to `0`, so a card silently loses its border. Both are corrected in `boxStyle`. A property with no mapping is a compile error for `type`/`layout`/`shadow` (converted wholesale) and a thrown error for `components` (converted per-entry, where TypeScript's excess-property check does not apply). **Do not "fix" either by widening a type or swallowing the throw** — add the mapping.
- **Browser default margins are reset in `globals.css`, and vertical spacing comes only from tokens.** `<h1>`'s UA margin was adding 20px on top of `spacing.topSafe` and collapsing over `type.screenSub`'s `marginTop` entirely, so the locked layout constants were not what rendered.
- **Token custom properties are emitted once, from the tokens.** `src/theme/cssVars.ts` renders the `:root` block and `vite.config.ts` serves it as `virtual:wt6-tokens.css`. Do not hand-write a `--wt6-*` declaration anywhere else, and do not add a second source of custom properties.
- **Every `--tg-*` reference needs a fallback value.** Not all Telegram clients inject them, and CSS drops the entire declaration when a `var()` resolves to nothing — a bare `padding-top: var(--tg-safe-area-inset-top)` silently loses the padding. Always `var(--tg-safe-area-inset-top, 0px)`, `var(--tg-viewport-stable-height, 100dvh)`.
- **The app must render with no Telegram SDK present.** `getWebApp()` returns `null` in a plain browser and when `telegram-web-app.js` fails to load. Every caller handles that — otherwise the Mini App cannot be developed or debugged outside Telegram.
- **Telegram capability checks are per-method, not one version gate.** `setBackgroundColor` takes a hex from Bot API 6.1; `setHeaderColor` takes one only from 6.9, and its pre-6.9 `bg_color` keyword resolves to the *user's* theme background — white on a light theme, the exact flash the call exists to prevent. Gate each call at its own floor and accept the default rather than shipping a wrong colour.
- **An input that could not be measured withholds the score; it never scores as a favourable value** (issue #34). `computeLiveForecast` tracks whether the rainfall lookup *succeeded*, not merely whether it returned rows, and returns `scores: []` plus `scoreUnavailable: 'rainfall_unavailable'` when it failed. `dryingModel` cannot tell a failed fetch from a dry month — both produce the 720-hour sentinel, worth **40 of 100 points** — so swallowing the error made an upstream outage *raise* the score. The weather is unaffected and still returned in full. **A genuinely empty result still scores**: the distinction is "the call failed", not "the call returned nothing".
- **A withheld score and an absent one are different answers and must read differently.** `ConditionsScore.unavailable_reason` carries the first; `data: null` from `/conditions/:id` remains the second ("no row for today"). The copy for both lives in `packages/types` (`scoreUnavailableLine`) so the bot and the Mini App cannot drift.
- **The client never asks for a score it must not show.** `computeLiveForecast` does not branch on `is_climbing_location` — `GET /conditions/:id` returns a rock-drying score for a city if asked. `useConditions` is therefore gated on the location being a climbing location, and the score section, the score chip and hours-since-rain are all absent otherwise. Do not "fix" a missing score by relaxing that gate.
- **The sources footer is computed from the response, never written down.** The forecast models come from `model_sources` (which is `['nbm']` or the ensemble list, depending on what actually ran) and the rainfall branch from whether the location has an `asos_station`. A source is omitted rather than guessed when the data is absent — including NWS when the alerts call failed. Naming a source that never ran is a false attribution, which is what the "quote data sources by name" rule exists to prevent.
- **"Today" is whichever row the server flagged `is_today`, and the client must not re-derive it** (issue #33, fixed 2026-08-26 — `todayUtcIso` is deleted). `findToday` reads the flag. It falls back to a UTC date comparison **only** when no row in the response carries the flag at all, which means a response cached from before the fix; a row that simply has `is_today: false` is a real answer. When nothing matches, the screen says so — it must never fall back to the first row, which relabels tomorrow's numbers as today's.
- **The words and the suppression live in `packages/types/src/readingsCopy.ts`**, because the bot and the Mini App must say the same thing about the same crag. **The words are the two readings themselves, never a phrase derived from the number** — `stateLabel` and `summarizeConditions` were deleted in Phase 3b for exactly that reason, and a ladder must not be reintroduced. Suppression under a Severe+ alert drops the **number** and keeps the readings, which is the reverse of the rule it replaced: the words now come from physics that sees heat, and the number is the part that reads as actionable.
- **A card that is itself a tap target must not be a `<button>`** if anything inside it is interactive. `LocationCard` contains a retry control, and a `<button>` inside a `<button>` is invalid markup the browser reparses, moving the inner control out of the card.
- **React Query** remains the agreed state management layer for server data. No Redux, no Zustand, no Context for server state.
- All API calls go through React Query hooks. Components never call `fetch` directly — the same rule that applied to `apps/mobile/src/hooks/`, now in `apps/miniapp`.
- No hardcoded API base URLs — use build-time env config (`VITE_API_BASE_URL`).
- Navigation is the Mini App's own routing, integrated with Telegram's `BackButton`. The `startapp` deep-link parameter lands directly on location detail — shipped 2026-08-26, `src/lib/deepLink.ts`.
- **The deep link seats two history entries, list first, and does it before React mounts.** `applyDeepLink` runs from `main.tsx`, not an effect: `replaceState('/')` then `pushState('/location/:id')`. Pushing only the detail entry leaves it first in the stack, so the platform back gesture closes the Mini App instead of revealing the list — that is the acceptance criterion for the whole feature. Running it pre-mount also means `BrowserRouter` reads the detail route as its initial location (no list flash) and a `<StrictMode>` double-invoked effect cannot push the entry twice.
- **A deep-link parameter is validated, never repaired.** `loc_<uuid>` with the dashes exactly as they arrived; anything failing the UUID test returns `null` and the app boots on `/` silently. Stripping and reinserting dashes at fixed offsets turns a corrupted parameter into a well-formed but *wrong* UUID, which reaches the API and 404s instead of falling back to the list. **Never render an error for a bad deep link.**
- **The parameter has two sources, in a fixed order:** `initDataUnsafe.start_param` first, then the `tgWebAppStartParam` launch parameter (looked for in the query string and the hash, because Telegram has delivered its `tgWebApp*` parameters in the fragment too). The second source is also how the path is exercised in a plain browser, where `getWebApp()` is `null`.

## Archived — Mobile Patterns (no longer in force)
Kept for context while `apps/mobile` remains in the repo. Do not apply these to new work.
- React Query hooks in `apps/mobile/src/hooks/`; components never called fetch directly.
- Expo SDK version was not to be changed without explicit approval.
- Expo Router was the agreed navigation library; file-based routing under `apps/mobile/app/`, screens as files, layouts as `_layout.tsx`; no imperative navigation outside the `router` API.

