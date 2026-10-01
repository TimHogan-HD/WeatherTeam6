/// <reference lib="dom" />
// The DOM types are for the callbacks `page.evaluate` runs inside the browser.

/**
 * Drive the web app in a real browser, end to end, against the real database.
 *
 * Usage, from `apps/api` (DATABASE_URL set in the shell, no `.env`):
 *   npm run check:ui                 # screenshots to a temp directory
 *   npm run check:ui -- --out <dir>  # or to a directory you name
 *
 * Why this exists: UI work here was verified by rebuilding the same local
 * harness by hand every session — a throwaway secret, a local API, vite on
 * :5173, a scratch user — through hundreds of one-off browser calls, none of
 * them repeatable. This is that harness, once.
 *
 * What it does: starts `createApp()` on :3096 with throwaway secrets, starts
 * vite on :5173 pointed at it, creates a throwaway user, signs in through the
 * real login screen, adds a known crag through the API, and opens the list,
 * every detail tab and the add screen at the owner's phone viewport
 * (480x1000). Each screen is screenshotted, and fails on an uncaught page
 * error, a console error, an API response >= 400, a horizontal scroll, or an
 * empty panel. Everything it creates is under the `zz-check-ui` prefix and is
 * removed in `finally`.
 *
 * It reads the screens; it does not judge them. Open the screenshots.
 *
 * Workspace-level, like the other database checks: CI does not run it.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ApiResponse, Location } from '@weatherteam6/types'

const API_PORT = 3096
const WEB_PORT = 5173
const API = `http://localhost:${API_PORT}`
const WEB = `http://localhost:${WEB_PORT}`
const VIEWPORT = { width: 480, height: 1000 }

const PREFIX = 'zz-check-ui'
const STAMP = Date.now()
const USERNAME = `${PREFIX}-${STAMP}`
const PASSPHRASE = `local-ui-check-${STAMP}`

/** Taylors Falls: a known crag (locked rock type) with guidebook coverage, so every tab renders. */
const CRAG = { name: `ZZ UI check — Taylors Falls ${STAMP}`, lat: 45.3955, lon: -92.6616 }

