/**
 * Acceptance check for **the v2 readings on the conditions surfaces** — the
 * Phase 3b half that the test suite cannot reach.
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
 * Three properties in particular are invisible to the suite:
 *
 *  - **The readings survive the gather.** `buildConditionsInput` runs the live
 *    five-component compute, the alerts query and the hourly run concurrently,
 *    and catches the hourly one. A `null` there is indistinguishable in the
 *    output from a model that had nothing to say, so the check asserts a real
 *    reading rather than a well-formed absence.
 *  - **The window's clock is the location's.** `utc_offset_seconds` travels on
 *    the readings; if it were ever borrowed from elsewhere the times would be
 *    correct-looking and wrong, which is issue #33's whole shape.
 *  - **No magnitude leaks.** The 0-1 factors live under
 *    `HourlyConditions.diagnostics` and must not reach a surface. A unit test
 *    asserts that at the type boundary; this asserts it on the **text that
 *    would actually be sent**, which is where a future edit would break it.
 *
 * It runs the **bot's** gather, because that path is `getHourlySeries` +
 * `toConditionsReadings` + `formatConditionsReply` — the same three pieces
 * `GET /conditions/:locationId` composes, with a formatter on the end that can
 * be inspected. The route's own step is a spread onto the response.
 *
 * **Read-only**, other than the write-back `getHourlySeries` already performs
 * when no stored run is fresh. It creates no rows and has nothing to clean up.
 *
 * console rather than the logger is deliberate — this is an operator CLI and
 * its output is the result.
 */

// Runtime imports are deferred into run(): `../db/index.js` throws at import
// time when DATABASE_URL is unset, which would pre-empt the friendly message.

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

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('DATABASE_URL is not set. Set it in your shell, not in a .env file:')
    console.error('  $env:DATABASE_URL = "<Neon pooled connection string>"')
    process.exitCode = 1
    return
  }

  const { db } = await import('../db/index.js')
  const { locations } = await import('../db/schema.js')
  const { eq } = await import('drizzle-orm')
  const { buildConditionsInput, findLocationById } = await import(
    '../lib/telegram/conditionsReply.js'
  )
  const { formatConditionsReply } = await import('../lib/telegram/conditionsMessage.js')
  const { FRICTION_ESTIMATE_NOTE, summarizeReadings } = await import('@weatherteam6/types')

  console.log('\n=== check:conditions — the v2 readings on a real location ===\n')

  const crags = await db
    .select({ id: locations.id, user_id: locations.user_id, name: locations.name })
    .from(locations)
    .where(eq(locations.is_climbing_location, true))
    .limit(1)

  const crag = crags[0]
  if (!crag) {
    console.error('No climbing locations in the database. Run `npm run db:seed` first.')
    process.exitCode = 1
    return
  }

  const location = await findLocationById(crag.user_id, crag.id)
  if (!location) {
    console.error(`Could not read ${crag.name} back by id — that is itself a failure.`)
    process.exitCode = 1
    return
  }

  console.log(`Location: ${location.name} (${location.id})\n`)

  const input = await buildConditionsInput(location)
  const { readings } = input

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

  // A run that does not reach this moment is a real state, and the reply is
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

  // ── The published text, which is what a reader actually gets ──────────────
  const text = formatConditionsReply(input)
  console.log('\n  --- the reply, as it would be sent ---')
  for (const line of text.split('\n')) console.log(`  | ${line}`)
  console.log('')

  const summary = summarizeReadings({
    reading: readings.now,
    window,
    utcOffsetSeconds: readings.utc_offset_seconds,
    severeAlertEvent: null,
    unavailableReason: readings.unavailable_reason,
  })

  check(
    'the reply leads the reading block with words, not a number',
    summary.headline === null || text.includes(summary.headline),
    'the headline the copy model produced is not in the text',
  )
  check(
    'the reply says the friction reading is an estimate',
    readings.now?.friction === undefined ||
      readings.now.friction === null ||
      text.includes(FRICTION_ESTIMATE_NOTE),
    'a friction level is on screen with no caveat beside it',
  )
  // The quarantine, asserted on the bytes rather than on the type. A 0-1 factor
  // reaching a surface would appear here as a decimal on the friction line.
  const frictionLines = text.split('\n').filter((l) => /friction/i.test(l))
  check(
    'no friction magnitude appears anywhere in the reply',
    !frictionLines.some((l) => /\d*\.\d/.test(l)),
    frictionLines.join(' | '),
  )
  check(
    'the reply states no climbing opinion',
    !/go climb|climbable|not recommended|looks great|good to go/i.test(text),
  )
  check(
    'the retired ladder words are gone from the reply',
    !/Dry, settled|Mostly dry|Wet or unsettled|limited by/.test(text),
    'a five-component ladder word reached the text',
  )

  // The window's clock, read back. A surface on the server's clock would print
  // a correct-looking span against the wrong hours — issue #33's exact shape.
  if (window !== null) {
    const localHour = new Date(
      Date.parse(window.from) + readings.utc_offset_seconds * 1000,
    ).getUTCHours()
    info('window starts at, local', `${localHour}:00`)
    check(
      'the window line is written on the location clock',
      text.includes(summary.window ?? ' '),
      `expected ${summary.window ?? '(none)'}`,
    )
  }

  // ── A place saved as a place gets no rock reading at all ──────────────────
  const places = await db
    .select({ id: locations.id, user_id: locations.user_id, name: locations.name })
    .from(locations)
    .where(eq(locations.is_climbing_location, false))
    .limit(1)

  const place = places[0]
  if (place) {
    const placeLocation = await findLocationById(place.user_id, place.id)
    if (placeLocation) {
      console.log(`\nNon-crag: ${placeLocation.name}`)
      const placeText = formatConditionsReply(await buildConditionsInput(placeLocation))
      check(
        'a place saved as a place gets no rock reading (§7 rule 8)',
        !/friction/i.test(placeText) && !/rock/i.test(placeText),
        placeText,
      )
      check(
        'and no rain-since clause either — it has no drying story',
        !placeText.includes('no rain in'),
      )
    }
  } else {
    info('non-crag check', 'skipped — no non-climbing location saved')
  }

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

void run()
