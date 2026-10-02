import { useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { colors, colorsV2, radius, spacing, toneSurfacesV2 } from '@weatherteam6/design/tokens'
import {
  AGREEMENT_LABEL,
  AGREEMENT_MEANING,
  formatPrecipIn,
  mmToIn,
  openMeteoModels,
  type TripOutlook,
  type TripTrendPoint,
} from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { bareButton, cardV2, row, stack, wellV2 } from '../../theme/styles.js'
import { formatTempDeg } from '../../lib/format.js'
import { readingTone, scoreTone } from '../../lib/locationList.js'
import { hourlyDayPath } from '../../lib/backTarget.js'
import type { DayReadings } from '../../lib/overview.js'
import {
  coverageLabel,
  dateLabel,
  dayMonthLabel,
  deviceToday,
  forecastOpens,
  formatShare,
  highChangeChip,
  outlookState,
  rainChangeChip,
  readingWords,
  shortDayLabel,
  tripDayTiles,
  type DayWeather,
  type TripDayTile,
} from '../../lib/trips.js'
import { ReadingPill } from '../ReadingPills.js'
import { InlineError, Skeleton } from '../States.js'
import { TripTrendChart } from './TripTrendChart.js'

export type QueryState<T> = { data: T | undefined; isPending: boolean; isError: boolean; refetch: () => void }

/**
 * One crag's trip: a tile per trip day, the tapped day's card, the rain over
 * the trip, and how the forecast has moved. Weather on every tile is the trip
 * outlook's; scores and words are the crag's `/hourly` readings (`tripDayTiles`).
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
  trend: QueryState<readonly TripTrendPoint[]>
}) {
  if (outlook.isPending) return <Skeleton height={180} />
  if (outlook.isError) {
    return (
      <section style={cardV2}>
        <InlineError message="Couldn't load the trip forecast." onRetry={outlook.refetch} />
      </section>
    )
  }

  const state = outlookState(outlook.data)
  return (
    <div style={stack(spacing.listGapLg)}>
      {scoresFailed === null ? null : (
        <section style={cardV2}>
          <InlineError message="Couldn't load the scores." onRetry={scoresFailed} />
        </section>
      )}
      {state.kind === 'unavailable' ? (
        <section style={cardV2}>
          <InlineError message="Couldn't load the forecast for this crag." onRetry={outlook.refetch} />
        </section>
      ) : state.kind === 'notYet' ? (
        <section style={cardV2}>
          <p style={typeV2.body}>
            {opensLine(startDate, today)}
          </p>
        </section>
      ) : (
        <ScoredDays
          locationId={locationId}
          tiles={tripDayTiles({ dates, outlook: state.outlook.days, readings, isCrag, today })}
          outlook={state.outlook}
        />
      )}
      <TrendCard trend={trend} />
      {state.kind === 'days' ? <SourcesNote outlook={state.outlook} /> : null}
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
      {selected === null ? null : <DayCard tile={selected} locationId={locationId} />}
      <RainCard tiles={tiles} outlook={outlook} />
    </>
  )
}

/** Three to a row, as the design draws them: a fourth squeezes the weather line onto three lines. */
const TILES_PER_ROW = 3

const tileLine: CSSProperties = { ...typeV2.note, color: colorsV2.txt2, lineHeight: '17px' }

function WeatherLine({ weather }: { weather: DayWeather | null }) {
  if (weather === null) return <span style={{ ...tileLine, color: colorsV2.txtMuted }}>No forecast</span>
  const chance = formatShare(weather.chance)
  return (
    <span style={tileLine}>
      {formatTempDeg(weather.highC)} ·{' '}
      <span style={{ color: colorsV2.rain }}>
        {chance === null ? '' : `${chance} · `}
        {formatPrecipIn(weather.precipMm)}
      </span>
    </span>
  )
}

function DayTile({ tile, selected, onSelect }: { tile: TripDayTile; selected: boolean; onSelect: () => void }) {
  const score = tile.kind === 'scored' ? tile.summary.score : null
  const tone = score === null ? null : toneSurfacesV2[scoreTone(score)]
  const words = tile.kind === 'scored' ? readingWords(tile.summary) : null
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        ...bareButton,
        ...stack(spacing.micro),
        alignItems: 'center',
        textAlign: 'center',
        padding: `${spacing.cellPad}px ${spacing.listGap}px`,
        borderRadius: `${radius.rowV2}px`,
        backgroundColor: tone?.row ?? colorsV2.raised,
        borderWidth: '1px',
        borderStyle: tile.kind === 'scored' ? 'solid' : 'dashed',
        borderColor: tone?.pillLine ?? colorsV2.line,
        outline: selected ? `2px solid ${colorsV2.txt1}` : 'none',
        outlineOffset: '1px',
      }}
    >
      <span style={typeV2.cellHour}>{shortDayLabel(tile.local_date)}</span>
      <span style={{ ...typeV2.tileFigure, color: tone?.pillInk ?? colorsV2.txtMuted }}>
        {score === null ? '—' : score}
      </span>
      {words !== null ? <span style={tileLine}>{words}</span> : null}
      {tile.kind === 'unscored' && tile.scoredFrom !== null ? (
        <span style={{ ...tileLine, color: colorsV2.txtMuted }}>scored from {dateLabel(tile.scoredFrom)}</span>
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
        ...wellV2,
        ...row(spacing.tight),
        ...typeV2.note,
        padding: `${spacing.micro}px ${spacing.listGap}px`,
        textTransform: 'none',
        letterSpacing: 0,
      }}
    >
      {AGREEMENT_LABEL} {text}
    </span>
  )
}

