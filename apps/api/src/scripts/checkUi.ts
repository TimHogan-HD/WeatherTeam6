/// <reference lib="dom" />
// The DOM types are for the callbacks `page.evaluate` runs inside the browser.

/**
 * Drive the web app in a real browser, end to end, against the real database.
 *
 * Usage, from `apps/api` (DATABASE_URL set in the shell, no `.env`):
 *   npm run check:ui                 # screenshots to a temp directory
 *   npm run check:ui -- --out <dir>  # or to a directory you name
 *   npm run check:ui -- --tabs-only  # only the crag screen's six tabs
 *   npm run check:ui -- --list-only  # only the Conditions list
 *   npm run check:ui -- --sweep      # first remove test users earlier runs left behind
 *   npm run check:ui -- --record     # also write every upstream weather call to the tape
 *   npm run check:ui -- --replay     # answer upstream calls from the tape, not the network
 *
 * The tape (`fixtures/check-ui-tape.json.gz`, `upstreamTape.ts`) is what the UI
 * workflow replays on a PR, against a throwaway Postgres (`localPostgres.ts`).
 * When a replayed run reports calls missing from the tape (a change asks
 * upstream something new), delete the tape and push: the workflow records a new
 * one against its empty database. A local recording against Neon would miss the
 * calls that stored runs answer.
 *
 * Why this exists: UI work here was verified by rebuilding the same local
 * harness by hand every session — a throwaway secret, a local API, vite on
 * :5173, a scratch user — through hundreds of one-off browser calls, none of
 * them repeatable. This is that harness, once.
 *
 * What it does: starts `createApp()` on :3096 with throwaway secrets, starts
 * vite on :5173 pointed at it, creates a throwaway user, signs in through the
 * real login screen, adds a known crag through the API, and opens the list,
 * every detail tab, the map and the add screen at the owner's phone viewport
 * (480x1000). Each screen is screenshotted, and fails on an uncaught page
 * error, a console error, an API response >= 400, a horizontal scroll, or an
 * empty panel. Everything it creates is under the `zz-check-ui` prefix and is
 * removed in `finally`; a run stopped before then is cleared by `--sweep`.
 *
 * It reads the screens; it does not judge them. Open the screenshots.
 *
 * `.github/workflows/ui.yml` runs it live every night, and replayed when run by
 * hand (recording when the tape is missing). Not on PRs (owner, 2026-10-26).
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ApiResponse, Location, RainNow } from '@weatherteam6/types'
import type { Page } from 'playwright'
import type { Tape } from './upstreamTape.js'

const API_PORT = 3096
const WEB_PORT = 5173
const API = `http://localhost:${API_PORT}`
const WEB = `http://localhost:${WEB_PORT}`
const VIEWPORT = { width: 480, height: 1000 }
/** A transparent 1×1 PNG, the answer to a radar tile a replayed run cannot fetch. */
const BLANK_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/** `--tabs-only`: sign in, add the crag, screenshot its six tabs, stop — for a screen being rebuilt. */
const TABS_ONLY = process.argv.includes('--tabs-only')

/** `--list-only`: the Conditions list's checks (2a–2d, 4d–5) in a few minutes, for work on the list. */
const LIST_ONLY = process.argv.includes('--list-only')

/** `--sweep`: first remove test users older than `STALE_HOURS`, left by runs stopped before their cleanup. */
const SWEEP = process.argv.includes('--sweep')

const RECORD = process.argv.includes('--record')
const REPLAY = process.argv.includes('--replay')

const PREFIX = 'zz-check-ui'
const STAMP = Date.now()
const USERNAME = `${PREFIX}-${STAMP}`
const PASSPHRASE = `local-ui-check-${STAMP}`
const JOIN_USERNAME = `zz-ui-join-${STAMP}`
/** A test user this old is from a run that stopped before its cleanup. */
const STALE_HOURS = 2

/** Taylors Falls: a known crag (locked rock type) with guidebook coverage, so every tab renders. */
const CRAG = { name: `ZZ UI check — Taylors Falls ${STAMP}`, lat: 45.3955, lon: -92.6616 }

/** Red Wing: a second crag, for a trip with two. */
const SECOND_CRAG = { name: `ZZ UI check — Red Wing ${STAMP}`, lat: 44.5625, lon: -92.5338 }

