/**
 * **Which rain should the drying clock read? Measured against rain gauges.**
 *
 * `npm run compare:dryness --workspace=apps/api`
 *
 * Issue #209: the dryness reading used `gfs_seamless`'s own rain while the chart
 * beside it drew the ensemble, and the two disagreed about whether it had
 * rained. This is the evidence behind `lib/weather/rainMedian.ts`.
 *
 * For each ASOS station below, over the past `PAST_DAYS`, it runs the real
 * Crag A clock (`evaluateCragA`) once per rain source and once on the
 * station's own hourly gauge (`p01i`, from the Iowa Environmental Mesonet),
 * with every other input from `gfs_seamless`. It then scores each source
 * against the gauge on daytime hours (08-18 local). `not dry` means wet or
 * drying.
 *
 * - **miss%** — of the hours the gauge's clock said not dry, the share this
 *   source called dry. The error that sends someone to wet rock.
 * - **false%** — of the hours the gauge's clock said dry, the share this source
 *   called not dry. The error that costs a day.
 * - **Peirce** — hit rate minus false-alarm rate. It ignores how rare wet hours
 *   are, which raw agreement does not: most hours are dry, so a source that
 *   never saw rain would agree ~90% of the time.
 *
 * **Every source is scored on the same hours** — those where the gauge and
 * every source gave a reading. One missing rain hour makes the clock withhold
 * until the rock could have dried, and when rain follows, that runs on through
 * exactly the wet stretches. Scoring each source on its own hours once made a
 * source look better for having gaps.
 *
 * **What the gauge is not.** A tipping bucket at an airport, up to tens of
 * kilometres from any crag, that undercatches drizzle and reports a trace as
 * `T` (counted here as 0.1 mm). It is the only hourly measurement of rain there
 * is, and it scores a point forecast at a point. The ensemble is absent because
 * Open-Meteo keeps ~4 days of its past hours; the archive (ERA5) is present
 * for comparison and runs days behind, so it cannot drive a live reading.
 *
 * Network only — no database. Its output is the result.
 */
import type { RockType } from '@weatherteam6/types'
import { evaluateCragA, rockLevelA } from '../lib/scoring/cragModel.js'
import type { RockLevel, WeatherHour } from '../lib/scoring/hourlyConditions.js'
import {
  DETERMINISTIC_MODELS,
  fetchDeterministicHourly,
  fetchWithRetry,
  GLOBAL_DETERMINISTIC_MODELS,
  localTimeToUtc,
} from '../lib/weather/openMeteo.js'
import { rainMedian } from '../lib/weather/rainMedian.js'

const PAST_DAYS = 90
/** The clock treats its first hour as soaked; a week clears every rock type's window. */
const WARMUP_HOURS = 7 * 24
const DAY_FIRST_HOUR = 8
const DAY_LAST_HOUR = 18
const ROCKS: RockType[] = ['quartzite', 'sandstone', 'limestone']

/**
 * Airports near crags, plus wetter and drier climates so both errors get exercised.
 *
 * **Left out: RGK (Red Wing), TWM (Two Harbors) and BJC (Broomfield, for Boulder).**
 * Their gauges report 0.00 through real rain: over 2026-07-03 to 09-30 they read
 * 2, 5 and 0 mm where co-op and volunteer gauges 2-8 km away read 189-219, 177-208
 * and 33-59 mm. A gauge stuck at zero says "dry", so it scored every source wrong.
 */
const STATIONS: [id: string, near: string][] = [
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

type HourKey = string
const hourKey = (d: Date): HourKey => d.toISOString().slice(0, 13)

type Source = { name: string; rain: (key: HourKey) => number | null }

async function text(url: string): Promise<string> {
  const res = await fetchWithRetry(url)
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`)
  return res.text()
}

/** Hourly gauge rain keyed by the hour it ends, the way Open-Meteo stamps it. */
async function gauge(station: string, from: Date, to: Date) {
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

async function archive(lat: number, lon: number, from: Date, to: Date) {
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const body = JSON.parse(
    await text(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=${day(from)}&end_date=${day(to)}&hourly=precipitation&timezone=GMT`,
    ),
  ) as { hourly: { time: string[]; precipitation: (number | null)[] } }
  return new Map(body.hourly.time.map((t, i) => [t.slice(0, 13), body.hourly.precipitation[i] ?? null]))
}

type Tally = { hit: number; miss: number; falseAlarm: number; correctDry: number }
const tallies = new Map<string, Tally>()
function count(key: string, truthWet: boolean, sourceWet: boolean): void {
  const t = tallies.get(key) ?? { hit: 0, miss: 0, falseAlarm: 0, correctDry: 0 }
  if (truthWet) {
    if (sourceWet) t.hit++
    else t.miss++
  } else if (sourceWet) t.falseAlarm++
  else t.correctDry++
  tallies.set(key, t)
}

