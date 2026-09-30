import type { ReactNode } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { formatHumidity, type HourlySeries, type RecentPrecip } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, cardV2, row, stack } from '../theme/styles.js'
import { formatTempRangeF } from '../lib/format.js'
import {
  dayChance,
  lastRainText,
  nextDays,
  nextLikelyRain,
  shortDate,
  todayChart,
  type NextDay,
} from '../lib/overview.js'
import { precipDays, precipSummary } from '../lib/precipHistory.js'
import { useNow } from '../hooks/useNow.js'
import { scoreRampColor } from './charts/chartStyle.js'
import { TODAY_CHART_MIN_H, TodayChart } from './charts/TodayChart.js'
import { InlineError, Skeleton } from './States.js'

/**
 * The Overview tab under the hero, owner's pick 2026-09-30 (mockup D+):
 * **Today** — the day as one chart, temperature coloured by the hour's score
 * with dew point and rain chance; **Next 3 days** — a column
 * each, with the day's range, rain chance, score and good hours; and rain —
 * when real rain last fell and when rain is next likely.
 *
 * **One card per section, nothing boxed inside it.** The sections sit on the
 * same card surface as every other section in the app; a box round every
 * figure inside them is what made the earlier layout feel stiff, and the page
 * background alone read as a different screen (owner, 2026-09-30).
 *
 * "Hourly ›" and "Daily ›" open those tabs, and a day column opens its hours.
 * The decisions about *what* each part says live in `lib/overview.ts`, where
 * they are tested; this lays them out.
 *
 * **The sections fail independently**, like every section on this screen
 * (§5). The chart and the day scores read `/hourly`; the columns' dates and
 * temperatures read `/forecast`; last rain reads `/recent-precip`.
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
  /** Grow to take the screen's spare height. It goes to the chart, never between sections. */
  fill?: boolean
}

const hairline = { height: '1px', backgroundColor: colorsV2.raised } as const

