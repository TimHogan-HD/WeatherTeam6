/**
 * **Which rain should the drying clock read? Measured against rain gauges.**
 *
 * `npm run compare:dryness --workspace=apps/api` (append `-- DLL POU` for only those stations)
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
 * **Lead time (issue #324).** Past hours are analysis or very short lead,
 * where the models already agree on when it rains. A second table scores rain
 * *rules* on what each model forecast one and two days ahead
 * (`precipitation_previous_dayN` from Open-Meteo's Previous Runs API), with lead
 * 0 from the same API as the baseline. Crag A re-wets at `WET_MM` (0.05 mm), so a
 * per-hour median rarely misses the rain; it shrinks it. When the models put a
 * shower in different hours, the median's storm total is a fraction of each
 * model's, and the clock, which sizes the drying window from the storm total,
 * dries the rock early. Every candidate keeps the amount:
 *
 * - **median, hourly (before)** — the rule before #324, as the baseline.
 * - **rainMedian (shipped)** — the function the clock reads, called as is.
 * - **rolling, N h** — the median of each model's centred N-hour mean. A mean, not
 *   a sum, so a storm keeps its total. `rolling, 6 h` is what shipped, strict
 *   about gaps; the shipped one differs only at a series' ends and gaps.
 * - **vote, ±N h** — when at least 2 models reach `REWETTING_PRECIP_MM` within ±N
 *   hours, the mean of those models' ±N-hour means; otherwise the median.
 *
 * A third table scores whole days: the rock at the hour `dayRepresentative`
 * picks, which is what a day tile reads. That table decided #324.
 *
 * Network only — no database. Its output is the result.
 */
import { REWETTING_PRECIP_MM, type RockType } from '@weatherteam6/types'
import { dayRepresentative, evaluateCragA, rockLevelA } from '../lib/scoring/cragModel.js'
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

const LEADS = [0, 1, 2] as const
type ByModel = Map<string, Map<HourKey, number | null>>

