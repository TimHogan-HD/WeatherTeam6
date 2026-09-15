import { db } from '../../db/index.js'
import { locations } from '../../db/schema.js'
import type { Location } from '@weatherteam6/types'

/**
 * The insert behind saving a general (non-crag) location — shared by
 * `POST /locations` and the bot's `/weather` Save buttons (Phase 5), so the
 * two surfaces cannot drift on what actually gets written.
 *
 * **Trusts its input.** The caller validates — `parseGeneralLocationInput`
 * for the HTTP body, the panel state's own columns for the chat path — so
 * there is no untrusted body here to re-check.
 */
export type NewGeneralLocation = {
  readonly user_id: string
  readonly name: string
  readonly lat: number
  readonly lon: number
  readonly elevation_m: number | null
  readonly timezone: string | null
  readonly is_climbing_location: boolean
  readonly rock_type: Location['rock_type']
}

export type LocationRow = typeof locations.$inferSelect

export async function insertGeneralLocation(input: NewGeneralLocation): Promise<LocationRow> {
  const inserted = await db
    .insert(locations)
    .values({
      user_id: input.user_id,
      name: input.name,
      lat: String(input.lat),
      lon: String(input.lon),
      // Persisted so the saved location and its own pre-save preview agree on
      // temperature: applyLapseRate returns early when this is null, so
      // dropping it shifts every reading by the full lapse-rate correction.
      elevation_m: input.elevation_m === null ? null : String(input.elevation_m),
      timezone: input.timezone,
      is_climbing_location: input.is_climbing_location,
      rock_type: input.rock_type,
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('Insert returned no row')
  return row
}