function Section({
  title,
  link,
  grow,
  children,
}: {
  title: string
  link: { label: string; onOpen: () => void } | null
  grow: boolean
  children: ReactNode
}) {
  return (
    <section style={{ ...cardV2, ...stack(spacing.listGap), ...(grow ? { flex: '1 1 auto' } : {}) }}>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
        <h2 style={typeV2.cardTitle}>{title}</h2>        {link === null ? null : (
          <button type="button" onClick={link.onOpen} style={{ ...bareButton, width: 'auto', flex: '0 0 auto', whiteSpace: 'nowrap', ...typeV2.cardLink }}>
            {link.label} ›
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function TodaySection({ props }: { props: OverviewTabProps }) {
  const now = useNow()
  const { hourly, todayDate, isClimbingLocation } = props
  const fill = props.fill === true

  let body: ReactNode
  if (hourly.isPending || (todayDate === null && hourly.data !== undefined)) {
    body = <Skeleton height={TODAY_CHART_MIN_H} />
  } else if (hourly.isError) {
    body = <InlineError message="Couldn't load the hour-by-hour forecast." onRetry={hourly.refetch} />
  } else if (hourly.data === undefined || todayDate === null) {
    return null
  } else {
    const hours = todayChart(
      hourly.data,
      todayDate,
      isClimbingLocation ? { severeAlertEvent: props.severeAlertEvent, alertsPending: props.alertsPending } : null,
    )
    body =
      hours.length === 0 ? (
        <p style={typeV2.body}>No hour-by-hour forecast for today.</p>
      ) : (
        <TodayChart hours={hours} nowMs={now} utcOffsetSeconds={hourly.data.utc_offset_seconds} fill={fill} />
      )
  }

  return (
    <Section title="Today" link={{ label: 'Hourly', onOpen: props.onOpenHourly }} grow={fill}>
      {body}
    </Section>
  )
}

/** One day as a column. A button only when the Hourly charts can draw the day. */
function DayColumn({
  day,
  todayDate,
  chancePct,
  first,
  onOpen,
}: {
  day: NextDay
  todayDate: string
  chancePct: number | null
  first: boolean
  onOpen: (() => void) | null
}) {
  // Three tiers, in the order a reader asks: which day, how good, then why.
  // The details are one muted size so they read as one group under the score.
  const content = (
    <>
      <span style={{ ...typeV2.rowTitle, fontSize: '15px' }}>{shortDate(day.local_date, todayDate)}</span>
      {/*
        Absent rather than dashed when there is no score: suppressed under an
        alert (the banner above says why), still loading, a city, or past the
        run — none of them is a score of nothing.
      */}
      {day.score === null ? null : (
        <span style={{ ...row(spacing.listGapSm), alignItems: 'baseline' }}>
          <span style={{ ...typeV2.tileFigure, fontSize: '24px', lineHeight: '28px', color: scoreRampColor(day.score) }}>{day.score}</span>
          <span style={typeV2.legendSm}>score</span>
        </span>
      )}
      <span style={{ ...stack(spacing.micro) }}>
        {/* One line where it fits; the rain wraps under the range on a narrow phone. */}
        <span style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
          <span style={typeV2.dayChip}>{formatTempRangeF(day.lowC, day.highC)}</span>
          {chancePct === null ? null : (
            <span style={{ ...typeV2.dayChip, color: colorsV2.rain }}>{formatHumidity(chancePct)} rain</span>
          )}
        </span>
        {day.window === null ? null : (
          <span style={typeV2.legendSm}>{day.window === 'None' ? 'No good hours' : `Good ${day.window.charAt(0).toLowerCase()}${day.window.slice(1)}`}</span>
        )}
      </span>
    </>
  )
  const style = {
    ...stack(spacing.tight),
    flex: '1 1 0',
    minWidth: 0,
    ...(first ? {} : { borderLeft: `1px solid ${colorsV2.raised}`, paddingLeft: `${spacing.cellPad}px` }),
  }
  return onOpen === null ? (
    <div style={style}>{content}</div>
  ) : (
    <button type="button" onClick={onOpen} style={{ ...bareButton, ...style, width: 'auto' }}>
      {content}
    </button>
  )
}

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ ...stack(spacing.micro), flex: '1 1 auto', minWidth: 0 }}>
      <span style={{ ...typeV2.factLabel, fontSize: '13px' }}>{label}</span>
      <span style={{ ...typeV2.factValue, fontSize: '13px', whiteSpace: 'nowrap', ...(color === undefined ? {} : { color }) }}>{value}</span>
    </div>
  )
}

function ComingUpSection({ props }: { props: OverviewTabProps }) {
  const now = useNow()
  const { forecast, todayDate, hourly, isClimbingLocation, recentPrecip } = props

  // Pending and failed are the hero's to report: the columns share its
  // forecast query, and a second copy of the same error reads as two failures.
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
    <Section
      title={days.length === 0 ? 'Rain' : `Next ${days.length} ${days.length === 1 ? 'day' : 'days'}`}
      link={days.length === 0 ? null : { label: 'Daily', onOpen: props.onOpenDaily }}
      grow={false}
    >
      {days.length === 0 || todayDate === null ? null : (
        <div style={{ ...row(0), alignItems: 'stretch' }}>
          {days.map((day, i) => (
            <DayColumn
              key={day.local_date}
              day={day}
              todayDate={todayDate}
              chancePct={hourly.data === undefined ? null : dayChance(hourly.data.hours, day.local_date)}
              first={i === 0}
              onOpen={props.drawableDates?.has(day.local_date) === true ? () => props.onOpenDay(day.local_date) : null}
            />
          ))}
        </div>
      )}
      {!hasRain ? null : (
        <>
          {days.length === 0 ? null : <div aria-hidden style={hairline} />}
          <div style={{ ...row(spacing.cellPad), alignItems: 'flex-start' }}>
            {lastRain === null ? null : <Fact label="Last real rain" value={lastRain} />}
            {nextValue === null ? null : (
              <Fact label="Next likely rain" value={nextValue.text} {...(nextValue.color === undefined ? {} : { color: nextValue.color })} />
            )}
          </div>
        </>
      )}
    </Section>
  )
}

export function OverviewTab(props: OverviewTabProps) {
  return (
    <>
      <TodaySection props={props} />
      <ComingUpSection props={props} />
    </>
  )
}