function CardHead({ title, aside }: { title: string; aside: ReactNode }) {
  return (
    <div style={{ ...row(spacing.listGap), justifyContent: 'space-between' }}>
      <h2 style={{ ...typeV2.kicker, color: colorsV2.txtMuted }}>{title}</h2>
      {aside}
    </div>
  )
}

function DayCard({ tile, locationId }: { tile: TripDayTile; locationId: string }) {
  const navigate = useNavigate()
  const w = tile.weather
  const facts: string[] = []
  if (tile.kind === 'scored' && tile.summary.window !== null) {
    facts.push(`${tile.summary.window.label} ${tile.summary.window.value}`)
  }
  if (w !== null) {
    facts.push(`High ${formatTempDeg(w.highC)} · Low ${formatTempDeg(w.lowC)}`)
  }
  const chance = w === null ? null : formatShare(w.chance)
  return (
    <section style={{ ...cardV2, ...stack(spacing.cellPad) }} aria-label={dayMonthLabel(tile.local_date)}>
      <CardHead title={dayMonthLabel(tile.local_date)} aside={<AgreementChip share={w?.agreement ?? null} />} />
      {tile.kind === 'scored' ? (
        <div style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
          {tile.summary.readings.map((f) => (
            <ReadingPill key={f.label} label={f.label} value={f.value} tone={readingTone(f, tile.reading)} />
          ))}
          {tile.summary.score === null || tile.summary.scoreField === null ? null : (
            <ReadingPill
              label={tile.summary.scoreField.label}
              value={tile.summary.scoreField.value}
              tone={scoreTone(tile.summary.score)}
            />
          )}
        </div>
      ) : tile.scoredFrom === null ? null : (
        <p style={typeV2.note}>Scored from {dateLabel(tile.scoredFrom)}.</p>
      )}
      {tile.kind === 'scored' && tile.summary.qualifier !== null ? (
        <p style={typeV2.note}>{tile.summary.qualifier}</p>
      ) : null}
      {facts.length === 0 && w === null ? null : (
        <p style={typeV2.body}>
          {facts.join(' · ')}
          {w === null ? null : (
            <span style={{ color: colorsV2.rain }}>
              {facts.length > 0 ? ' · ' : ''}Rain {chance === null ? '' : `${chance} · `}
              {formatPrecipIn(w.precipMm)}
            </span>
          )}
        </p>
      )}
      {tile.kind === 'scored' ? (
        <button
          type="button"
          style={{ ...bareButton, ...typeV2.cardLink, width: 'auto', alignSelf: 'flex-start' }}
          onClick={() => void navigate(hourlyDayPath(locationId, tile.local_date))}
        >
          Hourly ›
        </button>
      ) : null}
    </section>
  )
}

