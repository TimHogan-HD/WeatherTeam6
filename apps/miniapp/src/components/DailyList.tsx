import type { CSSProperties, ReactNode } from 'react'
import { colorsV2 } from '@weatherteam6/design/tokens'
import { EM_DASH, sunDayHours, type ForecastSnapshot, type HourlySample, type SkyDay } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, sectionV2 } from '../theme/styles.js'
import { formatTempDeg } from '../lib/format.js'
import { findToday } from '../lib/forecast.js'
import { scoredDays, shortDay, type DayReadings } from '../lib/overview.js'
import { scoreRampColor } from './charts/chartStyle.js'
import { Sect } from './charts/liquid.js'

/**
 * The Daily tab's **Seven days** list (owner, 2026-11-24: mockup
 * `docs/handoffs/design-mockups/daily-card-text.html`, score placement B with the
 * stat row). A day is two lines: its short name and date, the low and high on a
 * bar shared by the week, and the chance of rain; under them a row of labelled
 * stats — Score, Good, Rock, Sun. The score is the only colour on a row. No sky
 * icon, wind, rain amount or model dots (owner, 2026-11-24).
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
  'A day score is the worst hour of the best three-hour run inside your climbing hours (8 AM to 6 PM unless you change them on Profile); today counts only hours still ahead.'
const FOOT_BAR = 'The bar spans each day from low to high, on one scale for the week.'
const FOOT_CHANCE = 'Chance of rain is the highest hourly share of wet ensemble members.'
const FOOT_TAP = 'Tap a day for its hours.'
const FOOT_SUN = 'Sun is the hours of bright sunshine.'

/**
 * The note under the rows: the score's rule only where scores show, the sun's
 * meaning only where it shows, and "tap" only where a row opens.
 */
export function dailyFoot(scored: boolean, tappable: boolean, sun = false): string {
  return [scored ? FOOT_SCORE : null, FOOT_BAR, FOOT_CHANCE, sun ? FOOT_SUN : null, tappable ? FOOT_TAP : null]
    .filter((s) => s !== null)
    .join(' ')
}

export type DailyListProps = {
  days: readonly ForecastSnapshot[]
  /**
   * The per-day readings and alert state the score is read from, through
   * `summarizeReadings`. `null` for a city and while `/hourly` is in flight —
   * all of which draw rows with no Score, Good or Rock.
   */
  readings: DayReadings | null
  /** The hourly run's hours, for each day's chance of rain. Empty while the query is in flight or failed. */
  hours: readonly HourlySample[]
  /** The hourly response's sky days, for each day's sun. A day absent here shows the gap mark. */
  sky: readonly SkyDay[]
  /** Opens a day in the Hourly tab. Omitted when there is no hourly data at all. */
  onSelectDay?: (localDate: string) => void
  /** The dates the hourly response can actually draw. Omit when `onSelectDay` is omitted. */
  drawableDates?: ReadonlySet<string>
}

/** One fixed name column, so every day's temperature track starts and ends at the same x: one scale down the list. */
const rowGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '96px minmax(0, 1fr) 40px',
  columnGap: '12px',
  rowGap: '6px',
  alignItems: 'center',
  padding: '16px 0',
  borderBottom: `1px solid ${colorsV2.line}`,
  textAlign: 'left',
}

/** "Today" or the short weekday — "Wed" — and the date beside it, "Oct 21". */
export function dayHeading(isoDate: string, todayDate: string): { name: string; date: string } {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (y === undefined || m === undefined || d === undefined || ![y, m, d].every(Number.isFinite)) {
    return { name: isoDate, date: '' }
  }
  const at = new Date(Date.UTC(y, m - 1, d))
  return { name: shortDay(isoDate, todayDate), date: at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) }
}

/** A label over its value. Spans, not a `dl`: a row can be a `<button>`, which holds phrasing content only. */
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span style={typeV2.dailyStatLabel}>{label}</span>
      {children}
    </span>
  )
}

