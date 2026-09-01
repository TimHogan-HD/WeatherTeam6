import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  cragClimbabilityHistory,
  conditionsReports,
  conditionsScores,
  forecastSnapshots,
  locationNormals,
  locations,
  panelStates,
  premiumPulls,
  rainfallHistory,
  tripLocations,
  walls,
  weatherAlerts,
  weatherEnsembleHours,
  weatherRunHours,
  weatherRuns,
} from '../../db/schema.js'

/**
 * Every table carrying a `location_id` FK. None of them declares
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
  conditionsScores,
  tripLocations,
  cragClimbabilityHistory,
  conditionsReports,
  premiumPulls,
  locationNormals,
  weatherAlerts,
  walls,
  // A bot panel left open on a location the user then deletes. The FK is
  // nullable but it is still an FK: without this the delete raises a
  // foreign-key violation that `sendServerError` reports as a generic 500,
  // and only once someone has actually opened a panel.
  panelStates,
  // `weather_runs` carries a nullable `location_id`, so it belongs here — but it
  // must not be reached until its own children are gone. See the ordered step in
  // `deleteLocationCascade` below, which runs before this list.
  weatherRuns,
] as const

/**
 * Delete a location and everything that references it, in one transaction.
 *
 * Returns false when the location does not exist or belongs to another user —
 * the caller maps both to 404, so a wrong-owner id is indistinguishable from a
 * missing one.
 *
 * Idempotent: a second call for the same id finds nothing and returns false
 * without touching anything. All twelve statements share one transaction, so a
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

    /**
     * **Ordered, and it has to come first.**
     *
     * `weather_run_hours` and `weather_ensemble_hours` key off `run_id`, not
     * `location_id`, so the `DEPENDENT_TABLES` loop below cannot reach them —
     * it dereferences `table.location_id`, and adding them to that list would
     * not even compile. Letting the loop delete `weather_runs` while its
     * children still point at it is a foreign-key violation surfacing as a
     * generic 500, which is precisely the failure that list exists to prevent,
     * one level down.
     *
     * Reading the ids first rather than deleting through a subquery keeps this
     * the same shape as the prune, and makes the empty case a no-op instead of
     * a wide `DELETE ... IN (SELECT ...)`.
     */
    const runs = await tx
      .select({ id: weatherRuns.id })
      .from(weatherRuns)
      .where(eq(weatherRuns.location_id, locationId))

    if (runs.length > 0) {
      const runIds = runs.map((r) => r.id)
      await tx.delete(weatherEnsembleHours).where(inArray(weatherEnsembleHours.run_id, runIds))
      await tx.delete(weatherRunHours).where(inArray(weatherRunHours.run_id, runIds))
    }

    for (const table of DEPENDENT_TABLES) {
      await tx.delete(table).where(eq(table.location_id, locationId))
    }

    const deleted = await tx
      .delete(locations)
      .where(and(eq(locations.id, locationId), eq(locations.user_id, userId)))
      .returning({ id: locations.id })

    return deleted.length > 0
  })
}
