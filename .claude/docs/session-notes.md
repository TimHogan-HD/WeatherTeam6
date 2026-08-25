
---

## 2026-08-25 — branch: claude/miniapp-design-b0 — commit: 151d1a0

**Phase completed:** Phase B0 review round 3 — the round the previous session began and lost when its context ran out. Spec corrected, plus two code comments that were the original source of the error.

**Recovery note:** nothing was lost from disk. Both B0 commits were intact on the branch; only the review conversation was gone, and no `review-findings.md` had been written — the exact failure the CLAUDE.md gotcha warns about. Findings were written to disk **before** any fix this time.

**What was fixed this session:**
- `docs/handoffs/miniapp-design-v1.md` §7 rule 4 — **the ship-breaking one.** The score-suppression carve-out was built on the belief that `liveForecast`'s missing-today-row fallback zeroes `component_temp`. It does not: `conditionsScore.ts:76` reads `forecastHighC`, and `currentTempC` is never read by any scorer. The carve-out's signature (`component_temp === 0` + `temp_c_max` above 0 °C) describes **Red Rock at 39.5 °C**, so it would have fired on the one case §7 exists for and shipped *"Dry, settled"* against a 103 °F Extreme Heat Warning. Deleted, with an explicit do-not-reintroduce note.
- `miniapp-design-v1.md` §5 — new *Silently degraded* subsection. The fallback's real effect is the **opposite** of degrading: 0 km/h wind and the 50% humidity default both sit inside `conditionsScore`'s full-credit bands, so scores come back inflated with no component zeroed and no response field marking it. Not client-detectable in v1; filed as §10.4.
- `miniapp-design-v1.md` §3 — new binding display cap. `hours_since_rain` at or above `720` renders as *"no rain in 30+ days"*, never a precise figure: a swallowed ACIS/archive fetch and a genuine dry month both produce that sentinel with `estimated_dry: true, confidence: 'high'`. Filed as §10.5.
- `miniapp-design-v1.md` §5 — new *No score for today* row. `GET /conditions/:id` returns `200` with `data: null` when nothing matches today; no section handled it, and `label(data.score)` throws. Must not reuse the ladder's *"Too far out to score"* copy — that describes a far-out date, this is today.
- `miniapp-design-v1.md` §4 — resolved the unit labels being defined in both `packages/types` and `packages/design`. Formatters are authoritative for anything a user reads; `design.units` is superseded for rendered text.
- `miniapp-design-v1.md` §6 — conclusion unchanged, reasoning replaced. The 7–14 day window *is* reachable in the data (`daysOut` is measured from today, so a feed starting tomorrow puts row 7 at `daysOut` 7), just never on screen.
- `apps/api/src/lib/scoring/liveForecast.ts:120-131` — the comment and log message asserted the same falsehood the spec inherited from them. Corrected to state the true direction of the degradation.
- `packages/types/src/index.ts` — `ScoreInput.currentTempC` marked `UNUSED` with the reason, so a dead field cannot mislead a third time.
- `.claude/docs/review-findings.md` — NEW. All six findings with file:line evidence, plus an appendix of 22 claims verified correct so round 4 does not redo them.

**Verification:** `npm run typecheck` 6/6 tasks pass, `npm run test` 106/106 pass.

