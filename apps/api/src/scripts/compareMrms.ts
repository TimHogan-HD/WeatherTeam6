/**
 * **Is MRMS radar rain worth reading?** Scored the way `compare:dryness` scores
 * rain sources: the real Crag A clock run once per source, daytime hours only
 * (08-18 local), every source on the same hours.
 *
 * `tsx src/scripts/compareMrms.ts <mrms.jsonl>...` — the cache `collectMrms.ts` wrote.
 *
 * Two questions, two references:
 *
 * 1. **At the airport, against its gauge.** Is MRMS a measurement? Caveat: MRMS
 *    Pass2 is bias-corrected against gauges, possibly this one, so agreement
 *    here is partly by construction.
 * 2. **At the crag, against MRMS there.** If MRMS is right at the crag, how
 *    wrong is the shipped four-model median — and how wrong is the airport
 *    gauge `compare:dryness` uses as its truth, moved to the crag?
 *
 * Network only — no database.
 */
import { readFileSync } from 'node:fs'
import type { RockType } from '@weatherteam6/types'
import { evaluateCragA, rockLevelA } from '../lib/scoring/cragModel.js'
import type { RockLevel, WeatherHour } from '../lib/scoring/hourlyConditions.js'
import {
  DETERMINISTIC_MODELS,
  fetchDeterministicHourly,
  fetchWithRetry,
  localTimeToUtc,
} from '../lib/weather/openMeteo.js'
import { rainMedian } from '../lib/weather/rainMedian.js'
import { MRMS_PAIRS } from './mrmsPoints.js'

const PAST_DAYS = 90
const WARMUP_HOURS = 7 * 24
const DAY_FIRST_HOUR = 8
const DAY_LAST_HOUR = 18
const ROCKS: RockType[] = ['quartzite', 'sandstone', 'limestone']
const WET_MM = 0.1

type HourKey = string
const hourKey = (d: Date): HourKey => d.toISOString().slice(0, 13)
type Rain = (key: HourKey) => number | null

