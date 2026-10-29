import type { CSSProperties, ReactNode } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import {
  DRYNESS_LABEL,
  EM_DASH,
  HELD_BACK_LABEL,
  WET_STRENGTH_LABEL,
  formatElevationFt,
  formatHumidity,
  formatLocalHour,
  formatPrecipIn,
  formatTempF,
  modelName,
  readingNow,
  rockGuide,
  rockTypeLabel,
  skyDayIcon,
  summarizeReadings,
  type Conditions,
  type ForecastSnapshot,
  type HourlySeries,
  type Location,
  type RangeF,
  type ReadingsSummary,
  type RainNow,
  type RecentPrecip,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, cardV2 } from '../theme/styles.js'
import { formatTempDeg } from '../lib/format.js'
import { FLIP_ATTR } from '../lib/flip.js'
import { CRAG_FLY_ATTR } from '../lib/cragFly.js'
import { findToday } from '../lib/forecast.js'
import { chartWindow, dayChance, lastRainText, nextDays, nextLikelyRain, rainDueText, shortDate, shortDay, shortSpan } from '../lib/overview.js'
import { formatSince, precipDays, precipSummary } from '../lib/precipHistory.js'
import { breakdownCount, breakdownRows, type BreakdownRow } from '../lib/scoreBreakdown.js'
import { useNow } from '../hooks/useNow.js'
import { useNavigate } from '../hooks/useNavigate.js'
import { RainNowPill } from './RainNowPill.js'
import { scoreRampColor } from './charts/chartStyle.js'
import { Sect } from './charts/liquid.js'
import { TodayChart } from './charts/TodayChart.js'
import { coordText } from './DetailHeader.js'
import { SkyIcon } from './Icons.js'
import { RollingFigure, usePreviousFigure } from './RollingFigure.js'
import { SCORE_EXPLAINER_PATH } from './ScoreExplainer.js'
import { InlineError, Skeleton } from './States.js'

/**
 * The crag Overview (owner, 2026-10-29, the overview rework's "A · revised"):
 * four sections — the hero, Today, Next days, Right now.
 *
 * **The hero shows one score, the hour covering now**, named beside it ("Score
 * at 2pm"). The day's score is only in Next days' Today column. To the score's
 * right sit four readings — Dryness, Rock, Air, Good hours — and under it the
 * Score breakdown, closed, which explains each cause and when it eases.
 *
 * **Every reading comes from `/conditions`**, the response the list card
 * reads, so a crag never shows one reading there and another here; the charts
 * and the weather figures read `/hourly`. **Sections fail independently** (§5).
 * How the score works is on Profile, reached from the breakdown; friction's
 * estimate note is on the Rock tab.
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
  /** Radar's rain at every saved place (#313). `undefined` until it arrives or when it failed. */
  rainNow?: RainNow | null
  rangeF: RangeF
  /** Days the hourly charts can draw. `undefined` until `/hourly` answers. */
  drawableDates: ReadonlySet<string> | undefined
  onOpenDay: (localDate: string) => void
  /** Right now's figures open the tab that draws them. */
  onOpenTab: (tab: 'precip' | 'hourly') => void
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

const mph = (kmh: number): number => Math.round(kmh / 1.609344)

/** The hour's readings. Null without readings to read. */
type Now = {
  summary: ReadingsSummary
  dryness: string | null
  readingAt: string | null
  utcOffsetSeconds: number
  conditions: Conditions
}

function readNow(props: OverviewTabProps): Now | null {
  const data = props.conditions?.data
  if (data == null || data.readings === undefined) return null
  const r = data.readings
  const summary = summarizeReadings({
    utcOffsetSeconds: r.utc_offset_seconds,
    unavailableReason: r.unavailable_reason,
    reading: r.now,
    window: r.today?.window ?? null,
    rangeF: props.rangeF,
  })
  return {
    summary,
    dryness: summary.readings.find((f) => f.label === DRYNESS_LABEL)?.value ?? null,
    readingAt: r.now?.valid_at ?? null,
    utcOffsetSeconds: r.utc_offset_seconds,
    conditions: data,
  }
}

