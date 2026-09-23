import type { ReactNode } from 'react'
import { colors, spacing } from '@weatherteam6/design/tokens'
import {
  formatHumidity,
  formatTempF,
  formatWindMph,
  type ConditionsScore,
  type ForecastSnapshot,
  type HourlyReading,
  type HourlySample,
  type HourlySeries,
} from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { card, row, stack } from '../theme/styles.js'
import { findToday } from '../lib/forecast.js'
import { useNow } from '../hooks/useNow.js'
import { currentHour } from './charts/hourlySeries.js'
import { tempColor } from './charts/chartStyle.js'
import { ReadingsSection } from './ReadingsSection.js'
import { Measurements } from './Measurements.js'
import { InlineError, Skeleton } from './States.js'

/**
 * **"Now", in one place.** It was three: a now-line card with the temperature,
 * a readings card under it with its own `Conditions now` label, and the facts
 * each drew from nowhere at all. Two cards about the same moment read as two
 * claims, and a reader had to work out that the 88°F in one and the
 * `Friction: Poor` in the other were the same hour.
 *
 * One card, one label, three parts, in this order:
 *
 * 1. **The weather** — the hour covering now, and the day's labelled high and
 *    low. From the hourly run and the forecast.
 * 2. **The readings** — `Dryness`, `Friction`, `Score`, and the day's window.
 *    From `/conditions`, the same response the list card reads, so a crag
 *    cannot show one reading on the list and another here.
 * 3. **The measurements** — collapsed; what 1 and 2 were read off. See
 *    `Measurements`.
 *
 * **The two data halves still fail independently.** They are different
 * requests and a failed forecast says nothing about the rock, so each half
 * carries its own loading, error and empty state *inside* the card rather than
 * one failure taking the block down — §5's no-takeover rule, one level in.
 *
 * **The readings half is optional, and its absence is the caller's decision.**
 * It is absent on the `/add` preview (nothing is classified yet), for a
 * non-climbing location (a rock reading for a city is meaningless), and on the
 * Hourly tab (a reading of today at the top of a screen showing Saturday is a
 * claim about the wrong day). This component does not re-derive any of that.
 */

export const CONDITIONS_NOW_LABEL = 'Conditions now'

/** The space a still-loading half holds open, so the card does not jump. */
const WEATHER_H = 32
const READINGS_H = 90

export type ConditionsNowProps = {
  /** Today's row, for the high and low. */
  forecast: {
    data: ForecastSnapshot[] | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
  }
  /**
   * The hourly run, for the hour covering now and the model it came from.
   * Absent on the preview, which has no saved row for `/hourly` to read.
   */
  series: HourlySeries | undefined
  /** The readings half. Absent where there is no reading to show — see above. */
  conditions?: {
    /** A 200 with `data: null` is the documented "no row for today", not an error. */
    data: ConditionsScore | null | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
  }
  /**
   * Whether the alerts query is still in flight. **The number waits for it**:
   * `severeAlertEvent` is `null` for a query in flight exactly as it is for
   * "no severe alert" (defect class 7).
   */
  alertsPending: boolean
  severeAlertEvent: string | null
}

/**
 * The present temperature, the hour's wind, humidity and cloud, and the day's
 * high and low — what `NowLine` was, without a card of its own.
 *
 * **Everything is labelled as what it is.** `now` is the hour of the run
 * covering this moment; `High`/`Low` are the day's extremes. The two are never
 * merged into one unlabelled number, and the high is never borrowed for "now".
 */
function NowWeather({ hour, today }: { hour: HourlySample | null; today: ForecastSnapshot | null }) {
  // Each part is omitted when missing rather than dashed: this is a line of
  // conditions, and a dash inside one reads as a broken screen where a shorter
  // line reads as less to say. The measurements panel below dashes its gaps,
  // because there a gap between two figures is itself the information.
  const meta = [
    hour?.wind_kmh == null ? null : formatWindMph(hour.wind_kmh),
    hour?.humidity_pct == null ? null : `RH ${formatHumidity(hour.humidity_pct)}`,
    hour?.cloud_pct == null ? null : `cloud ${Math.round(hour.cloud_pct)}%`,
  ].filter((s): s is string => s !== null)

  return (
    <div style={{ ...row(spacing.cellPad), flexWrap: 'wrap' }}>
      {/*
        The present temperature, or nothing at all. A run that does not reach
        this hour has no "now" to show, and putting the daily high in the slot
        is the §3 factual error this line was built to stop.
      */}
      {hour?.temp_c == null ? null : (
        <span style={{ ...type.bigStat, fontSize: '22px', color: tempColor(hour.temp_c) }}>
          {formatTempF(hour.temp_c)}
        </span>
      )}

      {meta.length === 0 ? null : (
        <span style={{ ...type.bodySm, flex: 1, minWidth: '110px' }}>{meta.join(' · ')}</span>
      )}

      {/*
        **Labelled, always.** Ours can be alone on the line — a pending hourly
        query, the preview, a run that does not reach this hour — and then a
        bare `103°F 79°F` at the top of the screen with `temp_c_max` first is
        the §3 error distinguished only by opacity.
      */}
      {today === null ? null : (
        <span style={{ ...row(spacing.chipGap), ...type.calDay }}>
          <span style={type.labelSm}>High</span>
          <span style={{ color: colors.txt1 }}>{formatTempF(today.temp_c_max)}</span>
          <span style={type.labelSm}>Low</span>
          <span style={{ color: colors.txt4 }}>{formatTempF(today.temp_c_min)}</span>
        </span>
      )}
    </div>
  )
}

