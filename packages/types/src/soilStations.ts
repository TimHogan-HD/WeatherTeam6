/**
 * NOAA climate stations (USCRN) near a crag (#589 part 2): a fourth rain gauge
 * on the Gauges card's Rain tab, and the soil moisture its Ground tab reads.
 *
 * **Keyed by `KNOWN_CRAGS` slug, like `RIVER_GAUGES`**, so everyone who saves
 * the crag sees the same station with no migration. A crag is listed only
 * with a station within about 10 km (owner, 2026-11-12); on 2026-11-12 that
 * was Robinson Park alone, and the next nearest crag (Yosemite Valley) sits
 * 18 km from one.
 *
 * **A reading beside the score, never part of it.** No soil or station rain
 * feeds or withholds Crag A.
 */
export type SoilStation = {
  /** The station's WBAN number, e.g. `54932`. */
  wban: string
  /** The station's own name, e.g. `Sandstone 6 W`. */
  name: string
  /** The station's file stem on NCEI, e.g. `MN_Sandstone_6_W`. */
  file: string
  lat: number
  lon: number
  /** The station's clock, for its local days. */
  tz: string
  /** Straight-line km from the crag. */
  distance_km: number
  /** Which way the station lies from the crag, as a reader would say it. */
  direction: string
  /** Where the sensors sit, which is not where the climbing is. */
  setting: string
}

export const SOIL_STATIONS: Readonly<Record<string, SoilStation>> = {
  // USCRN "Sandstone 6 W" at the Audubon Center of the North Woods, 10.4 km
  // west of Robinson Park (NCEI stations.tsv, 2026-11-12).
  'robinson-park': {
    wban: '54932',
    name: 'Sandstone 6 W',
    file: 'MN_Sandstone_6_W',
    lat: 46.11,
    lon: -92.99,
    tz: 'America/Chicago',
    distance_km: 10.4,
    direction: 'west',
    setting: 'in an open field',
  },
}

/** The station for a saved location's known crag; null for an unknown crag or one with none. */
export function soilStationFor(knownCrag: string | null | undefined): SoilStation | null {
  if (knownCrag === null || knownCrag === undefined) return null
  return SOIL_STATIONS[knownCrag] ?? null
}

/** How many days of soil a reading carries: the Ground tab's chart. */
export const SOIL_HISTORY_DAYS = 15

/**
 * One hour at the station, from NCEI's soil anomaly product (`soilanom01`).
 * Moisture is water by volume as a fraction (`0.234` is 23.4%); a percentile
 * is the reading's rank among that station's readings for the date, as a
 * fraction; temperature is °C. **Every field is null when the station logged
 * nothing**, never 0.
 */
export type SoilPoint = {
  /** ISO instant, the end of the hour. */
  at: string
  vwc_5: number | null
  pct_5: number | null
  temp_5_c: number | null
  vwc_20: number | null
  pct_20: number | null
  temp_20_c: number | null
}

/** One local day of the station's own rain: null when any hour of it did not report. */
export type SoilRainDay = { local_date: string; rain_mm: number | null }

/**
 * `GET /soil/:locationId` for a crag with a station; `data: null` for one
 * without. **Empty `points` with `answered: false` means NCEI did not
 * answer**, never dry ground; `rain_days` is empty when the rain read failed.
 */
export type SoilReading = {
  station: Pick<SoilStation, 'wban' | 'name' | 'distance_km' | 'direction' | 'setting'>
  answered: boolean
  /** The last `SOIL_HISTORY_DAYS`, oldest first. */
  points: SoilPoint[]
  /** The station's rain by local day over the same span, oldest first; today last, and likely partial. */
  rain_days: SoilRainDay[]
}
