import type { CSSProperties, ReactNode } from 'react'
import { colors, colorsV2, radius, spacing, toneSurfacesV2 } from '@weatherteam6/design/tokens'
import {
  DRYNESS_LABEL,
  formatHumidity,
  formatTempF,
  formatWindMph,
  summarizeReadings,
  type ConditionsScore,
  type ForecastSnapshot,
  type HourlyReading,
  type HourlySample,
  type HourlySeries,
  type ReadingField,
  type ReadingsSummary,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { row, stack, type ToneName } from '../theme/styles.js'
import { findToday } from '../lib/forecast.js'
import { formatLocalClock, formatTempDeg } from '../lib/format.js'
import { readingTone, scoreTone } from '../lib/locationList.js'
import { useNow } from '../hooks/useNow.js'
import { currentHour } from './charts/hourlySeries.js'
import { LabelledFigure } from './LabelledFigure.js'
import { Measurements } from './Measurements.js'
import { InlineError, Skeleton } from './States.js'

/**
 * **"Now", in one place** — the Overview tab's hero, in the v2 layout from the
 * WT6 Figma "V2" page: the hour's temperature large with the day's labelled
 * high and low beside it, the hour's wind, humidity, dew point and cloud as
 * labelled figures, then the three gauges, the day's good hours as a band,
 * and the caveats on one line with the measurements disclosure. Sized so the
 * Overview fits a phone screen (owner, 2026-09-29).
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
 * **The card wears the score's rung**, as the list card's badge does: lime
 * for a good day, amber, red. Only while a score is on screen — under a
 * Severe+ alert, while alerts load, and for a city, the card is the plain v2
 * card, because a tint the number is not there to explain would be the number
 * leaking through the suppression rule.
 *
 * **The two data halves still fail independently.** They are different
 * requests and a failed forecast says nothing about the rock, so each half
 * carries its own loading, error and empty state *inside* the card rather than
 * one failure taking the block down — §5's no-takeover rule, one level in.
 *
 * **The readings half is optional, and its absence is the caller's decision.**
 * It is absent on the `/add` preview (nothing is classified yet) and for a
 * non-climbing location (a rock reading for a city is meaningless). This
 * component does not re-derive any of that.
 */

export const CONDITIONS_NOW_LABEL = 'Conditions now'

/** The space a still-loading half holds open, so the card does not jump. */
const WEATHER_H = 102
const READINGS_H = 83

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

/** The card's surface and inks: a score's rung, or the plain v2 card. */
type Palette = {
  fill: string
  line: string
  muted: string
  band: string
  accent: string
}

const PLAIN: Palette = {
  fill: colorsV2.card,
  line: colorsV2.line,
  muted: colorsV2.txtMuted,
  band: colorsV2.raised,
  accent: colorsV2.txt1,
}

const TONE_BASE: Record<ToneName, string> = {
  good: colors.good,
  fair: colors.fair,
  poor: colors.poor,
}

function palette(tone: ToneName | null): Palette {
  if (tone === null) return PLAIN
  const s = toneSurfacesV2[tone]
  return {
    fill: s.hero,
    line: s.heroLine,
    muted: s.heroMuted,
    band: s.heroBand,
    accent: TONE_BASE[tone],
  }
}

/**
 * The present temperature, the hour's wind, humidity and cloud, and the day's
 * high and low.
 *
 * **Everything is labelled as what it is.** The large figure is the hour of
 * the run covering this moment; `High`/`Low` are the day's extremes. The two
 * are never merged into one unlabelled number, and the high is never borrowed
 * for "now".
 */
function NowWeather({
  hour,
  today,
  p,
}: {
  hour: HourlySample | null
  today: ForecastSnapshot | null
  p: Palette
}) {
  return (
    <div style={stack(spacing.cellPad)}>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'flex-end' }}>
        {/*
          The present temperature, or nothing at all. A run that does not reach
          this hour has no "now" to show, and putting the daily high in the slot
          is the §3 factual error this line was built to stop.
        */}
        {hour?.temp_c == null ? <span /> : <span style={typeV2.heroTemp}>{formatTempF(hour.temp_c)}</span>}

        {/*
          **Labelled, always.** This pair can be alone in the card — a pending
          hourly query, the preview, a run that does not reach this hour — and
          then a bare `103° 79°` in the hero's slot is the §3 error.
        */}
        {today === null ? null : (
          <span
            style={{
              ...stack(spacing.micro),
              alignItems: 'flex-end',
              paddingBottom: `${spacing.listGap}px`,
            }}
          >
            <span style={typeV2.heroHiLo}>High {formatTempDeg(today.temp_c_max)}</span>
            <span style={typeV2.heroHiLo}>Low {formatTempDeg(today.temp_c_min)}</span>
          </span>
        )}
      </div>

      {/*
        The hour's figures, each named under its value. A row of like cells, so
        a missing one is dashed rather than dropped — a gap that closed up would
        move every label after it. None at all without an hour: the high and
        low above are the day's, and this row is the hour's.
      */}
      {hour === null ? null : (
        <div style={{ ...row(spacing.chipGapMd), alignItems: 'stretch' }}>
          <LabelledFigure surface={{ backgroundColor: p.band }} labelColor={p.muted} color={colorsV2.txt1} value={formatWindMph(hour.wind_kmh)} label="Wind" />
          <LabelledFigure surface={{ backgroundColor: p.band }} labelColor={p.muted} color={colorsV2.txt1} value={formatHumidity(hour.humidity_pct)} label="Humidity" />
          <LabelledFigure surface={{ backgroundColor: p.band }} labelColor={p.muted} color={colorsV2.txt1} value={formatTempDeg(hour.dewpoint_c)} label="Dew point" />
          <LabelledFigure surface={{ backgroundColor: p.band }} labelColor={p.muted} color={colorsV2.txt1} value={formatHumidity(hour.cloud_pct)} label="Cloud" />
        </div>
      )}
    </div>
  )
}

