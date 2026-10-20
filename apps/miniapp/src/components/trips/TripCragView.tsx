import { useState } from 'react'
import { useNavigate } from '../../hooks/useNavigate.js'
import { colors, colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import {
  AGREEMENT_LABEL,
  AGREEMENT_MEANING,
  EM_DASH,
  formatPrecipIn,
  mmToIn,
  openMeteoModels,
  type TripOutlook,
} from '@weatherteam6/types'
import { typeV2, withOpacity } from '../../theme/tokens.css.js'
import { bareButton, choicePill, row, stack, wellV2 } from '../../theme/styles.js'
import { glassTile } from '../../theme/glass.js'
import { formatTempDeg } from '../../lib/format.js'
import { hourlyDayPath } from '../../lib/backTarget.js'
import type { DayReadings } from '../../lib/overview.js'
import {
  coverageLabel,
  dateLabel,
  dayTrendSpan,
  dayMonthLabel,
  deviceToday,
  forecastOpens,
  formatShare,
  hasDayTrend,
  highChangeChip,
  outlookState,
  rainChangeChip,
  readingWords,
  shortDayLabel,
  tripDayTiles,
  type DayWeather,
  type TrendSeries,
  type TripDayTile,
} from '../../lib/trips.js'
import { scoreRampColor } from '../charts/chartStyle.js'
import { sectCard } from '../charts/DayCharts.js'
import { GuideCard } from '../guidebook/parts.js'
import { Stats } from '../StatTiles.js'
import { InlineError, Skeleton } from '../States.js'
import { TripDayTrendChart } from './TripDayTrendChart.js'
import { TripTrendChart } from './TripTrendChart.js'

export type QueryState<T> = { data: T | undefined; isPending: boolean; isError: boolean; refetch: () => void }

/**
 * One crag's trip, drawn to the hybrid mockup (Phase 4b): a glass card of day
 * tiles with the tapped day under them, the rain over the trip, and how the
 * forecast has moved. Weather on every tile is the trip outlook's; scores and
 * words are the crag's `/hourly` readings (`tripDayTiles`).
 */
export function TripCragView({
  locationId,
  startDate,
  dates,
  today,
  outlook,
  readings,
  isCrag,
  scoresFailed,
  trend,
}: {
  locationId: string
  startDate: string
  dates: readonly string[]
  today: string
  outlook: QueryState<TripOutlook | undefined>
  /** `null` while `/hourly` or alerts load, on failure, and for a location that is not a crag. */
  readings: DayReadings | null
  isCrag: boolean
  /** The crag's `/hourly` failed: a retry, said once above the days. `null` otherwise. */
  scoresFailed: (() => void) | null
  trend: QueryState<TrendSeries>
}) {
  if (outlook.isPending) return <Skeleton height={180} />
  if (outlook.isError) {
    return (
      <GuideCard title={null}>
        <InlineError message="Couldn't load the trip forecast." onRetry={outlook.refetch} />
      </GuideCard>
    )
  }

  const state = outlookState(outlook.data)
  return (
    <div style={stack(spacing.listGapLg)}>
      {scoresFailed === null ? null : (
        <GuideCard title={null}>
          <InlineError message="Couldn't load the scores." onRetry={scoresFailed} />
        </GuideCard>
      )}
      {state.kind === 'unavailable' ? (
        <GuideCard title={null}>
          <InlineError message="Couldn't load the forecast for this crag." onRetry={outlook.refetch} />
        </GuideCard>
      ) : state.kind === 'notYet' ? (
        <GuideCard title={null}>
          <p style={typeV2.body}>{opensLine(startDate, today)}</p>
        </GuideCard>
      ) : (
        <ScoredDays
          locationId={locationId}
          tiles={tripDayTiles({ dates, outlook: state.outlook.days, readings, isCrag, today })}
          outlook={state.outlook}
        />
      )}
      <TrendCard trend={trend} />
    </div>
  )
}

export function opensLine(startDate: string, today: string): string {
  const opens = forecastOpens(startDate, today)
  return opens === null ? 'No forecast for these days yet.' : `Forecast opens ${dateLabel(opens)}.`
}

function ScoredDays({
  locationId,
  tiles,
  outlook,
}: {
  locationId: string
  tiles: TripDayTile[]
  outlook: Extract<TripOutlook, { days: unknown[] }>
}) {
  const firstScored = tiles.find((t) => t.kind === 'scored')?.local_date ?? tiles[0]?.local_date ?? null
  const [picked, setPicked] = useState<string | null>(null)
  const selected = tiles.find((t) => t.local_date === (picked ?? firstScored)) ?? null
  return (
    <>
      <section style={{ ...sectCard, ...stack(spacing.cellPad) }} aria-label="Days">
        <div
          role="group"
          aria-label="Trip days"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(tiles.length, TILES_PER_ROW)}, minmax(0, 1fr))`,
            gap: `${spacing.listGap}px`,
          }}
        >
          {tiles.map((tile) => (
            <DayTile
              key={tile.local_date}
              tile={tile}
              selected={tile.local_date === selected?.local_date}
              onSelect={() => setPicked(tile.local_date)}
            />
          ))}
        </div>
        {selected === null ? null : <DayDetail tile={selected} locationId={locationId} />}
      </section>
      <RainCard tiles={tiles} outlook={outlook} />
    </>
  )
}

/** Three to a row, as the mockup draws them: a fourth squeezes the weather line onto three lines. */
const TILES_PER_ROW = 3

function WeatherLine({ weather }: { weather: DayWeather | null }) {
  if (weather === null) return <span style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted }}>No forecast</span>
  const chance = formatShare(weather.chance)
  return (
    <span style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted }}>
      {formatTempDeg(weather.highC)} · {chance === null ? '' : `${chance} · `}
      {formatPrecipIn(weather.precipMm)}
    </span>
  )
}

function DayTile({ tile, selected, onSelect }: { tile: TripDayTile; selected: boolean; onSelect: () => void }) {
  const score = tile.kind === 'scored' ? tile.summary.score : null
  const words = tile.kind === 'scored' ? readingWords(tile.summary) : null
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        ...bareButton,
        ...glassTile({ dashed: tile.kind !== 'scored', chosen: selected }),
        ...stack(spacing.micro),
        alignItems: 'flex-start',
        textAlign: 'left',
        minWidth: 0,
        padding: '10px',
      }}
    >
      <span style={{ ...typeV2.dayPick, color: colorsV2.txt2 }}>{shortDayLabel(tile.local_date)}</span>
      <span style={{ ...typeV2.dailyScore, color: score === null ? colorsV2.txtMuted : scoreRampColor(score) }}>
        {score ?? EM_DASH}
      </span>
      {words === null ? null : <span style={typeV2.rowSmall}>{words}</span>}
      {tile.kind === 'unscored' && tile.scoredFrom !== null ? (
        <span style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted }}>Scored from {dateLabel(tile.scoredFrom)}</span>
      ) : null}
      <WeatherLine weather={tile.weather} />
    </button>
  )
}

function AgreementChip({ share }: { share: number | null }) {
  const text = formatShare(share)
  if (text === null) return null
  return (
    <span
      style={{
        ...typeV2.rowSmall,
        fontWeight: 500,
        color: colorsV2.agreementInk,
        backgroundColor: withOpacity(colorsV2.agreement, 0.14),
        borderRadius: `${radius.full}px`,
        padding: `${spacing.micro}px ${spacing.listGap}px`,
      }}
    >
      {AGREEMENT_LABEL} {text}
    </span>
  )
}

/** The tapped day, under the tiles in the same card: its score and good hours, Dryness, then the day's weather. */
function DayDetail({ tile, locationId }: { tile: TripDayTile; locationId: string }) {
  const navigate = useNavigate()
  const w = tile.weather
  const summary = tile.kind === 'scored' ? tile.summary : null
  const score = summary?.score ?? null
  const headline =
    tile.kind === 'unscored'
      ? { text: 'Not scored yet', color: colorsV2.txtMuted }
      : score === null
        ? { text: EM_DASH, color: colorsV2.txtMuted }
        : {
            text: summary?.window == null ? String(score) : `${summary.window.label} ${summary.window.value} · ${score}`,
            color: scoreRampColor(score),
          }
  return (
    <div
      style={{ ...stack(spacing.tight), paddingTop: `${spacing.cellPad}px`, borderTop: `1px solid ${colorsV2.line}` }}
      aria-label={dayMonthLabel(tile.local_date)}
      role="group"
    >
      <span style={typeV2.statLabel}>{dayMonthLabel(tile.local_date)}</span>
      <span style={{ ...typeV2.dayHeadline, color: headline.color }}>{headline.text}</span>
      {summary === null || summary.readings.length === 0 ? null : (
        <span style={typeV2.lineLabel}>{summary.readings.map((f) => `${f.label}: ${f.value}`).join(' · ')}</span>
      )}
      {summary?.qualifier == null ? null : <p style={typeV2.note}>{summary.qualifier}</p>}
      {tile.kind === 'unscored' && tile.scoredFrom !== null ? (
        <p style={typeV2.note}>Scores start {dateLabel(tile.scoredFrom)}.</p>
      ) : null}
      {w === null ? (
        <p style={typeV2.note}>No forecast for this day yet.</p>
      ) : (
        <Stats
          items={[
            { label: 'High · low', value: `${formatTempDeg(w.highC)} · ${formatTempDeg(w.lowC)}` },
            { label: 'Chance', value: formatShare(w.chance) ?? EM_DASH, color: colorsV2.rain },
            { label: 'Amount', value: formatPrecipIn(w.precipMm) },
          ]}
        />
      )}
      <div style={{ ...row(spacing.listGap), justifyContent: 'space-between', flexWrap: 'wrap', marginTop: `${spacing.tight}px` }}>
        <AgreementChip share={w?.agreement ?? null} />
        {tile.kind === 'scored' ? (
          <button
            type="button"
            style={{ ...bareButton, ...typeV2.dayPick, color: colorsV2.brandInk, width: 'auto', minHeight: '32px', marginLeft: 'auto' }}
            onClick={() => void navigate(hourlyDayPath(locationId, tile.local_date))}
          >
            Hourly ›
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** `0.04–0.31 in`: a total's range, never summed. */
function rangeLabel(p10Mm: number, p90Mm: number): string {
  return `${mmToIn(p10Mm).toFixed(2)}–${mmToIn(p90Mm).toFixed(2)} in`
}

/** The likely total, its range as a bar, and each day's amount. Amounts sum; a range never does. */
function RainCard({ tiles, outlook }: { tiles: TripDayTile[]; outlook: Extract<TripOutlook, { days: unknown[] }> }) {
  const total = outlook.rain_total
  return (
    <GuideCard
      title="Rain over the trip"
      aside={total === null ? null : coverageLabel(total.days_covered, outlook.trip_days)}
      label="Rain over the trip"
    >
      {total === null ? (
        <p style={typeV2.note}>Not every forecast run reaches these days, so there is no total yet.</p>
      ) : (
        <>
          <div style={{ ...row(spacing.cellPad), alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={typeV2.listTitle}>
              {formatPrecipIn(total.mean_mm)}
              <small style={{ ...typeV2.dayPick, color: colorsV2.txt2, marginLeft: '6px' }}>likely</small>
            </span>
            <span style={typeV2.lineLabel}>Range {rangeLabel(total.p10_mm, total.p90_mm)}</span>
          </div>
          <RangeBar meanMm={total.mean_mm} p10Mm={total.p10_mm} p90Mm={total.p90_mm} />
        </>
      )}
      <DayAmounts tiles={tiles} />
      {total === null ? null : <p style={typeV2.note}>Amounts add up; a range never does.</p>}
    </GuideCard>
  )
}

/** The bars under the total: each trip day's likely amount, to one scale. A day with no figure draws no bar. */
function DayAmounts({ tiles }: { tiles: TripDayTile[] }) {
  const amounts = tiles.map((t) => t.weather?.precipMm ?? null)
  const top = Math.max(0.5, ...amounts.map((a) => a ?? 0))
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`,
        gap: `${spacing.tight}px`,
        alignItems: 'end',
        textAlign: 'center',
      }}
    >
      {tiles.map((t, i) => {
        const mm = amounts[i] ?? null
        return (
          <div key={t.local_date} style={{ ...stack(2), alignItems: 'center', minWidth: 0 }}>
            <span style={{ height: '36px', width: '60%', display: 'flex', alignItems: 'flex-end' }}>
              {mm === null ? null : (
                <span
                  aria-hidden
                  style={{
                    width: '100%',
                    height: `${Math.max(2, (mm / top) * 36)}px`,
                    backgroundColor: colorsV2.rainMark,
                    borderRadius: '3px 3px 1px 1px',
                  }}
                />
              )}
            </span>
            <span style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted }}>{shortDayLabel(t.local_date)}</span>
            <span style={{ ...typeV2.rowSmall, color: colorsV2.rain }}>{formatPrecipIn(mm)}</span>
          </div>
        )
      })}
    </div>
  )
}

