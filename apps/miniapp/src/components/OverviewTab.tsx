import type { CSSProperties, ReactNode } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import {
  DRYNESS_LABEL,
  EM_DASH,
  HELD_BACK_LABEL,
  MAX_HOURS,
  MIN_HOURS,
  ROCK_TEMPERATURE_MECHANISM,
  dewPointMarginValue,
  formatHumidity,
  formatPrecipIn,
  formatTempF,
  measurements,
  modelName,
  readingNow,
  rockTypeLabel,
  skyDayIcon,
  summarizeReadings,
  type Conditions,
  type ForecastSnapshot,
  type HourlySeries,
  type Location,
  type RangeF,
  type ReadingsSummary,
  type RecentPrecip,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, cardV2 } from '../theme/styles.js'
import { formatTempDeg } from '../lib/format.js'
import { chartWindow, dayChance, lastRainText, nextDays, nextLikelyRain, shortDate, shortDay } from '../lib/overview.js'
import { formatSince, precipDays, precipSummary } from '../lib/precipHistory.js'
import { useNow } from '../hooks/useNow.js'
import { scoreRampColor } from './charts/chartStyle.js'
import { Sect } from './charts/liquid.js'
import { TodayChart } from './charts/TodayChart.js'
import { DryingClock } from './DryingClock.js'
import { SkyIcon } from './Icons.js'
import { ScoreBars } from './ScoreBars.js'
import { ScoreExplainerParts } from './ScoreExplainer.js'
import { InlineError, Skeleton } from './States.js'

/**
 * The Overview in the hybrid look (`docs/handoffs/design-mockups/weatherteam6-hybrid.html`,
 * owner 2026-10-19): the crag's name as the headline; then a glass card per
 * section — the score bars, Today, the next days, Score breakdown, Rain, Air,
 * Rock, and how the score works.
 *
 * **The hour's score is never alone.** The score bars print it beside the day's
 * good hours and every hour to come. 9am read 100 on a day rain arrived at 1pm
 * (owner, 2026-10-03) — the bars are what show the 1pm.
 *
 * **Every reading comes from `/conditions`**, the response the list card
 * reads, so a crag never shows one reading there and another here; the charts
 * read `/hourly`. **Sections fail independently** (§5).
 */

export type OverviewTabProps = {
  /** `YYYY-MM-DD`, the row the server flagged `is_today`. `null` until the forecast arrives. */
  todayDate: string | null
  isClimbingLocation: boolean
  location: Location | undefined
  forecast: {
    data: ForecastSnapshot[] | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
  }
  conditions:
    | {
        data: Conditions | null | undefined
        isPending: boolean
        isError: boolean
        refetch: () => void
      }
    | undefined
  hourly: { data: HourlySeries | undefined; isPending: boolean; isError: boolean; refetch: () => void }
  /** The past week's precipitation, for last rain. `undefined` until it arrives or when it failed. */
  recentPrecip: RecentPrecip | undefined
  severeAlertEvent: string | null
  alertsPending: boolean
  rangeF: RangeF
  /** Days the hourly charts can draw. `undefined` until `/hourly` answers. */
  drawableDates: ReadonlySet<string> | undefined
  onOpenDay: (localDate: string) => void
}

const sectCard: CSSProperties = { ...cardV2, padding: `${spacing.sectionGap}px 14px 14px` }

function Card({ title, aside, children }: { title: string; aside?: string | null; children: ReactNode }) {
  return (
    <section style={sectCard}>
      <Sect title={title} aside={aside ?? null} />
      {children}
    </section>
  )
}

type Stat = { label: string; value: string; unit?: string | null; color?: string; note?: string | null }

/**
 * Figures as tiles side by side, each with its label above it and its note
 * under it (owner, 2026-10-20: a label at one end of a card and its figure at
 * the other were hard to read together). Equal columns, a hairline between.
 */
