import { and, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  cragClimbabilityHistory,
  conditionsReports,
  feedback,
  forecastSnapshots,
  locationNormals,
  locations,
  premiumPulls,
  rainfallHistory,
  tripDayRecords,
  tripRainRecords,
  tripLocations,
  walls,
  weatherAlerts,
} from '../../db/schema.js'

/**
 * Every table carrying a `location_id` FK whose rows go with the location.
 * `feedback` also carries one and is **not** here — it is detached below,
 * because a forecast check outlives the crag it was about. None of them declares
 * `onDelete: 'cascade'` — the schema uses the Postgres default (NO ACTION) — so
 * deleting a location with any dependent row raises a foreign-key violation,
 * which `sendServerError` would surface as a generic 500. Saved locations
 * reliably accumulate `weather_alerts` rows from the alerts cron, so this is the
 * common case, not the edge case.
 *
 * Deleting these explicitly rather than adding cascades to the schema keeps the
 * blast radius at this one flow: a schema-wide cascade would also silently
 * change what `DELETE /trips/:id` and any future delete do.
 */
const DEPENDENT_TABLES = [
  rainfallHistory,
  forecastSnapshots,
  tripLocations,
  tripDayRecords,
  tripRainRecords,
  cragClimbabilityHistory,
  conditionsReports,
  premiumPulls,
  locationNormals,
  weatherAlerts,
  walls,
] as const

/**
 * Delete a location and everything that references it, in one transaction.
 *
 * Returns false when the location does not exist or belongs to another user —
 * the caller maps both to 404, so a wrong-owner id is indistinguishable from a
 * missing one.
 *
 * Idempotent: a second call for the same id finds nothing and returns false
 * without touching anything. All its statements share one transaction, so a
 * mid-way failure leaves the location and its dependents fully intact rather
 * than a location whose history has been half-removed.
 *
 * Known gap: `conditions_reports` rows may reference photos in R2. The rows go,
 * the objects do not — orphaned objects are left for a future cleanup pass.
 */
export async function deleteLocationCascade(
  locationId: string,
  userId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Ownership is checked inside the transaction so the row cannot be
    // reassigned between the check and the deletes.
    const owned = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.user_id, userId)))
      .limit(1)

    if (!owned[0]) return false

    // Stored weather runs are not here: they belong to a place that another
    // user's copy of this crag may still read, and the prune ages them out.
    for (const table of DEPENDENT_TABLES) {
      await tx.delete(table).where(eq(table.location_id, locationId))
    }

    // Feedback is detached, not deleted: a forecast check is evidence about the
    // place, and the row already carries the place's name and coordinates.
    // Not filtered by user: any row still referencing the location would make
    // the delete below a foreign-key violation.
    await tx.update(feedback).set({ location_id: null }).where(eq(feedback.location_id, locationId))

    const deleted = await tx
      .delete(locations)
      .where(and(eq(locations.id, locationId), eq(locations.user_id, userId)))
      .returning({ id: locations.id })

    return deleted.length > 0
  })
}
