/**
 * `radar_rain_hours` against real Postgres: what `collect-radar` writes, what
 * the drying clock reads back, and that a re-run upserts rather than duplicates.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:radar-rain
 *
 * **Safe against production.** It runs one real collection, the same work the
 * hourly cron does (NOAA MRMS, keyless), so its rows are the cron's own. The
 * rows it writes under its own key, `r:zz-check-radar`, are deleted in a
 * `finally`, loudly if that fails.
 */
const CHECK_KEY = 'r:zz-check-radar'

async function run(): Promise<void> {
  // A no-op unless CHECK_UI_WS_PROXY points at a local Postgres.
  const { useLocalPostgresProxy } = await import('./localPostgres.js')
  await useLocalPostgresProxy()
  const { and, eq, sql } = await import('drizzle-orm')
  const { db } = await import('../db/index.js')
  const { locations, radarRainHours } = await import('../db/schema.js')
  const { inMrmsGrid } = await import('../lib/weather/mrmsQpe.js')
  const { collectRadarRain, loadRadarRain } = await import('../lib/runs/radarRain.js')
  const { radarKeyFor } = await import('../lib/runs/pointKey.js')
  let failures = 0
  const check = (ok: boolean, what: string) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
    if (!ok) failures++
  }

  try {
    // Upsert: the same hour written twice is one row carrying the second value, and null survives.
    const t = new Date(Date.UTC(2026, 0, 1, 5))
    for (const precip_mm of [1.5, null]) {
      await db
        .insert(radarRainHours)
        .values({ cell_key: CHECK_KEY, valid_at: t, precip_mm })
        .onConflictDoUpdate({
          target: [radarRainHours.cell_key, radarRainHours.valid_at],
          set: { precip_mm: sql.raw('excluded."precip_mm"'), fetched_at: sql`now()` },
        })
    }
    const rows = await db
      .select()
      .from(radarRainHours)
      .where(and(eq(radarRainHours.cell_key, CHECK_KEY), eq(radarRainHours.valid_at, t)))
    check(rows.length === 1 && rows[0]!.precip_mm === null, 'a re-written hour is one row, and null stays null (not 0)')

    const first = await collectRadarRain()
    console.log('collection:', JSON.stringify(first))
    check(!first.listingFailed, 'the MRMS listing answered')
    check(first.hoursFailed.length === 0, 'every listed hour was fetched and read')
    check(first.pruned !== null, 'the prune ran')

    // Read back at each saved crag's own coordinates, as `getHourlySeries` does, so a
    // key the collector writes and the reader cannot find shows up as zero hours.
    const crags = await db
      .select({ name: locations.name, lat: locations.lat, lon: locations.lon })
      .from(locations)
      .where(eq(locations.is_climbing_location, true))
    const cellsRead = new Set<string>()
    for (const c of crags) {
      const p = { lat: parseFloat(c.lat), lon: parseFloat(c.lon) }
      if (!inMrmsGrid(p)) continue
      const hours = await loadRadarRain(p)
      console.log(`${c.name}: ${hours === null ? 'read failed' : `${hours.size} hours stored`}`)
      check(hours !== null && hours.size > 0, `${c.name}: the drying clock reads the hours the collector stored`)
      cellsRead.add(radarKeyFor(p))
    }
    check(cellsRead.size === first.cells, `every US cell the collector counted was read back (${cellsRead.size} of ${first.cells})`)
    check((await loadRadarRain({ lat: 36.95, lon: 26.98 })) === null, 'a crag outside the US reads no radar')
  } finally {
    try {
      await db.delete(radarRainHours).where(eq(radarRainHours.cell_key, CHECK_KEY))
    } catch (err) {
      console.error(`CLEANUP FAILED: delete radar_rain_hours where cell_key = '${CHECK_KEY}' by hand`)
      console.error(err instanceof Error ? err.message : String(err))
      failures++
    }
  }
  if (failures > 0) {
    console.error(`${failures} failed`)
    process.exitCode = 1
  }
}

run()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => process.exit())
