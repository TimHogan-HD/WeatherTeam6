# Defect Patterns

**Read this before reviewing a diff.** It is a catalogue of defect *classes* that have
actually shipped in this repo, not a general checklist — `review-checklist.md` is that.
Each entry names what to grep for and what the failure looks like in production.

## Why this file exists

On 2026-08-26 a single session found **ten defects** in code that had already passed
`npm run typecheck`, `npm run lint` and the full test suite. Three of them were live in
production, and one meant the bot's `/start` command had **never once worked** since it
was written. An earlier session found six more the same way, and the session before that
found thirty wrong claims in a spec.

The pattern is consistent enough to plan around: **the defects this project ships are not
type errors.** They are correct-looking code that says a wrong thing. Tools cannot see
them. Reading the diff is the control that works, and it is not optional.

---

## The classes, with real examples

### 1. A missing value rendered as a plausible one

The single most common class here. JavaScript coerces `null` to `0`, so the wrong value
looks like a real reading rather than a gap.

- `cToF(null)` renders **32°F**. `kmhToMph(null)` renders **0 mph**. Both look like
  measurements. Every weather field in `ForecastSnapshot` is nullable.
- `dryingModel` returns a `720`-hour sentinel for *both* a genuine dry month and a
  swallowed rainfall fetch, so "no rain in 720h" asserts a measurement that may never
  have been taken.
- `dataUpdatedAt` is `0` before the first load — a naive subtraction gives
  "Updated 56 years ago".

**How to find it:** for every value rendered, ask what it shows when the input is
`null`, `0`, `undefined`, or absent. If the answer is a number a user could believe,
it is a defect.

**The rule:** formatters take `number | null` and return an em dash. Never format a
nullable value inline.

### 2. A failure state that reads as success

An error path that produces the same output as a legitimate empty result.

- `fetchNwsAlerts` returned `[]` when a 200 response was not a FeatureCollection —
  contradicting its own docstring, where `[]` means "NWS confirms no active alerts".
  The caller acted on it by **deleting every stored alert for the location**, taking
  `notified_at` with it, so the alert re-sent when it reappeared.
- A failed alerts fetch rendered as "no alerts" on the list card.

**How to find it:** for every `catch`, every `?? []`, and every `?? null`, ask whether
the caller can distinguish that value from a real one. If not, it will be acted on as
real.

### 3. Attribution not backed by the data

Naming a source, a model, or a cause that the response does not actually support.

- The sources footer claimed **NWS** whenever the alerts query returned, including an
  empty result — but that data comes from a table populated by a cron **that is still
  unregistered**, so empty can equally mean NWS was never asked.
- Writing "Open-Meteo ensemble" as a constant would be correct only by accident.
- `limitingComponent` skips `null` components on purpose: a component that was never
  measured must not be named as the cause.

**How to find it:** grep for any user-visible string naming an external service. Each
one must be derived from the response, and omitted rather than guessed.

### 4. One value reused across a loop that needs per-item values

- `maxWindKmh24h` was fed `currentWindKmh` — **today's** wind — for every day scored.
  A day-7 score reported a wind rating measured six days earlier, and all seven days
  carried an identical wind component regardless of the forecast.

**How to find it:** in any `.map()` producing per-item output, check that each field
comes from the item, not from a variable computed outside the loop. A value named
`current*` inside a per-day loop is the smell.

### 5. A string literal that needs escaping as much as an interpolated one

- `/start` replied `"Hi! Send /conditions <location name>..."` under
  `parse_mode: 'HTML'`. Telegram rejects `<location name>` as an unsupported start tag
  with a 400, the webhook swallowed the error, and the command **never worked**.

**How to find it:** escaping audits that only look at `${...}` miss this. Check the
literal text too.

### 6. Nested interactive elements

- The list card is a tap target containing a retry button. A `<button>` inside a
  `<button>` is invalid markup browsers reparse, moving the inner control out.
- Fixing the markup was not enough: `keydown` still bubbled from the inner button to the
  card, whose `preventDefault()` then cancelled the inner button's own activation. Enter
  on "retry" opened the location instead.

**How to find it:** any container with `onClick`/`role="button"` — check every
interactive descendant, for click *and* key events separately.

### 7. State read before it settles

- The conditions score rendered before the alerts query resolved, so a location under an
  active Severe+ warning briefly showed an **unsuppressed** score — exactly the state the
  suppression rule exists to prevent.

**How to find it:** when output depends on two async sources, check what renders while
one is still pending. "Briefly wrong" is still wrong when the rule is about safety.

### 8. A permissive type that silently discards data

- `RequestInit['headers']` also accepts a `Headers` instance and an array of pairs.
  Spreading either yields `{}`, which would have dropped the `Authorization` header and
  turned every call into a 401 that looks like an auth bug.

**How to find it:** any `{...a, ...b}` where `b` is a union type. Narrow the parameter so
the wrong shape cannot compile.

### 9. An upstream call that can never succeed

- `fetchNBM` requested `precipitation_p10/p50/p90`. Open-Meteo does not define those as
  daily variables and exposes **no NBM quantiles under any name**. The branch had never
  returned data; it cost a wasted round trip and a `logger.warn` on every request that
  read like an intermittent upstream problem rather than a permanent misconfiguration.

**How to find it:** a fallback that *always* fires is not resilience, it is a dead
branch. When a log line appears on every single request, that is the signal. Probe the
upstream variable by variable rather than assuming the docs.

### 10. A dead field reasoned about as if it were live

- `ScoreInput.currentTempC` is never read by any scorer. **Three separate documents**
  derived scoring behaviour from it, and one produced a suppression carve-out that would
  have hidden a 103 °F heat warning.

**How to find it:** verify the consumer before reasoning from the producer. Grep for
where a field is *read*, not where it is set.

---

## Two process rules that follow from all of this

1. **Review the diff before reporting anything done.** Not the checklist, not the test
   output — the actual diff, read as prose, asking of each hunk what it does when the
   inputs are missing or the network fails.
2. **When a check "passes", ask what it would have caught.** All ten defects above
   passed every automated gate in the repo. Typecheck and lint prove a change compiles.
   They do not prove it is right, and reporting a feature done on their strength alone
   has shipped broken code here repeatedly.