async function run(): Promise<void> {
  const to = new Date()
  const from = new Date(to.getTime() - PAST_DAYS * 86_400_000)
  const order: string[] = []

  console.log(`\n=== compare:dryness — rain sources against ASOS gauges, past ${PAST_DAYS} days ===\n`)

  for (const [station, near] of STATIONS) {
    try {
      const { rain: gauged, lat, lon } = await gauge(station, from, to)
      if (!Number.isFinite(lat)) throw new Error('no reports')
      const det = await fetchDeterministicHourly(
        { lat, lon, elevation_m: null },
        DETERMINISTIC_MODELS,
        1,
        PAST_DAYS,
      )
      const thermal = det.models.find((m) => m.model === 'gfs_seamless')
      if (!thermal) throw new Error('gfs_seamless did not answer')
      const utc = (local: string) => localTimeToUtc(local, det.utc_offset_seconds)

      const byModel = new Map(
        det.models.map((m) => [
          m.model,
          new Map(m.hours.flatMap((h) => {
            const at = utc(h.valid_at_local)
            return at ? [[hourKey(at), h.precip_mm] as const] : []
          })),
        ]),
      )
      const all = [...byModel.keys()]
      const at = (names: readonly string[], key: HourKey) => {
        const v = names.map((n) => byModel.get(n)?.get(key))
        return v.some((x) => x == null) ? null : (v as number[])
      }
      const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
      const median = (v: number[]) => {
        const s = [...v].sort((a, b) => a - b)
        const m = s.length >> 1
        return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
      }
      const shipped = rainMedian(det)
      const shippedByKey = new Map<HourKey, number | null>()
      for (const [local, mm] of shipped?.byLocal ?? []) {
        const when = utc(local)
        if (when) shippedByKey.set(hourKey(when), mm)
      }
      const reanalysis = await archive(lat, lon, from, to)
      const own = (n: string) => (k: HourKey) => byModel.get(n)?.get(k) ?? null

      const sources: Source[] = [
        { name: 'gfs_seamless (before)', rain: own('gfs_seamless') },
        { name: 'median, global (shipped)', rain: (k) => shippedByKey.get(k) ?? null },
        ...all.filter((n) => n !== 'gfs_seamless').map((n) => ({ name: n, rain: own(n) })),
        { name: 'median, all six', rain: (k) => { const v = at(all, k); return v && median(v) } },
        { name: 'mean, global', rain: (k) => { const v = at(GLOBAL_DETERMINISTIC_MODELS, k); return v && mean(v) } },
        { name: 'mean, all six', rain: (k) => { const v = at(all, k); return v && mean(v) } },
        { name: 'mean, all six, <0.2 mm = 0', rain: (k) => { const v = at(all, k); return v && (mean(v) < 0.2 ? 0 : mean(v)) } },
        { name: 'archive (ERA5)', rain: (k) => reanalysis.get(k) ?? null },
      ]
      for (const s of sources) if (!order.includes(s.name)) order.push(s.name)

      const base = thermal.hours.flatMap((h) => {
        const when = utc(h.valid_at_local)
        if (!when) return []
        const weather: WeatherHour = {
          valid_at: when.toISOString(),
          air_temp_c: h.temp_c,
          dewpoint_c: h.dewpoint_c,
          wind_kmh: h.wind_kmh,
          cloud_pct: h.cloud_pct,
          shortwave_wm2: h.shortwave_wm2,
          precip_mm: null,
        }
        return [{ key: hourKey(when), localHour: Number(h.valid_at_local.slice(11, 13)), weather }]
      })
      const levels = (rain: (k: HourKey) => number | null, rock: RockType): (RockLevel | null)[] =>
        evaluateCragA(
          base.map((b) => ({ ...b.weather, precip_mm: rain(b.key) })),
          { rockType: rock, lat, lon },
        ).map((h) => rockLevelA(h.diagnostics.wetness_factor, rock))

      for (const rock of ROCKS) {
        const truth = levels((k) => gauged.get(k) ?? null, rock)
        const bySource = sources.map((s) => levels(s.rain, rock))
        base.forEach((b, i) => {
          if (i < WARMUP_HOURS || b.localHour < DAY_FIRST_HOUR || b.localHour > DAY_LAST_HOUR) return
          const t = truth[i]
          if (t == null || bySource.some((l) => l[i] == null)) return
          sources.forEach((s, si) => count(`${rock}|${s.name}`, t !== 'dry', bySource[si]![i] !== 'dry'))
        })
      }
      const wetHours = [...gauged.values()].filter((mm) => mm !== null && mm >= 0.05).length
      console.log(`  ${station.padEnd(4)} ${near.padEnd(20)} ${String(wetHours).padStart(4)} wet hours on the gauge`)
    } catch (err) {
      console.log(`  ${station.padEnd(4)} ${near.padEnd(20)} skipped: ${(err as Error).message}`)
    }
  }

  const pct = (a: number, b: number) => (b === 0 ? '—' : ((100 * a) / b).toFixed(1)).padStart(7)
  for (const rock of ROCKS) {
    console.log(`\n  ${rock}`)
    console.log(`  ${'source'.padEnd(30)}  miss%  false%  Peirce   hours  not dry`)
    const rows = order.flatMap((name) => {
      const t = tallies.get(`${rock}|${name}`)
      return t ? [{ name, t, peirce: t.hit / (t.hit + t.miss) - t.falseAlarm / (t.falseAlarm + t.correctDry) }] : []
    })
    rows.sort((a, b) => b.peirce - a.peirce)
    for (const { name, t, peirce } of rows) {
      const wet = t.hit + t.miss
      const dry = t.falseAlarm + t.correctDry
      console.log(
        `  ${name.padEnd(30)}${pct(t.miss, wet)}${pct(t.falseAlarm, dry)}${peirce.toFixed(3).padStart(8)}${String(wet + dry).padStart(8)}${String(wet).padStart(9)}`,
      )
    }
  }
  console.log('')
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
