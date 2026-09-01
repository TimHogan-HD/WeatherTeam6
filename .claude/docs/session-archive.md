---

## 2026-08-26 (later) — branch: fix/initdata-signature-in-check-string — squashed to `main` as `5c41a44` (PR #43)

**Phase completed:** production incident. The Mini App had never once been able to call
the API; found by reading Vercel runtime logs after the first real Telegram launch.

**Symptom:** the alert deep link opened the Mini App on the right screen and it said
"Couldn't load this location." Logs: **17 × 401 in two hours, every one
`tma invalid: hash mismatch`** — the menu button's `GET /locations` as well as the deep
link's three calls. Not a Task 7 bug; it predates it.

**Cause.** Telegram documents two validations that exclude different fields:
- bot-token HMAC-SHA256 (what this app does): "a chain of **all** received fields",
  minus `hash` only.
- Ed25519 third-party (what this app does **not** do): all fields "except `hash` and
  `signature`".

`buildDataCheckString` applied the Ed25519 exclusion. Clients from Bot API 7.10 on send
`signature` on every launch, so the check string was a field short and the HMAC never
matched.

**Why nothing caught it — the part worth remembering.** `signInitData` in
`initData.test.ts` built the check string with the *same* mistake, so 11 tests passed
against a validator that could not validate anything real. One of them,
`ignores a 'signature' field, which Telegram excludes from this check`, asserted the bug
as intended behaviour. **A crypto validator tested only against its own signing helper
proves nothing.** The Task 6 note claiming auth was "verified over real HTTP" was true
only of synthetic payloads.

**What changed:**
- `initData.ts` — the filter now excludes `hash` only.
- `initData.test.ts` — the helper signs whatever fields it is given, so the replacement
  test signs a payload *with* `signature` the way a real client does. Two more: a
  tampered `signature` is rejected, and a launch with no `signature` still validates
  (older clients).
- `apiAuth.ts` — on a hash mismatch, logs the initData field **names** (never values).
  A mismatch is otherwise undiagnosable from outside; this would have pointed straight
  at `signature`.
- `architecture.md` — the invariant said `signature` is excluded. That is the rule the
  implementation was written from. Replaced, plus the self-generated-fixture warning.

**What was verified, and how:**
- **Fail-then-pass, not just green.** Reintroducing the old filter makes the new test
  fail (`1 failed | 12 passed`); restoring the fix passes 13. A green suite over this
  path proved nothing before, so it was checked in the direction that matters.
- **The fix is live and serving.** Production deployment `dpl_94Xx…` (`5c41a44`) holds
  the alias, and a forged-hash probe produced the new log line
  `"fields":"auth_date,hash,signature,user"` — which proves the new code is the one
  answering, with no credential involved.
- 210 API tests pass; typecheck 4/4, lint 5/5, build 4/4.

**✅ CONFIRMED ON A REAL DEVICE, 12:52 the same day.** The fix works. Runtime logs for the
20 minutes after it went live: **25 × 200 and one 201, no `tma` 401s.** Everything below
ran inside Telegram against the real database, all of it for the first time:
- `GET /locations` — the list screen, three seeded locations with live weather.
- `GET /locations/:id`, `GET /forecast/:id`, `GET /alerts/:id` — saved detail, including
  a real Severe NWS alert banner and the computed sources footer
  (`Open-Meteo (gfs_seamless, ecmwf_ifs025, icon_seamless_eps, gem_global)`, `ACIS (KLAS)`,
  `NWS` — NWS named only because an alert was genuinely present).
- `GET /geocode`, `GET /preview`, `POST /locations` (**201**) — the add flow, run by the
  user end to end.
- `DELETE /locations/:id` (**200**) — **the first real exercise of
  `deleteLocationCascade`.** It returned 200, not the foreign-key 500 that path exists to
  prevent. That code had never run against real data with dependents.

So the two long-standing "never verified" items from Task 6 are now closed, and the alert
deep link is confirmed end to end: cron → alert message → `url` button → detail screen
with data.

**Known issues / deferred work:**
- **Issue #21 is now visible on screen, and it is worse than the note said.** See the
  next session block's ranking — the temperature component is *already saturated at
  zero* for all three locations, so it distinguishes nothing.

**Blockers for next session:** none.

**What's next: a deep review, debug and cleanup session — and it is the whole session.**
The user's words: *"a deep review and debug and clean up chat so that we have a clean base
and polished repo to move forward with feature updates."* Start a fresh chat for it. No
new features until it lands. Then, in order: polish and Mini App adjustments; new bot
commands and text-based weather updates (a design conversation the user wants to have,
not a spec to write alone); an in-app feedback button that writes a note into this repo.

**Do not touch the score algorithm.** #21's scoring half is explicitly deferred by the
user. The diagnosis is complete and the options are named — leave it there, and do not
let it ride along inside a cleanup change.

**Brief for that review session — where the bodies are, from this session's evidence:**
- **Audit for the initData failure mode, which is a *class*, not one bug: tests that
  mirror the implementation.** `signInitData` and `validateInitData` shared a
  misunderstanding, so 11 green tests covered a validator that could not validate
  anything real. Ask of every test fixture: *was this generated by the same understanding
  as the code it checks?* `deepLink.test.ts` on both sides has the same shape.
- **`DELETE /trips/:tripId` still 500s** when the trip has locations — `trip_locations`
  references `trips` and the delete does not clear dependents. It is the known twin of
  `deleteLocationCascade`, which *was* confirmed working on real data this session.
  `architecture.md` documents the gap.
- **#27 — the webhook is gated only by a forgeable `chat.id` in the request body.** The
  cheapest real security win available; `secret_token` is the fix. No `update_id` dedupe
  either.
- **#25 — `/history` and `/normals` return `[]` forever.** Deleting the `rainfallHistory`
  worker removed the only writer. Needs a design call, and both routes are on the
  clients' do-not-call list meanwhile.
- **Dead code with live documentation around it:** `fetchNBM` is exported, tested and
  called by nothing (deliberate — read the comment before removing). `ScoreInput.currentTempC`
  is read by no scorer. `ScoreInput` conflates the humidity component with the drying
  humidity modifier in one field.
- **The Mini App has no DOM in its tests** — deliberate, but it means every interaction
  (taps, keyboard activation, the back stack) is unverified except by reasoning.
- **`apps/mobile` is out of the build but still a workspace member**, still in
  `package-lock.json`, and still carries the `fix-expo-router-link` postinstall. That is
  intentional; confirm it is still what is wanted rather than assuming.
- Cosmetic, low confidence, user's call: the Mini App's `Wind to` stat label renders
  uppercased as **"WIND TO"**, which reads like a truncation rather than "wind up to".
  Deliberate in `Weather.tsx`; worth a second opinion, not a unilateral change.

**Gotchas for next session:**
- **Vercel runtime logs are the debugging tool this project was missing.** Two hours of
  401s with a precise `why` field turned an unreproducible "it doesn't work" into a
  one-line fix. Reach for them before theorising.
- **Check `dep=` in a log line before trusting a probe.** The first probe after merging
  hit the *previous* deployment — the alias had not flipped yet — and would have read as
  "the fix didn't work".
- **`git` pathspecs are relative to the shell's cwd**, which persists across Bash calls.
  A `git diff -- apps/...` after an earlier `cd apps/miniapp` silently matched nothing
  and printed an empty diff, which looks exactly like "no changes".

**Does the user need to do anything?** **No.** They already did the two things only they
could: registered cron-job.org, and opened the Mini App on a real phone to confirm the
fix. Everything outstanding is work, not a user action — except the score-algorithm
product decision, which they have explicitly chosen to defer.

---

## 2026-08-26 — branch: claude/task-7-deep-link-archive — squashed to `main` as `51937d5` (PR #42)

**Phase completed:** Crossover Task 7 — alert deep link + `apps/mobile` archived. **This
was the last task in `telegram-crossover-v4.md`; the crossover is finished.**

**What was built this session:**

*(b) Archive — done first, it is mechanical:*
- `apps/mobile/package.json` — `build`, `dev`, `typecheck`, `lint` and `test` scripts
  removed. Only the four Expo launch commands remain. **This is the whole fix.** Turbo
  runs whatever scripts a workspace member declares, so a package with none is skipped.
- `turbo.json` — the `@weatherteam6/mobile#build` override deleted as dead config. It
  only ever zeroed the task's *outputs*; `tsc --noEmit` kept running underneath it.
  Confirmed before touching anything: `turbo run build --dry` showed
  `@weatherteam6/mobile#build | tsc --noEmit`.
- `apps/mobile/ARCHIVED.md` — date, reason, what "left the build" means, and what was
  left in place on purpose (workspace membership, the `fix-expo-router-link` postinstall,
  the `apps/mobile/**` block in `eslint.config.mjs`).

*(a) Deep link — API:*
- `apps/api/src/lib/telegram/deepLink.ts` — NEW, pure. `locationDeepLink` and
  `alertKeyboard`. Base `https://t.me/WeatherTeam6_bot/Alert` is a constant: neither the
  bot username nor the Direct Link short name is derivable from `TELEGRAM_BOT_TOKEN`, and
  making it an env var would have added a deploy step for a value that never changes.
- `apps/api/src/lib/telegram/sendMessage.ts` — optional `replyMarkup`, typed narrowly as
  rows of url buttons. Omitted from the body entirely when absent.
- `apps/api/src/lib/alerts/checkAlerts.ts` — `notifyPendingAlerts` now selects
  `location_id` and passes `alertKeyboard(alert.locationId)`. Per-alert, not hoisted.

*(a) Deep link — Mini App:*
- `apps/miniapp/src/lib/deepLink.ts` — NEW. `parseLocationStartParam`, `readStartParam`,
  `applyDeepLink`. Pure apart from `applyDeepLink`, which takes the History object rather
  than reaching for `window` — that is what makes the back-stack behaviour testable in a
  workspace with no DOM.
- `apps/miniapp/src/main.tsx` — one line, **before** `createRoot`.

**Two decisions worth knowing:**
- **`alertKeyboard` returns `null` for a non-uuid id rather than a best-effort url.** A
  malformed button url is a 400; `sendTelegramMessage` treats 400 as non-retryable;
  `notifyPendingAlerts` then releases the claim and re-sends the identical broken message
  forever. A bad link would cost the whole alert, not just the button.
- **The deep link runs pre-mount, not in an effect.** `BrowserRouter` then reads
  `/location/:id` as its initial location so the list never flashes, and a `<StrictMode>`
  double-invoked effect cannot push the detail entry twice — which would have left
  BackButton going from detail to detail.

**What was verified, and how:**
- **The archive half is genuinely confirmed.** `turbo run build|typecheck|lint|test|dev`
  now resolve `@weatherteam6/mobile` to `<NONEXISTENT>` and skip it; `turbo run build`
  executes four tasks instead of five.
- **The t.me link resolves, with no credential needed.** `curl` on
  `https://t.me/WeatherTeam6_bot/Alert?startapp=loc_<uuid>` returns
  `tg://resolve?domain=WeatherTeam6_bot&appname=Alert&startapp=loc_<uuid>` — the bot
  username exists and the UUID survives Telegram's own parsing **with its dashes**.
  **What that check does NOT prove:** a control request with `NoSuchApp` returned the
  same 200 and echoed the bogus name, so t.me does not validate the short name
  server-side. That `Alert` is registered rests on the user having run `/newapp`.
- The built bundle contains the deep-link code, and `vite preview` serves `/`,
  `/location/<uuid>` and `/?tgWebAppStartParam=…` all as 200 (SPA rewrite intact).
- 25 new tests. Repo total 275 (was 250), all passing. Typecheck 4/4, lint 5/5, build 4/4.

**Known issues / deferred work:**
- **Nothing has been seen inside Telegram.** No preview-deploy path, so the round trip
  only happens after this reaches production.
- **No real alert has carried the button.** `weather_alerts` is empty because
  cron-job.org is still unregistered. The wiring in `notifyPendingAlerts` is the one line
  in this change with no test behind it — it imports `db`, so vitest cannot reach it.
- **The bot username is hardcoded.** If `@WeatherTeam6_bot` is ever renamed, the button
  silently links nowhere. Documented at the constant.
- The "standing CI ESLint failure" this task was expected to clear **was already fixed**
  before the session — `npm run lint` was green at `7d6ee55`. Removing mobile from the
  run is still right, but it did not clear a live failure.
- All five issues (#21, #22, #25, #26, #27) unchanged by this session.

**Blockers for next session:**
- None. There is no next crossover task.

**What's next:** the crossover is done, so the next session is issue work rather than a
phase. Ranked: **#21's scoring half** (heat costs at most 12 of 100 points and saturates
above 35 °C — the copy is honest about it, the number is still wrong), then #25/#27.
Register cron-job.org first if any alert-surface work is planned, since nothing about
alerts can be observed until `weather_alerts` is populated.

**Gotchas for next session:**
- **The CRLF scripting trap bit again, and it reported success.** A Node script doing
  three string replacements on CRLF files matched only the single-line one; the two
  multi-line searches silently failed, and the guard (`if (s === orig)`) still passed
  because *one* replacement had landed. The result typechecked as a reference to an
  undeclared `replyMarkup`. **Use the Edit tool for anything spanning more than one
  line**, and if you must script it, assert every replacement individually.
- **`turbo.json` cannot remove a workspace from a task graph.** Verified, not assumed.
  The override that looked like it did the job only set `outputs: []`.
- **t.me will echo any Direct Link short name back at you with a 200.** It is a useful
  check for the *bot username* and for parameter passthrough, and worthless as a check
  that the app is registered.
- `LocationDetail`'s BackButton calls `navigate('/')` — a push, not `history.back()`. So
  the acceptance criterion holds through that path regardless of stack depth; the
  `replaceState('/')` matters for the *platform* back gesture, which is what would
  otherwise close the Mini App.

**Does the user need to do anything?** **Yes.** Two, both only they can do:
1. **Open an alert deep link on a real phone** once this is on production — that is the
   only way the tap half of the acceptance criterion gets confirmed.
2. **Register cron-job.org** to hit `POST /api/cron/check-alerts` with `CRON_SECRET`.
   Until then `weather_alerts` stays empty and no alert message — button or not — is
   ever sent.

---

## 2026-08-26 — Task 6 closed out — `main`

**Phase completed:** Task 6 is merged, deployed and verified. Docs reconciled. Task 7 unblocked but **not started** — the user stopped it deliberately so it can run in a fresh session.

**`/newapp` is done.** The Direct Link Mini App is registered with short name **`Alert`**:

```
https://t.me/WeatherTeam6_bot/Alert?startapp=<param>
```

Every doc that said "`/newapp` has not been run" is corrected. This was Task 7's only
hard blocker.

**Telegram contract settled for Task 7, so it does not get re-derived:**
- **Use a plain `url` inline keyboard button** pointing at the t.me link — **not a
  `web_app` button.** `startapp` is a Direct Link Mini App mechanism; a `web_app` button
  opens an inline-button Mini App and does not deliver `start_param`.
- **`initData` IS populated on a direct-link launch** (verified against
  core.telegram.org/bots/webapps). Load-bearing: if it were not, the deep link would open
  the app and every `/api/v1/*` call would 401 against the `tma` scheme with nothing on
  screen to explain it.
- The parameter arrives twice — `initDataUnsafe.start_param` and the `tgWebAppStartParam`
  GET parameter. Read the first, fall back to the second.

**A misstep worth recording:** I sent the user to run `/newapp` without first checking
whether a `web_app` button carrying `https://weatherteam6.vercel.app/location/<uuid>`
would have done the job without it. It would have — the app's own router handles that
path. The work was not wasted (the direct link is shareable and is what §2 specifies, and
`web_app` would not deliver `start_param` anyway), but the ordering was wrong: verify the
API surface before asking the user to configure something.

**Known issues / deferred work:** unchanged from the entries below. #21's scoring half,
#25 and #27 are open; cron-job.org is still unregistered, so `weather_alerts` is never
populated and both clients' alert surfaces remain untestable.

**What is next:** Task 7 — `git checkout -b claude/task-7-deep-link-archive` off `main`.
Read `docs/handoffs/telegram-crossover-v4.md` § Task 7 first; the settled Telegram detail
is there rather than in this entry.

**Does the user need to do anything?** Not for Task 7 — it is fully unblocked. Two things
remain theirs and neither blocks it: **registering cron-job.org** (without it
`weather_alerts` is empty, so a deep link from an alert cannot be tested end to end), and
**opening the Mini App on a real phone** — all three Task 6 screens are live and have
never been seen inside Telegram.
---

## 2026-08-26 — process hardening — `main`

**Phase completed:** two standing rules written into the docs, at the user's request. No code.

