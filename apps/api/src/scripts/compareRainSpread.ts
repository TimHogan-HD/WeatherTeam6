/**
 * **Should a day's score read one rain forecast, or each model's? Measured against rain gauges.**
 *
 * `npm run compare:rain-spread --workspace=apps/api` (append `-- DLL POU` for only those stations)
 *
 * The owner's Oct 24/25 Red Wing trip read 100 both days three and four days out
 * while the ensemble's chance of rain climbed to 68%. The score runs the drying
 * clock once, on the median of the four global models' rain (`rainMedian`), so
 * when two models put a shower in the day and two keep it dry, the median keeps
 * it dry and the day scores as if no model had rain. This asks whether running
 * the clock on **each model's own rain** and combining the four day scores
 * would have said better what happened.
 *
 * **Why four models and not the 143-member ensemble.** Open-Meteo keeps no
 * past ensemble runs (`run=` answers "not available" for every date back to
 * April 2026), so there is nothing to score a member-based day against. The
 * Previous Runs API keeps what each global model forecast 1-7 days ahead, and
 * four models that disagree are the same question at a smaller size. A result
 * here is evidence for the idea, not a measurement of the ensemble.
 *
 * For each ASOS station over the past `PAST_DAYS`, per rock and lead time, it
 * runs the real Crag A clock (`evaluateCragA`) on the gauge's rain (the truth),
 * on the shipped median of the four models' rain as forecast that many days
 * ahead, and on each model's own rain alone. Every other input is
 * `gfs_seamless`'s analysis, so only the rain differs. A day's score is
 * `dayRepresentative`'s, as a day tile shows it, and a day is **dry** when the
 * rock at that hour is dry. Every candidate is scored on the same days.
 *
 * - **MAE / bias** — the day score against the gauge's day score. Bias above 0
 *   is a forecast that promised more than the day gave.
 * - **Brier** — the chance the day is dry, against whether it was: 0 is
 *   perfect. A single forecast's chance is 0 or 1; four models' is their share.
 * - **≥80 wet%** — of the days the candidate scored at least `GOOD`, the share
 *   whose rock was not dry. The error the owner hit.
 * - **≥80 bad%** — of the same days, the share the gauge scored below `BAD`:
 *   a planned day that was not worth the drive, whatever the rock's word.
 * - **good kept%** — of the days the gauge scored at least `GOOD`, the share
 *   the candidate also scored that high. The cost of being cautious.
 *
 * A second table takes the shipped score's good days and splits them by how
 * many of the four models' own clocks had the rock not dry: whether a
 * disagreeing model is a warning worth showing.
 *
 * The gauge caveats in `compare:dryness` hold. Network only — no database.
 *
 * **First run (2026-10-21, 17 stations, 2026-07-23 to 10-21).** The four
 * models' share of dry days beat the single forecast's yes/no on Brier at
 * every rock and lead, by a quarter to a half. The mean of the four day scores
 * was as close to the gauge's score as the shipped one (MAE within a point or
 * so) and cut the good-scored days that came out below 50 on limestone and
 * sandstone at 3-4 days by a third to two thirds, at the cost of 8-19 points
 * of good days kept. Worst
 * of four and "× share dry" were too cautious. When the shipped score was ≥80
 * and all four clocks had the rock dry, it came out not dry 1-7% of the time
 * at 1-4 days; when one clock disagreed, 8-40%; two or more, mostly 25-90%.
 * Not decided: whether the app adopts any of it.
 */
import type { RockType } from '@weatherteam6/types'
import { dayRepresentative, evaluateCragA, rockLevelA } from '../lib/scoring/cragModel.js'
import type { WeatherHour } from '../lib/scoring/hourlyConditions.js'
import { fetchDeterministicHourly, localTimeToUtc } from '../lib/weather/openMeteo.js'
import { gauge, hourKey, previousRuns, shippedMedian, STATIONS, type HourKey } from './rainGauges.js'

