/**
 * **How far ahead can a trip day's forecast be trusted, and which rain chance
 * should a trip tile show?** Measured on what the trip recorder already stored.
 *
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run compare:trip-lead --workspace=apps/api
 *
 * Read-only. It reads `trip_day_records` (what the forecast said, at each lead),
 * `trip_day_outcomes` (the model's look back at the day), `trip_day_gauges` (the
 * nearest airport gauge, where there is one) and `feedback` forecast checks
 * (what climbers saw), and prints three tables:
 *
 * 1. **Score drift by lead.** For each lead 1-6, how far the day's score moved
 *    before the day itself (mean move, share moving `BIG_MOVE_POINTS` or more)
 *    and how far it sat from the look back's score. Where the move flattens is
 *    how far out a trip score is worth reading.
 * 2. **Which rain chance** (`scoring-findings.md` §6e). Brier of the tile's
 *    `members_wet` chance against the stricter `members_rewet`, on the same
 *    days, at each lead, against two truths: the look back's rain and the
 *    gauge's. A day is wet at `MEASURABLE_PRECIP_MM` and again at
 *    `REWETTING_PRECIP_MM`, the two chances' own thresholds. Lower wins; the
 *    tile switches only if the stricter chance wins on the gauge.
 * 3. **Checks against the forecast.** Each forecast check at a crag on a
 *    recorded day, by what the climber saw, against the latest score at least a
 *    day ahead.
 *
 * **Caveats, before reading any number.** The sample is one owner and a few
 * friends: a lead with tens of days says little, and every cell prints its
 * `n`. The look back is the model's analysis, so table 1's error and table 2's
 * model truth score the model against itself. A gauge is one point up to 25 km
 * from the crag, and a day with an hour unreported has no gauge truth. Red Wing
 * has no usable gauge (`STUCK_GAUGES`).
 *
 * console rather than the logger is deliberate: this is an operator-facing CLI.
 */
import { MEASURABLE_PRECIP_MM, REWETTING_PRECIP_MM, parseNumericRequired } from '@weatherteam6/types'
import { nearestGauge } from '../lib/weather/asosGauge.js'
import {
  checkLocalDate,
  checksAgainstForecast,
  lastAtEachLead,
  rainChanceComparison,
  scoreDrift,
  type CheckOnDay,
  type DayTruth,
} from './tripLead.js'

const SCORED_LEADS = [1, 2, 3, 4, 5, 6]
const CHANCE_LEADS = [0, 1, 2, 3, 4, 5, 6]

const fmt = (v: number | null, digits = 1) => (v === null ? '—' : v.toFixed(digits))
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)

async function main(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('\nMissing DATABASE_URL — the Neon pooled connection string (Neon dashboard > project > Connect).\n')
    process.exit(2)
  }
  const { db, pool } = await import('../db/index.js')
  const { feedback, locations, tripDayGauges, tripDayOutcomes, tripDayRecords } = await import('../db/schema.js')
  const { eq } = await import('drizzle-orm')

  try {
    const [records, outcomes, gauges, places, checks] = await Promise.all([
      db
        .select({
          location_id: tripDayRecords.location_id,
          local_date: tripDayRecords.local_date,
          recorded_at: tripDayRecords.recorded_at,
          lead_days: tripDayRecords.lead_days,
          score: tripDayRecords.score,
          members_wet: tripDayRecords.members_wet,
          member_count: tripDayRecords.member_count,
          members_rewet: tripDayRecords.members_rewet,
          rewet_member_count: tripDayRecords.rewet_member_count,
        })
        .from(tripDayRecords),
      db.select().from(tripDayOutcomes),
      db.select().from(tripDayGauges),
      db.select({ id: locations.id, lat: locations.lat, lon: locations.lon }).from(locations),
      db
        .select({
          location_id: feedback.location_id,
          observed_at: feedback.observed_at,
          observed_conditions: feedback.observed_conditions,
        })
        .from(feedback)
        .where(eq(feedback.kind, 'forecast'))
        .then((rows) => rows.filter((r) => r.location_id !== null)),
    ])

    const gaugeOf = new Map(
      places.map((p) => {
        const lat = parseNumericRequired(p.lat)
        const lon = parseNumericRequired(p.lon)
        return [p.id, { lon, gauge: nearestGauge(lat, lon) }] as const
      }),
    )
    const gaugeRain = new Map(gauges.map((g) => [`${g.station}|${g.local_date}`, g.rain_mm]))

    const truths: DayTruth[] = outcomes.map((o) => {
      const g = gaugeOf.get(o.location_id)?.gauge ?? null
      return {
        location_id: o.location_id,
        local_date: o.local_date,
        outcome_score: o.score,
        outcome_rain_mm: o.rain_mm,
        gauge_rain_mm: g === null ? null : (gaugeRain.get(`${g.station}|${o.local_date}`) ?? null),
      }
    })
    const byDay = lastAtEachLead(records)

    console.log(
      `\n${records.length} recordings over ${byDay.size} crag-days, ${outcomes.length} looked back on, ` +
        `${truths.filter((t) => t.gauge_rain_mm !== null).length} with a whole gauge day, ${checks.length} forecast checks.`,
    )

    console.log('\n1. Score drift: the day’s score at each lead against the day itself and the look back')
    console.log('lead    n  mean move  moved ≥20    n  mean error')
    for (const r of scoreDrift(byDay, truths, SCORED_LEADS)) {
      console.log(
        `${String(r.lead).padStart(4)} ${String(r.n).padStart(4)} ${fmt(r.meanMove).padStart(10)} ${pct(r.bigMoveShare).padStart(10)} ` +
          `${String(r.nOutcome).padStart(4)} ${fmt(r.meanError).padStart(11)}`,
      )
    }

    for (const wetMm of [MEASURABLE_PRECIP_MM, REWETTING_PRECIP_MM]) {
      console.log(`\n2. Which rain chance, a day wet at ${wetMm} mm (Brier, lower is better; same days for both)`)
      console.log('truth  lead    n  wet  members_wet  members_rewet')
      for (const r of rainChanceComparison(byDay, truths, CHANCE_LEADS, wetMm)) {
        console.log(
          `${r.truth.padEnd(5)} ${String(r.lead).padStart(5)} ${String(r.n).padStart(4)} ${String(r.wet).padStart(4)} ` +
            `${fmt(r.brierWet, 3).padStart(12)} ${fmt(r.brierRewet, 3).padStart(14)}`,
        )
      }
    }

    const onDays: CheckOnDay[] = checks.flatMap((c) => {
      const place = c.location_id === null ? undefined : gaugeOf.get(c.location_id)
      if (c.location_id === null || place === undefined || c.observed_at === null || c.observed_conditions === null) return []
      const local_date = checkLocalDate(c.observed_at, place.gauge?.tz ?? null, place.lon)
      return byDay.has(`${c.location_id}|${local_date}`)
        ? [{ location_id: c.location_id, local_date, observed: c.observed_conditions }]
        : []
    })
    console.log(`\n3. Forecast checks on recorded days (${onDays.length}), by what the climber saw, against the latest score a day or more ahead`)
    console.log('saw       n  ≥80  50-79  <50  unscored')
    for (const r of checksAgainstForecast(byDay, onDays)) {
      console.log(
        `${r.observed.padEnd(6)} ${String(r.n).padStart(4)} ${String(r.good).padStart(4)} ${String(r.fair).padStart(6)} ` +
          `${String(r.poor).padStart(4)} ${String(r.unscored).padStart(9)}`,
      )
    }
    console.log('')
  } finally {
    await pool.end()
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