**1. `.claude/rules/defect-patterns.md` — NEW, and mandatory reading before reviewing any diff.**
A catalogue of the ten defect *classes* that have actually shipped here, each with a real
example and what to grep for: a missing value rendered as a plausible one, a failure state
that reads as success, attribution not backed by the data, one value reused across a loop
needing per-item values, a string literal that needs escaping, nested interactive elements,
state read before it settles, a permissive type that silently discards data, an upstream
call that can never succeed, and a dead field reasoned about as if it were live.

It exists because **every defect this project has shipped passed every automated gate in
the repo.** Ten in one session on 2026-08-26, six the session before. Reading the diff is
the only control that has ever caught them, and it is now Gate 0 of the review checklist
rather than a step at the end.

**2. Every report ends with a handoff block.** CLAUDE.md § Reporting Work now requires a
"Do you need to do anything?" section (Yes/No, in bold, first) and a "Next step" section
on every recap, summary and PR body — not just session ends. "Yes" is reserved for what
the user alone can do; unstarted work is a next step, not a user action. The session-end
block format gained the same line, and the checklist gained a Reporting section.

**Why:** the user was having to read full reports to work out whether a ball was in their
court, and twice said nothing in a recap looked like it needed them.

**Files touched:** `.claude/rules/defect-patterns.md` (new), `CLAUDE.md`,
`.claude/rules/review-checklist.md`, `.claude/rules/architecture.md`.
---

---

## 2026-08-26 — merged and verified in production — `main` @ `7fc962d`

**Both PRs merged:** #39 (auth) as `f48bad0`, #41 (screens + ten fixes) as `63b92dd`.
PR #40 was auto-closed by GitHub when the auth branch was deleted on merge; #41 is the
same work rebased onto `main`. Both Vercel projects deployed `7fc962d` successfully.

**Verified against production, not assumed:**

