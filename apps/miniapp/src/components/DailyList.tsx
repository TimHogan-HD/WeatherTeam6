import type { ReactNode } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import {
  formatPrecipIn,
  formatWindMph,
  type ForecastSnapshot,
  type HourlySample,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { cardV2, row, stack, wellV2 } from '../theme/styles.js'
import { formatTempDeg } from '../lib/format.js'
import { scoredDays, type DayReadings } from '../lib/overview.js'
import { DayRowShell, ScorePill } from './DayRow.js'
import { DropletIcon, WindIcon } from './Icons.js'

/**
 * The Daily tab, from the WT6 Figma "V2" page's `v2 Dark - Daily` frame: one
 * card, **Next 7 days**, holding a tinted row per day — the date and the day's
 * Crag A score as a pill, over three figure chips: the low and high, the chance
 * and amount of rain, and the peak wind.
 *
 * **This replaced the metric toggle and the shared-scale range bars**, which
 * the frame does not draw. The ensemble's spread is on the Hourly tab's day
 * charts; the rows carry figures.
 *
 * Rows are tappable and open that day in the Hourly tab. A day the hourly
 * response cannot draw is not tappable: `onSelectDay` is omitted for it rather
 * than opening an empty drill-down.
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

/**
 * The rain chip's text: `36% · 0.03 in`.
 *
 * The amount is `precip_mm_p50`, the median of the members' own daily totals —
 * a daily figure, never a sum of hourly percentiles. **With no wet count the
 * chance is left off rather than written as 0%**: `precip_chance_pct` is null
 * for an hour no member reached, and before `/hourly` answers there is no
 * hourly run at all. A zero there is a confidence nobody computed.
 */
export function rainChipText(day: ForecastSnapshot, hours: readonly HourlySample[]): string {
  const amount = formatPrecipIn(day.precip_mm_p50)
  const chance = dayRainChance(hours, day.forecast_date)
  return chance === null ? amount : `${chance}% · ${amount}`
}

/** What the three chips are, said once under the rows rather than on each. */
export const DAILY_KEY =
  'Low–high · rain chance and amount · peak wind'

export type DailyListProps = {
  days: readonly ForecastSnapshot[]
  /**
   * The per-day readings and alert state the score pill is read from, through
   * `summarizeReadings`. `null` for a city and while
   * `/hourly` is in flight — all of which draw rows without a pill.
   */
  readings: DayReadings | null
  /**
   * The hourly run's hours, for each day's chance of rain. Empty while the
   * query is in flight or failed, which leaves the chance off.
   */
  hours: readonly HourlySample[]
  /**
   * Opens a day in the Hourly tab. Omitted when there is no hourly data at all,
   * which makes every row plain rather than a button
   * that does nothing.
   */
  onSelectDay?: (localDate: string) => void
  /**
   * The dates the hourly response can actually draw. A date outside this set is
   * rendered but not tappable. Omit when `onSelectDay` is omitted.
   */
  drawableDates?: ReadonlySet<string>
}

function Chip({ icon, spoken, children }: { icon: ReactNode; spoken: string; children: ReactNode }) {
  return (
    <span
      role="img"
      aria-label={spoken}
      style={{
        ...wellV2,
        ...row(spacing.tight),
        flex: '0 0 auto',
        // Tighter than the frame's 8px sides so a 375px phone fits the three
        // chips on one line (measured: 273px row, widest row needs 270). At
        // 360px they still wrap, onto a second line rather than off the card.
        padding: `${spacing.listGapSm}px`,
      }}
    >
      {icon}
      {children}
    </span>
  )
}

export function DailyList({ days, readings, hours, onSelectDay, drawableDates }: DailyListProps) {
  const rows = [...days].sort((a, b) => a.forecast_date.localeCompare(b.forecast_date))
  // Joined on the date inside `scoredDays`, never on position: the forecast
  // rows and the readings' days are built by different paths.
  const scored = new Map(scoredDays(rows, readings).map((d) => [d.local_date, d]))

  return (
    <section style={{ ...cardV2, ...stack(spacing.cellPad) }}>
      <h2 style={typeV2.cardTitle}>
        Next {rows.length} {rows.length === 1 ? 'day' : 'days'}
      </h2>

      <div style={stack(spacing.listGapSm)}>
        {rows.map((day) => {
          const d = scored.get(day.forecast_date)
          // A date `dayTitle` cannot read is not a day anyone can be shown.
          if (d === undefined) return null
          const tappable =
            onSelectDay !== undefined && drawableDates?.has(day.forecast_date) === true
          const low = formatTempDeg(day.temp_c_min)
          const high = formatTempDeg(day.temp_c_max)
          const rain = rainChipText(day, hours)
          const wind = formatWindMph(day.wind_kmh_max)
          return (
            <DayRowShell
              key={day.forecast_date}
              score={d.score}
              onOpen={tappable ? () => onSelectDay(day.forecast_date) : null}
              style={stack(spacing.listGap)}
            >
              <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
                <span style={typeV2.rowTitle}>{d.title}</span>
                {/*
                  Absent rather than dashed with no score on screen — suppressed
                  under an alert (the banner says why), still loading, a city,
                  or past the readings. None of them is a score of nothing.
                */}
                {d.score === null ? null : <ScorePill score={d.score} />}
              </div>
              <div style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
                <Chip icon={null} spoken={`Low ${low}, high ${high}`}>
                  <span style={typeV2.dayChip}>{low}</span>
                  <span style={typeV2.dayChipStrong}>{high}</span>
                </Chip>
                <Chip icon={<DropletIcon color={colorsV2.txtMuted} />} spoken={`Rain: ${rain}`}>
                  <span style={typeV2.dayChip}>{rain}</span>
                </Chip>
                <Chip icon={<WindIcon color={colorsV2.txtMuted} />} spoken={`Peak wind ${wind}`}>
                  <span style={typeV2.dayChip}>{wind}</span>
                </Chip>
              </div>
            </DayRowShell>
          )
        })}
      </div>

      <span style={typeV2.note}>{DAILY_KEY}</span>

      {/*
        Why some rows do not open. Said once, under the list, rather than as a
        per-row marker: the reason is the same for all of them.
        A string expression so it keeps the straight apostrophe every other
        message in this app uses.
      */}
      {onSelectDay === undefined ||
      drawableDates === undefined ||
      rows.every((d) => drawableDates.has(d.forecast_date)) ? null : (
        <span style={typeV2.note}>{"Days without an hour-by-hour forecast can't be opened."}</span>
      )}
    </section>
  )
}