/**
 * One gauge: a small label over a large value. Words in Barlow, the score in
 * Plex Mono — the v2 rule that every figure is set in the mono face.
 */
function Gauge({
  field,
  color,
  figure,
  muted,
}: {
  field: ReadingField
  color: string
  figure: boolean
  muted: string
}) {
  return (
    <span style={{ ...stack(spacing.micro), flex: '1 1 0', minWidth: 0 }}>
      <span style={{ ...typeV2.tileLabel, color: muted }}>{field.label}</span>
      <span style={{ ...(figure ? typeV2.tileFigure : typeV2.tileWord), color }}>{field.value}</span>
    </span>
  )
}

/**
 * The readings half. Every copy decision — the labels, the suppression, the
 * window's wording, the caveats — is `summarizeReadings`, shared with every
 * other surface; this only lays it out.
 */
function Readings({
  summary,
  reading,
  p,
}: {
  summary: ReadingsSummary
  reading: HourlyReading | null
  p: Palette
}) {
  if (summary.unavailableLine !== null) {
    // A statement about us, never one about the rock. It must not read as
    // "conditions are bad" — that was the whole of issue #34.
    return <p style={typeV2.body}>{summary.unavailableLine}</p>
  }

  const { score, scoreField } = summary
  const hasGauges = summary.readings.length > 0 || scoreField !== null

  return (
    <div style={stack(spacing.cellPad)}>
      {/*
        The readings, then the number: the score is the third gauge, not the
        headline the other two explain. Nothing at all when there is nothing to
        read — a row of dashes reads as a measurement of nothing.

        **Dryness is set white and Friction in its rung's colour**, as the
        Figma draws them. The word carries the reading either way; the colour
        is only ever beside the word it colours.
      */}
      {hasGauges ? (
        <div style={{ ...row(spacing.cellPad), alignItems: 'flex-start' }}>
          {summary.readings.map((field) => {
            const tone = field.label === DRYNESS_LABEL ? null : readingTone(field, reading)
            return (
              <Gauge
                key={field.label}
                field={field}
                figure={false}
                muted={p.muted}
                color={tone === null ? colorsV2.txt1 : TONE_BASE[tone]}
              />
            )
          })}
          {score === null || scoreField === null ? null : (
            <Gauge field={scoreField} figure muted={p.muted} color={TONE_BASE[scoreTone(score)]} />
          )}
        </div>
      ) : null}

      {/*
        The window is a fact about the day, not about this hour, so it sits in
        a band of its own rather than joining the gauges.
      */}
      {summary.window === null ? null : (
        <div
          style={{
            ...row(spacing.cellPad),
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            backgroundColor: p.band,
            borderRadius: `${radius.card}px`,
            padding: `${spacing.listGapSm}px ${spacing.cardPadSm}px`,
          }}
        >
          <span style={typeV2.bandLabel}>{summary.window.label}</span>
          <span style={{ ...typeV2.bandValue, color: p.accent }}>{summary.window.value}</span>
        </div>
      )}

      {summary.qualifier === null ? null : <p style={typeV2.body}>{summary.qualifier}</p>}
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
    return <Skeleton height={conditions === undefined ? WEATHER_H + 40 : WEATHER_H + READINGS_H} />
  }

  // The reading the measurements panel explains, and the model it came from.
  // Set **only when the readings are on screen**: a panel explaining gauges
  // the reader cannot see would be caveats for nothing.
  let shown: {
    reading: HourlyReading | null
    model: string | null
    rainModels: readonly string[] | null
  } = {
    reading: null,
    model: null,
    rainModels: null,
  }
  let summary: ReadingsSummary | null = null
  let readingsBlock: ReactNode = null

  if (conditions !== undefined) {
    if (readingsPending) {
      // Waits on the alerts query as well as its own: the *number* is
      // suppressed under a Severe+ alert, and an unsettled alerts query reads
      // exactly like "no alert". An alerts error settles it; the readings are
      // unaffected either way.
      readingsBlock = <Reserve height={READINGS_H} />
    } else if (conditions.isError) {
      readingsBlock = <InlineError message="Couldn't load conditions." onRetry={conditions.refetch} />
    } else if (conditions.data == null) {
      // No row for today at all — distinct from a named unavailable reason,
      // which is a statement about the readings and renders inside them.
      readingsBlock = <p style={typeV2.body}>No conditions for today yet.</p>
    } else if (conditions.data.readings === undefined) {
      // **Absent, not unavailable.** This client is newer than the API it is
      // talking to — a window of minutes after a deploy. Naming a reason here
      // would blame the forecast model for our own release ordering.
      readingsBlock = null
    } else {
      const r = conditions.data.readings
      shown = { reading: r.now, model: r.model, rainModels: r.rain_models ?? null }
      summary = summarizeReadings({
        reading: r.now,
        window: r.today?.window ?? null,
        // The location's own clock, carried by the readings — never borrowed
        // from another query that may not have settled (#33).
        utcOffsetSeconds: r.utc_offset_seconds,
        severeAlertEvent,
        // Already settled: `readingsPending` above holds this branch until the
        // alerts query resolves.
        alertsPending: false,
        unavailableReason: r.unavailable_reason,
      })
    }
  }

  const p = palette(summary?.score == null ? null : scoreTone(summary.score))

  const weather: ReactNode = forecast.isPending ? (
    <Reserve height={WEATHER_H} />
  ) : forecast.isError ? (
    <InlineError message="Couldn't load the forecast." onRetry={forecast.refetch} />
  ) : today === null && hour === null ? (
    <p style={typeV2.body}>No reading for today yet.</p>
  ) : (
    <NowWeather hour={hour} today={today} p={p} />
  )

  // The stamp is the hour the weather line reads, on the location's clock.
  const stampAt = hour === null || series === undefined ? null : Date.parse(hour.valid_at)
  const stamp =
    stampAt === null || series === undefined ? null : formatLocalClock(stampAt, series.utc_offset_seconds)

  const surface: CSSProperties = {
    backgroundColor: p.fill,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: p.line,
    borderRadius: `${radius.heroV2}px`,
    padding: `${spacing.cardPad}px`,
  }

  return (
    <section style={{ ...surface, ...stack(spacing.cellPad) }}>
      <span style={{ ...typeV2.kicker, color: p.muted }}>
        {stamp === null ? CONDITIONS_NOW_LABEL : `${CONDITIONS_NOW_LABEL} · ${stamp}`}
      </span>
      {weather}

      {summary === null && readingsBlock === null ? null : (
        summary === null ? readingsBlock : <Readings summary={summary} reading={shown.reading} p={p} />
      )}

      {/*
        Keyed to the same hour the weather line reads, and to the reading the
        gauges show — so the panel explains exactly what is on screen. It
        renders nothing when it has nothing.

        **The air group does not wait on the forecast query.** Its hour comes
        from the hourly run, and hiding it because a different request failed
        is the whole-section takeover §5 forbids.
      */}
      <Measurements
        hour={hour}
        weatherModel={series?.model ?? null}
        reading={shown.reading}
        readingModel={shown.model}
        rainModels={shown.rainModels}
        // Required copy, not decoration. The friction estimate note is a Phase
        // 3 acceptance criterion, and the aspect note is what keeps an
        // unqualified reading from being read as a measured one. Shown only
        // with the gauges it qualifies, on the disclosure's own line.
        lead={
          summary === null || summary.unavailableLine !== null || summary.notes.length === 0 ? null : (
            <p style={{ ...typeV2.note, color: p.muted }}>{summary.notes.join(' · ')}</p>
          )
        }
      />
    </section>
  )
}
