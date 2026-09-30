import type { ReactNode } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  FRICTION_ESTIMATE_NOTE,
  FRICTION_LABELS,
  type FrictionLevel,
  type HourlySeries,
  type RecentPrecip,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, cardV2, row, stack, type ToneName } from '../theme/styles.js'
import { formatTempDeg, formatTempRangeF } from '../lib/format.js'
import { DayRowShell, ScorePill } from './DayRow.js'
import {
  lastRainText,
  nextDays,
  nextLikelyRain,
  shortDate,
  todayCells,
  type NextDay,
  type TodayCell,
} from '../lib/overview.js'
import { precipDays, precipSummary } from '../lib/precipHistory.js'
import { useNow } from '../hooks/useNow.js'
import { InlineError, Skeleton } from './States.js'

/**
 * The Overview tab under the hero, from the WT6 Figma "V2" page's Overview
 * frame: **Today** — five hours of the day with the friction reading at each;
 * **Next 3 days** — each day's Crag A score, as three tiles; and **Rain** —
 * when real rain last fell and when rain is next likely. Sized so the tab fits
 * a phone screen without scrolling (owner, 2026-09-29).
 *
 * Each card is a doorway as well as a summary: "Hourly ›" and "Daily ›" open
 * those tabs, and a day row opens its hours. The decisions about *what* each
 * card says live in `lib/overview.ts`, where they are tested; this lays them
 * out.
 *
 * **The cards fail independently**, like every section on this screen (§5).
 * Today and the day scores read `/hourly`; the rows' dates and temperatures
 * read `/forecast`; last rain reads `/recent-precip`. A slow or failed hourly run
 * leaves the rows standing without their pills.
 */

export type OverviewTabProps = {
  /** `YYYY-MM-DD`, the row the server flagged `is_today`. `null` until the forecast arrives. */
  todayDate: string | null
  isClimbingLocation: boolean
  forecast: { data: Parameters<typeof nextDays>[0] | undefined }
  hourly: { data: HourlySeries | undefined; isPending: boolean; isError: boolean; refetch: () => void }
  /** The past week's precipitation, for last rain. `undefined` until it arrives or when it failed. */
  recentPrecip: RecentPrecip | undefined
  severeAlertEvent: string | null
  alertsPending: boolean
  /** Days the hourly charts can draw. `undefined` until `/hourly` answers. */
  drawableDates: ReadonlySet<string> | undefined
  onOpenDaily: () => void
  onOpenHourly: () => void
  onOpenDay: (localDate: string) => void
}

/** The strip's height once drawn, held open while it loads. */
const TODAY_STRIP_H = 52

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
  aside = null,
  link,
  gap,
  children,
}: {
  title: string
  /** A note beside the title, where a line of its own would cost the card a row. */
  aside?: string | null
  link: { label: string; onOpen: () => void } | null
  gap: number
  children: ReactNode
}) {
  return (
    <section style={{ ...cardV2, ...stack(gap) }}>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
        <h2 style={typeV2.cardTitle}>{title}</h2>
        {aside === null ? null : <span style={{ ...typeV2.note, flex: '1 1 auto', minWidth: 0 }}>{aside}</span>}
        {link === null ? null : (
          <button type="button" onClick={link.onOpen} style={{ ...bareButton, width: 'auto', flex: '0 0 auto', whiteSpace: 'nowrap', ...typeV2.cardLink }}>
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
        padding: `${spacing.listGapSm}px ${spacing.tight}px`,
      }}
    >
      <span style={{ ...row(spacing.tight), alignItems: 'baseline' }}>
        <span style={typeV2.cellHour}>{cell.hourLabel}</span>
        <span style={typeV2.cellFigure}>{formatTempDeg(cell.tempC)}</span>
      </span>
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
  let drawn = false
  if (hourly.isPending || (todayDate === null && hourly.data !== undefined)) {
    body = <Skeleton height={TODAY_STRIP_H} />
  } else if (hourly.isError) {
    body = <InlineError message="Couldn't load the hour-by-hour forecast." onRetry={hourly.refetch} />
  } else if (hourly.data === undefined || todayDate === null) {
    return null
  } else {
    const cells = todayCells(hourly.data, todayDate, isClimbingLocation)
    drawn = cells.length > 0
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
        </>
      )
  }

  return (
    // **The estimate note rides with the words**, in the title row — the hero
    // above carries it too, but the hero's readings can fail while this strip
    // draws. It also names the words as friction, not a verdict on the hour.
    <Card title="Today" aside={isClimbingLocation && drawn ? FRICTION_ESTIMATE_NOTE : null} link={link} gap={spacing.listGap}>
      {body}
    </Card>
  )
}

