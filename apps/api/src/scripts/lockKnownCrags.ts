/**
 * Apply the known-crag lock to locations saved before it existed.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run locations:lock-known-crags              # dry run — prints, writes nothing
 *   npm run locations:lock-known-crags -- --apply   # writes
 *
 * `POST /locations` applies the lock on save (`resolveRockType`); this is the
 * same function run over rows that already exist, and it is the **only** other
 * writer of `known_crag`. Re-run it whenever `KNOWN_CRAGS` gains or changes an
 * entry — it is idempotent, and a row already right is left alone.
 *
 * Three outcomes per climbing location:
 *
 * - **lock** — it sits on a known crag. `rock_type` becomes the research's and
 *   `known_crag` its slug.
 * - **unlock** — it carries a slug this build no longer matches (an entry was
 *   removed or its box moved). `known_crag` is cleared and `rock_type` is **kept**:
 *   the value was right once and is still the best information on the row.
 * - unchanged — everything else, including every non-climbing location.
 *
 * A rock type set by the user is overwritten when it is locked. That is the
 * decision (owner, 2026-09-23), and the dry run exists so the first run is read
 * before it is written.
 *
 * console rather than the logger is deliberate — this is an operator-facing CLI,
 * same as `addUser.ts`, and its output is the result.
 */

import type { RockType } from '@weatherteam6/types'
import { resolveRockType } from '../lib/locations/resolveRockType.js'

type Change = {
  id: string
  name: string
  action: 'lock' | 'unlock'
  from: string
  to: string
}

/** The save-time rule, run over a stored row. Only climbing rows reach here. */
function resolve(row: { lat: string; lon: string; rock_type: RockType | null }) {
  return resolveRockType({
    lat: parseFloat(row.lat),
    lon: parseFloat(row.lon),
    is_climbing_location: true,
    rock_type: row.rock_type,
  })
}

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('\nMissing DATABASE_URL — the Neon pooled connection string.\n')
    process.exit(2)
  }
  const apply = process.argv.includes('--apply')

  const { db, pool } = await import('../db/index.js')
  const { locations } = await import('../db/schema.js')
  const { eq } = await import('drizzle-orm')

  try {
    const rows = await db
      .select({
        id: locations.id,
        name: locations.name,
        lat: locations.lat,
        lon: locations.lon,
        rock_type: locations.rock_type,
        known_crag: locations.known_crag,
      })
      .from(locations)
      .where(eq(locations.is_climbing_location, true))

    const changes: Change[] = []
    for (const row of rows) {
      const resolved = resolve(row)
      const before = `${row.rock_type ?? 'null'}${row.known_crag ? ` [${row.known_crag}]` : ''}`
      if (resolved.known_crag !== null) {
        if (row.rock_type === resolved.rock_type && row.known_crag === resolved.known_crag) continue
        changes.push({
          id: row.id,
          name: row.name,
          action: 'lock',
          from: before,
          to: `${String(resolved.rock_type)} [${resolved.known_crag}]`,
        })
      } else if (row.known_crag !== null) {
        changes.push({ id: row.id, name: row.name, action: 'unlock', from: before, to: `${row.rock_type ?? 'null'}` })
      }
    }

    console.log(`\n${rows.length} climbing locations, ${changes.length} to change${apply ? '' : ' (dry run)'}\n`)
    for (const c of changes) {
      console.log(`  ${c.action.padEnd(6)}  ${c.name.padEnd(32)}  ${c.from}  →  ${c.to}`)
    }

    if (!apply) {
      if (changes.length > 0) console.log('\nNothing written. Re-run with --apply to write these.\n')
      return
    }

    for (const c of changes) {
      const row = rows.find((r) => r.id === c.id)
      if (!row) continue
      const resolved = resolve(row)
      await db
        .update(locations)
        .set(
          resolved.known_crag !== null
            ? { rock_type: resolved.rock_type, known_crag: resolved.known_crag, updated_at: new Date() }
            : { known_crag: null, updated_at: new Date() },
        )
        .where(eq(locations.id, c.id))
    }
    console.log(`\nWrote ${changes.length} row${changes.length === 1 ? '' : 's'}.\n`)
  } finally {
    await pool.end()
  }
}

run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'failed')
  process.exit(1)
})
