import type { CSSProperties } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  formatPrecipIn,
  formatWindMph,
  skyDayIcon,
  type ForecastSnapshot,
  type HourlyReading,
  type HourlySample,
  type SkyDay,
} from '@weatherteam6/types'
import { dayStrip, type StripHour } from '../lib/dayStrip.js'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, cardV2 } from '../theme/styles.js'
import { formatTempDeg } from '../lib/format.js'
import { findToday } from '../lib/forecast.js'
import { scoredDays, shortDay, type DayReadings } from '../lib/overview.js'
import { scoreRampColor } from './charts/chartStyle.js'
import { Sect } from './charts/liquid.js'
import { SkyIcon } from './Icons.js'

/**
 * The Daily tab in the hybrid look (`docs/handoffs/design-mockups/weatherteam6-hybrid.html`,
 * `dailyTab`): one glass card, **Seven days**, a row per day — the sky, the
 * day's name, its score, the low and high on a bar shared by the week, and
 * the chance of rain; under them the good hours, Dryness, rain amount and
 * peak wind.
 *
 * Rows open that day in the Hourly tab. A day the hourly response cannot draw
 * is not tappable: `onSelectDay` is omitted for it rather than opening an
 * empty drill-down.
 */

/**
 * The day's chance of rain at its likeliest hour, 0-100, or `null`.
 *
 * **The peak, and it is labelled as a share of the runs rather than as a daily
 * probability.** `precip_chance_pct` is `members_wet / member_count` for one
 * hour; the chance of rain *at some point* in a day is a larger number that
 * nothing in the response computes, because different members can be wet in
 * different hours. Taking the maximum is the closest honest figure and it is
 * never an overstatement.
 */
export function dayRainChance(
  hours: readonly HourlySample[],
  localDate: string,
): number | null {
  const chances = hours
    .filter((h) => h.local_date === localDate)
    .map((h) => h.precip_chance_pct)
    .filter((v): v is number => v !== null)
  return chances.length === 0 ? null : Math.round(Math.max(...chances))
}

/** What the rows are, said once under them. */
const FOOT_SCORE =
  'A day score is the worst hour of the best three-hour run between 8 AM and 6 PM; today counts only hours still ahead.'
const FOOT_FIGURES = 'Chance of rain is the highest hourly share of wet ensemble members. Rain is the median daily amount.'
const FOOT_TAP = 'Tap a day for its hours.'
const FOOT_STRIP_SCORE = 'The strip under each day is its 24 hours, coloured by the score of each hour; an empty cell is an hour with no score.'
const FOOT_STRIP_RAIN = 'The strip under each day is its 24 hours, shaded by the chance of rain in each hour; an empty cell is an hour with no figure.'

/**
 * The note under the rows: the score's rule only where scores show, the strip's
 * meaning only where strips draw, and "tap" only where a row opens.
 */
export function dailyFoot(scored: boolean, tappable: boolean, strips = false): string {
  return [
    scored ? FOOT_SCORE : null,
    FOOT_FIGURES,
    strips ? (scored ? FOOT_STRIP_SCORE : FOOT_STRIP_RAIN) : null,
    tappable ? FOOT_TAP : null,
  ]
    .filter((s) => s !== null)
    .join(' ')
}

export type DailyListProps = {
  days: readonly ForecastSnapshot[]
  /**
   * The per-day readings and alert state the score is read from, through
   * `summarizeReadings`. `null` for a city and while `/hourly` is in flight —
   * all of which draw rows with no score.
   */
  readings: DayReadings | null
  /** The hourly run's hours, for each day's chance of rain. Empty while the query is in flight or failed. */
  hours: readonly HourlySample[]
  /** The hourly response's sky days. A day absent here, or with a null summary, shows no sky rather than a guess. */
  sky: readonly SkyDay[]
  /** Opens a day in the Hourly tab. Omitted when there is no hourly data at all. */
  onSelectDay?: (localDate: string) => void
  /** The dates the hourly response can actually draw. Omit when `onSelectDay` is omitted. */
  drawableDates?: ReadonlySet<string>
  /**
   * The hourly run's per-hour readings and its offset, for the strip under
   * each day. Omitted, or a `null` offset, draws no strips.
   */
  hourReadings?: readonly HourlyReading[]
  utcOffsetSeconds?: number | null
}

const rowGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '24px minmax(0, 1fr) 44px 104px 38px',
  columnGap: '8px',
  rowGap: '4px',
  alignItems: 'center',
  padding: '12px 0',
  minHeight: '56px',
  borderBottom: `1px solid ${colorsV2.line}`,
  textAlign: 'left',
}

const AXIS = [
  ['12a', 0],
  ['6a', 6],
  ['12p', 12],
  ['6p', 18],
] as const

/** 24 cells, one per local hour; an hour the run does not carry is an empty cell. */
function HourStrip({ strip, scored }: { strip: readonly StripHour[]; scored: boolean }) {
  const byHour = new Map(strip.map((s) => [s.hour, s]))
  return (
    <span aria-hidden="true" style={{ gridColumn: '2 / -1', display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: '2px', height: '8px' }}>
      {Array.from({ length: 24 }, (_, hour) => {
        const h = byHour.get(hour)
        const value = scored ? (h?.score ?? null) : (h?.chancePct ?? null)
        // An unread hour is an outline; a measured 0% is the solid track, never the same mark.
        const style: CSSProperties =
          value === null
            ? { boxShadow: `inset 0 0 0 1px ${colorsV2.line}` }
            : scored
              ? { background: scoreRampColor(value) }
              : value === 0
                ? { background: colorsV2.tempBarTrack }
                : { background: colorsV2.rain, opacity: Math.max(0.2, value / 100) }
        return <i key={hour} style={{ borderRadius: '2px', ...style }} />
      })}
    </span>
  )
}

