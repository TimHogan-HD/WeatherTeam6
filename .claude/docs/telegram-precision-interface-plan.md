# A precision weather interface in Telegram

## Context

The bot is the only surface reachable without opening the Mini App, and today it is barely an
interface: [`telegramWebhook.ts`](../../apps/api/src/routes/telegramWebhook.ts) handles `/start` and
`/conditions <name>`, both requiring a typed location name, and **cannot receive a button tap
at all** — it reads `update.message` only, and
[`sendMessage.ts:11-16`](../../apps/api/src/lib/telegram/sendMessage.ts#L11-L16) narrows
`InlineKeyboardMarkup` to url buttons on purpose.

The product decision driving this work: **the Mini App is the snapshot, the bot is the
instrument.** Deep interactive UI for dense meteorological data is expensive to build in the
Mini App and unnecessary when a chat surface can carry it better. The target is SpotWX-class
precision — model-explicit, hourly, variable-rich — not a glanceable summary.

**Nothing is built.** Build order is settled; each phase is a separate approval.

---

## What the research changed

Findings that altered the design, with the evidence behind them.

**The Bot API is four major versions ahead of this repo's assumptions.** Rich Messages
(10.1, June 2026) introduce `RichBlockTable` — a real styled table with per-cell styling,
`is_bordered` / `is_striped` / `is_compact` and a caption. *(Corrected 2026-08-31: this
paragraph used to say "rendered natively on mobile, desktop and web". The reference
defines the request, not the rendering, and which clients draw it is precisely the open
question — see § What the probes changed.)* 10.3 (24 Aug 2026) added `RichBlockExpandableBlockQuotation` for collapsible
sections, `DisabledButton`, and `can_stop` / `keep_on_stop` on `sendMessageDraft`. **Editing
survives** — this one is verified against Telegram's own changelog, which adds *"the parameter
`rich_message` to the method `editMessageText`, allowing bots to edit rich messages"*.

**But client support is unverified, and it is the reason Probe B exists.**

> **Status after Probe B run 1 (2026-08-31): claim 2 is disproven, claim 1 is half open.**
>
> 1. Telegram **Web** renders an *unsupported message* card for rich messages, and some
>    Desktop builds error rather than degrade. — **Desktop is disproven**: it renders a
>    real table. **Web is still unobserved**, so the claim stands for web alone.
> 2. The widely-reported "editing destroys rich formatting" behaviour is a **client-library**
>    bug rather than an API limitation. — **Disproven on phone and desktop.** The same
>    message id, edited via `editMessageText` with `rich_message`, came back a table.
>
> The original wording of this box is kept below because it is why the probe exists.
>
> **The only sources found for either are the issue tracker of `NousResearch/hermes-agent`,
> an LLM-agent project — not Telegram, not a Telegram client, not a Bot API library.** They
> are second-hand reports about someone else's integration. They may be wrong, out of date,
> or specific to that codebase. Nothing in Telegram's own documentation was found that
> confirms or denies either.
>
> Claim 1 is exactly the kind of "attribution not backed by the data" this repo keeps
> shipping (defect class 3). It is recorded because it is a plausible risk worth spending
> half a day to rule out — **not** because it is established.

Because claim 1 might be true, `<pre>` monospace ships first and rich tables stay an opt-in
upgrade gated on **Probe B testing the real clients**. If Probe B shows rich messages render
cleanly everywhere, that is the evidence, and this box gets deleted.

~~**`DisabledButton` improves a decision we had already made.**~~ *(Withdrawn 2026-08-31 by
Probe B run 1: the API accepts `disabled`, and phone and desktop both draw the button
exactly like an enabled one. It cannot say "HRRR exists and does not reach here", so the
model that is absent gets a labelled non-button row instead. Omitting it remains
forbidden.)*

**The NWS Area Forecast Discussion is free, keyless, and the key for it is already stored.**
`api.weather.gov/products/types/AFD/locations/{office}` returns the local forecaster's own
written discussion — including where they think the models are wrong — and `locations.nws_office`
is already a column. Mountain-forecasting practice explicitly recommends reading the AFD for
exactly the uncertainty `/insight` computes. It is the one thing raw model output cannot give.

**Pressure tendency is the leading indicator.** A 3 mb fall over 3 h precedes weather by 12–24 h,
before cloud, wind or precipitation move. Computable from `surface_pressure`.

**Model agreement can be drawn in text.** meteoblue encodes agreement as bar density — darker
means more models predicting that amount. Unicode block characters (`▁▂▃▄▅▆▇█`) carry the same
information inside a `<pre>` block with no API dependency at all.

**Two independent confirmations of choices already made:** keep `callback_data` short and hold
state in the database behind a short id; and **10+ button rows push message content off
screen**, which is why the panel now has a Simple/Advanced mode toggle — the pattern Trojan
uses and the reason its interface is cited as good.

---

## What the probes changed

Measured, not assumed — every line traces to `.claude/docs/model-matrix.md` or
`.claude/docs/telegram-render.md`.

**`precipitation_probability` is not the selected model's field.** Under
`ncep_hrrr_conus` it runs 276 h against a 54 h model and is byte-identical to
`ncep_nbm_conus`'s series; under `gem_seamless` it runs 384 h against a 255 h model. A
per-model table must not print it in a column headed with that model's name — that is
exactly the attribution defect this repo keeps shipping. `/rain`'s probability comes
from the ensemble members crossing a threshold, as already specified.

**NBM has no pressure.** It defines `surface_pressure` and `pressure_msl` and returns
384 nulls for both, so pressure tendency cannot come from NBM at all, and a null there
renders as a plausible `0 mb` if nothing checks.

**No model run time is exposed.** The response carries `generationtime_ms` — how long
Open-Meteo spent answering — and nothing else resembling an initialization time. Headers
therefore say *fetched 14:05Z*, never *12Z run*. That was Phase 0's stated condition and
it is now decided.

**Coverage is a 400, not nulls.** Outside CONUS both `ncep_hrrr_conus` and
`ncep_nbm_conus` reject the whole request with `No data is available for this location`.
That is the signal the model row's enabled/disabled state is built from, and it costs
one request per model to learn.

**The ensemble is confirmed at 143 members** — ECMWF 51, ICON 40, GFS 31, GEM 21, over a
168 h horizon, matching `ENSEMBLE_MODEL_SUFFIXES`.

**The Rich Messages API is real and does support editing.** `sendRichMessage`,
`InputRichBlockTable` with `is_bordered` / `is_striped` / `is_compact`,
`expandable_blockquote`, `InlineKeyboardButton.disabled`, and `rich_message` on
`editMessageText` are all verified against Telegram's own reference, and all ten
specimens were accepted by the live API on the real bot.

**Rich tables render, and they survive an in-place edit — on phone and desktop.**
Specimen 7 re-rendered the *same message id* as a table with new values. Claim 2 above
is false on both clients tested. **Web has not been looked at**, so `<pre>` still ships
first and the box stays until it has been.

**`DisabledButton` does not work as the plan assumed.** The API accepts it; both clients
draw it identically to an enabled button. It cannot say "HRRR exists and does not reach
here", so Phase 1 states that in a **labelled non-button row** instead — omitting the
model is still forbidden.

**Rich blocks need no HTML escaping** — `&` and `<>` passed through intact, because
blocks are structured JSON rather than markup. The `<pre>` path still needs
`escapeTelegramHtml`. Two paths, two rules.

**Width is not the constraint it was assumed to be.** Nine columns fit on the phone with
no wrapping and no horizontal scroll, so Phase 3's column sets are not forced down to
five by the device.

---

## What it looks like

One panel message, edited in place. Simple mode by default; Advanced reveals the rest.

```
Red Rock · HRRR · 3-hourly
Thu 28 Aug · fetched 14:05Z

 HH  temp  dew   wind    cld
 12   95F  35F  SW12g21  20%
 15  103F  31F  SW14g26  40%
 18   98F  33F   S11g19  70%
 21   86F  35F   S 8g14  85%

Pressure 1014mb, falling 3.2mb/3h

Rain odds · 143 members
3h steps · Thu 00 → Sat 00
 ▁▁▁▂▃▅▇█▇▅▃▂▁▁▁▁

Cached 14m ago

[ ◀ Wed ][ Thu ][ Fri ▶ ]
[ GFS ][ HRRR ][ ECMWF ][ ICON ]
[ ⚙ Advanced ][ 🔄 ][ 📍 ]
```

---

## Settled decisions

| Area | Decision |
| --- | --- |
| Interaction | One panel message, edited in place |
| Models | Deterministic per-model tables **and** the 143-member ensemble for spread |
| Model set | GFS, ECMWF, ICON, GEM globally; HRRR and NBM where CONUS coverage exists |
| Model buttons | **Derived from coverage.** No data → a labelled non-button row saying the model does not reach the point, never omitted. **Not** `DisabledButton`: Probe B run 1 showed both clients draw it identically to an enabled button |
| Rendering | **`<pre>` monospace, and that is now the answer, not a first step.** `RichBlockTable` cleared phone and desktop in Probe B run 1, edit-in-place included, but the web check was declined — adopting it would assert something about an untested client |
| Panel controls | Simple mode default (day, model, refresh); Advanced adds interval, columns, units |
| Data surfaces | Pure meteorology — no conditions score, no state label, no drying |
| `/insight` | Computed statistics only. **No generated prose** (spec §9) |
| Human forecast | NWS AFD via `/afd`, referenced from `/insight` |
| Variables | Existing six, plus wind gusts, wind direction, cloud cover, precip probability, **surface pressure + computed 3h tendency**. Freezing level and per-level cloud are out. **Probe A: precip probability is not per-model and NBM carries no pressure — neither is labelled with the table's model** |
| Persistence | Runs persisted: raw JSON + parsed rows. 14 days parsed, 48h raw |
| History writer | `/api/cron/*` over saved locations, plus write-on-read for ad-hoc points |
| Panel state | Short state row in the DB, 8-char id in the button |
| Time frames | Buttons, relative shorthand (`48h`, `3d`), and natural-language dates |
| Date parsing | Resolve forward; **always echo the resolved date** |
| Units | Imperial default per §4, with a toggle |
| Notifications | Read-only. No trend pushes |

---

## Command surface

| Command | Does |
| --- | --- |
| `/forecast [place] [interval]` | Per-model table, one day per screen |
| `/rain [place] [window]` | Probability, accumulation p10/p50/p90, timing, time since last rain |
| `/insight [place] [when]` | Model disagreement, ensemble distribution, run-to-run trend, lead-time confidence |
| `/afd [place]` | The local NWS forecaster's discussion, by section |
| `/weather <place>` | Any point on earth via geocoding, no save required |
| `/conditions [place]` | The existing climbing reply — unchanged in substance |
| `/locations`, `/alerts`, `/remove` | Picker, active alerts, delete behind a confirm |
| `/help`, `/start` | Reference and root panel |

Registered via `setMyCommands` from one `BOT_COMMANDS` constant that `/help` also renders.

---

## Phases

### Phase 0 — Probe. Two probes, both throwaway, both first.

> **Status, 2026-08-31.** Both scripts are written and both output documents exist.
> **Probe A is complete** — `.claude/docs/model-matrix.md` is a real measurement, and it
> already contradicts two assumptions below (see § What the probes changed).
> **Probe B is half-complete**: `.claude/docs/telegram-render.md` §1 is the verified API
> surface, but §2 — what the clients actually draw — needs the bot token and three real
> clients, so it is the one thing still outstanding. `<pre>` ships either way, so Phase 1
> is not blocked on §2; the *rich upgrade* is.

**Probe A — Open-Meteo.** `apps/api/src/scripts/probeModels.ts`: for each seeded location plus
one European point, request every candidate model and variable and record **what actually comes
back** — which models return arrays, each horizon's length, whether gusts / cloud / precip
probability / pressure exist per model, and whether run initialization time is exposed at all.

Not optional caution. This repo shipped `fetchNBM` requesting `precipitation_p10/p50/p90` —
daily variables Open-Meteo **does not define under any name** — so the branch never once
returned data and warned on every request for months (defect class 9).

**If run time is not exposed, headers say "fetched 14:05Z", never "12Z run".**

**Probe B — Telegram rendering.** Send yourself one rich table, one expandable blockquote and
one disabled button, then look at all three on phone, desktop and web. Rich Messages are ten
weeks old and Web is reported to show an unsupported-message card.

Both outputs commit to `.claude/docs/model-matrix.md` and `.claude/docs/telegram-render.md`,
and every model, variable and rendering constant traces to a line in them.

### Phase 1 — Interaction layer

> **Status, 2026-08-31: built and merged.** Everything below shipped, with three
> deviations, each deliberate:
>
> - **`panel_states` columns are `interval_hours` and `column_set`**, not `interval` and
>   `columns`. Both of the plan's names are Postgres keywords that only work quoted.
> - **The state row lifecycle carries `model`, `interval_hours`, `column_set`, `day_offset`,
>   `lat`, `lon` and `place_name` but nothing reads them yet.** They are Phase 2–5's, and
>   they are in the table now so the migration is not run twice.
> - **`prunePanelStates()` rides along on `/api/cron/check-alerts`** rather than getting its
>   own route. A new route needs a new cron-job.org registration, which is a task for the
>   user; the 7-day retention rule is real this way and moves to `/api/cron/prune-runs`
>   when Phase 2 adds it.
>
> Not verified: nothing has driven this from a real device, and
> `npm run check:panel-state` needs a `DATABASE_URL` — **the migration is unapplied**, so
> every panel command fails until `npm run db:migrate` runs.

- **`sendMessage.ts`** — widen the button type to a two-arm union, each arm closing the other
  with `?: never` (TypeScript's excess-property check against a union otherwise permits both
  `url` and `callback_data`, which Telegram answers with a 400). Extract the retry loop into
  `callTelegram(method, body, tolerate?)`; add `editTelegramMessage` and `answerCallbackQuery`.
  `sendTelegramMessage` keeps its signature — `sendMessage.test.ts` and `notifyPendingAlerts`
  depend on it.
- **`callbackData.ts`** (new, pure) — `<verb>:<stateId>:<field>=<value>`, ~20 bytes, well inside
  the 64-byte ceiling. `encodeAction` returns `null` when it cannot produce a valid value and
  row builders drop the button — the *omit, never approximate* rule
  [`alertKeyboard`](../../apps/api/src/lib/telegram/deepLink.ts) already follows.
- **`commands.ts`** (new, pure) — bounded parsing
  (`/^\/([A-Za-z0-9_]{1,32})(?:@[\w]{1,32})?(?:\s+(.*))?$/`), accepting the `@botname` suffix.
  The shipped `startsWith('/conditions')` matches `/conditionsfoo` and would permanently shadow
  a future `/conditionshistory`.
- **`panelState.ts`**, **`panels.ts`** (new) — state row lifecycle, and `{ text, keyboard }`
  builders with the Simple/Advanced split.
- **`telegramWebhook.ts`** — dispatch `message` **and** `callback_query`.
- **`setBotCommands.ts`** + a `bot:set-commands` npm script. Deliberately not `check:*`: CI runs
  every root-level `check:*` script and this one mutates the live bot registration.

Ships `/locations`, `/conditions`, `/alerts` on the new machinery. No new data yet.

### Phase 2 — Data layer

- **`openMeteo.ts`** — stop discarding hourly. Add a deterministic fetch against `/v1/forecast`
  with `models=` (multiple models in **one** request, returning suffixed keys — the pattern
  `ENSEMBLE_MODEL_SUFFIXES` already handles). Retain hourly series on a new result type
  alongside today's `DailyForecast[]`, which scoring keeps consuming unchanged.
- **Per-model ensemble output** — `parseEnsemble` already builds `byVariable()` grouped per
  model and then flattens it
  ([openMeteo.ts:270-281](../../apps/api/src/lib/weather/openMeteo.ts#L270-L281)). Stop flattening.
- **New variables** per Probe A: wind direction, gusts, cloud cover, precipitation probability,
  surface pressure. Tendency is computed, not fetched.
- **Persistence** (§Schema), **`/api/cron/collect-runs`** gated on `CRON_SECRET` with
  `Promise.allSettled` across locations per the architecture rule and `maxDuration: 60`, and
  **`/api/cron/prune-runs`**.

### Phase 3 — `/forecast` and `/rain`

Table rendering, four column sets, four intervals, day paging, unit toggle, coverage-derived
model row, and the Unicode-block agreement sparkline. `/rain` carries probability of measurable
rain (share of the 143 members crossing the threshold — a real probability from real members,
not a model's own PoP field), accumulation p10/p50/p90, timing, and time since last rain from
the ACIS / archive path already fetched for the drying model.

### Phase 4 — `/insight` and `/afd`

`/insight` needs Phase 2's history. One message, four sections: model disagreement (named
models, spread, outlier), ensemble distribution and threshold crossings, run-to-run trend, and
confidence by lead time. Expandable blockquotes if Probe B cleared them; otherwise flat.

`/afd` is a new `apps/api/src/lib/weather/nwsProducts.ts` — list products for the location's
`nws_office`, fetch the latest, split on the `.SYNOPSIS` / `.SHORT TERM` / `.LONG TERM` /
`.AVIATION` section markers, and page by section. `fetchWithRetry` already accepts the
`User-Agent` header NWS requires.

### Phase 5 — `/weather` anywhere, and save/remove

Geocoded lookup via [`searchPlaces`](../../apps/api/src/lib/weather/geocode.ts) and
[`computePreviewForecast`](../../apps/api/src/lib/scoring/previewForecast.ts). Two explicit save
buttons — climbing area vs weather place, because §12 requires the flag be stated, never
inferred — reusing `parseGeneralLocationInput` from
[`locations.ts`](../../apps/api/src/routes/locations.ts). `/remove` behind a confirm over
[`deleteLocationCascade`](../../apps/api/src/lib/locations/deleteLocation.ts).

---

## Schema

Drizzle only, `db:generate` then `db:migrate`, never `drizzle-kit push`.

**`weather_runs`** — one row per (point, model, fetch). `point_key` is `loc:<uuid>` or
`pt:<lat4>,<lon4>`; nullable `location_id` FK; `model`, `kind`, `fetched_at`,
`utc_offset_seconds`, `raw` jsonb (pruned at 48h). Unique on `(point_key, model, fetched_at)`.

**`weather_run_hours`** — deterministic values per run per hour: temp, dewpoint, RH, wind speed
/ gust / direction, cloud, precip, precip probability, pressure. PK `(run_id, valid_at)`.

**`weather_ensemble_hours`** — per run per hour: p10/p50/p90 for precip, temp and wind, member
counts, per-model member counts. **Not per-member rows** — 143 members × 384 hours is 55k rows
per run; the 48h raw JSON is the re-derivation path.

**`panel_states`** — 8-char id PK, `user_id`, point fields, `view`, `model`, `interval`,
`day_offset`, `columns`, `units`, `mode` (simple/advanced), timestamps. Pruned after ~7 days.

### Deleting a location now needs an ordered cascade, not a list entry

**The existing flat rule is not sufficient here, and following it literally reproduces the
exact bug it exists to prevent, one level down.**

`DEPENDENT_TABLES` in [`deleteLocation.ts`](../../apps/api/src/lib/locations/deleteLocation.ts)
is a flat list, and the loop is `tx.delete(table).where(eq(table.location_id, locationId))`.
Two consequences:

- Only **`weather_runs`** has a `location_id`. `weather_run_hours` and
  `weather_ensemble_hours` key off `run_id`, so they are not reachable by that rule at all —
  and because the loop dereferences `table.location_id` directly, they **cannot be added to
  the list**; it would not compile.
- Adding `weather_runs` to `DEPENDENT_TABLES` and stopping there deletes the parent while its
  children still reference it — a foreign-key violation surfacing as a generic 500, which is
  precisely what the rule was written to avoid.

So `deleteLocationCascade` needs a **bespoke step, ordered before** the `DEPENDENT_TABLES`
loop: delete from `weather_ensemble_hours` and `weather_run_hours` where `run_id` is in
`(select id from weather_runs where location_id = $1)`, and only then let the loop remove
`weather_runs`. All of it inside the existing transaction.

**`/api/cron/prune-runs` has the identical ordering constraint** — children before parents, or
the prune fails on the first row with retained hours. Retention is expressed in terms of
`weather_runs.fetched_at`, so the child deletes must be driven by a subquery over the parent
rows being pruned, not by their own timestamps.

This is the one part of the schema that `npm run test` cannot see at all — vitest never opens a
connection. It needs a `check:*` script exercising delete and prune against real Postgres.

---

## Traps specific to this work

Read `.claude/rules/defect-patterns.md` before reviewing any diff.

1. **`callback_query` auth is a new hole.** The current check reads `update.message.chat.id`.
   A tap arrives as `callback_query.from.id` and `callback_query.message.chat.id`; **both** must
   be checked against `TELEGRAM_CHAT_ID` or the whole new surface ships unauthenticated. Every
   refusal still answers 200.
2. **`editMessageText` returns 400 "message is not modified"** when text and markup are
   byte-identical — routine on re-tapping the active tab. Tolerate it, or a working interaction
   logs an error indistinguishable from a real escaping 400.
3. **`answerCallbackQuery` before the work, not after.** The client spins until answered and
   gives up at ~15 s.
4. **A null must never render as `0` in a table** (defect class 1). `0 mph` and "no wind
   reading" must look different. `cToF(null)` renders 32°F.
5. **A model that returned nothing is disabled, not omitted** — otherwise `/insight` says five
   models agree when four were read (defect class 3). If Probe B shows `DisabledButton` is
   unsupported, fall back to a labelled non-button row, never to silence.
6. **Cached output must show its age.** A panel served from a 3-hour-old run says so.
7. **Trend compares the same target hour, not the same array index.** A shifted run otherwise
   silently compares different days — defect class 4 in new clothes.
8. **Hourly percentiles must not leak into daily figures.** `temp_c_max` stays the median of
   each member's own daily extreme; a global max once put 102°F on screen against a 143-member
   median of 99°F.
9. **Escape inside `<pre>` too.** "Bear & Cub" is a 400 the webhook swallows, and literal
   strings need escaping as much as interpolated ones — `/start` has been dead since it was
   written because of `<location name>` (defect class 5).
10. **The AFD is regional, not a point forecast**, and it is a human's text. Label it as the
    office's discussion, never merge its wording into computed output, and page it rather than
    truncating mid-section — 4096 characters is the message limit and AFDs routinely exceed it.
11. **Never log or serialise the raw jsonb.** Go through `describeError`.
12. **A stale button after a deploy** decodes to nothing — say "expired", never guess.

---

## Verification

Typecheck and lint prove none of this.

1. `npm run build --workspace=packages/types --workspace=packages/design`, then `typecheck`,
   `lint`, `test`.
2. **Both Phase 0 probe outputs are committed deliverables.** Every model, variable and
   rendering constant traces to a line in them.
3. **Unit tests on the pure modules** — `callbackData`, `commands`, table formatters, sparkline
   encoder, date resolver, trend comparator, AFD section splitter. Per defect class 11 each
   assertion must name the implementation line that would have to change for it to fail: a null
   in every column, a 65-byte payload, a name containing `&`, a run missing a model, two runs
   starting at different hours, "saturday" typed on a Saturday, an AFD with no `.SHORT TERM`.
4. **`check:*` scripts against real Postgres** — vitest mocks `fetch` and never connects, so FK
   violations and values that fail to persist are invisible. Needed for panel-state round trip,
   run persistence and prune, and Phase 5's save/remove.
5. **Drive it from a real device** and read the Vercel runtime logs. The `initData` lesson: a
   protocol path green only against its own fixtures proves nothing.
6. `npm run test:mutation --workspace=apps/api` stays above the 65 break threshold.
7. `npm run check:hooks`, `/review-checklist`, read the diff as prose.

---

## Explicitly out

LLM-generated narrative or per-hour commentary (spec §9, removed once already). Trend push
notifications. Radar, walls, trips, shade map. Editing a saved location's rock type / aspect /
cliff angle (§12.4). Any conditions score on `/forecast`, `/rain`, `/insight` or `/afd`.
Freezing level and per-level cloud cover.

## Known cost, accepted

Retention is 14 days parsed / 48h raw, so a trip four weeks out has no trend history until it
comes inside the window. Widening that is a retention change, not a design change.

---

## Sources

Telegram: [Bot API changelog](https://core.telegram.org/bots/api-changelog),
[Bot API reference](https://core.telegram.org/bots/api),
[Bot features](https://core.telegram.org/bots/features),
**Second-hand and unverified** — all three are issues on `NousResearch/hermes-agent`, an
LLM-agent project, describing *its own* Telegram integration. They are not Telegram sources
and nothing here should be treated as established until Probe B:
[rich-message edit bug](https://github.com/NousResearch/hermes-agent/issues/46009),
[claim: Telegram Web cannot render rich messages](https://github.com/NousResearch/hermes-agent/issues/45785),
[claim: oversized rich body text](https://github.com/NousResearch/hermes-agent/issues/45762).
Verified Telegram sources:
[10 Best UX Practices for Telegram Bots](https://medium.com/@bsideeffect/10-best-ux-practices-for-telegram-bots-79ffed24b6de),
[inline keyboard guide](https://botnamefinder.com/blog/telegram-inline-keyboard-builder-guide).

Weather: [NWS API docs](https://www.weather.gov/documentation/services-web-api),
[NWS product types](https://api.weather.gov/products/types),
[SpotWX FAQ](https://spotwx.com/en/faq.html),
[Mountain Weather Forecasting — Matt Ruta](https://mattruta.com/2021/11/18/mountain-weather-forecasting/),
[Backcountry tools guide](https://snowdoctor.ca/blog/backcountry-tools-guide),
[Finding good weather forecasts](https://kananaskis.org/finding-good-weather-forecasts/),
[meteoblue MultiModel Ensemble](https://content.meteoblue.com/en/private-customers/website-help/forecast/multimodel-ensemble),
[Windy multimodel approach](https://www.windy.com/articles/43904).

Bot UX precedent: [Top Telegram trading bots](https://www.coingecko.com/learn/top-telegram-trading-bots),
[Trojan vs Maestro vs BonkBot](https://telegramtrading.net/best-sniper-bot-for-solana/).