- **The `tma` scheme is live and fully configured.** A forged-hash probe to
  `GET /api/v1/locations` logged `"why":"tma invalid: hash mismatch"` — **not**
  `"tma unconfigured"`. That one field proves three things at once: the new code is
  deployed (the field exists only in it), `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
  are both present in the API project (otherwise it short-circuits before validating),
  and the HMAC validator ran and rejected the forgery. The earlier unauthenticated
  probe logged `"bad or missing bearer"`, so the Bearer path is intact alongside it.
- **The deployed Mini App bundle is the Task 6 build.** Every marker present —
  `tma `, `Dry, settled`, `limited by `, `No conditions for today yet`,
  `Climbing area`, `Enter coordinates instead`, `no rain in 30+ days` — and the Task 5
  placeholder string is gone. **Zero credentials in it.**
- `API_SHARED_SECRET` and `DEFAULT_USER_ID` are both set: an unauthenticated call
  returns 401, not the 503 of a missing secret or the 500 of a missing user id.

**Still not verified, and it needs a phone:** nothing has been opened inside Telegram.
The list and saved-detail screens have still never rendered real data — every probe
above stops at the auth boundary, because there is no way to hold a valid `initData`
outside a real Telegram launch.

**What is next:** Task 7 — deep link + archive `apps/mobile`. It needs `/newapp` run in
@BotFather first. cron-job.org is still unregistered, which means `weather_alerts` is
not being populated — worth doing before judging the alert surfaces, since both
clients read that table.
## 2026-08-26 (continued) — branch: claude/task-6-miniapp-screens — squashed to `main` as `63b92dd` (PR #41)

**Phase completed:** continuous review of Task 6 and of the wider codebase, with fixes. No new features.

**Nine defects found and fixed. Every one passed typecheck, lint and the test suite.**

*In this session's own Task 6 code:*
- Keyboard activation of the list card's retry button opened the location instead of retrying — keydown bubbles to the card, and its `preventDefault()` cancelled the inner button. Now ignores key events not originating on the card.
- The score could render before the alerts query settled, briefly showing an unsuppressed score for a location under an active Severe+ warning — the exact state §7 rule 4 exists to prevent. Both the card and the detail screen now wait.
- A failed alerts fetch read as "no alerts" on the list card.
- `request()` accepted a `Headers` instance it would silently discard, dropping the Authorization header and turning every call into a 401 that looks like an auth bug.

*Live Telegram bugs:*
- **Unescaped HTML in every outgoing message (#26).** An `&` in an NWS headline is a 400, which is non-retryable, so `notifyPendingAlerts` released the claim and retried the identical broken message every 15 minutes forever.
- **`/start` and the usage reply had never been delivered.** Both contain `<location name>`, which Telegram rejects as an unsupported start tag. Not previously filed — found while auditing the escaping.
- **A malformed 200 from NWS deleted every stored alert (#26).** `fetchNwsAlerts` returned `[]`, contradicting its own contract, and `runAlertsCheck` acted on it by deleting the location's rows — `notified_at` with them, so the same alert re-sends.

*Forecast and scoring:*
- **#22 diagnosed and closed.** Open-Meteo defines no NBM precipitation quantiles under any name — verified variable by variable against the live API. The NBM branch could never have returned data; the call is removed. Two upstream fetches per request now, not three.
- **Every day's wind component was computed from today's wind.** A day-7 score reported a wind rating measured six days earlier, and all seven days carried an identical wind component.

**Also done:** the §7 copy model applied to the bot (`statusLabel()` deleted, shared ladder and suppression imported, sources computed, no score for a non-climbing location). Two pure modules extracted — `lib/telegram/alertMessage.ts` and `conditionsMessage.ts` — because `checkAlerts.ts` and `conditionsReply.ts` import `db`, which throws at import time without `DATABASE_URL` and takes any test importing it down.

**Test coverage went from 215 to 250.** `computeLiveForecast` had none at all despite being the path every conditions and forecast response takes; it has 10 now.

**Known issues / deferred work:**
- **#21's scoring half is still open** and is the one that matters most: heat costs at most 12 of 100 points and saturates above 35 °C. The copy is honest about it now; the number is still wrong.
- **#25 and #27 untouched.**
- **New, filed in plan.md:** `ScoreInput` uses one field for both the humidity component and the drying humidity modifier, so per-day humidity cannot be fixed without moving the drying calculation too.
- Still nothing confirmed inside Telegram, and the list and saved-detail screens still have not run against real data.

**Gotchas for next session:**
- **Nothing here was caught by a tool.** Nine defects, all passing typecheck, lint and the suite. Reading the diff is the control that works.
- **`fetchNBM` is still exported and still tested, and is called by nothing.** That is deliberate — restoring it is one line if Open-Meteo ever exposes quantiles. Do not "clean it up" without reading the comment at its old call site.
- **A string literal needs HTML escaping too.** `/start` proves it.
- **Check the whole file's line endings before scripting a multi-line replacement.** One `sed`-style edit left a lone `` mid-line that typechecked fine and read as a merged import.
---

## 2026-08-26 — branch: claude/task-6-miniapp-screens — commits: `63b92dd` (screens, PR #41), `f48bad0` (auth, PR #39)

**Phase completed:** Crossover Task 6 — Mini App screens + `initData` auth. Two commits, auth first and on its own.

**What was built this session:**

*Auth (merged to `main` as `f48bad0`, PR #39 — branch `claude/miniapp-initdata-auth`, since deleted):*
- `apps/api/src/lib/telegram/initData.ts` — NEW. `validateInitData(raw, botToken, nowMs?)`, pure: no env reads, no Express types. HMAC-SHA256 with the `WebAppData`-derived secret key.
- `apps/api/src/middleware/apiAuth.ts` — a **second accepted scheme** on the same header: `Authorization: tma <initDataRaw>` alongside `Bearer $API_SHARED_SECRET`. The Bearer path is unchanged and an unset shared secret still 503s under **both** schemes.
- The signed `user.id` is checked against `TELEGRAM_CHAT_ID`. Without it, any Telegram account that found the bot would hold `DEFAULT_USER_ID`'s rights.
- 27 tests across `initData.test.ts` and `apiAuth.test.ts`.

*Screens (merged to `main` as `63b92dd`, PR #41):*
- `packages/types/src/units.ts` — §4 formatters, every input `number | null`.
- `packages/types/src/conditionsCopy.ts` — §7 state ladder, suppression rule, `formatHoursSinceRain`'s 30-day cap. Shared so the bot can use them.
- `packages/types/src/scoreComponents.ts` — `SCORE_COMPONENT_MAX` moved out of `index.ts` so the copy model imports it without a cycle. Still re-exported.
- `apps/miniapp/src/lib/api.ts`, `src/hooks/*` — the only `fetch` in the app, and every call through a React Query hook.
- `apps/miniapp/src/components/*` — `DetailView` (shared by saved detail and the unsaved preview), `LocationCard`, `ScoreSection`, `Weather`, `Alerts`, `SaveBar`, `SourcesFooter`, `States`, `Icons`.
- `apps/miniapp/src/routes/*` — all three real; `ScreenScaffold.tsx` deleted.
- `apps/miniapp/src/theme/styles.ts` — the per-entry `components` audit §0a asks for. `withOpacity` exported from the adapter so the alert tint derives from `colors.poor` rather than introducing a colour.
- `vitest` added to `packages/types` and `apps/miniapp`, node environment only.

**What was verified, and how:**
- **Auth, over real HTTP against a locally run API:** no credential 401, owner `initData` 200, another Telegram user's *validly signed* initData 401, stale (>24 h) and tampered initData 401, `Bearer` still 200, unset `API_SHARED_SECRET` 503 under both schemes, and `/api/cron/*` + `/api/telegram/*` unaffected.
- **The add flow, end to end against real upstreams:** `GET /geocode?q=red rock canyon` returned the three different parks (Oklahoma 480 m, California 738 m, Nevada 1200 m); `GET /preview` with the Nevada elevation returned 7 days in 3.9 s; the client's own helpers formatted every row. **This exercised `fetchArchivePrecip` for the first time** — the previously-unrun branch the last session's gotcha predicted a bug in. No bug; the lapse-rate correction showed as 104 °F vs 103 °F with and without elevation.
- 50 new tests (22 in `packages/types`, 28 in `apps/miniapp`). Repo total 215, all passing. Typecheck 7/7, lint 5/5, Mini App bundle builds and contains no credential.

**Known issues / deferred work:**
- **The list and saved-detail screens have never been run against real data.** Both need a database and there is no local one. Their display logic is covered by fixture-based render tests; the wiring to `/locations`, `/conditions/:id` and `/alerts/:id` is not.
- **Nothing has been opened inside Telegram yet.** There is no preview-deploy path, so the Telegram round trip only happens after this ships to production.
- **The bot's `statusLabel()` is untouched** and still maps score to an opinion, violating §7 rule 1 on that surface. It is issue #21's other half and travels with #26's HTML escaping fix — doing it here would have turned a UI task into a live-bot change.
- An unsaved preview shows **no alert banner**: `/alerts/:id` keys on a saved location id and there is no preview equivalent. It correctly does not claim NWS as a source either.
- All five issues (#21, #22, #25, #26, #27) still open. #22 re-confirmed live this session — `model_sources` came back as the ensemble, never NBM.
- cron-job.org still unregistered. `/newapp` still not run in @BotFather (Task 7 needs it).

**Blockers for next session:**
- None for Task 7. It needs `/newapp` run in @BotFather before the `startapp` deep link can be tested.

**What's next:** Task 7 — `git checkout -b claude/task-7-deep-link-archive` off `main` — read `docs/handoffs/telegram-crossover-v4.md` § Task 7 and the turbo/lint correction in the 2026-08-24 entry below (removing `apps/mobile` from the build is a `package.json` scripts change, not a `turbo.json` one).

**Gotchas for next session:**
- **Four defects in this session's own code were found by reviewing the diff, not by any tool.** All four passed typecheck, lint, and the test suite: a `<button>` nested inside the card's `<button>`, a fixed save bar with a guessed 260px clearance that the rock-type row would have overflowed, alerts failing silently instead of visibly, and `NWS` named as a source when the alerts call had failed. Read the diff.
- **A fifth was found by a test, and only because the test existed:** `formatForecastDate` rendered the literal string `Invalid Date` for an unparseable input, because the guard checked `undefined` and `Number('not')` is `NaN`.
- **The Mini App's tests deliberately have no DOM.** `renderToStaticMarkup` needs none, and adding jsdom or a testing library would pull more of a browser stack into a workspace whose vite resolution is already delicate (the root `vite` pin). A test needing a click does not belong there as things stand.
- **`TELEGRAM_CHAT_ID` must be the private-chat id** — which equals the owner's Telegram user id. A group chat id would make every Mini App request 401 with nothing on screen to explain why. Noted in CLAUDE.md's env table.
- **Both Vercel projects deploy from one PR and neither check says anything about the other.** The auth change only affects the API project; the screens only affect the Mini App project.


---

## 2026-08-25 — branch: main — commit: 14c9757 — PR #31 (merged)

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

**Round 4 — review of §12 itself, run before starting Task 5a.** Five more findings, all applied; full detail in `review-findings.md`.
- **R1 (high, my own error):** `POST /locations` never persists `elevation_m`, so §12's preview would show lapse-rate-corrected temperatures and the saved location would not — same place, ~10 °F apart, before and after Save. Now change 5 in §12.3.
- **R2/R3:** §12 contradicted two sections it did not revisit. §3 still said "no add-location"; §2 still said "two routes" and specified a `BackButton` that would have discarded the user's search on back from preview. Both rewritten, with a per-route back-target table.
- **R4 (pre-existing):** "today" is a **UTC** date (`liveForecast.ts:47` plus `timezone=UTC` on both Open-Meteo calls), so in the Americas "today's high" rolls over in the late afternoon. `locations.timezone` exists and nothing reads it. Filed as §10.5.
- **R5:** live geocoder check returned three different "Red Rock Canyon" parks in three states — result rows need `admin1` + `country` or the choice is a coin flip.
- Also: §7 gains rule 8 (the bot has no `is_climbing_location` check either), and the Open-Meteo geocoder was verified live rather than assumed — keyless, and it returns `elevation` and `timezone`.

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
- **New prerequisite: Task 5a (backend).** §12 needs five API changes — `GET /geocode`, `GET /preview`, a changed `POST /locations`, `DELETE /locations/:id`, and **persisting `elevation_m` on save** (found in the round-4 self-review; without it preview and the saved location disagree on temperature). Added to `plan.md`'s phase table. It is **independent of the `initData` auth work**, so it can start immediately.
- Task 6's screens still blocked on Task 5's auth work, and now also on Task 5a.
- cron-job.org still unregistered.

**What's next:** **Task 5a — the add-location API** — `git checkout -b claude/add-location-api` off `main` — read `docs/handoffs/miniapp-design-v1.md` §12.3 first. Backend only, no auth dependency, and it unblocks the largest new piece of Task 6. Then Task 5 (shell) and Task 6 (screens); before any UI read §0a and §8, because the token adapter has to exist before the first component. **B0 is merged (PR #31, squashed to `14c9757`) — `main` has the design spec, branch straight off it.**

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

---

## 2026-08-25 — branch: claude/add-location-api (merged to `main`) — commit: a90613f

**Phase completed:** Task 5a — the add-location API (all five changes in `miniapp-design-v1.md` §12.3)

**What was built this session:**
- `apps/api/src/lib/weather/geocode.ts` — Open-Meteo geocoding client (`searchPlaces`, `parseGeocodeResults`). Keyless, so `.env.example` is unchanged. Row-level validation: a row missing name/id/coords is dropped, a row missing `elevation` is kept (the lapse-rate correction is simply skipped).
- `apps/api/src/routes/geocode.ts` — `GET /api/v1/geocode?q=`. A query under 2 chars is an empty 200, not a 400 — the client calls this per keystroke.
- `apps/api/src/lib/scoring/previewForecast.ts` — `computePreviewForecast`, a synthetic `LiveForecastLocation` (id `"preview"`) through `computeLiveForecast`. Persists nothing, returns no scores.
- `apps/api/src/routes/preview.ts` — `GET /api/v1/preview?lat=&lon=&elevation=`. Returns the same windowed `ForecastSnapshot[]` as `/forecast/:id`.
- `apps/api/src/lib/scoring/forecastWindow.ts` — `forecastWindow` + `toWindowedForecast`, lifted out of `routes/forecast.ts` now that two endpoints label snapshots.
- `apps/api/src/lib/locations/deleteLocation.ts` — `deleteLocationCascade`, one transaction over all ten `location_id` dependents plus the location.
- `apps/api/src/routes/locations.ts` — `DELETE /locations/:id`; `POST /locations` now takes `is_climbing_location`, `rock_type`, `elevation_m`, `timezone` and range-validates coordinates; `mapLocation` returns `elevation_m`.
- `packages/types/src/index.ts` — `GeocodeResult`, exported `RockType`, `Location.elevation_m`, widened `CreateLocationInput`.
- `apps/api/src/lib/weather/geocode.test.ts`, `forecastWindow.test.ts`, `http.test.ts` — 32 new tests. Suite is **147 passing**.
- `apps/api/src/scripts/checkAddLocationApi.ts` + `npm run check:add-location` — the acceptance script, promoted out of the scratchpad. Needs only `DATABASE_URL`; reads the seeded user from the `users` table otherwise. Run it after any change to the add flow — vitest mocks `fetch` and never opens a connection, so the failures that matter here (FK violations, an `elevation_m` that silently doesn't persist) are invisible to it.
- `apps/api/src/lib/http.ts` — new `describeError`. `sendServerError` logged `[object Object]` for anything that wasn't an `Error`, which is what database drivers throw; a wrong connection string produced exactly that and said nothing else. Now reads `message`/`code`/`errno`/`syscall`, unwraps aggregate and `cause` chains, and is depth-capped against cyclic causes. It never serialises an unknown object wholesale — driver errors can carry the connection string, and dumping it would put credentials in the log.
- `apps/api/src/db/schema.ts` — comment above `locations` pointing at `DEPENDENT_TABLES`, so a future table with a `location_id` FK doesn't silently break delete.
- **Agent-instruction updates** — the workflows this session established are now written into the files that govern how agents work here, rather than living only in this entry: `CLAUDE.md` gains **§Verification Standards** (typecheck ≠ verified; how to run against the real DB with no `.env`; when a `check:*` script is required), **§Reporting Work**, a Session End step requiring stale docs to be reconciled and the squashed commit hash corrected, and four new gotchas (Windows CRLF breaks multi-line `sed`/`perl`, no Python, Vercel will not return a sensitive value, and what a production 401 does and does not prove). `.claude/rules/architecture.md` gains **§Operator Scripts**; `review-checklist.md` gains **Verification** and **Docs** sections; `architect-guard` now asks how a change will be verified and flags a new `location_id` FK against `DEPENDENT_TABLES`; `code-reviewer` now flags wholesale error serialisation, unsupported verification claims, and docs left contradicting the code.
- **Doc consistency sweep** — every file that referenced the task list, the endpoint inventory, or the Mini App's surface was checked and corrected, so the agent docs no longer contradict the code: `CLAUDE.md` (called the design spec nonexistent), `.claude/rules/architecture.md` (proxy-route pattern, the preview contract, the no-`onDelete` delete rule), `.claude/rules/review-checklist.md` (new `location_id` FK → `DEPENDENT_TABLES`), `.claude/docs/api-sources.md` (Open-Meteo geocoding added as a source), `.claude/docs/plan.md` (B0 and 5a marked complete, 5a's row rewritten out of the future tense), `weatherteam6-miniapp-handoff-v1.md` (endpoint inventory missing all three new routes; **"two screens only" would have blocked Task 6 from building `/add`**), `weatherteam6-ui-handoff-v1.md`, `miniapp-design-v1.md` (§12 status banner), and `README.md` (still claimed CI was red from the lint failure fixed in `3117020`).
- `docs/handoffs/telegram-crossover-v4.md` — Task 5a added as its own section between Tasks 5 and 6, and the status banner updated with B0 and 5a. Task 5a had only ever existed in `plan.md`, so the canonical task list showed Task 5 → Task 6 with nothing between them and the task was effectively unfindable from the doc `CLAUDE.md` calls authoritative. The new section also says plainly that 5a is *not* part of Task 5 — the name implies a relationship that does not exist.

**Known issues / deferred work:**
- ~~`POST` and `DELETE` were never run against a database.~~ **Resolved 2026-08-25.** All four endpoints were verified end to end against the production Neon database from Tim's Windows machine — 16 checks, all passing: the climbing flag, rock type, elevation, and timezone all persist; preview and the saved location report the identical temperature (the §12.3 change-5 guarantee); bad rock type and out-of-range lat are refused; and **delete succeeds with a `weather_alerts` row attached**, which is the case that would have raised a foreign-key violation without `deleteLocationCascade`. Deleting twice is a clean 404. The check script lives in this session's scratchpad, not the repo — see the gotcha below.
- **`DELETE /trips/:tripId` has the same FK bug this task fixed for locations** — `trip_locations` rows reference `trips` with no `onDelete`, so deleting a trip that has locations raises a foreign-key violation and returns a generic 500. Pre-existing, untouched here, and now inconsistent with `DELETE /locations/:id`.
- Deleting a location removes its `conditions_reports` rows but not the photo objects those rows point at in R2. Orphaned objects accumulate; no cleanup pass exists.
- `rock_type` is dropped when `is_climbing_location` is false, rather than stored and ignored. Deliberate — the drying model never reads it — but it means the toggle is not losslessly reversible, and there is no edit screen (§12.4).
- **Nothing prevents saving the same place twice.** §12 never asked for de-duplication, and the API does not do it. If Task 6 wants "you already saved this", that is a client-side check against `GET /locations` or a new endpoint — decide before building the save bar.
- **The crag branch of `POST /locations` still saves no elevation**, because the `crags` table has no elevation column. Harmless today — `crags` is empty and the preview flow never touches that branch — but it means two save paths behave differently. If crag search is ever merged into the add flow (§12.2 leaves the door open), fix this first.
- No cap on `name` length beyond Express's default 100 kb body limit. Not exploitable by the single trusted caller, but it is unvalidated input reaching a `text` column.

**Blockers for next session:**
- None for Task 5 (shell). Task 6 still needs `initData` HMAC validation before any screen is wired.

**What's next:** Task 5 — Mini App shell — `git checkout -b claude/miniapp-scaffold` off `main` — Task 5a is merged (PR #37, squashed to `a90613f`), so branch straight off it — read `docs/handoffs/miniapp-design-v1.md` §0a and §8 before writing any UI, because the token adapter has to exist before the first component.

**Gotchas for next session:**
- **`GET /preview` returns no conditions score, deliberately** (§12.1 unsaved mode). If the Task 6 detail screen shares a data hook between saved and unsaved modes, the score section has to be driven by mode, not by "score is null".
- **Preview and save must pass the *same* `elevation`.** The geocoder's `elevation` goes into `/preview?elevation=` and then into `POST /locations` as `elevation_m`. Skipping it in either place reintroduces exactly the temperature mismatch §12.3 change 5 exists to prevent. Confirmed live: Red Rock NV reads 37.7 °C with `elevation=1200` and 37.3 °C without.
- `POST /locations` rejects an unrecognised `rock_type` with a 400 rather than coercing it to null — a typo in the picker's values will fail loudly, which is intended.
- The `preview` snapshots carry `id: "preview:<date>"` and `location_id: "preview"`. Do not use either as a React key assumption that survives saving; after save the ids are real UUID-based.
- `resolveUser` runs before `requireApiAuth`, so an unauthenticated request to `/api/v1/*` on a server missing `DEFAULT_USER_ID` returns 500 "Server misconfigured", not 401. Only shows up in misconfigured local setups, but it is confusing when it does. (Useful side effect: an unauthenticated 401 from production proves `DEFAULT_USER_ID` is set there, without needing the secret.)
- **Running the API locally against the real database needs no `.env`.** Set `$env:DATABASE_URL` to Neon's *pooled* production string for the one command; `DEFAULT_USER_ID` can be read from the `users` table instead of being supplied (the seeded user is `00000000-0000-0000-0000-000000000001`). Vercel will not reveal its copy of `DATABASE_URL` — those variables are marked sensitive, so `vercel env pull` cannot recover them either. Neon's dashboard is the only source.
- ~~**Re-run `npm run check:add-location` before trusting the add flow again.**~~ **Closed 2026-08-25** — Tim ran the in-repo version against the database after this note asked for it. The original 16-check pass had been against the scratchpad copy, before the runtime imports were deferred; the shipped script has now been exercised for real.
- `liveForecast` logs an NBM 400 warning on every request, preview and saved alike. That is issue #22, not a Task 5a regression — the ensemble fallback picks it up and the numbers are correct.

---

## 2026-08-25 — branch: claude/miniapp-scaffold (merged to `main`) — commit: b06ebed

**Phase completed:** Task 5 — Mini App shell (code complete; **not deployed, not registered with @BotFather**)

**What was built this session:**
- `apps/miniapp/` — new Turborepo workspace. Vite 8 + React 19, static build to `dist/`. `build` runs `tsc --noEmit && vite build`, so a type error fails the build rather than shipping.
- `apps/miniapp/src/theme/tokens.css.ts` — the §0a adapter, the thing that had to exist before the first component. Re-expresses `type` (unitless `fontSize` → px, string `fontWeight` → number, point tracking → px), `shadow` (RN `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius` → a `box-shadow` string, folding the separate opacity into the colour and *multiplying* any alpha already there) and `layout` (`flex`, `paddingHorizontal` → `paddingInline`). Exports `textStyle` / `boxStyle` so Task 6 can convert `components` entries one at a time — `components` is not pre-converted, because entries like `btnPrimaryText` mix text and box props and §0a says audit per-entry.
- `apps/miniapp/src/theme/fonts.ts` — `BarlowCondensed` → `"Barlow Condensed"`, derived by inserting the space rather than hard-coded, so a rename in `packages/design` carries through. Real fallback stacks (condensed fallbacks for the display face), because Google Fonts can fail inside a webview.
- `apps/miniapp/src/theme/cssVars.ts` + the `virtual:wt6-tokens.css` plugin in `vite.config.ts` — renders every colour, spacing, radius, shadow and font stack as a `:root` custom-property block, generated from the tokens. Served through Vite's CSS pipeline rather than injected at runtime, so `globals.css` has its vars on first paint instead of one frame later.
- `apps/miniapp/src/theme/globals.css` — the §8 gradient (`180deg`, three stops at `0 / 45% / 100%`), safe-area padding and viewport height. Every `--tg-*` reference carries a fallback.
- `apps/miniapp/src/telegram/` — hand-written typed surface for `Telegram.WebApp` (no `any`, no types dependency); `useTelegramChrome` (`ready`, `expand`, `setBackgroundColor` gated at 6.1, `setHeaderColor` gated *separately* at 6.9 with no `bg_color` fallback); `useBackButton`, which takes the **action** rather than a destination so §12's preview can go back to `/add` with its results intact.
- `apps/miniapp/src/routes/` — the three §2 routes with placeholder bodies, plus a catch-all that lands on `/` silently.
- `apps/miniapp/src/lib/queryClient.ts` — §5's settings verbatim (`staleTime` 5m, `gcTime` 30m, `retry: 1`, `refetchOnWindowFocus: false`).
- `apps/miniapp/vercel.json` — SPA rewrite; `apps/miniapp/README.md` — the Vercel + BotFather steps, written for whoever does them.
- Root wiring — `eslint.config.mjs` gains a miniapp block (react + react-hooks + browser globals); `turbo.json` gains `VITE_API_BASE_URL`; `.env.example` gains `VITE_API_BASE_URL`; root `package.json` gains a direct `vite` devDependency (see gotcha).
- **Doc reconciliation** — Task 5 marked code-complete-not-deployed in **both** `telegram-crossover-v4.md` and `plan.md`, with the outstanding steps named. `CLAUDE.md` (stack line, structure block, env table, new gotcha), `.claude/rules/architecture.md` (app list + five new Mini App invariants), `.claude/rules/review-checklist.md` (five new client checkboxes), `weatherteam6-miniapp-handoff-v1.md` ("what does not exist yet"), `README.md`, and `miniapp-design-v1.md` (§0a status banner, §11 constraint 2 struck through with the rule that outlives it).


**Review pass (same session, squashed into `b06ebed`):** a full review was run before deploying. Six defects, **all six in the RN→CSS token adapter** — the routing, BackButton lifecycle, version gating, null-SDK handling and virtual CSS module all held up. Every one was confirmed by measurement before being fixed, and none would have failed a typecheck, a lint, or the existing browser checks:

- **CSS flex defaults to `row`; RN defaults to `column`.** `boxStyle` emitted `display: flex` without a direction, so `components.btnPrimary` — which sets only `alignItems: 'center'` — would have centred its label *vertically* and left it flush left. `boxStyle` now carries RN's `column` default, and an explicit direction still wins.
- **`border-width` without `border-style` computes to `0`.** Measured in Chromium: `borderWidth: '1px'` alone → `border-top-width: 0px`. `components.card`, `input`, `layerChip`, `sourceBadge` and `chosenChip` would every one have rendered borderless. `boxStyle` now emits `borderStyle: 'solid'` alongside a width.
- **The converters silently dropped any token property they did not list**, and TypeScript could not catch it — excess-property checking applies only to object literals, and the argument is always an imported token object. `boxStyle(components.calRangeStart)` lost both corner radii and compiled clean. The four corner radii are now mapped, and `assertMapped` throws on anything still unmapped. Two layers, covering different cases: **compile time** for `type`/`layout`/`shadow` (converted wholesale — verified by adding a bogus property to `packages/design` and watching `tsc` fail), **runtime** for `components` (converted per-entry by Task 6).
- **`withOpacity` returned the colour unchanged when `parseColor` failed**, discarding `shadowOpacity` — an 8-digit hex or `hsl()` token would render a glow at full strength with no error. It throws now.
- **Browser default margins were overriding the locked layout constants.** Measured: `<h1>` carried a 20.1px margin, so `spacing.topSafe` (48) rendered as 68, and the 20.1px bottom margin collapsed over `type.screenSub`'s 5px `marginTop` and swallowed it entirely. `globals.css` now resets them, and three assertions in the browser harness hold it there.
- **`stackForFamily` fell back to the body stack for any unrecognised family** — the exact silent fallback the module exists to prevent, since a third or renamed family in `packages/design` would have dropped headings to the non-condensed face. It throws now.

Verification added with the fixes: a 40-check adapter harness that converts **every** entry in `components` and `layout` and asserts each fix, plus three vertical-rhythm assertions in the browser harness (34 checks, up from 31). Both harnesses live in this session's scratchpad, not the repo. Also corrected a doc claim of mine that `themeParams` is "read but nothing branches on it" — it is on the typed surface and deliberately never read.

**Known issues / deferred work:**
- **Nothing has been seen inside Telegram.** The acceptance criterion for Task 5 is the bot's menu button opening the app, themed correctly, and that needs a Vercel project and a @BotFather registration — neither of which can be done from here. What *was* verified is a real Chromium render of the production build: 34 checks covering all three routes, the catch-all, `BackButton` show/hide/click-navigates per route, `ready`/`expand`, the 6.9 gate (at version 6.5 `setHeaderColor` is correctly not called), rendering with the SDK absent entirely, and the adapter's computed styles (30px/700/-0.3px/31px in Barlow Condensed, `txt3` at 0.62 alpha, the gradient's vars resolving to real rgb, and the 20/48/24 layout constants, now measured with no UA margin on top of them). That harness plus the 40-check adapter harness both live in this session's scratchpad, not the repo.
- **`spacing.topSafe` (48px) is applied at the top of every screen and has not been checked on a device.** §8 makes the layout constants binding, so it is applied as written — but that constant was drawn for a fullscreen native app clearing a status bar, and inside Telegram the webview already starts below the client's own header. If it reads as too much air on a phone, that is a spec question for Task 6, not a bug in the scaffold.
- **`disableVerticalSwipes()` (Bot API 7.7) is deliberately not called.** The spec gates two chrome methods to the version and never mentions this one, so calling it would be a design decision made in code. It matters the moment there is scrollable content: without it, a pull-down inside a Telegram webview closes the Mini App instead of scrolling. Decide it in Task 6, before the location list ships.
- No test suite in `apps/miniapp` — `npm run test` is the repo's `echo 'no tests'` placeholder. The browser harness above proved the shell works but is not committed. If Task 6 wants regression cover for screens, vitest + jsdom is not enough on its own: jsdom does not execute `<script type="module">`, so it renders nothing for a Vite build.
- 36 npm audit advisories across the workspace, pre-existing and not looked at here.

**Blockers for next session:**
- **Task 6 is still blocked on `initData` HMAC validation**, unchanged. It must land as route-level middleware on `/api/v1/*` and ship in the same change that removes Vercel SSO protection — SSO off without HMAC leaves the API open on a public URL, and the automation bypass secret cannot be used because it would ship in a public bundle.
- Nothing blocks the Vercel project + @BotFather registration; they just need someone with the dashboards.

**What's next:** Deploy the shell (Vercel project + @BotFather, steps in `apps/miniapp/README.md`) to close Task 5's acceptance, then Task 6 — `git checkout -b claude/miniapp-auth-screens` — but land `initData` HMAC middleware **first**, in its own change with the SSO removal. Read `docs/handoffs/miniapp-design-v1.md` §3, §5, §7 and §12, plus `weatherteam6-ui-handoff-v1.md` §7b/§7c/§7e, before writing any UI.

**Gotchas for next session:**
- **`vite` is now a root devDependency and must stay one.** `apps/api`'s vitest 2 drags in vite 5, npm hoists it, and `@vitejs/plugin-react` — hoisted too — resolved *that* copy instead of the miniapp's vite 8. The build died with `Package subpath './internal' is not defined by "exports"`. Declaring `vite` at the root makes the hoisted copy the one the Mini App wants; vitest gets a nested vite 5 and its 147 tests still pass.
- **Import `type`, `shadow` and `layout` from `src/theme/tokens.css.js`, never from `@weatherteam6/design/tokens`.** The RN shapes typecheck fine as objects and produce silently wrong CSS — `fontSize: 30` with no unit, `fontFamily: 'BarlowCondensed'` matching no installed family and falling back to the system font without erroring. `colors`, `spacing`, `radius`, `uvScale` and `units` are plain data and are imported directly.
- **`useBackButton` takes a callback, not a route.** That is load-bearing for §12: back from the preview must return to `/add` with the query and results intact, and a blanket `navigate('/')` would discard the search the user just ran.
- **The app must keep rendering with no Telegram SDK.** `getWebApp()` returns `null` in a plain browser and when `telegram-web-app.js` fails to load; that is the only way to develop a screen without a phone in hand. It is covered by a check in the browser harness — do not let a screen introduce an unguarded `window.Telegram.WebApp`.
- **`GET /preview` returns no conditions score, deliberately** (§12.1). If Task 6's detail screen shares a hook between saved and unsaved modes, drive the score section by mode, not by "score is null".
- **Preview and save must pass the same `elevation`.** Unchanged from Task 5a, and still the trap: skipping it in either place reintroduces the temperature mismatch §12.3 change 5 exists to prevent.
- **`npm run check:add-location` is the gate for any change to the add flow**, and the in-repo script has been run against the database (Tim, 2026-08-25) — it is no longer the untested copy the Task 5a notes warned about. Re-run it after touching the add flow; vitest mocks `fetch` and never opens a connection, so FK violations and values that fail to persist are invisible to it.

---

## 2026-08-25 — branch: main — commit: 5cbbed0

**Phase completed:** Task 5 — Mini App shell **deployed and confirmed inside Telegram**. Acceptance criterion met; the task is now complete, not just merged.

**What happened this session:**
- PR #38 squash-merged to `main` as `b06ebed`, branch deleted, CI green on the merge commit and on the follow-up docs commit.
- Vercel project created — separate from the API, root directory `apps/miniapp`, *Include source files outside of the Root Directory* on, framework preset **Vite**, `VITE_API_BASE_URL` set to the API origin, no `NODE_ENV`. Production domain **https://weatherteam6.vercel.app**.
- Registered with @BotFather via `/setmenubutton`, label "Locations".
- Deploy verified before registration: the served HTML carries the same asset hashes as the local build (`index-BBoz2RJj.js`, `index-CE-Lr_Hj.css`), and `vercel.json`'s rewrite returns `index.html` for `/add` and `/location/:id` rather than a 404 — which the client-side routes depend on. No Vercel SSO wall on the production domain, so the webview loads it without cookies.

**Confirmed inside Telegram (Android), which is what nothing before this could test:**
- **Telegram's header takes the gradient's top colour** — so that client is Bot API ≥6.9 and the arbitrary hex was accepted. The 6.9 gate in `useTelegramChrome` is doing the right thing on real hardware, not just against the shim.
- **Barlow Condensed loads over the network in the webview** — the title renders condensed, the subtitle in regular Barlow. The fallback stack is not being used, so `fonts.ts`'s family-name derivation is correct against Google Fonts.
- **Nothing is clipped** by the notch or the home indicator — the `--tg-safe-area-inset-*` padding with its `0px` fallbacks behaves.
- **No in-app back arrow on the list route** — `useBackButton(null)` hides Telegram's BackButton and nothing else draws one, which is §2's "one back affordance, and it is Telegram's".
- **`spacing.topSafe` (48px) reads correctly**, not as excess air. This was flagged as the most likely thing to need changing — it does not. §8's layout constants stand as written.

**Known issues / deferred work:**
- **`/newapp` has not been run.** The menu button carries no `startapp` parameter, so Task 7's deep link into location detail needs a named Mini App registered separately. Not a Task 5 gap — the acceptance criterion is the menu button — but Task 7 starts blocked on it.
- Only one client was tested (Android, ≥6.9). The sub-6.9 header path — where `setHeaderColor` is deliberately skipped and Telegram's default header is accepted — has been exercised only against the test shim at version 6.5, never on a real old client. It is the conservative branch, so a wrong outcome there is cosmetic.
- Everything from the merge still stands: no test suite in `apps/miniapp`, and `disableVerticalSwipes()` deliberately not called (decide in Task 6, before there is scrollable content).

**Blockers for next session:**
- **Task 6 is blocked on `initData` HMAC validation**, now the only thing in the way. Route-level middleware on `/api/v1/*`, added as a second accepted scheme on the same `Authorization` header alongside `API_SHARED_SECRET`. **Checked against the live projects 2026-08-25: there is no Vercel SSO to remove and it must not be removed.** Both projects have `ssoProtection.enabled: true` with `deploymentType: "all_except_custom_domains"`, which on this Hobby plan does not cover the primary production alias — an unauthenticated `GET /api/v1/locations` reaches Express and returns our own 401, not a login page. So SSO protects *preview* deployments, which is worth keeping and is why there is no preview-URL path for testing in Telegram. `plan.md`'s sequencing constraint said the opposite and has been corrected; two earlier session entries (lines ~57 and ~100) had already found this and the plan was never updated.

**What's next:** Task 6 — but land `initData` HMAC middleware **first**, as its own self-contained change (no SSO toggle involved; see the blocker above). Then the three screens. Read `docs/handoffs/miniapp-design-v1.md` §3, §5, §7 and §12, plus `weatherteam6-ui-handoff-v1.md` §7b/§7c/§7e, before writing any UI.

**Gotchas for next session:**
- **The Mini App is a second Vercel project on the same repo.** PRs now get two Vercel checks; a failure on one says nothing about the other. The API project must stay framework preset "Other"; the Mini App must stay "Vite".
- **`VITE_API_BASE_URL` is the API origin with no `/api/v1` suffix and no trailing slash** (`env.ts` strips trailing slashes but not a path). Task 6's hooks append the prefix. It is inlined into a public bundle at build time — never put a credential in a `VITE_*` variable.
- **There is no preview-deploy path for testing inside Telegram.** Origin lockdown plus per-deployment preview URLs mean the only way to see a change in Telegram is to ship it to the production domain. Plan Task 6 around that: verify in a browser first, because the Telegram round trip is slow and unbatched.
- The four Telegram-only behaviours above are now confirmed working. If a later change breaks the header colour, the fonts, or the safe areas, it is a regression with a known-good baseline — not an untested unknown.

---

## 2026-08-26 — branch: chore/deep-review-cleanup (squash-merged to `main`) — commit: 07bc7c5 (PR #44)

**Phase completed:** Deep review, debug and cleanup pass — the session the previous block briefed, and the item the user put ahead of everything else.

**What was built this session:**

Seven defects fixed, all of which had passed typecheck, lint and the full suite:

- `packages/types/src/conditionsCopy.ts` — `formatHoursSinceRain` rendered **"no rain in -14h"** whenever it had rained today, and **"no rain in 720h"** for raw values 719.5–719.99. The second violates a §3 rule that is written as binding. Both proven by running the code, not by reading it.
- `apps/api/src/lib/scoring/dryingModel.ts` — clamped `hours_since_significant_rain` at 0. It measures from the *end* of the rain day (23:59:59Z), so rain dated today was still in the future relative to `asOf` and produced a negative elapsed time. Changes no score: `conditionsScore` already floors the drying component at `hoursSinceRain <= 0`.
- `apps/api/src/routes/trips.ts` — `DELETE /trips/:tripId` now clears `trip_locations` in the same transaction. It had **never once succeeded**: `POST /trips` requires at least one location, so every trip hit the foreign-key violation and got a generic 500.
- `apps/api/src/lib/weather/openMeteo.ts` — `model_sources` reported ECMWF, ICON and GEM as forecast sources. Every extraction in `parseEnsemble` filters on `GFS_SUFFIX`, so those three contribute to no number on screen. The list is rendered verbatim in the Mini App footer and the bot reply, so this was a false attribution in production.
- `apps/api/src/lib/weather/openMeteo.ts` — `fetchEnsemble` now sets `timezone=UTC` explicitly. Three comments already claimed it did; it was relying on Open-Meteo's GMT default.
- `apps/api/src/lib/telegram/sendMessage.ts` + `lib/alerts/checkAlerts.ts` — added `TelegramPermanentError`. `notifyPendingAlerts` released its claim on *every* failed send, so a message Telegram rejects identically every time (a 400 from a bad tag or button URL) was re-sent on every cron run forever. Permanent rejections now keep the claim.
- `apps/api/src/lib/telegram/webhookAuth.ts` (new) — issue #27. `secret_token` verification, pure and separately tested, in its own module because importing the route pulls in the database client.

Supporting work:

- `apps/api/src/scripts/checkDeleteTrip.ts` + `npm run check:delete-trip` — the trips fix is a Postgres constraint error, which vitest cannot see.
- 36 new tests (255 → 291). Two of them replace assertions that could not fail.
- `sendMessage.test.ts` retry tests moved to fake timers: 14,088ms → 23ms.

**Known issues / deferred work — found, deliberately NOT fixed:**

- **`GET /forecast/:id` and `GET /conditions/:id` each run `computeLiveForecast` independently.** Opening one location detail therefore makes 2 ensemble + 2 rainfall upstream fetches; the list screen makes 3 requests per card, so N climbing locations cost 2N of each. Fixing it means a request-scoped cache or a combined endpoint — an API change, not a cleanup.
- ~~**The ensemble request asks for four models and reads one.**~~ — **resolved the same day.** The user chose accuracy: *"I want to be using all the models possible… truthfully the score isn't a priority right now and I mainly want a functional chat/weather app."* All four are now pooled — **30 members → 143** — and a second, larger defect surfaced while doing it: `temp_c_max` was `Math.max()` across every member *and* hour, i.e. the hottest hour of the hottest member. Live on 2026-08-26 it put **102 °F** on screen labelled "High" while the median member said **99 °F**, and pooling more models would only have pushed it further. Highs, lows and peak wind are now the ensemble median of each member's own daily extreme. See the follow-up block below.
- **A swallowed rainfall fetch still scores as full drying credit.** `liveForecast` catches the ACIS/archive error, leaves `rainfallEvents` empty, and `dryingModel` returns the 720 sentinel — 40/40 on the heaviest component. The *display* is honest ("no rain in 30+ days"); the *score* is not. Distinguishing "no rain found" from "never asked" is a scoring change, so it was left alone.
- **`parseEnsemble` substitutes `0` for a missing temperature and `50` for missing humidity**, and `DailyForecast` types them non-nullable. `ForecastSnapshot` is `number | null` and the formatters return an em dash — but that path is unreachable from the live forecast, so a partial upstream response renders as a plausible **32°F / 0 mph** rather than a visible gap. Fixing it means making `DailyForecast` nullable and deciding what the scorers do with a null, which touches `ScoreInput`.
- **#25 unchanged** — `/history` and `/normals` still return `[]` forever. Still needs a design call on where the write goes.
- **#27 half-closed** — no `update_id` dedupe. It needs a table to record seen ids, so it is a schema change. Exposure is small: Telegram only redelivers when it times out waiting for our 200, and the route always answers 200.
- **Cosmetic, user's call:** the Mini App's `Wind to` label still renders uppercased as **"WIND TO"**. Left alone, as the previous block asked.
- **The score algorithm (#21's open half) was not touched**, per the standing instruction.

**Blockers for next session:**

- None for the code. The webhook fix is inert until `TELEGRAM_WEBHOOK_SECRET` is set in Vercel *and* `setWebhook` is re-run with the same value — see the user question below.

**What's next:** the user's stated order — polish and Mini App adjustments, then new bot commands and text-based weather updates (a design conversation, not a spec to write alone), then the in-app feedback button.

**Gotchas for next session:**

- **`npm run test` was green for every one of the seven defects above.** The two that mattered most were caught by *running* the function on a boundary input and by *calling the live upstream API* — not by reading code and not by any gate in the repo.
- **A test can assert an invariant it never exercises.** `dryingModel.test.ts` had "hours_since_significant_rain is non-negative" running against an empty event list, which takes the early-return sentinel branch and never reaches the subtraction. `openMeteo.test.ts`'s fixture only ever emitted GFS keys, so the three wrong `model_sources` branches were unreachable. Written up as class 11 in `defect-patterns.md`.
- **Importing a route module pulls in the database client**, which throws at import time without `DATABASE_URL` and takes the whole test file with it. That is why `webhookSecretAccepted` lives in `lib/telegram/`, not in the route — same reason as `validateInitData` and `conditionsMessage`.
- **The Bash tool's working directory persists between calls.** A failed `cd apps/api` left later relative paths resolving against the wrong root and produced a "file not found" that looked like a missing file. Use absolute paths.

**Does the user need to do anything?** **Yes — two things, both only they can do.**
1. Set `TELEGRAM_WEBHOOK_SECRET` in the API's Vercel project to a long random string, then re-run Telegram's `setWebhook` with `secret_token` set to the same value. Until both are done the #27 fix is inert by design and the bot keeps working exactly as before.
2. Decide the ensemble question: use all four models (changes every score) or request only GFS (no behaviour change, ~4x less payload per request).

Optionally, run `npm run check:delete-trip` from `apps/api` with `DATABASE_URL` set — the trips fix has not been exercised against a real database.

---

## 2026-08-26 — branch: fix/pool-all-ensemble-models (squash-merged to `main`) — commit: a6487e1 (PR #45)

**Phase completed:** Ensemble accuracy — all four models pooled, and the displayed high/low/wind changed from an extreme to a central estimate.

**Why:** the user's call on the open question from the review pass. Their words: *"I want to be using all the models possible so we have accuracy. truthfully the score isn't a priority right now and I mainly want a functional chat/weather app… the score adjustments and tweaks are a future task."*

**What was built this session:**

- `apps/api/src/lib/weather/openMeteo.ts` — `parseEnsemble` now pools members from all four models via `ENSEMBLE_MODEL_SUFFIXES`, instead of filtering everything to GFS. **30 members → 143.** Control runs (`precipitation_<model>`, no `_memberNN`) count as members; the old filter matched the literal `_member` prefix and dropped all four.
- **`temp_c_max` / `temp_c_min` / `wind_kmh_max` are now `ensembleMedian` of each member's own daily extreme.** This was not in the ask, and it is the bigger of the two changes for a user: the old global `Math.max` reported the hottest hour of the hottest member. Pooling four models would have made it strictly worse, since a maximum can only rise as members are added.
- `model_sources` is derived from the models that actually yielded arrays, so a partial upstream response drops a model instead of claiming it.
- 4 tests changed or added (291 → 293). Three existing assertions encoded the old extreme-value semantics and were updated deliberately, not worked around.

**Measured against the live API, Red Rock, 2026-08-26, one payload, before vs after:**

| | members | high | low | peak wind | precip p50 | precip p90 |
|---|---|---|---|---|---|---|
| GFS only, global extremes | 30 | 102°F | 82°F | 13 mph | 0.00 mm | 0.30 mm |
| Four models, median of member extremes | 143 | **99°F** | **78°F** | **9 mph** | **0.10 mm** | **1.48 mm** |

The low is the interesting row: the four-model median (78°F) is *below* GFS's own coldest member-hour (82°F), because the other three models genuinely run cooler here. GFS alone also saw essentially no precipitation where the full ensemble sees a real p90. That disagreement was previously invisible.

**Known issues / deferred work:**

- **Scores move**, and the user has accepted that in advance. Wider p10/p90 spreads mean `confidenceFromSpread` returns `medium`/`low` more often — which is more honest — and the wind and rain components shift. #21's scoring half is still untouched.
- Everything else deferred in the previous block stands: the duplicated `computeLiveForecast` per detail view, the swallowed rainfall fetch scoring as full drying credit, `parseEnsemble` substituting `0`/`50` for missing values, #25, and #27's `update_id` dedupe.
- Members are pooled **unweighted**, so ECMWF's 50 members carry more weight than GEM's 20. That is the ordinary multi-model convention and is recorded as a deliberate choice in `architecture.md`, not an oversight.

**Blockers for next session:** none.

**What's next:** polish and Mini App adjustments, then new bot commands and text-based weather updates (a design conversation the user wants to have), then the in-app feedback button.

**Gotchas for next session:**

- **A model's key suffix is not its name and cannot be derived from it** — `gfs_seamless` → `_ncep_gefs_seamless`, `ecmwf_ifs025` → `_ecmwf_ifs025_ensemble`. Adding a model to `ENSEMBLE_MODELS` without adding it to `ENSEMBLE_MODEL_SUFFIXES` means it is fetched and silently ignored, which is exactly the state this branch found.
- **`computePercentile` interpolates.** The median of six values sits *between* the third and fourth, not on one of them. A test asserting the lower-middle element will fail, and the code is right — this cost one wrong expectation here.
- **Escaping a regex through `node -e` in this shell mangles `\d` into `d`.** A throwaway reproduction "proved" the member regex was broken when the real source was correct. Verify against the actual file or a passing test, not a shell-escaped rewrite of it.

**Does the user need to do anything?** **No.** The one thing outstanding from the previous block — `TELEGRAM_WEBHOOK_SECRET` in Vercel plus re-running `setWebhook` — is unchanged and still theirs to do when convenient. Nothing new here needs them.

---

## 2026-08-26 — branch: fix/parallel-alerts-check (squash-merged to `main`) — commit: cf32960 (PR #46)

**Phase completed:** Alerts cron hardening — #27 part 3 — and the repo brought to a clean base for planning.

**What was built this session:**

- `apps/api/src/lib/alerts/checkAlerts.ts` — `runAlertsCheck` now fans out over locations with `Promise.allSettled` instead of looping serially. Each iteration carries up to ~7s of `fetchWithRetry` backoff, so an NWS outage across ~10 locations exceeded the function's `maxDuration: 60` and **killed the request before `notifyPendingAlerts()` ran** — alerts already pending stayed undelivered across every retry, and it got worse as locations were added. Error aggregation is preserved exactly, so the cron response's `refreshFailed` flag still means what it did.
- `apps/api/src/lib/alerts/checkAlerts.test.ts` — first tests for the module (6). The concurrency one asserts start/end ordering directly, because a serial regression changes no output and breaks no type.

**Repo hygiene, so the next session starts clean:**

- **#22 closed** (NBM — the branch could never have returned data; verified against the live API) and **#26 closed** (both alert-path bugs, plus the `/start` HTML defect found with them). Both had been recorded as closed in `plan.md` while still open on GitHub — the docs and the tracker had drifted apart.
- **#27 commented** with a part-by-part status: parts 1 and 3 done, parts 2 (`update_id` dedupe) and 4 (Neon `Pool` lifecycle) still open with reasons.
- **#34 commented** with the precise current shape: display is guarded, scoring is not.
- All feature branches merged and pruned; `main` is the only branch and no PRs are open.

**Known issues / deferred work — the actual open list is 6, not the 5 `plan.md` used to track:**

| Issue | State |
| --- | --- |
| #21 | Scoring half open. **Deferred by the user**, twice, explicitly. |
| #25 | `/history` and `/normals` return `[]` forever. Needs a design call on where the write goes. |
| #27 | Parts 2 and 4 open: `update_id` dedupe (needs a table, so a schema change) and Neon `Pool` lifecycle (unmeasured — no dead-client 500 seen in the logs yet). |
| #32 | A missing today-row inflates the score via full-credit fallbacks. Same family as #34. |
| #33 | "Today" is a UTC date, so today's high becomes tomorrow's in the late afternoon. Server-side fix; do not paper over it in the client. |
| #34 | A swallowed rainfall fetch awards 40/40 drying credit. Display guarded, scoring not. |

Also still open and unfiled: `GET /forecast/:id` and `GET /conditions/:id` each run their own `computeLiveForecast`, so one detail view is two ensemble calls and a list of N climbing locations is 2N; and `parseEnsemble` substitutes `0`/`50` for missing values, making the em-dash formatters unreachable from the live forecast.

**Blockers for next session:** none.

**What's next:** the user's stated order — polish and Mini App adjustments; then new bot commands and text-based weather updates (**a design conversation they want to have, not a spec to write alone**); then an in-app feedback button that writes a note into this repo.

**Gotchas for next session:**

- **GitHub Actions was backed up for 25+ minutes** on 2026-08-26 and both PRs were merged on local verification instead. CI is exactly `npm ci` + `typecheck` + `lint` + `test`, so the local gate is equivalent apart from the Node version (CI pins 20, this machine runs 24). Both merges were additionally re-run with `npx turbo run … --force` to defeat the turbo cache, and both Vercel projects built. If something surfaces that only CI would have caught, that Node gap is the first place to look.
- **Prove a test fails before trusting it.** The concurrency test's first draft gated resolution on all three locations having started, which *deadlocked* against serial code rather than failing — it would have hung CI instead of reporting the regression. Rewritten to assert ordering, it fails in 132ms. Running a new test against the old implementation is cheap and is the only thing that shows it can fail.
- **A branch cut from `main` while another PR is open needs a rebase before merging**, and the combined state re-verified — `fix/parallel-alerts-check` and `fix/pool-all-ensemble-models` touched different files but only the rebase proved the suite was green with both.

**Does the user need to do anything?** **Yes — one thing, unchanged from earlier today.** Set `TELEGRAM_WEBHOOK_SECRET` in the API's Vercel project to a long random string, then re-run Telegram's `setWebhook` with `secret_token` set to the same value. The #27 part-1 fix is deliberately inert until both are done, and the bot works exactly as before in the meantime.

---

## 2026-08-26 — branch: fix/local-day-forecast (squash-merged to `main`) — commit: 804930b (PR #47)

**Phase completed:** #33 and #34 fixed, plus #27 part 4. Prompted by the user asking, fairly, why the open issues weren't being fixed.

**Why this session happened:** the previous block deferred #32/#33/#34 as "scoring", sweeping them into the user's #21 deferral. That was wrong. #21 is *tuning* — the user deferred that twice and it stays deferred. #33 and #34 are **correctness bugs where missing data renders as good news**, which is a different thing and squarely inside "I mainly want a functional chat/weather app".

**What was built this session:**

- **#33 — "today" is the location's local day.** Open-Meteo is asked for `timezone=auto`, so it buckets the hourly series into local calendar days and reports `utc_offset_seconds` back. `computeLiveForecast` returns `todayStr` and flags the row with `is_today`; no route derives a date and no client computes one. **The duplication was the bug** — the API (in three routes), the Mini App and the bot each derived a UTC date and compared it to UTC buckets, so all four were wrong in the same direction, agreed with each other, and nothing could detect it.
- **#34 — a failed rainfall lookup withholds the score.** Tracks whether the call *succeeded*, not whether it returned rows. Weather still returned in full; a genuinely empty result still scores. Both surfaces say the same thing from one string in `packages/types`.
- **#27 part 4, the half that is not a guess** — an `'error'` listener on the Neon pool. `pg`'s `Pool` is an `EventEmitter` and an `'error'` event with no listener **crashes the process**; it fires for faults on an idle client, which on a thawed serverless instance is the connection Neon already dropped. Pool sizing and idle timeouts deliberately untouched — flagged as "worth a look rather than an assumed fix", and no dead-client 500 has appeared in the logs.
- Tests 299 → 315.

**Verified against the live API**, 16:41 UTC: Red Rock (UTC−7) → `2026-08-26`, Sydney (UTC+10) → `2026-08-27`, exactly one row flagged each. The old code said the 26th for both.

**Issue state — 4 open, down from 6:**

| Issue | State |
| --- | --- |
| #21 | Scoring half open. **Deferred by the user, twice.** Do not start it. |
| #25 | Open. **Needs a product decision**, not code: nothing writes `crag_climbability_history` or `location_normals` any more, so it is either a new cron or deleting the two endpoints. |
| #27 | Parts 1, 3, 4 done. **Part 2 open** — `update_id` dedupe needs a table to record seen ids, so a migration, which cannot be applied from here. |
| #32 | Open, but materially less likely now that today's row reliably exists. **Entangled with the unfiled `ScoreInput` split** — `currentHumidityPct` feeds both the humidity component and the drying modifier, so fixing one moves the other. |

**Known issues / deferred work:**

- **A layer below #34:** ACIS can return a *successful* response whose rows are all `'M'` sentinels, yielding `[]` — indistinguishable from a dry month again. This fix catches a failed *call*, not a call that succeeded with no usable data. Worth its own issue if it appears in the logs.
- Still unfiled: the `ScoreInput` humidity conflation, and `GET /forecast/:id` + `GET /conditions/:id` each running their own `computeLiveForecast` (one detail view is two ensemble calls; a list of N climbing locations is 2N).

**Blockers for next session:** none.

**What's next:** polish and Mini App adjustments, then the bot-commands design conversation, then the feedback button.

**Gotchas for next session:**

- **`timezone=auto` supersedes a rule written earlier the same day.** `architecture.md` said "every Open-Meteo call sets `timezone=UTC` explicitly" — correct for the design at the time, wrong now. If a doc and the code disagree about timezone, the code and issue #33 are right.
- **`computePercentile` interpolates**, and `renderToStaticMarkup` escapes apostrophes to `&#x27;`. Both cost a wrong test expectation this session — assert on a substring without the apostrophe.
- **A module mock replaces the whole module.** `vi.mock('../weather/openMeteo.js', () => ({...}))` hid `localDateString` and broke ten tests. Use `importOriginal` and spread — reimplementing a pure helper inside the mock is the class-11 trap.
- **GitHub Actions was backed up ~40 minutes earlier today** and PRs #45/#46 were merged on local verification. All of it has since gone green on `main` retroactively. #47 waited for real CI.

**Does the user need to do anything?** **Yes — one thing, still the same one.** Set `TELEGRAM_WEBHOOK_SECRET` in the API's Vercel project to a long random string, then re-run Telegram's `setWebhook` with `secret_token` set to the same value. Nothing else outstanding needs them; #25 needs a decision from them but only when they want to pick it up.

---

## 2026-08-26 — branch: chore/agent-systems-stage-0-1 (squash-merged to `main`) — commit: b954e9f (PR #48)

**Phase completed:** Agent-systems review, Stage 0 and Stage 1. Process infrastructure only — no product code touched.

**Why this session happened:** the user asked for a review of *how we work* rather than what we built — "our systems of coding, you and my interactions, agent automation, architecture" — plus research into current practice, ahead of a run of feature work. The stated symptom was "a lot of human interaction at times".

**What the review found (ten findings, evidence in PR #48 and the published report):**

- **Every hook was a silent no-op and always had been.** Both scripts parsed stdin with `python3`, which on this machine is the Windows Store stub — it prints an advert and exits 0. `rm -rf /`, `DROP TABLE users` and the drizzle push guard all returned exit 0. CLAUDE.md already said Python is not installed; the hooks were written against an assumption the project had documented as false.
- **Two guards were broken a second way:** they read `tool_input.path`, but Write/Edit send `file_path`. They could not have fired even with a working Python.
- **A third hook was dead:** `settings.json` matched `mcp__github__create_pull_request`, but no GitHub MCP server is configured here — PRs are opened with `gh`.
- **66,532 tokens were spent before the first question** — ~33% of a 200k window. `session-notes.md` alone was 41,223.
- **The session log had newest entries at both ends** (line 3 and line 1689 both 2026-08-26). Some sessions appended, some prepended. A handoff doc had already written a workaround for it.
- **Docs-only commits: 31% lifetime, 56% of the last 60, 66% of the last 30** — accelerating, which is the signature of upkeep growing with its own size.
- **The reconciliation protocol failed on its own most recent run.** `a20bfc1`, titled *"record the corrected issue state"*, touched only the session log; `plan.md` still said six issues open when GitHub said four, and still marked #33/#34 open after both were fixed.
- **No permissions allowlist existed at all** — the direct cause of the interaction the user complained about.
- **Both review agents were pinned to `claude-sonnet-4-6`**, a previous generation, on a project whose defining problem is defects that pass every automated gate.
- **The Mini App is 90 inline styles and 0 classNames** — one `:focus-visible` in the whole app, no hover, transition, keyframe or media query, because inline styles cannot express them.

**What was built this session:**

- `.claude/hooks/pre-tool-safety.mjs`, `post-push-review.mjs` — rewritten in Node; the two `.sh` files deleted.
- `.claude/hooks/check-hooks.mjs` + `npm run check:hooks` — 41 cases, real payloads over stdin, exit codes and output asserted. Includes over-blocking regressions.
- `.claude/settings.json` — permissions allowlist (allow / ask / deny), hooks rewired.
- `.claude/docs/STATE.md` — NEW. The only state document.
- `session-notes.md` → `session-archive.md` (this file). Never read at session start.
- `.claude/skills/review-checklist/SKILL.md`, `.claude/skills/miniapp-patterns/SKILL.md` — moved out of always-loaded rules; the second is `paths`-scoped.
- `scripts/postinstall.mjs` — the Expo Router fixup is now conditional on `apps/mobile` being installed.
- Deleted: `railway.json` (project deploys to Vercel; its `startCommand` ran migrations on boot), `.claude/docs/review-findings.md` (a closed round-3 review).

**Verified:** `check:hooks` 41/41, `typecheck` 6/6, `lint` 4/4, `test` 315/315, CI green on the PR. Every `.claude/`/`docs/`/`scripts/` path referenced in markdown checked for existence. Every rule extracted into `miniapp-patterns` confirmed present in the skill and absent from `architecture.md`.

**Not verified:** nothing was run against the database or production — this branch touches no code that reaches either.

**Known issues / deferred work:**

- **Stage 2 as originally proposed is cancelled.** It was a CSS architecture, a motion system and a Chrome-based visual review loop for the Mini App. The user downgraded Mini App design the same day — *"I overstated the design portion… the Mini App doesn't need to be super fancy."* The inline-style ceiling is real and documented in `miniapp-patterns`, but lifting it is **not authorised**.
- `apps/mobile` still in the repo — 9,833 LOC, 42% of all TypeScript here. Out of the build, so it costs nothing at runtime; removing it is a separate decision nobody has asked for.
- CLAUDE.md is still 6,118 tokens and could be pruned further. The deployment-gotchas section is largely situational and would suit a skill.

**Blockers for next session:** none.

**What's next:** the **chat interface** — plain-language questions to the bot, plus slash commands that pull specific information about a location or a span of time. The user wants this design conversation **before** any spec is written. Do not spec it unilaterally.

**Gotchas for next session:**

- **The hooks are live now, and they block.** If a `git commit` is refused, read the message — a commit body that *describes* a forbidden command used to trip it, and `stripInertText` now handles heredocs and `-m` payloads. If a new false positive appears, add a case to `check-hooks.mjs` rather than loosening a guard.
- **Do not re-add a status table for issues anywhere.** `gh issue list` is the source. This was the single most persistent drift in the repo's history.
- **STATE.md is rewritten, not appended.** If it starts growing past ~1,500 words, something in it is history and belongs down here.
- **A skill's body does not load until it triggers.** `review-checklist` is invoked with `/review-checklist`; `miniapp-patterns` loads on `apps/miniapp/**`. If a rule seems to have vanished, it is in a skill, not deleted.

**Does the user need to do anything?** **Yes — one thing, and it is the same one as last session.** Set `TELEGRAM_WEBHOOK_SECRET` in the API's Vercel project to a long random string, then re-run Telegram's `setWebhook` with `secret_token` set to the same value. Separately, `gh pr merge` is now in the permissions allowlist — that was a deliberate reading of the standing "Claude merges, not the user" preference, and it is one word to reverse if unwanted.

---

## 2026-08-26 — branch: chore/enforce-finish-discipline (squash-merged to `main`) — commit: 516b438 (PR #49)

**Phase completed:** the finish-the-delivery rule turned into an enforced gate. Process infrastructure only.

**Why this session happened:** the user asked whether everything had been reviewed, PR'd and merged, then said — *"If you keep forgetting those steps then I need those rules integrated somehow. I only want to interact when it is ABSOLUTELY needed."*

**What the audit of repo state actually found:**

- **One real slip.** `918ccaa`, the previous session's own record, was committed and pushed **straight to `main` with no PR**, while CLAUDE.md already said work lands via a branch and a PR. Confirmed by matching it against the merge commits of PRs #46–#48 — it corresponds to none of them.
- **One false alarm.** `origin/chore/agent-systems-stage-0-1` appeared in `git branch -r` after `gh pr merge --delete-branch`. It was a stale *local tracking ref*; the remote had already deleted it. `git fetch --prune` cleared it. Worth recording because the first read of the evidence was wrong.
- Everything else was clean: no open PRs, working tree clean, `main` in sync, CI green.

**What was built this session:**

- `.claude/hooks/lib/gitState.mjs` — shared git/`gh` readers. Every call timeout-bounded (5s git, 10s gh) and returns a neutral value on failure. A hook that hangs or throws is worse than one that does not fire, and the Stop hook runs every turn.
- **PreToolUse guard: `git commit` on the default branch is blocked.** Default branch read from `origin/HEAD`, not assumed, so it does not misfire on a `master` repo. `--amend` caught too. Stands down if git state cannot be determined.
- **`.claude/hooks/session-finish-check.mjs` — a Stop hook.** Blocks the turn from ending on: uncommitted changes, unpushed commits (including on the default branch, with instructions to move them), a pushed branch with no PR, or a green mergeable PR left open. Exit 2 hands the reason back so the work gets finished rather than the user having to notice. Claude Code overrides after 8 consecutive blocks — the deadlock valve. `.claude/.wip` suppresses it; gitignored.
- `check:hooks` 41 → 49. The seven git-state scenarios build **scratch repositories** (bare origin + clone) rather than mocking.

**Verified:** check:hooks 49/49, typecheck 6/6, lint 4/4, CI green on the PR. Both new guards sabotage-tested — disabling the dirty-tree check failed exactly 1 case, disabling the default-branch guard failed exactly 2, nothing else moved. The Stop hook was also exercised live in the real repo: exit 2 with a dirty tree, exit 0 once clean.

**A defect introduced and caught in the same session:** adding the default-branch guard made two existing `check-hooks` cases ambient-dependent — they ran `git commit` against the *real* repo, so the same payload passed on a feature branch and blocked on `main`. That is class 11 in `defect-patterns.md`, a fixture that does not control what it claims to test. Both moved into controlled repos, and two `--amend` cases added alongside.

**Known issues / deferred work:**

- The Stop hook does **not** check whether tests pass. That is deliberate — CI and the review checklist own correctness; this hook owns delivery. Do not merge the two concerns.
- If `gh` is unavailable the PR checks are skipped rather than guessed, so on an offline or unauthenticated machine the "pushed branch with no PR" and "green PR left open" gates are inert. Acceptable: they cannot deadlock a session, which matters more.

**Blockers for next session:** none.

**What's next:** the **chat interface** — plain-language questions plus slash commands for a location or a span of time. The design conversation comes first; do not spec it unilaterally.

**Gotchas for next session:**

- **You cannot commit on `main` any more.** Branch first. This is not advisory.
- **The turn will not end with work outstanding.** If the Stop hook fires, finish the work — commit, push, PR, merge. If it misfires, add a case to `check-hooks.mjs`; do not loosen the guard.
- **`PIPESTATUS[0]` in a three-stage pipeline is the first command, not the middle one.** Cost one wrong reading of a hook's exit code this session. Capture into a variable instead.

**Does the user need to do anything?** **Yes — one thing, unchanged.** Set `TELEGRAM_WEBHOOK_SECRET` in the API's Vercel project to a long random string, then re-run Telegram's `setWebhook` with `secret_token` set to the same value. Nothing else is waiting on them.

---

## 2026-08-26 — branch: fix/hook-check-ambient-branch (squash-merged to `main`) — commit: see PR #51

**Phase completed:** follow-up fix. `check:hooks` was branch-dependent; now it is not.

**Why this session happened:** the post-merge audit on `main` — run because the user asked whether everything was reviewed, PR'd and merged — found `npm run check:hooks` **failing on `main` while passing on the feature branch it shipped from.**

**The defect:** three cases carried `git commit` payloads and ran with the real repo as cwd. Once the default-branch guard landed in `516b438`, their verdict became a function of which branch happened to be checked out — ALLOW on a feature branch, BLOCK on `main`.

**This was the second time the same bug shipped in this file.** The first pass moved the two cases that were obvious; these three had `git commit` buried inside a longer payload and were missed. **Fixing instances is not fixing a category** — class 11 in `defect-patterns.md`.

**The fix is categorical, not instance-level.** Before any case runs, the harness scans `cases` for a `git commit` payload expecting ALLOW and fails with a `[meta]` error naming the case and where it belongs. Sabotage-tested: re-introducing the bug produces exactly that failure and nothing else moves. The three cases moved to `gitScenarios` on feature branches, so what they now measure is `stripInertText` rather than the branch guard.

**Verified:** 49/49 on a feature branch **and** 49/49 with `main` checked out — the case that was failing. Plus typecheck 6/6, lint 4/4, test 315/315, CI green.

**Blockers for next session:** none.

**What's next:** the **chat interface**. Design conversation first.

**Gotchas for next session:**

- **A test that runs against the real repo inherits the real repo's state.** `check-hooks.mjs` has two tables for this reason: `cases` (ambient cwd, for payloads whose verdict cannot depend on git state) and `gitScenarios` (scratch repo, branch controlled). If a new case involves git state at all, it goes in the second.
- **Run `npm run check:hooks` on `main` after merging, not only on the branch.** The branch run structurally could not see this failure. The post-merge audit is what caught it.

**Does the user need to do anything?** **Yes — one thing, unchanged.** Set `TELEGRAM_WEBHOOK_SECRET` in the API's Vercel project to a long random string, then re-run Telegram's `setWebhook` with `secret_token` set to the same value.

---

## 2026-08-26 — branch: fix/verification-is-enforced — commit: 432b25f

**Phase completed:** Agent systems — verification enforcement (the second half of the enforcement work begun in `516b438`)

**Why this session happened:** the user asked, after the previous session's enforcement work, what the point of those systems was when the very next thing that happened was a missed defect and a manual request for another sweep. That is a fair question and it had a mechanical answer.

**The diagnosis:**

- **CI never ran `check:hooks`.** It reported `success` on `bfe1e83` while `check:hooks` was failing **46 of its 49 cases** on `main`. The gate written that morning was real; no machine ran it. `check:hooks` appeared **zero** times in `ci.yml`.
- **`main` had no branch protection and no rulesets.** `gh pr merge` would merge a red PR, and only a local PreToolUse hook stood between a commit and the default branch. That is what let `918ccaa` happen.
- **`npm run build` was never in CI**, so the Mini App's Vite build was unverified before merge.
- **Nothing reported a red run on `main`.**
- The Stop hook's own source said *"Deliberately NOT checked here: whether tests pass. That belongs to CI"* — correctness was delegated to a CI that had never been audited.

**What was built this session:**

- `.github/workflows/ci.yml` — now runs `build`, `typecheck`, `lint`, `test`, and **every root-level `check:*` script enumerated from `package.json`** rather than listed in the workflow. `--if-present` dropped from `test` so a vanished script fails loudly. `fetch-depth: 0` so ambient-cwd git readers behave like a real clone instead of standing down and passing without measuring anything.
- `.claude/hooks/session-start-state.mjs` — SessionStart hook injecting branch, working tree, unpushed commits, open PRs with CI status, open issues, **default-branch CI health**, and `STATE.md` verbatim. Replaces steps 1–2 of the Session Start Protocol, which were steps an agent had to remember.
- `.claude/hooks/check-hooks.mjs` — 49 → 58 cases. Five SessionStart scenarios plus a **categorical `[meta]` assertion that every hook `settings.json` registers is exercised by some scenario**. An untested hook is now unmergeable.
- `.github/workflows/claude-review.yml` — independent reviewer on every non-draft PR, running outside the session that wrote the code. Skips with a visible GitHub **notice** when the credential is absent, so a 3-second green cannot be mistaken for "reviewed clean".
- `REVIEW.md` — severity calibration for managed Code Review, written against this repo's real defect classes.
- `.claude/settings.json` — SessionStart registered; `typescript-lsp` and `security-guidance` enabled at project scope.
- **Branch protection on `main`** (repo settings, applied with the user's explicit approval): PR required, `ci` required and strict, linear history, no force-push, no deletion, **enforced for admins**. `delete_branch_on_merge` turned on.

**Verification:** 58/58 hook cases locally **and on the CI runner** (confirmed by reading the job log, not by trusting the green). build/typecheck/lint/test all green. Every new assertion sabotage-tested — registering an uncovered hook, omitting the branch, reporting a dirty tree as clean, never inlining `STATE.md`, and exiting non-zero each failed exactly the assertions that should care.

**One probe was invalid and is worth recording.** The first sabotage of the branch assertion renamed the *label* (`branch:` → `br:`) and nothing failed — correctly, because the assertion checks the branch **name** reaches context, not its label. The probe was replaced, not the test. A sabotage that does not break the property under test proves nothing about the test.

**Known issues / deferred work:**

- Branch protection was verified by GitHub's API reporting it active, **not** by attempting a push and watching it be rejected. The failure mode of being wrong was an unwanted commit on a branch that now refuses force-pushes.
- `typescript-lsp` and `security-guidance` were installed from the shell, so they do not load until Claude Code restarts or `/reload-plugins` runs.
- Managed **Code Review** (multi-agent, inline comments, \$15–25/PR) is Team/Enterprise only and was not enabled. `REVIEW.md` is inert until it is.

**Blockers for next session:** none.

**What's next:** the **chat interface** — plain-language questions plus slash commands over a location or a span of time. Design conversation first; do not spec it unilaterally.

**Gotchas for next session:**

- **The previous session's gotcha "run `check:hooks` on `main` after merging, not only on the branch" is superseded.** CI now runs it on every push and PR, including pushes to `main`, and a red run on `main` is reported at session start. Doing it by hand is no longer the control.
- **Session start is injected, not read.** If the `# Injected session state` block is absent, the hook did not fire — say so rather than silently falling back, because everything downstream assumes it ran.
- **A root-level `check:*` script is expected to be hermetic.** CI runs all of them with no `DATABASE_URL`. Anything needing a real database stays a workspace-level script (`apps/api`'s `check:add-location`, `check:delete-trip`).
- **Do not disable branch protection to land something.** If a gate fires, fix the red check.

**Does the user need to do anything?** **Yes — one thing, and it is the same one as the last three sessions.** Set `TELEGRAM_WEBHOOK_SECRET` in the API's Vercel project, then re-run Telegram's `setWebhook` with a matching `secret_token`. `CLAUDE_CODE_OAUTH_TOKEN` is **done** — registered 2026-08-26 20:51 UTC, so the independent reviewer is live. Worth doing once, but not owed: restart Claude Code so the two new plugins load.

---

## 2026-08-26 — branch: chore/trim-always-loaded-md — commit: (pending squash)

**Phase completed:** Agent systems — trimming the always-loaded instruction set

**Why this session happened:** `/doctor` measured ~14,000 est. tokens of markdown loading into
every session before the first message. Anthropic's own best-practices guidance names that as
the cause of a specific symptom this repo keeps hitting: *"Bloated CLAUDE.md files cause Claude
to ignore your actual instructions"* and *"if Claude keeps doing something you don't want
despite having a rule against it, the file is probably too long and the rule is getting lost."*

**What changed:**
- `CLAUDE.md` — 26,896 to 17,711 chars. Cuts listed below. Every safety-critical prohibition
  was verified present after the rewrite.
- `.claude/rules/architecture.md` — 19,904 to 19,199 chars. Only 705 chars of resolved history
  were removable; the file is overwhelmingly genuine invariants. The pre-trim estimate of
  ~2,500 was wrong and is recorded here as wrong.
- `.claude/skills/session-end/SKILL.md` — new. The Session End Protocol moved out of
  `CLAUDE.md` (the single largest block in it) into a skill that loads only when invoked.
- `apps/mobile/ARCHIVED.md` — received the mobile gotchas that had been always-loaded in every
  session long after that workspace left the build.
- `.claude/rules/defect-patterns.md` — untouched. Already lean, and the highest value per token
  in the repo.

**The incident history removed from `CLAUDE.md`, preserved here:**

- *Why the delivery gate is a hook and not prose:* on 2026-08-26 a session-record commit went
  straight to `main` with no PR while `CLAUDE.md` already said not to. The rule was correct and
  followed most of the time; most of the time is not a gate.
- *Why every root-level `check:*` script is enumerated by CI:* `check:hooks` — a real gate,
  written that same morning — was absent from `ci.yml`, so CI reported **success** on commit
  `bfe1e83` while `check:hooks` was failing **46 of its 49 cases** on `main`. The gate was fine.
  Nothing ran it.
- *Why the Verification Standards section existed at that length:* on 2026-08-26 one session
  found **ten defects** in code that had already passed typecheck, lint and the full suite —
  three live in production, one meaning the bot's `/start` had never once worked. An earlier
  session found six the same way. This is the same argument `defect-patterns.md` makes at
  length, and it was being loaded twice per session.
- *Why the Session Start Protocol carried a "Why this is short" note:* it used to mandate
  reading `session-archive.md` (41,000 tokens) and `plan.md` (7,300) up front, putting ~66,500
  tokens in context before the first question.

**The incident history removed from `architecture.md`, preserved here:**

- `DELETE /trips/:tripId` had the same missing-cascade problem as `DELETE /locations/:id` and
  was fixed 2026-08-26. Because `POST /trips` requires at least one location, *every* trip hit
  the foreign-key violation — the endpoint had never once succeeded.
- The `initData` rule previously stated the **opposite** of the truth: it said "`signature` is
  excluded from the check string", which is the Ed25519 third-party rule, not the bot-token one
  this app uses. That left the check string a field short and **every Mini App request 401'd
  from the day auth shipped (2026-08-26)**. Corrected the same day against
  core.telegram.org/bots/webapps.
- The `timezone=auto` rule said `timezone=UTC` earlier on 2026-08-26 and was superseded by the
  issue #33 fix.
- The `Promise.allSettled` concurrency rule was applied to `GET /trips/:tripId/forecast` first
  and not carried across for months; `runAlertsCheck` caught up 2026-08-26.

**Known issues / deferred work:**
- Mutation testing (Stryker + `@stryker-mutator/vitest-runner`) is still not wired up. It is the
  mechanical answer to defect-patterns class 11 — "which line of the implementation would have
  to change for this test to fail?" is the definition of a mutation score. 26 test files, 670
  assertions, and at least three tests already known to constrain nothing.

**Blockers for next session:** none.

**What's next:** mutation testing, then the chat interface (design conversation first — do not
spec it unilaterally).

**Gotchas for next session:**
- **The Session End Protocol is now a skill, not a section of `CLAUDE.md`.** Invoke
  `/session-end`. If you go looking for it in `CLAUDE.md` you will find only a pointer.
- **Do not re-add a copy of `.env.example` to `CLAUDE.md`.** The two were verified byte-for-byte
  identical across all 16 keys, which is exactly the hand-mirroring that keeps drifting here.
  `CLAUDE.md` now holds only the four things `.env.example` cannot say.
- **A heredoc could not write the new `CLAUDE.md`** — the content's mix of backticks and
  apostrophes broke Bash parsing. Write the file with the Write tool and `cp` it into place.

**Does the user need to do anything?** **Yes — one thing, unchanged from the last four
sessions.** Set `TELEGRAM_WEBHOOK_SECRET` in the API's Vercel project and re-run Telegram's
`setWebhook` with a matching `secret_token`.

---

## 2026-08-26 — branch: chore/mutation-testing — commit: 8269be1

**Phase completed:** Agent systems — mutation testing (the last item in that workstream)

**What was built this session:**
- `apps/api/stryker.config.mjs` — Stryker 9.6.1 + `@stryker-mutator/vitest-runner`, exposed
  as `npm run test:mutation --workspace=apps/api`. 1,917 mutants over the 20 source files
  that have tests.
- `.github/workflows/mutation.yml` — the sweep on a Monday schedule and `workflow_dispatch`.
- 23 new tests across `checkAlerts`, `sendMessage`, `nwsAlerts`, `liveForecast`,
  `dryingModel`, `initData`, `conditionsScore`, `apiAuth` and `deepLink` — every survivor
  that falsified a rule already written down in `architecture.md` or in the test's own
  comment. Score 63.43% -> **66.09%** total, 72.17% -> **74.49%** covered; survivors 469 ->
  434; killed 1206 -> 1257.
- `CLAUDE.md` and `.claude/rules/defect-patterns.md` — mutation testing recorded where it
  belongs, under class 11.

**The findings worth remembering:**

- **`checkAlerts` was the worst.** The test file's own comment said `[]` "triggers the
  pruning delete" and `null` does not. Nothing asserted either, so `if (alerts === null)`
  could be replaced with `if (true)` — never trust NWS, never prune anything — and all six
  tests stayed green. Also unasserted: the *scope* of the prune. Taking the empty-set path
  with alerts present deletes the rows just upserted, `notified_at` included, and re-sends
  every live alert next run.
- **`sendMessage`'s permanent/transient split was tested only through HTTP statuses**, which
  never reach the rethrow. Only a rejected `fetch` lands in the catch beside
  `TelegramPermanentError`, so nothing could tell `instanceof` from `true`.
- **`liveForecast`'s rainfall window had no assertion on its sign.** Flipped, it asks for the
  30 days *ahead*, gets nothing, and `dryingModel`'s 720h sentinel renders that as "no rain
  in 720h" on screen — a fabricated measurement.
- **`dryingModel`'s "picks the most recent significant event" listed its fixture
  oldest-first**, so "latest by date" and "last in the array" agreed and the comparison was
  asserted by nothing.
- **`initData`'s age tests were all written in terms of `INIT_DATA_MAX_AGE_SECONDS`**, so the
  constant measured itself.

**Two mistakes made and corrected this session, both worth keeping:**

- **I nearly shipped an unverified gate.** I "confirmed" `thresholds.break` with
  `npx stryker run --thresholds.break 99` and read exit 1 as the threshold firing. That flag
  does not exist — the run never happened and the exit code was a CLI parser error. Verified
  properly afterwards with a real config-file override: break 99 against a file scoring 81.82
  exits 1, break 50 exits 0. Stryker's config-file argument is **positional**
  (`stryker run <file>`), not `--config-file`.
- **The PR reviewer caught me committing the exact defect class the PR was fixing.** My new
  `nwsAlerts` test mocked a 503 to reach the `!res.ok` guard, but `fetchWithRetry` never
  returns a 5xx or 429 to its caller — it retries four times and throws — so the response
  landed in the caller's `catch` and the guard was never evaluated. It was the network-error
  test again under a different name. Fixed with a 403. It also caught two tests named "pins
  both boundaries exactly" that cannot: the wind and humidity curves are continuous at their
  knots, so `<=`/`>=` and `<`/`>` are indistinguishable at 15/50 and 50/90 whatever the test
  is called. Renamed to what they actually assert.

**Known issues / deferred work:**
- **434 surviving mutants**, deliberately not chased. Mostly log-message string literals and
  `>=`/`>` swaps on score components. A few are genuine equivalent mutants —
  `webhookAuth`'s `value === ''` can be deleted with no observable change, because an empty
  string fails the hash comparison anyway.
- **216 mutants in code no test reaches at all.** That is a coverage problem, not a fake-test
  problem, and it is separate work.
- The PR reviewer still logs `permission_denials_count: 1` on a clean run and the log does
  not name the denied command. Not blocking; the allowlist may be one entry short.

**Blockers for next session:** none.

**What's next:** the chat interface — **a design conversation with the user first.** Plain-language
questions plus slash commands over a location or a span of time. Do not spec it unilaterally.
The solo alternative, needing no decision, is the 216 uncovered mutants.

**Gotchas for next session:**
- **`fetchWithRetry` does not hand every response back to its caller.** Only `res.ok`, or a
  non-429 status below 500. A 5xx or a 429 exhausts all four attempts and throws. Any test
  mocking a 503 to reach a `!res.ok` branch is testing the `catch` instead.
- **Stryker's `vitest.related` must stay off** in `stryker.config.mjs`. With the default, vitest
  finds no test files for a mutated source — the tests import through an ESM `./foo.js`
  specifier that resolves to `foo.ts` — and Stryker exits with "No tests were executed"
  before mutating anything. It reads as a config error, not as the silent no-op it is.
- **Stryker 9.6.1, not 10.** Stryker 10 needs Node >= 22; CI runs Node 20.
- **A gitignore pattern with a mid-path slash is anchored to the repo root.**
  `reports/mutation/` does not match `apps/api/reports/mutation/`; `**/reports/mutation/`
  does. `git check-ignore -v <path>` settles it in one command.
- **Nested backticks inside a `node -e` string in Bash will hang the shell**, not error. The
  repo's existing advice — use the Edit tool for multi-line replacements — covers this too.

**Does the user need to do anything?** **Yes — one thing, unchanged since 2026-08-26.** Set
`TELEGRAM_WEBHOOK_SECRET` in the API's Vercel project to a long random string, then re-run
Telegram's `setWebhook` with `secret_token` set to the same value. Until then the webhook's
secret check is skipped and the forgeable `chat.id` is the only gate.

---

## 2026-08-31 — branch: docs/telegram-precision-interface-plan — commit: ad97073

**Phase completed:** None. Design only — Phase 0 of the Telegram precision interface is specified but not started.

**What was built this session:**
- `.claude/docs/telegram-precision-interface-plan.md` — the approved spec for the Telegram precision interface, settled over five rounds of questions plus web research. No code.
- `.claude/docs/STATE.md` — direction item 2 rewritten from a one-line description to a pointer at the plan, plus a § What Phase 0 is for section
- `.claude/docs/plan.md` — banner marking it as the original 13-phase build plan and pointing at the new doc for current direction
- `CLAUDE.md` — one line added to the MANDATORY reading rules for Telegram/chat work

**Known issues / deferred work:**
- **Two rendering claims in the plan are unverified.** That Telegram Web shows an unsupported-message card for rich messages, and that the "editing destroys rich formatting" report is a client-library bug rather than an API limit, both rest on third-party issue trackers (an LLM-agent project), not on Telegram's own sources. Probe B exists to settle them. The independent PR reviewer caught this and the plan now labels both as unverified.
- Retention is 14 days parsed / 48h raw, so a trip four weeks out has no trend history until it comes inside the window. Accepted, not a defect.
- The conditions score algorithm (open half of #21) stays deferred and must not ride along inside this work.

**Blockers for next session:**
- None for Phase 0. Probe B sends real messages through the bot, so `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` must be set in the shell for that script.

**What's next:** Phase 0 — `git checkout -b phase/0-probes` off `main` — read `.claude/docs/telegram-precision-interface-plan.md` §Phase 0 before writing any code. Two throwaway probe scripts producing `.claude/docs/model-matrix.md` and `.claude/docs/telegram-render.md`. Nothing else in the plan may start before both land.

**Gotchas for next session:**
- **A plan file written in plan mode lives outside the repo** at `~/.claude/plans/<generated-name>.md`, and a fresh session will never find it. Copy it into `.claude/docs/` and point STATE.md at it before the session ends, or the work is lost.
- **Relative links in `.claude/docs/*.md` need `../../` to reach repo-root paths.** GitHub resolves them against the containing directory, so `apps/api/...` 404s from a file in `.claude/docs/`. The reviewer caught nine of these.
- **`DEPENDENT_TABLES` cannot hold a table without a `location_id` column.** The loop in `deleteLocationCascade` does `eq(table.location_id, locationId)` directly. The planned `weather_run_hours` / `weather_ensemble_hours` key off `run_id`, so they need a bespoke delete ordered *before* `weather_runs` — the plan now spells this out. Following the flat rule literally would produce the FK violation the rule exists to prevent, one level down.
- **A direction message naming a feature area is not a build order.** This session opened by building off one, was stopped, and the plan that emerged from five rounds of questions is nothing like what that first hour produced.
- **Two file cards with the same filename are indistinguishable in a transcript.** The user read v1 and reported the plan had not changed; it had.

**Does the user need to do anything?** **Yes — one thing, unchanged since 2026-08-26.** Set `TELEGRAM_WEBHOOK_SECRET` in the API's Vercel project to a long random string, then re-run Telegram's `setWebhook` with `secret_token` set to the same value. Until then the webhook's secret check is skipped and the forgeable `chat.id` is the only gate. Probe B sends test messages through that same bot, so it is worth doing before Phase 0 rather than after.

---

## 2026-08-31 — branch: phase0-probes — commit: 5544fe6

**Phase completed:** Phase 0 — probes. Probe A complete; Probe B's API half complete, its client-observation half outstanding and assigned to the user.

**What was built this session:**
- `apps/api/src/scripts/probeModels.ts` (`npm run probe:models`) — asks Open-Meteo, per point per model per variable, what actually comes back, and generates `.claude/docs/model-matrix.md`
- `.claude/docs/model-matrix.md` — the generated measurement: four points × six models × twelve hourly variables, plus ensemble member counts, the NBM daily-percentile answer, and a derived "not the selected model's own output" section
- `apps/api/src/scripts/probeTelegramRender.ts` (`npm run probe:telegram-render`) — sends nine rendering specimens to the configured chat and prints what to look for on each client
- `.claude/docs/telegram-render.md` — §1 the Bot API surface verified against Telegram's own reference; §2 an empty Observations table only a human with three clients can fill
- `.claude/docs/telegram-precision-interface-plan.md` — § What the probes changed added, Phase 0 status banner, the Variables row qualified, and the "rendered natively on mobile, desktop and web" claim corrected in place

**What Probe A found, each contradicting an assumption in the plan:**
- `precipitation_probability` is **not the selected model's field** — 276h under a 54h HRRR, byte-identical to NBM's series. A per-model column headed with that model would be attribution not backed by the data.
- `ncep_nbm_conus` defines both pressure variables and returns **384 nulls** for each, so pressure tendency cannot come from NBM.
- **No run initialization time is exposed** — only `generationtime_ms`, which is how long Open-Meteo spent answering. Headers say "fetched HH:MMZ".
- **Out-of-coverage is a 400, not nulls.** That 400 is what the enabled/disabled model button derives from, at one request per model.
- Ensemble confirmed at 143 members: ECMWF 51, ICON 40, GFS 31, GEM 21, 168h.

**Known issues / deferred work:**
- **Probe B §2 has never been run.** No bot token in this environment, and the question needs three real clients. Nothing about client rendering is claimed anywhere as a result.
- The probes are `probe:*` under `apps/api`, deliberately not `check:*` — CI runs every root-level `check:*`, and one probe hits a rate-limited external API while the other sends real Telegram messages.
- The first version of `probeModels.ts` counted ensemble members with `/_member\d+$/`, which matches nothing because the member number sits mid-key. It reported 143 models of one member each. Caught by reading the generated output, not by any check.

**Blockers for next session:**
- None. Phase 1 (interaction layer) is unblocked: `<pre>` monospace ships regardless of Probe B §2, and only the rich-table upgrade waits on it.

**What's next:** Phase 1 — `git checkout -b phase/1-interaction` off `main` — read `.claude/docs/telegram-precision-interface-plan.md` § Phase 1 and § Traps. Widen `sendMessage.ts` to a two-arm button union, add `callbackData.ts`, `commands.ts`, `panelState.ts`, `panels.ts`, dispatch `callback_query` in the webhook, and register `setMyCommands`. `callback_query` auth is a new hole: **both** `callback_query.from.id` and `callback_query.message.chat.id` must be checked against `TELEGRAM_CHAT_ID`, and every refusal still answers 200.

**Gotchas for next session:**
- **A model's horizon is per variable, not per model.** NBM's `shortwave_radiation` stops at 48h while its temperature runs to 270h. A table that pages by day must stop each column where its values stop.
- **Two models returning a byte-identical series means one is being served the other's data.** The matrix's anomalies section is generated by comparing whole series, and it is the check that caught `precipitation_probability`.
- **`fetchWithRetry` hands a non-429 4xx back rather than throwing**, which is why the probe can treat a 400 as a result. A test that mocks a 503 to reach a `!res.ok` branch reaches the caller's `catch` instead.
- **The bot token travels in the Telegram URL**, so a transport error must not carry its own message out of a probe — `probeTelegramRender.ts` replaces it with a method-name-only error for exactly that reason.
- **Rich Messages need `blocks` on `InputRichMessage`, added in 10.2**, not 10.1. Exactly one of `blocks`, `html` or `markdown` may be set, and a `RichText` may be a plain string — which is what makes a table cell one line rather than a tree.

**Does the user need to do anything?** **Yes — two things.** (1) Run `npm run probe:telegram-render --workspace=apps/api` with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` set in the shell, then look at the chat on a phone, a desktop client and web.telegram.org and fill the Observations table in `.claude/docs/telegram-render.md`. It decides whether rich tables ever ship. (2) Still outstanding since 2026-08-26: set `TELEGRAM_WEBHOOK_SECRET` in the API's Vercel project and re-run `setWebhook` with a matching `secret_token`.

---

## 2026-08-31 — branch: docs/probe-b-observations — commit: 745bb61

**Phase completed:** Phase 0 — Probe B run 1. Ten specimens sent to the live bot, all accepted; phone and desktop observed, web still unobserved.

**What was built this session:**
- `.claude/docs/telegram-render.md` — §2 Observations filled for phone and desktop, plus a § What run 1 settled section and the outcome-rule table marked where run 1 landed
- `.claude/docs/telegram-precision-interface-plan.md` — the unverified-claims box annotated with what is now disproven, the `DisabledButton` paragraph withdrawn, and the Model buttons / Rendering rows in § Settled decisions rewritten
- `.claude/docs/STATE.md` — § What Phase 0 found rewritten around the measurements; § What the user owes reduced to the web tab

**What Probe B run 1 found:**
- **Rich tables render and survive an in-place edit.** Specimen 7 edited specimen 6's message id with `rich_message` and came back a table with new values on both clients. The second-hand "editing destroys rich formatting" claim is false there.
- **`DisabledButton` is accepted by the API and invisible in the UI.** HRRR looked identical to GFS and ECMWF on phone and desktop, so it cannot carry "this model does not reach here". Phase 1 uses a labelled non-button row; omitting the model stays forbidden.
- **Rich blocks need no HTML escaping** — `&` and `<>` survived unaltered, because blocks are structured JSON. The `<pre>` path still needs `escapeTelegramHtml`.
- **Nine columns fit on the phone** with no wrap and no horizontal scroll. Phase 3's column sets are not width-limited to five.
- The `<pre>` fallback renders correctly on both clients, columns aligned.

**Known issues / deferred work:**
- **Web is unobserved**, and it is the client the remaining unverified claim is about. Until then `<pre>` ships first and rich tables stay an opt-in upgrade.
- **Client build numbers were not recorded.** Rich Messages are weeks old, so a future contradiction is more likely a version difference than a mistake — record them next run.
- Whether the disabled button is *inert* when tapped was not tested. It does not change the decision: a control that looks tappable and does nothing is worse than a labelled row.

**Blockers for next session:**
- None. Phase 1 is unblocked.

**What's next:** Phase 1 — `git checkout -b phase/1-interaction` off `main` — read `.claude/docs/telegram-precision-interface-plan.md` § Phase 1 and § Traps. `callback_query` auth is a new hole: **both** `callback_query.from.id` and `callback_query.message.chat.id` must be checked against `TELEGRAM_CHAT_ID`, and every refusal still answers 200.

**Gotchas for next session:**
- **`sendRichMessage` and `sendMessage` have different escaping rules.** Escaping a rich block would put literal `&amp;` on screen; not escaping a `<pre>` is a 400 the webhook swallows. The path decides, not the content.
- **`disabled` on an inline button compiles, sends, and does nothing visible.** Do not reach for it to express absence.
- **A rich table's `caption` renders as a centred title above the table**, not as a footer — it is the natural home for the "Red Rock · HRRR · 3-hourly" header line.
- **The `<pre>` fallback renders as a copyable code block** with a COPY CODE affordance on both clients, which is a small bonus for a data table and worth keeping in mind before replacing it.

**Does the user need to do anything?** **Yes — one small thing.** Open web.telegram.org and look at the four specimens already in the chat (messages 70, 71, 74, 77): real tables, or an "unsupported message" card? It is the last input to whether rich tables become the primary rendering. Separately, still outstanding since 2026-08-26: set `TELEGRAM_WEBHOOK_SECRET` in the API's Vercel project and re-run `setWebhook` with a matching `secret_token`.

---

## 2026-08-31 — branch: docs/close-web-check — commit: ca9c054

**Phase completed:** None — a decision recorded, closing Phase 0.

**What was built this session:**
- `.claude/docs/telegram-render.md` — § Still outstanding replaced by § The web column stays empty, by decision
- `.claude/docs/telegram-precision-interface-plan.md` — the Rendering row in § Settled decisions changed from "`<pre>` first" to "`<pre>`, and that is the answer"
- `.claude/docs/STATE.md` — the web tab removed from § What the user owes and recorded as declined

**The decision:** the user declined the web half of Probe B. Rich tables cleared phone and desktop, in-place edit included, but **they are not adopted** — promoting them would assert something about a client nobody has looked at, which is the attribution defect this repo keeps shipping. `<pre>` monospace is the rendering. Reopening it costs one browser tab and the Web column in `telegram-render.md` §2 is waiting.

**Known issues / deferred work:**
- Rich tables remain a real, evidenced upgrade that is simply not adopted. The evidence is in `telegram-render.md` §2 if the question is reopened.

**Blockers for next session:**
- None.

**What's next:** Phase 1 — `git checkout -b phase/1-interaction` off `main` — read `.claude/docs/telegram-precision-interface-plan.md` § Phase 1 and § Traps.

**Gotchas for next session:**
- **Do not re-raise the web check.** It was declined, and asking again is how a settled answer turns back into an open question.

**Does the user need to do anything?** **No.** The only remaining item is the long-standing `TELEGRAM_WEBHOOK_SECRET` in Vercel plus a matching `setWebhook` re-run, which is unchanged and not blocking anything.

---

## 2026-08-31 — branch: phase-1-telegram-interaction-layer — commit: f66b278

**Phase completed:** Phase 1 — the interaction layer of the Telegram precision interface.

**What was built this session:**
- `lib/telegram/sendMessage.ts` — button type widened to a two-arm union closed with `?: never`; retry loop extracted into `callTelegram(method, body, tolerate?)`; `editTelegramMessage` and `answerCallbackQuery` added. `sendTelegramMessage` keeps its signature and its request body byte for byte.
- `lib/telegram/callbackData.ts` (new, pure) — `<verb>:<stateId>:<field>=<value>` inside the 64-byte ceiling; `null` rather than an approximation, and row builders drop the button.
- `lib/telegram/commands.ts` (new, pure) — bounded command parsing with the `@botname` suffix, plus `BOT_COMMANDS` and `formatHelp`.
- `lib/telegram/panelState.ts` + the `panel_states` table (migration `0007`) — create / load / update / prune, scoped by `user_id` as well as id.
- `lib/telegram/panels.ts` (new, pure) and `lib/telegram/panelViews.ts` (new, db) — `{ text, keyboard }` per view, Simple/Advanced split, an expired state that says so.
- `routes/telegramWebhook.ts` — dispatches `message` **and** `callback_query`; `/start`, `/help`, `/locations`, `/conditions`, `/alerts` all on the new machinery.
- `lib/telegram/conditionsReply.ts` — split into `findLocationByName` / `findLocationById` / `buildConditionsInput` so the typed reply and the tapped panel share one data path.
- `scripts/setBotCommands.ts` (`bot:set-commands`) and `scripts/checkPanelState.ts` (`check:panel-state`).
- Tests: `callbackData`, `commands`, `panels`, plus `editTelegramMessage` / `answerCallbackQuery` bodies and a `@ts-expect-error` assertion that the button union cannot widen. 264 → 317 api tests.

**Known issues / deferred work:**
- **`check:panel-state` has never been run.** It needs `DATABASE_URL`. Migration `0007` is written but **unapplied**, so every panel command 500s on production until `npm run db:migrate` runs.
- **Nothing has been driven from a real device.** The `initData` lesson applies: a protocol path green only against its own fixtures proves nothing.
- `panel_states` carries `model`, `interval_hours`, `column_set`, `day_offset`, `lat`, `lon`, `place_name` that nothing reads yet — Phase 2–5's, present now so the migration is not run twice.
- `prunePanelStates()` rides along on `/api/cron/check-alerts` rather than owning a route, because a new route needs a new cron-job.org registration. It moves to `/api/cron/prune-runs` in Phase 2.
- `/conditions <name>` costs two location queries — one by name to resolve it, one by id when the panel renders.
- The independent PR reviewer ran (0 permission denials, no findings) but took only 4 turns over a 3,700-line diff. Treat its silence here as weak evidence.

**Blockers for next session:**
- **Phase 2 must not start before migration `0007` is applied** — it adds three more tables to the same database and stacking an unapplied migration on an unapplied migration is how a schema drifts from the code silently.

**What's next:** Phase 2 — `git checkout -b phase/2-data-layer` off `main` — read `.claude/docs/telegram-precision-interface-plan.md` § Phase 2, § Schema and § Traps, and `.claude/docs/model-matrix.md` before choosing a model or a variable.

**Gotchas for next session:**
- **The plan's `panel_states` column names are not the shipped ones.** `interval` → `interval_hours`, `columns` → `column_set`; both of the plan's names are Postgres keywords that only work quoted.
- **`weather_runs` needs the bespoke ordered cascade the plan describes**, not a `DEPENDENT_TABLES` entry — `weather_run_hours` and `weather_ensemble_hours` key off `run_id` and cannot be added to that list at all; it would not compile.
- **Escaping has two opposite rules on this surface.** Message text is HTML and everything interpolated is escaped, `<pre>` included; **button labels are plain text**, so escaping one puts a literal `&amp;` on the button.
- **`editMessageText` tolerates exactly one 400** — "message is not modified", matched by description. Do not widen that predicate: every other 400 there is an escaping failure that must stay visible.
- **A button tap is authorized on two ids**, `callback_query.from.id` and `callback_query.message.chat.id`. Any new callback surface inherits that or it ships unauthenticated.

**Does the user need to do anything?** **Yes — two things, both needing credentials this session did not have.** (1) From `apps/api`, with `DATABASE_URL` set in the shell: `npm run db:migrate`, then `npm run check:panel-state` to prove the round trip, the scope predicate, the prune cutoff and the location-delete cascade against real Postgres. (2) `$env:TELEGRAM_BOT_TOKEN = "..."` then `npm run bot:set-commands`, so the client's command menu matches what the bot answers. Unchanged from before: `TELEGRAM_WEBHOOK_SECRET` in Vercel plus a matching `setWebhook` re-run.

---

## 2026-08-31 — branch: phase-2-data-layer — commit: fcc4b5a

**Phase completed:** Phase 2 — the data layer, from `.claude/docs/telegram-precision-interface-plan.md`

**What was built this session:**
- `lib/weather/openMeteo.ts` — `fetchDeterministicHourly` (six models in one request, hourly series retained), `parseDeterministicHourly` / `markSharedProbability` / `localTimeToUtc` (all pure), `parseEnsembleHourly`, `fetchEnsembleRun`. The daily reduction was extracted into `computeDays` and is now run pooled **and** per model.
- `OpenMeteoResult` gains `by_model` and `partial_models`. `parseEnsemble` stops flattening the per-model grouping it had already built.
- `db/schema.ts` + migration `0008` — `weather_runs`, `weather_run_hours`, `weather_ensemble_hours`.
- `lib/runs/` (new) — `pointKey.ts`, `storeRun.ts` (upserts, chunked writes, `deleteRunsForPoint`), `pruneRuns.ts`, `collectRuns.ts`.
- `routes/cron.ts` — `POST /api/cron/collect-runs` and `POST /api/cron/prune-runs`, behind a shared `cronGateFailed` guard extracted from the alerts route.
- `lib/locations/deleteLocation.ts` — the bespoke ordered step the plan called for, before the `DEPENDENT_TABLES` loop.
- `scripts/checkWeatherRuns.ts` (`check:weather-runs`).
- Tests: `openMeteoHourly.test.ts`, `pointKey.test.ts`. 317 → 339 api tests, 391 → 413 overall.

**What the session measured that the plan did not know:**
- **A multi-model `/v1/forecast` response suffixes its hourly keys only while more than one requested model has coverage.** `models=gfs_seamless,ncep_hrrr_conus` in Chamonix answers **200** with a bare `temperature_2m` — HRRR dropped silently, the survivor unlabelled — while HRRR alone there is a 400. The plan assumed the ensemble's suffix pattern carried over. Trusting the bare column would have labelled it with whichever model was listed first, on every column of every Phase 3 table.
- **`precipitation_probability` sharing is wider than Probe A found.** Live at Red Rock, `gfs_seamless` shares the series with HRRR and NBM. Hardcoding the pair from the probe would have mis-attributed GFS.

**Known issues / deferred work:**
- **Nothing has touched Postgres.** `check:weather-runs` is written and unrun; migrations `0007` **and** `0008` are both unapplied, so `weather_runs` does not exist and `/api/cron/collect-runs` 500s today.
- **Neither cron route is registered with cron-job.org**, so nothing collects on a schedule. `prunePanelStates` therefore **stays on `/check-alerts`** rather than moving to `/prune-runs` as Phase 1's block predicted — moving it when the route exists rather than when its registration does would stop it running at all.
- **`storeDeterministicRun` writes no `raw`**, departing from the plan's "raw JSON + parsed rows". Every deterministic variable requested has a column, so the parsed hours are the whole payload, and storing it per model would write one six-model response six times to preserve nothing. The ensemble keeps its raw, where three percentiles genuinely discard 143 members.
- The ensemble `raw` payload is the largest thing this writes — one per location per collection, cleared at 48h. Nobody has measured what that costs in Neon with a real schedule running.
- Nothing reads any of these tables yet. That is Phase 3.
- The independent PR reviewer passed but ran **3 turns** over a ~900-line diff and posted no review. Treat its silence as no evidence at all.

**Blockers for next session:**
- None for writing Phase 3's rendering against the parsed types. But **Phase 3 cannot be verified end to end until the migrations are applied** — there will be no stored runs to render.

**What's next:** Phase 3 — `git checkout -b phase/3-forecast-rain` off `main` — read `.claude/docs/telegram-precision-interface-plan.md` § Phase 3 and § What it looks like, and `.claude/docs/telegram-render.md` §2 before choosing a rendering.

**Gotchas for next session:**
- **`ModelHourly.probability_is_shared` gates the probability column.** A table must not head a probability column with a model name when it is set, and `weather_runs.precip_prob_is_shared` is **null for an ensemble run** — null means the question does not apply, not "no".
- **`unavailable_models` is the coverage signal, and it must be rendered.** Probe B killed `DisabledButton`, so a model that does not reach the point gets a **labelled non-button row**, never silence.
- **A model past its horizon returns nulls, not a shorter array of hours.** Live: HRRR at Red Rock gave 72 hours of which 66 carried temperature. Every `HourlyPoint` field is `number | null` and a formatter must render an em dash.
- **NBM has no pressure at all** — 72 of 72 nulls, live. Pressure tendency cannot come from it.
- **`weather_run_hours.valid_at` is a real UTC instant**, converted through `localTimeToUtc`. The strings Open-Meteo returns are local wall-clock with no zone; do not compare them directly.
- **Hourly percentiles are not daily figures.** `weather_ensemble_hours` carries p10/p50/p90 per hour; `temp_c_max` stays `ensembleMedian` of each member's own daily extreme.
- The always-loaded instruction budget rose to **52,754 chars / ~13,189 est. tokens** with this session's `architecture.md` additions.

**Does the user need to do anything?** **Yes — one command, needing a credential no session has.** From `apps/api`, with `DATABASE_URL` set in the shell: `npm run db:migrate` applies `0007` and `0008` together, then `npm run check:panel-state` and `npm run check:weather-runs` prove both against real Postgres. Registering `/api/cron/collect-runs` and `/api/cron/prune-runs` with cron-job.org is theirs too, but it can wait until Phase 3 gives the data a reader. Unchanged from before: `bot:set-commands` with `TELEGRAM_BOT_TOKEN` set, and `TELEGRAM_WEBHOOK_SECRET` in Vercel plus a matching `setWebhook` re-run.

---

## 2026-09-01 — branch: feat/phase-3-forecast-rain — commit: e1e4067

**Phase completed:** Phase 3 of the Telegram precision interface — `/forecast` and `/rain`

**What was built this session:**
- `lib/telegram/forecastTable.ts` (new, pure) — four column sets, four steps, local-day slicing, unit-aware cells, `dayHasData`, `probabilityNote`.
- `lib/telegram/rainMessage.ts` (new, pure) — member-derived odds, per-step rows, the day total, `formatLastRain`.
- `lib/telegram/sparkline.ts` (new, pure) — the eight-level agreement bar, with a distinct character for "no data".
- `lib/runs/latestRuns.ts` (new) — the read side of `weather_runs`: a stored batch younger than 60 minutes, or fetch-and-write-back.
- `lib/telegram/panels.ts` — `buildForecastPanel`, `buildRainPanel`, `dayLabel`, `formatAge`, `timingLine`, the day/model/step/column/units rows, and a conditions↔forecast↔rain row on all three.
- `lib/telegram/panelViews.ts` — the database half of both views; `panelState.ts` gains the two views and `MAX_DAY_OFFSET`.
- `routes/telegramWebhook.ts` — `/forecast` and `/rain`, and one `set` verb carrying whichever field a button changes.
- `weather/openMeteo.ts` + migration `0009` — `precip_mm_mean` and `members_wet` on the ensemble hour.
- Tests: `forecastTable`, `rainMessage`, `sparkline`, `panelsForecast`, plus four in `openMeteoHourly`. 339 → 438 api tests, 413 → 512 overall.
- `.github/workflows/claude-review.yml` (PR #73, merged first) — the reviewer's allowlist and a failure artifact.

**What the session measured that the plan did not know:**
- **A percentile does not add up, and no amount of care in the renderer fixes that.** A step or day total had to come from a *mean*, so `weather_ensemble_hours` gained `precip_mm_mean`; the member-derived probability needed a wet count, which percentiles cannot yield either. Both nullable, both meaning unknown rather than zero. This is the one place Phase 3 changed the schema.
- **HRRR at Red Rock returns 168 hours of which 66 carry temperature.** Open-Meteo pads every model to the longest horizon in the request, so "the model does not reach this day" is rows whose *values* are all gaps — not absent rows. The first implementation tested for absent rows and would have drawn 24 em dashes under an HRRR header on every day past 54 h. **No test caught it; running the real path did**, which is the whole argument for the verification standard.
- **`precipitation_probability` cannot be the evidence that a model answered.** It runs past the horizon of the model it was requested with, so `dayHasData` excludes it. Live at Red Rock the series is shared by GFS, HRRR *and* NBM — which also means the default model carries the caveat, not an edge case.

**Known issues / deferred work:**
- **Nothing has touched Postgres, and now three migrations are stacked** — `0007`, `0008`, `0009`. Until they are applied every panel command fails in production, including the two built this session.
- `check:weather-runs` covers the new read path (batch selection, the freshness cutoff, nulls surviving, the wet count) and is **unrun**.
- No panel has been driven from a real device.
- The `tot` column shows `t` on a nearly dry day, because an ensemble mean of 0.005 mm is a genuine trace. Accurate, and noisier than it looks on screen; revisit if the user finds it so.
- `/forecast` with no argument opens the picker, which then opens the *conditions* panel — one extra tap to the forecast.
- Neither cron route is registered, so every panel currently pays a live fetch on a cold cache and writes the run back itself.

**Blockers for next session:**
- None for Phase 4. `/insight` needs run-to-run history, which needs the migrations applied *and* `/api/cron/collect-runs` registered — until then there is one run per point and no trend to compute.

**What's next:** Phase 4 — `git checkout -b phase/4-insight-afd` off `main` — read `.claude/docs/telegram-precision-interface-plan.md` § Phase 4 and § Traps 7 and 10 before writing the trend comparator or the AFD splitter.

**Gotchas for next session:**
- **The row owns the step *after* it.** Open-Meteo stamps hourly precipitation at the end of the hour it fell in, so a 12:00 row at a 3 h step sums the hours stamped 13, 14, 15. `buildRows` and `buildRainDay` both do this; a third view that does not would disagree with them about the same shower.
- **A step's p10/p50/p90 are one hour's** — the wettest by mean — and the panel says so. `/insight` must not sum them either.
- **`members_wet` is nullable and null means unknown.** `oddsPct` returns null for it and for a zero member count; 0/0 must never reach the screen as 0%.
- **`renderPanel` now takes `now`.** The two new views need it for the age line and the location's today; it defaults, so existing callers are unchanged.
- **The independent reviewer was broken and is now fixed.** `--allowedTools` was missing `Task`/`TodoWrite`, so the `/code-review` skill could not spawn its verification agents: 28 denials, $1.55, no review, twice (#56, #72). It now completes — 20 turns, 3 denials, and it posted no findings on the Phase 3 diff. A failed run keeps `claude-execution-output.json` as an artifact, so the next failure can be read instead of guessed at.
- The always-loaded instruction budget rose to **~56,500 chars** with this session's five `architecture.md` invariants.

**Does the user need to do anything?** **Yes — the same one command, now covering three migrations.** From `apps/api`, with `DATABASE_URL` set in the shell: `npm run db:migrate` applies `0007`, `0008` and `0009` together, then `npm run check:panel-state` and `npm run check:weather-runs`. Registering `/api/cron/collect-runs` and `/api/cron/prune-runs` with cron-job.org now has a reader and is worth doing. Unchanged: `npm run bot:set-commands` with `TELEGRAM_BOT_TOKEN` set — needed again, because `/forecast` and `/rain` are new entries in the command menu — and `TELEGRAM_WEBHOOK_SECRET` in Vercel plus a matching `setWebhook` re-run.
