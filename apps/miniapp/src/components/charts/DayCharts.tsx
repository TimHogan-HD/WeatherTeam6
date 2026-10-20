import { useId, useRef, type CSSProperties, type ReactNode } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  cToF,
  formatPrecipIn,
  kmhToMph,
  modelName,
  summarizeReadings,
  type HourlyReading,
  type HourlySeries,
  type SkyCondition,
} from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { bareButton, cardV2 } from '../../theme/styles.js'
import { SkyIcon } from '../Icons.js'
import { dayChips, dryDay } from '../../lib/hourlyDay.js'
import { dayChance } from '../../lib/overview.js'
import { formatTempDeg } from '../../lib/format.js'
import { chanceAxisTop, niceTicks } from '../../lib/chartTicks.js'
import { useNow } from '../../hooks/useNow.js'
import { SelectionIndicator, useSelectedRect } from '../SelectionIndicator.js'
import { chartColorsV2, scoreRampColor } from './chartStyle.js'
import {
  Bead,
  Frost,
  KeyRow,
  LIQUID_PX,
  LIQUID_W,
  Label,
  LiquidFrame,
  Sect,
  Tube,
  XGradient,
  runsOf,
  scale,
  smoothPath,
  timeAxis,
  valueRuns,
  type Pt,
  type TimeAxis,
} from './liquid.js'
import {
  type SeriesDatum,
  chanceSeries,
  dewPointSeries,
  gustSeries,
  hasValues,
  hoursOnDay,
  humiditySeries,
  rainSeries,
  temperatureSeries,
  valueExtent,
  windSpreadSeries,
  HOUR_MS,
} from './hourlySeries.js'

/**
 * The Hourly tab in the hybrid look (`docs/handoffs/design-mockups/weatherteam6-hybrid.html`,
 * `hourlyCharts`; owner 2026-10-19): the days as words with an underline, then
 * three glass cards — temperature and humidity, rain, wind — that read one
 * hour together. The slim header carries that hour's figures.
 *
 * **There is no seven-day chart here.** A continuous multi-day series belongs
 * on the Daily tab; this tab is one day's hours and the charts get the screen.
 */

export type DayChartsProps = {
  series: HourlySeries
  /** The local date currently open. Always one the caller checked is drawable. */
  selectedDate: string
  onSelectDate: (localDate: string) => void
  /** The hour every chart reads, epoch ms; held by the route so the slim header reads it too. */
  readMs: number | null
  onRead: (ms: number) => void
  /**
   * What only the screen knows about the readings: whether a Severe+ alert is
   * active, whether that query has settled, and whether this location is a
   * crag at all. The readings themselves come from `series`.
   */
  score?: {
    severeAlertEvent: string | null
    alertsPending: boolean
    showScore: boolean
  }
}

type Read = { ms: number | null; onRead: (ms: number) => void }

/** 0.02 in, the least the rain chart's scale may span: a trace day must not draw a downpour's shape. */
const RAIN_MIN_TOP_MM = 0.508
const MM_PER_IN = 25.4

/** Air with no score beside it is neutral ink: a tint with no number would leak the score past its suppression. */
const AIR_NEUTRAL = chartColorsV2.air

const sectCard: CSSProperties = { ...cardV2, padding: `${spacing.sectionGap}px 14px 14px` }
/** The chart runs past the card's padding by the mockup's 22px, so its hour labels line up with the card's text. */
const bleed: CSSProperties = { margin: '0 -22px' }
const keyInset: CSSProperties = { padding: '0 22px' }

