/**
 * The wire shape of `GET /api/v1/recent-precip/:locationId` — hourly rain over
 * the days just past.
 *
 * **This is the rainfall the drying model is reasoning about**, and until now
 * nothing but the bot could see it. The score says "climbable in ~10h"; this is
 * the record behind that sentence, so a reader can tell a single afternoon
 * storm from three days of drizzle without taking the number on trust.
 *
 * Moved here from `apps/api/src/lib/weather/openMeteo.ts` when the Mini App
 * gained a use for it. The shape is unchanged — the API's parse type and the
 * wire type really are the same thing here, because the route is a thin
 * pass-through over one upstream call.
 */

export type RecentPrecipHour = {
  /**
   * `YYYY-MM-DDTHH:mm`, **local to the location**, exactly as Open-Meteo
   * returned it under `timezone=auto`.
   *
   * Not a UTC instant, and not the viewer's clock. A client plotting these must
   * not re-read them in its own timezone — issue #33 is what that costs.
   */
  readonly valid_at_local: string
  readonly precip_mm: number
}

export type RecentPrecip = {
  readonly hours: readonly RecentPrecipHour[]
  readonly utc_offset_seconds: number
  /**
   * The oldest local date the window covers, so a caller knows what a miss
   * means: no rain *in this window* rather than no rain ever.
   */
  readonly from_date: string | null
}