const here = dirname(fileURLToPath(import.meta.url))
const miniappDir = resolve(here, '../../../miniapp')
const viteBin = resolve(here, '../../../../node_modules/vite/bin/vite.js')

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

  const { createApp } = await import('../index.js')
  const { db, pool } = await import('../db/index.js')
  const { users, userPreferences } = await import('../db/schema.js')
  const { hashPassword } = await import('../lib/auth/password.js')
  const { eq } = await import('drizzle-orm')
  const { chromium } = await import('playwright')

  const dir = outDir()
  const server = createApp().listen(API_PORT)
  await new Promise<void>((r) => server.once('listening', r))

  let vite: ChildProcess | null = null
  let userId: string | null = null
  let locationId: string | null = null
  let gpsLocationId: string | null = null
  let token: string | null = null
  const browser = await chromium.launch()

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

    // 2a. Opening a crag from its card. Pressing starts the crag screen's
    // fetches before the finger lifts, and the screen draws from the list's
    // copy of the location instead of asking for it again.
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
    const hourlyOnPress = requested.some((p) => p.endsWith(`/hourly/${locationId}`))
    check('pressing a card starts its hourly fetch before release', heldOnList && hourlyOnPress, `still on list: ${heldOnList}; requests: ${requested.join(', ')}`)
    await page.mouse.up()
    await page.getByRole('tab').first().waitFor({ timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined)
    page.off('request', onRequest)
    const refetched = requested.filter((p) => p.endsWith(`/locations/${locationId}`))
    check('the crag screen reuses the list’s copy of the location', refetched.length === 0, `fetched ${refetched.length}×`)

    // 2b. A tapped card opens its crag at once, even when the crag's hourly
    // series is slow (held back 3 s here). A brief wait for it was tried and
    // removed: the owner found the tap laggy (2026-10-01).
    await page.goto(`${WEB}/`)
    const firstCard = page.locator('[role="button"]').first()
    await firstCard.waitFor({ timeout: 30_000 })
    const splash = page.getByRole('status', { name: 'Loading your crags' })
    await splash.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined)
    const slowHourly = `${API}/api/v1/hourly/**`
    await page.route(slowHourly, async (route) => {
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
    await page.unroute(slowHourly)

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
    await page.evaluate(() => localStorage.setItem('wt6.locations', '[]'))
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
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Conditions' }).click()
    await firstCard.waitFor({ timeout: 10_000 })
    check('coming back to the list shows no splash', (await splash.count()) === 0)

    // 2d. A reopen draws the cards from what this device remembers — no
    // splash, the age in the header — while every weather call is held back
    // 3 s; then the live copies replace them.
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined)
    const rememberedSaved = await page.evaluate(() => localStorage.getItem('wt6.cards') !== null)
    check('the list remembers its cards’ weather on this device', rememberedSaved)
    const slowWeather = /\/api\/v1\/(forecast|conditions|alerts)\//
    await page.route(slowWeather, async (route) => {
      await new Promise((r) => setTimeout(r, 3_000))
      await route.continue().catch(() => undefined)
    })
    const reopened = Date.now()
    await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' })
    const drawn = await firstCard
      .getByText('Low–high')
      .waitFor({ timeout: 1_500 })
      .then(() => true)
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

    // 3. Every detail tab.
    await page.goto(`${WEB}/location/${locationId}`)
    await page.getByRole('tab').first().waitFor({ timeout: 60_000 })
    const tabs = await page.getByRole('tab').allInnerTexts()
    check('the detail screen shows the six crag tabs', tabs.length === 6, `got ${tabs.join(', ')}`)
    for (const label of tabs) {
      await page.getByRole('tab', { name: label.trim() }).click()
      await screen(`tab-${label.trim().toLowerCase()}`)
    }

    // 3a. The bottom bar: every section by tapping it, then Conditions back to
    // the list — the location screen has no back link of its own.
    const bar = page.getByRole('navigation', { name: 'Main' })
    for (const section of ['Crags', 'Map', 'Trips', 'Profile']) {
      await bar.getByRole('link', { name: section }).click()
      await screen(`section-${section.toLowerCase()}`, 5)
      const lit = await bar.locator('[aria-current="page"]').getAttribute('aria-label')
      check(`the bar lights ${section} on its own screen`, lit === section, `lit: ${lit}`)
    }
    await page.goto(`${WEB}/location/${locationId}`)
    await bar.getByRole('link', { name: 'Conditions' }).click()
    await page.waitForURL((u) => u.pathname === '/', { timeout: 10_000 }).catch(() => undefined)
    check('Conditions in the bar returns a location to the list', new URL(page.url()).pathname === '/', page.url())

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
    await page.goto(`${WEB}/`)
    await page.locator('[role="button"]').first().click()
    await page.getByRole('tab').first().waitFor({ timeout: 30_000 })
    const opened = await page.getByRole('tab', { selected: true }).innerText()
    check('a crag now opens on the saved tab', opened.trim() === 'Hourly', `opened on ${opened}`)
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

    // 3b. The location editor (scoring Phase 4b). The crag is a known crag, so
    // its rock type is locked and must not be sent; aspect and angle are.
    await page.goto(`${WEB}/location/${locationId}`)
    await page.getByRole('button', { name: 'Edit crag' }).click()
    await page.waitForURL(/\/edit$/, { timeout: 10_000 }).catch(() => undefined)
    await page.getByRole('button', { name: 'Faces SW' }).waitFor({ timeout: 30_000 })
    check('the editor shows no bottom bar', (await bar.count()) === 0)
    await screen('edit')
    await page.getByRole('button', { name: 'Faces SW' }).click()
    await page.getByRole('button', { name: 'Overhang' }).click()
    await screen('edit-picked')
    const patch = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith(`/locations/${locationId}`))
    await page.getByRole('button', { name: 'Save' }).click()
    const sent = (await patch).postDataJSON() as Record<string, unknown>
    check(
      'Save sends only what changed, and never a locked rock type',
      JSON.stringify(sent) === JSON.stringify({ aspect: 'SW', wall_angle_deg: 30 }),
      JSON.stringify(sent),
    )
    await page.waitForURL(/tab=rock/, { timeout: 15_000 }).catch(() => undefined)
    const stored = await api<Location>('GET', `/locations/${locationId}`, token)
    check(
      'and the row stores it, the angle in the column’s own sign',
      stored.payload.data?.aspect === 'SW' && stored.payload.data.cliff_angle === -30,
      `aspect ${stored.payload.data?.aspect}, cliff_angle ${stored.payload.data?.cliff_angle}`,
    )
    await screen('edit-saved')
    const rockTab = await page.locator('main').innerText()
    check('the Rock tab’s facts show the new wall in climbers’ words', /30° overhang/.test(rockTab) && /\bSW\b/.test(rockTab))

    // 4. The add screen.
    await page.goto(`${WEB}/add`)
    await screen('add', 5)
    check('the add flow shows no bottom bar', (await bar.count()) === 0)

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

    // 4d. The list keeps its place. Two crags fit at 1000 px, so a shorter
    // screen makes the list scroll.
    await page.setViewportSize({ width: VIEWPORT.width, height: 400 })
    await page.goto(`${WEB}/`)
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined)
    const { listY, listH } = await page.evaluate(() => {
      window.scrollTo(0, Math.floor((document.documentElement.scrollHeight - window.innerHeight) / 2))
      return { listY: window.scrollY, listH: document.documentElement.scrollHeight }
    })
    check('the list is tall enough to scroll at 480x400', listY > 50, `scrolled to ${listY} of ${listH}`)
    await page.waitForTimeout(200)
    const scrollY = () => page.evaluate(() => window.scrollY)
    const near = (y: number) => Math.abs(y - listY) <= 2

    // The URL changes before React draws the next screen, so each read waits
    // for that screen's own content.
    const card = page.locator('[role="button"]').first()
    const openCard = async () => {
      await card.click()
      await page.getByRole('tab').first().waitFor({ timeout: 30_000 })
    }
    await openCard()
    const detailY = await scrollY()
    check('a location opened from far down the list opens at its top', detailY === 0, `at ${detailY}`)
    await bar.getByRole('link', { name: 'Conditions' }).click()
    await card.waitFor({ timeout: 10_000 })
    const viaTab = await scrollY()
    check('the lit Conditions tab returns to the list where it was left', near(viaTab), `left at ${listY}, back at ${viaTab}`)

    await openCard()
    await page.goBack()
    await card.waitFor({ timeout: 10_000 })
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

    // 5. /conditions failing (#261). A fresh context, so no cached readings,
    // with every /conditions request answered 500. The card must say it is
    // retrying, then offer a retry — never sit as an empty gap. The 500s are
    // the scenario, so they are not counted as problems here.
    const failing = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 })
    await failing.addInitScript((t) => localStorage.setItem('wt6.session.token', t), token)
    const fp = await failing.newPage()
    // Fail /conditions only once the card itself is drawn: while the forecast
    // is still pending (through its own retry) the card is one skeleton, which
    // is loading and correct, but not the state under test.
    const cardDrawn = fp
      .getByText(/conditions now/i)
      .waitFor({ timeout: 90_000 })
      .catch(() => null)
    await failing.route('**/api/v1/conditions/**', async (route) => {
      await cardDrawn
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ data: null, error: 'forced by check:ui', status: 500 }),
      })
    })
    // Overview by name: this user saved Hourly as their opening tab above.
    await fp.goto(`${WEB}/location/${locationId}?tab=overview`)
    const retrying = await fp
      .getByText('Couldn’t reach conditions — trying again')
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false)
    const retryShot = join(dir, `${String(passed + failed).padStart(2, '0')}-conditions-retrying.png`)
    await fp.screenshot({ path: retryShot, fullPage: true })
    check(`a failing /conditions says it is trying again  →  ${retryShot}`, retrying)
    const gaveUp = await fp
      .getByText("Couldn't load conditions. Tap to retry.")
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false)
    const errorShot = join(dir, `${String(passed + failed).padStart(2, '0')}-conditions-failed.png`)
    await fp.screenshot({ path: errorShot, fullPage: true })
    check(`then offers a retry  →  ${errorShot}`, gaveUp)
    await failing.close()
  } finally {
    await browser.close().catch(() => undefined)
    if (vite) vite.kill()
    let cleanupFailed = false
    for (const id of [locationId, gpsLocationId]) {
      if (id === null || token === null) continue
      const del = await api<null>('DELETE', `/locations/${id}`, token).catch(() => null)
      if (del === null || del.status >= 300) cleanupFailed = true
    }
    if (userId !== null) {
      // The settings row holds a foreign key to the user, so it goes first.
      await db.delete(userPreferences).where(eq(userPreferences.user_id, userId)).catch(() => {
        cleanupFailed = true
      })
      await db.delete(users).where(eq(users.id, userId)).catch(() => {
        cleanupFailed = true
      })
    }
    server.close()
    await pool.end()
    if (cleanupFailed) {
      console.error(`\n!! CLEANUP FAILED — remove rows under "${PREFIX}" by hand (user ${userId}, locations ${locationId} and ${gpsLocationId})`)
    }
  }

  console.log(`\n${passed} passed, ${failed} failed. Screenshots: ${dir}\n`)
  process.exit(failed === 0 ? 0 : 1)
}

run().catch((err: unknown) => {
  console.error(`\ncheck:ui stopped: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