export function DayCharts({ series, selectedDate, onSelectDate, readMs, onRead, score }: DayChartsProps) {
  const now = useNow()
  const read: Read = { ms: readMs, onRead }
  const hours = hoursOnDay(series.hours, selectedDate)

  // **Matched on the date, never on position.**
  const readingsDay = (series.readings?.days ?? []).find((d) => d.local_date === selectedDate) ?? null
  const showReadings = score !== undefined && score.showScore && series.readings !== undefined
  const alerts = { severeAlertEvent: score?.severeAlertEvent ?? null, alertsPending: score?.alertsPending ?? false }
  const summarize = (reading: HourlyReading | null, withWindow: boolean) =>
    summarizeReadings({
      reading,
      window: withWindow ? (readingsDay?.window ?? null) : null,
      utcOffsetSeconds: series.utc_offset_seconds,
      severeAlertEvent: alerts.severeAlertEvent,
      alertsPending: alerts.alertsPending,
      unavailableReason: series.readings?.unavailable_reason ?? null,
    })

  // Each hour's score as every surface suppresses it, joined on `valid_at`.
  const byInstant = new Map<string, HourlyReading>()
  for (const r of series.readings?.hours ?? []) byInstant.set(r.valid_at, r)
  const scoreAt = (validAt: string): number | null => {
    if (!showReadings) return null
    const reading = byInstant.get(validAt) ?? null
    return reading === null ? null : summarize(reading, false).score
  }

  // The good hours, shaded on the temperature chart only while a summary would name them.
  const daySummary = showReadings ? summarize(readingsDay?.best ?? null, true) : null
  const goodWindow = daySummary === null || daySummary.window === null ? null : (readingsDay?.window ?? null)

  const instants = hours.map((h) => Date.parse(h.valid_at)).filter((ms) => Number.isFinite(ms))
  const first = instants[0]
  const last = instants[instants.length - 1]
  const axis = first === undefined || last === undefined ? null : timeAxis(first, Math.max(last, first + HOUR_MS))
  const frame = { axis, instants, utcOffsetSeconds: series.utc_offset_seconds, nowMs: now, read }
  // The deterministic model is named only beside a line it drew.
  const model = series.model === null ? null : modelName(series.model)
  const humidModel = hasValues(dewPointSeries(hours)) || hasValues(humiditySeries(hours)) ? model : null
  const gustModel = hasValues(gustSeries(hours)) ? model : null
  const dayLabel = dayChips(series.days).find((c) => c.local_date === selectedDate)?.label ?? null
  const chanceToday = dayChance(series.hours, selectedDate)

  return (
    <>
      <DayPicker series={series} selectedDate={selectedDate} onSelectDate={onSelectDate} />
      <section style={sectCard}>
        <Sect
          title="Temperature and humidity"
          aside={`°F left · humidity right${humidModel === null ? '' : ` · dew point ${humidModel}`}`}
        />
        <TemperatureChart
          {...frame}
          hours={hours}
          scoreAt={scoreAt}
          goodWindow={goodWindow === null ? null : { from: Date.parse(goodWindow.from), to: Date.parse(goodWindow.to) }}
          sky={series.sky?.hours.filter((h) => h.local_date === selectedDate) ?? []}
        />
      </section>
      <section style={sectCard}>
        <Sect title="Rain" aside="chance left · in / hr right · ensemble mean" />
        <RainChart {...frame} hours={hours} series={series} selectedDate={selectedDate} />
      </section>
      <section style={sectCard}>
        <Sect title="Wind" aside={`mph${gustModel === null ? '' : ` · gusts ${gustModel}`}`} />
        <WindChart {...frame} hours={hours} />
        {/* Under the last chart, inside its card, as the mockup's is. */}
        <p style={{ ...typeV2.keyRow, lineHeight: '1.55', margin: '24px 0 0' }}>
          The range bands are the 10th to 90th percentile for one hour; they are never added up. Chance of rain is the
          share of wet ensemble members.
          {dayLabel === null ? null : ` ${dayLabel}: ${chanceToday === null ? EM_DASH : `${chanceToday}%`} chance of rain at its likeliest hour.`}
        </p>
      </section>
    </>
  )
}

/**
 * The days as words, the open one underlined. **Pressed buttons, not a second
 * tablist**: the dock's tabs are the screen's tablist, and this picks which
 * day that tab shows.
 */