function Stats({ items }: { items: readonly Stat[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, marginTop: '4px' }}>
      {items.map((s, i) => (
        <div
          key={s.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            minWidth: 0,
            padding: i === 0 ? '2px 12px 2px 0' : '2px 12px',
            borderLeft: i === 0 ? 'none' : `1px solid ${colorsV2.line}`,
          }}
        >
          <span style={typeV2.statLabel}>{s.label}</span>
          <b style={{ ...typeV2.statFigure, overflowWrap: 'anywhere', ...(s.color === undefined ? {} : { color: s.color }) }}>
            {s.value}
            {s.unit == null || s.value === EM_DASH ? null : (
              <small style={{ fontSize: '15px', fontWeight: 600, color: colorsV2.txt2, marginLeft: '3px' }}>{s.unit}</small>
            )}
          </b>
          {s.note == null ? null : <small style={typeV2.rowSmall}>{s.note}</small>}
        </div>
      ))}
    </div>
  )
}

/** The hour's readings, as every surface suppresses them. Null without readings to read. */
type Now = {
  summary: ReadingsSummary
  /** The day's score, suppressed as the hour's is. */
  dayScore: number | null
  dryness: string | null
  utcOffsetSeconds: number
  conditions: Conditions
}

function readNow(props: OverviewTabProps): Now | null {
  const data = props.conditions?.data
  if (data == null || data.readings === undefined) return null
  const r = data.readings
  const base = {
    utcOffsetSeconds: r.utc_offset_seconds,
    severeAlertEvent: props.severeAlertEvent,
    alertsPending: props.alertsPending,
    unavailableReason: r.unavailable_reason,
  }
  const summary = summarizeReadings({ ...base, reading: r.now, window: r.today?.window ?? null, rangeF: props.rangeF })
  return {
    summary,
    dayScore: summarizeReadings({ ...base, reading: r.today?.best ?? null, window: null }).score,
    dryness: summary.readings.find((f) => f.label === DRYNESS_LABEL)?.value ?? null,
    utcOffsetSeconds: r.utc_offset_seconds,
    conditions: data,
  }
}

/**
 * The hero: the crag's name as the screen's headline (owner, 2026-10-20: no
 * figures here; the cards under it carry every one). Under the name only what
 * stops the readings being read: a failed or empty conditions call, and the
 * qualifier and notes, among them the score hidden under a Severe+ alert.
 */
function Hero({ props, now }: { props: OverviewTabProps; now: Now | null }) {
  const name = props.location?.name ?? null
  let note: ReactNode = null
  if (props.isClimbingLocation) {
    // Nothing until the alerts settle (defect class 7): a note drawn first would miss the warning yet to arrive.
    const pending = props.conditions === undefined || props.conditions.isPending || props.alertsPending
    if (props.conditions?.isError === true) {
      note = <InlineError message="Couldn't load conditions." onRetry={props.conditions.refetch} />
    } else if (!pending) {
      if (now === null || now.summary.unavailableLine !== null) {
        note = <p style={typeV2.lead}>{now?.summary.unavailableLine ?? 'No conditions for today yet.'}</p>
      } else {
        const caveats = [now.summary.qualifier, ...now.summary.notes].filter((s): s is string => s !== null)
        note = caveats.length === 0 ? null : <p style={typeV2.lead}>{caveats.join(' · ')}</p>
      }
    }
  }
  return (
    <section data-hero="" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {name === null ? null : <h1 style={{ ...typeV2.heroName, margin: 0 }}>{name}</h1>}
      {note}
    </section>
  )
}

function ScoreBarsCard({ props }: { props: OverviewTabProps }) {
  const now = useNow()
  if (!props.isClimbingLocation || props.hourly.data === undefined) return null
  return (
    <ScoreBars
      series={props.hourly.data}
      nowMs={now}
      alerts={{ severeAlertEvent: props.severeAlertEvent, alertsPending: props.alertsPending }}
    />
  )
}

