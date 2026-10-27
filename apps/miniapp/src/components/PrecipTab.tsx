import { useState, type ReactNode } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  MEASURABLE_PRECIP_MM,
  formatPrecipIn,
  mmToIn,
  recentPrecipSource,
  REWETTING_PRECIP_MM,
  UNRECORDED_ASPECT_NOTE,
  type HourlyReadings,
  type HourlySample,
  type RecentPrecip,
  type RockType,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { row, stack } from '../theme/styles.js'
import {
  clockOf,
  dayLabel,
  formatSince,
  hourGrid,
  precipDays,
  precipSummary,
  rockByStamp,
  runningTotal,
  type PrecipKind,
} from '../lib/precipHistory.js'
import { dryAgain, drynessNow, type DryAgain } from '../lib/rockReadings.js'
import { dryHours } from '../lib/hourlyDay.js'
import { dayChance } from '../lib/overview.js'
import { formatLocalHour } from '../lib/format.js'
import { useNow } from '../hooks/useNow.js'
import { DAY_SCALES, RainChart, sectCard } from './charts/DayCharts.js'
import { Sect, timeAxis } from './charts/liquid.js'
import { DryingClock } from './DryingClock.js'
import { PrecipHourTable } from './PrecipHourTable.js'
import { Stats, type Stat } from './StatTiles.js'
import { InlineError, Skeleton } from './States.js'

/**
 * The Precip tab in the hybrid look (`docs/handoffs/design-mockups/weatherteam6-hybrid.html`,
 * `precipTab`; owner 2026-10-19): the drying clock beside the last real rain,
 * then today, this week and when the rock is dry again; every hour of the past
 * week as a grid; the next 48 hours; and each day's wettest hour.
 *
 * **The running-total chart is gone** (owner, 2026-10-19). The week's total is
 * a tile; the grid carries each day's.
 *
 * **"Real rain" is `REWETTING_PRECIP_MM` in an hour** — rain heavy enough
 * that the score reads 0 while it falls. A lighter shower since is shown in the
 * grid and named under the headline; it sets drying back by its size
 * (`WETTING_PRECIP_MM` and up) but does not move the headline.
 *
 * **The past is the four models' median; the next 48 hours are the ensemble
 * mean.** Two sources, so each card names its own, and the footnote both.
 */

export type PrecipTabProps = {
  recent: {
    data: RecentPrecip | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
  }
  /** The caveat names rock only where there is rock. */
  isClimbingLocation: boolean
  /** The saved rock type, for the drying clock. `null` draws no clock. */
  rockType: RockType | null
  /**
   * `/hourly`'s readings and their clock, for the rock's state under the rain.
   * Absent for a city, and until `/hourly` answers — the tab then shows the
   * rain alone, never a row of "no reading".
   */
  rock?: { readings: HourlyReadings | undefined; utcOffsetSeconds: number }
  /** `/hourly`'s hours, for the next 48 hours and each day. Empty while it loads. */
  hours: readonly HourlySample[]
  utcOffsetSeconds: number | null
}

const LOADING_H = 480
const HOUR_MS = 3_600_000
const AHEAD_HOURS = 48

const KIND_NAME: Record<PrecipKind, string> = { rain: 'rain', mix: 'rain and snow', snow: 'snow' }
const FALLING_NOW: Record<PrecipKind, string> = { rain: 'Raining now', mix: 'Rain and snow now', snow: 'Snowing now' }

function Card({ title, aside, children }: { title?: string; aside?: string; children: ReactNode }) {
  return (
    <section style={{ ...sectCard, ...stack(spacing.listGapLg) }}>
      {title === undefined ? null : <Sect title={title} aside={aside ?? null} />}
      {children}
    </section>
  )
}

