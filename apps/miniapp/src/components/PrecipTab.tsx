import type { ReactNode } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  formatPrecipIn,
  mmToIn,
  recentPrecipSource,
  REWETTING_PRECIP_MM,
  UNRECORDED_ASPECT_NOTE,
  type HourlyReadings,
  type RecentPrecip,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { cardV2, row, stack } from '../theme/styles.js'
import {
  clockOf,
  dayLabel,
  formatSince,
  hourGrid,
  isRealRain,
  precipDays,
  precipEvents,
  precipSummary,
  rockByStamp,
  runningTotal,
  type PrecipKind,
} from '../lib/precipHistory.js'
import { useNow } from '../hooks/useNow.js'
import { PrecipHourTable } from './PrecipHourTable.js'
import { PrecipRunningTotal } from './PrecipRunningTotal.js'
import { InlineError, Skeleton } from './States.js'

/**
 * The Precip tab: how long since the last real rain, the week's total and wet
 * hours, and every hour of the week as a day-by-hour grid.
 *
 * **Owner direction, 2026-09-29, from the round-2 Figma mocks** (V2 page,
 * "Precip tab — round 2"): concept 4's headline over concept 2's grid, with
 * the week's total and wet hours added. It replaces the Figma frame's tiles,
 * event list and daily bars, which read as a wall of pale blue and made the
 * reader assemble the answer from text.
 *
 * **"Real rain" is `REWETTING_PRECIP_MM` in an hour** — the line at which the
 * drying clock restarts — so the headline and Dryness never disagree about
 * when it last rained. A lighter shower since is shown in the grid and named
 * under the headline, but does not reset it: before this, a trace at noon read
 * as "last precip 4h" on a rock the clock had been drying for a day.
 *
 * **Colour marks precipitation only.** Text and chrome are neutral; the hour
 * table (`PrecipHourTable`) carries amount on one blue ramp.
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
  /**
   * `/hourly`'s readings and their clock, for the rock's state under the rain.
   * Absent for a city, and until `/hourly` answers — the tab then shows the
   * rain alone, never a row of "no reading".
   */
  rock?: { readings: HourlyReadings | undefined; utcOffsetSeconds: number }
}

const LOADING_H = 480
/** The runway's full length: past three days, the headline carries the number alone. */
const RUNWAY_HOURS = 72
const RUNWAY_TICKS = [0, 12, 24, 48, 72] as const
const RUNWAY_H = 6