function DayPicker({
  series,
  selectedDate,
  onSelectDate,
}: {
  series: HourlySeries
  selectedDate: string
  onSelectDate: (localDate: string) => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const rect = useSelectedRect(rowRef, '[aria-pressed="true"]', selectedDate)
  const chips = dayChips(series.days)
  if (chips.length === 0) return null
  return (
    <div
      ref={rowRef}
      role="group"
      aria-label="Day"
      style={{ display: 'flex', gap: '14px', overflowX: 'auto', scrollbarWidth: 'none', position: 'relative' }}
    >
      <SelectionIndicator
        rect={rect}
        style={{ bottom: 0, height: '2px', borderRadius: '2px', backgroundColor: colorsV2.brand }}
      />
      {chips.map((chip) => {
        const selected = chip.local_date === selectedDate
        return (
          <button
            key={chip.local_date}
            type="button"
            aria-pressed={selected}
            disabled={!chip.drawable}
            onClick={() => onSelectDate(chip.local_date)}
            style={{
              ...bareButton,
              ...typeV2.dayPick,
              width: 'auto',
              flex: '0 0 auto',
              padding: '4px 0',
              minHeight: '36px',
              whiteSpace: 'nowrap',
              color: selected ? colorsV2.txt1 : colorsV2.txt2,
              textShadow: '0 1px 6px rgba(0,0,0,0.45)',
              borderBottom: selected && rect === null ? `2px solid ${colorsV2.brand}` : '2px solid transparent',
              // A day the ensemble never reached keeps its place, so counting from Today lands on the right word.
              ...(chip.drawable ? {} : { opacity: 0.35, cursor: 'default' }),
            }}
          >
            {chip.label}
          </button>
        )
      })}
    </div>
  )
}

type FrameProps = {
  axis: TimeAxis | null
  instants: readonly number[]
  utcOffsetSeconds: number
  nowMs: number
  read: Read
}

function Empty({ children }: { children: ReactNode }) {
  return <p style={{ ...typeV2.body, margin: 0 }}>{children}</p>
}

const percent = (v: number | null): string => (v === null ? EM_DASH : `${Math.round(v)}%`)
const mph = (kmh: number | null): string => (kmh === null ? EM_DASH : `${Math.round(kmhToMph(kmh))} mph`)

/** The datum at the read hour, if the series has one. */
function at(data: readonly SeriesDatum[], ms: number | null): SeriesDatum | null {
  return ms === null ? null : (data.find((d) => d.t === ms) ?? null)
}

/**
 * Gridlines at `ticks`, in label units; `fromLabel` takes a label back to the
 * data's units for `y`. The ticks come from `niceTicks`, and the chart's own
 * span is set from the first and last, so nothing draws past the top line.
 */
function Grid({
  ticks,
  fromLabel,
  y,
  side,
  unit,
}: {
  ticks: readonly number[]
  fromLabel: (label: number) => number
  y: (v: number) => number
  side: 'start' | 'end'
  unit: string
}) {
  const yOf = (label: number) => y(fromLabel(label))
  return (
    <>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={LIQUID_PX} x2={LIQUID_W - LIQUID_PX} y1={yOf(v)} y2={yOf(v)} stroke={chartColorsV2.grid} />
          <Label x={side === 'end' ? LIQUID_W - LIQUID_PX : LIQUID_PX} y={yOf(v) - 3} anchor={side}>
            {`${v}${unit}`}
          </Label>
        </g>
      ))}
    </>
  )
}

