import type { ReactNode } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  FRICTION_ESTIMATE_NOTE,
  FRICTION_LABELS,
  formatLastRain,
  type ConditionsScore,
  type FrictionLevel,
  type HourlySeries,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, cardV2, row, stack, type ToneName } from '../theme/styles.js'
import { formatTempDeg, formatTempRangeF } from '../lib/format.js'
import { DayRowShell, ScorePill } from './DayRow.js'
import {
  nextDays,
  nextLikelyRain,
  shortDay,
  todayCells,
  type NextDay,
  type TodayCell,
} from '../lib/overview.js'
import { useNow } from '../hooks/useNow.js'
import { InlineError, Skeleton } from './States.js'

/**
 * The Overview tab under the hero, from the WT6 Figma "V2" page's Overview
 * frame: **Today** — five hours of the day with the friction reading at each;
 * **Next 3 days** — each day's Crag A score; and **Rain** — when it last fell
 * and when it is next likely.
 *
 * Each card is a doorway as well as a summary: "Hourly ›" and "Daily ›" open
 * those tabs, and a day row opens its hours. The decisions about *what* each
 * card says live in `lib/overview.ts`, where they are tested; this lays them
 * out.
 *
 * **The cards fail independently**, like every section on this screen (§5).
 * Today and the day scores read `/hourly`; the rows' dates and temperatures
 * read `/forecast`; last rain reads `/conditions`. A slow or failed hourly run
 * leaves the rows standing without their pills.
 */

export type OverviewTabProps = {
  /** `YYYY-MM-DD`, the row the server flagged `is_today`. `null` until the forecast arrives. */
  todayDate: string | null
  isClimbingLocation: boolean
  forecast: { data: Parameters<typeof nextDays>[0] | undefined }
  hourly: { data: HourlySeries | undefined; isPending: boolean; isError: boolean; refetch: () => void }
  /** Today's `/conditions` row, for last rain. Absent for a city. */
  conditions: ConditionsScore | null | undefined
  severeAlertEvent: string | null
  alertsPending: boolean
  /** Days the hourly charts can draw. `undefined` until `/hourly` answers. */
  drawableDates: ReadonlySet<string> | undefined
  onOpenDaily: () => void
  onOpenHourly: () => void
  onOpenDay: (localDate: string) => void
}

/** The strip's height once drawn, held open while it loads. */
const TODAY_STRIP_H = 77

const FRICTION_TONE: Record<FrictionLevel, ToneName> = {
  great: 'good',
  good: 'good',
  fair: 'fair',
  poor: 'poor',
}

const TONE_INK: Record<ToneName, string> = {
  good: colorsV2.goodInk,
  fair: colorsV2.fairInk,
  poor: colorsV2.poorInk,
}