/** Each global model's rain as forecast `lead` days ahead, per lead. */
async function previousRuns(lat: number, lon: number, from: Date, to: Date) {
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const variable = (lead: number) => (lead === 0 ? 'precipitation' : `precipitation_previous_day${lead}`)
  const body = JSON.parse(
    await text(
      `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&start_date=${day(from)}&end_date=${day(to)}&hourly=${LEADS.map(variable).join(',')}` +
        `&models=${GLOBAL_DETERMINISTIC_MODELS.join(',')}&timezone=GMT`,
    ),
  ) as { hourly: Record<string, (number | null)[]> & { time: string[] } }
  const keys = body.hourly.time.map((t) => t.slice(0, 13))
  return new Map(
    LEADS.map((lead): [number, ByModel] => [
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

const shift = (key: HourKey, hours: number): HourKey =>
  hourKey(new Date(new Date(`${key}:00:00Z`).getTime() + hours * 3_600_000))

function median(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** A model's mean rain over the hours `offsets` away from `key`, or null if any is unknown. */
function windowMean(series: Map<HourKey, number | null>, key: HourKey, offsets: readonly number[]): number | null {
  let sum = 0
  for (const o of offsets) {
    const v = series.get(shift(key, o))
    if (v == null) return null
    sum += v
  }
  return sum / offsets.length
}

const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)

/** Fewer than this many models at an hour is a gap, as in `rainMedian`. */
const MIN_MODELS = 3

type Rule = { name: string; rain: (byModel: ByModel, key: HourKey) => number | null }

function medianOver(byModel: ByModel, value: (series: Map<HourKey, number | null>) => number | null) {
  const known = [...byModel.values()].map(value).filter((v): v is number => v !== null)
  return known.length >= MIN_MODELS ? median(known) : null
}

const rolling = (label: string, offsets: number[]): Rule => ({
  name: `rolling, ${label}`,
  rain: (byModel, key) => medianOver(byModel, (s) => windowMean(s, key, offsets)),
})

const vote = (n: number): Rule => ({
  name: `vote, ±${n} h`,
  rain: (byModel, key) => {
    const hourly = medianOver(byModel, (s) => s.get(key) ?? null)
    if (hourly === null) return null
    const offsets = range(-n, n)
    const voters = [...byModel.values()].flatMap((s) => {
      const mean = windowMean(s, key, offsets)
      const reached = offsets.some((o) => (s.get(shift(key, o)) ?? 0) >= REWETTING_PRECIP_MM)
      return mean !== null && reached ? [mean] : []
    })
    return voters.length >= 2 ? voters.reduce((a, b) => a + b, 0) / voters.length : hourly
  },
})

/** The shipped `rainMedian` itself, on one lead's series stamped in UTC. */
function shippedRule(): Rule {
  const cache = new WeakMap<ByModel, ReadonlyMap<string, number | null>>()
  const blank = {
    temp_c: null, dewpoint_c: null, humidity_pct: null, wind_kmh: null, wind_gust_kmh: null,
    wind_dir_deg: null, cloud_pct: null, precip_prob_pct: null, pressure_hpa: null, shortwave_wm2: null,
  }
  return {
    name: 'rainMedian (shipped)',
    rain: (byModel, key) => {
      let byLocal = cache.get(byModel)
      if (!byLocal) {
        byLocal = rainMedian({
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
        cache.set(byModel, byLocal)
      }
      return byLocal.get(`${key}:00`) ?? null
    },
  }
}

const RULES: Rule[] = [
  { name: 'median, hourly (before)', rain: (byModel, key) => medianOver(byModel, (s) => s.get(key) ?? null) },
  shippedRule(),
  rolling('3 h', range(-1, 1)),
  rolling('6 h', range(-3, 2)),
  vote(1),
  vote(2),
]

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

  // `npm run compare:dryness -- DLL POU` runs only those stations.
  const only = process.argv.slice(2).map((s) => s.toUpperCase())
  for (const [station, near] of STATIONS.filter(([id]) => only.length === 0 || only.includes(id))) {
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
      const shipped = rainMedian(det)
      const shippedByKey = new Map<HourKey, number | null>()
      for (const [local, mm] of shipped?.byLocal ?? []) {
        const when = utc(local)
        if (when) shippedByKey.set(hourKey(when), mm)
      }
      const reanalysis = await archive(lat, lon, from, to)
      const own = (n: string) => (k: HourKey) => byModel.get(n)?.get(k) ?? null

      const sources: Source[] = [
        { name: 'gfs_seamless (before #209)', rain: own('gfs_seamless') },
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
        return [{
          key: hourKey(when),
          localDate: h.valid_at_local.slice(0, 10),
          localHour: Number(h.valid_at_local.slice(11, 13)),
          weather,
        }]
      })
      const levels = (rain: (k: HourKey) => number | null, rock: RockType): (RockLevel | null)[] =>
        evaluateCragA(
          base.map((b) => ({ ...b.weather, precip_mm: rain(b.key) })),
          { rockType: rock, lat, lon },
        ).map((h) => rockLevelA(h.diagnostics.wetness_factor, rock))
      const warmEnd = base[WARMUP_HOURS]?.localDate ?? ''
      /** Per local date past the warm-up, the rock at the day's representative hour; null if it has none. */
      const dayLevels = (rain: (k: HourKey) => number | null, rock: RockType): Map<string, RockLevel | null> => {
        const hours = evaluateCragA(
          base.map((b) => ({ ...b.weather, precip_mm: rain(b.key) })),
          { rockType: rock, lat, lon },
        )
        const byDate = new Map<string, typeof hours>()
        base.forEach((b, i) => {
          if (b.localDate <= warmEnd) return
          byDate.set(b.localDate, [...(byDate.get(b.localDate) ?? []), hours[i]!])
        })
        return new Map([...byDate].map(([date, day]) => {
          const rep = dayRepresentative(day, det.utc_offset_seconds)
          return [date, rep && rockLevelA(rep.diagnostics.wetness_factor, rock)]
        }))
      }

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

      // Every lead and rule on the same hours, so a rule with more gaps cannot look better.
      const runs = await previousRuns(lat, lon, from, to)
      const leadRules = LEADS.flatMap((lead) =>
        RULES.map((rule) => ({ key: leadKey(lead, rule.name), rain: (k: HourKey) => rule.rain(runs.get(lead)!, k) })),
      )
      for (const rock of ROCKS) {
        const truth = levels((k) => gauged.get(k) ?? null, rock)
        const byRule = leadRules.map((r) => levels(r.rain, rock))
        base.forEach((b, i) => {
          if (i < WARMUP_HOURS || b.localHour < DAY_FIRST_HOUR || b.localHour > DAY_LAST_HOUR) return
          const t = truth[i]
          if (t == null || byRule.some((l) => l[i] == null)) return
          leadRules.forEach((r, ri) => count(`${rock}|${r.key}`, t !== 'dry', byRule[ri]![i] !== 'dry'))
        })

        // The app's day: the rock at the hour `dayRepresentative` picks, as a day tile shows it.
        const dayTruth = dayLevels((k) => gauged.get(k) ?? null, rock)
        const dayByRule = leadRules.map((r) => dayLevels(r.rain, rock))
        for (const [date, t] of dayTruth) {
          if (t == null || dayByRule.some((d) => d.get(date) == null)) continue
          leadRules.forEach((r, ri) => count(`${rock}|day|${r.key}`, t !== 'dry', dayByRule[ri]!.get(date) !== 'dry'))
        }
      }
      const wetHours = [...gauged.values()].filter((mm) => mm !== null && mm >= 0.05).length
      console.log(`  ${station.padEnd(4)} ${near.padEnd(20)} ${String(wetHours).padStart(4)} wet hours on the gauge`)
    } catch (err) {
      console.log(`  ${station.padEnd(4)} ${near.padEnd(20)} skipped: ${(err as Error).message}`)
    }
  }

  for (const rock of ROCKS) {
    console.log(`\n  ${rock}`)
    table(rock, order, true)
  }
  console.log(`\n=== by lead (issue #324) — rules on the four global models, as forecast N days ahead ===`)
  for (const rock of ROCKS) {
    for (const lead of LEADS) {
      console.log(`\n  ${rock}, lead ${lead} day${lead === 1 ? '' : 's'}`)
      table(rock, RULES.map((r) => leadKey(lead, r.name)), false)
    }
  }
  console.log(`\n=== by lead, per day — the rock at the hour dayRepresentative picks; "hours" counts days ===`)
  for (const rock of ROCKS) {
    for (const lead of LEADS) {
      console.log(`\n  ${rock}, lead ${lead} day${lead === 1 ? '' : 's'}`)
      table(rock, RULES.map((r) => `day|${leadKey(lead, r.name)}`), false)
    }
  }
  console.log('')
}

const leadKey = (lead: number, rule: string) => `lead ${lead}|${rule}`

function table(rock: RockType, names: readonly string[], sortByPeirce: boolean): void {
  const pct = (a: number, b: number) => (b === 0 ? '—' : ((100 * a) / b).toFixed(1)).padStart(7)
  console.log(`  ${'source'.padEnd(30)}  miss%  false%  Peirce   hours  not dry`)
  const rows = names.flatMap((name) => {
    const t = tallies.get(`${rock}|${name}`)
    return t ? [{ name, t, peirce: t.hit / (t.hit + t.miss) - t.falseAlarm / (t.falseAlarm + t.correctDry) }] : []
  })
  if (sortByPeirce) rows.sort((a, b) => b.peirce - a.peirce)
  for (const { name, t, peirce } of rows) {
    const wet = t.hit + t.miss
    const dry = t.falseAlarm + t.correctDry
    const label = name.split('|').at(-1)!
    console.log(
      `  ${label.padEnd(30)}${pct(t.miss, wet)}${pct(t.falseAlarm, dry)}${peirce.toFixed(3).padStart(8)}${String(wet + dry).padStart(8)}${String(wet).padStart(9)}`,
    )
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