function TemperatureChart({
  axis,
  instants,
  utcOffsetSeconds,
  nowMs,
  read,
  hours,
  scoreAt,
  goodWindow,
  sky,
}: FrameProps & {
  hours: ReturnType<typeof hoursOnDay>
  scoreAt: (validAt: string) => number | null
  goodWindow: { from: number; to: number } | null
  sky: readonly { valid_at: string; sky: SkyCondition | null }[]
}) {
  const gradient = useId()
  const temperature = temperatureSeries(hours)
  const dew = dewPointSeries(hours)
  const humidity = humiditySeries(hours)
  if (axis === null || !hasValues(temperature)) return <Empty>No hourly temperature for this day.</Empty>

  const H = 150
  const span = valueExtent(
    [...temperature, ...dew].flatMap((d) => [
      { ...d, value: d.low ?? d.value },
      { ...d, value: d.high ?? d.value },
    ]),
  )
  if (span === null) return <Empty>No hourly temperature for this day.</Empty>
  const fToC = (f: number) => ((f - 32) * 5) / 9
  const ticks = niceTicks(cToF(span.min), cToF(span.max))
  const y = scale(fToC(ticks[0] ?? 0), fToC(ticks[ticks.length - 1] ?? 0), 124, 14)
  const hy = scale(0, 100, 124, 14)

  const scores = new Map(hours.map((h) => [Date.parse(h.valid_at), scoreAt(h.valid_at)]))
  const scored = [...scores.values()].some((s) => s !== null)
  const airColor = (ms: number) => {
    const s = scores.get(ms) ?? null
    return scored && s !== null ? scoreRampColor(s) : AIR_NEUTRAL
  }

  const band = runsOf(temperature, (d) => d.low !== null && d.high !== null)
  const readAir = at(temperature, read.ms)
  const readHum = at(humidity, read.ms)

  // A sky cell covers the hour before its stamp; its glyph sits over the middle of that hour.
  const glyphs = sky.filter((h) => {
    const start = Date.parse(h.valid_at) - HOUR_MS
    return h.sky !== null && new Date(start + utcOffsetSeconds * 1000).getUTCHours() % 3 === 0
  })

  return (
    <div style={bleed}>
      <LiquidFrame
        height={H}
        top={10}
        bottom={22}
        axis={axis}
        instants={instants}
        utcOffsetSeconds={utcOffsetSeconds}
        nowMs={nowMs}
        read={read}
        title={hasValues(humidity) ? 'Temperature, dew point and humidity by hour' : 'Temperature by hour'}
        readout={[
          { label: 'air', value: formatTempDeg(readAir?.value ?? null), color: read.ms === null ? AIR_NEUTRAL : airColor(read.ms) },
          ...(hasValues(dew)
            ? [{ label: 'dew', value: formatTempDeg(at(dew, read.ms)?.value ?? null), color: chartColorsV2.dewPoint }]
            : []),
          ...(hasValues(humidity)
            ? [{ label: 'humidity', value: percent(readHum?.value ?? null), color: chartColorsV2.humidity }]
            : []),
        ]}
      >
        <defs>
          <XGradient
            id={gradient}
            stops={temperature.map((d) => ({ at: axis.x(d.t) / LIQUID_W, color: airColor(d.t) }))}
          />
        </defs>
        <Grid ticks={ticks} fromLabel={fToC} y={y} side="start" unit="°" />
        {goodWindow === null
          ? null
          : instants
              .filter((ms) => ms >= goodWindow.from && ms < goodWindow.to)
              .map((ms) => (
                <rect key={ms} x={axis.x(ms) - 7.5} y={10} width={15} height={118} fill={chartColorsV2.goodHours} data-good="" />
              ))}
        {hasValues(humidity)
          ? [50, 100].map((v) => (
              <Label key={v} x={LIQUID_W - LIQUID_PX} y={hy(v) + (v === 100 ? 9 : -3)} anchor="end" color={chartColorsV2.humidity}>
                {`${v}%`}
              </Label>
            ))
          : null}
        {band.map((run, i) => (
          <Frost
            key={i}
            top={run.map((d) => [axis.x(d.t), y(d.high ?? 0)] as Pt)}
            bottom={run.map((d) => [axis.x(d.t), y(d.low ?? 0)] as Pt)}
            color={chartColorsV2.airBand}
          />
        ))}
        {valueRuns(humidity, axis, hy).map((pts, i) => (
          <path key={i} d={smoothPath(pts)} fill="none" stroke={chartColorsV2.humidity} strokeWidth={1.8} opacity={0.85} data-humidity="" />
        ))}
        {valueRuns(dew, axis, y).map((pts, i) => (
          <path key={i} d={smoothPath(pts)} fill="none" stroke={chartColorsV2.dewPoint} strokeWidth={2} strokeDasharray="5 4" data-dew="" />
        ))}
        {valueRuns(temperature, axis, y).map((pts, i) => (
          <Tube key={i} d={smoothPath(pts)} stroke={`url(#${gradient})`} width={6} />
        ))}
        {readHum === null || readHum.value === null ? null : (
          <circle cx={axis.x(readHum.t)} cy={hy(readHum.value)} r={3.5} fill={chartColorsV2.humidity} />
        )}
        {readAir === null || readAir.value === null ? null : (
          <Bead x={axis.x(readAir.t)} y={y(readAir.value)} color={airColor(readAir.t)} />
        )}
        {glyphs.map((h) => (
          <g key={h.valid_at} data-sky="" transform={`translate(${(axis.x(Date.parse(h.valid_at) - HOUR_MS / 2) - 7).toFixed(1)} -4)`}>
            <SkyIcon sky={h.sky as SkyCondition} size={14} />
          </g>
        ))}
      </LiquidFrame>
      <div style={keyInset}>
        <KeyRow
          keys={[
            {
              // The gradient swatch says the colour is the score, as the mockup's one-word key does.
              label: 'air',
              swatch: {
                kind: 'line',
                background: scored
                  ? `linear-gradient(90deg, ${scoreRampColor(20)}, ${scoreRampColor(50)}, ${scoreRampColor(90)})`
                  : AIR_NEUTRAL,
              },
            },
            ...(hasValues(dew) ? [{ label: 'dew point', swatch: { kind: 'dash' as const, color: chartColorsV2.dewPoint } }] : []),
            ...(hasValues(humidity)
              ? [{ label: 'humidity', swatch: { kind: 'line' as const, background: chartColorsV2.humidity } }]
              : []),
            { label: 'range', swatch: { kind: 'block', background: colorsV2.rangeFrost } },
            ...(goodWindow === null
              ? []
              : [{ label: 'good hours', swatch: { kind: 'block' as const, background: colorsV2.brand, opacity: 0.4 } }]),
          ]}
        />
      </div>
    </div>
  )
}