const PAST_DAYS = 90
/** The clock treats its first hour as soaked; a week clears every rock type's window. */
const WARMUP_DAYS = 7
const LEADS = [1, 2, 3, 4, 5, 6] as const
const ROCKS: RockType[] = ['quartzite', 'sandstone', 'limestone', 'carbonate_cherty']
/** A score a reader would plan a day on. */
const GOOD = 80
/** A score a reader would not drive for. */
const BAD = 50

type Day = { score: number; dry: boolean }
type Forecast = { score: number; pDry: number }

const CANDIDATES = ['median rain (shipped)', 'mean of 4 scores', 'worst of 4', 'shipped × share dry'] as const
type Candidate = (typeof CANDIDATES)[number]

function combine(median: Day, models: readonly Day[]): Record<Candidate, Forecast> {
  const scores = models.map((m) => m.score)
  const shareDry = models.filter((m) => m.dry).length / models.length
  return {
    'median rain (shipped)': { score: median.score, pDry: median.dry ? 1 : 0 },
    'mean of 4 scores': { score: scores.reduce((a, b) => a + b, 0) / scores.length, pDry: shareDry },
    'worst of 4': { score: Math.min(...scores), pDry: shareDry === 1 ? 1 : 0 },
    'shipped × share dry': { score: median.score * shareDry, pDry: shareDry },
  }
}

type Tally = { n: number; absErr: number; bias: number; brier: number; called: number; calledWet: number; calledBad: number; good: number; goodKept: number; wet: number }
const tallies = new Map<string, Tally>()
const blank = (): Tally => ({ n: 0, absErr: 0, bias: 0, brier: 0, called: 0, calledWet: 0, calledBad: 0, good: 0, goodKept: 0, wet: 0 })

/** Shipped score ≥ GOOD, split by how many models' own clocks said not dry: [days, not-dry days, days below BAD]. */
const split = new Map<string, [number, number, number]>()

function tally(key: string, f: Forecast, truth: Day): void {
  const t = tallies.get(key) ?? blank()
  t.n++
  t.absErr += Math.abs(f.score - truth.score)
  t.bias += f.score - truth.score
  t.brier += (f.pDry - (truth.dry ? 1 : 0)) ** 2
  if (!truth.dry) t.wet++
  if (f.score >= GOOD) {
    t.called++
    if (!truth.dry) t.calledWet++
    if (truth.score < BAD) t.calledBad++
  }
  if (truth.score >= GOOD) {
    t.good++
    if (f.score >= GOOD) t.goodKept++
  }
  tallies.set(key, t)
}

