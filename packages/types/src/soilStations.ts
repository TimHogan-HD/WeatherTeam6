/**
 * Soil stations near a crag (#589): the soil moisture the Gauges card's
 * Ground tab reads. Two networks:
 *
 * - **NOAA USCRN** (part 2): its percentile for the date comes from NCEI, and
 *   its rain is also a fourth row on the Rain tab.
 * - **Wisconet** (part 3): only since 2023, too short for percentiles (owner,
 *   2026-11-12), so the reading is ranked against the station's last
 *   `SOIL_RECENT_DAYS` instead and says so. Its rain is not a Rain tab row:
 *   the mockup draws none, and an unheated gauge reads snow as nothing.
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
type SoilStationBase = {
  /** The station's own name, e.g. `Sandstone 6 W`. */
  name: string
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

/** A NOAA USCRN station, read from NCEI's files. */
export type UscrnStation = SoilStationBase & {
  network: 'uscrn'
  /** The station's WBAN number, e.g. `54932`. */
  wban: string
  /** The station's file stem on NCEI, e.g. `MN_Sandstone_6_W`. */
  file: string
}

/** A Wisconet station, read from `api.wisconet.wisc.edu`. */
export type WisconetStation = SoilStationBase & {
  network: 'wisconet'
  /** The station's id, e.g. `DFRC`. */
  id: string
}

export type SoilStation = UscrnStation | WisconetStation

/** Who runs a station, as the card names it. */
export const SOIL_NETWORK_NAME: Readonly<Record<SoilStation['network'], string>> = { uscrn: 'NOAA', wisconet: 'Wisconet' }

export const SOIL_STATIONS: Readonly<Record<string, SoilStation>> = {
  // USCRN "Sandstone 6 W" at the Audubon Center of the North Woods, 10.4 km
  // west of Robinson Park (NCEI stations.tsv, 2026-11-12).
  'robinson-park': {
    network: 'uscrn',
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
  // Wisconet "Prairie du Sac" (DFRC), 7.9 km south of the middle of Devil's
  // Lake State Park; soil since Sep 2023 (api.wisconet.wisc.edu, 2026-11-12).
  'devils-lake': {
    network: 'wisconet',
    id: 'DFRC',
    name: 'Prairie du Sac',
    lat: 43.3448,
    lon: -89.7117,
    tz: 'America/Chicago',
    distance_km: 7.9,
    direction: 'south',
    setting: 'on farmland',
  },
}

/** The station for a saved location's known crag; null for an unknown crag or one with none. */
export function soilStationFor(knownCrag: string | null | undefined): SoilStation | null {
  if (knownCrag === null || knownCrag === undefined) return null
  return SOIL_STATIONS[knownCrag] ?? null
}

/** The station whose rain is a Rain tab row: NOAA only. */
export function rainStationFor(knownCrag: string | null | undefined): UscrnStation | null {
  const s = soilStationFor(knownCrag)
  return s?.network === 'uscrn' ? s : null
}

/** How many days of soil a reading carries: the Ground tab's chart. */
export const SOIL_HISTORY_DAYS = 15

/** The span a Wisconet reading is ranked against, for want of a climatology. */
export const SOIL_RECENT_DAYS = 30

/**
 * One hour at the station, from NCEI's soil anomaly product (`soilanom01`).
 * Moisture is water by volume as a fraction (`0.234` is 23.4%); a percentile
 * is the reading's rank among that station's readings for the date, as a
 * fraction (for a Wisconet station, its rank among the station's thawed
 * hours over the last `SOIL_RECENT_DAYS`); temperature is °C. **Every field is null when the station logged
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
  station: Pick<SoilStationBase, 'name' | 'distance_km' | 'direction' | 'setting'> & {
    /** Absent from an older API, which was NOAA only. */
    network?: SoilStation['network']
  }
  /**
   * What the percentiles rank against: the date across the station's years
   * (`date`, and absent from an older API), or its own last
   * `SOIL_RECENT_DAYS` with the 5 cm range they spanned (`recent`).
   */
  basis?: SoilBasis
  answered: boolean
  /** The last `SOIL_HISTORY_DAYS`, oldest first. */
  points: SoilPoint[]
  /** The station's rain by local day over the same span, oldest first; today last, and likely partial. */
  rain_days: SoilRainDay[]
}

/** What a soil reading's percentiles rank against. */
export type SoilBasis =
  | { kind: 'date' }
  | {
      kind: 'recent'
      days: number
      /** The 5 cm low and high over those days, thawed hours only; null with none. */
      lo_5: number | null
      hi_5: number | null
    }