/** The hero: the crag's name, the hour's score large, four readings beside it, and the breakdown under it. */
function Hero({ props, now }: { props: OverviewTabProps; now: Now | null }) {
  const clock = useNow()
  const { location, hourly, recentPrecip, forecast } = props
  const hour = hourly.data === undefined ? null : readingNow(hourly.data.hours, clock)
  const name = location?.name ?? null
  // Radar's word on rain falling now (#313); it does not wait on conditions or alerts.
  const rain =
    location === undefined ? null : (
      <RainNowPill
        rainNow={props.rainNow}
        locationId={location.id}
        utcOffsetSeconds={props.conditions?.data?.readings?.utc_offset_seconds ?? hourly.data?.utc_offset_seconds ?? null}
        size="hero"
      />
    )

  const summary = recentPrecip === undefined ? null : precipSummary(recentPrecip, clock)
  const lastRain = summary === null || recentPrecip === undefined ? null : lastRainText(summary, precipDays(recentPrecip.hours).length)
  // Rain on its way can already read Wet (#402); it is not said while rain is falling now.
  const rainDue =
    hourly.data === undefined || lastRain === 'Now' ? null : rainDueText(hourly.data.hours, clock, hourly.data.utc_offset_seconds)
  const today = findToday(forecast.data)
  const air: Cell = {
    label: 'Air',
    value: hour?.temp_c == null ? EM_DASH : formatTempF(hour.temp_c),
    // The day's extremes, labelled: unlabelled, the pair reads as now the moment the hour is absent.
    note:
      today === null || (today.temp_c_max === null && today.temp_c_min === null)
        ? null
        : `high ${formatTempDeg(today.temp_c_max)} · low ${formatTempDeg(today.temp_c_min)}`,
  }

  if (!props.isClimbingLocation) {
    // A city has no score: the hour's air temperature takes the figure, and the day's labelled high and low sit beside it.
    const weather = [
      lastRain === null ? null : `Last rain: ${lastRain}`,
      rainDue,
      hour?.humidity_pct == null ? null : `Humidity ${formatHumidity(hour.humidity_pct)}`,
      hour?.wind_kmh == null ? null : `wind ${mph(hour.wind_kmh)} mph`,
      hour?.wind_gust_kmh == null ? null : `gusts ${mph(hour.wind_gust_kmh)} mph`,
    ].filter((s): s is string => s !== null)
    return (
      <HeroFrame name={name} rain={rain}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
          <span style={{ ...typeV2.heroScore, fontSize: '112px', color: colorsV2.txt1 }}>
            {hour?.temp_c == null ? EM_DASH : formatTempDeg(hour.temp_c)}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
            <span style={typeV2.heroSide}>Air now</span>
            {today === null ? null : (
              <span style={typeV2.heroSide}>
                High {formatTempDeg(today.temp_c_max)} · Low {formatTempDeg(today.temp_c_min)}
              </span>
            )}
            {location === undefined ? null : (
              <small style={typeV2.heroSideSm}>
                {[location.elevation_m === null ? null : formatElevationFt(location.elevation_m), coordText(location.lat, location.lon)]
                  .filter((s) => s !== null)
                  .join(' · ')}
              </small>
            )}
          </div>
        </div>
        {weather.length === 0 ? null : <p style={{ ...typeV2.lead, margin: '14px 0 0' }}>{weather.join(' · ')}</p>}
      </HeroFrame>
    )
  }

  const pending = props.conditions === undefined || props.conditions.isPending
  if (pending && props.conditions?.isError !== true) {
    return (
      <HeroFrame name={name} rain={rain}>
        <Skeleton height={124} />
      </HeroFrame>
    )
  }
  if (props.conditions?.isError === true) {
    return (
      <HeroFrame name={name} rain={rain}>
        <InlineError message="Couldn't load conditions." onRetry={props.conditions.refetch} />
      </HeroFrame>
    )
  }
  if (now === null || now.summary.unavailableLine !== null) {
    return (
      <HeroFrame name={name} rain={rain}>
        <p style={typeV2.lead}>{now?.summary.unavailableLine ?? 'No conditions for today yet.'}</p>
      </HeroFrame>
    )
  }

  const at = now.readingAt === null ? null : formatLocalHour(now.readingAt, now.utcOffsetSeconds)
  const since = summary?.hoursSinceReal ?? null
  const rockType = location?.rock_type ?? null
  const guide = rockType === null ? null : rockGuide(rockType)
  const todayWindow = now.conditions.readings?.today?.window ?? null
  const cells: Cell[] = [
    {
      label: DRYNESS_LABEL,
      value: now.dryness ?? EM_DASH,
      note: since !== null ? `${formatSince(since)} since real rain` : lastRain === null ? null : `real rain: ${lastRain.toLowerCase()}`,
    },
    {
      label: 'Rock',
      value: rockType === null || rockType === 'unknown' ? 'Not recorded' : rockTypeLabel(rockType),
      note: guide === null ? null : `${WET_STRENGTH_LABEL[guide.whenWet].toLowerCase()} when wet`,
    },
    air,
    {
      label: 'Good hours',
      // Through the summary, so the window is said exactly where the readings say it.
      value: now.summary.window === null ? EM_DASH : shortSpan(todayWindow, now.utcOffsetSeconds),
      note: now.summary.window === null || todayWindow === null ? null : `${todayWindow.hours} ${todayWindow.hours === 1 ? 'hour' : 'hours'}`,
    },
  ]
  const caveats = [rainDue, now.summary.qualifier, ...now.summary.notes].filter((s): s is string => s !== null)

  return (
    <HeroFrame name={name} rain={rain} when={at === null ? null : `Score at ${at}`}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', alignItems: 'center', columnGap: '18px', marginTop: '8px' }}>
        <HeroScore score={now.summary.score} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '12px',
            borderLeft: `1px solid ${colorsV2.line}`,
            paddingLeft: '16px',
          }}
        >
          {cells.map((c) => (
            <ReadingCell key={c.label} cell={c} />
          ))}
        </div>
      </div>
      {caveats.length === 0 ? null : <p style={{ ...typeV2.keyRow, margin: '12px 0 0' }}>{caveats.join(' · ')}</p>}
      <Breakdown props={props} now={now} />
    </HeroFrame>
  )
}