/** The likely total, its range as a bar, and each day's amount. Amounts sum; a range never does. */
function RainCard({ tiles, outlook }: { tiles: TripDayTile[]; outlook: Extract<TripOutlook, { days: unknown[] }> }) {
  const total = outlook.rain_total
  return (
    <section style={{ ...cardV2, ...stack(spacing.listGap) }} aria-label="Rain over the trip">
      <CardHead
        title="Rain over the trip"
        aside={
          total === null ? null : (
            <span style={typeV2.aside}>{coverageLabel(total.days_covered, outlook.trip_days)}</span>
          )
        }
      />
      {total === null ? (
        <p style={typeV2.note}>Not every forecast run reaches these days, so there is no total yet.</p>
      ) : (
        <>
          <div style={{ ...row(spacing.listGap), justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ ...typeV2.tileFigure, color: colorsV2.rain }}>{formatPrecipIn(total.mean_mm)}</span>
            <span style={typeV2.aside}>likely</span>
          </div>
          <RangeBar meanMm={total.mean_mm} p10Mm={total.p10_mm} p90Mm={total.p90_mm} />
          <div style={{ ...row(spacing.listGap), justifyContent: 'space-between' }}>
            <span style={typeV2.note}>{formatPrecipIn(total.p10_mm)}</span>
            <span style={typeV2.note}>Range</span>
            <span style={typeV2.note}>{formatPrecipIn(total.p90_mm)}</span>
          </div>
        </>
      )}
      <div style={{ ...row(spacing.listGap), justifyContent: 'space-between', flexWrap: 'wrap' }}>
        {tiles.map((t) => (
          <span key={t.local_date} style={{ ...typeV2.note, color: colorsV2.txt2 }}>
            {shortDayLabel(t.local_date)}{' '}
            <span style={{ color: colorsV2.rain }}>{formatPrecipIn(t.weather?.precipMm ?? null)}</span>
          </span>
        ))}
      </div>
    </section>
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
        borderRadius: `${radius.tag}px`,
        backgroundColor: colorsV2.grid,
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
          backgroundColor: colorsV2.rain,
          opacity: 0.35,
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: pct(meanMm),
          width: '3px',
          backgroundColor: colorsV2.rain,
        }}
      />
    </div>
  )
}

function Swatch({ color, hollow = false, round = false }: { color: string; hollow?: boolean; round?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: '8px',
        height: round ? '8px' : '10px',
        borderRadius: round ? `${radius.full}px` : '2px',
        backgroundColor: hollow ? 'transparent' : color,
        border: `1.2px solid ${color}`,
      }}
    />
  )
}

function TrendCard({ trend }: { trend: QueryState<readonly TripTrendPoint[]> }) {
  const points = trend.data ?? []
  const first = points[0]
  const chips = [rainChangeChip(points), highChangeChip(points)].filter((c): c is string => c !== null)
  const anyPartial = points.some((p) => p.days_covered === null || p.days_covered < p.trip_days)
  return (
    <section style={{ ...cardV2, ...stack(spacing.listGap) }} aria-label="Forecast trend">
      <CardHead
        title="Forecast trend"
        aside={
          first === undefined ? null : (
            <span style={typeV2.aside}>
              {points.length} {points.length === 1 ? 'update' : 'updates'} since {dateLabel(deviceToday(new Date(first.recorded_at)))}
            </span>
          )
        }
      />
      {trend.isPending ? (
        <Skeleton height={120} />
      ) : trend.isError ? (
        <InlineError message="Couldn't load the trend." onRetry={trend.refetch} />
      ) : points.length === 0 ? (
        <p style={typeV2.note}>Trend starts after the next forecast update.</p>
      ) : (
        <>
          <div style={{ ...row(spacing.sectionGap), flexWrap: 'wrap' }}>
            <span style={{ ...row(spacing.tight), ...typeV2.note, color: colorsV2.rain }}>
              <Swatch color={colorsV2.rain} /> Rain, trip total · Range
            </span>
            <span style={{ ...row(spacing.tight), ...typeV2.note, color: colors.sun }}>
              <Swatch color={colors.sun} round /> High, warmest day
            </span>
            {anyPartial ? (
              <span style={{ ...row(spacing.tight), ...typeV2.note }}>
                <Swatch color={colorsV2.rain} hollow /> Part of the trip
              </span>
            ) : null}
          </div>
          <TripTrendChart points={points} />
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
      )}
    </section>
  )
}

/** Where the figures came from, named from the response, and what Agreement means, said once. */
function SourcesNote({ outlook }: { outlook: Extract<TripOutlook, { days: unknown[] }> }) {
  const models = [...new Set(outlook.days.flatMap((d) => d.models))]
  return (
    <div style={stack(spacing.micro)}>
      <p style={typeV2.note}>{AGREEMENT_MEANING}</p>
      {models.length === 0 ? null : (
        <p style={typeV2.note}>Weather: {openMeteoModels(models)}. Scores: the crag&rsquo;s hourly forecast.</p>
      )}
    </div>
  )
}

/** A crag's trip total as one line, for the several-crag list: `0.18 in` and its range. */
export function rainTotalParts(outlook: TripOutlook | undefined): { likely: string; range: string; coverage: string | null } | null {
  const total = outlook?.rain_total ?? null
  if (outlook === undefined || total === null) return null
  return {
    likely: formatPrecipIn(total.mean_mm),
    range: `${mmToIn(total.p10_mm).toFixed(2)}–${mmToIn(total.p90_mm).toFixed(2)} in`,
    coverage: total.days_covered < outlook.trip_days ? coverageLabel(total.days_covered, outlook.trip_days) : null,
  }
}