async function run(): Promise<void> {
  const to = new Date()
  const from = new Date(to.getTime() - PAST_DAYS * 86_400_000)
  console.log(`\n=== compare:rain-spread — one rain forecast or four, against ASOS gauges, past ${PAST_DAYS} days ===\n`)

  const only = process.argv.slice(2).map((s) => s.toUpperCase())
  for (const [station, near] of STATIONS.filter(([id]) => only.length === 0 || only.includes(id))) {
    try {
      const { rain: gauged, lat, lon } = await gauge(station, from, to)
      if (!Number.isFinite(lat)) throw new Error('no reports')
      const det = await fetchDeterministicHourly({ lat, lon, elevation_m: null }, ['gfs_seamless'], 1, PAST_DAYS)
      const thermal = det.models.find((m) => m.model === 'gfs_seamless')
      if (!thermal) throw new Error('gfs_seamless did not answer')
      const runs = await previousRuns(lat, lon, from, to, LEADS)

      const base = thermal.hours.flatMap((h) => {
        const when = localTimeToUtc(h.valid_at_local, det.utc_offset_seconds)
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
        return [{ key: hourKey(when), localDate: h.valid_at_local.slice(0, 10), weather }]
      })
      const warmEnd = base[WARMUP_DAYS * 24]?.localDate ?? ''

      /** Per local date past the warm-up, the day as a tile reads it; absent when it has no score. */
      const days = (rain: (k: HourKey) => number | null, rock: RockType): Map<string, Day> => {
        const hours = evaluateCragA(
          base.map((b) => ({ ...b.weather, precip_mm: rain(b.key) })),
          { rockType: rock, lat, lon },
        )
        const byDate = new Map<string, typeof hours>()
        base.forEach((b, i) => {
          if (b.localDate > warmEnd) byDate.set(b.localDate, [...(byDate.get(b.localDate) ?? []), hours[i]!])
        })
        const out = new Map<string, Day>()
        for (const [date, day] of byDate) {
          const rep = dayRepresentative(day, det.utc_offset_seconds)
          if (rep?.score == null) continue
          out.set(date, { score: rep.score, dry: rockLevelA(rep.diagnostics.wetness_factor, rock) === 'dry' })
        }
        return out
      }

      let wetDays = 0
      for (const rock of ROCKS) {
        const truth = days((k) => gauged.get(k) ?? null, rock)
        for (const lead of LEADS) {
          const byModel = runs.get(lead)!
          if (byModel.size < 4) continue
          const median = shippedMedian(byModel)
          const medianDays = days((k) => median.get(`${k}:00`) ?? null, rock)
          const modelDays = [...byModel.values()].map((s) => days((k) => s.get(k) ?? null, rock))
          for (const [date, t] of truth) {
            const m = medianDays.get(date)
            const each = modelDays.map((d) => d.get(date))
            if (!m || each.some((d) => !d)) continue
            const forecasts = combine(m, each as Day[])
            for (const c of CANDIDATES) tally(`${rock}|${lead}|${c}`, forecasts[c], t)
            if (m.score >= GOOD) {
              const k = `${rock}|${lead}|${each.filter((d) => !d!.dry).length}`
              const s = split.get(k) ?? [0, 0, 0]
              split.set(k, [s[0] + 1, s[1] + (t.dry ? 0 : 1), s[2] + (t.score < BAD ? 1 : 0)])
            }
            if (rock === 'sandstone' && lead === 1 && !t.dry) wetDays++
          }
        }
      }
      console.log(`  ${station.padEnd(4)} ${near.padEnd(20)} ${String(wetDays).padStart(3)} days the gauge left sandstone not dry`)
    } catch (err) {
      console.log(`  ${station.padEnd(4)} ${near.padEnd(20)} skipped: ${(err as Error).message}`)
    }
  }

  const pct = (a: number, b: number) => (b === 0 ? '—' : ((100 * a) / b).toFixed(1)).padStart(9)
  for (const rock of ROCKS) {
    console.log(`\n  ${rock}`)
    for (const lead of LEADS) {
      const first = tallies.get(`${rock}|${lead}|${CANDIDATES[0]}`)
      if (!first) continue
      console.log(`\n    lead ${lead} d — ${first.n} days, ${first.wet} not dry on the gauge`)
      console.log(`    ${'candidate'.padEnd(24)}    MAE    bias   Brier  ≥80 days  ≥80 wet%  ≥80 bad%  good kept%`)
      for (const c of CANDIDATES) {
        const t = tallies.get(`${rock}|${lead}|${c}`)!
        console.log(
          `    ${c.padEnd(24)}${(t.absErr / t.n).toFixed(1).padStart(7)}${(t.bias / t.n).toFixed(1).padStart(8)}` +
            `${(t.brier / t.n).toFixed(3).padStart(8)}${String(t.called).padStart(10)}${pct(t.calledWet, t.called)}${pct(t.calledBad, t.called).padStart(10)}${pct(t.goodKept, t.good).padStart(12)}`,
        )
      }
    }
  }

  console.log(`\n=== the shipped score's good days (≥${GOOD}), by how many models' own clocks had the rock not dry; bad% is the gauge scoring below ${BAD} ===`)
  for (const rock of ROCKS) {
    console.log(`\n  ${rock}       ${[0, 1, 2, 3, 4].map((k) => `${k} wet: days wet% bad%`.padStart(22)).join('')}`)
    for (const lead of LEADS) {
      const cells = [0, 1, 2, 3, 4].map((k) => {
        const [n, wet, bad] = split.get(`${rock}|${lead}|${k}`) ?? [0, 0, 0]
        return `${String(n).padStart(11)}${pct(wet, n).slice(-6)}${pct(bad, n).slice(-5)}`
      })
      console.log(`    lead ${lead} d    ${cells.join('')}`)
    }
  }
  console.log('')
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