type Cell = { label: string; value: string; note: string | null }

function ReadingCell({ cell }: { cell: Cell }) {
  return (
    <div style={{ display: 'grid', gap: '1px', minWidth: 0 }}>
      <span style={typeV2.statLabel}>{cell.label}</span>
      <b style={{ ...typeV2.readFigure, lineHeight: '22px' }}>{cell.value}</b>
      {cell.note === null ? null : <small style={{ ...typeV2.heroSideSm, color: colorsV2.txtMuted }}>{cell.note}</small>}
    </div>
  )
}

function HeroFrame({ name, rain, when = null, children }: { name: string | null; rain: ReactNode; when?: string | null; children: ReactNode }) {
  return (
    <section data-hero="" style={sectCard}>
      {name === null ? null : (
        <h1 {...{ [CRAG_FLY_ATTR]: 'name' }} style={{ ...typeV2.heroName, margin: 0, width: 'fit-content' }}>
          {name}
        </h1>
      )}
      {when === null ? null : <p style={{ ...typeV2.heroWhen, margin: '4px 0 0' }}>{when}</p>}
      {rain}
      {children}
    </section>
  )
}

/** The hour's score, rolling to a new value; a dash in the score's place while it is withheld. */
function HeroScore({ score }: { score: number | null }) {
  const value = score === null ? EM_DASH : String(score)
  const was = usePreviousFigure(value)
  return (
    <span
      {...{ [FLIP_ATTR]: 'score', [CRAG_FLY_ATTR]: 'score' }}
      style={{
        ...typeV2.heroScore,
        ...(value.length >= 3 ? { fontSize: 'clamp(72px, 24vw, 108px)' } : {}),
        color: score === null ? colorsV2.txtMuted : scoreRampColor(score),
        display: 'inline-block',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <RollingFigure value={value} from={was} />
    </span>
  )
}

/**
 * What is costing the hour's score points, closed until asked. Absent with the
 * score (`heldBack` is null whenever the score is), and when nothing costs a
 * point. Each cause's rule and when it eases; never how much it costs.
 */
function Breakdown({ props, now }: { props: OverviewTabProps; now: Now }) {
  const navigate = useNavigate()
  const held = now.summary.heldBack
  const reading = now.conditions.readings?.now ?? null
  const limits = reading?.held_back_by ?? null
  if (held === null || held.length === 0 || reading === null || limits == null) return null
  const series = props.hourly.data
  const rows = breakdownRows({
    limits,
    now: reading,
    readings: series?.readings?.hours ?? [],
    hours: series?.hours ?? [],
    sameModel: series !== undefined && series.model !== null && series.model === now.conditions.readings?.model,
    rangeF: props.rangeF,
    utcOffsetSeconds: now.utcOffsetSeconds,
    todayDate: props.todayDate,
  })
  return (
    <details className="wt6-why" style={{ borderTop: `1px solid ${colorsV2.line}`, marginTop: '14px', paddingTop: '10px' }}>
      <summary
        style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '32px', cursor: 'pointer', ...typeV2.whyFigure }}
      >
        <span>{HELD_BACK_LABEL}</span>
        <span style={{ ...typeV2.heroSideSm, color: colorsV2.txtMuted, marginLeft: 'auto' }}>{breakdownCount(rows.length)}</span>
      </summary>
      <ol style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: '10px' }}>
        {rows.map((row, i) => (
          <WhyRow key={row.limit} n={i + 1} row={row} />
        ))}
      </ol>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '8px', ...typeV2.note }}>
        <span>Biggest cost first</span>
        <a
          href={SCORE_EXPLAINER_PATH}
          onClick={(e) => {
            e.preventDefault()
            navigate(SCORE_EXPLAINER_PATH)
          }}
          style={{ color: colorsV2.brandInk, textDecoration: 'none' }}
        >
          How the score works ›
        </a>
      </div>
    </details>
  )
}