function TodayCard({ props, now: reading }: { props: OverviewTabProps; now: Now | null }) {
  const now = useNow()
  const { hourly, todayDate, isClimbingLocation } = props
  const window = reading?.summary.window ?? null
  // "No score left today" only when the score could have been shown: never under an alert, pending or active.
  const suppressed = props.alertsPending || props.severeAlertEvent !== null
  const aside =
    !isClimbingLocation || reading === null || reading.summary.unavailableLine !== null || suppressed
      ? null
      : [reading.dayScore === null ? null : `day ${reading.dayScore}`, window === null ? null : `good hours ${window.value}`]
          .filter((s) => s !== null)
          .join(' · ') || 'no score left today'

  let body: ReactNode
  if (hourly.isPending) {
    body = <Skeleton height={230} />
  } else if (hourly.isError) {
    body = <InlineError message="Couldn't load the hour-by-hour forecast." onRetry={hourly.refetch} />
  } else if (hourly.data === undefined || todayDate === null) {
    return null
  } else {
    const w = chartWindow(
      hourly.data,
      now,
      isClimbingLocation ? { severeAlertEvent: props.severeAlertEvent, alertsPending: props.alertsPending } : null,
    )
    body =
      w === null || w.hours.length === 0 ? (
        <p style={typeV2.body}>No hourly forecast right now.</p>
      ) : (
        <TodayChart window={w} nowMs={now} todayDate={todayDate} sky={hourly.data.sky?.hours ?? []} />
      )
  }
  return (
    <Card title="Today" aside={aside}>
      {body}
    </Card>
  )
}

