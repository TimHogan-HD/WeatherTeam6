import type { CSSProperties, ReactNode } from 'react'
import { colors, colorsV2, radius, spacing, toneSurfacesV2 } from '@weatherteam6/design/tokens'
import {
  DRYNESS_LABEL,
  EM_DASH,
  formatHumidity,
  formatLocalHour,
  formatTempF,
  formatWindMph,
  readingNow,
  summarizeReadings,
  type Conditions,
  type ForecastSnapshot,
  type HourlyReading,
  type HourlySample,
  type HourlySeries,
  type RangeF,
  type ReadingField,
  type ReadingsSummary,
} from '@weatherteam6/types'
import { typeV2, withOpacity } from '../theme/tokens.css.js'
import { row, stack, type ToneName } from '../theme/styles.js'
import { rainAhead, scoreBlocks, type RainAhead, type ScoreBlock } from '../lib/conditionsBlocks.js'
import { findToday } from '../lib/forecast.js'
import { formatLocalClock, formatTempDeg } from '../lib/format.js'
import { readingTone, scoreTone } from '../lib/locationList.js'
import { useNow } from '../hooks/useNow.js'
import { LabelledFigure } from './LabelledFigure.js'
import { Measurements } from './Measurements.js'
import { RollingFigure, usePreviousFigure } from './RollingFigure.js'
import { InlineError, Skeleton } from './States.js'

/**
 * **"Now", in one place** — the Overview tab's hero, in the v2 layout from the
 * WT6 Figma "V2" page: the hour's temperature large with the day's labelled
 * high and low beside it, the hour's wind, humidity, dew point and cloud as
 * labelled figures, then the gauges — Dryness for the hour, the
 * day's score — the next nine hours as three-hour score blocks, a band naming
 * rain likely inside them or else the day's good hours, and the caveats on one
 * line with the measurements disclosure. Sized so the Overview fits a phone
 * screen (owner, 2026-09-29). The hour's score never stands alone: 9am read
 * 100 on a day rain arrived at 1pm (owner, Sandstone, 2026-10-03).
 *
 * One card, one label, three parts, in this order:
 *
 * 1. **The weather** — the hour covering now, and the day's labelled high and
 *    low. From the hourly run and the forecast.
 * 2. **The readings** — `Dryness`, the day's score, and the day's window.
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
 * It is absent for a non-climbing location (a rock reading for a city is meaningless). This
 * component does not re-derive any of that.
 */

export const CONDITIONS_NOW_LABEL = 'Conditions now'

/** The third gauge: the day's score, so the hour's never stands for the day (owner, 2026-10-05). */
export const TODAY_LABEL = 'Today'

