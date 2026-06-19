/**
 * Seed the crags table from an OpenBeta JSON export.
 *
 * Usage:
 *   npx tsx src/scripts/importCrags.ts path/to/crags.json
 *
 * Expected JSON format (array of objects):
 *   [
 *     {
 *       "id": "openbeta-uuid",
 *       "name": "Red Rock Canyon",
 *       "metadata": { "lat": 36.13, "lng": -115.43 },
 *       "type": "limestone",
 *       "pathTokens": ["Nevada", "Las Vegas", "Red Rock Canyon"],
 *       "areaName": "Nevada"
 *     },
 *     ...
 *   ]
 *
 * Rows are upserted by openbeta_id — safe to re-run.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { db } from '../db/index.js'
import { crags } from '../db/schema.js'

interface OpenBetaEntry {
  id: string
  name: string
  metadata?: { lat?: number; lng?: number }
  type?: string
  pathTokens?: string[]
  areaName?: string
}

async function run() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: npx tsx src/scripts/importCrags.ts <path-to-json>')
    process.exit(1)
  }

  const raw = readFileSync(resolve(filePath), 'utf-8')
  const entries: OpenBetaEntry[] = JSON.parse(raw)

  if (!Array.isArray(entries)) {
    console.error('JSON must be an array of crag objects')
    process.exit(1)
  }

  let inserted = 0
  let skipped = 0

  const BATCH = 200
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH)

    const values = batch
      .filter((e) => {
        const lat = e.metadata?.lat
        const lon = e.metadata?.lng
        return (
          typeof e.id === 'string' &&
          e.id.length > 0 &&
          typeof e.name === 'string' &&
          e.name.trim().length > 0 &&
          typeof lat === 'number' && isFinite(lat) &&
          typeof lon === 'number' && isFinite(lon)
        )
      })
      .map((e) => ({
        openbeta_id: e.id,
        name: e.name.trim(),
        lat: String(e.metadata!.lat!),
        lon: String(e.metadata!.lng!),
        rock_type: e.type ?? null,
        area_name: e.pathTokens?.[e.pathTokens.length - 2] ?? null,
        state: e.areaName ?? e.pathTokens?.[0] ?? null,
      }))

    skipped += batch.length - values.length
    if (values.length === 0) continue

    await db
      .insert(crags)
      .values(values)
      .onConflictDoUpdate({
        target: crags.openbeta_id,
        set: {
          name: crags.name,
          lat: crags.lat,
          lon: crags.lon,
          rock_type: crags.rock_type,
          area_name: crags.area_name,
          state: crags.state,
        },
      })

    inserted += values.length
    process.stdout.write(`\rProcessed ${i + batch.length}/${entries.length}`)
  }

  console.log(`\nDone. Upserted: ${inserted}, skipped (missing lat/lon): ${skipped}`)
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
