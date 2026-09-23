/**
 * Acceptance check for **the v2 readings on the conditions surfaces** — the
 * half the test suite cannot reach.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:conditions
 *
 * Why a script rather than a test: vitest mocks `fetch` and never opens a
 * connection, so every copy rule below is unit-tested against a hand-built
 * reading. **That proves the formatter agrees with a fixture somebody wrote.**
 * What it cannot prove is that a real location, with a real stored run and a
 * real rock type, produces a reading those rules hold for — and that is the
 * class this repo ships (`defect-patterns.md` §11).
 *
 * ## What it runs, and why that changed
 *
 * It used to run the **bot's** gather — `buildConditionsInput` plus
 * `formatConditionsReply` — because that path had a formatter whose bytes could
 * be inspected. Migration Phase 3 deleted both. It now runs
 * `GET /conditions/:locationId`'s own composition instead: the same location
 * query, `computeLiveForecast` and `getHourlySeries` concurrently, and
 * `toConditionsReadings` over the result. That is one step *closer* to the
 * shipping path, not further from it — the route's remaining step is a spread
 * onto the response.
 *
 * The copy assertions moved with it, from rendered bot text to the fields
 * `summarizeReadings` hands a surface. **That is where they belong**: the Mini
 * App renders those fields directly through `ReadingField`, so a rule asserted
 * here is asserted on what a reader actually sees rather than on one surface's
 * punctuation of it. They are deliberately **not** re-assembled into a text
 * blob and searched — a string built from `fieldLine(summary.x)` and then
 * checked for `fieldLine(summary.x)` proves only that concatenation works
 * (defect class 11).
 *
 * ## Four properties in particular are invisible to the suite
 *
 *  - **The readings survive the gather.** The route runs the live five-component
 *    compute and the hourly run concurrently and catches the hourly one. A
 *    `null` there is indistinguishable in the output from a model that had
 *    nothing to say, so this asserts a real reading rather than a well-formed
 *    absence.
 *  - **The window's clock is the location's.** `utc_offset_seconds` travels on
 *    the readings; if it were ever borrowed from elsewhere the times would be
 *    correct-looking and wrong, which is issue #33's whole shape.
 *  - **No magnitude leaks.** The 0-1 factors live under
 *    `HourlyConditions.diagnostics` and must not reach a surface. A unit test
 *    asserts that at the type boundary; this asserts it on **a real reading
 *    built from a real run**, where a future edit would break it.
 *  - **A Severe+ alert suppresses the number and keeps the words.** Measured
 *    against the location's own live alert rows, not a fabricated one.
 *
 * **Read-only**, other than the write-back `getHourlySeries` already performs
 * when no stored run is fresh. It creates no rows and has nothing to clean up.
 *
 * console rather than the logger is deliberate — this is an operator CLI and
 * its output is the result.
 */

// Runtime imports are deferred into run(): `../db/index.js` throws at import
// time when DATABASE_URL is unset, which would pre-empt the friendly message.

import type { ReadingField, ReadingsSummary } from '@weatherteam6/types'
// Type-only, so it is erased at compile time and does not pull `db` in at
// import time — the reason every other import here is deferred into run().

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function info(label: string, value: string): void {
  console.log(`  ....  ${label}: ${value}`)
}

/**
 * Every string in a summary that a surface may put on screen.
 *
 * Gathered from the summary rather than from one surface's rendering of it, so
 * a new printable field is covered by the quarantine checks the moment it is
 * added — a list of the three fields that exist today would silently stop
 * covering the fourth.
 */
