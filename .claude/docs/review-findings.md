# Review findings — Phase B0 `miniapp-design-v1.md`, round 3

Branch: `claude/miniapp-design-b0` (995f1f0, 31d72b2) — local only, unpushed, unmerged.
Round 3 of the review the session notes flag as "cut short by a session limit and did not run."
Rounds 1 and 2 (11 + 13 findings) are already folded into the committed text.

Mandate, from the B0 session-notes gotcha: *"Re-review this document as executable
before building from it."* So these are verifications of the spec's factual claims
against the code at `1f3e9cf`, not prose notes.

**Status: all six applied.** Round 3 is closed — the spec no longer needs re-review
before Task 5/6 build from it. Where each fix landed:

| # | Fixed in |
| --- | --- |
| F1 | §7 rule 4 — carve-out deleted, replaced with an explicit "do not reintroduce" |
| F2 | §5 — new *Silently degraded* subsection; filed as §10.4 |
| F3 | §3 — new display-cap rule ("30+ days"); filed as §10.5 |
| F4 | §5 — new *No score for today* table row |
| F5 | §4 — formatters declared authoritative for rendered text |
| F6 | §6 — wrong reasoning replaced; conclusion unchanged |
| F1 (code) | `liveForecast.ts:120-131` comment + log message corrected |
| F1 (code) | `ScoreInput.currentTempC` marked UNUSED in `packages/types/src/index.ts` |

Verified after the changes: `npm run typecheck` 6/6 tasks, `npm run test` 106/106.

---

## F1 — CRITICAL. §7 rule 4's degradation guard fires on the exact case §7 exists to serve.

**The spec says** (§7 rule 4, second bullet):

> When the forecast feed contains no row for today, `liveForecast.ts` falls back to
> `?? 0` and scores every day at 0 °C, which zeroes `component_temp` while leaving
> `score` non-null. ... Treat `component_temp === 0` **combined with** a `temp_c_max`
> that is absent or above 0 °C as the degradation signature, and fall back to the
> plain ladder label.

**The code says otherwise.** The temperature component is computed from
`input.forecastHighC`, not from `currentTempC`:

- `apps/api/src/lib/scoring/conditionsScore.ts:76` — `const temp = input.forecastHighC`
- `apps/api/src/lib/scoring/liveForecast.ts:163` — `forecastHighC: day.temp_c_max`
  (the real per-day value, inside the `days.map`)

`currentTempC` is assigned at `liveForecast.ts:129`, passed at `:160`, declared at
`packages/types/src/index.ts:83` — and **never read by any scorer.** It is a dead
field. Its only other appearance is a test fixture.

**Consequence — the guard is inverted.** Its stated signature is
`component_temp === 0` AND `temp_c_max` absent or above 0 °C. That is not the
degradation's signature. It is the signature of **Red Rock at 39.5 °C**:
`39.5 > 0`, and `component_temp === 0` because `conditionsScore.ts:77` zeroes any
`temp > 35`. So on the flagship case the guard fires, suppression is skipped, and
the surface prints the plain ladder label — **"Dry, settled" for 103 °F under an
active Extreme Heat Warning.** That is precisely the output §7 was written to
eliminate.

**Fix:** delete the guard entirely. Per F2 the missing-today-row degradation zeroes
no component at all, so there is nothing for it to protect against. Removing it
restores the suppression rule to firing on Red Rock as intended.

**Also fix in code:** the comment at `liveForecast.ts:118-121` asserts the same
falsehood — *"score EVERY day at 0 km/h wind and 0 °C, and 0 °C zeroes the temp
component outright."* That comment (added in b1d9566) is where the spec inherited
the error. Correct it or the next reader re-derives F1.

---

## F2 — HIGH. The real missing-today-row degradation *inflates* the score, and nothing detects it.

When `days.find(d => d.date === todayStr)` returns undefined (`liveForecast.ts:126`),
the actual effects are the opposite of what §7 describes:

| Fallback | Value | Effect on score |
| --- | --- | --- |
| `currentWindKmh ?? 0` (`:128`) → `maxWindKmh24h` (`:159`) | `0` | `conditionsScore.ts:69-70`: `<= 15` gives `windRaw = 15`. **Full 15/15 marks.** |
| `currentHumidityPct ?? 50` (`:130`) | `50` | `conditionsScore.ts:81-82`: `<= 50` gives `humidityRaw = 8`. **Full 8/8 marks.** |
| `currentTempC` (`:129`) | `0` | Dead — never read (F1). |

Secondary: `currentWindKmh = 0` also fails the `> 20` test at `conditionsScore.ts:54`,
so the drying model loses its wind bonus — a mild *penalty*, the only one.

So the degradation produces a **silently inflated score with every component
non-zero**. A suppression rule keyed on zeros cannot see it, and no §5 state covers
it. The spec currently guards against a fiction while the real failure ships
unlabelled.

**Fix:** §5 needs a degraded-data row, keyed on something the API actually exposes.
Note that today it exposes nothing — the warning is server-side only, so the client
cannot detect this at all. That may itself be the finding: either accept it as a
known blind spot in writing, or make it an API change and say so.

---

## F3 — HIGH. A failed rainfall fetch fabricates "no rain in 720h" at high confidence.

`liveForecast.ts:96-104` catches an ACIS / Open-Meteo-archive failure and leaves
`rainfallEvents = []`. `dryingModel.ts:39-46` maps empty input to:

```
hours_since_significant_rain: 720   // NO_RECENT_RAIN_HOURS, dryingModel.ts:34
last_rain_mm: 0
estimated_dry: true
confidence: 'high'
```

`720 >= maxDry` for every rock type, so `conditionsScore.ts:47` awards the **full
40/40 drying component**.

This collides with two decisions in the spec:

- **§3** makes *"hours since rain"* a hero value on the detail screen.
- **§7's rewritten bot reply** prints `no rain in 72h`, sourced from
  `breakdown.drying.hours_since_rain`.

So an upstream outage renders as a confident factual assertion that it has not
rained in 30 days, next to a maxed drying score and `confidence: high`. This is the
same class of defect as the one §7 rule 4 was written to prevent — a data failure
presented as weather — and the spec does not cover it. It is arguably worse, because
`estimated_dry: true` and `confidence: 'high'` actively assert reliability.

**Fix:** either `dryingModel` gains a distinguishable no-data result, or §5 gains a
row and §3/§7 stop printing `hours_since_rain` as a bare fact. The first is an API
change; the second is not.

---

## F4 — MEDIUM. `/conditions/:id` returns `200 { data: null }`, which no section handles.

`apps/api/src/routes/conditions.ts:45-52`:

```ts
const todayScore = scores.find((s) => s.forecast_date === today) ?? null
const response: ApiResponse<ConditionsScore | null> = { data: todayScore, error: null, status: 200 }
```

§7's ladder maps a null **`score`** to *"Too far out to score."* Here the entire
`ConditionsScore` object is null. Two problems:

1. A builder following §7 literally writes `label(data.score)` and throws on `null`.
2. Even guarded, the copy is wrong. This state is reachable via the F2 path — a
   forecast that starts tomorrow — not because the date is beyond the scoring
   window. Telling the user "too far out to score" about *today* is false.

**Fix:** §5 gains a row distinguishing "no conditions row for today" from "score is
null because the day is unscored." They must not share copy.

---

## F5 — MEDIUM. §4 relocates unit labels it says stay in `packages/design`.

§4's formatters hardcode `°F`, `mph`, `%`, and `in` inside
`packages/types/src/units.ts`, while the same section states:

> The unit *labels* stay in `packages/design`'s `units` export ... the *math* lives
> with the shared contracts.

`packages/design/src/tokens.ts:607` does define exactly those strings
(`temperature: '°F'`, `speed: 'mph'`, `precipitation: 'in'`). And `packages/types`
cannot import `packages/design` — §4's own argument for the split forbids it. So the
labels are duplicated in two packages and `design.units` becomes dead for text
output, which is the "never redefine" rule the spec elsewhere enforces carefully.

