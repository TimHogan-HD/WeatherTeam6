/**
 * Correct where a saved location sits.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run locations:move -- <location id> <lat> <lon> <elevation m | none>              # dry run
 *   npm run locations:move -- <location id> <lat> <lon> <elevation m | none> --apply      # writes
 *
 * The app has no way to move a saved place: `PATCH /locations/:id` takes the
 * wall and the rock only. This exists for a saved point that is on the wrong
 * spot — Sandstone was saved at OpenBeta's area point, 10 km from the walls.
 *
 * - **A correction, not a new place.** A move over `MAX_MOVE_KM` is refused:
 *   that is a different crag, its time zone may differ, and it should be
 *   deleted and added again.
 * - **The elevation is given with the move**, because the stored one describes
 *   the old point and Open-Meteo corrects temperature to it. `none` stores
 *   null — no correction — never the old value.
 * - **The NWS grid and ASOS station are cleared**: they were looked up for the
 *   old point.
 * - Weather runs are keyed by coordinates (`pointKeyForPlace`), so the new
 *   point starts its own history; nothing stored for the old one is touched.
 * - **The rock lock is not re-applied here.** Run
 *   `npm run locations:lock-known-crags` afterwards; it is the only other
 *   writer of `known_crag`.
 *
 * console rather than the logger is deliberate — this is an operator-facing CLI,
 * same as `lockKnownCrags.ts`, and its output is the result.
 */

import { isUuid } from '../lib/http.js'

const MAX_MOVE_KM = 25

function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

function usage(message: string): never {
  console.error(`\n${message}\n\nUsage: npm run locations:move -- <location id> <lat> <lon> <elevation m | none> [--apply]\n`)
  process.exit(2)
}

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('\nMissing DATABASE_URL — the Neon pooled connection string.\n')
    process.exit(2)
  }
  const apply = process.argv.includes('--apply')
  const [id, latArg, lonArg, elevationArg] = process.argv.slice(2).filter((a) => a !== '--apply')
  if (id === undefined || !isUuid(id)) usage('The first argument must be a location id.')
  const lat = Number(latArg)
  const lon = Number(lonArg)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) usage(`Not a latitude: ${String(latArg)}`)
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) usage(`Not a longitude: ${String(lonArg)}`)
  if (elevationArg === undefined) usage('Give the new point\'s elevation in metres, or "none".')
  const elevation = elevationArg === 'none' ? null : Number(elevationArg)
  if (elevation !== null && !Number.isFinite(elevation)) usage(`Not an elevation: ${elevationArg}`)

  const { db, pool } = await import('../db/index.js')
  const { locations } = await import('../db/schema.js')
  const { eq } = await import('drizzle-orm')

  try {
    const [row] = await db
      .select({ name: locations.name, lat: locations.lat, lon: locations.lon, elevation_m: locations.elevation_m })
      .from(locations)
      .where(eq(locations.id, id))
    if (row === undefined) usage(`No location ${id}.`)

    const km = kmBetween({ lat: parseFloat(row.lat), lon: parseFloat(row.lon) }, { lat, lon })
    console.log(`\n${row.name}`)
    console.log(`  from  ${row.lat}, ${row.lon}  elevation ${row.elevation_m ?? 'none'}`)
    console.log(`  to    ${lat}, ${lon}  elevation ${elevation ?? 'none'}   (${km.toFixed(2)} km)`)
    if (km > MAX_MOVE_KM) usage(`Refused: ${km.toFixed(1)} km is a different place, not a correction. Delete it and add it again.`)

    if (!apply) {
      console.log('\nNothing written. Re-run with --apply to write it.\n')
      return
    }
    await db
      .update(locations)
      .set({
        lat: String(lat),
        lon: String(lon),
        elevation_m: elevation === null ? null : String(elevation),
        nws_office: null,
        nws_grid_x: null,
        nws_grid_y: null,
        asos_station: null,
        asos_network: null,
        updated_at: new Date(),
      })
      .where(eq(locations.id, id))
    console.log('\nWritten. Now run npm run locations:lock-known-crags to re-check the rock lock.\n')
  } finally {
    await pool.end()
  }
}

run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'failed')
  process.exit(1)
})