export function DailyList({ days, readings, hours, sky, onSelectDay, drawableDates }: DailyListProps) {
  const rows = [...days].sort((a, b) => a.forecast_date.localeCompare(b.forecast_date))
  // Joined on the date inside `scoredDays`, never on position.
  const scored = new Map(scoredDays(rows, readings).map((d) => [d.local_date, d]))
  // An older API's sky days carry no sun fields: then no row has a Sun stat rather than a gap mark.
  const sunShown = sky.some((d) => d.sun_windows !== undefined)
  const sunByDate = new Map(sky.filter((d) => d.sun_windows !== undefined).map((d) => [d.local_date, sunDayHours(d)]))
  const todayDate = findToday(rows)?.forecast_date ?? ''
  const crag = readings !== null
  // The same columns on every row, so each stat sits under the one above it.
  const statColumns = [crag ? '0.8fr 1fr 0.8fr' : null, sunShown ? '1.8fr' : null].filter((c) => c !== null).join(' ')

  // One scale for the week, so a bar's place says how warm the day is against the others.
  const temps = rows.flatMap((d) => [d.temp_c_min, d.temp_c_max]).filter((v): v is number => v !== null)
  const lo = temps.length === 0 ? 0 : Math.min(...temps)
  const span = temps.length === 0 ? 1 : Math.max(...temps) - lo || 1
  const pct = (c: number) => ((c - lo) / span) * 100
  return (
    <section style={sectionV2}>
      <Sect title="Seven days" aside="low–high · chance of rain" />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((day, i) => {
          const d = scored.get(day.forecast_date)
          if (d === undefined) return null
          const open = onSelectDay !== undefined && drawableDates?.has(day.forecast_date) === true ? () => onSelectDay(day.forecast_date) : null
          const sun = sunShown ? (sunByDate.get(day.forecast_date) ?? { value: EM_DASH, gap: true }) : null
          const chance = dayRainChance(hours, day.forecast_date)
          const { name, date } = dayHeading(day.forecast_date, todayDate)
          // Each row rises a step after the one above, and its bar grows out after it.
          const step = { '--wt6-i': i } as CSSProperties
          const bar =
            day.temp_c_min === null || day.temp_c_max === null ? null : (
              <i
                className="wt6-grow-x"
                style={{
                  ...step,
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
              <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px', whiteSpace: 'nowrap', minWidth: 0 }}>
                <span style={typeV2.dailyDay}>{name}</span>
                <span style={typeV2.dailyDate}>{date}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', ...typeV2.dailyFigure, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ width: '30px', textAlign: 'right', color: colorsV2.txtMuted }}>{formatTempDeg(day.temp_c_min)}</span>
                <span style={{ position: 'relative', flex: '1 1 auto', height: '5px', borderRadius: '3px', background: colorsV2.tempBarTrack }}>
                  {bar}
                </span>
                <span style={{ width: '30px', color: colorsV2.txt1 }}>{formatTempDeg(day.temp_c_max)}</span>
              </span>
              <span
                style={{
                  ...typeV2.dailyFigure,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  // A dry day's 0% steps back so a wet one stands out; it is still printed.
                  ...(chance === 0 ? { color: colorsV2.txtTab, fontWeight: 500 } : {}),
                }}
              >
                {chance === null ? EM_DASH : `${chance}%`}
              </span>
              {statColumns === '' ? null : (
                <span style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: statColumns, columnGap: '8px' }}>
                  {crag ? (
                    <>
                      <Stat label="Score">
                        <b
                          data-day-score=""
                          style={{
                            ...typeV2.dailyStatScore,
                            fontVariantNumeric: 'tabular-nums',
                            color: d.score === null ? colorsV2.txtMuted : scoreRampColor(d.score),
                          }}
                        >
                          {d.score ?? EM_DASH}
                        </b>
                      </Stat>
                      <Stat label="Good">
                        {/* An unread day reads a window of "None" from `summarizeReadings`: unknown, not no good hours. */}
                        <span data-day-good="" style={typeV2.dailyStatValue}>{d.score === null ? EM_DASH : (d.span ?? EM_DASH)}</span>
                      </Stat>
                      <Stat label="Rock">
                        <span data-day-rock="" style={typeV2.dailyStatValue}>{d.dryness ?? EM_DASH}</span>
                      </Stat>
                    </>
                  ) : null}
                  {sun === null ? null : (
                    <Stat label="Sun">
                      <span data-day-sun={sun.gap ? 'gap' : ''} style={typeV2.dailyStatValue}>{sun.value}</span>
                    </Stat>
                  )}
                </span>
              )}
            </>
          )
          const spoken = `${[name, date].filter((s) => s !== '').join(' ')}: ${!crag ? '' : d.score === null ? 'no score, ' : `score ${d.score}, `}low ${formatTempDeg(day.temp_c_min)}, high ${formatTempDeg(day.temp_c_max)}, ${chance === null ? 'chance of rain unknown' : `${chance}% chance of rain`}${!crag || d.score === null || d.span === null ? '' : d.span === 'None' ? ', no good hours' : `, good ${d.span}`}${!crag || d.dryness === null ? '' : `, rock ${d.dryness}`}${sun === null ? '' : sun.gap ? ', sun unknown' : `, sun ${sun.value}`}`
          const style = { ...step, ...(i === rows.length - 1 ? { ...rowGrid, borderBottom: 'none' } : rowGrid) }
          return open === null ? (
            <div key={day.forecast_date} className="wt6-rise" style={style}>
              {content}
            </div>
          ) : (
            <button
              key={day.forecast_date}
              type="button"
              onClick={open}
              aria-label={spoken}
              className="wt6-rise"
              style={{ ...bareButton, ...style }}
            >
              {content}
            </button>
          )
        })}
      </div>
      <p style={{ ...typeV2.keyRow, margin: '10px 0 0', lineHeight: '16px' }}>
        {dailyFoot(crag, onSelectDay !== undefined && rows.some((d) => drawableDates?.has(d.forecast_date) === true), sunShown)}
      </p>
      {onSelectDay === undefined ||
      drawableDates === undefined ||
      rows.every((d) => drawableDates.has(d.forecast_date)) ? null : (
        <p style={{ ...typeV2.keyRow, margin: '6px 0 0' }}>{"Days without an hour-by-hour forecast can't be opened."}</p>
      )}
    </section>
  )
}