async function text(url: string): Promise<string> {
  const res = await fetchWithRetry(url)
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`)
  return res.text()
}

/** Same reading of the IEM gauge as `compare:dryness`. */
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
    const end = new Date(`${valid.replace(' ', 'T')}:00Z`)
    end.setUTCMinutes(0)
    end.setUTCHours(end.getUTCHours() + 1)
    const mm = p01i === 'M' ? null : p01i === 'T' ? 0.1 : Number(p01i) * 25.4
    const key = hourKey(end)
    if (rain.get(key) == null) rain.set(key, mm)
  }
  return { rain, lat, lon }
}

/** GFS weather and the shipped rain median at one point. */
async function modelled(lat: number, lon: number) {
  const det = await fetchDeterministicHourly({ lat, lon, elevation_m: null }, DETERMINISTIC_MODELS, 1, PAST_DAYS)
  const thermal = det.models.find((m) => m.model === 'gfs_seamless')
  if (!thermal) throw new Error('gfs_seamless did not answer')
  const utc = (local: string) => localTimeToUtc(local, det.utc_offset_seconds)
  const shipped = new Map<HourKey, number | null>()
  for (const [local, mm] of rainMedian(det)?.byLocal ?? []) {
    const when = utc(local)
    if (when) shipped.set(hourKey(when), mm)
  }
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
  return { base, shipped }
}

type Tally = { hit: number; miss: number; falseAlarm: number; correctDry: number }
const tally = () => ({ hit: 0, miss: 0, falseAlarm: 0, correctDry: 0 })
function add(t: Tally, truthWet: boolean, sourceWet: boolean): void {
  if (truthWet) {
    if (sourceWet) t.hit++
    else t.miss++
  } else if (sourceWet) t.falseAlarm++
  else t.correctDry++
}
const peirce = (t: Tally) => t.hit / (t.hit + t.miss) - t.falseAlarm / (t.falseAlarm + t.correctDry)
const pct = (a: number, b: number) => (b === 0 ? '—' : ((100 * a) / b).toFixed(1)).padStart(7)
function row(name: string, t: Tally): string {
  const wet = t.hit + t.miss
  const dry = t.falseAlarm + t.correctDry
  return `  ${name.padEnd(34)}${pct(t.miss, wet)}${pct(t.falseAlarm, dry)}${peirce(t).toFixed(3).padStart(8)}${String(wet + dry).padStart(8)}${String(wet).padStart(9)}`
}
const HEADER = `  ${'source'.padEnd(34)}  miss%  false%  Peirce   hours  not dry`

/** One clock comparison: truth and sources over the same scored hours. */
function score(
  into: Map<string, Tally>,
  base: Awaited<ReturnType<typeof modelled>>['base'],
  lat: number,
  lon: number,
  truth: Rain,
  sources: [string, Rain][],
  rock: RockType,
): void {
  const levels = (rain: Rain): (RockLevel | null)[] =>
    evaluateCragA(base.map((b) => ({ ...b.weather, precip_mm: rain(b.key) })), { rockType: rock, lat, lon }).map((h) =>
      rockLevelA(h.diagnostics.wetness_factor, rock),
    )
  const t = levels(truth)
  const s = sources.map(([, r]) => levels(r))
  base.forEach((b, i) => {
    if (i < WARMUP_HOURS || b.localHour < DAY_FIRST_HOUR || b.localHour > DAY_LAST_HOUR) return
    const ti = t[i]
    if (ti == null || s.some((l) => l[i] == null)) return
    sources.forEach(([name], si) => {
      const k = `${rock}|${name}`
      const tl = into.get(k) ?? tally()
      add(tl, ti !== 'dry', s[si]![i] !== 'dry')
      into.set(k, tl)
    })
  })
}

async function run(): Promise<void> {
  const files = process.argv.slice(2)
  if (!files.length) throw new Error('usage: compareMrms <mrms.jsonl>...')
  const crag = MRMS_PAIRS.map(() => new Map<HourKey, number | null>())
  const airport = MRMS_PAIRS.map(() => new Map<HourKey, number | null>())
  let hours = 0
  let absent = 0
  for (const f of files)
    for (const line of readFileSync(f, 'utf8').trim().split('\n')) {
      const r = JSON.parse(line) as { hour: string; crag: (number | null)[]; airport: (number | null)[] }
      hours++
      if (r.crag.every((v) => v === null)) absent++
      MRMS_PAIRS.forEach((_, i) => {
        crag[i]!.set(r.hour, r.crag[i] ?? null)
        airport[i]!.set(r.hour, r.airport[i] ?? null)
      })
    }

  const to = new Date()
  const from = new Date(to.getTime() - PAST_DAYS * 86_400_000)
  console.log(`\n=== compare:mrms — MRMS Pass2 radar rain, past ${PAST_DAYS} days, ${hours} hourly files (${absent} absent) ===\n`)

  const atAirport = new Map<string, Tally>()
  const atCrag = new Map<string, Tally>()
  const perCrag: string[] = []
  const raw = { both: 0, gaugeOnly: 0, mrmsOnly: 0, neither: 0, gaugeMm: 0, mrmsMm: 0 }
  const gauges = new Map<string, Awaited<ReturnType<typeof gauge>>>()
  const airportModels = new Map<string, Awaited<ReturnType<typeof modelled>>>()

  for (const [i, pair] of MRMS_PAIRS.entries()) {
    try {
      const g = gauges.get(pair.station) ?? (await gauge(pair.station, from, to))
      gauges.set(pair.station, g)
      if (!Number.isFinite(g.lat)) throw new Error('no gauge reports')
      const gaugeRain: Rain = (k) => g.rain.get(k) ?? null
      const mAirport: Rain = (k) => airport[i]!.get(k) ?? null
      const mCrag: Rain = (k) => crag[i]!.get(k) ?? null

      const firstForStation = !airportModels.has(pair.station)
      const ap = airportModels.get(pair.station) ?? (await modelled(g.lat, g.lon))
      airportModels.set(pair.station, ap)
      const cr = await modelled(pair.lat, pair.lon)

      if (firstForStation) {
        // Raw hourly agreement, airport gauge vs MRMS at the airport.
        for (const [k, mm] of g.rain) {
          const m = mAirport(k)
          if (mm === null || m === null) continue
          const gw = mm >= WET_MM
          const mw = m >= WET_MM
          if (gw && mw) raw.both++
          else if (gw) raw.gaugeOnly++
          else if (mw) raw.mrmsOnly++
          else raw.neither++
          raw.gaugeMm += mm
          raw.mrmsMm += m
        }
        for (const rock of ROCKS)
          score(atAirport, ap.base, g.lat, g.lon, gaugeRain, [
            ['MRMS at the airport', mAirport],
            ['median, global (shipped)', (k) => ap.shipped.get(k) ?? null],
          ], rock)
      }

      const local = new Map<string, Tally>()
      for (const rock of ROCKS) {
        const sources: [string, Rain][] = [
          ['median, global (shipped)', (k) => cr.shipped.get(k) ?? null],
          ['airport gauge, moved to crag', gaugeRain],
          ['MRMS at airport, moved to crag', mAirport],
        ]
        score(atCrag, cr.base, pair.lat, pair.lon, mCrag, sources, rock)
        if (rock === 'quartzite') score(local, cr.base, pair.lat, pair.lon, mCrag, sources, rock)
      }
      const km = Math.hypot((pair.lat - g.lat) * 111, (pair.lon - g.lon) * 111 * Math.cos((pair.lat * Math.PI) / 180))
      const wetCrag = [...crag[i]!.values()].filter((v) => v !== null && v >= WET_MM).length
      const q = (n: string) => local.get(`quartzite|${n}`)
      const sh = q('median, global (shipped)')
      const ag = q('airport gauge, moved to crag')
      perCrag.push(
        `  ${pair.crag.padEnd(26)}${pair.station.padEnd(5)}${km.toFixed(0).padStart(4)} km ${String(wetCrag).padStart(5)}` +
          (sh ? `${pct(sh.miss, sh.hit + sh.miss)}${pct(sh.falseAlarm, sh.falseAlarm + sh.correctDry)}` : '') +
          (ag ? `${pct(ag.miss, ag.hit + ag.miss)}${pct(ag.falseAlarm, ag.falseAlarm + ag.correctDry)}` : ''),
      )
    } catch (err) {
      perCrag.push(`  ${pair.crag.padEnd(26)}${pair.station.padEnd(5)} skipped: ${(err as Error).message}`)
    }
  }

  const wet = raw.both + raw.gaugeOnly
  console.log('  1a. Raw hourly rain, MRMS at the airport vs the airport gauge (wet = ≥0.1 mm)')
  console.log(`      gauge-wet hours MRMS caught: ${pct(raw.both, wet)}%   MRMS-wet hours the gauge called dry: ${pct(raw.mrmsOnly, raw.both + raw.mrmsOnly)}%`)
  console.log(`      totals: gauge ${raw.gaugeMm.toFixed(0)} mm, MRMS ${raw.mrmsMm.toFixed(0)} mm over ${raw.both + raw.gaugeOnly + raw.mrmsOnly + raw.neither} paired hours\n`)

  const table = (title: string, m: Map<string, Tally>) => {
    console.log(`  ${title}`)
    for (const rock of ROCKS) {
      console.log(`\n  ${rock}\n${HEADER}`)
      ;[...m.entries()]
        .filter(([k]) => k.startsWith(`${rock}|`))
        .sort((a, b) => peirce(b[1]) - peirce(a[1]))
        .forEach(([k, t]) => console.log(row(k.split('|')[1]!, t)))
    }
    console.log('')
  }
  table('1b. Drying clock at the airport — truth: the airport gauge', atAirport)
  table('2. Drying clock at the crag — truth: MRMS at the crag', atCrag)
  console.log('  Per crag, quartzite — truth: MRMS at the crag')
  console.log(`  ${'crag'.padEnd(26)}${'gauge'.padEnd(5)}  dist wet h  shipped miss/false   airport-gauge miss/false`)
  for (const l of perCrag) console.log(l)
  console.log('')
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