function RainChart({
  axis,
  instants,
  utcOffsetSeconds,
  nowMs,
  read,
  hours,
  series,
  selectedDate,
}: FrameProps & { hours: ReturnType<typeof hoursOnDay>; series: HourlySeries; selectedDate: string }) {
  const rain = rainSeries(hours)
  const chance = chanceSeries(hours)
  if (axis === null || (!hasValues(rain) && !hasValues(chance))) return <Empty>No hourly rainfall for this day.</Empty>

  const H = 140
  const floor = 106
  const chances = chance.map((d) => d.value).filter((v): v is number => v !== null)
  const chanceTop = chanceAxisTop(chances.length === 0 ? null : Math.max(...chances))
  const cy = scale(0, chanceTop, floor, 14)
  const top = Math.max(RAIN_MIN_TOP_MM, ...rain.flatMap((d) => [d.value ?? 0, d.high ?? 0]))
  const ry = scale(0, top, floor, 14)
  const dry = dryDay(series.hours, selectedDate)
  const frameProps = { height: H, top: 10, bottom: 22, axis, instants, utcOffsetSeconds, nowMs, read }
  const inches = (mm: number) => (mm / MM_PER_IN).toFixed(2).replace(/^0/, '')

  const chanceGrid = [0, chanceTop / 2, chanceTop].map((v) => (
    <g key={v}>
      <line x1={LIQUID_PX} x2={LIQUID_W - LIQUID_PX} y1={cy(v)} y2={cy(v)} stroke={chartColorsV2.grid} />
      <Label x={LIQUID_PX} y={cy(v) - 3} anchor="start">{`${v}%`}</Label>
    </g>
  ))

  if (dry) {
    return (
      <div style={{ ...bleed, position: 'relative' }}>
        <LiquidFrame {...frameProps} bare title="Rain by hour: dry all day">
          {chanceGrid}
        </LiquidFrame>
        <div
          style={{
            position: 'absolute',
            left: '56px',
            right: '56px',
            top: '14px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '2px',
            pointerEvents: 'none',
            textShadow: '0 1px 8px rgba(0,0,0,0.6)',
          }}
        >
          <b style={{ ...typeV2.lineFigure, color: colorsV2.goodInk }}>Dry all day</b>
          <span style={{ ...typeV2.heroSideSm, lineHeight: '1.4', maxWidth: '32ch' }}>
            0% in every hour: no ensemble member has measurable rain all day.
          </span>
        </div>
      </div>
    )
  }

  const readRain = at(rain, read.ms)
  const band = runsOf(rain, (d) => d.low !== null && d.high !== null)
  return (
    <div style={bleed}>
      <LiquidFrame
        {...frameProps}
        title={hasValues(chance) ? 'Rain by hour: chance of rain as columns, amount as a line with its range' : 'Rainfall by hour'}
        readout={[
          ...(hasValues(chance)
            ? [{ label: 'chance', value: percent(at(chance, read.ms)?.value ?? null), color: colorsV2.rainMark }]
            : []),
          ...(hasValues(rain) ? [{ label: 'amount', value: formatPrecipIn(readRain?.value ?? null), color: chartColorsV2.rain }] : []),
        ]}
      >
        {hasValues(chance) ? chanceGrid : null}
        {hasValues(rain) ? (
          <>
            <Label x={LIQUID_W - LIQUID_PX} y={ry(top) + 9} anchor="end" color={colorsV2.rainLine}>{`${inches(top)} in`}</Label>
            <Label x={LIQUID_W - LIQUID_PX} y={ry(top / 2) - 3} anchor="end" color={colorsV2.rainLine}>
              {inches(top / 2)}
            </Label>
          </>
        ) : null}
        {chance.map((d) =>
          d.value === null ? null : (
            <rect
              key={d.t}
              x={axis.x(d.t) - 5}
              y={cy(d.value)}
              width={10}
              height={Math.max(0, floor - cy(d.value))}
              rx={5}
              fill={colorsV2.rainMark}
              opacity={d.t === read.ms ? 0.55 : 0.24}
              data-chance=""
            />
          ),
        )}
        {band.map((run, i) => (
          <Frost
            key={i}
            top={run.map((d) => [axis.x(d.t), ry(d.high ?? 0)] as Pt)}
            bottom={run.map((d) => [axis.x(d.t), ry(d.low ?? 0)] as Pt)}
            color={colorsV2.rainLine}
          />
        ))}
        {valueRuns(rain, axis, ry).map((pts, i) => (
          <Tube key={i} d={smoothPath(pts)} stroke={chartColorsV2.rain} width={3.5} />
        ))}
        {readRain === null || readRain.value === null ? null : (
          <Bead x={axis.x(readRain.t)} y={ry(readRain.value)} color={colorsV2.rainMark} />
        )}
      </LiquidFrame>
      <div style={keyInset}>
        <KeyRow
          keys={[
            ...(hasValues(chance) ? [{ label: 'chance of rain', swatch: { kind: 'capsule' as const, color: colorsV2.rainMark } }] : []),
            ...(hasValues(rain)
              ? [
                  { label: 'amount', swatch: { kind: 'line' as const, background: chartColorsV2.rain } },
                  { label: 'amount range, p10–p90', swatch: { kind: 'block' as const, background: colorsV2.rainLine, opacity: 0.4 } },
                ]
              : []),
          ]}
        />
      </div>
    </div>
  )
}

