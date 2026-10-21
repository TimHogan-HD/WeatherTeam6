/**
 * The rain-gauge truth and the past forecasts that `compare:dryness` and
 * `compare:rain-spread` score against it. Network only — no database.
 */
import { GLOBAL_DETERMINISTIC_MODELS, fetchWithRetry } from '../lib/weather/openMeteo.js'
import { rainMedian } from '../lib/weather/rainMedian.js'

/**
 * Airports near crags, plus wetter and drier climates so both errors get exercised.
 *
 * **Left out: RGK (Red Wing), TWM (Two Harbors) and BJC (Broomfield, for Boulder).**
 * Their gauges report 0.00 through real rain: over 2026-07-03 to 09-30 they read
 * 2, 5 and 0 mm where co-op and volunteer gauges 2-8 km away read 189-219, 177-208
 * and 33-59 mm. A gauge stuck at zero says "dry", so it scored every source wrong.
 */
export const STATIONS: [id: string, near: string][] = [
  ['DLL', "Devil's Lake WI"],
  ['RNH', 'Willow River WI'],
  ['POU', 'Gunks NY'],
  ['CHA', 'Chattanooga TN'],
  ['LEX', 'Red River Gorge KY'],
  ['RDM', 'Smith Rock OR'],
  ['BIH', 'Bishop CA'],
  ['VGT', 'Red Rock NV'],
  ['AVL', 'Asheville NC'],
  ['HQM', 'Washington coast'],
  ['BLI', 'Bellingham WA'],
  ['MPV', 'Montpelier VT'],
  ['LEB', 'Lebanon NH'],
  ['TUS', 'Tucson AZ'],
  ['FLG', 'Flagstaff AZ'],
  ['AUS', 'Austin TX'],
  ['RUT', 'Rutland VT'],
]

export type HourKey = string
export const hourKey = (d: Date): HourKey => d.toISOString().slice(0, 13)

/** Each model's rain per UTC hour. */
export type ByModel = Map<string, Map<HourKey, number | null>>

export async function text(url: string): Promise<string> {
  const res = await fetchWithRetry(url)
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`)
  return res.text()
}

/** Hourly gauge rain keyed by the hour it ends, the way Open-Meteo stamps it. */
export async function gauge(station: string, from: Date, to: Date) {
  const ymd = (d: Date, n: 1 | 2) =>
    `year${n}=${d.getUTCFullYear()}&month${n}=${d.getUTCMonth() + 1}&day${n}=${d.getUTCDate()}`
  const body = await text(
    `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${station}&data=p01i&${ymd(from, 1)}&${ymd(to, 2)}` +
      '&tz=Etc/UTC&format=onlycomma&latlon=yes&missing=M&trace=T&report_type=3',
  )
  const rain = new Map<HourKey, number | null>()
  let lat = NaN
  let lon = NaN
  for (const line of body.trim().split('\n').slice(1)) {
    const [, valid, lo, la, p01i] = line.split(',')
    if (!valid || !p01i) continue
    lat = Number(la)
    lon = Number(lo)
    // A routine report at :5x covers the hour ending then.
    const end = new Date(`${valid.replace(' ', 'T')}:00Z`)
    end.setUTCMinutes(0)
    end.setUTCHours(end.getUTCHours() + 1)
    const mm = p01i === 'M' ? null : p01i === 'T' ? 0.1 : Number(p01i) * 25.4
    const key = hourKey(end)
    if (rain.get(key) == null) rain.set(key, mm)
  }
  return { rain, lat, lon }
}

/**
 * Each global model's rain as forecast `lead` days ahead, per lead, from
 * Open-Meteo's Previous Runs API (`precipitation_previous_dayN`). Lead 0 is the
 * same API's own series, the baseline.
 */
export async function previousRuns(
  lat: number,
  lon: number,
  from: Date,
  to: Date,
  leads: readonly number[],
): Promise<Map<number, ByModel>> {
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const variable = (lead: number) => (lead === 0 ? 'precipitation' : `precipitation_previous_day${lead}`)
  const body = JSON.parse(
    await text(
      `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&start_date=${day(from)}&end_date=${day(to)}&hourly=${leads.map(variable).join(',')}` +
        `&models=${GLOBAL_DETERMINISTIC_MODELS.join(',')}&timezone=GMT`,
    ),
  ) as { hourly: Record<string, (number | null)[]> & { time: string[] } }
  const keys = body.hourly.time.map((t) => t.slice(0, 13))
  return new Map(
    leads.map((lead): [number, ByModel] => [
      lead,
      new Map(
        GLOBAL_DETERMINISTIC_MODELS.flatMap((m) => {
          const values = body.hourly[`${variable(lead)}_${m}`]
          return values ? [[m, new Map(keys.map((k, i) => [k, values[i] ?? null]))] as const] : []
        }),
      ),
    ]),
  )
}

/** The shipped `rainMedian` itself, on one lead's series stamped in UTC, keyed `YYYY-MM-DDTHH:00`. */
export function shippedMedian(byModel: ByModel): ReadonlyMap<string, number | null> {
  const blank = {
    temp_c: null, dewpoint_c: null, humidity_pct: null, wind_kmh: null, wind_gust_kmh: null,
    wind_dir_deg: null, cloud_pct: null, precip_prob_pct: null, pressure_hpa: null, shortwave_wm2: null,
  }
  return (
    rainMedian({
      models: [...byModel].map(([model, s]) => ({
        model,
        probability_is_shared: null,
        hours: [...s].map(([k, mm]) => ({ ...blank, valid_at_local: `${k}:00`, precip_mm: mm })),
      })),
      unavailable_models: [],
      utc_offset_seconds: 0,
      model_elevation_m: null,
      fetched_at: new Date(),
    })?.byLocal ?? new Map()
  )
}