function RangeBar({ meanMm, p10Mm, p90Mm }: { meanMm: number; p10Mm: number; p90Mm: number }) {
  // A tenth of an inch at least, so a near-dry range is not stretched across the card.
  const top = Math.max(p90Mm, meanMm, 2.54) * 1.1
  const pct = (mm: number) => `${(Math.max(0, mm) / top) * 100}%`
  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        height: '8px',
        margin: `${spacing.tight}px 0 ${spacing.cellPad}px`,
        borderRadius: `${radius.tag}px`,
        backgroundColor: colorsV2.tempBarTrack,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: pct(p10Mm),
          width: `calc(${pct(p90Mm)} - ${pct(p10Mm)})`,
          minWidth: '2px',
          borderRadius: `${radius.tag}px`,
          backgroundColor: withOpacity(colorsV2.rainMark, 0.45),
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: '-3px',
          height: '14px',
          left: pct(meanMm),
          width: '3px',
          marginLeft: '-1.5px',
          borderRadius: '2px',
          backgroundColor: colorsV2.rainCapsuleTop,
        }}
      />
    </div>
  )
}

function Swatch({
  color,
  hollow = false,
  round = false,
  dashed = false,
}: {
  color: string
  hollow?: boolean
  round?: boolean
  dashed?: boolean
}) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: '8px',
        height: round ? '8px' : '10px',
        borderRadius: round ? `${radius.full}px` : '2px',
        backgroundColor: hollow ? 'transparent' : color,
        border: `1.2px ${dashed ? 'dashed' : 'solid'} ${color}`,
      }}
    />
  )
}