/** Six days on: each day's sky, score, name, high and low, and chance of rain. A button when Hourly can draw it. */
function NextDaysCard({ props }: { props: OverviewTabProps }) {
  const { forecast, todayDate, hourly, isClimbingLocation } = props
  const aside = isClimbingLocation ? 'day score · high/low · chance of rain' : 'high/low · chance of rain'
  // The only place the Overview reads the daily forecast, so its failure is said here.
  if (forecast.isPending) return <Card title="Next days" aside={aside}><Skeleton height={110} /></Card>
  if (forecast.isError) {
    return (
      <Card title="Next days" aside={aside}>
        <InlineError message="Couldn't load the forecast." onRetry={forecast.refetch} />
      </Card>
    )
  }
  if (forecast.data === undefined) return null
  if (todayDate === null) {
    return (
      <Card title="Next days" aside={aside}>
        <p style={{ ...typeV2.body, margin: 0 }}>No reading for today yet.</p>
      </Card>
    )
  }
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
    6,
  )
  if (days.length === 0) return null
  const skyDays = hourly.data?.sky?.days ?? []
  return (
    <Card title="Next days" aside={aside}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gap: '4px', textAlign: 'center' }}>
        {days.map((day) => {
          const summary = skyDays.find((d) => d.local_date === day.local_date)?.summary ?? null
          const chance = hourly.data === undefined ? null : dayChance(hourly.data.hours, day.local_date)
          const open = props.drawableDates?.has(day.local_date) === true ? () => props.onOpenDay(day.local_date) : null
          const content = (
            <>
              {summary === null ? <span style={{ height: '22px' }} /> : <SkyIcon sky={skyDayIcon(summary)} size={22} />}
              {isClimbingLocation ? (
                <b style={{ ...typeV2.dayScore, margin: '4px 0 2px', color: day.score === null ? colorsV2.txtMuted : scoreRampColor(day.score) }}>
                  {day.score ?? EM_DASH}
                </b>
              ) : null}
              <span style={{ ...typeV2.daySmall, color: colorsV2.txt2 }}>{shortDay(day.local_date, todayDate)}</span>
              <span style={typeV2.daySmall}>
                {formatTempDeg(day.highC)}/{formatTempDeg(day.lowC)}
              </span>
              <span style={{ ...typeV2.daySmall, color: colorsV2.rain }}>{chance === null ? EM_DASH : formatHumidity(chance)}</span>
            </>
          )
          const style: CSSProperties = {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
            padding: '6px 0',
            borderRadius: '14px',
            minWidth: 0,
          }
          return open === null ? (
            <div key={day.local_date} style={style}>
              {content}
            </div>
          ) : (
            <button
              key={day.local_date}
              type="button"
              onClick={open}
              aria-label={`${shortDate(day.local_date, todayDate)}: ${day.score === null ? 'no score' : `score ${day.score}`}`}
              style={{ ...bareButton, ...style, width: 'auto' }}
            >
              {content}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

/** What is holding the score down, biggest first. Absent with the score, and when nothing costs a point. */
function BreakdownCard({ now }: { now: Now | null }) {
  const held = now?.summary.heldBack ?? null
  if (held === null || held.length === 0) return null
  return (
    <Card title={HELD_BACK_LABEL} aside="what is holding it back">
      <p style={{ ...typeV2.order, margin: 0 }}>
        {held.map((f, i) => (
          <span key={f.label}>
            {i === 0 ? null : <i style={{ fontStyle: 'normal', color: colorsV2.txtMuted, margin: '0 6px' }}>›</i>}
            {f.label}
          </span>
        ))}
      </p>
      <p style={{ ...typeV2.keyRow, margin: '6px 0 0' }}>{held.map((f) => `${f.label}: ${f.value}`).join(' · ')}</p>
    </Card>
  )
}

function RainCard({ props }: { props: OverviewTabProps }) {
  const now = useNow()
  const { recentPrecip, hourly, todayDate } = props
  const summary = recentPrecip === undefined ? null : precipSummary(recentPrecip, now)
  const last = summary === null || recentPrecip === undefined ? null : lastRainText(summary, precipDays(recentPrecip.hours).length)
  const next = hourly.data === undefined ? null : nextLikelyRain(hourly.data.hours, now)
  const nextStat: Stat | null =
    next === null || todayDate === null || next.kind === 'unknown'
      ? null
      : next.kind === 'likely'
        ? { label: 'Next rain', value: shortDate(next.local_date, todayDate), color: colorsV2.rain, note: `${next.chancePct}% chance` }
        : // "None likely", never "None": a 38% day is still rain worth knowing about, so its peak is
          // named, and rain past the ensemble's edge is rain these figures cannot see.
          {
            label: 'Next rain',
            value: 'None likely',
            note: [
              next.peak === null ? null : `highest ${next.peak.chancePct}% ${shortDate(next.peak.local_date, todayDate)}`,
              `through ${shortDate(next.throughDate, todayDate)}`,
            ]
              .filter((s): s is string => s !== null)
              .join(' · '),
          }
  const event = summary?.lastRealEvent ?? null
  const storm = event === null ? null : `${formatPrecipIn(event.totalMm)} over ${event.spanHours} h`
  const items = [last === null ? null : { label: 'Last rain', value: last, note: storm }, nextStat].filter(
    (s): s is Stat => s !== null,
  )
  if (items.length === 0) return null
  return (
    <Card title="Rain" aside="last real rain · next likely">
      <Stats items={items} />
    </Card>
  )
}

/** The hour's air, from the weather model it names. */
function AirCard({ props }: { props: OverviewTabProps }) {
  const now = useNow()
  const series = props.hourly.data
  if (series === undefined) return null
  const hour = readingNow(series.hours, now)
  if (hour === null) return null
  const mph = (kmh: number | null) => (kmh === null ? EM_DASH : String(Math.round(kmh / 1.609344)))
  return (
    <Card title="Air" aside={series.model === null ? null : modelName(series.model)}>
      <Stats
        items={[
          {
            label: 'Dew point',
            value: hour.dewpoint_c === null ? EM_DASH : formatTempF(hour.dewpoint_c),
            note: hour.temp_c === null ? null : `air ${formatTempF(hour.temp_c)}`,
          },
          { label: 'Humidity', value: formatHumidity(hour.humidity_pct) },
          {
            label: 'Wind',
            value: mph(hour.wind_kmh),
            unit: 'mph',
            note: hour.wind_gust_kmh === null ? null : `gusts ${mph(hour.wind_gust_kmh)} mph`,
          },
        ]}
      />
    </Card>
  )
}

/** The drying clock beside the rock's margin over its dew point and the hours since real rain. */
function RockCard({ props, now }: { props: OverviewTabProps; now: Now | null }) {
  const clock = useNow()
  const rockType = props.location?.rock_type ?? null
  if (!props.isClimbingLocation || rockType === null || now === null) return null
  const reading = now.conditions.readings?.now ?? null
  const summary = props.recentPrecip === undefined ? null : precipSummary(props.recentPrecip, clock)
  const since = summary?.hoursSinceReal ?? null
  // The measured span ("None in 3 days"), and null for an empty window: never a week asked for but not read.
  const noRealRain =
    summary === null || props.recentPrecip === undefined
      ? null
      : lastRainText(summary, precipDays(props.recentPrecip.hours).length)
  const margin = dewPointMarginValue(reading?.condensation_margin_c ?? null)
  const marginC = reading?.condensation_margin_c ?? null
  const rainModels = now.conditions.readings?.rain_models ?? null
  const mech = measurements({
    hour: null,
    weatherModel: null,
    reading,
    readingModel: now.conditions.readings?.model ?? null,
    rainModels,
  }).notes.filter((n) => n !== ROCK_TEMPERATURE_MECHANISM) // rock temperature is not shown (owner, 2026-10-19)
  const rock = rockTypeLabel(rockType)
  return (
    <Card title="Rock" aside="drying · condensation">
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <DryingClock
          hours={since}
          rockType={rockType}
          dryness={now.dryness}
          label={
            since !== null
              ? `Drying clock: ${formatSince(since)} since real rain`
              : `Drying clock: ${noRealRain ?? 'no rain record'}`
          }
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Stats
            items={[
              {
                label: 'Rock vs dew point',
                value: margin ?? EM_DASH,
                ...(marginC !== null && marginC < 2 ? { color: colorsV2.poorInk } : {}),
              },
              { label: 'Since real rain', value: since === null ? (noRealRain ?? EM_DASH) : formatSince(since) },
            ]}
          />
          <p style={{ ...typeV2.keyRow, lineHeight: '16px', margin: '10px 0 0', paddingTop: '10px', borderTop: `1px solid ${colorsV2.line}` }}>
            {`${rock} drying table: ${rockDryingSpan(rockType)}.${mech.length === 0 ? '' : ` ${mech.join(' ')}`}`}
          </p>
        </div>
      </div>
    </Card>
  )
}

function rockDryingSpan(rockType: NonNullable<Location['rock_type']>): string {
  return `${MIN_HOURS[rockType]}–${MAX_HOURS[rockType]} h`
}

function ExplainerCard({ rangeF }: { rangeF: RangeF }) {
  return (
    <section style={sectCard}>
      <details>
        <summary style={{ ...typeV2.heroSide, fontSize: '15px', color: colorsV2.brandInk, cursor: 'pointer', padding: '0 0 4px' }}>
          How the score works
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.listGapLg}px`, marginTop: `${spacing.listGap}px` }}>
          <ScoreExplainerParts rangeF={rangeF} />
        </div>
      </details>
    </section>
  )
}

export function OverviewTab(props: OverviewTabProps) {
  const now = props.isClimbingLocation ? readNow(props) : null
  return (
    <>
      <Hero props={props} now={now} />
      <ScoreBarsCard props={props} />
      <TodayCard props={props} now={now} />
      <NextDaysCard props={props} />
      <BreakdownCard now={now} />
      <RainCard props={props} />
      <AirCard props={props} />
      <RockCard props={props} now={now} />
      {props.isClimbingLocation ? <ExplainerCard rangeF={props.rangeF} /> : null}
    </>
  )
}