export function DailyList({ days, readings, hours, sky, onSelectDay, drawableDates, hourReadings, utcOffsetSeconds }: DailyListProps) {
  const rows = [...days].sort((a, b) => a.forecast_date.localeCompare(b.forecast_date))
  // Joined on the date inside `scoredDays`, never on position.
  const scored = new Map(scoredDays(rows, readings).map((d) => [d.local_date, d]))
  const skyByDate = new Map(sky.map((d) => [d.local_date, d.summary]))
  const todayDate = findToday(rows)?.forecast_date ?? ''

  // One scale for the week, so a bar's place says how warm the day is against the others.
  const temps = rows.flatMap((d) => [d.temp_c_min, d.temp_c_max]).filter((v): v is number => v !== null)
  const lo = temps.length === 0 ? 0 : Math.min(...temps)
  const span = temps.length === 0 ? 1 : Math.max(...temps) - lo || 1
  const pct = (c: number) => ((c - lo) / span) * 100
  const offset = utcOffsetSeconds ?? null
  const strips = offset !== null && hours.length > 0
  const hasScores = readings !== null

  return (
    <section style={{ ...cardV2, padding: `${spacing.sectionGap}px 14px 14px` }}>
      <Sect title="Seven days" aside={readings === null ? 'low–high · chance of rain' : 'score · low–high · chance of rain'} />
      {strips ? (
        <div aria-hidden="true" style={{ ...rowGrid, padding: '0 0 2px', minHeight: 0 }}>
          <span style={{ gridColumn: '2 / -1', position: 'relative', height: '12px', ...typeV2.axisTick }}>
            {AXIS.map(([label, h]) => (
              <span key={label} style={{ position: 'absolute', left: `${((h / 24) * 100).toFixed(2)}%`, top: 0 }}>
                {label}
              </span>
            ))}
          </span>
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((day, i) => {
          const d = scored.get(day.forecast_date)
          if (d === undefined) return null
          const open = onSelectDay !== undefined && drawableDates?.has(day.forecast_date) === true ? () => onSelectDay(day.forecast_date) : null
          const summary = skyByDate.get(day.forecast_date) ?? null
          const chance = dayRainChance(hours, day.forecast_date)
          const name = shortDay(day.forecast_date, todayDate)
          // The mockup's `best 11a–2p · Dry · 0 in · peak wind 20 mph`. "good", not "best": the
          // span is the day's good hours, not the three-hour run its score comes from.
          const sub = [
            d.span === null ? null : d.span === 'None' ? 'no good hours' : `good ${d.span.toLowerCase()}`,
            d.dryness,
            formatPrecipIn(day.precip_mm_p50),
            `peak wind ${formatWindMph(day.wind_kmh_max)}`,
          ].filter((s): s is string => s !== null)
          const bar =
            day.temp_c_min === null || day.temp_c_max === null ? null : (
              <i
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${pct(day.temp_c_min).toFixed(1)}%`,
                  right: `${(100 - pct(day.temp_c_max)).toFixed(1)}%`,
                  borderRadius: '3px',
                  background: `linear-gradient(90deg, ${colorsV2.tempBarCool}, ${colorsV2.tempBarWarm})`,
                }}
              />
            )
          const content = (
            <>
              {summary === null ? <span /> : <SkyIcon sky={skyDayIcon(summary)} size={22} />}
              <span style={typeV2.dayName}>{name}</span>
              <b
                data-day-score=""
                style={{
                  ...typeV2.dayScore,
                  textAlign: 'center',
                  color: d.score === null ? colorsV2.txtMuted : scoreRampColor(d.score),
                }}
              >
                {readings === null ? '' : (d.score ?? EM_DASH)}
              </b>
              <span style={{ position: 'relative', ...typeV2.axisTick, height: '22px' }}>
                <span style={{ position: 'absolute', left: 0, top: '-5px', color: colorsV2.txtMuted }}>{formatTempDeg(day.temp_c_min)}</span>
                <span style={{ position: 'absolute', right: 0, top: '-5px', color: colorsV2.txt1 }}>{formatTempDeg(day.temp_c_max)}</span>
                <span
                  style={{
                    position: 'absolute',
                    left: '26px',
                    right: '26px',
                    top: '12px',
                    height: '6px',
                    borderRadius: '3px',
                    background: colorsV2.tempBarTrack,
                  }}
                >
                  {bar}
                </span>
              </span>
              <span style={{ ...typeV2.dayChance, textAlign: 'right' }}>{chance === null ? EM_DASH : `${chance}%`}</span>
              {strips && offset !== null ? (
                <HourStrip strip={dayStrip(hours, hourReadings ?? [], day.forecast_date, offset, readings)} scored={hasScores} />
              ) : null}
              <span style={{ ...typeV2.rowSmall, gridColumn: '2 / -1' }}>{sub.join(' · ')}</span>
            </>
          )
          const spoken = `${name}: ${d.score === null ? 'no score' : `score ${d.score}`}, low ${formatTempDeg(day.temp_c_min)}, high ${formatTempDeg(day.temp_c_max)}, ${chance === null ? 'chance of rain unknown' : `${chance}% chance of rain`}`
          const style = i === rows.length - 1 ? { ...rowGrid, borderBottom: 'none' } : rowGrid
          return open === null ? (
            <div key={day.forecast_date} style={style}>
              {content}
            </div>
          ) : (
            <button key={day.forecast_date} type="button" onClick={open} aria-label={spoken} style={{ ...bareButton, ...style }}>
              {content}
            </button>
          )
        })}
      </div>
      <p style={{ ...typeV2.keyRow, margin: '10px 0 0', lineHeight: '16px' }}>
        {dailyFoot(hasScores,onSelectDay !== undefined && rows.some((d) => drawableDates?.has(d.forecast_date) === true), strips)}
      </p>
      {onSelectDay === undefined ||
      drawableDates === undefined ||
      rows.every((d) => drawableDates.has(d.forecast_date)) ? null : (
        <p style={{ ...typeV2.keyRow, margin: '6px 0 0' }}>{"Days without an hour-by-hour forecast can't be opened."}</p>
      )}
    </section>
  )
}