**Fix:** pick one. Either the formatters return unitless strings and the client
appends the label from `design.units`, or §4 drops that sentence and declares
`design.units` superseded for rendered text.

---

## F6 — LOW. §6's claim that the 7–14 day window "never renders" has a reachable exception.

§6 is binding that only the `<7 days` treatment is reachable, because the detail
screen shows 7 days. But `forecastDateDaysOut` is measured from *today*
(`liveForecast.ts:134-137`), not from the first forecast row. On the F2 path — a
feed starting tomorrow — the seven rows run `daysOut` 1..7, and the last one hits:

- `conditionsScore.ts:31` — `window = 'early'`
- `conditionsScore.ts:22` — `confidence = 'low'` (`daysOut >= 7`)

So the 7–14 day branch is reachable, and §6 instructs the builder not to implement
it. Low severity — one row, degraded path — but §6 currently reads as a guarantee.

---

## Appendix — claims verified as correct (do not re-check in round 4)

| Spec claim | Verified at |
| --- | --- |
| `SCORE_COMPONENT_MAX` = drying 40 / rain 25 / wind 15 / temp 12 / humidity 8 | `packages/types/src/index.ts:169` |
| Zeroed temp caps at 88; drying+rain alone worth 65 | 40+25+15+8 = 88; 40+25 = 65 |
| `temp > 35` gives 0, saturating (96 °F identical to 130 °F) | `conditionsScore.ts:77` |
| `ForecastSnapshot` fields nullable; no `ForecastDay` type | `packages/types/src/index.ts:39-54` |
| Scoring is additive with no veto | `conditionsScore.ts:97` |
| `score: null` only when `window === 'pre'`, all components 0 | `conditionsScore.ts:40-46` |
| types `exports` has only `"."` — `@weatherteam6/types/units` won't resolve | `packages/types/package.json` |
| NodeNext, so `export * from './units.js'` is the correct form | `tsconfig.base.json`; `packages/design/src/index.ts` already does this |
| types already ships runtime code (`aspectToDegrees`, `parseNumeric`, …) | `packages/types/src/index.ts:143-176` |
| `fonts.display = 'BarlowCondensed'` — no space, won't match CSS family | `tokens.ts:100-105` |
| `type` uses unitless `fontSize`, `fontWeight` string, `letterSpacing` in points | `tokens.ts:107-125` |
| `layout` is RN-only (`flex`, `paddingHorizontal`) | `tokens.ts:570-589` |
| `bottomNav` declares 4 tabs — Home, Crags, Trips, Radar | `tokens.ts:594-604` |
| screenH 20 / topSafe 48 / cardPad 14 / bottomInset 24 | `tokens.ts:279-313` |
| txt1 `#f0f4f8`, card `rgba(255,255,255,0.07)`, onGood `#0d1117`; no light set | `tokens.ts:15-70` |
| tokens.ts header says `Target: React Native` | `tokens.ts:5` |
| `statusLabel()` maps score to opinion; `>= 80` gives "looks great — go climb" | `conditionsReply.ts:6-12` |
| Bot not-found copy says "Save it in the app first." | `conditionsReply.ts:33` |
| Unescaped HTML interpolation under `parse_mode: 'HTML'` | `conditionsReply.ts:38`, `checkAlerts.ts:115`, `sendMessage.ts:23` |
| `/conditions/:id` keeps only today; `/forecast/:id` returns scoreless snapshots | `routes/conditions.ts:45`, `routes/forecast.ts:55-61` |
| Both routes call `computeLiveForecast` — six upstream fetches per detail screen | same |
| `/normals` and `/history` exist as `/locations/:id/{normals,history}` | `routes/locations.ts:190,236` |
| `packages/design` has a `./tokens` subpath export (types does not) | `packages/design/package.json` |