function printableStrings(summary: ReadingsSummary): string[] {
  const fields: (ReadingField | null)[] = [
    ...summary.readings,
    summary.scoreField,
    summary.window,
  ]
  return [
    ...fields.filter((f): f is ReadingField => f !== null).flatMap((f) => [f.label, f.value]),
    ...summary.notes,
    ...(summary.qualifier === null ? [] : [summary.qualifier]),
    ...(summary.unavailableLine === null ? [] : [summary.unavailableLine]),
  ]
}

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('DATABASE_URL is not set. Set it in your shell, not in a .env file:')
    console.error('  $env:DATABASE_URL = "<Neon pooled connection string>"')
    process.exitCode = 1
    return
  }

  const { db } = await import('../db/index.js')
  const { locations, weatherAlerts } = await import('../db/schema.js')
  const { and, eq, gt, isNull, or } = await import('drizzle-orm')
  const {
    NOT_A_CRAG_READINGS,
    READINGS_UNAVAILABLE,
    toConditionsReadings,
  } = await import('../lib/runs/conditionsReadings.js')
  const { getHourlySeries } = await import('../lib/runs/fetchHourlySeries.js')
  const { scoringLocationFor } = await import('../lib/runs/scoringLocation.js')
  const { pointKeyForLocation } = await import('../lib/runs/pointKey.js')
  const { computeLiveForecast } = await import('../lib/scoring/liveForecast.js')
  const {
    FRICTION_ESTIMATE_NOTE,
    DRYNESS_LABEL,
    FRICTION_LABEL,
    SCORE_LABEL,
    isSevereAlert,
    parseNumeric,
    parseNumericRequired,
    formatLocalHour,
    summarizeReadings,
    windowValue,
  } = await import('@weatherteam6/types')

  /** The route's own column list, not a restatement of it. */
  const LOCATION_COLUMNS = {
    id: locations.id,
    name: locations.name,
    lat: locations.lat,
    lon: locations.lon,
    elevation_m: locations.elevation_m,
    rock_type: locations.rock_type,
    cliff_angle: locations.cliff_angle,
    aspect: locations.aspect,
    asos_station: locations.asos_station,
    is_climbing_location: locations.is_climbing_location,
  }

  type Location = Awaited<ReturnType<typeof readLocation>>

  async function readLocation(isCrag: boolean) {
    const rows = await db
      .select(LOCATION_COLUMNS)
      .from(locations)
      .where(eq(locations.is_climbing_location, isCrag))
      .limit(1)
    return rows[0] ?? null
  }

  /** Exactly what `GET /conditions/:locationId` composes, minus the response spread. */
  async function gather(location: NonNullable<Location>) {
    const now = new Date()

    const scoring = scoringLocationFor(location)

    const [live, series, activeAlerts] = await Promise.all([
      computeLiveForecast(location),
      scoring === null
        ? null
        : getHourlySeries(
            {
              id: location.id,
              lat: parseNumericRequired(location.lat),
              lon: parseNumericRequired(location.lon),
              elevation_m: parseNumeric(location.elevation_m),
            },
            pointKeyForLocation(location.id),
            { allModels: false, now, scoring },
          ).catch((err: unknown) => {
            // The route catches here too — a failed hourly run must not cost
            // the reader the weather. The difference is that the route renders
            // the absence and this reports it as a failed check, because a
            // well-formed absence is not what is being measured.
            console.log(`  ....  hourly run threw: ${String(err)}`)
            return null
          }),
      // Not part of the route (the client reads GET /alerts separately), but
      // `summarizeReadings` needs it and a fabricated `null` would compare two
      // different days the moment a real Severe+ warning is live.
      db
        .select({ event: weatherAlerts.event, severity: weatherAlerts.severity })
        .from(weatherAlerts)
        .where(
          and(
            eq(weatherAlerts.location_id, location.id),
            or(isNull(weatherAlerts.expires), gt(weatherAlerts.expires, now)),
          ),
        ),
    ])

    const readings =
      scoring === null
        ? NOT_A_CRAG_READINGS
        : series === null
          ? READINGS_UNAVAILABLE
          : toConditionsReadings(series, live.todayStr, now)

    return { readings, series, activeAlerts }
  }

  console.log('\n=== check:conditions — the v2 readings on a real location ===\n')

  const crag = await readLocation(true)
  if (!crag) {
    console.error('No climbing locations in the database. Run `npm run db:seed` first.')
    process.exitCode = 1
    return
  }

  console.log(`Location: ${crag.name} (${crag.id})\n`)

  const { readings, series, activeAlerts } = await gather(crag)

  info('model', readings.model ?? '(none)')
  info('unavailable_reason', readings.unavailable_reason ?? '(none)')
  info('utc_offset_seconds', String(readings.utc_offset_seconds))

  check(
    'the gather produced readings rather than a named absence',
    readings.unavailable_reason === null,
    readings.unavailable_reason ?? '',
  )
  check(
    'the readings name the model they came from',
    readings.model !== null,
    'a reading with no model cannot be attributed',
  )
  // Not a preference: irradiance is never pooled (#155), and the display model
  // is chosen by coverage, so the two can differ and a surface must not
  // attribute one to the other.
  check(
    'the readings came from the thermal model, not whichever model led the columns',
    readings.model === 'gfs_seamless',
    readings.model ?? '(none)',
  )
  if (series !== null && series.model !== readings.model) {
    info('columns model (differs, and that is allowed)', series.model ?? '(none)')
  }

  // A run that does not reach this moment is a real state, and every surface is
  // built to survive it — but it is not the state this check wants to measure,
  // because it skips the headline entirely.
  check(
    'the run reaches the current hour',
    readings.now !== null,
    'no reading for now — the stored run may be stale',
  )
  check('today has a day entry', readings.today !== null)

  if (readings.now !== null) {
    info('rock', readings.now.rock?.level ?? '(unreadable)')
    info('friction', readings.now.friction?.level ?? '(unreadable)')
    info('score', readings.now.score === null ? '(none)' : String(readings.now.score))
    info(
      't_surface_c',
      readings.now.t_surface_c === null ? '(none)' : readings.now.t_surface_c.toFixed(1),
    )
    // The one input the whole friction reading turns on, and it is a derived
    // measurement rather than a guess about grip — so it is allowed on a screen.
    info(
      'condensation_margin_c',
      readings.now.condensation_margin_c === null
        ? '(none)'
        : readings.now.condensation_margin_c.toFixed(1),
    )

    check(
      'a score of 0 is distinguishable from no score',
      readings.now.score === null || Number.isFinite(readings.now.score),
      'score must be a number or null, never a coerced 0',
    )

    // The quarantine at the object boundary, on a **real** reading rather than
    // a fixture: nothing under `HourlyConditions.diagnostics` may be promoted
    // to the type a surface spreads into a response.
    check(
      'no diagnostics ride along on the published reading',
      !Object.keys(readings.now).includes('diagnostics'),
      Object.keys(readings.now).join(','),
    )
  }

  const window = readings.today?.window ?? null
  info(
    'window',
    window === null ? '(none cleared the minimum)' : `${window.from} → ${window.to} (${window.hours}h)`,
  )
  if (window !== null) {
    check(
      'the window is qualified only if every hour in it is',
      typeof window.qualified === 'boolean',
      'qualified must be a real boolean, not undefined',
    )
    info('window qualified', String(window.qualified))
  }

  // ── The published fields, which are what a reader actually gets ───────────
  const severeEvent = activeAlerts.find((a) => isSevereAlert(a.severity))?.event ?? null
  info('active Severe+ alert', severeEvent ?? '(none)')

  const summary = summarizeReadings({
    reading: readings.now,
    window,
    utcOffsetSeconds: readings.utc_offset_seconds,
    severeAlertEvent: severeEvent,
    unavailableReason: readings.unavailable_reason,
  })

  console.log('\n  --- the fields, as a surface receives them ---')
  for (const f of summary.readings) console.log(`  | ${f.label}: ${f.value}`)
  if (summary.scoreField !== null) console.log(`  | ${summary.scoreField.label}: ${summary.scoreField.value}`)
  if (summary.window !== null) console.log(`  | ${summary.window.label}: ${summary.window.value}`)
  if (summary.qualifier !== null) console.log(`  | (${summary.qualifier})`)
  for (const n of summary.notes) console.log(`  | (${n})`)
  console.log('')

  const printable = printableStrings(summary)

  check(
    'each gauge arrives as its own label and value, never a sentence',
    summary.readings.length > 0 &&
      summary.readings.every((f) => f.label.length > 0 && f.value.split(/\s+/).length === 1),
    summary.readings.map((f) => `${f.label}=${f.value}`).join(' | '),
  )
  check(
    'the two readings are Dryness then Friction, in that order',
    summary.readings.every((f) => f.label === DRYNESS_LABEL || f.label === FRICTION_LABEL) &&
      summary.readings.findIndex((f) => f.label === DRYNESS_LABEL) <=
        summary.readings.findIndex((f) => f.label === FRICTION_LABEL),
    summary.readings.map((f) => f.label).join(' | '),
  )
  // The phase's design, asserted structurally rather than on bytes: the score
  // is not one of the readings, so a surface cannot print it above the words it
  // was derived from without going out of its way.
  check(
    'the score is not in the readings row it is derived from',
    !summary.readings.some((f) => f.label === SCORE_LABEL),
    summary.readings.map((f) => f.label).join(' | '),
  )
  check(
    'the surface is told the friction reading is an estimate',
    readings.now?.friction == null || summary.notes.includes(FRICTION_ESTIMATE_NOTE),
    'a friction level is published with no caveat beside it',
  )
  // The quarantine, on the published strings. A 0-1 factor reaching a surface
  // would appear here as a decimal; so would an unrounded score.
  check(
    'no magnitude appears in any published string',
    !printable.some((s) => /\d*\.\d/.test(s)),
    printable.filter((s) => /\d*\.\d/.test(s)).join(' | '),
  )
  check(
    'no published string states a climbing opinion',
    !printable.some((s) => /go climb|climbable|not recommended|looks great|good to go/i.test(s)),
    printable.join(' | '),
  )
  check(
    'the retired ladder words are gone',
    !printable.some((s) => /Dry, settled|Mostly dry|Wet or unsettled|limited by/.test(s)),
    'a five-component ladder word reached a field',
  )

  // ── The window's clock, read back ─────────────────────────────────────────
  //
  // Two separate facts, and the second is the one that catches #33: the offset
  // has to come from the run that produced the readings, AND it has to be the
  // offset the span is actually rendered against. A surface that read the
  // offset and then formatted on UTC would pass the first alone.
  if (series !== null) {
    check(
      'the readings carry the run\'s own offset, not one borrowed from elsewhere',
      readings.utc_offset_seconds === series.utc_offset_seconds,
      `readings ${String(readings.utc_offset_seconds)} vs run ${String(series.utc_offset_seconds)}`,
    )
  }
  if (window !== null) {
    const localHour = new Date(
      Date.parse(window.from) + readings.utc_offset_seconds * 1000,
    ).getUTCHours()
    info('window starts at, local', `${String(localHour)}:00`)

    check(
      'the window field is rendered against the readings\' own offset',
      summary.window !== null &&
        summary.window.value === windowValue(window, readings.utc_offset_seconds),
      `field "${summary.window?.value ?? '(none)'}" vs offset render "${windowValue(window, readings.utc_offset_seconds)}"`,
    )

    // Asserted on `formatLocalHour` rather than on the window's *value*, and
    // that is the point: a full-day window short-circuits to "All day" before
    // any clock formatting happens, so a value comparison silently stops
    // exercising the clock on exactly the days the window is widest. This runs
    // the same instant through the same formatter the span is built from, so it
    // fails if the offset ever stops being applied.
    if (readings.utc_offset_seconds !== 0) {
      check(
        'an instant on that clock is not the UTC one (#33)',
        formatLocalHour(window.from, readings.utc_offset_seconds) !==
          formatLocalHour(window.from, 0),
        `local ${formatLocalHour(window.from, readings.utc_offset_seconds) ?? '(unparseable)'} vs UTC ${formatLocalHour(window.from, 0) ?? '(unparseable)'}`,
      )
    } else {
      info('clock check', 'skipped — this location really is on UTC')
    }
  }

  // ── Severe+ drops the number and keeps the words ──────────────────────────
  //
  // Run against a synthesised event as well as the live one, because a location
  // with no active warning is the common case and the rule would otherwise go
  // unexercised on most runs. The *inputs* are the real reading either way.
  const suppressed = summarizeReadings({
    reading: readings.now,
    window,
    utcOffsetSeconds: readings.utc_offset_seconds,
    severeAlertEvent: severeEvent ?? 'Extreme Heat Warning',
    unavailableReason: readings.unavailable_reason,
  })
  check(
    'a Severe+ alert drops the number',
    suppressed.score === null && suppressed.scoreField === null,
    `score ${String(suppressed.score)}`,
  )
  check(
    'and keeps the readings — they are the same fact the warning is about',
    suppressed.readings.length === summary.readings.length,
    `${String(suppressed.readings.length)} vs ${String(summary.readings.length)}`,
  )
  check(
    'and names the alert rather than staying silent about why',
    suppressed.qualifier !== null && suppressed.qualifier.includes('Warning'),
    suppressed.qualifier ?? '(none)',
  )

  // ── A place saved as a place gets no rock reading at all ──────────────────
  const place = await readLocation(false)
  if (place) {
    console.log(`\nNon-crag: ${place.name}`)
    const placeGather = await gather(place)
    const placeSummary = summarizeReadings({
      reading: placeGather.readings.now,
      window: placeGather.readings.today?.window ?? null,
      utcOffsetSeconds: placeGather.readings.utc_offset_seconds,
      severeAlertEvent: null,
      unavailableReason: placeGather.readings.unavailable_reason,
    })
    check(
      'a place saved as a place is refused for the reader\'s reason, not a failure',
      placeGather.readings.unavailable_reason === 'not_a_climbing_location',
      placeGather.readings.unavailable_reason ?? '(none)',
    )
    check(
      'and gets no rock or friction reading at all (§7 rule 8)',
      placeSummary.readings.length === 0 && placeSummary.scoreField === null,
      placeSummary.readings.map((f) => f.label).join(' | '),
    )
    check(
      'and its refusal never reads as bad conditions',
      placeSummary.unavailableLine !== null &&
        !/wet|poor|greasy|bad/i.test(placeSummary.unavailableLine),
      placeSummary.unavailableLine ?? '(none)',
    )
  } else {
    info('non-crag check', 'skipped — no non-climbing location saved')
  }

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

void run()