/** The device's date `n` days on, as the trip screens read "today". */
function isoDayFromNow(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const here = dirname(fileURLToPath(import.meta.url))
const miniappDir = resolve(here, '../../../miniapp')
const viteBin = resolve(here, '../../../../node_modules/vite/bin/vite.js')
const tapePath = resolve(here, 'fixtures/check-ui-tape.json.gz')

let passed = 0
let failed = 0

/**
 * The first upstream URL that answered 429. Once set, the next `check` stops
 * the run: on 2026-10-21 a rate-limited run kept going on retries and
 * backoff for 16 minutes before anyone noticed, and its results meant nothing.
 */
let rateLimitedBy: string | null = null
/** Set in `finally`: the cleanup and the summary still report. Before it, every check throws, so a step's own catch cannot swallow the stop. */
let finishing = false

function check(label: string, ok: boolean, detail = ''): void {
  if (rateLimitedBy !== null && !finishing) {
    throw new Error(`upstream rate limit (429) from ${rateLimitedBy}; this run's results would be noise. Wait for the limit to clear, or run with --replay.`)
  }
  if (ok) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function outDir(): string {
  const i = process.argv.indexOf('--out')
  const dir = i > -1 && process.argv[i + 1] ? resolve(process.argv[i + 1]!) : join(tmpdir(), `wt6-ui-check-${STAMP}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

async function waitForHttp(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return true
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

async function api<T>(method: string, path: string, token: string, body?: unknown): Promise<{ status: number; payload: ApiResponse<T> }> {
  const res = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Session ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = (await res.json().catch(() => ({ data: null, error: 'not JSON', status: res.status }))) as ApiResponse<T>
  return { status: res.status, payload }
}

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error(
      '\nMissing DATABASE_URL — the Neon pooled connection string, set in the shell.' +
        "\nOn this machine: $env:DATABASE_URL = [Environment]::GetEnvironmentVariable('DATABASE_URL','User')\n",
    )
    process.exit(2)
  }

  // Throwaway secrets for this process only; the real ones are never read.
  process.env['API_SHARED_SECRET'] = `local-ui-check-shared-${STAMP}`
  process.env['AUTH_TOKEN_SECRET'] = `local-ui-check-token-${STAMP}`
  process.env['LOG_LEVEL'] ??= 'warn'

  if (RECORD && REPLAY) throw new Error('--record and --replay together would record the tape from itself')
  const { isUpstream, recordingFetch, replayingFetch, requestUrl, tapeDay } = await import('./upstreamTape.js')
  const tape: Tape | null = RECORD
    ? { recordedOn: tapeDay(new Date()), entries: [] }
    : REPLAY
      ? (JSON.parse(gunzipSync(readFileSync(tapePath)).toString('utf8')) as Tape)
      : null
  const tapeMisses = new Set<string>()
  if (tape && RECORD) globalThis.fetch = recordingFetch(globalThis.fetch, tape)
  if (tape && REPLAY) globalThis.fetch = replayingFetch(globalThis.fetch, tape, tapeDay(new Date()), tapeMisses)
  if (REPLAY && tape) console.log(`Replaying ${tape.entries.length} upstream answers recorded ${tape.recordedOn}`)
  const tapedFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const res = await tapedFetch(input, init)
    const url = requestUrl(input)
    if (res.status === 429 && rateLimitedBy === null && isUpstream(url)) {
      rateLimitedBy = new URL(url).host
      console.error(`\n!! ${rateLimitedBy} answered 429: stopping at the next check`)
    }
    return res
  }

  const { useLocalPostgresProxy } = await import('./localPostgres.js')
  if (await useLocalPostgresProxy()) console.log(`Database: local Postgres through ${process.env['CHECK_UI_WS_PROXY']}`)

  const { createApp } = await import('../index.js')
  const { db, pool } = await import('../db/index.js')
  const {
    users,
    userPreferences,
    feedback,
    tripDayOutcomes,
    tripDayRecords,
    tripRainRecords,
    tripLocations,
    trips,
    invites,
    locations,
    walls,
    conditionsReports,
    premiumPulls,
    routeTicks,
    routeTodos,
    areaLocations,
  } = await import('../db/schema.js')
  const { deleteLocationCascade } = await import('../lib/locations/deleteLocation.js')
  const { hashPassword } = await import('../lib/auth/password.js')
  const { and, eq, inArray, like, lt, or } = await import('drizzle-orm')
  const { chromium } = await import('playwright')

  /**
   * A throwaway user and everything that names it. Crags go through
   * `deleteLocationCascade`; trips as `DELETE /trips/:tripId` clears them.
   * True when the user is gone.
   */
  async function removeTestUser(id: string): Promise<boolean> {
    try {
      for (const { id: locId } of await db.select({ id: locations.id }).from(locations).where(eq(locations.user_id, id))) {
        await deleteLocationCascade(locId, id)
      }
      await db.transaction(async (tx) => {
        const owned = (await tx.select({ id: trips.id }).from(trips).where(eq(trips.user_id, id))).map((t) => t.id)
        if (owned.length > 0) {
          await tx.delete(tripLocations).where(inArray(tripLocations.trip_id, owned))
          await tx.delete(tripRainRecords).where(inArray(tripRainRecords.trip_id, owned))
          await tx.delete(trips).where(inArray(trips.id, owned))
        }
        await tx.delete(invites).where(or(eq(invites.created_by, id), eq(invites.used_by, id)))
        for (const table of [feedback, userPreferences, walls, conditionsReports, premiumPulls, routeTicks, routeTodos]) {
          await tx.delete(table).where(eq(table.user_id, id))
        }
        await tx.delete(areaLocations).where(eq(areaLocations.recorded_by, id))
        await tx.delete(users).where(eq(users.id, id))
      })
      return true
    } catch {
      return false
    }
  }

  // Runs stopped before their `finally` leave their users behind. Opt-in,
  // because it deletes rows this run did not create; only older ones go, so a
  // run started alongside this one keeps its account.
  const stale = !SWEEP ? [] : await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        or(like(users.username, `${PREFIX}-%`), like(users.username, 'zz-ui-join-%')),
        lt(users.created_at, new Date(Date.now() - STALE_HOURS * 3_600_000)),
      ),
    )
  let swept = 0
  for (const { id } of stale) if (await removeTestUser(id)) swept++
  if (stale.length > 0) console.log(`Removed ${swept} of ${stale.length} test users left by earlier runs`)

  const dir = outDir()
  const server = createApp().listen(API_PORT)
  await new Promise<void>((r) => server.once('listening', r))

  let vite: ChildProcess | null = null
  let userId: string | null = null
  let joinedUserId: string | null = null
  let locationId: string | null = null
  let gpsLocationId: string | null = null
  let secondLocationId: string | null = null
  const tripIds: string[] = []
  let token: string | null = null
  // The Map tab draws with WebGL, which headless Chromium has only in software.
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })

  try {
    // A server already on :5173 would answer the probe below with its own
    // VITE_API_BASE_URL, and --strictPort makes ours exit silently — the run
    // would then drive the wrong app. Refuse a taken port, and check ours lived.
    if (await waitForHttp(WEB, 1_000)) {
      throw new Error(`something is already serving ${WEB} — stop it and rerun`)
    }
    vite = spawn(process.execPath, [viteBin, '--port', String(WEB_PORT), '--strictPort'], {
      cwd: miniappDir,
      env: { ...process.env, VITE_API_BASE_URL: API },
      stdio: 'ignore',
      windowsHide: true,
    })
    const answered = await waitForHttp(WEB, 60_000)
    check('this run’s vite answers on :5173', answered && vite.exitCode === null, `answered ${answered}, exit ${vite.exitCode}`)
    if (!answered || vite.exitCode !== null) throw new Error('vite did not start — stopping')

    const inserted = await db
      .insert(users)
      .values({ username: USERNAME, password_hash: await hashPassword(PASSPHRASE), name: 'ZZ UI check' })
      .returning({ id: users.id })
    userId = inserted[0]?.id ?? null
    if (userId === null) throw new Error('could not create the throwaway user')

    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 })
    const page = await context.newPage()

    // Collected per screen, then reset.
    let problems: string[] = []
    page.on('pageerror', (err) => problems.push(`page error: ${err.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console error: ${msg.text().slice(0, 200)}`)
    })
    page.on('response', (res) => {
      if (res.url().startsWith(API) && res.status() >= 400) {
        problems.push(`${res.status()} ${res.request().method()} ${res.url().slice(API.length)}`)
      }
    })

    async function screen(name: string, minText = 20): Promise<void> {
      await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {
        problems.push('network did not settle within 60 s')
      })
      await page.waitForTimeout(500)
      const file = join(dir, `${String(passed + failed).padStart(2, '0')}-${name}.png`)
      await page.screenshot({ path: file, fullPage: true })
      const { overflow, text } = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        text: (document.querySelector('main') ?? document.body).innerText.trim().length,
      }))
      if (overflow > 0) problems.push(`scrolls sideways by ${overflow}px`)
      if (text < minText) problems.push(`only ${text} characters of text`)
      check(`${name}  →  ${file}`, problems.length === 0, problems.join('; '))
      problems = []
    }

    // 1. Sign in through the real login screen.
    await page.goto(`${WEB}/login`)
    await screen('login')
    await page.getByLabel('Username').fill(USERNAME)
    await page.getByLabel('Passphrase').fill(PASSPHRASE)
    await page.getByRole('button', { name: /sign in|log in/i }).click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
    token = await page.evaluate(() => {
      for (const store of [localStorage, sessionStorage]) {
        for (let i = 0; i < store.length; i++) {
          const v = store.getItem(store.key(i) ?? '')
          if (v && /^[\w-]+\.[\w-]+$/.test(v)) return v
          try {
            const parsed = JSON.parse(v ?? '') as { token?: unknown }
            if (typeof parsed.token === 'string') return parsed.token
          } catch {
            // not JSON
          }
        }
      }
      return null
    })
    check('the login screen signs in and stores a token', token !== null)
    if (token === null) throw new Error('no token after sign-in — stopping')
    await screen('list-empty', 5)

    // 2. Add a known crag through the API the add flow calls.
    const created = await api<Location>('POST', '/locations', token, { ...CRAG, is_climbing_location: true })
    locationId = created.payload.data?.id ?? null
    check('POST /locations creates the crag', created.status === 201 && locationId !== null, `got ${created.status}`)
    if (locationId === null) throw new Error('no location — stopping')

    await page.goto(`${WEB}/`)
    await screen('list')

    // 2'. Radar rain now (#313), asked live from MRMS in every mode. No recent
    // frame is `data: null`, never an error. When radar has rain at the crag,
    // the card must say so; when it has none, the card must not.
    const rainNow = await api<RainNow | null>('GET', '/rain-now', token)
    const rainHere = rainNow.payload.data?.places.find((p) => p.location_id === locationId)
    check(
      'GET /rain-now answers for every saved place, or null without a recent frame',
      rainNow.status === 200 && (rainNow.payload.data === null || rainHere !== undefined),
      `got ${rainNow.status}, ${JSON.stringify(rainNow.payload.data)?.slice(0, 200)}`,
    )
    if (rainNow.payload.data !== null && rainHere !== undefined) {
      const raining = (rainHere.rate_mm_h ?? 0) > 0
      const pills = await page.locator('[data-rain-now]').count()
      check(
        `the card's rain pill follows radar (${rainHere.rate_mm_h ?? 'no coverage'} mm/hr)`,
        raining ? pills === 1 : pills === 0,
        `${pills} pill(s)`,
      )
    }

    async function everyTab(): Promise<void> {
      await page.goto(`${WEB}/location/${locationId}`)
      await page.getByRole('tab').first().waitFor({ timeout: 60_000 })
      const tabs = await page.getByRole('tab').allInnerTexts()
      check('the detail screen shows the six crag tabs', tabs.length === 6, `got ${tabs.join(', ')}`)
      for (const label of tabs) {
        await page.getByRole('tab', { name: label.trim() }).click()
        await screen(`tab-${label.trim().toLowerCase()}`)
      }
      await guidebookLevels()
    }

    // A wall and a route open inside the Crag tab (hybrid Phase 4a): the dock
    // stays with Crag chosen, and a crumb steps back up one level.
    async function guidebookLevels(): Promise<void> {
      const walls = page.locator('section', { has: page.getByRole('heading', { name: /^Walls?/ }) })
      await walls.getByRole('button').first().click()
      await page.waitForURL(/\/wall\/[^/]+$/, { timeout: 30_000 })
      const cragChosen = async () =>
        (await page.getByRole('tab').count()) === 6 &&
        (await page.getByRole('tab', { name: 'Crag' }).getAttribute('aria-selected')) === 'true'
      check('a wall opens inside the Crag tab, under the dock', await cragChosen())
      await screen('crag-wall')

      const routes = page.locator('section', { has: page.getByRole('heading', { name: /^Routes/ }) })
      await routes.locator('button:not([aria-pressed])').first().click()
      await page.waitForURL(/\/route\/[^/]+$/, { timeout: 30_000 })
      check('a route opens inside the Crag tab, under the dock', await cragChosen())
      await screen('crag-route')

      await page.getByRole('button', { name: /^‹ / }).first().click()
      await page.waitForURL(/\/wall\/[^/]+$/, { timeout: 30_000 })
      await page.getByRole('button', { name: /^‹ .* guidebook$/ }).click()
      await page.waitForURL(/\?tab=crag$/, { timeout: 30_000 })
      check('the crumbs step back up to the wall, then the guidebook', await cragChosen())
    }

    // 1b. What arrives inside a screen (owner, 2026-10-21, the motion mockup),
    // read from the animations the browser actually ran rather than a frame.
    // In contexts of its own, so the crag it opens is not already cached for 2a.
    async function signedIn(options: { reducedMotion?: 'reduce' } = {}) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, ...options })
      const tab = await context.newPage()
      await tab.goto(`${WEB}/login`)
      await tab.getByLabel('Username').fill(USERNAME)
      await tab.getByLabel('Passphrase').fill(PASSPHRASE)
      await tab.getByRole('button', { name: /sign in|log in/i }).click()
      await tab.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
      return { context, tab }
    }
    async function motionChecks(): Promise<void> {
      const { context: moving, tab: page } = await signedIn()
      try {
        await motionSteps(page)
      } finally {
        await moving.close()
      }
    }
    async function motionSteps(page: Page): Promise<void> {
      const watch = () =>
        page.evaluate(() => {
          // No named functions in here: tsx wraps them in a `__name` the page does not have.
          const m = { seen: new Set<string>(), clipMin: 1, bead: false, timer: 0 }
          m.timer = window.setInterval(() => {
            for (const a of document.getAnimations()) {
              const effect = a.effect as KeyframeEffect | null
              if (effect?.pseudoElement) m.seen.add(effect.pseudoElement)
              if (a instanceof CSSAnimation) m.seen.add(a.animationName)
            }
            document.querySelectorAll('[data-stream]').forEach((g) => {
              const svg = g.closest('svg')
              const width = Number(svg?.querySelector('clipPath rect')?.getAttribute('width') ?? '0')
              m.clipMin = Math.min(m.clipMin, width / ((svg?.viewBox.baseVal.width ?? 390) + 800))
              if (g.nextElementSibling?.getAttribute('opacity') === '1') m.bead = true
            })
          }, 16)
          ;(window as unknown as { __motion: typeof m }).__motion = m
        })
      const read = () =>
        page.evaluate(() => {
          const m = (window as unknown as { __motion: { seen: Set<string>; clipMin: number; bead: boolean; timer: number } }).__motion
          window.clearInterval(m.timer)
          return { seen: [...m.seen], clipMin: m.clipMin, bead: m.bead }
        })

      await page.goto(`${WEB}/`)
      await page.locator(`[data-crag-fly="name"][data-crag-fly-id="${locationId}"]`).waitFor({ timeout: 60_000 })
      await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined)
      await watch()
      await page.locator(`[data-crag-fly="name"][data-crag-fly-id="${locationId}"]`).click()
      await page.getByRole('tab').first().waitFor({ timeout: 30_000 })
      await page.waitForTimeout(450)
      await page.screenshot({ path: join(dir, 'motion-stream-mid.png') })
      await page.waitForTimeout(2_600)
      const open = await read()
      check(
        'opening a crag carries its name across from the list row',
        open.seen.some((s) => s.includes('wt6-crag-name')),
        open.seen.filter((s) => s.startsWith('::')).join(', '),
      )
      check(
        'and the Today chart streams in behind a lead bead',
        open.clipMin < 0.6 && open.bead,
        `clip reached ${(open.clipMin * 100).toFixed(0)}% of full, bead ${open.bead ? 'seen' : 'never seen'}`,
      )
      const settled = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-stream]')).map((g) => {
          const rect = g.closest('svg')?.querySelector('clipPath rect')
          return {
            drawn: Number(rect?.getAttribute('width')) >= Number(g.closest('svg')?.viewBox.baseVal.width) + 800,
            beadGone: g.nextElementSibling?.getAttribute('opacity') === '0',
          }
        }),
      )
      check(
        'and every chart ends fully drawn, with no lead bead left behind',
        settled.length > 0 && settled.every((s) => s.drawn && s.beadGone),
        JSON.stringify(settled),
      )
      check('the score flies with the name', open.seen.some((s) => s.includes('wt6-crag-score')), open.seen.filter((s) => s.startsWith('::')).join(', '))

      await watch()
      await page.getByRole('tab', { name: 'Daily' }).click()
      await page.waitForTimeout(1_500)
      const daily = await read()
      for (const name of ['wt6-pour', 'wt6-rise', 'wt6-grow-x']) {
        check(`a tab change plays ${name}`, daily.seen.includes(name), daily.seen.join(', '))
      }

      await watch()
      await page.getByRole('button', { name: 'Back to Conditions' }).click()
      await page.locator(`[data-crag-fly="name"][data-crag-fly-id="${locationId}"]`).waitFor({ timeout: 10_000 })
      await page.waitForTimeout(1_200)
      const back = await read()
      check(
        'going back carries the name into the row, which stays put',
        back.seen.some((s) => s.includes('wt6-crag-name')) && !back.seen.includes('wt6-rise'),
        back.seen.join(', '),
      )
      await page.screenshot({ path: join(dir, 'motion-list-after.png') })

      const { context: still, tab: calm } = await signedIn({ reducedMotion: 'reduce' })
      try {
        await calm.goto(`${WEB}/location/${locationId}`)
        await calm.locator('[data-stream]').first().waitFor({ timeout: 60_000 })
        const drawn = await calm.evaluate(() => {
          const g = document.querySelector('[data-stream]')
          const rect = g?.closest('svg')?.querySelector('clipPath rect')
          return Number(rect?.getAttribute('width')) >= Number(g?.closest('svg')?.viewBox.baseVal.width) + 800
        })
        check('under reduced motion a chart is drawn whole at once', drawn)
      } finally {
        await still.close()
      }
    }
    await motionChecks()

    if (TABS_ONLY) {
      await everyTab()
      return
    }

    const bar = page.getByRole('navigation', { name: 'Main', includeHidden: true })

    // 2a. Opening a crag from its card. Pressing starts the crag screen's
    // fetches before the finger lifts, and the screen draws from the list's
    // copy of the location instead of asking for it again. Read on the recent
    // rain: the card already holds the hourly series for its own line, so a
    // fresh copy of that is rightly not asked for again.
    const requested: string[] = []
    const onRequest = (req: { url(): string }) => {
      if (req.url().startsWith(API)) requested.push(new URL(req.url()).pathname)
    }
    page.on('request', onRequest)
    const cardBox = await page.locator('[role="button"]').first().boundingBox()
    if (cardBox === null) throw new Error('no card on the list — stopping')
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + 20)
    await page.mouse.down()
    await page.waitForTimeout(1_000)
    const heldOnList = new URL(page.url()).pathname === '/'
    const fetchedOnPress = requested.some((p) => p.endsWith(`/recent-precip/${locationId}`))
    check('pressing a card starts the crag screen’s fetches before release', heldOnList && fetchedOnPress, `still on list: ${heldOnList}; requests: ${requested.join(', ')}`)
    await page.mouse.up()
    await page.getByRole('tab').first().waitFor({ timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined)
    page.off('request', onRequest)
    const refetched = requested.filter((p) => p.endsWith(`/locations/${locationId}`))
    check('the crag screen reuses the list’s copy of the location', refetched.length === 0, `fetched ${refetched.length}×`)

    // 2b. A tapped card opens its crag at once, even when the crag screen's
    // own fetches are slow (its recent rain held back 3 s here; the card
    // already holds the hourly series). A brief wait for data was tried and
    // removed: the owner found the tap laggy (2026-10-01). Tapped once the
    // list has its weather: a tap while every card was still fetching
    // measured the list's own load (368–1048 ms under software rendering).
    await page.goto(`${WEB}/`)
    const firstCard = page.locator('[role="button"]').first()
    await firstCard.waitFor({ timeout: 30_000 })
    const splash = page.getByRole('status', { name: 'Loading your crags' })
    await splash.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined)
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined)
    const slowCragFetch = `${API}/api/v1/recent-precip/**`
    await page.route(slowCragFetch, async (route) => {
      await new Promise((r) => setTimeout(r, 3_000))
      await route.continue().catch(() => undefined)
    })
    const tapped = Date.now()
    await firstCard.click()
    await page.waitForURL(/\/location\//, { timeout: 2_500 }).catch(() => undefined)
    const openedAfter = Date.now() - tapped
    check(
      'a tapped card opens its crag at once, without waiting on a slow crag',
      /\/location\//.test(page.url()) && openedAfter < 250,
      `opened after ${openedAfter} ms`,
    )
    await page.unroute(slowCragFetch)

    // 2c. The opening splash: up on a cold load until the cards have their
    // weather, lifted at the cap when they are slow, and never shown on a
    // return to the list. Forecasts are held back 3 s here.
    const slowForecast = `${API}/api/v1/forecast/**`
    await page.route(slowForecast, async (route) => {
      await new Promise((r) => setTimeout(r, 3_000))
      await route.continue().catch(() => undefined)
    })
    // The device remembers an empty list, as if every crag were added
    // elsewhere: the splash must wait for the real list, not lift on this one.
    // The cards' weather from the steps above is forgotten too, or the list
    // draws from it and the splash rightly never rises.
    await page.evaluate(() => {
      localStorage.setItem('wt6.locations', '[]')
      localStorage.removeItem('wt6.cards')
    })
    await page.goto(`${WEB}/`)
    const splashUp = await splash
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    const splashSeen = Date.now()
    const splashShot = join(dir, `${String(passed + failed).padStart(2, '0')}-splash.png`)
    await page.screenshot({ path: splashShot })
    check(`a cold load holds the opening splash while the cards load  →  ${splashShot}`, splashUp)
    await splash.waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined)
    const splashFor = Date.now() - splashSeen
    check(
      'and lifts at the cap when the cards are slow, not when they arrive',
      (await splash.count()) === 0 && splashFor < 1_800,
      `up for ${splashFor} ms`,
    )
    await page.unroute(slowForecast)
    await firstCard.click()
    await page.getByRole('tab').first().waitFor({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Back to Conditions' }).click()
    await firstCard.waitFor({ timeout: 10_000 })
    check('coming back to the list shows no splash', (await splash.count()) === 0)

    // 2d. A reopen draws the cards from what this device remembers — no
    // splash, the age in the header — while every weather call is held back;
    // then the live copies replace them. "Before the API answers" is checked
    // as no held call released yet, not as a time budget: a 1.5 s budget
    // failed on a slow CI runner that was still loading vite's modules
    // (2026-10-26).
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined)
    const rememberedSaved = await page.evaluate(() => localStorage.getItem('wt6.cards') !== null)
    check('the list remembers its cards’ weather on this device', rememberedSaved)
    const slowWeather = /\/api\/v1\/(forecast|conditions|alerts)\//
    let weatherReleased = false
    await page.route(slowWeather, async (route) => {
      await new Promise((r) => setTimeout(r, 8_000))
      weatherReleased = true
      await route.continue().catch(() => undefined)
    })
    const reopened = Date.now()
    await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' })
    const drawn = await firstCard
      .getByText(/^Dryness:/)
      .waitFor({ timeout: 7_000 })
      .then(() => !weatherReleased)
      .catch(() => false)
    const drawnAfter = Date.now() - reopened
    const header = await page.locator('header').innerText()
    const rememberedShot = join(dir, `${String(passed + failed).padStart(2, '0')}-list-remembered.png`)
    await page.screenshot({ path: rememberedShot })
    check(
      `a reopen draws the cards’ weather from memory, before the API answers  →  ${rememberedShot}`,
      drawn && (await splash.count()) === 0,
      `drawn: ${drawn} after ${drawnAfter} ms; splash: ${await splash.count()}`,
    )
    check('and the header says how old it is', /updated .* · refreshing/.test(header), header.replace(/\s+/g, ' '))
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined)
    await page.unroute(slowWeather)
    const refreshedHeader = await page.locator('header').innerText()
    check('then the live copies replace them', !/refreshing/.test(refreshedHeader), refreshedHeader.replace(/\s+/g, ' '))

    // By 4d the full run's list has three rows: this crag, a crag a trip
    // added, and a town found by GPS. The same three, straight through the API.
    if (LIST_ONLY) {
      for (const place of [
        { ...SECOND_CRAG, is_climbing_location: true },
        { name: `ZZ UI check — Edina ${STAMP}`, lat: 44.8897, lon: -93.3499, is_climbing_location: false },
      ]) {
        const made = await api<Location>('POST', '/locations', token, place)
        check(`POST /locations adds ${place.name}`, made.status === 201, `got ${made.status}`)
      }
      await listChecks(token)
      return
    }

    // 3. Every detail tab.
    await everyTab()
    const tabs = await page.getByRole('tab').allInnerTexts()

    // 3b. The Overview says what is lowering a shown score (#218), and explains the score.
    await page.getByRole('tab', { name: tabs[0]!.trim() }).click()
    const hero = await page.locator('[data-hero]').innerText()
    const overviewText = await page.getByRole('tabpanel').innerText()
    // A score under 100 has something lowering it, and the breakdown names it; at 100 there may be none.
    const shownScore = /^\s*(\d+)\s*$/m.exec(hero)?.[1]
    check(
      'the Overview says what is lowering a shown score',
      shownScore === undefined || shownScore === '100' || /Score breakdown/i.test(overviewText),
      hero.replace(/\s+/g, ' ').slice(0, 300),
    )
    await page.getByText('How the score works').click()
    await screen('overview-explainer')

    // One underline slides to the chosen tab and lands under it.
    const underlineUnder = async (label: string) => {
      await page.getByRole('tab', { name: label }).click()
      const moving = await page.getByRole('tablist').evaluate((list) => {
        const mark = list.lastElementChild as HTMLElement
        return getComputedStyle(mark).transitionProperty
      })
      // Waits for it to land rather than a fixed time: a busy CI runner once
      // missed a fixed 400 ms (2026-10-26), with nothing wrong on screen.
      const tablist = await page.getByRole('tablist').elementHandle()
      const landed = await page
        .waitForFunction(([list, name]) => {
          const mark = (list?.lastElementChild as HTMLElement | null)?.getBoundingClientRect()
          const tab = Array.from(list?.querySelectorAll('[role="tab"]') ?? []).find((t) => t.textContent?.trim() === name)
          const box = tab?.getBoundingClientRect()
          return mark !== undefined && box !== undefined && Math.abs(mark.left - box.left) < 1 && Math.abs(mark.width - box.width) < 1
        }, [tablist, label] as const, { timeout: 3_000 })
        .then(() => true)
        .catch(() => false)
      return { moving, landed }
    }
    const toDaily = await underlineUnder('Daily')
    check(
      'the tab underline slides to the chosen tab and lands under it',
      /transform/.test(toDaily.moving) && toDaily.landed,
      `transition ${toDaily.moving}, landed ${toDaily.landed}`,
    )
    const tabTall = await page
      .getByRole('tab', { name: 'Daily' })
      .evaluate((el) => el.getBoundingClientRect().height)
    check('a location tab is at least 40px tall to tap', tabTall >= 40, `${tabTall}px`)
    // The Overview carries the explanation itself; Profile's copy is reached by its anchor.
    await page.goto(`${WEB}/profile#score`)
    const explainer = page.getByRole('heading', { name: 'How the score works' })
    await explainer.waitFor({ timeout: 10_000 }).catch(() => undefined)
    const top = await explainer.evaluate((el) => el.getBoundingClientRect().top).catch(() => null)
    check(
      'How the score works opens Profile at its explanation',
      /\/profile#score$/.test(page.url()) && top !== null && top >= 0 && top < 400,
      `${page.url()} top=${top}`,
    )
    await screen('score-explainer')
    await page.goto(`${WEB}/location/${locationId}`)

    // 3a. A crag is drilled into: the app bar slides away and the crag's dock
    // takes its place, and back brings the bar back. Then every section by
    // tapping the bar.
    await page.getByRole('tab').first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(700)
    const barAway = await bar.evaluate((el) => ({
      hidden: el.getAttribute('aria-hidden') === 'true' && el.hasAttribute('inert'),
      below: el.getBoundingClientRect().top >= window.innerHeight,
    }))
    const dockBox = await page.getByRole('tablist').boundingBox()
    check(
      'a crag sends the app bar below the screen, out of reach',
      barAway.hidden && barAway.below,
      JSON.stringify(barAway),
    )
    check(
      'and its tabs float in a dock at the bottom, clear of the screen edge',
      dockBox !== null && dockBox.y + dockBox.height <= VIEWPORT.height - 8 && dockBox.y > VIEWPORT.height / 2,
      dockBox === null ? 'no dock' : `dock ${dockBox.y}–${dockBox.y + dockBox.height}`,
    )
    await page.getByRole('tab', { name: 'Daily' }).click()
    const slim = page.locator('header').first()
    const slimText = (await slim.innerText()).replace(/\s+/g, ' ')
    await page.mouse.wheel(0, 900)
    await page.waitForTimeout(300)
    const slimTop = await slim.evaluate((el) => el.getBoundingClientRect().top)
    check(
      'off Overview the slim header names the crag and the best day, and stays put as the tab scrolls',
      /best day/.test(slimText) && /ZZ UI check/i.test(slimText) && Math.abs(slimTop) < 1,
      `${slimText.slice(0, 160)} · top ${slimTop}`,
    )
    await screen('tab-daily-scrolled')
    const pill = await page.getByRole('tablist').evaluate((list) => getComputedStyle(list.lastElementChild as HTMLElement).backgroundColor)
    check('the dock’s chosen tab wears the aqua pill', pill === 'rgba(29, 197, 210, 0.2)', pill)
    // Every value `data-page` takes on the way back, as a page transition sets and clears it.
    await page.evaluate(() => {
      const seen: string[] = []
      ;(window as unknown as { pagesSeen: string[] }).pagesSeen = seen
      new MutationObserver(() => {
        const v = document.documentElement.dataset.page
        if (v !== undefined) seen.push(v)
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-page'] })
    })
    await page.getByRole('button', { name: 'Back to Conditions' }).click()
    await page.waitForTimeout(150)
    await screen('page-fade-midway', 5)
    await page.waitForURL((u) => u.pathname === '/', { timeout: 10_000 }).catch(() => undefined)
    await page.waitForTimeout(500)
    const barBack = await bar.evaluate((el) => el.getAttribute('aria-hidden') !== 'true' && el.getBoundingClientRect().top < window.innerHeight)
    check('back returns a crag to the list, and the app bar with it', new URL(page.url()).pathname === '/' && barBack, page.url())
    const pagesSeen = await page.evaluate(() => (window as unknown as { pagesSeen: string[] }).pagesSeen)
    const pageNow = await page.evaluate(() => document.documentElement.dataset.page ?? null)
    check(
      'and the crag fades out to the list in a page transition, cleared once it lands',
      pagesSeen.includes('fade') && pageNow === null,
      `seen ${pagesSeen.join(', ') || 'nothing'}; now ${pageNow}`,
    )
    for (const section of ['Crags', 'Map', 'Trips', 'Profile']) {
      await bar.getByRole('link', { name: section }).click()
      await screen(`section-${section.toLowerCase()}`, 5)
      const lit = await bar.locator('[aria-current="page"]').getAttribute('aria-label')
      check(`the bar lights ${section} on its own screen`, lit === section, `lit: ${lit}`)
    }

    // 3m. The Map tab: the crag as a pin, its contours close up, and a
    // right-click (a long-press on a phone) carried through to /add's save form.
    // It runs on the dev server, so the production CSP is not applied here.
    await page.goto(`${WEB}/map`)
    const pin = page.getByRole('button', { name: new RegExp(`^ZZ UI check — Taylors Falls ${STAMP}`) })
    const pinShown = await pin.waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)
    check('the map draws the saved crag as a pin', pinShown)
    const pinBox = await pin.boundingBox()
    check(
      'its label, score included, fits on screen however long the name',
      pinBox !== null && pinBox.x + pinBox.width <= VIEWPORT.width,
      `ends at ${pinBox ? pinBox.x + pinBox.width : '?'}`,
    )
    await page.locator('.maplibregl-canvas').waitFor({ timeout: 30_000 })
    const attribution = (await page.locator('.maplibregl-ctrl-attrib').innerText().catch(() => '')).replace(/\s+/g, ' ')
    check(
      'with OpenFreeMap, OpenMapTiles, OpenStreetMap and the terrain credited',
      /OpenFreeMap/.test(attribution) && /© OpenMapTiles/.test(attribution) && /© OpenStreetMap contributors/.test(attribution) && /Mapzen \/ AWS Open Data/.test(attribution),
      attribution,
    )
    const attribBox = await page.locator('.maplibregl-ctrl-attrib').boundingBox()
    const barBox = await bar.boundingBox()
    check(
      'and the credit clear of the bottom bar',
      attribBox !== null && barBox !== null && attribBox.y + attribBox.height <= barBox.y,
      `credit ends ${attribBox ? attribBox.y + attribBox.height : '?'}, bar starts ${barBox?.y ?? '?'}`,
    )
    await page.waitForTimeout(3_000)
    await screen('map', 5)

    // Radar: the toggle names the frame's time, and the tiles asked for are that
    // frame's. A replayed run moves the frame's date to today, a frame IEM may not
    // have, so its tiles are answered blank here; a live run fetches them.
    const radarTiles = /mesonet\.agron\.iastate\.edu\/cache\/tile\.py\/1\.0\.0\/ridge::USCOMP-N0Q-(\d{12})\//
    if (REPLAY) {
      await page.route(radarTiles, (route) =>
        route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(BLANK_PNG, 'base64') }),
      )
    }
    const radarStamps = new Set<string>()
    const radarFailures: string[] = []
    const watchRadar = (r: { url(): string; status(): number }) => {
      const stamp = radarTiles.exec(r.url())?.[1]
      if (stamp === undefined) return
      radarStamps.add(stamp)
      if (r.status() >= 400) radarFailures.push(`${r.status()} ${r.url()}`)
    }
    page.on('response', watchRadar)
    const radarLatest = page.waitForResponse((r) => r.url().endsWith('/radar/latest'), { timeout: 30_000 })
    await page.getByRole('button', { name: /^Radar/ }).click()
    const latestBody = (await (await radarLatest).json().catch(() => null)) as { data?: { valid_at?: string } } | null
    const validAt = latestBody?.data?.valid_at ?? ''
    const radarLabel = page.getByRole('button', { name: /^Radar \d{1,2}:\d{2}/ })
    const radarNamed = await radarLabel.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false)
    check('the radar toggle names its frame’s time', radarNamed, validAt)
    await page.waitForTimeout(4_000)
    const expected = validAt.slice(0, 16).replace(/[-T:]/g, '')
    check(
      'and the tiles asked for are that frame’s, every one answered',
      radarStamps.size === 1 && radarStamps.has(expected) && radarFailures.length === 0,
      `stamps ${[...radarStamps].join(',') || 'none'}, expected ${expected}; ${radarFailures[0] ?? 'no failures'}`,
    )
    const radarCredit = (await page.locator('.maplibregl-ctrl-attrib').innerText().catch(() => '')).replace(/\s+/g, ' ')
    check('with the radar credited to IEM', /Radar: Iowa Environmental Mesonet/.test(radarCredit), radarCredit)
    await screen('map-radar', 5)
    await radarLabel.click()
    page.off('response', watchRadar)
    const radarOff = await page
      .getByRole('button', { name: 'Radar', exact: true })
      .waitFor({ timeout: 5_000 })
      .then(() => true)
      .catch(() => false)
    check('and turns off again', radarOff && !(await page.locator('.maplibregl-ctrl-attrib').innerText()).includes('Iowa'))

    await page.locator('.maplibregl-canvas').focus()
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Equal')
      await page.waitForTimeout(700)
    }
    await page.waitForTimeout(6_000)
    await screen('map-crag-z13', 5)

    const mapBox = await page.locator('.maplibregl-canvas').boundingBox()
    if (mapBox === null) throw new Error('no map canvas — stopping')
    await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 4, { button: 'right' })
    const addCard = page.getByRole('region', { name: 'Add this spot' })
    const cardShown = await addCard.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)
    check('a right-click on the map offers to add that spot', cardShown)
    await screen('map-add-card', 5)
    await addCard.getByRole('button', { name: 'Add', exact: true }).click()
    await page.waitForURL((u) => u.pathname === '/add', { timeout: 10_000 }).catch(() => undefined)
    const mapForm = await page
      .getByText(/^Picked on the map/)
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false)
    check('Add opens the save form on the picked point', mapForm && /[?&]lat=-?\d/.test(page.url()), page.url())
    await screen('map-add-form', 5)
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await page.waitForURL((u) => u.pathname === '/map', { timeout: 10_000 }).catch(() => undefined)
    check('back from that form returns to the map', new URL(page.url()).pathname === '/map', page.url())
    await pin.click()
    await page.waitForURL((u) => u.pathname === `/location/${locationId}`, { timeout: 10_000 }).catch(() => undefined)
    check('tapping a pin opens its crag', new URL(page.url()).pathname === `/location/${locationId}`, page.url())

    // The map outlives the tab: back from the crag it opened shows the one already drawn.
    let mapRequests = 0
    const countMapRequests = (r: { url(): string }) => {
      if (/openfreemap\.org|amazonaws\.com/.test(r.url())) mapRequests++
    }
    page.on('request', countMapRequests)
    await page.getByRole('button', { name: 'Back to Map' }).click()
    await page.waitForURL((u) => u.pathname === '/map', { timeout: 10_000 }).catch(() => undefined)
    check('back from a crag a pin opened returns to the map', new URL(page.url()).pathname === '/map', page.url())
    await pin.waitFor({ timeout: 10_000 })
    await page.waitForTimeout(2_000)
    page.off('request', countMapRequests)
    check('coming back to the map fetches nothing again', mapRequests === 0, `${mapRequests} map requests`)
    await screen('map-return', 5)

    // 3c. Settings on Profile (scoring Phase 5): a warmer high end and an
    // opening tab, saved, then a crag opening on that tab.
    await page.goto(`${WEB}/profile`)
    await page.getByRole('button', { name: /High 5° warmer/ }).waitFor({ timeout: 30_000 })
    await screen('profile')
    await page.getByRole('button', { name: /High 5° warmer/ }).click()
    await page.getByRole('group', { name: 'Open a crag on' }).getByRole('button', { name: 'Hourly' }).click()
    const prefsPut = page.waitForRequest((r) => r.method() === 'PUT' && r.url().endsWith('/preferences'))
    await page.getByRole('button', { name: 'Save' }).click()
    const prefsSent = (await prefsPut).postDataJSON() as Record<string, unknown>
    check(
      'Save sends the moved end in °C and the tab, nothing else',
      Object.keys(prefsSent).sort().join(',') === 'default_tab,temp_high_c' &&
        prefsSent['default_tab'] === 'hourly' &&
        Math.abs(Number(prefsSent['temp_high_c']) - ((65 - 32) * 5) / 9) < 1e-6,
      JSON.stringify(prefsSent),
    )
    await page.getByRole('status').filter({ hasText: 'Saved.' }).waitFor({ timeout: 15_000 })
    await screen('profile-saved')

    // 3c'. Invites: the throwaway user is this process's owner, mints a link on
    // Profile, and a signed-out browser redeems it into a new account.
    process.env['DEFAULT_USER_ID'] = userId
    await page.goto(`${WEB}/profile`)
    await page.getByRole('button', { name: 'Create invite link' }).click()
    const linkBox = page.getByText(/\/join#/)
    await linkBox.waitFor({ timeout: 15_000 })
    await screen('profile-invite')
    const link = (await linkBox.innerText()).trim()
    check('the invite link points at this app’s /join', link.startsWith(`${WEB}/join#`), link)

    const joinContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 })
    const joinPage = await joinContext.newPage()
    const joinProblems: string[] = []
    joinPage.on('pageerror', (err) => joinProblems.push(`page error: ${err.message}`))
    await joinPage.goto(link)
    await joinPage.getByLabel('Username').fill(JOIN_USERNAME)
    await joinPage.getByLabel('Passphrase', { exact: true }).fill(PASSPHRASE)
    await joinPage.getByLabel('Repeat passphrase').fill(PASSPHRASE)
    const joinShot = join(dir, `${String(passed + failed).padStart(2, '0')}-join.png`)
    await joinPage.screenshot({ path: joinShot, fullPage: true })
    await joinPage.getByRole('button', { name: 'Create account' }).click()
    const landed = await joinPage
      .waitForURL(`${WEB}/`, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    check(`join creates the account and opens the list  →  ${joinShot}`, landed && joinProblems.length === 0, `${joinPage.url()} ${joinProblems.join('; ')}`)
    const joinedRow = await db.select({ id: users.id }).from(users).where(eq(users.username, JOIN_USERNAME))
    joinedUserId = joinedRow[0]?.id ?? null
    check('the joined account exists', joinedUserId !== null)
    await joinContext.close()
    await page.reload()
    const joinedRowShown = await page
      .getByText(`Joined as ${JOIN_USERNAME}`)
      .waitFor({ timeout: 15_000 })
      .then(() => true, () => false)
    check('Profile lists who joined through the link', joinedRowShown)
    await page.getByRole('button', { name: 'Create invite link' }).click()
    const cancelButton = page.getByRole('button', { name: /^Cancel the link/ })
    await cancelButton.waitFor({ timeout: 15_000 })
    await screen('profile-invites')
    await cancelButton.click()
    const cancelGone = await cancelButton
      .waitFor({ state: 'detached', timeout: 15_000 })
      .then(() => true, () => false)
    const shownLinkGone = (await page.getByText(/\/join#/).count()) === 0
    check('Cancel removes the open link, and the card stops showing it', cancelGone && shownLinkGone)

    // 3d. Feedback: an open item shows with Done, and Done clears it.
    const note = `${PREFIX} feedback note`
    const noteSent = await api<null>('POST', '/feedback', token, { kind: 'app', message: note })
    check('POST /feedback saves an app note', noteSent.status === 201, `got ${noteSent.status}`)
    await page.goto(`${WEB}/feedback`)
    const item = page.locator('article').filter({ hasText: note })
    await item.waitFor({ timeout: 30_000 })
    await screen('feedback')
    await item.getByRole('button', { name: 'Done' }).click()
    const cleared = await item.waitFor({ state: 'detached', timeout: 15_000 }).then(() => true, () => false)
    check('Done clears the item from Open feedback', cleared)

    // The owner (still this throwaway user, from 3c') reads everyone's open
    // feedback on Profile, under each sender's name, and clears it there.
    const ownerNote = `${PREFIX} feedback for the owner's card`
    const ownerNoteSent = await api<null>('POST', '/feedback', token, { kind: 'app', message: ownerNote })
    check('POST /feedback saves a second note', ownerNoteSent.status === 201, `got ${ownerNoteSent.status}`)
    await page.goto(`${WEB}/profile`)
    const everyone = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Everyone’s feedback' }) })
    const ownerItem = everyone.locator('li').filter({ hasText: ownerNote })
    const ownerItemShown = await ownerItem.waitFor({ timeout: 30_000 }).then(() => true, () => false)
    const ownerItemText = ownerItemShown ? await ownerItem.innerText() : ''
    check("Profile lists everyone's feedback, named by sender", ownerItemShown && ownerItemText.includes(USERNAME), ownerItemText)
    await everyone.scrollIntoViewIfNeeded()
    await screen('profile-everyones-feedback')
    await ownerItem.getByRole('button', { name: 'Done' }).click()
    const ownerCleared = await ownerItem.waitFor({ state: 'detached', timeout: 15_000 }).then(() => true, () => false)
    check("Done clears it from everyone's feedback", ownerCleared)
    await page.goto(`${WEB}/`)
    await page.locator('[role="button"]').first().click()
    // Waited for, as the cold load below is: the tabs can draw before the
    // preferences answer, and reading the selection then raced them (#403).
    const warmHourly = await page
      .getByRole('tab', { name: 'Hourly', selected: true })
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false)
    const opened = await page.getByRole('tab', { selected: true }).innerText().catch(() => 'nothing')
    check('a crag now opens on the saved tab', warmHourly, `opened on ${opened}`)
    // A cold load of the crag's own URL: the preferences are still in flight
    // when the screen mounts, and the saved tab must win once they arrive.
    await page.goto(`${WEB}/location/${locationId}`)
    const coldHourly = await page
      .getByRole('tab', { name: 'Hourly', selected: true })
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false)
    const coldOpened = await page.getByRole('tab', { selected: true }).innerText().catch(() => 'nothing')
    check('a reload of a crag opens on the saved tab too', coldHourly, `opened on ${coldOpened}`)

    // 3e. Trips: the list, the new-trip form, a one-crag trip made through it,
    // a two-crag trip's grid and one crag of it, then a delete confirmed in-page.
    const second = await api<Location>('POST', '/locations', token, { ...SECOND_CRAG, is_climbing_location: true })
    secondLocationId = second.payload.data?.id ?? null
    check('POST /locations creates a second crag', second.status === 201 && secondLocationId !== null, `got ${second.status}`)

    // 3d′. The switcher across a crag's top: both places listed, the chosen one
    // underlined in aqua; a switch keeps the tab, swipes the content in, and
    // replaces the crag, so back still leaves for the list.
    await page.goto(`${WEB}/`)
    await page.locator('[role="button"]').first().waitFor({ timeout: 30_000 })
    await page.goto(`${WEB}/location/${locationId}?tab=daily`)
    const switcher = page.getByRole('group', { name: 'Saved places' })
    await switcher.getByRole('button', { name: SECOND_CRAG.name }).waitFor({ timeout: 30_000 })
    const placesListed = await switcher.getByRole('button').allInnerTexts()
    check(
      'a crag’s switcher lists every saved place, the open one chosen',
      placesListed.length === 2 && (await switcher.getByRole('button', { name: CRAG.name }).getAttribute('aria-pressed')) === 'true',
      placesListed.join(', '),
    )
    check('the open place leads the switcher', placesListed[0] === CRAG.name, placesListed.join(', '))
    await switcher.getByRole('button', { name: SECOND_CRAG.name }).click()
    await page.waitForURL((u) => u.pathname === `/location/${secondLocationId}`, { timeout: 10_000 }).catch(() => undefined)
    const swiped = await page.locator('.wt6-swipe').waitFor({ timeout: 5_000 }).then(() => 1, () => 0)
    // Waited for, not counted: the new crag's tabs render after the swipe starts,
    // and an instant count read 0 on a fast CI run (2026-10-21).
    const stillDaily = await page
      .getByRole('tab', { name: 'Daily', selected: true })
      .waitFor({ timeout: 10_000 })
      .then(() => 1, () => 0)
    await screen('crag-switched', 5)
    check(
      'switching crags keeps the tab and swipes the new one in',
      new URL(page.url()).pathname === `/location/${secondLocationId}` && stillDaily === 1 && swiped === 1,
      `${page.url()}; Daily selected ${stillDaily}; swipe ${swiped}`,
    )
    const placesAfter = await switcher.getByRole('button').allInnerTexts()
    check('and the switched-to place now leads the switcher', placesAfter[0] === SECOND_CRAG.name, placesAfter.join(', '))
    check('with the place just left second, one tap back', placesAfter[1] === CRAG.name, placesAfter.join(', '))
    await page.getByRole('button', { name: 'Back to Conditions' }).click()
    await page.waitForURL((u) => u.pathname === '/', { timeout: 10_000 }).catch(() => undefined)
    check('and back from the switched crag returns to the list, not the first crag', new URL(page.url()).pathname === '/', page.url())

    await page.goto(`${WEB}/trips`)
    await page.getByRole('button', { name: 'New trip' }).waitFor({ timeout: 30_000 })
    await screen('trips-empty', 5)
    await page.getByRole('button', { name: 'New trip' }).click()
    await page.getByRole('heading', { name: 'New trip' }).waitFor({ timeout: 10_000 })
    check('the new-trip form shows no bottom bar', (await bar.count()) === 0)
    await page.getByLabel('Name').fill(`${PREFIX} one crag`)
    await page.getByLabel('First day').fill(isoDayFromNow(2))
    await page.getByLabel('Last day').fill(isoDayFromNow(4))
    await page.getByLabel(CRAG.name).check()

    // "Add a crag" leaves the form for /add and comes home with the draft: back
    // from the search keeps it as it was, Save adds the new crag ticked.
    const draftKept = async (): Promise<boolean> =>
      (await page.getByLabel('Name').inputValue()) === `${PREFIX} one crag` &&
      (await page.getByLabel('Last day').inputValue()) === isoDayFromNow(4) &&
      (await page.getByLabel(CRAG.name).isChecked())
    await page.getByRole('button', { name: 'Add a crag' }).click()
    await page.getByRole('heading', { name: 'Add a location' }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await page.getByRole('heading', { name: 'New trip' }).waitFor({ timeout: 10_000 })
    check('back from a trip’s Add a crag returns to the form as it was', await draftKept())
    await page.getByRole('button', { name: 'Add a crag' }).click()
    await page.getByRole('heading', { name: 'Add a location' }).waitFor({ timeout: 10_000 })
    await page.goBack()
    await page.getByRole('heading', { name: 'New trip' }).waitFor({ timeout: 10_000 }).catch(() => undefined)
    check('the phone’s back from Add a crag keeps the draft too', await draftKept().catch(() => false))
    const tripAddedName = `${PREFIX} trip-added ${STAMP}`
    await page.getByRole('button', { name: 'Add a crag' }).click()
    await page.getByRole('button', { name: 'Enter coordinates instead' }).click()
    await page.getByLabel('Name', { exact: true }).fill(tripAddedName)
    await page.getByLabel('Latitude').fill('38.07')
    await page.getByLabel('Longitude').fill('-109.57')
    await page.getByRole('button', { name: 'Next' }).click()
    check(
      'a crag added from a trip starts as a climbing area',
      (await page.getByRole('button', { name: '✓ Climbing area' }).getAttribute('aria-pressed')) === 'true',
    )
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('heading', { name: 'New trip' }).waitFor({ timeout: 30_000 }).catch(() => undefined)
    const addedBox = page.getByLabel(tripAddedName)
    const addedTicked = await addedBox.isChecked().catch(() => false)
    check('Save returns to the trip with the draft kept and the new crag ticked', (await draftKept()) && addedTicked)
    await screen('trip-new-added-crag', 5)
    // This trip is the one-crag trip below.
    if (addedTicked) await addedBox.uncheck()
    await screen('trip-new', 5)
    await page.getByRole('button', { name: 'Create trip' }).click()
    await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/, { timeout: 30_000 }).catch(() => undefined)
    const oneCragTripId = /\/trips\/([0-9a-f-]{36})$/.exec(page.url())?.[1] ?? null
    check('Create trip opens the new trip', oneCragTripId !== null, `at ${page.url()}`)
    if (oneCragTripId !== null) tripIds.push(oneCragTripId)
    await page.getByRole('region', { name: 'Rain over the trip' }).waitFor({ timeout: 60_000 }).catch(() => undefined)
    await page.getByRole('region', { name: 'Forecast trend' }).getByText(/Trend starts|update/).waitFor({ timeout: 30_000 }).catch(() => undefined)
    check('a one-crag trip draws its days, its rain and its trend', (await page.getByRole('group', { name: 'Trip days' }).getByRole('button').count()) === 3)
    await screen('trip-one-crag')

    // The trend card with something recorded: each trip day at two firings
    // (five days ago and an hour ago) and a whole-trip point at each, seeded the
    // way the recorder writes them. They go with the location's cascade.
    if (oneCragTripId !== null) {
      const hourAgo = (h: number) => new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 - h * 3_600_000)
      const crag = locationId
      const firstAt = hourAgo(120)
      const lastAt = hourAgo(1)
      const seeded = [
        { lead: 2, first: { rain: 2.0, high: 11.7 }, last: { rain: 0.5, high: 10 } },
        { lead: 3, first: { rain: 2.6, high: 12.2 }, last: { rain: 0, high: 13.9 } },
        { lead: 4, first: { rain: 1.5, high: 12.8 }, last: { rain: 0.1, high: 16.1 } },
      ]
      await db.insert(tripDayRecords).values(
        seeded.flatMap((d) => [
          { location_id: crag, local_date: isoDayFromNow(d.lead), recorded_at: firstAt, lead_days: d.lead + 5, member_count: 143, members_wet: 60, precip_mm_mean: d.first.rain, temp_c_max: d.first.high },
          { location_id: crag, local_date: isoDayFromNow(d.lead), recorded_at: lastAt, lead_days: d.lead, member_count: 143, members_wet: 10, precip_mm_mean: d.last.rain, temp_c_max: d.last.high },
        ]),
      )
      await db.insert(tripRainRecords).values([
        { trip_id: oneCragTripId, location_id: locationId, recorded_at: firstAt, mean_mm: 6.1, p10_mm: 0.5, p90_mm: 18, member_count: 143, days_covered: 3, trip_days: 3, high_c_max: 12.8 },
        { trip_id: oneCragTripId, location_id: locationId, recorded_at: lastAt, mean_mm: 0.6, p10_mm: 0, p90_mm: 1.3, member_count: 143, days_covered: 3, trip_days: 3, high_c_max: 16.1 },
      ])
      await page.reload()
      const trendCard = page.getByRole('region', { name: 'Forecast trend' })
      const byDayOpen = await trendCard
        .getByRole('button', { name: 'By day', pressed: true })
        .waitFor({ timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
      check('the trend card opens on each trip day, first forecast against the latest', byDayOpen)
      check('it names the two forecasts it compares', (await trendCard.getByText(/^Each trip day: the first forecast \(/).count()) === 1)
      check('and draws both for every day', (await trendCard.locator('[data-mark="first-rain"]').count()) === 3 && (await trendCard.locator('[data-mark="last-rain"]').count()) === 3)
      await trendCard.scrollIntoViewIfNeeded()
      await screen('trip-trend-by-day')
      await trendCard.getByRole('button', { name: 'Whole trip' }).click()
      check('Whole trip shows the totals, with what its dates mean', (await trendCard.getByText('Forecast made on →').count()) === 1)
      await screen('trip-trend-whole')
    }

    if (secondLocationId !== null) {
      const multi = await api<{ id: string }>('POST', '/trips', token, {
        name: `${PREFIX} two crags`,
        startDate: isoDayFromNow(1),
        endDate: isoDayFromNow(3),
        cragIds: [locationId, secondLocationId],
      })
      const multiId = multi.payload.data?.id ?? null
      check('POST /trips creates a two-crag trip', multi.status === 201 && multiId !== null, `got ${multi.status}`)
      if (multiId !== null) {
        tripIds.push(multiId)
        await page.goto(`${WEB}/trips/${multiId}`)
        await page.getByRole('region', { name: 'By day' }).waitFor({ timeout: 60_000 })
        await screen('trip-multi')
        await page.getByRole('button', { name: `${SECOND_CRAG.name} ›` }).click()
        await page.waitForURL((u) => u.pathname === `/trips/${multiId}/crag/${secondLocationId}`, { timeout: 10_000 }).catch(() => undefined)
        check('a crag in the grid opens its own view', new URL(page.url()).pathname.endsWith(`/crag/${secondLocationId}`), page.url())
        await screen('trip-multi-crag')
        await page.getByRole('button', { name: `${PREFIX} two crags` }).click()
        await page.waitForURL((u) => u.pathname === `/trips/${multiId}`, { timeout: 10_000 }).catch(() => undefined)
        check('back from one crag returns to the trip', new URL(page.url()).pathname === `/trips/${multiId}`, page.url())
      }
    }

    // An ended trip: what was stored, seeded the way the recorder writes it, and
    // nothing forecast for it. The rows go with the location's cascade.
    const pastDays = [isoDayFromNow(-2), isoDayFromNow(-1)]
    const past = await api<{ id: string }>('POST', '/trips', token, {
      name: `${PREFIX} past`,
      startDate: pastDays[0],
      endDate: pastDays[1],
      cragIds: secondLocationId === null ? [locationId] : [locationId, secondLocationId],
    })
    const pastId = past.payload.data?.id ?? null
    check('POST /trips creates an ended trip', past.status === 201 && pastId !== null, `got ${past.status}`)
    if (pastId !== null) {
      tripIds.push(pastId)
      const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000)
      await db.insert(tripDayRecords).values([
        { location_id: locationId, local_date: pastDays[0]!, recorded_at: at(4), lead_days: 2, score: 100, dryness: 'dry', members_wet: 20, member_count: 143, precip_mm_mean: 0.3 },
        { location_id: locationId, local_date: pastDays[0]!, recorded_at: at(2), lead_days: 0, score: 41, dryness: 'wet', members_wet: 70, member_count: 143, precip_mm_mean: 1.2 },
        { location_id: locationId, local_date: pastDays[1]!, recorded_at: at(3), lead_days: 2, score: 88, dryness: 'drying', members_wet: 30, member_count: 143, precip_mm_mean: 0.2 },
      ])
      await db.insert(tripDayOutcomes).values([
        { location_id: locationId, local_date: pastDays[0]!, recorded_at: at(1), score: 43, dryness: 'wet', rain_mm: 0, temp_c_max: 17.8, temp_c_min: 6.4 },
        { location_id: locationId, local_date: pastDays[1]!, recorded_at: at(0), score: 96, dryness: 'dry', rain_mm: 0, temp_c_max: 19.1, temp_c_min: 7.2 },
      ])
      const forecastCalls: string[] = []
      const onForecastRequest = (req: { url: () => string }): void => {
        if (/\/api\/v1\/(hourly|alerts|trips\/[0-9a-f-]+\/forecast)/.test(req.url())) forecastCalls.push(req.url())
      }
      page.on('request', onForecastRequest)
      await page.goto(`${WEB}/trips/${pastId}`)
      if (secondLocationId !== null) {
        await page.getByRole('region', { name: 'How it turned out' }).waitFor({ timeout: 30_000 }).catch(() => undefined)
        await screen('trip-past-multi')
        await page.getByRole('button', { name: new RegExp(`^${CRAG.name}`) }).click()
        await page.waitForURL((u) => u.pathname === `/trips/${pastId}/crag/${locationId}`, { timeout: 10_000 }).catch(() => undefined)
        check('a crag of an ended trip opens its own days', new URL(page.url()).pathname.endsWith(`/crag/${locationId}`), page.url())
      }
      await page.getByRole('heading', { name: 'Forecast said' }).first().waitFor({ timeout: 30_000 }).catch(() => undefined)
      await screen('trip-past')
      page.off('request', onForecastRequest)
      check('an ended trip asks for no forecast, hourly or alerts', forecastCalls.length === 0, forecastCalls.join(', '))
      check('it shows each day as it turned out', (await page.getByText('Turned out', { exact: true }).count()) === 2)
      check(
        'and what the forecast said first and last',
        (await page.getByText('2 days out').count()) === 2 && (await page.getByText('On the day').count()) === 1,
      )
    }

    await page.goto(`${WEB}/trips`)
    await page.getByRole('button', { name: new RegExp(`${PREFIX} one crag`) }).waitFor({ timeout: 30_000 })
    await screen('trips')
    if (oneCragTripId !== null) {
      await page.goto(`${WEB}/trips/${oneCragTripId}`)
      await page.getByRole('button', { name: 'Edit trip' }).click()
      await page.getByRole('heading', { name: 'Edit trip' }).waitFor({ timeout: 10_000 })
      check('the trip editor shows no bottom bar', (await bar.count()) === 0)
      check('the editor opens filled in', (await page.getByLabel('Name').inputValue()) === `${PREFIX} one crag`)
      await page.getByLabel('Name').fill(`${PREFIX} edited`)
      await page.getByLabel('Last day').fill(isoDayFromNow(5))
      check(
        'moving a date says the trend restarts, before saving',
        await page.getByText('Changing the dates restarts the whole-trip trend.').isVisible(),
      )
      await screen('trip-edit', 5)
      await page.getByRole('button', { name: 'Save' }).click()
      await page.waitForURL((u) => u.pathname === `/trips/${oneCragTripId}`, { timeout: 15_000 }).catch(() => undefined)
      const edited = await api<{ name: string; endDate: string }>('GET', `/trips/${oneCragTripId}`, token)
      // Waited for, not read once: the URL changes before the trip screen paints.
      const renamed = await page
        .getByRole('heading', { name: `${PREFIX} edited` })
        .waitFor({ timeout: 10_000 })
        .then(() => true)
        .catch(() => false)
      check(
        'Save returns to the trip with the new name and dates',
        new URL(page.url()).pathname === `/trips/${oneCragTripId}` &&
          edited.payload.data?.name === `${PREFIX} edited` &&
          edited.payload.data.endDate === isoDayFromNow(5) &&
          renamed,
        `at ${page.url()} with ${JSON.stringify(edited.payload.data)}`,
      )
      await page.getByRole('button', { name: 'Delete trip' }).click()
      await page.getByRole('button', { name: 'Tap again to delete' }).click()
      await page.waitForURL((u) => u.pathname === '/trips', { timeout: 15_000 }).catch(() => undefined)
      const gone = await api<null>('GET', `/trips/${oneCragTripId}`, token)
      check('Delete trip, tapped twice, deletes it and returns to the list', gone.status === 404 && new URL(page.url()).pathname === '/trips', `got ${gone.status} at ${page.url()}`)
      if (gone.status === 404) tripIds.splice(tripIds.indexOf(oneCragTripId), 1)
    }
    // The steps below count the list's cards: the two-crag trip and its second crag go now.
    // Off the trips screen first: its background refetch of a trip deleted under
    // it 404'd, and the next screen took the blame (nightly, 2026-10-22).
    await page.goto('about:blank')
    for (const id of [...tripIds]) {
      const del = await api<null>('DELETE', `/trips/${id}`, token)
      if (del.status === 200) tripIds.splice(tripIds.indexOf(id), 1)
    }
    if (secondLocationId !== null) {
      const del = await api<null>('DELETE', `/locations/${secondLocationId}`, token)
      check('the second crag, with its trip records, deletes cleanly', del.status === 200, `got ${del.status}`)
      if (del.status === 200) secondLocationId = null
    }

    // 3b. The location editor (scoring Phase 4b). The crag is a known crag, so
    // its rock type is locked and there is nothing to edit: no "Edit crag".
    // A crag-wide aspect and angle are not offered — they wait for the
    // guidebook's walls (`editLocation.ts`).
    await page.goto(`${WEB}/location/${locationId}`)
    await page.getByRole('tab').first().waitFor({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Remove location' }).waitFor({ timeout: 30_000 })
    check('a known crag offers no "Edit crag"', (await page.getByRole('button', { name: 'Edit crag' }).count()) === 0)
    await page.goto(`${WEB}/location/${locationId}/edit`)
    await page.getByText(/Can’t be changed/).waitFor({ timeout: 30_000 })
    check('the editor shows no bottom bar', (await bar.count()) === 0)
    await screen('edit')
    check(
      'the editor offers no wall direction, angle or Save',
      (await page.getByRole('button', { name: /^Faces |^Overhang$|^Save$/ }).count()) === 0,
    )

    // 4. The add screen.
    await page.goto(`${WEB}/add`)
    await screen('add', 5)
    check('the add flow shows no bottom bar', (await bar.count()) === 0)

    // 4-browse. Down a state's tree to a crag, pick it, and back out level by
    // level: back closes the save form onto the level it came from, then steps up.
    const shown = (name: string | RegExp) =>
      page.getByRole('button', { name }).first().waitFor({ timeout: 20_000 }).then(() => true).catch(() => false)
    await page.getByRole('button', { name: /^Colorado/ }).click()
    check('a state opens at its regions', await shown(/^Boulder\s*5,/))
    check('with no crumb repeating the state', (await page.getByRole('button', { name: 'Colorado', exact: true }).count()) === 0)
    await screen('add-browse-state', 5)
    await page.getByRole('button', { name: /^Boulder\s*5,/ }).click()
    await page.getByRole('button', { name: /^Eldorado Canyon State Park/ }).click()
    check('a crag offers itself to add', await shown('Add Eldorado Canyon State Park'))
    check('with the trail back up as crumbs', (await page.getByRole('button', { name: 'Boulder', exact: true }).count()) === 1)
    await screen('add-browse-crag', 5)
    await page.getByRole('button', { name: 'Add Eldorado Canyon State Park' }).click()
    const pickedTitle = await page.getByRole('heading', { level: 1 }).innerText()
    check('picking it opens the save form named for it', pickedTitle === 'Eldorado Canyon State Park', `title "${pickedTitle}"`)
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    check('back from the form returns to the crag', await shown('Add Eldorado Canyon State Park'))
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    check('back from the crag steps up to its region', await shown(/^Eldorado Canyon State Park/))
    await page.getByRole('button', { name: 'Colorado', exact: true }).click()
    check('a crumb jumps to its level', await shown(/^Grand Junction Area/))
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    check('back from a state returns to the search', await shown('Use my current location'))

    // 4a. Current location, refused. Nothing granted, so Chromium denies it:
    // the screen must say why, not sit on "Reading location…".
    await page.getByRole('button', { name: 'Use my current location' }).click()
    const deniedLine = await page
      .getByText(/permission denied/i)
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
    check('a refused location permission says so on /add', deniedLine)
    await screen('add-location-denied', 5)
    await page.getByRole('button', { name: 'Cancel' }).click()

    // 4b. Current location, granted, standing at the known crag. The fix goes
    // straight to the save form — no weather preview — named for the crag.
    await context.grantPermissions(['geolocation'], { origin: WEB })
    async function fixOpensForm(lat: number, lon: number): Promise<string | null> {
      await context.setGeolocation({ latitude: lat, longitude: lon, accuracy: 12 })
      await page.getByRole('button', { name: 'Use my current location' }).click()
      const opened = await page
        .getByText(/Your location, ±\d+ ft/)
        .waitFor({ timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
      return opened ? page.getByRole('heading', { level: 1 }).innerText() : null
    }
    const cragTitle = await fixOpensForm(CRAG.lat, CRAG.lon)
    check('a GPS fix at a known crag opens the save form named for the crag', /taylors falls/i.test(cragTitle ?? ''), `title "${cragTitle}"`)
    const noPreview = (await page.getByText(/conditions now|next 7 days/i).count()) === 0
    check('with no weather preview on it', noPreview)
    await screen('add-location-crag', 5)
    await page.getByRole('button', { name: 'Back', exact: true }).click()

    // 4c. Anywhere else, named by OpenStreetMap: a point in Edina, MN. Saving
    // lands on the new location's own screen.
    const townTitle = await fixOpensForm(44.8897, -93.3499)
    check('a GPS fix elsewhere is named after its town', townTitle === 'Edina', `title "${townTitle}"`)
    const credited = (await page.getByText(/Minnesota, United States · © OpenStreetMap contributors/).count()) > 0
    check('with its state and an OpenStreetMap credit', credited)
    await screen('add-location-town', 5)
    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(/\/location\/[0-9a-f-]{36}$/, { timeout: 30_000 }).catch(() => undefined)
    gpsLocationId = /\/location\/([0-9a-f-]{36})$/.exec(page.url())?.[1] ?? null
    check('Save opens the saved location', gpsLocationId !== null, `at ${page.url()}`)
    if (gpsLocationId !== null) {
      const saved = await api<Location>('GET', `/locations/${gpsLocationId}`, token)
      const elevation = saved.payload.data?.elevation_m ?? null
      check('and it was saved with the looked-up elevation', elevation !== null && elevation > 200 && elevation < 350, `got ${String(elevation)}`)
    }

    await listChecks(token)

    // 4d–5, the list's own checks, as one function: `--list-only` calls it
    // straight after 2d. A declaration, so it is callable from there.
    async function listChecks(session: string): Promise<void> {
      // 4d. The list keeps its place. Its three rows fit at 1000 px, so a short
      // screen makes it scroll; at 400 px only ~100 px of scroll was left.
      await page.setViewportSize({ width: VIEWPORT.width, height: 300 })
      await page.goto(`${WEB}/`)
      await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined)
      const { listY, listH } = await page.evaluate(() => {
        window.scrollTo(0, Math.floor((document.documentElement.scrollHeight - window.innerHeight) / 2))
        return { listY: window.scrollY, listH: document.documentElement.scrollHeight }
      })
      check('the list is tall enough to scroll at 480x300', listY > 50, `scrolled to ${listY} of ${listH}`)
      await page.waitForTimeout(200)
      const scrollY = () => page.evaluate(() => window.scrollY)
      const near = (y: number) => Math.abs(y - listY) <= 2

      // The URL changes before React draws the next screen, so each read waits
      // for that screen's own content: a return waits on the URL, the list's
      // own sort control and the end of the page transition.
      // Tapped where it already is on screen: `locator.click()` scrolls its
      // target into view first, which moved the list before it was left and
      // was this check's "back at 0" (#359; a finger does not scroll).
      const card = page.locator('[role="button"]').first()
      const openCard = async () => {
        let tap: { x: number; y: number } | null = null
        for (const box of await Promise.all((await page.locator('[role="button"]').all()).map((c) => c.boundingBox()))) {
          const y = box === null ? -1 : box.y + box.height / 2
          if (box !== null && y > 10 && y < 190) {
            tap = { x: box.x + box.width / 2, y }
            break
          }
        }
        if (tap === null) throw new Error('no card on screen at 480x300 — stopping')
        await page.mouse.click(tap.x, tap.y)
        await page.getByRole('tab').first().waitFor({ timeout: 30_000 })
      }
      const backOnList = async () => {
        await page.waitForURL(`${WEB}/`, { timeout: 10_000 })
        await page.getByText('Sort by').first().waitFor({ timeout: 10_000 })
        // A page transition takes taps until it ends; `useNavigate` clears `data-page` then.
        await page.waitForFunction(() => document.documentElement.dataset['page'] === undefined, null, { timeout: 5_000 })
      }
      await openCard()
      const detailY = await scrollY()
      check('a location opened from far down the list opens at its top', detailY === 0, `at ${detailY}`)
      await page.getByRole('button', { name: 'Back to Conditions' }).click()
      await backOnList()
      const viaTab = await scrollY()
      check('a crag’s back returns to the list where it was left', near(viaTab), `left at ${listY}, back at ${viaTab}`)

      await openCard()
      await page.goBack()
      await backOnList()
      const viaBack = await scrollY()
      check('the phone’s back returns to the list where it was left', near(viaBack), `left at ${listY}, back at ${viaBack}`)

      await bar.getByRole('link', { name: 'Conditions' }).click()
      await page.waitForFunction(() => window.scrollY === 0, undefined, { timeout: 5_000 }).catch(() => undefined)
      check('the lit tab on the list scrolls it to the top', (await scrollY()) === 0 && new URL(page.url()).pathname === '/', `at ${await scrollY()}`)

      // 4e. A control dims while pressed. Released off it, so nothing navigates.
      const mapTab = bar.getByRole('link', { name: 'Map' })
      const opacity = () => mapTab.evaluate((el) => getComputedStyle(el).opacity)
      const box = await mapTab.boundingBox()
      if (box !== null) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        const pressed = await opacity()
        await page.waitForTimeout(250)
        const shrunk = await mapTab.evaluate((el) => getComputedStyle(el).transform)
        check('a pressed tab shrinks to 97%', /^matrix\(0\.97, 0, 0, 0\.97/.test(shrunk), shrunk)
        await page.mouse.move(0, 0)
        await page.mouse.up()
        const released = await opacity()
        check('a pressed tab dims and comes back when released', pressed === '0.6' && released === '1', `pressed ${pressed}, released ${released}`)
      } else {
        check('a pressed tab dims and comes back when released', false, 'the Map tab has no box')
      }

      // 4f. Holding a card is a press: no tap-highlight box over it, and no
      // text selection with its copy menu.
      const held = await card.evaluate((el) => {
        const s = getComputedStyle(el)
        return { highlight: s.getPropertyValue('-webkit-tap-highlight-color'), select: s.userSelect }
      })
      check(
        'a held card paints no highlight and selects no text',
        held.highlight === 'rgba(0, 0, 0, 0)' && held.select === 'none',
        `highlight ${held.highlight}, user-select ${held.select}`,
      )
      await page.setViewportSize(VIEWPORT)

      await context.close()

      // 4g. Pulling the list down refreshes it, and a score a new run changes
      // rolls to its new value. A touch context, with every /conditions answer
      // after the first rewritten to score 42.
      const touch = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, hasTouch: true })
      await touch.addInitScript((t) => localStorage.setItem('wt6.session.token', t), session)
      const tp = await touch.newPage()
      let rescore = false
      await tp.route('**/api/v1/conditions/**', async (route) => {
        const response = await route.fetch()
        const body = await response.text()
        await route.fulfill({ response, body: rescore ? body.replace(/"score":\d+/g, '"score":42') : body })
      })
      await tp.goto(`${WEB}/`)
      // Each card's score cell is its figure over "now". While a new run rolls
      // it, the figure is a transparent copy beside the aria-hidden digit strip.
      const scoreCells = () =>
        tp.evaluate(() =>
          Array.from(document.querySelectorAll('main small'))
            .filter((s) => s.textContent === 'now')
            .map((s) => {
              const cell = s.parentElement
              const roll = cell?.querySelector('[aria-hidden]') ?? null
              const figure = roll === null ? cell?.firstChild?.textContent : roll.previousElementSibling?.textContent
              return { figure: (figure ?? '').trim(), rolling: roll !== null }
            }),
        )
      const scored = await tp
        .waitForFunction(
          () => Array.from(document.querySelectorAll('main small')).some((s) => s.textContent === 'now'),
          null,
          { timeout: 60_000 },
        )
        .then(() => true, () => false)
      check('the list prints a score for its crags', scored, 'no card printed a score over "now" within 60 s')
      await tp.waitForLoadState('networkidle')
      // Every card's score, not the top one's: the list sorts by score, so the
      // rescore below can reorder the cards under the figure being read.
      const before = (await scoreCells()).map((c) => c.figure)

      // Hand-dispatched touches. `Input.synthesizeScrollGesture` would be the
      // closer stand-in for a finger, but in headless Chromium it delivers
      // touchstart and touchend and never a touchmove, even on a plain page.
      // Registered after the app's own window listener, so it sees whether the
      // page took the drag over.
      await tp.evaluate(() => {
        const moves: string[] = []
        ;(window as unknown as { __moves: string[] }).__moves = moves
        window.addEventListener('touchmove', (e) => moves.push(e.cancelable && e.defaultPrevented ? 'taken' : 'native'), {
          passive: true,
        })
      })
      const cdp = await touch.newCDPSession(tp)
      const at = (y: number) => [{ x: 240, y }]
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(300) })
      for (let y = 320; y <= 560; y += 20) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(y) })
      }
      const pulled = await tp.locator('main [aria-live="polite"]').innerText()
      const moves = await tp.evaluate(() => (window as unknown as { __moves: string[] }).__moves)
      const pullShot = join(dir, `${String(passed + failed).padStart(2, '0')}-list-pulled.png`)
      await tp.screenshot({ path: pullShot })
      check(
        `a pull says it will refresh and how fresh the scores are  →  ${pullShot}`,
        /Release to refresh/.test(pulled) && /Updated (just now|\d+ (min|h) ago)/.test(pulled),
        pulled.replace(/\s+/g, ' ') || '(the panel never opened)',
      )
      check(
        'the page takes the drag over rather than the browser bouncing it',
        moves.length > 0 && moves.every((m) => m === 'taken'),
        moves.join(' '),
      )
      rescore = true
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      const refreshing = await tp
        .getByText('Refreshing…')
        .waitFor({ timeout: 2_000 })
        .then(() => true, () => false)
      const settled = await tp
        .getByText('Up to date')
        .waitFor({ timeout: 30_000 })
        .then(() => true, () => false)
      check('releasing it refreshes, then says it is up to date', refreshing && settled, `refreshing ${refreshing}, settled ${settled}`)
      const rolling = await scoreCells()
      const rollShot = join(dir, `${String(passed + failed).padStart(2, '0')}-list-score-rolled.png`)
      await tp.screenshot({ path: rollShot })
      check(
        `a score the refresh changed rolls to its new value  →  ${rollShot}`,
        rolling.some((c) => c.rolling && c.figure === '42'),
        `before ${before.join(', ')}, now ${rolling.map((c) => `${c.figure}${c.rolling ? ' (rolling)' : ''}`).join(', ')}`,
      )
      await tp.waitForTimeout(5_000)
      const after = await scoreCells()
      check(
        'then settles on the new score',
        after.length > 0 && after.every((c) => !c.rolling && c.figure === '42'),
        after.map((c) => `${c.figure}${c.rolling ? ' (rolling)' : ''}`).join(', '),
      )

      // 4h. A location's forecast tabs pull to refresh too; a sideways scrub
      // across a chart is not a pull, and Rock does not pull at all.
      const dragPanel = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
        for (let i = 1; i <= 12; i++) {
          const point = { x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] })
        }
        const text = await tp.locator('main > [aria-live="polite"]').innerText()
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        return text.replace(/\s+/g, ' ').trim()
      }
      rescore = false
      await tp.goto(`${WEB}/location/${locationId}`)
      await tp.getByRole('tab', { name: 'Hourly' }).click()
      await tp.getByRole('img', { name: /^Wind by hour/ }).first().waitFor({ timeout: 60_000 })
      const hourlyPull = await dragPanel({ x: 240, y: 400 }, { x: 240, y: 700 })
      check(
        'pulling a crag’s Hourly tab offers a refresh and says how old the forecast is',
        /Release to refresh/.test(hourlyPull) && /Updated (just now|\d+ (min|h) ago)/.test(hourlyPull),
        hourlyPull || '(the panel never opened)',
      )
      // A live refresh can outlast 30 s; the scrub below then read the pull's own
      // "Refreshing…" and failed for it (nightly, 2026-10-22 and 10-25).
      const hourlyRefreshed = await tp
        .locator('main > [aria-live="polite"]', { hasText: 'Refreshing' })
        .waitFor({ state: 'hidden', timeout: 90_000 })
        .then(() => true, () => false)
      check('the Hourly refresh finishes', hourlyRefreshed, 'still refreshing after 90 s')
      await tp.getByText(/Up to date|Couldn’t refresh/).waitFor({ timeout: 5_000 }).catch(() => undefined)
      await tp.waitForTimeout(1_500)
      const scrub = await dragPanel({ x: 100, y: 700 }, { x: 400, y: 760 })
      check('a sideways scrub across a chart does not pull', scrub === '', scrub)
      await tp.getByRole('tab', { name: 'Rock' }).click()
      await tp.waitForTimeout(300)
      const rockPull = await dragPanel({ x: 240, y: 400 }, { x: 240, y: 700 })
      check('the Rock tab does not pull to refresh', rockPull === '', rockPull)
      await touch.close()

      // 5. /conditions failing (#261). A fresh context, so no cached readings,
      // with every /conditions request answered 500. The hero holds its skeleton
      // through the retries, then must offer a retry — never sit as an empty
      // gap. The 500s are the scenario, so they are not counted as problems here.
      const failing = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 })
      await failing.addInitScript((t) => localStorage.setItem('wt6.session.token', t), session)
      const fp = await failing.newPage()
      await failing.route('**/api/v1/conditions/**', (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ data: null, error: 'forced by check:ui', status: 500 }),
        }),
      )
      // Overview by name: this user saved Hourly as their opening tab above.
      await fp.goto(`${WEB}/location/${locationId}?tab=overview`)
      const gaveUp = await fp
        .getByText("Couldn't load conditions. Tap to retry.")
        .waitFor({ timeout: 60_000 })
        .then(() => true)
        .catch(() => false)
      const errorShot = join(dir, `${String(passed + failed).padStart(2, '0')}-conditions-failed.png`)
      await fp.screenshot({ path: errorShot, fullPage: true })
      check(`a failing /conditions offers a retry  →  ${errorShot}`, gaveUp)
      await failing.close()
    }
  } finally {
    finishing = true
    await browser.close().catch(() => undefined)
    if (vite) vite.kill()
    const leftover: string[] = []
    for (const id of [joinedUserId, userId]) {
      if (id !== null && !(await removeTestUser(id))) leftover.push(id)
    }
    server.close()
    await pool.end()
    if (tape && RECORD) {
      // A rate-limited or failing answer on the tape would replay that failure on every PR.
      const refused = tape.entries.filter((e) => e.status === 429 || e.status >= 500)
      if (refused.length > 0) {
        check('every upstream answer recorded was usable', false, `${refused.length} were 429 or 5xx; the tape was not written. First: ${refused[0]!.key}`)
      } else {
        mkdirSync(dirname(tapePath), { recursive: true })
        writeFileSync(tapePath, gzipSync(JSON.stringify(tape)))
        console.log(`\nRecorded ${tape.entries.length} upstream answers to ${tapePath}`)
      }
    }
    if (rateLimitedBy !== null) check(`no upstream rate limit (${rateLimitedBy} answered 429)`, false)
    if (REPLAY) {
      const missed = [...tapeMisses]
      check(
        'every upstream call was on the tape',
        missed.length === 0,
        `${missed.length} missing, re-record with --record: ${missed.slice(0, 5).join('  ')}`,
      )
    }
    if (leftover.length > 0) {
      console.error(`\n!! CLEANUP FAILED — users ${leftover.join(', ')} are left; \`check:ui -- --sweep\` removes them after ${STALE_HOURS} h`)
    }
    const only = TABS_ONLY ? ' (--tabs-only)' : LIST_ONLY ? ' (--list-only)' : ''
    console.log(`\n${passed} passed, ${failed} failed${only}. Screenshots: ${dir}\n`)
  }
}

// The exit code is set here, not at the end of `run`: the partial runs return
// from inside its `try`, so `--tabs-only` used to exit 0 on a failure.
run().then(() => process.exit(failed === 0 ? 0 : 1), (err: unknown) => {
  console.error(`\ncheck:ui stopped: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
