/**
 * The wire shape of `GET /api/v1/recent-precip/:locationId` — hourly rain over
 * the days just past.
 *
 * **The same four global models the drying clock reads**, as their median hour
 * by hour (`rainMedian.ts`, issue #209), so a reader can tell a single
 * afternoon storm from three days of drizzle without taking "Dryness" on trust.
 * The clock averages each model over six hours before its median (issue #324);
 * this chart does not, so a past shower stays in its hour. It is a model
 * estimate, not a gauge.
 *
 * **Then checked against NOAA radar, as the clock is** (`radarChecked`, issue
 * #468): where MRMS saw no measurable rain across an hour's six-hour window the
 * hour reads dry, and where it saw rain the larger of radar and the median
 * stands. Before #468 the tab drew the median alone and could show a storm the
 * score had already ruled out.
 */

/**
 * Hourly precipitation you would see falling on the rock, mm — the line at
 * which Crag A scores the hour 0 (`FALLING_RAIN_MM`), and the Precip tab's
 * "real rain". Lighter rain from `WETTING_PRECIP_MM` up still sets the drying
 * clock back by its size (owner, 2026-10-26), so "since the last real rain" is
 * since the last rain heavy enough to stop climbing, not the last wetting.
 */
export const REWETTING_PRECIP_MM = 0.5

/**
 * Hourly rain that wets an open wall at all, mm (Crag A's `WET_MM`). Open-Meteo
 * reports 0 or ≥ 0.1; 0.05 keeps a float-rounded 0.1 from slipping under.
 */
export const WETTING_PRECIP_MM = 0.05

/**
 * The threshold a member has to cross to count as wet.
 *
 * 0.1 mm is Open-Meteo's own precipitation resolution, so anything below it is
 * a member reporting nothing rather than a member reporting a trace. Shared so
 * the client's "Dry all day" and the API's chance of rain draw one line.
 */
export const MEASURABLE_PRECIP_MM = 0.1

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
  /**
   * The models' median for this hour, **present only where radar changed
   * `precip_mm`** (issue #468), so a surface can say "the models had 0.30 in;
   * radar saw none at the crag". Absent means radar left the hour alone, or
   * did not check it, or the API is older than the field.
   */
  readonly model_precip_mm?: number
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
  /**
   * True when NOAA radar decided at least one hour (`radarChecked`), the same
   * meaning as `HourlyReadings.rain_radar`. Absent is an older API, not "no radar".
   */
  readonly rain_radar?: boolean
}