const RAIN_BAND = withOpacity(colorsV2.rain, 0.14)

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
   * Absent while `/hourly` is pending or failed.
   */
  series: HourlySeries | undefined
  /** The readings half. Absent where there is no reading to show — see above. */
  conditions?: {
    /** A 200 with `data: null` is the documented "no row for today", not an error. */
    data: Conditions | null | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
    /**
     * Failed attempts so far. A request that failed once is still pending
     * while the automatic retry waits, and this is the only way to say so.
     */
    failureCount?: number
  }
  /**
   * Whether the alerts query is still in flight. **The number waits for it**:
   * `severeAlertEvent` is `null` for a query in flight exactly as it is for
   * "no severe alert" (defect class 7).
   */
  alertsPending: boolean
  severeAlertEvent: string | null
  /** The reader's temperature range, quoted in the score's reasons. Null while it loads. */
  rangeF?: RangeF
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
          hourly query, a failed one, a run that does not reach this hour — and
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
 * Plex Mono — the v2 rule that every figure is set in the mono face. A figure
 * that a new run changes while it is on screen rolls to its new value, and its
 * label says what it was for a few seconds.
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
  const was = usePreviousFigure(field.value)
  return (
    <span style={{ ...stack(spacing.micro), flex: '1 1 0', minWidth: 0 }}>
      <span style={{ ...typeV2.tileLabel, color: muted }}>
        {was === null ? field.label : `${field.label} · was ${was}`}
      </span>
      <span style={{ ...(figure ? typeV2.tileFigure : typeV2.tileWord), color }}>
        <RollingFigure value={field.value} from={was} />
      </span>
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
  todayScore,
  reading,
  blocks,
  rain,
  utcOffsetSeconds,
  scoreHidden,
  p,
}: {
  summary: ReadingsSummary
  /** A Severe+ alert is in force: no score of any span renders. */
  scoreHidden: boolean
  /** The day's score, suppressed as the hour's is. `null` after the day's last scored hour. */
  todayScore: number | null
  reading: HourlyReading | null
  blocks: readonly ScoreBlock[]
  rain: RainAhead | null
  utcOffsetSeconds: number
  p: Palette
}) {
  if (summary.unavailableLine !== null) {
    // A statement about us, never one about the rock. It must not read as
    // "conditions are bad" — that was the whole of issue #34.
    return <p style={typeV2.body}>{summary.unavailableLine}</p>
  }

  // The day's score takes the third gauge; the hour's lives in the first block.
  // Under a Severe+ alert every number goes, and the slots with them.
  const suppressed = scoreHidden
  const hasGauges = summary.readings.length > 0 || !suppressed

  const band: CSSProperties = {
    ...row(spacing.cellPad),
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    borderRadius: `${radius.card}px`,
    padding: `${spacing.listGapSm}px ${spacing.cardPadSm}px`,
  }

  return (
    <div style={stack(spacing.cellPad)}>
      {/*
        The readings, then the day's number. Nothing at all when there is
        nothing to read — a row of dashes reads as a measurement of nothing.

        **Dryness is set white**, as the Figma draws it; the word carries
        the reading. There is no friction word (owner, 2026-10-05).
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
          {suppressed ? null : (
            <Gauge
              field={{ label: TODAY_LABEL, value: todayScore === null ? EM_DASH : String(todayScore) }}
              figure
              muted={p.muted}
              color={todayScore === null ? colorsV2.txtMuted : TONE_BASE[scoreTone(todayScore)]}
            />
          )}
        </div>
      ) : null}

      {/*
        Where the day is going: the next hours in three-hour blocks, each its
        worst hour's score, the one holding now outlined. A block with no score
        is dashed — a gap, not a 0, which is wet rock.
      */}
      {blocks.length === 0 || suppressed ? null : (
        <div style={{ ...row(spacing.chipGapMd), alignItems: 'stretch' }}>
          {blocks.map((b, i) => {
            const tone = b.score === null ? null : scoreTone(b.score)
            return (
              <div
                key={b.from}
                style={{
                  ...stack(spacing.micro),
                  flex: '1 1 0',
                  minWidth: 0,
                  borderRadius: `${radius.card}px`,
                  padding: `${spacing.listGapSm}px ${spacing.cellPad}px`,
                  backgroundColor: tone === null ? p.band : toneSurfacesV2[tone].pill,
                  boxShadow: i === 0 ? `inset 0 0 0 2px ${tone === null ? p.muted : TONE_BASE[tone]}` : undefined,
                }}
              >
                <span style={{ ...typeV2.tileLabel, color: colorsV2.txt2 }}>
                  {i === 0 ? `${b.label} · now` : b.label}
                </span>
                <span style={{ ...typeV2.tileFigure, color: tone === null ? colorsV2.txtMuted : TONE_BASE[tone] }}>
                  {b.score === null ? EM_DASH : b.score}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/*
        Rain inside the blocks outranks the good hours: it is the thing that
        turns the blocks red, and the reason a fine-looking now can mislead.
        Otherwise the window, a fact about the day, in a band of its own.
      */}
      {rain !== null ? (
        <div style={{ ...band, backgroundColor: RAIN_BAND }}>
          <span style={typeV2.bandLabel}>{rain.now ? 'Rain likely' : 'Rain likely from'}</span>
          <span style={{ ...typeV2.bandValue, color: colorsV2.rain }}>
            {rain.now ? 'now' : formatLocalHour(rain.from, utcOffsetSeconds)} · {rain.peakPct}%
          </span>
        </div>
      ) : summary.window === null ? null : (
        <div style={{ ...band, backgroundColor: p.band }}>
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

/**
 * The readings half while it loads, at its final height. **Visible, not a
 * blank gap** (#261): a failing `/conditions` is pending through its automatic
 * retry — tens of seconds, since the API backs off upstream on each attempt —
 * and an empty space for that long reads as "nothing to say" rather than
 * "still coming". Placeholder bars where the reading will sit, and words once
 * an attempt has failed.
 */
function ReadingsLoading({ p, retrying }: { p: Palette; retrying: boolean }) {
  const bar = (width: number, height: number): CSSProperties => ({
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: `${radius.chip}px`,
    backgroundColor: p.band,
  })
  return (
    <div role="status" style={{ height: `${READINGS_H}px`, ...stack(spacing.micro) }}>
      <div aria-hidden style={bar(64, 12)} />
      <div aria-hidden style={bar(120, 24)} />
      {retrying ? (
        <p style={{ ...typeV2.body, color: p.muted }}>Couldn’t reach conditions — trying again…</p>
      ) : (
        <span style={SCREEN_READER_ONLY}>Loading conditions…</span>
      )}
    </div>
  )
}

const SCREEN_READER_ONLY: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}

export function ConditionsNow({
  forecast,
  series,
  conditions,
  alertsPending,
  severeAlertEvent,
  rangeF = null,
}: ConditionsNowProps) {
  const now = useNow()
  // The hour nearest now, as the Today chart's "Now" reads it, or null when
  // the run does not reach it — never an hour three hours off.
  const hour = series === undefined ? null : readingNow(series.hours, now)
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
  let todayScore: number | null = null
  let blocks: ScoreBlock[] = []
  let rain: RainAhead | null = null
  let utcOffsetSeconds = 0
  let readingsBlock: ReactNode = null

  if (conditions !== undefined) {
    if (readingsPending) {
      // Waits on the alerts query as well as its own: the *number* is
      // suppressed under a Severe+ alert, and an unsettled alerts query reads
      // exactly like "no alert". An alerts error settles it; the readings are
      // unaffected either way.
      readingsBlock = <ReadingsLoading p={PLAIN} retrying={(conditions.failureCount ?? 0) > 0} />
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
        rangeF,
      })
      utcOffsetSeconds = r.utc_offset_seconds
      todayScore = summarizeReadings({
        reading: r.today?.best ?? null,
        window: null,
        utcOffsetSeconds: r.utc_offset_seconds,
        severeAlertEvent,
        alertsPending: false,
        unavailableReason: r.unavailable_reason,
      }).score
      // The blocks start at the hour the gauges read, and read the hourly
      // run's readings — the same readings `/conditions` was sliced from.
      if (r.now !== null && series !== undefined) {
        blocks = scoreBlocks(series.readings?.hours ?? [], r.now.valid_at, r.utc_offset_seconds, {
          severeAlertEvent,
          alertsPending: false,
        })
        rain = rainAhead(series.hours, r.now.valid_at, now)
      }
    }
  }

  // The card wears the rung of the block holding now — what climbing looks
  // like over the next hours — or the hour's own while the blocks are not in.
  // A block with a gap leaves the card plain: the hour alone could read better
  // than the hours beside it.
  const cardScore = blocks.length > 0 ? (blocks[0]?.score ?? null) : (summary?.score ?? null)
  const p = palette(cardScore === null ? null : scoreTone(cardScore))

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
        summary === null ? readingsBlock : (
          <Readings
            summary={summary}
            todayScore={todayScore}
            reading={shown.reading}
            blocks={blocks}
            rain={rain}
            utcOffsetSeconds={utcOffsetSeconds}
            scoreHidden={severeAlertEvent !== null}
            p={p}
          />
        )
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
        heldBack={summary?.heldBack ?? null}
        tileSurface={{ backgroundColor: p.band }}
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