/** The headline: a figure large, its unit beside it, and a line under. */
function Headline({ label, figure, unit, note }: { label: string; figure: string; unit?: string; note: ReactNode }) {
  return (
    <div style={{ ...stack(spacing.tight), minWidth: 0 }}>
      <span style={typeV2.statLabel}>{label}</span>
      <div style={{ ...row(spacing.listGapSm), alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={typeV2.heroTemp}>{figure}</span>
        {unit === undefined ? null : <span style={{ ...typeV2.bandValue, color: colorsV2.txt2 }}>{unit}</span>}
      </div>
      <span style={typeV2.rowSmall}>{note}</span>
    </div>
  )
}

/** The hours of `hours` from the one covering now through the next 48. */
function hoursAhead(hours: readonly HourlySample[], nowMs: number): HourlySample[] {
  const from = Math.floor(nowMs / HOUR_MS) * HOUR_MS
  return hours.filter((h) => {
    const t = Date.parse(h.valid_at)
    return Number.isFinite(t) && t >= from && t < from + AHEAD_HOURS * HOUR_MS
  })
}

export function PrecipTab({ recent, isClimbingLocation, rockType, rock, hours, utcOffsetSeconds }: PrecipTabProps) {
  const now = useNow()
  const ahead = hoursAhead(hours, now)
  const [readMs, setReadMs] = useState<number | null>(null)

  if (recent.isPending) return <Skeleton height={LOADING_H} />
  if (recent.isError) {
    return <InlineError message="Couldn't load the precipitation history." onRetry={recent.refetch} />
  }
  if (recent.data === undefined) return null

  const data = recent.data
  const days = precipDays(data.hours)
  if (days.length === 0) {
    // The call answered with no hours — a gap in the record, not a dry week.
    return <p style={typeV2.body}>No precipitation history for this location yet.</p>
  }

  const source = recentPrecipSource(data.models)
  const summary = precipSummary(data, now)
  const grid = hourGrid(days, data.hours)
  const offset = Number.isFinite(data.utc_offset_seconds) ? data.utc_offset_seconds : 0
  const today = new Date(now + offset * 1000).toISOString().slice(0, 10)
  /** `today 1pm`, `Mon 1pm`. */
  const when = (validAtLocal: string) => {
    const label = dayLabel(validAtLocal, today)
    return `${label === 'Today' ? 'today' : label} ${clockOf(validAtLocal)}`
  }

  const { lastReal, hoursSinceReal, lastRealEvent, lighterSince, endingLocal } = summary
  const kindName = lastRealEvent?.kind == null ? 'precipitation' : KIND_NAME[lastRealEvent.kind]
  const threshold = `${mmToIn(REWETTING_PRECIP_MM).toFixed(2)} in`
  // Real rain in the window's newest hour is rain falling now, not rain that
  // "ended 0 hours ago"; a storm reaching that hour is still going.
  const rainingNow = lastReal !== null && lastReal.valid_at_local === endingLocal
  const storm =
    lastRealEvent === null ? null : `${formatPrecipIn(lastRealEvent.totalMm)} over ${lastRealEvent.spanHours} h`
  const lastLight = lighterSince[lighterSince.length - 1]
  const lightMm = lighterSince.reduce((s, h) => s + h.precip_mm, 0)
  const todayHours = data.hours.filter((h) => h.valid_at_local.slice(0, 10) === today)
  const todayWet = todayHours.filter((h) => h.precip_mm > 0).length
  const running = runningTotal(days, data.hours)
  const rockMap = rock === undefined ? null : rockByStamp(rock.readings, rock.utcOffsetSeconds)
  // Said once for the tab, as every surface does, when any rock state shown
  // could have read differently with the wall's aspect recorded.
  const aspectNote =
    rockMap !== null &&
    data.hours.some((h) => {
      const r = rockMap.get(h.valid_at_local)
      return r != null && !r.qualified
    })

  const dryness = rock === undefined ? null : drynessNow(rock.readings, now)
  const again = rock === undefined ? null : dryAgain(rock.readings, now)
  const hoursWord = (n: number) => `${n} ${n === 1 ? 'hour' : 'hours'} with rain`

  const tiles: Stat[] = [
    // A window that has not reached today has no today to total — a dash, not 0.
    {
      label: 'Today',
      value: todayHours.length === 0 ? EM_DASH : formatPrecipIn(todayHours.reduce((s, h) => s + h.precip_mm, 0)),
      note: todayHours.length === 0 ? 'no hours yet' : hoursWord(todayWet),
    },
    { label: 'This week', value: formatPrecipIn(summary.totalMm), note: hoursWord(summary.wetHours) },
    ...(rock === undefined ? [] : [dryAgainTile(again, rock.utcOffsetSeconds, today)]),
  ]

  const headline =
    lastReal === null || hoursSinceReal === null ? (
      <Headline
        label="Last rain"
        figure="None"
        // "None" counts only rain heavy enough to reset drying; a lighter shower is still named.
        note={`in the past ${days.length} days${data.hours.some((h) => h.precip_mm > 0) ? ' · light showers only' : ''}`}
      />
    ) : rainingNow ? (
      <Headline
        label={lastRealEvent?.kind == null ? 'Precipitation now' : FALLING_NOW[lastRealEvent.kind]}
        figure={lastRealEvent === null ? 'Now' : formatPrecipIn(lastRealEvent.totalMm)}
        note={lastRealEvent === null ? `to ${when(lastReal.valid_at_local)}` : `so far, over ${lastRealEvent.spanHours} h`}
      />
    ) : (
      <Headline
        label={`Last ${kindName}`}
        // Whole days past two days, as the mockup's `2 days ago`; the clock beside it carries the hours.
        figure={String(hoursSinceReal < 48 ? hoursSinceReal : Math.floor(hoursSinceReal / 24))}
        unit={hoursSinceReal < 48 ? (hoursSinceReal === 1 ? 'hour ago' : 'hours ago') : 'days ago'}
        note={`${when(lastReal.valid_at_local)}${storm === null ? '' : ` · ${storm}`}`}
      />
    )

  const first = ahead[0]
  const last = ahead[ahead.length - 1]
  const instants = ahead.map((h) => Date.parse(h.valid_at))
  const axis = first === undefined || last === undefined ? null : timeAxis(Date.parse(first.valid_at), Math.max(Date.parse(last.valid_at), Date.parse(first.valid_at) + HOUR_MS), DAY_SCALES)
  const read = readMs !== null && instants.includes(readMs) ? readMs : (instants[0] ?? null)

  return (
    <>
      <Card>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {rockType === null || !isClimbingLocation ? null : (
            <DryingClock
              hours={hoursSinceReal}
              rockType={rockType}
              dryness={dryness}
              label={
                hoursSinceReal === null
                  ? `Drying clock: no real rain in ${days.length} days`
                  : `Drying clock: ${formatSince(hoursSinceReal)} since real rain`
              }
            />
          )}
          <div style={{ flex: 1, minWidth: 0, ...stack(spacing.micro) }}>
            {headline}
            {lastLight === undefined || lastReal === null ? null : (
              <span style={typeV2.rowSmall}>
                Light showers since: {formatPrecipIn(lightMm)}, last {when(lastLight.valid_at_local)}
              </span>
            )}
          </div>
        </div>
        <div style={{ paddingTop: `${spacing.listGapLg}px`, borderTop: `1px solid ${colorsV2.line}` }}>
          <Stats items={tiles} />
        </div>
      </Card>

      <Card title="Every hour" aside={`past week · to ${endingLocal === null ? EM_DASH : when(endingLocal)}`}>
        <PrecipHourTable days={days} grid={grid} points={running.points} rock={rockMap} today={today} />
      </Card>

      {axis === null || utcOffsetSeconds === null ? null : (
        <Card title="Next 48 hours" aside="ensemble mean · drag to read">
          <RainChart
            axis={axis}
            instants={instants}
            utcOffsetSeconds={utcOffsetSeconds}
            nowMs={now}
            read={{ ms: read, onRead: setReadMs }}
            hours={ahead}
            dry={
              dryHours(ahead)
                ? { title: 'Dry for 48 hours', note: '0% in every hour: no ensemble member has measurable rain.' }
                : null
            }
          />
        </Card>
      )}

      {utcOffsetSeconds === null ? null : <ByDay hours={hours} today={today} utcOffsetSeconds={utcOffsetSeconds} />}

      <p style={{ ...typeV2.note, padding: `0 ${spacing.listGapLg}px` }}>
        {source === null ? '' : `${source} `}Rain here means {threshold} or more in an hour
        {isClimbingLocation ? '; lighter showers set drying back by less. Check the rock before you climb.' : '.'}
        {aspectNote ? ` ${UNRECORDED_ASPECT_NOTE}.` : null} Ahead, amounts are the ensemble mean; the shaded band is
        the 10th to 90th percentile for one hour and is never added up. Chance of rain is the share of wet ensemble
        members.
      </p>
    </>
  )
}

/** When the rock is dry again, as a tile. A gap is a dash, never `Now`. */
function dryAgainTile(again: DryAgain | null, utcOffsetSeconds: number, today: string): Stat {
  if (again === null) return { label: 'Dry again', value: EM_DASH, note: 'no rock reading' }
  if (again.kind === 'now') return { label: 'Dry again', value: 'Now', note: 'rock is dry', color: colorsV2.goodInk }
  const localDate = (ms: number) => new Date(ms + utcOffsetSeconds * 1000).toISOString().slice(0, 10)
  if (again.kind === 'not-in-forecast') {
    return { label: 'Dry again', value: 'Not yet', note: `not by ${dayLabel(localDate(again.throughMs), today)}` }
  }
  const day = dayLabel(localDate(again.ms), today)
  return {
    label: 'Dry again',
    value: formatLocalHour(again.ms, utcOffsetSeconds) ?? EM_DASH,
    note: day === 'Today' ? 'today, on this forecast' : `${day}, on this forecast`,
  }
}

/**
 * Each day ahead: its chance of rain at the likeliest hour, and its wettest
 * hour by the ensemble mean with that hour's p90. One hour's percentile only —
 * never summed (`.claude/rules/weather.md`).
 */
function ByDay({ hours, today, utcOffsetSeconds }: { hours: readonly HourlySample[]; today: string; utcOffsetSeconds: number }) {
  const dates = [...new Set(hours.map((h) => h.local_date))].filter((d) => d >= today).sort()
  if (dates.length === 0) return null
  return (
    <Card title="By day" aside="chance of rain · wettest hour">
      <div style={stack(0)}>
        {dates.map((date, i) => {
          const dayHours = hours.filter((h) => h.local_date === date && h.precip_mm_mean !== null)
          const wettest = dayHours.reduce<HourlySample | null>(
            (m, h) => (m === null || (h.precip_mm_mean ?? 0) > (m.precip_mm_mean ?? 0) ? h : m),
            null,
          )
          const chance = dayChance(hours, date)
          const wet = wettest !== null && (wettest.precip_mm_mean ?? 0) >= MEASURABLE_PRECIP_MM
          return (
            <div
              key={date}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                rowGap: '2px',
                padding: '10px 0',
                borderTop: i === 0 ? 'none' : `1px solid ${colorsV2.line}`,
              }}
            >
              <span style={typeV2.dayPick}>{dayLabel(date, today)}</span>
              <b style={{ ...typeV2.dayChance, color: colorsV2.rainMark, textAlign: 'right' }}>
                {chance === null ? EM_DASH : `${chance}%`}
              </b>
              <small style={{ ...typeV2.rowSmall, gridColumn: '1 / -1' }}>
                {wettest === null
                  ? 'No hourly amounts for this day'
                  : wet
                    ? `Wettest hour ${formatLocalHour(Date.parse(wettest.valid_at), utcOffsetSeconds) ?? EM_DASH}: ${formatPrecipIn(wettest.precip_mm_mean)} mean · p90 ${formatPrecipIn(wettest.precip_mm_p90)}`
                    : 'No hour with measurable rain in the mean'}
              </small>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