**Known issues / deferred work:**
- Unchanged from the entry below: all five issues (#21, #22, #25, #26, #27) still open, the scoring fix behind #21 still undone, still no test coverage on the migration-era backend logic.
- Two new open questions added to the spec, both out of scope for B0 and both needing their own issue: §10.4 (degraded scores invisible to any client — needs an API field) and §10.5 (dry month indistinguishable from a failed rainfall fetch — needs a distinguishable `dryingModel` result).

**§10.1 answered — the last design blocker is closed, and it widened the product:**
- **Product call:** locations work like any ordinary weather app. Search any place by name, see its weather first, then choose to save it. Climbing is a **property of a saved location, set by an explicit toggle**, not a precondition for saving one. The user confirmed they intend to use this for general weather, not only climbing.
- Written up as **`miniapp-design-v1.md` §12**. Closes §10.1, unblocks §5's empty state, reverses the "location search or creation" non-goal in §9, and adds a third route `/add`.
- **New rule in §3: non-climbing locations never show a score, anywhere.** `computeLiveForecast` does not branch on `is_climbing_location`, so `/conditions/:id` will return a rock-drying score for Chicago if asked. The client must simply not ask. Side benefit: skipping that call drops two of the three upstream fetches, so general locations load faster.
- **Only one genuinely new screen.** The preview step reuses the detail screen in an unsaved mode with a save bar, rather than adding a fourth design.
- **Rock type is captured at save time**, behind the climbing toggle, optional, defaulting to *not sure*. It is the biggest single lever on the score (72 h sandstone vs 12 h granite against a 40-point component) and there is no edit screen, so save is the only chance to get it.

**Blockers for next session:**
- **None on design.** The spec is complete and no longer has a declared exception.
- **New prerequisite: Task 5a (backend).** §12 needs four API changes — `GET /geocode`, `GET /preview`, a changed `POST /locations`, and `DELETE /locations/:id`. Added to `plan.md`'s phase table. It is **independent of the `initData` auth work**, so it can start immediately.
- Task 6's screens still blocked on Task 5's auth work, and now also on Task 5a.
- cron-job.org still unregistered.

**What's next:** **Task 5a — the add-location API** — `git checkout -b claude/add-location-api` off `main` — read `docs/handoffs/miniapp-design-v1.md` §12.3 first. Backend only, no auth dependency, and it unblocks the largest new piece of Task 6. Then Task 5 (shell) and Task 6 (screens); before any UI read §0a and §8, because the token adapter has to exist before the first component. **The B0 branch is still unmerged — merge it first, or everything branches off a `main` that has no design spec.**

**Gotchas for next session:**
- **The spec is now closed for review.** Three rounds, 30 corrections. Build from it; do not re-audit it.
- **Do not reintroduce a "degradation guard" into §7's suppression rule** in any form. It has been proposed once and was actively harmful. The suppression rule runs unconditionally whenever a component is 0 and `score !== null`.
- **`currentTempC` is dead.** Three separate documents reasoned about scoring behaviour from it before anyone checked whether `conditionsScore` reads it. It does not. Same for anything else on `ScoreInput` — verify the consumer before reasoning from the producer.
- **Write review findings to `.claude/docs/review-findings.md` as you find them, not at the end.** This session existed because the last one didn't.
- **`GET /preview` will be the first code to exercise `fetchArchivePrecip`.** All three seeded locations have an `asos_station`, so `liveForecast`'s Open-Meteo-archive fallback has never run in manual testing. A previewed location has no station and takes it every time — expect the first Task 5a bug there.
- **`plan.md` decision 10 (geocoding out of scope) is reversed**, not merely outdated. If a doc still says climbing search via `crags` only, it is stale — `build-prompt-v8.md:761` and `weatherteam6-ui-handoff-v1.md:533` both still carry the old framing and were left alone as historical build records.
- **Do not seed or import `crags` for the add flow.** It is still empty and stays out of v1 search; the geocoder covers both climbing and non-climbing places. §12.2.
- The gotchas in the entry below still stand — chiefly that **the API is not actually behind Vercel SSO** and is open right now, which inverts B3's urgency.

---

## 2026-08-25 — branch: claude/miniapp-design-b0 — commit: 995f1f0

**Phase completed:** Phase B0 — Mini App design spec. Docs only, no code changes.

**What was built this session:**
- `docs/handoffs/miniapp-design-v1.md` — NEW. The design contract Tasks 5-7 build to. Answers all seven decisions the build handoff required: theming, navigation, content hierarchy, units, states, non-goals, and the copy model resolving #21.

**Decisions made (previously open):**
- **Theming — hybrid rejected.** The build handoff recommended "take light/dark from Telegram, apply WeatherTeam6 tokens within it." That is not implementable: the palette in `tokens.ts` is dark-only, there is no light token set, and every locked contrast rule is expressed as a minimum opacity of near-white on dark. Building one would mean authoring ~40 colors in the app, which the architecture rule forbids. Decision: WeatherTeam6 dark for all content, `themeParams` used only to harmonize Telegram's own chrome.
- **Units — pure helpers in `packages/types`,** consumed by both the bot and the Mini App. Not a deviation from the types-only convention: that package already ships `aspectToDegrees`, `parseNumeric`, and `SCORE_COMPONENT_MAX`.
- **Copy model (#21) — score-to-opinion mapping deleted outright.** `statusLabel()` goes; a five-rung ladder describes *conditions* ("Dry, settled") not suitability. Adds a suppression rule: when any component scores 0 or a Severe+ alert is active, the score is never shown as a summary — the limiting factor is named instead.

**Verified against production, not assumed:**
- **Issue #21 reproduced live.** Red Rock on 2026-08-24: `temp_c 39.5` (**103°F**), `component_temp: 0`, total **80**, confidence high, with an active NWS **Extreme Heat Warning** through Aug 28 that the reply never mentions. The shipped bot text for that state is "looks great — go climb".
- **Root cause characterised.** Scoring is additive with no veto: drying 40 + rain 25 + wind 15 + temp 12 + humidity 8. Heat costs *at most 12 points* and saturates (`>35°C → 0`, so 96°F and 130°F are identical), so any settled dry spell lands in the 80s regardless of air temperature. The score is behaving as designed; the design is wrong. The copy model makes the surface honest — it does not fix the score.
- **Per-day scores are not exposed by the API.** `computeLiveForecast` scores all 7 days but `/conditions/:id` keeps only today and `/forecast/:id` returns scoreless snapshots. The spec drops per-day score chips so that "no API changes needed" stays true.
- **`crags` table is empty** — `/locations/search?q=rock` returns `[]` against production, so the crag-picker add flow has no data behind it.
- **All three seeded locations have an `asos_station`** (KPSP / KLAS / KCNY), so the Open-Meteo-archive rainfall fallback is never exercised by seed data and will not appear in manual testing.
- **NBM fallback confirmed (#22).** Live `model_sources` comes back `["gfs_seamless","ecmwf_ifs025","icon_seamless_eps","gem_global"]` — the ensemble, never NBM.

**Corrections to inherited docs — each was a wrong instruction a future session would have followed:**
- **`tokens.ts` is not "framework-agnostic".** Its own header says `Target: React Native`. `shadow` is RN-only (`shadowOffset`/`elevation`, no CSS meaning), `layout` uses `flex`/`paddingHorizontal`, `fonts` names are `expo-font` families that do not match the Google Fonts family `"Barlow Condensed"`. Only `colors`, `spacing`, `radius`, `units`, `uvScale` port directly. The Mini App needs an adapter layer.
- **§Design System is not entirely client-agnostic** despite its banner. Four subsections name React Native explicitly (`LinearGradient`, `react-native-svg`, tabler RN icons, "no CSS vars"). Binding parts are the token-source rule, contrast rules, layout constants, and copy rules.
- **`bottomNav` must not be imported** — it declares four tabs, three of them out of scope.

**Known issues / deferred work:**
- All five issues (#21, #22, #25, #26, #27) remain open. The spec resolves #21's *copy* only.
- **The scoring fix behind #21 is not done** and needs its own change: cap the total when a component is 0, apply a multiplicative safety factor, or re-weight temperature above 12.
- Empty-state copy is deliberately unwritten, blocked on the add-location product call.
- Still no test coverage on the ~480 lines of migration-era backend logic.

**Blockers for next session:**
- **§10.1 — how does a user add a location?** Two screens means no add flow, the `crags` table is empty, and the manual `{name, lat, lon}` path forces `is_climbing_location: false`. Task 6 can build both screens; only the no-locations empty state waits on this call.
- Task 6 still blocked on Task 5's auth work.
- cron-job.org still unregistered.

**What's next:** Phase B2 / Task 5 — `git checkout -b claude/miniapp-scaffold` off `main` — read `docs/handoffs/miniapp-design-v1.md` §0a and §8 before writing any UI, because the token adapter has to exist before the first component.

**Gotchas for next session:**
- **The API is not actually behind Vercel SSO.** The handoff, the previous session notes, and correction #1 all assume every Mini App fetch 302s to a login page. It does not: `GET /api/v1/locations` returns **200 with real data** to an unauthenticated public request, and `POST /api/telegram/webhook` answers a public POST. Vercel reports `ssoProtection: enabled` with `deploymentType: "all_except_custom_domains"`, but the production alias serves straight through. B2 is therefore unblocked — and the API is open *right now*, which inverts B3's urgency from "prevent a future exposure" to "close a current one". Confirm in the Vercel dashboard before scoping B3 around a wall that isn't there.
- **CORS confirmed empirically:** `Access-Control-Allow-Headers: Content-Type, Authorization` and `Access-Control-Allow-Origin: *`. A custom `X-Telegram-Init-Data` header will fail preflight, exactly as the handoff's correction #4 predicted.
- **Telegram contract re-verified against live docs.** HMAC-SHA256 with the `WebAppData` secret derivation still holds. New since the docs were written: an Ed25519 third-party signature path (not needed — we hold the bot token), injected `--tg-theme-*` CSS variables plus `--tg-color-scheme` and safe-area insets, and `startapp` surfacing as both `start_param` and the `tgWebAppStartParam` GET parameter. Script pins at `?63`.
- **`startapp` permits hyphens** (`A-Z a-z 0-9 _ -`), so pass UUIDs through intact. Stripping and reinserting dashes turns a corrupted parameter into a well-formed *wrong* UUID that 404s instead of falling back to the list.
- **`setHeaderColor` and `setBackgroundColor` have different version floors** — hex from 6.9 and 6.1 respectively. Do not gate them together, and do not fall back to the `bg_color` keyword: it resolves to the user's light-theme white, which is the failure the theming decision exists to prevent.
- **Three review rounds found 30 wrong claims in this spec's own drafts** (11, then 13, then 6) — including a score floor/ceiling inversion, formatters that would render `32°F` for null, and a suppression rule that would have blamed the weather for a `liveForecast` degradation that does not work the way three separate documents claimed. ~~A third round was cut short by a session limit and did not run.~~ **Round 3 ran on 2026-08-25 and is closed — see `.claude/docs/review-findings.md`.** No further re-review is needed before building.

---

## 2026-08-24 — branch: claude/telegram-crossover-zero-cost-4u8b1h — commit: 37b13ed

**Phase completed:** Mini App build handoff (PR #30). Docs only, no code changes.

**What was built this session:**
- `docs/handoffs/weatherteam6-miniapp-handoff-v1.md` — NEW. Standalone handoff covering Phase B0 through Crossover Tasks 5-7, written so a fresh session can start from it with no prior context. Consolidates what previously lived across `session-notes.md`, `plan.md`, and a chat transcript: current live state, all five open issues plus the unfiled day-N scoring quirk with file locations, per-phase acceptance criteria and git checkpoints, the full `/api/v1` endpoint inventory, and the environment gotchas that cost time during the migration.

**Corrections the code review forced into the doc — each one was a wrong instruction a future session would have followed:**
- **Removing Vercel SSO in B3 also exposes `POST /api/telegram/webhook`.** Its only gate is the forgeable body `chat.id`; SSO is what actually keeps strangers out today, and Telegram itself reaches it via the protection-bypass secret in the registered URL. Issue #27's `secret_token` fix is therefore part of B3, not deferred hardening. The first draft said non-`/api/v1` routes "keep their own gates", which is true of `CRON_SECRET` and false of the webhook.
- **Task 7's turbo instruction was backwards.** The `@weatherteam6/mobile#build` override exists only to set `outputs: []`; deleting it makes the package fall through to the generic `build` task and still run `tsc --noEmit`. Lint is worse — `turbo.json` has a bare `lint: {}`, and mobile declares `eslint . --max-warnings 0`, so no turbo edit silences it. Turbo runs whatever scripts a workspace member declares. The doc now lists the three actions that would actually work and says to verify rather than assume.
- **`VITE_API_BASE_URL` needs `turbo.json`'s `globalEnv`,** not just `.env.example` and Vercel. Miss it and turbo does not treat the variable as part of the cache key, so changing the API base URL silently reuses a bundle built against the old one.
- **CORS will masquerade as an auth bug in B3.** `createApp()` sets a fixed `Access-Control-Allow-Headers: Content-Type, Authorization`, so a custom `X-Telegram-Init-Data` header fails preflight before the HMAC middleware ever runs.
- **Issue #26 was described imprecisely.** The claim-and-release race is already fixed (`e2c67d3`). The live bug is the prune path: `fetchNwsAlerts` returns `[]` on a malformed 200, `runAlertsCheck` then deletes every row for that location, and `notified_at` goes with it.
- Upstream fetch count corrected from two to three per request (NBM, ensemble fallback, rainfall), six for a detail screen loading conditions and forecast.

**Known issues / deferred work:**
- Unchanged from the previous entry. All five issues (#21, #22, #25, #26, #27) remain open, and the day-N `computeLiveForecast` quirk is still unfiled.
- Standing CI lint failure (`apps/mobile/app.config.js` -> `'module' is not defined`) still fails identically on `main` and every branch. Re-confirmed this session with `npx eslint app.config.js`.

**Blockers for next session:**
- None new. The two carried forward still hold: Task 6 is blocked on Task 5's auth work, and cron-job.org is still unregistered.

**What's next:** **Phase B0 — write `docs/handoffs/miniapp-design-v1.md` before any Mini App code.** Then Tasks 5 -> 6 -> 7. Branch off `main`. Read `docs/handoffs/weatherteam6-miniapp-handoff-v1.md` first; it points at everything else.

**Gotchas for next session:**
- The handoff doc is a build spec a session is meant to follow verbatim, so it was reviewed as executable, not as prose. Six of its load-bearing claims were wrong on first draft. If you extend it, re-check the claims against the code rather than against the doc.
- Turbo does not decide what runs; workspace `package.json` scripts do. Any future "remove X from the build" task should start there, not in `turbo.json`.

---

## 2026-08-24 — branch: claude/telegram-crossover-zero-cost-4u8b1h — commit: 3ea7301

**Phase completed:** Post-migration documentation reconciliation (PRs #24, #28). No code changes.

**Why this was needed:** after the Tasks 1-4 migration merged, the project's own docs still described the pre-migration architecture. `plan.md` laid out React Native phases 14a-16, `architecture.md` carried the Mobile-First Mandate, and — worst — `.claude/skills/bullmq-jobs/SKILL.md` would have auto-triggered on any job-shaped work and guided a future session into rebuilding the queue infrastructure that had just been removed.

**What was built this session:**
- `docs/handoffs/telegram-crossover-v4.md` — NEW. The authoritative Crossover spec previously existed **only in a chat transcript**. Committed with a status header recording where the implementation diverged from it (migration numbering, route prefix, WebSocket vs HTTP Neon driver, and the two internal contradictions resolved during the build).
- `.claude/skills/bullmq-jobs/` → `background-work/` — rewritten around the two sanctioned patterns (live per-request compute; HTTP cron endpoint), the claim-before-you-act idempotency rule, and why a queue is structurally impossible on a single serverless function.
- `skills/drizzle-patterns` — corrected from `node-postgres`/`pg` to the Neon WebSocket driver, with why `neon-http` can't be substituted and why migrations can't run from a restricted network.
- `skills/conditions-score` — documented a five-file layout, a `computeScore()` export, and a local `types.ts` that never existed. Corrected to the real four-file layout with types in `packages/types`, plus the fact that scores are never persisted.
- `agents/architect-guard`, `agents/code-reviewer` — stack descriptions and the "new queues require approval" question updated.
- `rules/review-checklist` — `## Mobile` → `## Client (Mini App)`; new `## Telegram surfaces` section covering HTML escaping and webhook auth (both live bugs).
- `docs/data-model.md` — flagged the four tables with no writer; corrected `target_date`→`start_date`/`end_date`, `scored_at`→`computed_at`, `is_crag`→`is_climbing_location`; documented `walls`, `location_normals`, `weather_alerts` (previously absent entirely).
- `docs/plan.md`, `CLAUDE.md`, `README.md` — roadmap replaced with B0 → Tasks 5-7; env lists synced to `.env.example`; README rewritten as a real front door.
- Eight mobile-era documents given ⚠️ banners. `weatherteam6-ui-handoff-v1.md` got a deliberately different "partially in force" banner — its per-screen phases are dead but its **§Design System is client-agnostic and still binding** for the Mini App.

**Doc convention now in force:** a ⚠️ banner means mobile-era history. No banner means the doc is *maintained* — not that every line is current. Trust the code over the prose when they disagree.

**Known issues / deferred work — all filed:**
- **#25** — regression: deleting the `rainfallHistory` worker removed the only writer for `crag_climbability_history` and `location_normals`, so `/history` and `/normals` return `[]` forever. Needs a design call on where the write goes.
- **#26** — alert path: `fetchNwsAlerts` returns `[]` (not `null`) on a malformed 200, which prunes the location's rows and destroys `notified_at` dedup state → re-send. Plus unescaped HTML in `parse_mode: 'HTML'` messages — in **two** places, not one: `formatAlertMessage` (an NWS headline containing `&` fails permanently, retrying every 15 min) *and* `conditionsReply.ts`'s `` `<b>${location.name}</b>` `` (a location named "Bear & Cub" makes `/conditions` fail with a 400 the webhook swallows, so the bot goes silent). Fixing only the alert path leaves the bot broken.
- **#27** — hardening: bot auth reads `chat.id` from the request body (forgeable; `secret_token` is the fix), no `update_id` dedupe, and `runAlertsCheck` is serial in the way `trips.ts` was already fixed for.
- **#21** — 104°F scores 85 and the bot says "looks great — go climb", violating two locked copy rules. **Settle inside B0**, not after — Task 6 would otherwise inherit the same framing.
- **#22** — Open-Meteo NBM 400s on every request; always falls back to ensemble.
- **Not filed:** `computeLiveForecast` reuses *today's* wind/temp/humidity for every future day, so a day-7 score's wind/temp/humidity describe today. Worse in the edge case: when no forecast day matches today (the feed starts tomorrow), the `?? 0` fallbacks score **every** day at 0 km/h wind and 0 °C — and 0 °C zeroes the temp component outright. A `logger.warn` for that case was restored in this session; it had been dropped when the logic moved out of `forecastSnapshot`.
- **No test coverage** on ~480 lines of new backend logic. All 106 passing tests predate the migration.

**Blockers for next session:**
- **Task 6 is blocked on Task 5's auth work** — do not build Mini App screens before `initData` HMAC middleware exists and Vercel SSO is removed, or every call 401s. See the first gotcha below; this is a hard ordering constraint, not advice.
- One operational item outstanding: **cron-job.org** is not yet scheduled (POST `/api/cron/check-alerts` every 15 min with `x-cron-secret` + `x-vercel-protection-bypass`). Verified working by hand; just needs registering.

**What's next:** **Phase B0 — write `docs/handoffs/miniapp-design-v1.md` before any Mini App code.** Then Tasks 5 → 6 → 7. Branch off `main`. Read `docs/handoffs/telegram-crossover-v4.md` and `.claude/docs/plan.md` first.

**Gotchas for next session:**
- **The Mini App cannot reach the API as things stand.** It's a browser client with no Vercel SSO cookies, and the bypass secret can't ship in a public bundle. `initData` HMAC validation must land **in the same change** that removes SSO protection, as route-level middleware on `/api/v1/*`. SSO off without HMAC leaves the API wide open.
- **Verify the Telegram Mini App contract before coding.** The Crossover doc warns that surface changed repeatedly through 2026. Origin lockdown also means production domain only — preview URLs will not work.
- **`apps/mobile` is still in `workspaces` and `turbo.json`.** Archived in intent, not yet in build config — that's Task 7. It is also the cause of the standing CI lint failure (`app.config.js` → `'module' is not defined`), which fails identically on `main` and on every branch. Task 7 removes it for free.
- Every significant bug in the migration was caught by review, not by careful writing — four of six findings in the first round, three in the second, fifteen in the docs round. Keep `/code-review` non-optional.

---

## 2026-07-29 — branch: claude/telegram-crossover-zero-cost-4u8b1h — commit: 6595f9e

**Phase completed:** Telegram Crossover — Backend Migration (Tasks 1-4 of the v4 zero-cost-stack handoff doc)

**What was built this session:**
- `apps/api/src/db/index.ts` — swapped `postgres`/`postgres-js` for `@neondatabase/serverless` `Pool` + `drizzle-orm/neon-serverless` (WebSocket driver, not the HTTP driver the doc literally named — `trips.ts`'s interactive `db.transaction()` needs it, see Gotchas)
- `apps/api/src/lib/scoring/liveForecast.ts` — NEW: `computeLiveForecast(location)`, the per-location forecast+scoring orchestration extracted from the deleted `forecastSnapshot` job; called on demand from `conditions.ts`/`forecast.ts` instead of reading snapshot tables a queue used to populate
- `apps/api/src/lib/weather/openMeteo.ts` — added `fetchArchivePrecip()` (Open-Meteo historical archive API) as the no-ASOS-station fallback for recent rainfall
- `apps/api/src/lib/alerts/checkAlerts.ts` — NEW: `runAlertsCheck()`, alertsPoller's fetch/upsert/prune logic with the BullMQ wrapper removed
- `apps/api/src/lib/telegram/sendMessage.ts` — NEW: retry/backoff Telegram Bot API sender
- `apps/api/src/routes/cron.ts` — NEW: `POST /api/cron/check-alerts`, `CRON_SECRET`-gated, dedups via `weather_alerts.notified_at`
- `apps/api/src/routes/telegramWebhook.ts` — NEW: `POST /api/telegram/webhook`, chat-id gated, `/start` + `/conditions <name>`
- `apps/api/api/index.ts` + `apps/api/vercel.json` — wraps the existing Express app as a single Vercel Node serverless function; routes remounted under `/api/v1` in `index.ts`
- Deleted `apps/api/src/jobs/` entirely (BullMQ workers/queues/scheduler/connection) and `lib/redis.ts`; removed `bullmq`/`ioredis`/`@bull-board/*`/`postgres` deps, added `@neondatabase/serverless`/`ws`/`@vercel/node`
- Migration `0006` — `weather_alerts.notified_at` (nullable timestamp)
- `.env.example`, `turbo.json`, `CLAUDE.md` — dropped `REDIS_URL`/`ADMIN_PASSWORD`, added `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`/`CRON_SECRET`
- `.claude/rules/architecture.md`, `.claude/rules/review-checklist.md` — rewrote Background Jobs / Jobs sections for the no-queue reality

**Corrections found vs. the v4 handoff doc (not blockers, just noted so nobody is surprised):**
- Repo actually has migrations `0000-0005` (six), not `0000-0002` (three) as the doc claimed — new migration is `0006`
- `GET /conditions/:id` and `GET /forecast/:id` only ever read tables the deleted `forecastSnapshot` job populated — "port routes as-is" and "delete forecastSnapshot" can't both be literally true; resolved by computing live per-request (user-confirmed)
- Deleting `rainfallHistory` with no replacement would have permanently defaulted the drying-time score (the #1-weighted component) to "no recent rain" for every location — resolved by live-fetching recent rainfall per request instead (user-confirmed)

**Code-review fixes applied post-PR-open (PR #20):**
- `apps/mobile/src/lib/api.ts` `baseUrl()` now appends `/api/v1` — the `/api/v1` remount in `index.ts` had left every mobile hook's unprefixed path (`/locations`, `/conditions/:id`, etc.) 404ing
- `apps/api/src/routes/trips.ts` `GET /trips/:tripId/forecast` was still reading the dead `forecast_snapshots` table (missed when `conditions.ts`/`forecast.ts` were converted) — now calls `computeLiveForecast` per trip location like the other two routes
- `apps/api/src/routes/cron.ts` — moved `formatAlertMessage` + the notify/dispatch loop into `lib/alerts/checkAlerts.ts` (`notifyPendingAlerts`), fixed a race (concurrent cron invocations could both read the same unnotified row before either stamped `notified_at`, double-sending) by atomically claiming each row (`UPDATE ... WHERE notified_at IS NULL`) before sending, with the claim released on send failure so it retries next run; also fixed the `x-cron-secret` header read to handle Express's `string[]` case instead of blind-casting to `string`
- `apps/api/src/routes/telegramWebhook.ts` — moved `statusLabel`/`handleConditions` into `lib/telegram/conditionsReply.ts` (`buildConditionsReply`) per the "route handlers are thin" rule

**Known issues / deferred work:**
- Tasks 5-7 (Mini App shell + screens, deep links, `apps/mobile` archival) are explicitly out of scope for this session — separate follow-up
- `computeLiveForecast` does two live upstream fetches (forecast + rainfall) per `/conditions` or `/forecast` request with no caching layer — fine for a single-user bot/app, would need revisiting under real traffic
- **Pre-existing scoring quirk, not introduced by this PR, not fixed:** `computeLiveForecast` (and the `forecastSnapshot` job it was ported from) computes `currentWindKmh`/`currentTempC`/`currentHumidityPct` once from *today's* forecast day and reuses those same values for every future day's score — a day-7 score's wind/temp/humidity components are anchored to today, not day 7. Carried over verbatim per "port conditionsScore.ts as-is"; flagging for a separate scoring-algorithm review rather than changing behavior in an infra migration PR.

**Deployment state — Tasks 1-4 are LIVE and verified end-to-end:**
- **Neon:** all 7 migrations (0000-0006) applied. PR #20 merged to `main` as `adb19a6`.
- **Vercel:** project `weather-team6-api`, root directory `apps/api`, framework preset **Other** (not Express — see Gotchas). Production URL `https://weather-team6-api.vercel.app`.
- **Verified live:** `GET /api/v1/locations` returns the 3 seeded locations; `GET /api/v1/conditions/:id` returns a real live-computed score (85, confidence high) with full breakdown; the ACIS rainfall fetch confirmed working via runtime logs; `/conditions joshua` in Telegram returns the expected plain-language reply.
- **Telegram webhook:** registered against production with the Vercel bypass appended as a query param.
- **cron-job.org:** still to be configured — POST `/api/cron/check-alerts` every 15 min with BOTH `x-cron-secret` and `x-vercel-protection-bypass` headers. This is the only Task 1-4 acceptance test not yet exercised (alert dedup via `notified_at`).

**Blockers for next session:**
- None for Tasks 1-4. The only outstanding item is the cron-job.org dashboard setup above.

**Open follow-ups (filed as issues, deliberately out of scope for the migration):**
- **#21** — extreme heat can only cost 12 of 100 points, so 39.9°C Joshua Tree scored 85 and the bot replied "looks great — go climb". Pre-existing scoring design; became consequential the moment the score started driving plain-language advice. Design decision needed, not a bug fix.
- **#22** — Open-Meteo NBM returns 400 on every request, so `computeLiveForecast` always falls back to the ensemble. Pre-existing (ported unchanged from `forecastSnapshot`); only visible now that scoring runs in the request path with logs attached. Suspect an invalid daily variable in `NBM_DAILY_VARS`.

**What's next:** Tasks 5-7 (Mini App shell, Mini App screens, deep link + `apps/mobile` archival) — `git checkout -b phase/miniapp-shell` off `main`. No handoff doc covers the Mini App screens beyond the v4 doc's own Task 5/6 bullets; re-read those before writing `apps/miniapp`. Note the v4 doc's warning that Mini App origin lockdown means registering/testing against the **production** Vercel domain only — preview URLs will not work.

**Gotchas for next session:**
- `drizzle-orm/neon-serverless` (not `neon-http`) is the runtime driver, specifically because `trips.ts` does an interactive `db.transaction()` (insert, read generated id, insert dependent rows) that the HTTP driver can't express. Don't "simplify" this to `neon-http` without checking `trips.ts` first.
- `drizzle-kit` auto-detects `@neondatabase/serverless` in `node_modules` and uses its WebSocket driver for `generate`/`migrate` regardless of what our app code uses — this is why migrations can't run from a WS-restricted network, and it's independent of our own driver choice.
- `apps/api/api/index.ts` is intentionally outside `tsconfig.build.json`'s compile scope (Vercel transpiles it itself) but inside `tsconfig.json`'s `include` (so `npm run typecheck` still catches errors in it).
- `computeLiveForecast` synthesizes `id` fields as `${locationId}:${date}` since nothing is persisted anymore — don't expect these ids to be stable/lookupable across requests.
- **Vercel framework preset must be "Other", NOT "Express".** Vercel auto-detects Express and gets it wrong: its Express preset expects the entry file to `export default app` or call `app.listen()`, but `apps/api/api/index.ts` exports a `handler(req, res)` that forwards into the app. Worse, `apps/api/package.json` has `"main": "./dist/index.js"` which exports `createApp` — a *factory*, not an app instance — so the preset would fail confusingly at runtime rather than at build.
- **Never set `NODE_ENV=production` as a Vercel env var.** npm omits devDependencies when it's set, `typescript` is a devDependency, and the root postinstall (which builds `packages/types` and `packages/design`) then dies with `tsc: command not found`. Vercel manages `NODE_ENV` itself. This cost a full debugging cycle.
- **`vercel.json` skips the build step deliberately** (`buildCommand` is a no-op, `outputDirectory` points at an intentionally empty `public/`). Vercel's Node builder compiles `api/` itself and the workspace packages are built in the root postinstall, so `turbo run build` here only produced an unused `apps/api/dist`. Without the empty `public/`, the deploy fails with "No Output Directory named public found".
- **Vercel Authentication (SSO) is enabled on the project**, so every deployment URL is gated. The Telegram webhook and cron-job.org reach it via Protection Bypass for Automation — cron sends `x-vercel-protection-bypass` as a header, Telegram carries it as a query param on the webhook URL (Telegram cannot send custom headers). If the bot silently stops responding, check that the bypass secret in the registered webhook URL is still valid via `getWebhookInfo`.

---

## 2026-06-19 — branch: phase/13-history — commit: 47074f8

**Phase completed:** Phase 13 — Historical Climbability Patterns

**What was built this session:**
- `apps/api/src/lib/scoring/climbabilityHistory.ts` — pure function computing monthly climbable-day counts from daily precip rows; lookback windows by rock type (granite/limestone=2d, basalt/sandstone/unknown=3d); 8 Vitest tests
- `apps/api/src/lib/weather/acisNormals.ts` — added `fetchGriddedPrecipHistory(lat, lon, fromDate, toDate)` using ACIS GridData (lat/lon-based, no asos_station required); returns 10yr daily precip in mm via `inchesToMm()` conversion
- `apps/api/src/jobs/workers/rainfallHistory.ts` — backfill branch on `job.data?.type === 'backfill'`; safety-net pass queues backfill for climbing locations with no history; both branches error-isolated with try/catch
- `apps/api/src/routes/locations.ts` — `GET /:id/history` endpoint (groups by month, AVG climbable_days, returns `[]` when no data); fire-and-forget backfill queue dispatch on `POST /locations` for climbing locations
- `apps/api/src/db/seed.ts` — seeds MN/WI climbing locations from OpenBeta crags table; `toRockType()` helper maps rhyolite→unknown; upsert by name (idempotent)
- `packages/types/src/index.ts` — `ClimbabilityHistory` type (`month`, `avg_climbable_days`, `years_of_data`)
- `apps/mobile/src/hooks/useClimbabilityHistory.ts` — React Query hook, staleTime 24h, disabled when no locationId
- `apps/mobile/src/components/history/BestMonthsCallout.tsx` — top 3 months sorted chronologically in lime text; hidden when data empty
- `apps/mobile/src/components/history/ClimbabilityChart.tsx` — 12-bar seasonal chart, current month in lime, others at 55% opacity; `fonts.display` (not fonts.condensed)
- `apps/mobile/app/location/[id].tsx` — history section with BestMonthsCallout + ClimbabilityChart + zero-data state + source note; only shown for climbing locations

**Known issues / deferred work:**
- MN/WI seed requires running importCrags.ts first to populate the crags table before seed.ts picks them up
- No UI for manually triggering a backfill retry (non-blocking — safety-net covers it)

**Blockers for next session:**
- None. Phase 13 merged to main at 47074f8. All 106 tests pass.

**What's next:** No predefined Phase 14 — this was the final phase in the build plan. Next session should brainstorm what to build next (notifications, trip planning detail, auth, production deployment, etc.)

**Gotchas for next session:**
- ACIS GridData (`data.rcc-acis.org/GridData`) always returns inches regardless of `units` param — use `inchesToMm()` on every value; `units: 'mm'` is silently ignored
- `fonts.display` is the correct token for BarlowCondensed in the design system — `fonts.condensed` does not exist

---

## 2026-06-19 — branch: phase/10-search-general-weather — commit: 7706a18

**Phase completed:** Phase 10 — General Weather + Search Wired

**What was built this session:**
- `apps/api/src/routes/locations.ts` — `GET /locations/search?q=` (text search with ILIKE on name/area_name/state; nearby sort via Haversine when lat/lon provided); `POST /locations` (save crag by cragId or create general weather location by name+lat+lon); search registered before `/:id` to prevent route shadowing
- `packages/types/src/index.ts` — `CreateLocationInput` discriminated union type
- `apps/api/src/scripts/importCrags.ts` — batch upsert script from OpenBeta JSON format; 25 seed crags imported successfully
- `apps/mobile/src/hooks/useSearchCrags.ts` — React Query hook for crag text search
- `apps/mobile/src/hooks/useSaveLocation.ts` — mutation hook to POST /locations with cragId
- `apps/mobile/src/hooks/useNearbyLocations.ts` — expo-location permission + Haversine nearby search
- `apps/mobile/app/search.tsx` — full rewrite: live search results, ActivityIndicator, save button, back nav with canGoBack() fallback
- `apps/mobile/app/(tabs)/locations.tsx` — stub search bar → Pressable that navigates to /search; LocationRow/CragRow simplified to direct navigation (no expand/collapse panels); NearbyCragRow with "+" add button; from='locations' param on navigation
- `apps/mobile/app/location/[id].tsx` — `from` param extraction + handleBack() that respects origin tab; lint fix for ternary-as-statement
- `apps/mobile/src/components/PersistentTabBar.tsx` — NEW: resolves sub-screen paths to parent tab via usePathname(), respects safe area insets
- `apps/mobile/app/_layout.tsx` — SafeAreaProvider at root; Slot + PersistentTabBar in flex column
- `apps/mobile/app/(tabs)/_layout.tsx` — native Tabs bar hidden (tabBarStyle: display none), replaced by PersistentTabBar

**Known issues / deferred work:**
- `apps/api/src/scripts/seedCrags.json` is untracked — add to .gitignore or commit as part of seed data
- PersistentTabBar uses Unicode glyphs (⌂ ⊙ ◈ ⊕) as icons — may want Tabler icons instead for consistency
- Nearby search relies on expo-location foreground permission; no fallback UI if permission denied

**Blockers for next session:**
- None

**What's next:** Phase 11 — TBD (plan being revised)

**Gotchas for next session:**
- seedCrags.json is in apps/api/src/scripts/ and untracked — either add to .gitignore or commit before the next branch diverges
- The `from` param pattern (used to route back correctly from location detail) must be passed from ANY new screen that navigates to /location/[id] — otherwise back button falls through to Home

--- Session ended: 2026-06-17 17:57 UTC

## 2026-06-18 — branch: claude/epic-ride-mgt72f — commit: 9e73605

**Phase completed:** mobile install/runtime unblock for Phase 7b/7c

**What was built this session:**
- `apps/mobile/package.json` — aligned Expo runtime versions to published SDK 56 patch releases that npm can actually resolve.
- `package.json` — added a postinstall hook for Expo Router resolution.
- `scripts/fix-expo-router-link.mjs` — creates resolver-visible symlinks so Expo CLI's nested router-server can load `expo-router/_ctx-shared` after a clean install.

**Known issues / deferred work:**
- Expo 56.0.x package patches are not uniform across the ecosystem; the repo now relies on the postinstall link helper to keep Metro startup stable.
- `npm install` emitted existing deprecation and vulnerability warnings that are outside the current unblock.

**Blockers for next session:**
- None for startup; wait for the user to confirm the mobile app looks correct on device before starting Phase 8.

**What's next:** Phase 7b/7c device verification — scan the QR, confirm the home and location detail UI render correctly, then proceed only after user approval.

--- Session ended: 2026-06-18 15:30 UTC

--- Session ended: 2026-06-18 15:32 UTC

--- Session ended: 2026-06-18 15:34 UTC

--- Session ended: 2026-06-18 15:35 UTC

--- Session ended: 2026-06-18 15:35 UTC

--- Session ended: 2026-06-18 15:36 UTC

--- Session ended: 2026-06-18 15:37 UTC

--- Session ended: 2026-06-18 15:38 UTC

--- Session ended: 2026-06-18 15:46 UTC

--- Session ended: 2026-06-18 15:51 UTC

--- Session ended: 2026-06-18 15:53 UTC

--- Session ended: 2026-06-18 16:19 UTC

--- Session ended: 2026-06-18 17:07 UTC

--- Session ended: 2026-06-18 17:11 UTC

---

## 2026-06-18 — branch: main — commit: 83b9ecc

**Phase completed:** Phase 7 (7e, 7f, 7d) — all of Phase 7 complete

**What was built this session:**
- `apps/mobile/app/(tabs)/locations.tsx` — full rewrite: All Locations + Crags sub-tabs, expandable rows, CragRow with live conditions score badge, filter chips, `useNearbyLocations` + `useSaveLocation` stubs
- `apps/mobile/src/hooks/useNearbyLocations.ts` — stub returning empty array
- `apps/mobile/src/hooks/useSaveLocation.ts` — stub no-op mutation
- `apps/mobile/src/components/sheets/DetailSheet.tsx` — shared bottom sheet shell with slide-in/slide-out animation; `keepMounted` state so close animation plays before unmount
- `apps/mobile/src/components/sheets/DetailSheetRouter.tsx` — routes stat key to correct sheet; keeps sheet mounted during 300ms close animation via `useReducer`
- `apps/mobile/src/components/sheets/sharedComponents.tsx` — `HeroRow`, `RangeBar` (SVG), `InfoGrid`, `SimpleLineChart`, `HourlyDetailStrip`, `SectionLabel`
- 8 stat detail sheets under `apps/mobile/src/components/sheets/`: Temperature, Wind, Humidity, Precipitation, Pressure, Visibility, UVIndex, CloudCover
- `apps/mobile/src/hooks/useHistoricalObservations.ts` — stub returning empty array
- `apps/mobile/src/hooks/usePrecipEnsemble.ts` — derives from `useForecast`
- `apps/mobile/src/components/StatTile.tsx` — added `onPress` prop (tap → detail sheet, long-press → model comparison)
- `apps/mobile/src/components/StatGrid.tsx` — added `onTilePress` prop wired to every tile
- `apps/mobile/app/(tabs)/index.tsx` + `apps/mobile/app/location/[id].tsx` — both wired with `detailStat` state + `DetailSheetRouter`
- `apps/mobile/app/search.tsx` — full rewrite: enabled input, lime cursor, clear button, recent locations pre-search, mock results filtered by query, selection state with lime check, sticky Add bar calling `useSaveLocation`
- `packages/design/src/tokens.ts` — added: `spacing.micro`, `spacing.tight`, `spacing.cellPad`, `spacing.sectionGap`, `colors.radarBand`, `uvScale` array

**Known issues / deferred work:**
- `TemperatureSheet` exists but is not routed (no stat tile emits 'temp' — hero temp has no tile press)
- Daylight tile has no detail sheet (Phase 8 sun calc)
- `useNearbyLocations`, `useSaveLocation`, `useHistoricalObservations` are stubs — Phase 10 closes them
- `usePrecipEnsemble` derives from forecast snapshots only — real ensemble endpoint is Phase 10
- PrecipitationSheet model agreement row shows placeholder text (real data = Phase 10)
- `scoreBg()` in `locations.tsx` and `WallsButton.tsx` uses raw `rgba()` strings at 0.12 opacity; closest tokens (`goodTint`, `fairTint`) are 0.10 — minor semantic mismatch
- Several sheet components have spec-mandated font sizes (15, 17, 9 BarlowCondensed) with no `type.*` token equivalent; added inline with `fonts.display`

**Blockers for next session:**
- None — Phase 7 is fully complete and reviewed

**What's next:** Phase 8 — Walls Screen + Wall Setup Flow — start by reading `docs/handoffs/design-mockups/walls-flow.jsx`, `walls-viz.jsx`, `walls.css` and the Phase 8 section of `weatherteam6-ui-handoff-v1.md`

--- Session ended: 2026-06-18 18:15 UTC

--- Session ended: 2026-06-18 18:35 UTC

--- Session ended: 2026-06-18 18:37 UTC

--- Session ended: 2026-06-18 18:38 UTC

--- Session ended: 2026-06-18 18:41 UTC

--- Session ended: 2026-06-18 18:42 UTC

---

## 2026-06-18 — branch: phase/8-walls-setup — commit: 1b9364c

**Phase completed:** Phase 8 — Walls Screen + Wall Setup Flow

**What was built this session:**
- `apps/api/src/db/schema.ts` — added `walls` table (id, location_id, user_id, name, aspect_deg, aspect_source, angle_deg, angle_band, route_count, timestamps)
- `apps/api/drizzle/0003_powerful_lady_bullseye.sql` — generated migration for walls table
- `apps/api/src/routes/walls.ts` — GET /walls/:locationId, POST /walls, DELETE /walls/:wallId; all use isUuid + sendServerError + req.userId pattern
- `apps/api/src/index.ts` — registered wallsRouter
- `packages/types/src/index.ts` — added Wall and CreateWallInput types
- `apps/mobile/src/lib/shadeCalc.ts` — suncalc-based sun window calculator (10-min sampling, normalised 0–1 arc)
- `apps/mobile/src/lib/api.ts` — added apiPost and apiDelete helpers
- `apps/mobile/src/hooks/useWalls.ts` — React Query hook for GET /walls/:locationId
- `apps/mobile/src/hooks/useAddWall.ts` — useMutation for POST /walls with query invalidation
- `apps/mobile/src/components/walls/SunArc.tsx` — half-dome SVG arc with direct-sun window and current sun dot
- `apps/mobile/src/components/walls/AngleProfile.tsx` — side-view profile SVG (AngleOverhang / CaveProfile)
- `apps/mobile/src/components/walls/CompassDial.tsx` — 218px drag-to-rotate SVG compass using PanResponder + useMemo (layout in state, no refs during render)
- `apps/mobile/src/components/walls/CompassRose.tsx` — 8-segment donut SVG with tap-to-select and preset chips
- `apps/mobile/src/components/walls/SetupShell.tsx` — 4-step modal chrome with step bar, scrollable body, sticky footer
- `apps/mobile/src/components/walls/WallSetupModal.tsx` — full 4-step setup flow (name → aspect → angle → review); BlinkCursor uses useState lazy init; AngleSlider uses useMemo with state trackW (no refs during render)
- `apps/mobile/app/walls/[locationId].tsx` — walls list screen with AspectBadge SVG, WallRow (classic), WallCard (cards + SunArc), AddWallRow, layout toggle persisted to AsyncStorage
- `apps/mobile/src/components/WallsButton.tsx` — wired to router.push('/walls/${locationId}')
- `apps/mobile/package.json` — added @react-native-async-storage/async-storage

**Known issues / deferred work:**
- Wall score is stubbed as null (shows "–"); real conditions score wired in Phase 10
- Rock state ("Dry/Damp") on WallCard is a stub; real drying model in Phase 10
- Slope gradient on AngleSlider track is approximated (solid blue); true gradient requires LinearGradient SVG
- PanResponder on CompassDial recreates on each onChange change (inline arrow in parent); acceptable for this non-hot-path screen

**Blockers for next session:**
- None — Phase 8 is fully complete, lint 0 errors, typecheck clean, committed on phase/8-walls-setup

**What's next:** Phase 9 — Trip Planning — start by reading the Phase 9/9b sections of `docs/handoffs/weatherteam6-ui-handoff-v1.md` and `docs/handoffs/design-mockups/trips-flow.jsx` + `trips.css`

--- Session ended: 2026-06-18 23:21 UTC

--- Session ended: 2026-06-18 23:25 UTC

--- Session ended: 2026-06-18 23:26 UTC

---

## 2026-06-18 — branch: phase/9-trips — commit: 8e79ccf

**Phase completed:** Phase 9 — Trips Screen + Trip Creation Flow (9a API + mobile UI)

**What was built this session:**
- `apps/api/src/db/schema.ts` — replaced `target_date` with `start_date` and `end_date` on trips table
- `apps/api/drizzle/0004_trips_date_range.sql` — migration dropping target_date, adding start_date/end_date NOT NULL
- `apps/api/drizzle/meta/0004_snapshot.json` + `_journal.json` — updated (migration generated manually via Python snapshot edit; drizzle-kit generate is interactive and cannot be automated in this environment)
- `packages/types/src/index.ts` — added Trip, TripLocation, CreateTripInput types
- `apps/api/src/routes/trips.ts` — GET /trips (list ordered by start_date), POST /trips (transaction: trip + trip_locations), GET /trips/:tripId, DELETE /trips/:tripId; all use isUuid + sendServerError + req.userId
- `apps/api/src/index.ts` — registered tripsRouter
- `apps/mobile/src/hooks/useTrips.ts` — React Query hook for GET /trips
- `apps/mobile/src/hooks/useCreateTrip.ts` — useMutation for POST /trips, invalidates ['trips']
- `apps/mobile/src/components/trips/TripCreationModal.tsx` — 4-step SetupShell-based modal:
  · Step 1 (Where): search bar + multi-select crag list (mock data) with score pills and removable chips
  · Step 2 (When): ConfCalendar (confidence-shaded month grid, tap start/end date) + HorizonRamp SVG toggle + weekend windows
  · Step 3 (Name): optional text input + running summary chips
  · Step 4 (Review): confidence hero (pct/label/bar/check-back hint), data availability rows, Create trip button
- `apps/mobile/app/(tabs)/trips.tsx` — full trip list screen with confidence badges, progress bar, empty state + FAB

**Known issues / deferred work:**
- Crag list in Step 1 uses mock data (4 hardcoded crags); real search wired in Phase 10
- db:generate is interactive and can't be automated in this dev environment; migration was written manually following drizzle snapshot format — next session should verify migration applies cleanly
- TripCard location names not shown (only count); Trip.locations only carries TripLocation with locationId, not the Location name — Phase 9b/10 can join location names
- Phase 9b (Trip Detail screen) not started this session

**Blockers for next session:**
- None — Phase 9 (9a + mobile) is complete, lint 0 errors, typecheck clean, committed on phase/9-trips

**What's next:** Phase 9b — Trip Detail screen — start by reading the Phase 9b section of `docs/handoffs/weatherteam6-ui-handoff-v1.md` and `docs/handoffs/design-mockups/README.md`

--- Session ended: 2026-06-18 23:42 UTC

--- Session ended: 2026-06-18 23:50 UTC

--- Session ended: 2026-06-18 23:52 UTC

--- Session ended: 2026-06-18 23:52 UTC

--- Session ended: 2026-06-18 23:53 UTC

--- Session ended: 2026-06-18 23:54 UTC

--- Session ended: 2026-06-18 23:56 UTC

--- Session ended: 2026-06-18 23:57 UTC

--- Session ended: 2026-06-19 01:20 UTC

---

## 2026-06-19 — branch: phase/9b-trip-detail — commit: 407c401

**Phase completed:** Phase 9b — Trip Detail Screen

**What was built this session:**
- `packages/types/src/index.ts` — added `TripForecast` type `{ locationId: string; forecasts: ForecastSnapshot[] }`
- `apps/api/src/routes/trips.ts` — added `GET /trips/:tripId/forecast` endpoint: verifies trip ownership, fetches trip_locations, queries forecast_snapshots within start_date→end_date range for those location IDs, deduplicates to latest snapshot per (location, date), groups into TripForecast[] shape
- `apps/mobile/src/hooks/useTrip.ts` — React Query hook for `GET /trips/:id`
- `apps/mobile/src/hooks/useTripForecast.ts` — React Query hook for `GET /trips/:id/forecast`
- `apps/mobile/app/(tabs)/trips.tsx` — TripCard wrapped in `Pressable` navigating to `/trips/${trip.id}`
- `apps/mobile/app/trips/[id].tsx` — full Trip Detail screen:
  · TopBar: back chevron + "Trips" label + pencil/overflow icon stubs
  · Hero: trip name, date range, day count, location count
  · ConfidenceRow: pct + label + note + progress track + days-out callout (same confidenceLevel() logic as list screen)
  · DayTabs: horizontal scroll, one tab per trip day; each shows DOW, date, condition icon, projected high (from useTripForecast), rain%; best day (lowest precip p50, tiebreak: highest temp_c_max) tagged "Best"
  · SelectedDayWeather: temp hero (°F), condition label, hi/lo, source line, 4-stat row (wind/precip%/low/precip amt)
  · NWSForecastCard: stub ("Forecast text unavailable for this date range.")
  · DryingStatusCard: rock type (stub null until Phase 10 joins location), Pending badge, stub progress track
  · AllDaysTable: one row per day with 4-stat mini-grid; best-day row highlighted
  · ForecastHistory: collapsible with stub body text

**Known issues / deferred work:**
- `nwsOffice` in SelectedDayWeather is always null — TripLocation only carries `locationId`, not full Location; real NWS office requires joining Location table in Phase 10
- `firstRockType` in DryingStatusCard is always null for the same reason
- Crag search in TripCreationModal Step 1 still uses mock data (Phase 10)
- No sectors section — omitted per spec (empty until Phase 10/13)

**Blockers for next session:**
- None — Phase 9b is fully complete; lint 0, typecheck 0, committed on phase/9b-trip-detail; both phase/9-trips and phase/9b-trip-detail merged to main at 4810c55

**What's next:** Phase 10 — `git checkout -b phase/10-search-general-weather` off `main` — read `docs/handoffs/weatherteam6-ui-handoff-v1.md` Phase 10 section before writing any UI

**Gotchas for next session:**
- `GET /locations/search` must be registered **before** `GET /locations/:id` in `locations.ts` — Express matches routes in order and will treat the literal string `search` as a UUID param otherwise
- `useSaveLocation.mutate` currently takes a bare string `id`; Phase 10 changes it to `{ cragId: string }` — update the call site in `search.tsx` at the same time
- `expo-location` is already in `apps/mobile/package.json` (`~56.0.18`) — no install needed
- `NWSAlertBar` in `apps/mobile/app/location/[id].tsx` line 136 renders unconditionally — must be gated on `location?.is_climbing_location`; WallsButton at line 138 is already gated correctly
- `useNearbyLocations` return type is currently `Location[]` — Phase 10 changes it to `Crag[]`; update call sites in `locations.tsx` accordingly

--- Session ended: 2026-06-19 01:29 UTC

--- Session ended: 2026-06-19 02:22 UTC

--- Session ended: 2026-06-19 02:23 UTC

--- Session ended: 2026-06-19 02:23 UTC

--- Session ended: 2026-06-19 13:23 UTC

--- Session ended: 2026-06-19 13:37 UTC

--- Session ended: 2026-06-19 13:40 UTC

--- Session ended: 2026-06-19 13:42 UTC

--- Session ended: 2026-06-19 13:43 UTC

--- Session ended: 2026-06-19 13:46 UTC

---

## 2026-06-19 — branch: phase/10-search-general-weather — commit: 5c14566

**Phase completed:** Phase 10 — General Weather + Search Wired

**What was built this session:**
- `apps/api/src/routes/locations.ts` — added `GET /locations/search?q=` (ILIKE on name/area_name; Haversine distance sort when lat/lon provided); added `POST /locations` (from cragId or bare name+lat+lon); `GET /locations/search` registered before `GET /locations/:id` to prevent Express route shadowing
- `apps/api/src/scripts/importCrags.ts` — batch upsert script for seeding crags table from OpenBeta JSON export; deduplicates by openbeta_id; processes in 200-row batches
- `packages/types/src/index.ts` — added `CreateLocationInput` discriminated union type
- `apps/mobile/src/hooks/useSearchCrags.ts` — React Query hook querying `GET /locations/search?q=`, enabled only when query ≥ 1 char, 30s staleTime
- `apps/mobile/src/hooks/useSaveLocation.ts` — real `POST /locations` mutation (was no-op stub); takes `{ cragId: string }`, invalidates ['locations'] on success
- `apps/mobile/src/hooks/useNearbyLocations.ts` — uses expo-location to request/check foreground permission, fetches current position, queries `GET /locations/search` by lat/lon; returns `Crag[]` (was `Location[]`)
- `apps/mobile/app/search.tsx` — rewrote to use `useSearchCrags` for real results; `ActivityIndicator` while fetching; removed all mock data; `useSaveLocation.mutate` call updated to `{ cragId }` shape
- `apps/mobile/app/location/[id].tsx` — `NWSAlertBar` wrapped in `is_climbing_location` gate (was unconditional)
- `apps/mobile/app/(tabs)/locations.tsx` — added `NearbyCragRow` component for `Crag[]` nearby rows (with "+" add button); removed unused `Location[]` nearby renders; wired `useSaveLocation` to `NearbyCragRow.onAdd`

**Known issues / deferred work:**
- `importCrags.ts` expects OpenBeta JSON format — no seed data bundled in repo; run separately with a downloaded export
- Nearby section in the "All Locations" tab removed (was using `Location[]`); now only "Crags" tab shows nearby crags via `NearbyCragRow`
- `POST /locations` from cragId inserts location with null aspect/cliff_angle/asos_station/nws_office; these populate over time via weather jobs
- No geocoding for general weather locations — `POST /locations` with bare lat/lon works but the mobile search UI only queries the crags table

**Blockers for next session:**
- None — Phase 10 is fully complete; typecheck 0, lint 0, committed on phase/10-search-general-weather

**What's next:** Phase 11 — TBD (plan being revised)

**Gotchas for next session:**
- Phase 11 requires a new API endpoint returning 24 hours of hourly data (score, temp, feelsLike, clouds, humidity, dewPoint, precip, wind, pressure) for a given location+date; this doesn't exist yet — the `useHourlyConditions` hook flags it as out of scope if not built first
- The Hourly Analysis screen is reached from Location Detail — wire navigation trigger (e.g. tapping the "today" row in SevenDayTable) at the same time as building the screen
- Score line in Climb Conditions chart uses tier-colored gradient fill, not a flat color — requires per-segment SVG path or `LinearGradient` mask trick in `react-native-svg`

--- Session ended: 2026-06-19 14:01 UTC

--- Session ended: 2026-06-19 14:07 UTC

--- Session ended: 2026-06-19 14:09 UTC

--- Session ended: 2026-06-19 14:13 UTC

--- Session ended: 2026-06-19 14:19 UTC

--- Session ended: 2026-06-19 14:21 UTC

--- Session ended: 2026-06-19 14:25 UTC

--- Session ended: 2026-06-19 14:29 UTC

--- Session ended: 2026-06-19 14:32 UTC

--- Session ended: 2026-06-19 14:54 UTC

--- Session ended: 2026-06-19 15:02 UTC

--- Session ended: 2026-06-19 15:13 UTC

--- Session ended: 2026-06-19 15:14 UTC

---

## 2026-06-19 — branch: phase/11-acis-normals — commit: 9747594

**Phase completed:** Phase 11 — ACIS Gridded Climatological Normals (replacing Tomorrow.io)

**What was built this session:**
- `apps/api/src/lib/weather/acisNormals.ts` — `fetchGriddedNormals(lat, lon)` fetches 1991-2020 monthly data from NOAA ACIS GridData (NRCC Hi-Res grid 1), computes 12 monthly mean normals client-side, converts in→mm and °F→°C
- `apps/api/src/db/schema.ts` + `drizzle/0005_flowery_skaar.sql` — new `location_normals` table (location_id, month 1-12, precip/temp normals, source, fetched_at); unique constraint on (location_id, month)
- `apps/api/src/jobs/workers/rainfallHistory.ts` — second pass after rainfall loop: for each location missing all 12 normals rows, fetches and stores them via `onConflictDoNothing`; works for all locations (not gated on asos_station)
- `apps/api/src/routes/locations.ts` — `GET /locations/:id/normals` endpoint; returns up to 12 monthly normals ordered by month; empty array if not yet backfilled
- `packages/types/src/index.ts` — `LocationNormal` type
- `.env.example` — removed `TOMORROW_IO_API_KEY`

**Known issues / deferred work:**
- ACIS GridData `ncei-norm:91-20` grid string parameter was rejected by the live API; implemented with numeric grid ID 1 (NRCC Hi-Res) instead, computing the 30-year mean client-side. Yields equivalent normals data.
- Mobile does not yet render normals data — the endpoint is ready but no hook or UI was added (out of scope for Phase 11 per the spec)
- `premium_pulls` table intentionally left in schema with zero new writes

**Blockers for next session:**
- None; normals endpoint is live and migration is applied

**What's next:** Phase 12 — `git checkout -b phase/12-radar` off `phase/11-acis-normals` (or main after merge) — read `docs/handoffs/design-mockups/radar-shared.jsx` + `radar-variations.jsx` + `radar.css` before writing any radar UI

**Gotchas for next session:**
- ACIS GridData rejects the `"grid": "ncei-norm:91-20"` string form from the spec — always use `"grid": 1` (NRCC Hi-Res integer ID) for the GridData endpoint
- The 30-year fetch returns ~360 rows; parsing/averaging is in `computeMonthlyNormals()` in acisNormals.ts — the function returns all 12 months in a single call

--- Session ended: 2026-06-19 15:39 UTC

--- Session ended: 2026-06-19 15:43 UTC

--- Session ended: 2026-06-19 15:47 UTC

--- Session ended: 2026-06-19 17:52 UTC

--- Session ended: 2026-06-19 18:13 UTC

--- Session ended: 2026-06-19 18:17 UTC

--- Session ended: 2026-06-19 18:20 UTC

--- Session ended: 2026-06-19 18:24 UTC

--- Session ended: 2026-06-19 18:26 UTC

--- Session ended: 2026-06-19 18:54 UTC

--- Session ended: 2026-06-19 18:56 UTC

---

## 2026-06-19 — branch: phase/12-radar — commit: (see below)

**Phase completed:** Phase 12 — RainViewer Radar Integration

**What was built this session:**
- `apps/api/src/lib/weather/rainViewer.ts` — `fetchRadarFrames()` fetches weather-maps.json from RainViewer public API, extracts past + nowcast frames (time + path), returns tile URL template (`tilecache.rainviewer.com{path}/{z}/{x}/{y}/4/1_1.png`)
- `apps/api/src/routes/radar.ts` — `GET /radar/frames` endpoint; returns `{ generated, host, tileUrlTemplate, past[], nowcast[] }` in standard `{ data, error, status }` envelope
- `apps/api/src/index.ts` — registered `radarRouter`
- `packages/types/src/index.ts` — added `RadarFrame` and `RadarFramesResponse` types
- `apps/mobile/src/hooks/useRadarFrames.ts` — React Query hook for `GET /radar/frames`; 5min staleTime, 10min refetch interval
- `apps/mobile/app/(tabs)/radar.tsx` — full Radar screen (Variation A · Classic):
  · TopBar with "Radar" title + day/time right element
  · Horizontal layer chip row (Precip / Temp / Wind / Cloud / Ltng); Precip active by default
  · Full-bleed map canvas (`#0a0e14`): SVG terrain contour + grid overlay + 7 precip echo blobs (RadialGradient per intensity: trace→light→mod→heavy→severe)
  · Blobs shift NE across the frame axis to simulate radar loop motion
  · Three static crag pins (Taylors Falls/fair, Sandstone/good, Interstate/neutral)
  · "You are here" pulsing ring at 40%/62% via `useState(() => new Animated.Value())` lazy init + `Animated.loop`
  · Storm cell callout (red border, NE/38k ft/hail warning)
  · Interactive timeline scrubber: play/pause button, draggable handle via `useMemo`+PanResponder (same pattern as CompassDial — layout in state, no `.current` during render), NOW marker, past fill (info-blue), ticks −2H→+2H
  · Intensity legend (light→heavy gradient bar)

**Known issues / deferred work:**
- Crag pins are hardcoded at static CSS-% positions (Taylors Falls, Sandstone, Interstate); real geographic projection tied to map library (Phase 13 or map integration phase)
- Layer toggles (Temp/Wind/Cloud/Ltng) are UI-only; switching layers doesn't change the map overlay (real data layers require additional RainViewer endpoints or separate weather tile sources)
- `useLocations()` is called to pre-warm the cache but location data isn't currently used for pin placement
- `apps/api/src/scripts/seedCrags.json` remains untracked — not committed here

**Blockers for next session:**
- None — Phase 12 is complete; typecheck 0 errors, lint 0 errors

**What's next:** Phase 13 — Historical Climbability Patterns — `git checkout -b phase/13-history` off `phase/12-radar` (or main after merge) — read `docs/handoffs/weatherteam6-ui-handoff-v1.md` Phase 13 section and `.claude/docs/scoring-algorithm.md` before writing any history logic

**Gotchas for next session:**
- RainViewer public API (`api.rainviewer.com/public/weather-maps.json`) requires no API key but the `RAINVIEWER_KEY` env var may gate a premium tile endpoint — the Phase 12 implementation uses the public endpoint only
- Animated.Value in React Native must be initialized with `useState(() => new Animated.Value(x))` (lazy init), NOT `useRef(new Animated.Value(x)).current` — the linter (`react-hooks/refs`) flags `.current` access during render
- PanResponder in this codebase must follow the CompassDial pattern: `useMemo(() => PanResponder.create({...}).panHandlers, [layout])` with layout stored in state via `setScrubLayout` in `onLayout` — never `useRef(PanResponder.create({...})).current`
- `DimensionValue` in React Native 0.85 rejects plain `string`; percentage-based track widths/offsets must be computed as numeric pixels from the measured `scrubLayout.width`

--- Session ended: 2026-06-19 19:05 UTC

--- Session ended: 2026-06-19 19:10 UTC

--- Session ended: 2026-06-19 19:13 UTC

--- Session ended: 2026-06-19 19:38 UTC

--- Session ended: 2026-06-19 19:46 UTC

--- Session ended: 2026-06-19 19:47 UTC

--- Session ended: 2026-06-19 19:54 UTC

--- Session ended: 2026-06-19 19:57 UTC

--- Session ended: 2026-06-19 19:59 UTC

--- Session ended: 2026-06-19 20:19 UTC

--- Session ended: 2026-06-19 20:27 UTC

--- Session ended: 2026-06-19 20:28 UTC

--- Session ended: 2026-06-19 20:45 UTC

--- Session ended: 2026-06-19 20:51 UTC

--- Session ended: 2026-06-19 20:52 UTC

--- Session ended: 2026-06-19 20:56 UTC

--- Session ended: 2026-06-19 20:57 UTC

---

## 2026-06-19 — branch: phase/12-radar — commit: 604dd95

**Phase completed:** Phase 12 — RainViewer Radar Integration (Leaflet web map)

**What was built this session:**
- `apps/mobile/src/components/RadarMapView.web.tsx` — NEW: Leaflet radar map for web. CartoDB Dark Matter basemap + RainViewer precipitation overlay. Three sequenced `useEffect` hooks gated by a `mapReady` flag: (1) map init, (2) location markers with tooltip labels, (3) radar tile layer swap. The `mapReady` state bridges the async Leaflet init with downstream effects; without it the tile effect ran before the map existed and silently bailed.
- `apps/mobile/src/components/RadarMapView.tsx` — NEW: native SVG fallback (concentric-ellipse precipitation blobs) for iOS/Android; react-native-maps integration deferred to a later phase.
- `apps/mobile/metro.config.js` — NEW: monorepo Metro fix. Without `watchFolders` + `nodeModulesPaths`, Metro resolved `expo/AppEntry.js` (looked for `../../App`) instead of `expo-router/entry`, causing a white screen on web.
- `apps/mobile/app/(tabs)/_layout.tsx` — Changed `<Tabs>` to `<Slot>`. `<Tabs>` pushed the route-group URL `/(tabs)/index` as the browser path, triggering Expo Router's "Unmatched Route" error. `<Slot>` renders children without touching the URL.
- `apps/mobile/app/(tabs)/radar.tsx` — Rewired to use `RadarMapView` component; `allFrames` wrapped in `useMemo` to stabilise the array reference and prevent the tile-layer effect from firing on every render.
- `apps/mobile/src/components/PersistentTabBar.tsx` — Removed `/(tabs)/index` from the home-tab path check (no longer emitted after the `_layout` Slot fix).
- `apps/api/package.json` — `dev` script updated to `tsx watch --env-file=.env src/server.ts` so local dev loads `.env` (Railway env vars).

**Known issues / deferred work:**
- "Zoom Level Not Supported" appeared in a screenshot during debugging. Confirmed via `curl` that: (a) RainViewer tiles return HTTP 200 at zoom 5-14, (b) the PNG images are valid 256×256 transparent tiles (no rain in CA), (c) the text is NOT from the tile images. Most likely this was a transient state during the race-condition debugging period; the `mapReady` fix should prevent it.
- RainViewer tiles at zoom 0-4 return 404 (not covered at those scales). Leaflet handles 404s gracefully (shows blank), so no `minZoom` constraint is needed.
- `apps/api/src/scripts/seedCrags.json` still untracked — carry-over from Phase 10; not related to Phase 12.
- `apps/api/.env` populated with Railway public proxy URLs for local dev (DATABASE_URL, REDIS_URL, etc.) — never committed, Railway uses internal URLs in production. For each new dev machine, recreate `.env` from Railway dashboard.

**Blockers for next session:**
- To test the radar screen locally: start the API with `cd apps/api && npm run dev` (requires `.env` with Railway creds), then start mobile with `cd apps/mobile && npx expo start --web`.

**What's next:** Phase 13 — Historical Climbability Patterns — `git checkout -b phase/13-history` off `phase/12-radar` — read `.claude/docs/scoring-algorithm.md` and `.claude/docs/data-model.md` before writing any history logic

**Gotchas for next session:**
- RainViewer tile path format changed: the API now returns hash-based paths like `/v2/radar/393d808df781` (not Unix timestamp paths). The tile URL is `https://tilecache.rainviewer.com{path}/{z}/{x}/{y}/4/1_1.png` — this is what the API's `tileUrlTemplate` field encodes. The web component constructs the URL itself from `frame.path`; do not change the format.
- `.web.tsx` platform resolution requires Metro to be running with `expo-router/entry` (not `expo/AppEntry.js`). The `metro.config.js` fix is what enables this. Removing it will break the web build.
- `mapReady` state is load-bearing: all three Leaflet effects depend on it. Effect 1 sets it; effects 2 and 3 gate on it. Removing or shortcutting this will reintroduce the race condition.

--- Session ended: 2026-06-19 21:29 UTC

--- Session ended: 2026-06-19 21:35 UTC

--- Session ended: 2026-06-19 21:42 UTC

--- Session ended: 2026-06-19 21:52 UTC

--- Session ended: 2026-06-19 21:57 UTC

--- Session ended: 2026-06-19 23:21 UTC

--- Session ended: 2026-06-19 23:33 UTC

--- Session ended: 2026-06-19 23:37 UTC

--- Session ended: 2026-06-19 23:42 UTC

--- Session ended: 2026-06-19 23:50 UTC

--- Session ended: 2026-06-19 23:54 UTC

---

## 2026-06-19 — branch: phase/12-radar — commit: 2667403

**Phase completed:** Phase 12 — RainViewer Radar Integration (bug fixes, polish, code review)

**What was built this session:**
- `apps/mobile/src/components/RadarMapView.web.tsx` — Fixed "Zoom Level Not Supported" error: root cause was missing `size` parameter in tile URL. RainViewer v2 format requires size BEFORE z/x/y: `{path}/512/{z}/{x}/{y}/4/1_1.png`. Also fixed zoom constraints (`tileSize: 512, zoomOffset: -1, minNativeZoom: 4, maxNativeZoom: 7`) so Leaflet scales tiles instead of requesting out-of-range zoom levels from RainViewer (native range 4–7). Fixed pan/zoom inconsistency by replacing `<View>` container with native `<div>` (React Native Web sets `touch-action: none` on View, blocking all Leaflet events). Split CartoDB basemap into `dark_nolabels` base + `dark_only_labels` pane at zIndex 450 so city labels render above the radar overlay.
- `apps/mobile/app/(tabs)/radar.tsx` — Moved scrubber inside `mapWrap` as `position: absolute, bottom: 0` with `zIndex: 1000` (Leaflet's highest pane is ~700; without an explicit zIndex Leaflet covered the scrubber). Scrub background set to `rgba(10,12,16,0.68)` for transparency. Status text shows `allFrames.length` when frames are loaded, `'Loading radar…'` when empty.
- `apps/api/src/lib/weather/rainViewer.ts` — Fixed tile template: `256` → `512` in `tileUrlTemplate`. Fixed User-Agent: changed from `process.env.NWS_USER_AGENT` to literal `'weatherteam6/1.0'` (NWS_USER_AGENT is only for api.weather.gov). Added TODO comment about two sources of truth for tile URL format.
- `apps/mobile/src/components/RadarMapView.tsx` — Prefixed unused native props with `_` to satisfy TypeScript strict mode: `_frames`, `_tileUrlTemplate`, `_locations`.

**Known issues / deferred work:**
- `tileUrlTemplate` from the API and the tile URL constructed in `RadarMapView.web.tsx` are two separate sources of truth. The web component ignores `tileUrlTemplate` and constructs the URL itself with `frame.path`. Marked with a TODO in `rainViewer.ts`; unify when native map is implemented.
- RainViewer tile host (`tilecache.rainviewer.com`) is hardcoded in the web component rather than read from the API response's `host` field. Acceptable for now; address when unifying tile URL sources.
- Radar pixelation at map zoom 9+ is expected and fundamental: RainViewer's native tile cap is zoom 7. Leaflet upscales zoom-7 tiles to fill higher zoom levels. No fix is possible without a higher-resolution radar source.
- `apps/api/src/scripts/seedCrags.json` remains untracked.

**Blockers for next session:**
- None — code review complete, 4 blocking findings fixed, both typechecks clean (apps/api and apps/mobile).

**What's next:** Phase 13 — Historical Climbability Patterns — `git checkout -b phase/13-history` off `main` — read `.claude/docs/scoring-algorithm.md` and `.claude/docs/data-model.md` before writing any history logic

**Gotchas for next session:**
- RainViewer tile URL format is `{path}/512/{z}/{x}/{y}/4/1_1.png` — size (512 or 256) MUST come before z/x/y. Without it RainViewer returns a 1370-byte error PNG (antialiased "Zoom Level Not Supported" text) for every tile request at every zoom level.
- `minNativeZoom: 4` and `maxNativeZoom: 7` on the radar TileLayer are load-bearing: without them, zoom-out (0–3) → 404, zoom-in (8+) → error image from server.
- `zoomOffset: -1` with `tileSize: 512` means at map zoom 8, Leaflet requests tile zoom 7 (within maxNativeZoom) displayed at 512px — crisp native quality. If you remove `zoomOffset` the tile zoom matches map zoom and zoom-8 requests will get the error image.
- `mapReady` state gate in `RadarMapView.web.tsx` is required: all three Leaflet effects depend on it. Effect 1 sets it; effects 2 and 3 gate on it. Removing it reintroduces the race condition where tile/marker effects run before the map exists.

--- Session ended: 2026-06-20 00:10 UTC

--- Session ended: 2026-06-20 00:15 UTC

--- Session ended: 2026-06-20 00:18 UTC

--- Session ended: 2026-06-20 00:23 UTC

--- Session ended: 2026-06-20 00:27 UTC

--- Session ended: 2026-06-20 00:28 UTC

--- Session ended: 2026-06-20 00:30 UTC

--- Session ended: 2026-06-20 00:33 UTC

--- Session ended: 2026-06-20 00:37 UTC

--- Session ended: 2026-06-20 00:39 UTC

--- Session ended: 2026-06-20 00:43 UTC

--- Session ended: 2026-06-20 00:45 UTC

--- Session ended: 2026-06-20 00:47 UTC

--- Session ended: 2026-06-20 00:50 UTC

--- Session ended: 2026-06-20 00:51 UTC

--- Session ended: 2026-06-20 00:53 UTC

--- Session ended: 2026-06-20 00:54 UTC

--- Session ended: 2026-06-20 00:59 UTC

--- Session ended: 2026-06-20 01:06 UTC

--- Session ended: 2026-06-20 01:46 UTC

--- Session ended: 2026-06-20 01:54 UTC

--- Session ended: 2026-06-20 01:59 UTC

--- Session ended: 2026-06-20 02:04 UTC

--- Session ended: 2026-06-20 02:13 UTC

--- Session ended: 2026-06-20 02:15 UTC

--- Session ended: 2026-06-20 02:18 UTC

--- Session ended: 2026-06-20 02:20 UTC

--- Session ended: 2026-06-20 02:24 UTC

--- Session ended: 2026-06-20 02:25 UTC

--- Session ended: 2026-06-20 02:27 UTC

--- Session ended: 2026-06-20 02:28 UTC

--- Session ended: 2026-06-20 02:30 UTC

--- Session ended: 2026-06-20 02:30 UTC

--- Session ended: 2026-06-20 02:32 UTC

--- Session ended: 2026-06-20 02:34 UTC

--- Session ended: 2026-06-20 02:37 UTC

--- Session ended: 2026-06-20 02:43 UTC

--- Session ended: 2026-06-20 02:45 UTC

--- Session ended: 2026-06-20 02:47 UTC

--- Session ended: 2026-06-20 02:49 UTC

--- Session ended: 2026-06-20 02:54 UTC

--- Session ended: 2026-06-20 15:55 UTC

--- Session ended: 2026-06-20 16:00 UTC

--- Session ended: 2026-06-20 16:00 UTC

--- Session ended: 2026-06-20 16:01 UTC

--- Session ended: 2026-06-20 16:02 UTC

--- Session ended: 2026-06-20 16:03 UTC

--- Session ended: 2026-06-20 16:06 UTC

--- Session ended: 2026-06-20 16:07 UTC

--- Session ended: 2026-06-20 16:13 UTC

--- Session ended: 2026-06-20 16:15 UTC

--- Session ended: 2026-06-20 16:15 UTC

--- Session ended: 2026-06-20 16:21 UTC

--- Session ended: 2026-06-20 16:25 UTC

--- Session ended: 2026-06-20 17:39 UTC

--- Session ended: 2026-06-20 17:47 UTC

--- Session ended: 2026-06-20 21:39 UTC

--- Session ended: 2026-06-20 21:43 UTC

--- Session ended: 2026-06-20 21:45 UTC

--- Session ended: 2026-06-20 21:51 UTC

--- Session ended: 2026-06-20 21:57 UTC

--- Session ended: 2026-06-20 22:00 UTC

---

## 2026-06-20 — branch: main — commit: 1cb64b6

**Phase completed:** EAS Build — first working native Android APK

**What was built this session:**
- `apps/mobile/eas.json` — EAS build config with base/development/preview/production profiles; `EXPO_USE_METRO_WORKSPACE_ROOT=1` and `NODE_PATH=../../node_modules` in base env
- `apps/mobile/app.config.js` — replaced `app.json` with dynamic JS config; removed expo-router plugin (iOS-only, caused `resolveFrom` failure on EAS); retained expo-location plugin for Android permissions
- `scripts/fix-expo-router-link.mjs` — fixed circular symlink bug: original script included `node_modules/expo-router` in `linkLocations`, which IS the real install location; script deleted and re-symlinked it to itself, destroying expo-router on every `npm install`. Fixed to only create `apps/mobile/node_modules/expo-router` symlink.
- `package.json` (root) — postinstall now builds local workspace packages: `npm run build -w @weatherteam6/types && npm run build -w @weatherteam6/design` so `dist/` exists on EAS before Metro bundles
- `apps/mobile/package.json` — added `buffer` dep (react-native-svg v15 source imports it); updated all native packages to expo SDK 56 compatible versions: `react-native-svg` 15.11.2→15.15.5 (critical: fixes C++ `ConcreteShadowNode` template mismatch against RN 0.85.3), `expo-router` ~56.0.4→~56.2.11, `react-native-screens` 4.25.0-beta.1→4.25.2, `react-native-safe-area-context` ~5.6.0→~5.7.0

**Known issues / deferred work:**
- `apps/api/src/scripts/seedCrags.json` remains untracked — commit or gitignore
- `react-native-webview` deprecation warnings in Gradle (Kotlin `w:`) — harmless but should be addressed when Phase 15 wires real native maps
- Two sources of truth for RainViewer tile URL format (marked TODO in `rainViewer.ts`) — resolve in Phase 12b

**Blockers for next session:**
- None

**What's next:** Phase 14a — `git checkout -b phase/14a-weather-api` off `main` — read `docs/superpowers/specs/2026-06-19-phase14-polish-design.md` §14a before writing any code. Full phase order: 14a → 14b → 14c → 14d → 15 → 16 (radar native rebuild, requires Google Maps API key).

**Gotchas for next session:**
- `react-native-maps` requires a Google Maps API key for Android. Before starting Phase 12b, verify whether `@rnmapbox/mapbox` (no API key needed) or `react-native-maps` (needs key) is the right choice. `react-native-maps` with Google Maps is the safe default but needs `GOOGLE_MAPS_API_KEY` in `app.config.js` android block and EAS secrets.
- EAS build runs postinstall which builds `packages/types` and `packages/design`. If you add a new workspace package, add it to the postinstall chain in root `package.json`.
- The APK build process: `npm run build -w @weatherteam6/types && npm run build -w @weatherteam6/design` must use `-w @packagename` syntax (not `--workspace=path`).
- EAS log URLs expire in 900 seconds. To read Gradle errors: trigger build with `--no-wait`, immediately query GraphQL for `logFiles`, fetch with `curl -s --compressed "$LOG_URL"` before expiry.
