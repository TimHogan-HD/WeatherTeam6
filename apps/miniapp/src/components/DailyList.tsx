import type { CSSProperties } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import {
  DRYNESS_LABEL,
  EM_DASH,
  formatPrecipIn,
  formatWindMph,
  skyDayIcon,
  type ForecastSnapshot,
  type HourlySample,
  type SkyDay,
} from '@weatherteam6/types'
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
export const DAILY_FOOT =
  'A day score is the worst hour of the best three-hour run between 8 AM and 6 PM; today counts only hours still ahead. Chance of rain is the highest hourly share of wet ensemble members. Rain is the median daily amount. Tap a day for its hours.'

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
}

const rowGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '24px minmax(0, 1fr) 44px 104px 38px',
  columnGap: '8px',
  rowGap: '2px',
  alignItems: 'center',
  padding: '8px 0',
  minHeight: '56px',
  borderBottom: `1px solid ${colorsV2.line}`,
  textAlign: 'left',
}

export function DailyList({ days, readings, hours, sky, onSelectDay, drawableDates }: DailyListProps) {
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

  return (
    <section style={{ ...cardV2, padding: `${spacing.sectionGap}px 14px 14px` }}>
      <Sect title="Seven days" aside={readings === null ? 'low–high · chance of rain' : 'score · low–high · chance of rain'} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((day, i) => {
          const d = scored.get(day.forecast_date)
          if (d === undefined) return null
          const open = onSelectDay !== undefined && drawableDates?.has(day.forecast_date) === true ? () => onSelectDay(day.forecast_date) : null
          const summary = skyByDate.get(day.forecast_date) ?? null
          const chance = dayRainChance(hours, day.forecast_date)
          const name = shortDay(day.forecast_date, todayDate)
          const sub = [
            d.window === null ? null : `Good hours: ${d.window}`,
            d.dryness === null ? null : `${DRYNESS_LABEL}: ${d.dryness}`,
            `rain ${formatPrecipIn(day.precip_mm_p50)}`,
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
      <p style={{ ...typeV2.keyRow, margin: '10px 0 0', lineHeight: '16px' }}>{DAILY_FOOT}</p>
      {onSelectDay === undefined ||
      drawableDates === undefined ||
      rows.every((d) => drawableDates.has(d.forecast_date)) ? null : (
        <p style={{ ...typeV2.keyRow, margin: '6px 0 0' }}>{"Days without an hour-by-hour forecast can't be opened."}</p>
      )}
    </section>
  )
}