function WindChart({
  axis,
  instants,
  utcOffsetSeconds,
  nowMs,
  read,
  hours,
}: FrameProps & { hours: ReturnType<typeof hoursOnDay> }) {
  const wind = windSpreadSeries(hours)
  const gusts = gustSeries(hours)
  if (axis === null || !hasValues(wind)) return <Empty>No hourly wind for this day.</Empty>

  const H = 120
  const lo = Math.min(...wind.map((d) => d.low ?? d.value ?? Infinity))
  const hi = Math.max(...[...wind, ...gusts].map((d) => Math.max(d.high ?? -Infinity, d.value ?? -Infinity)))
  const kmhPerMph = 1.609344
  const ticks = niceTicks(Math.max(0, lo / kmhPerMph), hi / kmhPerMph)
  const y = scale((ticks[0] ?? 0) * kmhPerMph, (ticks[ticks.length - 1] ?? 0) * kmhPerMph, 98, 12)
  const readWind = at(wind, read.ms)
  const band = runsOf(wind, (d) => d.low !== null && d.high !== null)

  return (
    <div style={bleed}>
      <LiquidFrame
        height={H}
        top={10}
        bottom={22}
        axis={axis}
        instants={instants}
        utcOffsetSeconds={utcOffsetSeconds}
        nowMs={nowMs}
        read={read}
        title="Wind by hour"
        readout={[
          { label: 'wind', value: mph(readWind?.value ?? null), color: chartColorsV2.wind },
          ...(hasValues(gusts) ? [{ label: 'gusts', value: mph(at(gusts, read.ms)?.value ?? null), color: chartColorsV2.gust }] : []),
        ]}
      >
        <Grid ticks={ticks} fromLabel={(mph) => mph * kmhPerMph} y={y} side="end" unit="" />
        {band.map((run, i) => (
          <Frost
            key={i}
            top={run.map((d) => [axis.x(d.t), y(d.high ?? 0)] as Pt)}
            bottom={run.map((d) => [axis.x(d.t), y(d.low ?? 0)] as Pt)}
            color={chartColorsV2.wind}
          />
        ))}
        {valueRuns(gusts, axis, y).map((pts, i) => (
          <path key={i} d={smoothPath(pts)} fill="none" stroke={chartColorsV2.gust} strokeWidth={2} strokeDasharray="5 4" data-gust="" />
        ))}
        {valueRuns(wind, axis, y).map((pts, i) => (
          <Tube key={i} d={smoothPath(pts)} stroke={chartColorsV2.wind} width={5} />
        ))}
        {readWind === null || readWind.value === null ? null : (
          <Bead x={axis.x(readWind.t)} y={y(readWind.value)} color={chartColorsV2.wind} />
        )}
      </LiquidFrame>
      <div style={keyInset}>
        <KeyRow
          keys={[
            { label: 'sustained', swatch: { kind: 'line', background: chartColorsV2.wind } },
            ...(hasValues(gusts) ? [{ label: 'gusts', swatch: { kind: 'dash' as const, color: chartColorsV2.gust } }] : []),
            { label: 'range', swatch: { kind: 'block', background: chartColorsV2.wind, opacity: 0.4 } },
          ]}
        />
      </div>
    </div>
  )
}