const KIND_NAME: Record<PrecipKind, string> = { rain: 'rain', mix: 'rain and snow', snow: 'snow' }
function Card({ title, aside, gap, children }: { title?: string; aside?: string; gap: number; children: ReactNode }) {
  return (
    <section style={{ ...cardV2, ...stack(gap) }}>
      {title === undefined ? null : (
        <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={typeV2.cardTitle}>{title}</h2>
          {aside === undefined ? null : <span style={typeV2.aside}>{aside}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div style={{ ...stack(spacing.micro), flex: '1 1 0', minWidth: 0 }}>
      <span style={typeV2.tileLabel}>{label}</span>
      <span style={typeV2.tileFigure}>{value}</span>
      <span style={typeV2.note}>{note}</span>
    </div>
  )
}

/** How far along a 0–72 h track the time since the last real rain sits. */
function Runway({ hours }: { hours: number }) {
  const at = Math.min(hours, RUNWAY_HOURS) / RUNWAY_HOURS
  return (
    <div style={stack(spacing.chipGapMd)} aria-hidden>
      <div style={{ position: 'relative', height: `${RUNWAY_H}px`, borderRadius: `${radius.full}px`, backgroundColor: colorsV2.grid }}>
        <div
          style={{
            width: `${at * 100}%`,
            height: '100%',
            borderRadius: `${radius.full}px`,
            backgroundColor: colorsV2.txt2,
          }}
        />
      </div>
      <div style={{ position: 'relative', height: '14px' }}>
        {RUNWAY_TICKS.map((t) => {
          const x = (t / RUNWAY_HOURS) * 100
          const edge = t === 0 ? { left: 0 } : t === RUNWAY_HOURS ? { right: 0 } : { left: `${x}%`, transform: 'translateX(-50%)' }
          return (
            <span key={t} style={{ ...typeV2.axisTick, position: 'absolute', ...edge }}>
              {t === RUNWAY_HOURS ? `${t} h+` : `${t} h`}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function PrecipTab({ recent, isClimbingLocation, rock }: PrecipTabProps) {
  const now = useNow()

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
  /** `today 13:00`, `Mon 13:00`. */
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
    lastRealEvent === null
      ? null
      : `${lastRealEvent.endLocal === endingLocal ? 'this storm so far' : 'that storm left'} ${formatPrecipIn(lastRealEvent.totalMm)} over ${lastRealEvent.spanHours} h`
  const lastLight = lighterSince[lighterSince.length - 1]
  const lightMm = lighterSince.reduce((s, h) => s + h.precip_mm, 0)
  const todayHours = data.hours.filter((h) => h.valid_at_local.slice(0, 10) === today)
  const todayWet = todayHours.filter((h) => h.precip_mm > 0).length
  const running = runningTotal(days, data.hours)
  const realEvents = precipEvents(data.hours).filter((e) =>
    data.hours.some((h) => isRealRain(h) && e.startLocal < h.valid_at_local && h.valid_at_local <= e.endLocal),
  )
  const rockMap = rock === undefined ? null : rockByStamp(rock.readings, rock.utcOffsetSeconds)
  // Said once for the tab, as every surface does, when any rock state shown
  // could have read differently with the wall's aspect recorded.
  const aspectNote =
    rockMap !== null &&
    data.hours.some((h) => {
      const r = rockMap.get(h.valid_at_local)
      return r != null && !r.qualified
    })
  const flatFrom =
    lastReal === null || rainingNow
      ? null
      : (running.points.find((p) => p.validAtLocal === lastReal.valid_at_local)?.at ?? null)

  return (
    <>
      <Card gap={spacing.listGapLg}>
        {lastReal === null || hoursSinceReal === null ? (
          <div style={stack(spacing.tight)}>
            <span style={typeV2.factLabel}>Last real rain</span>
            <span style={typeV2.heroTemp}>None</span>
            <span style={typeV2.body}>
              No hour reached {threshold} during the past {days.length} days.
            </span>
          </div>
        ) : rainingNow ? (
          <div style={stack(spacing.tight)}>
            <span style={typeV2.factLabel}>Real {kindName} in the latest hour</span>
            <span style={typeV2.heroTemp}>Now</span>
            <span style={typeV2.body}>
              to {when(lastReal.valid_at_local)}
              {storm === null ? null : ` · ${storm}`}
            </span>
          </div>
        ) : (
          <div style={stack(spacing.tight)}>
            <span style={typeV2.factLabel}>Last real {kindName} ended</span>
            <div style={{ ...row(spacing.listGap), alignItems: 'baseline' }}>
              <span style={typeV2.heroTemp}>{hoursSinceReal < 48 ? hoursSinceReal : formatSince(hoursSinceReal)}</span>
              <span style={{ ...typeV2.bandValue, color: colorsV2.txt2 }}>
                {hoursSinceReal < 48 ? (hoursSinceReal === 1 ? 'hour ago' : 'hours ago') : 'ago'}
              </span>
            </div>
            <span style={typeV2.body}>
              {when(lastReal.valid_at_local)}
              {storm === null ? null : ` · ${storm}`}
            </span>
          </div>
        )}
        {hoursSinceReal === null || rainingNow ? null : <Runway hours={hoursSinceReal} />}
        {lastLight === undefined || lastReal === null ? null : (
          <p style={typeV2.note}>
            Lighter showers since ({formatPrecipIn(lightMm)}, last ending {when(lastLight.valid_at_local)}) — each hour
            under {threshold}, so they don&apos;t count.
          </p>
        )}
        <div
          style={{
            ...row(spacing.listGapLg),
            alignItems: 'flex-start',
            paddingTop: `${spacing.listGapLg}px`,
            borderTop: `1px solid ${colorsV2.line}`,
          }}
        >
          {/* A window that has not reached today has no today to total — a dash, not 0. */}
          <Stat
            label="Today"
            value={todayHours.length === 0 ? EM_DASH : formatPrecipIn(todayHours.reduce((s, h) => s + h.precip_mm, 0))}
            note={todayHours.length === 0 ? 'no hours yet' : `${todayWet} wet ${todayWet === 1 ? 'hour' : 'hours'}`}
          />
          <Stat label="This week" value={formatPrecipIn(summary.totalMm)} note={`over ${days.length} days`} />
          <Stat label="Wet this week" value={`${summary.wetHours} h`} note={`of ${data.hours.length}`} />
        </div>
      </Card>

      <Card title="Running total" aside="inches" gap={spacing.listGapLg}>
        <PrecipRunningTotal
          days={days}
          points={running.points}
          spanHours={running.spanHours}
          realEvents={realEvents}
          flatFrom={flatFrom}
          flatHours={flatFrom === null ? null : hoursSinceReal}
          rock={rockMap}
          today={today}
        />
      </Card>

      <Card title="Every hour" aside={`to ${summary.endingLocal === null ? EM_DASH : when(summary.endingLocal)}`} gap={spacing.listGapLg}>
        <PrecipHourTable days={days} grid={grid} points={running.points} rock={rockMap} today={today} />
      </Card>

      <p style={{ ...typeV2.note, padding: `0 ${spacing.listGapLg}px` }}>
        {source === null ? '' : `${source} `}Model estimates, not gauge readings. Real rain is {threshold} or more in an
        hour{isClimbingLocation ? ', the amount that restarts Dryness.' : '.'}
        {isClimbingLocation
          ? ' Shade, seepage, wind channeling and elevation can change conditions route-by-route. Inspect rock before climbing.'
          : null}
        {aspectNote ? ` ${UNRECORDED_ASPECT_NOTE}.` : null}
      </p>
    </>
  )
}
