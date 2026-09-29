/**
 * The wire shape of `GET /api/v1/recent-precip/:locationId` — hourly rain over
 * the days just past.
 *
 * **This is the rainfall the drying clock reads** — the hourly median of the
 * four global models (`rainMedian.ts`, issue #209) — so a reader can tell a
 * single afternoon storm from three days of drizzle without taking "Dryness"
 * on trust. It is a model estimate, not a gauge.
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
  /** Everything that fell, snow as its water equivalent. */
  readonly precip_mm: number
  /**
   * The liquid part — Open-Meteo's `rain` plus `showers` — and the snow, in
   * centimetres of depth. Together they say whether an hour was rain, snow or
   * both.
   *
   * **`null` means unknown, and so does absent.** Either upstream column can be
   * null, and optional because the API and the client deploy separately: a
   * response from before these existed simply lacks them. A reader that needs
   * the kind of precipitation must withhold it rather than assume rain.
   */
  readonly rain_mm?: number | null
  readonly snowfall_cm?: number | null
}

export type RecentPrecip = {
  readonly hours: readonly RecentPrecipHour[]
  readonly utc_offset_seconds: number
  /**
   * The oldest local date the window covers, so a caller knows what a miss
   * means: no rain *in this window* rather than no rain ever.
   */
  readonly from_date: string | null
  /**
   * The models whose per-hour median `hours` is, so a surface names what it
   * drew. Empty when none answered; absent from an API older than the field.
   */
  readonly models?: readonly string[]
}