/** A v2 card with a title and an optional link to a tab. */
function Card({
  title,
  link,
  gap,
  children,
}: {
  title: string
  link: { label: string; onOpen: () => void } | null
  gap: number
  children: ReactNode
}) {
  return (
    <section style={{ ...cardV2, ...stack(gap) }}>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
        <h2 style={typeV2.cardTitle}>{title}</h2>
        {link === null ? null : (
          <button type="button" onClick={link.onOpen} style={{ ...bareButton, width: 'auto', ...typeV2.cardLink }}>
            {link.label} ›
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function HourCell({ cell, showReading }: { cell: TodayCell; showReading: boolean }) {
  const friction = cell.reading?.friction ?? null
  return (
    <div
      style={{
        ...stack(spacing.tight),
        flex: '1 1 0',
        minWidth: 0,
        alignItems: 'center',
        backgroundColor: colorsV2.raised,
        borderRadius: `${radius.card}px`,
        padding: `${spacing.cellPad}px ${spacing.tight}px`,
      }}
    >
      <span style={typeV2.cellHour}>{cell.hourLabel}</span>
      <span style={typeV2.cellFigure}>{formatTempDeg(cell.tempC)}</span>
      {/*
        The friction word, never its 0-1 factor (the magnitude fence). An hour
        the model did not read is dashed: the strip is a row of like cells, and
        one missing its word would read as a different kind of hour.
      */}
      {!showReading ? null : friction === null ? (
        <span style={{ ...typeV2.cellWord, color: colorsV2.txtMuted }}>{EM_DASH}</span>
      ) : (
        <span style={{ ...typeV2.cellWord, color: TONE_INK[FRICTION_TONE[friction.level]] }}>
          {FRICTION_LABELS[friction.level]}
        </span>
      )}
    </div>
  )
}

function TodayCard({ props }: { props: OverviewTabProps }) {
  const { hourly, todayDate, isClimbingLocation } = props
  const link = { label: 'Hourly', onOpen: props.onOpenHourly }

  let body: ReactNode
  if (hourly.isPending || (todayDate === null && hourly.data !== undefined)) {
    body = <Skeleton height={TODAY_STRIP_H} />
  } else if (hourly.isError) {
    body = <InlineError message="Couldn't load the hour-by-hour forecast." onRetry={hourly.refetch} />
  } else if (hourly.data === undefined || todayDate === null) {
    return null
  } else {
    const cells = todayCells(hourly.data, todayDate, isClimbingLocation)
    body =
      cells.length === 0 ? (
        <p style={typeV2.body}>No hour-by-hour forecast for today.</p>
      ) : (
        <>
          <div style={{ ...row(spacing.listGapSm), alignItems: 'stretch' }}>
            {cells.map((cell) => (
              <HourCell key={cell.valid_at} cell={cell} showReading={isClimbingLocation} />
            ))}
          </div>
          {/*
            The strip's key: the words are friction, not a verdict on the hour.
            **The estimate note rides with the words** — the hero above carries
            it too, but the hero's readings can fail while this strip draws.
          */}
          <span style={typeV2.note}>
            {isClimbingLocation ? `Friction by hour · ${FRICTION_ESTIMATE_NOTE}` : 'Temperature by hour'}
          </span>
        </>
      )
  }

  return (
    <Card title="Today" link={link} gap={spacing.cardPad}>
      {body}
    </Card>
  )
}

function DayRow({
  day,
  isClimbingLocation,
  onOpen,
}: {
  day: NextDay
  isClimbingLocation: boolean
  onOpen: (() => void) | null
}) {
  // A row opens that day's hours only when the charts can draw it — a day the
  // ensemble never reached would open two empty charts.
  return (
    <DayRowShell
      score={day.score}
      onOpen={onOpen}
      style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}
    >
      <span style={typeV2.rowTitle}>{day.title}</span>
      {isClimbingLocation ? (
        // Absent rather than dashed when there is no score: suppressed under an
        // alert (the banner above says why), still loading, or past the run —
        // none of them is a score of nothing.
        day.score === null ? null : <ScorePill score={day.score} />
      ) : (
        <span style={{ ...typeV2.rowPill, color: colorsV2.txtMuted }}>
          {/* Both ends or a dash: a range with one end missing reads as a typo. */}
          {formatTempRangeF(day.lowC, day.highC)}
        </span>
      )}
    </DayRowShell>
  )
}

function NextDaysCard({ props }: { props: OverviewTabProps }) {
  const { forecast, todayDate, hourly, isClimbingLocation } = props
  // Pending and failed are the hero's to report: the rows share its forecast
  // query, and a second copy of the same error reads as two failures.
  if (forecast.data === undefined || todayDate === null) return null

  const days = nextDays(
    forecast.data,
    todayDate,
    isClimbingLocation && hourly.data !== undefined
      ? {
          days: hourly.data.readings?.days ?? [],
          utcOffsetSeconds: hourly.data.utc_offset_seconds,
          severeAlertEvent: props.severeAlertEvent,
          alertsPending: props.alertsPending,
        }
      : null,
  )
  if (days.length === 0) return null

  return (
    <Card title={`Next ${days.length} ${days.length === 1 ? 'day' : 'days'}`} link={{ label: 'Daily', onOpen: props.onOpenDaily }} gap={spacing.listGapLg}>
      {days.map((day) => (
        <DayRow
          key={day.local_date}
          day={day}
          isClimbingLocation={isClimbingLocation}
          onOpen={props.drawableDates?.has(day.local_date) === true ? () => props.onOpenDay(day.local_date) : null}
        />
      ))}
    </Card>
  )
}

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <span style={typeV2.factLabel}>{label}</span>
      <span style={{ ...typeV2.factValue, ...(color === undefined ? {} : { color }) }}>{value}</span>
    </div>
  )
}

function RainCard({ props }: { props: OverviewTabProps }) {
  const now = useNow()
  const { hourly, todayDate } = props

  // The drying model's own record. Capped at "over 30 days ago" by the shared
  // formatter, so a swallowed rainfall fetch cannot read as a date.
  const hoursSince = props.conditions?.score_breakdown?.drying?.hours_since_rain ?? null
  const lastRain = props.isClimbingLocation ? formatLastRain(hoursSince) : null

  const next = hourly.data === undefined ? null : nextLikelyRain(hourly.data.hours, now)
  const nextValue: { text: string; color?: string } | null =
    next === null || todayDate === null || next.kind === 'unknown'
      ? null
      : next.kind === 'likely'
        ? { text: `${shortDay(next.local_date, todayDate)} · ${next.chancePct}%`, color: colorsV2.rain }
        : // "None through Tue", not "no rain": the ensemble has an edge, and
          // rain past it is rain these figures cannot see.
          { text: `None through ${shortDay(next.throughDate, todayDate)}` }

  if (lastRain === null && nextValue === null) return null

  return (
    <Card title="Rain" link={null} gap={spacing.cellPad}>
      {lastRain === null ? null : <Fact label="Last rain" value={lastRain} />}
      {nextValue === null ? null : (
        <Fact label="Next likely rain" value={nextValue.text} {...(nextValue.color === undefined ? {} : { color: nextValue.color })} />
      )}
    </Card>
  )
}

export function OverviewTab(props: OverviewTabProps) {
  return (
    <>
      <TodayCard props={props} />
      <NextDaysCard props={props} />
      <RainCard props={props} />
    </>
  )
}
