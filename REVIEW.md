# Review instructions

**Active only when Code Review is enabled for this repository** (Claude Team/Enterprise,
claude.ai/admin-settings/claude-code). The local `/code-review` command and the
`claude-review.yml` workflow do **not** read this file — they read `CLAUDE.md`. Nothing
here is wasted if Code Review is off; it simply does not run yet.

`@` imports are not expanded in this file, so the rules below are written out in full.

## What Important means here

This is a single-user weather and climbing-conditions app. Nothing here is
life-critical, but wrong numbers on screen are the product failing at its
only job. Reserve 🔴 Important for:

- A value a user reads as a measurement that was never measured. `cToF(null)`
  renders 32°F; `kmhToMph(null)` renders 0 mph. Every weather field is nullable.
- A failure path whose output is indistinguishable from a legitimate empty
  result — a `catch` returning `[]`, a `?? null` the caller cannot tell from
  real data.
- A source, model, or cause named in user-visible text that the response does
  not actually support.
- A value computed once outside a loop but rendered as if it were per-item
  (a `current*` variable inside a per-day `.map()`).
- Secrets or connection strings reachable by a log line. Driver errors here
  carry the database URL; anything not going through `describeError` is
  Important.
- A migration or delete path that leaves a foreign-key violation.

Style, naming, and refactors are 🟡 Nit at most.

## Always check

- **Every test assertion: name the implementation line that would have to change
  for it to fail.** If you cannot, the fixture does not reach the branch and the
  test is worthless. This repo has shipped that exact defect four times, most
  recently a crypto validator with 11 green tests that could not validate a real
  request. Report it as Important.
- A test fixture built by mirroring the implementation proves only that the code
  agrees with itself. Say so when you see it.
- Any per-location or per-item loop making an upstream call uses
  `Promise.allSettled`, not a serial `await`.
- New API routes return `{ data, error, status }` and validate uuid params with
  `isUuid`.
- A new table with a `location_id` or `trip_id` foreign key is added to the
  corresponding cascade-delete list.
- Anything user-visible reading a nullable number goes through a formatter that
  returns an em dash, not an inline expression.

## Do not report

- Anything CI already enforces: TypeScript errors, ESLint, formatting.
- `apps/mobile/**` — archived and out of the build.
- Prose in `.claude/docs/session-archive.md` — it is an append-only record.

## Cap the nits

At most five 🟡 Nits per review; summarise the rest as a count. After the first
review of a PR, post Important findings only.

## Verification bar

A behaviour claim needs a `file:line` citation, not an inference from a name.
This repo's real defects look correct — say what the wrong output actually is,
with the input that produces it.