/**
 * One day as a tile, three abreast — the rows they replaced took a third of
 * the screen for three dates and three pills.
 */
function DayTile({
  day,
  todayDate,
  isClimbingLocation,
  onOpen,
}: {
  day: NextDay
  todayDate: string
  isClimbingLocation: boolean
  onOpen: (() => void) | null
}) {
  // A tile opens that day's hours only when the charts can draw it — a day the
  // ensemble never reached would open two empty charts.
  return (
    <DayRowShell
      score={day.score}
      onOpen={onOpen}
      style={{
        ...stack(spacing.tight),
        flex: '1 1 0',
        minWidth: 0,
        alignItems: 'center',
        padding: `${spacing.listGapSm}px ${spacing.tight}px`,
      }}
    >
      <span style={typeV2.rowTitle}>{shortDate(day.local_date, todayDate)}</span>
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

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ ...stack(spacing.micro), flex: '1 1 auto', minWidth: 0 }}>
      <span style={typeV2.factLabel}>{label}</span>
      <span style={{ ...typeV2.factValue, whiteSpace: 'nowrap', ...(color === undefined ? {} : { color }) }}>{value}</span>
    </div>
  )
}

/**
 * The next days as tiles, then rain — one card, because each alone was a card
 * frame around a single row.
 */
function ComingUpCard({ props }: { props: OverviewTabProps }) {
  const now = useNow()
  const { forecast, todayDate, hourly, isClimbingLocation, recentPrecip } = props

  // Pending and failed are the hero's to report: the tiles share its forecast
  // query, and a second copy of the same error reads as two failures.
  const days =
    forecast.data === undefined || todayDate === null
      ? []
      : nextDays(
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

  // The Precip tab's headline, from the same response and the same rule, so
  // the two tabs cannot name different storms. Every location has it; a city
  // had rain too.
  const lastRain =
    recentPrecip === undefined
      ? null
      : lastRainText(precipSummary(recentPrecip, now), precipDays(recentPrecip.hours).length)

  const next = hourly.data === undefined ? null : nextLikelyRain(hourly.data.hours, now)
  const nextValue: { text: string; color?: string } | null =
    next === null || todayDate === null || next.kind === 'unknown'
      ? null
      : next.kind === 'likely'
        ? { text: `${shortDate(next.local_date, todayDate)} · ${next.chancePct}%`, color: colorsV2.rain }
        : // "None through Tue 10/6", not "no rain": the ensemble has an edge,
          // and rain past it is rain these figures cannot see.
          { text: `None through ${shortDate(next.throughDate, todayDate)}` }

  const hasRain = lastRain !== null || nextValue !== null
  if (days.length === 0 && !hasRain) return null

  return (
    <Card
      title={days.length === 0 ? 'Rain' : `Next ${days.length} ${days.length === 1 ? 'day' : 'days'}`}
      link={days.length === 0 ? null : { label: 'Daily', onOpen: props.onOpenDaily }}
      gap={spacing.listGap}
    >
      {days.length === 0 || todayDate === null ? null : (
        <div style={{ ...row(spacing.listGapSm), alignItems: 'stretch' }}>
          {days.map((day) => (
            <DayTile
              key={day.local_date}
              day={day}
              todayDate={todayDate}
              isClimbingLocation={isClimbingLocation}
              onOpen={props.drawableDates?.has(day.local_date) === true ? () => props.onOpenDay(day.local_date) : null}
            />
          ))}
        </div>
      )}
      {!hasRain ? null : (
        <div style={{ ...row(spacing.cellPad), alignItems: 'flex-start' }}>
          {lastRain === null ? null : <Fact label="Last real rain" value={lastRain} />}
          {nextValue === null ? null : (
            <Fact label="Next likely rain" value={nextValue.text} {...(nextValue.color === undefined ? {} : { color: nextValue.color })} />
          )}
        </div>
      )}
    </Card>
  )
}

export function OverviewTab(props: OverviewTabProps) {
  return (
    <>
      <TodayCard props={props} />
      <ComingUpCard props={props} />
    </>
  )
}