/** Holds a still-loading half open. The card is already the skeleton's fill. */
function Reserve({ height }: { height: number }) {
  return <div aria-hidden style={{ height: `${height}px` }} />
}

export function ConditionsNow({
  forecast,
  series,
  conditions,
  alertsPending,
  severeAlertEvent,
}: ConditionsNowProps) {
  const now = useNow()
  // The hour covering right now, or null when the run does not reach it —
  // never the nearest hour three hours off.
  const hour = series === undefined ? null : currentHour(series.hours, now)
  const today = findToday(forecast.data)

  const readingsPending = conditions !== undefined && (conditions.isPending || alertsPending)

  // Nothing has arrived for either half: one skeleton for the whole block, at
  // roughly its final height, rather than a card holding two empty spaces.
  if (forecast.isPending && (conditions === undefined || readingsPending)) {
    return <Skeleton height={conditions === undefined ? 64 : 64 + READINGS_H} />
  }

  const weather: ReactNode = forecast.isPending ? (
    <Reserve height={WEATHER_H} />
  ) : forecast.isError ? (
    <InlineError message="Couldn't load the forecast." onRetry={forecast.refetch} />
  ) : today === null && hour === null ? (
    <p style={type.bodyMd}>No reading for today yet.</p>
  ) : (
    <NowWeather hour={hour} today={today} />
  )

  // The reading the measurements panel explains, and the model it came from.
  // Set **only when the readings are on screen**: a panel explaining gauges
  // the reader cannot see would be caveats for nothing.
  let shown: { reading: HourlyReading | null; model: string | null } = {
    reading: null,
    model: null,
  }

  let readings: ReactNode = null
  if (conditions !== undefined) {
    if (readingsPending) {
      // Waits on the alerts query as well as its own: the *number* is
      // suppressed under a Severe+ alert, and an unsettled alerts query reads
      // exactly like "no alert". An alerts error settles it; the readings are
      // unaffected either way.
      readings = <Reserve height={READINGS_H} />
    } else if (conditions.isError) {
      readings = <InlineError message="Couldn't load conditions." onRetry={conditions.refetch} />
    } else if (conditions.data == null) {
      // No row for today at all — distinct from a named unavailable reason,
      // which is a statement about the readings and renders inside them.
      readings = <p style={type.bodyMd}>No conditions for today yet.</p>
    } else if (conditions.data.readings === undefined) {
      // **Absent, not unavailable.** This client is newer than the API it is
      // talking to — a window of minutes after a deploy. Naming a reason here
      // would blame the forecast model for our own release ordering.
      readings = null
    } else {
      const r = conditions.data.readings
      shown = { reading: r.now, model: r.model }
      readings = (
        <ReadingsSection
          bare
          label={null}
          reading={r.now}
          window={r.today?.window ?? null}
          unavailableReason={r.unavailable_reason}
          // The location's own clock, carried by the readings — never borrowed
          // from another query that may not have settled (#33).
          utcOffsetSeconds={r.utc_offset_seconds}
          severeAlertEvent={severeAlertEvent}
          // Already settled: `readingsPending` above holds this branch until the
          // alerts query resolves.
          alertsPending={false}
        />
      )
    }
  }

  return (
    <section style={{ ...card, ...stack(spacing.cellPad) }}>
      <span style={type.label}>{CONDITIONS_NOW_LABEL}</span>
      {weather}
      {readings}
      {/*
        Keyed to the same hour the weather line reads, and to the reading the
        gauges show — so the panel explains exactly what is on screen. It
        renders nothing when it has nothing, so a pending half simply
        contributes no group.

        **The air group does not wait on the forecast query.** Its hour comes
        from the hourly run, and hiding it because a different request failed
        is the whole-section takeover §5 forbids.
      */}
      <Measurements
        hour={hour}
        weatherModel={series?.model ?? null}
        reading={shown.reading}
        readingModel={shown.model}
      />
    </section>
  )
}