function WhyRow({ n, row }: { n: number; row: BreakdownRow }) {
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '22px minmax(0, 1fr)',
        columnGap: '10px',
        rowGap: '4px',
        padding: '10px 12px',
        borderRadius: '16px',
        background: colorsV2.raised,
      }}
    >
      <span style={{ ...typeV2.whyFigure, color: colorsV2.txtMuted, gridRow: 'span 4' }}>{n}</span>
      <p style={{ ...typeV2.whyTitle, margin: 0, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <span>{row.label}</span>
        {row.figure === null ? null : <span style={typeV2.whyFigure}>{row.figure}</span>}
      </p>
      <p style={{ ...typeV2.whyText, margin: 0 }}>{row.rule}</p>
      <p style={{ ...typeV2.whyText, margin: 0 }}>{row.meaning}</p>
      {row.eases === null ? null : <p style={{ ...typeV2.whyText, color: colorsV2.brandInk, margin: 0 }}>{row.eases}</p>}
    </li>
  )
}

function TodayCard({ props, now: reading }: { props: OverviewTabProps; now: Now | null }) {
  const now = useNow()
  const { hourly, todayDate, isClimbingLocation } = props
  const window = reading?.summary.window ?? null
  const aside =
    !isClimbingLocation || reading === null || reading.summary.unavailableLine !== null || window === null
      ? null
      : `good hours ${window.value}`

  let body: ReactNode
  if (hourly.isPending) {
    body = <Skeleton height={230} />
  } else if (hourly.isError) {
    body = <InlineError message="Couldn't load the hour-by-hour forecast." onRetry={hourly.refetch} />
  } else if (hourly.data === undefined || todayDate === null) {
    return null
  } else {
    const w = chartWindow(hourly.data, now, isClimbingLocation)
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
        }
      : null,
    6,
    true,
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

type Figure = { label: string; value: string; note: string | null; tab: 'precip' | 'hourly'; tabLabel: string }

/** Last rain, next rain and wind, each opening the tab that draws it; then where the figures came from. */
function RightNowCard({ props }: { props: OverviewTabProps }) {
  const now = useNow()
  const { recentPrecip, hourly, todayDate } = props
  const series = hourly.data
  const summary = recentPrecip === undefined ? null : precipSummary(recentPrecip, now)
  const lastText = summary === null || recentPrecip === undefined ? null : lastRainText(summary, precipDays(recentPrecip.hours).length)
  const event = summary?.lastRealEvent ?? null
  const lastDate = summary?.lastReal?.valid_at_local.slice(0, 10) ?? null

  let last: Figure['value'] = EM_DASH
  let lastNote: string | null = null
  if (lastText === 'Now') {
    last = 'Now'
  } else if (summary?.hoursSinceReal != null && lastDate !== null && todayDate !== null) {
    last = shortDay(lastDate, todayDate)
    lastNote = [event === null ? null : formatPrecipIn(event.totalMm), `${formatSince(summary.hoursSinceReal)} ago`]
      .filter((s): s is string => s !== null)
      .join(' · ')
  } else if (lastText !== null) {
    // "None in 7 days": the measured span, never a week asked for but not read.
    last = 'None'
    lastNote = lastText.replace(/^None /, '')
  }

  const next = series === undefined ? null : nextLikelyRain(series.hours, now)
  let nextValue = EM_DASH
  let nextNote: string | null = null
  if (next !== null && todayDate !== null && series !== undefined) {
    if (next.kind === 'likely') {
      const from = formatLocalHour(next.from_valid_at, series.utc_offset_seconds)
      nextValue = shortDay(next.local_date, todayDate)
      nextNote = [`${next.chancePct}%`, from === null ? null : `from ${from}`].filter((s): s is string => s !== null).join(' · ')
    } else if (next.kind === 'none') {
      // "None likely", never "None": rain past the ensemble's edge is rain these figures cannot see.
      nextValue = 'None likely'
      nextNote = `through ${shortDay(next.throughDate, todayDate)}`
    }
  }

  const hour = series === undefined ? null : readingNow(series.hours, now)
  const figures: Figure[] = [
    { label: 'Last rain', value: last, note: lastNote, tab: 'precip', tabLabel: 'Precip' },
    { label: 'Next rain', value: nextValue, note: nextNote, tab: 'precip', tabLabel: 'Precip' },
    {
      label: 'Wind',
      value: hour?.wind_kmh == null ? EM_DASH : `${mph(hour.wind_kmh)} mph`,
      note: hour?.wind_gust_kmh == null ? null : `gusts ${mph(hour.wind_gust_kmh)}`,
      tab: 'hourly',
      tabLabel: 'Hourly',
    },
  ]
  if (figures.every((f) => f.value === EM_DASH) && series === undefined && recentPrecip === undefined) return null

  // Named from the responses: the air model `/hourly` chose, and the drying clock's rain models
  // by name, since the hero's Dryness rests on them (`dryingRainMechanism`'s rule).
  const rainModels = props.conditions?.data?.readings?.rain_models ?? null
  const rainNames = rainModels === null ? [] : [...new Set(rainModels.map(modelName))]
  const sources = [
    series?.model == null ? null : `Air: ${modelName(series.model)}`,
    rainNames.length === 0 ? null : rainNames.length === 1 ? `rain: ${rainNames[0]}` : `rain: median of ${rainNames.join(', ')}`,
  ].filter((s): s is string => s !== null)

  return (
    <Card title="Right now">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' }}>
        {figures.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => props.onOpenTab(f.tab)}
            aria-label={`${f.label}: ${f.value}${f.note === null ? '' : `, ${f.note}`}. Open ${f.tabLabel}`}
            style={{
              ...bareButton,
              display: 'grid',
              alignContent: 'start',
              gap: '1px',
              padding: '8px 8px 10px',
              borderRadius: '16px',
              background: colorsV2.raised,
              minWidth: 0,
            }}
          >
            <span style={typeV2.statLabel}>{f.label}</span>
            <b style={{ ...typeV2.readFigure, fontSize: '24px', lineHeight: '26px' }}>{f.value}</b>
            {f.note === null ? null : <small style={typeV2.keyRow}>{f.note}</small>}
            <em style={{ ...typeV2.keyRow, fontStyle: 'normal', color: colorsV2.brandInk, marginTop: '3px' }}>{f.tabLabel} ›</em>
          </button>
        ))}
      </div>
      {sources.length === 0 ? null : <p style={{ ...typeV2.keyRow, margin: '10px 2px 0' }}>{sources.join(' · ')}</p>}
    </Card>
  )
}

export function OverviewTab(props: OverviewTabProps) {
  const now = props.isClimbingLocation ? readNow(props) : null
  return (
    <>
      <Hero props={props} now={now} />
      <TodayCard props={props} now={now} />
      <NextDaysCard props={props} />
      <RightNowCard props={props} />
    </>
  )
}