type TrendView = 'day' | 'total'

const TREND_VIEWS: readonly { value: TrendView; label: string }[] = [
  { value: 'day', label: 'By day' },
  { value: 'total', label: 'Whole trip' },
]

/**
 * How the forecast has moved, two ways: each trip day's first forecast against
 * its latest, and the whole trip's rain total and warmest high at every
 * recording. Both are recordings of the forecast, never the trip days' own
 * timeline, and each view says so in a line above its chart.
 *
 * The by-day view needs `days`, which an older API does not send; then only
 * the whole-trip chart shows, with no toggle.
 */
export function TrendCard({ trend }: { trend: QueryState<TrendSeries> }) {
  const [view, setView] = useState<TrendView>('day')
  const points = trend.data?.points ?? []
  const days = trend.data?.days ?? null
  const byDay = hasDayTrend(days) ? days : null
  const shown: TrendView = byDay === null ? 'total' : view
  const first = points[0]
  return (
    <GuideCard
      title="How the forecast has moved"
      aside={
        first === undefined
          ? null
          : `${points.length} ${points.length === 1 ? 'recording' : 'recordings'} since ${dateLabel(deviceToday(new Date(first.recorded_at)))}`
      }
      label="Forecast trend"
    >
      {trend.isPending ? (
        <Skeleton height={120} />
      ) : trend.isError ? (
        <InlineError message="Couldn't load the trend." onRetry={trend.refetch} />
      ) : points.length === 0 && byDay === null ? (
        <p style={typeV2.note}>Trend starts after the next forecast update.</p>
      ) : (
        <>
          {byDay === null ? null : (
            <div role="group" aria-label="Trend view" style={row(spacing.listGapSm)}>
              {TREND_VIEWS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={shown === t.value}
                  onClick={() => setView(t.value)}
                  style={{ ...choicePill(shown === t.value), ...typeV2.dayPick }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {shown === 'day' && byDay !== null ? <DayTrendView days={byDay} /> : <TotalTrendView points={points} />}
        </>
      )}
    </GuideCard>
  )
}

function DayTrendView({ days }: { days: NonNullable<TrendSeries['days']> }) {
  const span = dayTrendSpan(days)
  const firstName = span.first === null ? 'first forecast' : dateLabel(span.first)
  const lastName = span.last === null ? 'latest' : dateLabel(span.last)
  return (
    <>
      <p style={{ ...typeV2.note, color: colorsV2.txt2 }}>
        Each trip day: {span.first === null ? 'its first forecast' : `the first forecast (${firstName})`} against{' '}
        {span.last === null ? 'its latest' : `the latest (${lastName})`}.
      </p>
      <TripDayTrendChart days={days} />
      <div style={{ ...row(spacing.sectionGap), flexWrap: 'wrap' }}>
        <span style={{ ...row(spacing.tight), ...typeV2.keyRow }}>
          <Swatch color={colorsV2.rainMark} hollow dashed /> Rain, {firstName}
        </span>
        <span style={{ ...row(spacing.tight), ...typeV2.keyRow }}>
          <Swatch color={colorsV2.rainMark} /> Rain, {lastName}
        </span>
        <span style={{ ...row(spacing.tight), ...typeV2.keyRow }}>
          <Swatch color={colors.sun} hollow round /> High, {firstName} → <Swatch color={colors.sun} round /> {lastName}
        </span>
      </div>
    </>
  )
}

function TotalTrendView({ points }: { points: TrendSeries['points'] }) {
  if (points.length === 0) return <p style={typeV2.note}>Trend starts after the next forecast update.</p>
  const chips = [rainChangeChip(points), highChangeChip(points)].filter((c): c is string => c !== null)
  const anyPartial = points.some((p) => p.days_covered === null || p.days_covered < p.trip_days)
  return (
    <>
      <p style={{ ...typeV2.note, color: colorsV2.txt2 }}>
        What each forecast update said about the whole trip. Newest on the right.
      </p>
      <TripTrendChart points={points} />
      <div style={{ ...row(spacing.sectionGap), flexWrap: 'wrap' }}>
        <span style={{ ...row(spacing.tight), ...typeV2.keyRow }}>
          <Swatch color={colorsV2.rainMark} /> Rain, trip total · Range
        </span>
        <span style={{ ...row(spacing.tight), ...typeV2.keyRow }}>
          <Swatch color={colors.sun} round /> High, warmest day
        </span>
        {anyPartial ? (
          <span style={{ ...row(spacing.tight), ...typeV2.keyRow }}>
            <Swatch color={colorsV2.rainMark} hollow /> Part of the trip
          </span>
        ) : null}
      </div>
      {chips.length === 0 ? null : (
        <div style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
          {chips.map((c) => (
            <span
              key={c}
              style={{ ...wellV2, ...typeV2.note, color: colorsV2.txt2, padding: `${spacing.micro}px ${spacing.listGap}px` }}
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

/**
 * Where the figures came from, named from the responses, and what Agreement
 * means — said once, in the trip's closing card. `models` empty names none.
 */
export function SourcesNote({ models, agreement }: { models: readonly string[]; agreement: boolean }) {
  return (
    <div style={stack(spacing.micro)}>
      <p style={typeV2.note}>
        Weather on every day is the trip outlook&rsquo;s; scores and words are each crag&rsquo;s hourly readings.
      </p>
      {agreement ? <p style={typeV2.note}>{AGREEMENT_MEANING}</p> : null}
      {models.length === 0 ? null : <p style={typeV2.note}>Weather: {openMeteoModels(models)}.</p>}
    </div>
  )
}

/** Every model the trip's outlooks name, in the order they first appear. */
export function outlookModels(outlooks: readonly TripOutlook[] | undefined): string[] {
  return [...new Set((outlooks ?? []).flatMap((o) => (o.days ?? []).flatMap((d) => d.models)))]
}

/** A crag's trip total as one line, for the several-crag list: `0.18 in` and its range. */
export function rainTotalParts(outlook: TripOutlook | undefined): { likely: string; range: string; coverage: string | null } | null {
  const total = outlook?.rain_total ?? null
  if (outlook === undefined || total === null) return null
  return {
    likely: formatPrecipIn(total.mean_mm),
    range: rangeLabel(total.p10_mm, total.p90_mm),
    coverage: total.days_covered < outlook.trip_days ? coverageLabel(total.days_covered, outlook.trip_days) : null,
  }
}
