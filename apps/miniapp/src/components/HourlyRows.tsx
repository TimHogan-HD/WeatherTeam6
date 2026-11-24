import { Fragment, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import { EM_DASH, seamlessModelName, windowValue, type HourlySeries } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton } from '../theme/styles.js'
import { selection } from '../theme/glass.js'
import { useNow } from '../hooks/useNow.js'
import { dayChips } from '../lib/hourlyDay.js'
import { formatLocalHour } from '../lib/format.js'
import {
  HOURLY_VIEWS,
  compass,
  firstAhead,
  hourRows,
  rowInches,
  savedView,
  saveView,
  type HourRow,
  type HourlyView,
} from '../lib/hourlyRows.js'
import { BAR_RADIUS, chartColorsV2, scoreColor } from './charts/chartStyle.js'
import { HOUR_MS } from './charts/hourlySeries.js'
import { NightIcon, SkyIcon } from './Icons.js'
import { SelectionIndicator, useSelectedRect } from './SelectionIndicator.js'

/**
 * The Hourly tab as rows (owner, 2026-11-24: mockup
 * `docs/handoffs/design-mockups/hourly-rows.html`, variant B chips, rain per
 * hour). It replaced the four stacked charts and their scrub.
 *
 * A strip of days, a chip per view and the column heads stick under the slim
 * header. Every view shares the first columns — hour, sky, score — so changing
 * the view swaps only what is to their right. Each single view draws a bar on a
 * scale printed in its column head. Tapping a row opens every figure for that
 * hour and makes it the hour the slim header reads.
 *
 * The join of figures to rows, and every null, is `lib/hourlyRows.ts`'s.
 */

export type HourlyRowsProps = {
  series: HourlySeries
  /** The local date currently open. Always one the caller checked is drawable. */
  selectedDate: string
  onSelectDate: (localDate: string) => void
  /** The hour the slim header reads, epoch ms; held by the route. */
  readMs: number | null
  onRead: (ms: number) => void
  /** Whether this location is a crag at all. A city has no score column. */
  showScore: boolean
}

const dash = <span style={{ color: colorsV2.txtMuted }}>{EM_DASH}</span>

const figure: CSSProperties = { ...typeV2.hourFigure, color: colorsV2.txt1, textAlign: 'right' }
const muted: CSSProperties = { color: colorsV2.txtMuted, fontWeight: 500 }
const unit: CSSProperties = { ...typeV2.daySmall, marginLeft: 1 }

function Num({ v, suffix, style }: { v: number | string | null; suffix?: string; style?: CSSProperties }) {
  if (v === null) return <span style={{ ...figure, ...style, color: colorsV2.txtMuted }}>{EM_DASH}</span>
  return (
    <span style={{ ...figure, ...style }}>
      {v}
      {suffix === undefined ? null : <small style={unit}>{suffix}</small>}
    </span>
  )
}

/** A bar on a printed scale; `from`/`to` are 0–1 of the track. Nothing but the track when there is no value. */
/**
 * A row's bar on its track. `gap` draws the track dashed: an unanswered hour must
 * not look like a measured zero, which is the solid track with no bar (`readings.md`).
 */
function Bar({ from = 0, to, color, outline = false, gap = false, children }: { from?: number; to: number | null; color: string; outline?: boolean; gap?: boolean; children?: ReactNode }) {
  const clamp = (x: number) => Math.max(0, Math.min(1, x))
  return (
    <span aria-hidden="true" style={{ position: 'relative', height: 16, display: 'block' }}>
      {gap ? (
        <i data-gap="" style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 0, borderTop: `2px dashed ${colorsV2.tempBarTrack}` }} />
      ) : (
        <i style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 4, borderRadius: BAR_RADIUS, background: colorsV2.tempBarTrack }} />
      )}
      {to === null ? null : (
        <i
          style={{
            position: 'absolute',
            top: 4,
            height: 8,
            borderRadius: BAR_RADIUS,
            left: `${clamp(from) * 100}%`,
            width: `${Math.max(clamp(to) - clamp(from), 0.03) * 100}%`,
            ...(outline ? { boxShadow: `inset 0 0 0 1.5px ${color}`, opacity: 0.6 } : { background: color }),
          }}
        />
      )}
      {children}
    </span>
  )
}

function Arrow({ fromDeg }: { fromDeg: number | null }) {
  if (fromDeg === null) return null
  // The wind blows from `fromDeg`, so the arrow points the other way.
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ transform: `rotate(${fromDeg + 180}deg)`, marginRight: 2, verticalAlign: -1, color: colorsV2.wind }}>
      <path d="M6 1v10M2.5 4.5 6 1l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Sky({ row }: { row: HourRow }) {
  if (row.sky !== null) return <SkyIcon sky={row.sky} size={20} />
  if (row.daylight === false) return <NightIcon />
  return null
}

/** The view's own columns, after hour, sky and score. */
/**
 * One frame for every view: a figure column, a middle, a figure column (Temp adds
 * one). The first and last figures stay put when the picker changes view, so the
 * eye is not sent hunting (owner, 2026-11-24: the columns shifted on every switch).
 */
const VIEW_COLS: Record<HourlyView, string> = {
  all: '44px minmax(0,1fr) 44px',
  temp: '44px minmax(0,1fr) 40px 40px',
  rain: '44px minmax(0,1fr) 44px',
  wind: '44px minmax(0,1fr) 44px',
  sun: '44px minmax(0,1fr) 44px',
}

export function HourlyRows({ series, selectedDate, onSelectDate, readMs, onRead, showScore }: HourlyRowsProps) {
  const now = useNow()
  const [view, setView] = useState<HourlyView>(savedView)
  // Open follows the hour the header reads; tapping the open row closes it without moving the header.
  const [closed, setClosed] = useState<number | null>(null)
  const [earlier, setEarlier] = useState<string | null>(null)
  const offset = series.utc_offset_seconds
  const hourLabel = (ms: number) => formatLocalHour(ms, offset) ?? EM_DASH

  const { rows, scale, good, noGood, scored, dry } = hourRows(series, selectedDate, { showScore }, (w) => windowValue(w, offset))
  const chips = dayChips(series.days)
  const isToday = chips[0]?.local_date === selectedDate
  const ahead = isToday ? firstAhead(rows, now) : 0
  const showEarlier = earlier === selectedDate
  const shown = showEarlier ? rows : rows.slice(ahead)
  const nowMs = isToday ? (rows[ahead]?.ms ?? null) : null
  const openMs = readMs !== null && readMs !== closed ? readMs : null

  const lead = ['56px', '22px', ...(scored ? ['30px'] : [])].join(' ')
  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: `${lead} ${VIEW_COLS[view]}`, alignItems: 'center', columnGap: 8 }

  // The deterministic model, named beside the figures it gave; it follows the day drawn (#473).
  const dayFrom = rows[0]?.validAt
  const dayTo = rows[rows.length - 1]?.validAt
  const model =
    series.model === null || dayFrom === undefined || dayTo === undefined
      ? null
      : seamlessModelName(series.model, series.hrrr_through, dayFrom, dayTo)
  const sunModel =
    series.sky?.model == null || !rows.some((r) => r.sunMin !== null) || dayFrom === undefined || dayTo === undefined
      ? null
      : seamlessModelName(series.sky.model, series.hrrr_through, dayFrom, dayTo)

  const pick = (v: HourlyView) => {
    setView(v)
    saveView(v)
  }
  const tap = (ms: number) => {
    if (ms === openMs) {
      setClosed(ms)
      return
    }
    setClosed(null)
    onRead(ms)
  }

  const span = (lo: number | null, hi: number | null) => (scale.lowF === null || scale.highF === null || scale.highF === scale.lowF ? null : [lo, hi].map((v) => (v === null ? null : (v - scale.lowF!) / (scale.highF! - scale.lowF!))))
  const head = (s: string, right = true) => <span style={{ textAlign: right ? 'right' : 'left' }}>{s}</span>
  const scaleHead = (...marks: string[]) => (
    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
      {marks.map((m) => <span key={m}>{m}</span>)}
    </span>
  )
  const heads: Record<HourlyView, ReactNode[]> = {
    all: [head('°F'), <span key="c" style={{ textAlign: 'center' }}>Chance of rain</span>, head('mph')],
    temp: [head('°F'), scale.lowF === null || scale.highF === null ? <span /> : scaleHead(`${scale.lowF}°`, 'likely range', `${scale.highF}°`), head('Humid'), head('Dew')],
    rain: [head('Chance'), scaleHead('0', `${rowInches(scale.rainTopIn)} in`), head('in')],
    wind: [head('mph'), scaleHead('0', `${scale.windTopMph} mph`), head('Gust')],
    sun: [head('min'), scaleHead('0', 'sun in the hour', '60 min'), <span key="e" />],
  }

  const cells = (r: HourRow): ReactNode[] => {
    switch (view) {
      case 'all':
        return [
          <Num key="t" v={r.tempF === null ? null : `${r.tempF}°`} style={typeV2.weekScore} />,
          <Num key="c" v={r.chancePct} suffix="%" style={{ color: colorsV2.rain, textAlign: 'center' }} />,
          <span key="w" style={figure}>{r.windMph === null ? dash : <><Arrow fromDeg={r.windFromDeg} />{r.windMph}</>}</span>,
        ]
      case 'temp': {
        const s = span(r.lowF, r.highF)
        const t = span(r.tempF, r.tempF)
        return [
          <Num key="t" v={r.tempF === null ? null : `${r.tempF}°`} style={typeV2.weekScore} />,
          <Bar key="b" from={s?.[0] ?? 0} to={s?.[1] ?? null} color={chartColorsV2.airBand} gap={r.tempF === null}>
            {t?.[0] == null ? null : (
              <i style={{ position: 'absolute', top: 3, width: 10, height: 10, borderRadius: '50%', background: chartColorsV2.air, left: `calc(${t[0] * 100}% - 5px)` }} />
            )}
          </Bar>,
          <Num key="h" v={r.humidityPct} suffix="%" style={{ color: chartColorsV2.humidity }} />,
          <Num key="d" v={r.dewF === null ? null : `${r.dewF}°`} style={muted} />,
        ]
      }
      case 'rain':
        return [
          <Num key="c" v={r.chancePct} suffix="%" style={{ color: r.chancePct !== null && r.chancePct >= 20 ? colorsV2.rain : colorsV2.txtMuted }} />,
          <Bar key="b" to={r.rainIn === null || r.rainIn === 0 ? null : r.rainIn / scale.rainTopIn} color={colorsV2.rainAmount} gap={r.rainIn === null} />,
          <Num key="a" v={rowInches(r.rainIn)} style={r.rainIn !== null && r.rainIn > 0 ? { color: colorsV2.rainAmount } : muted} />,
        ]
      case 'wind':
        return [
          <span key="w" style={figure}>{r.windMph === null ? dash : <><Arrow fromDeg={r.windFromDeg} />{r.windMph}</>}</span>,
          <Bar key="b" to={r.windMph === null ? null : r.windMph / scale.windTopMph} color={colorsV2.wind} gap={r.windMph === null}>
            {r.gustMph === null ? null : (
              <i style={{ position: 'absolute', top: 4, height: 8, borderRadius: BAR_RADIUS, left: 0, width: `${Math.min(1, r.gustMph / scale.windTopMph) * 100}%`, boxShadow: `inset 0 0 0 1.5px ${colorsV2.gust}`, opacity: 0.55 }} />
            )}
          </Bar>,
          <Num key="g" v={r.gustMph} style={muted} />,
        ]
      case 'sun':
        return r.daylight === false
          ? [<span key="n" style={{ ...figure, ...muted }}>dark</span>, <Bar key="b" to={null} color={colorsV2.sun} />, <span key="e" />]
          : [
              <Num key="m" v={r.sunMin} style={r.sunMin === 0 ? muted : {}} />,
              <Bar key="b" to={r.sunMin === null || r.sunMin === 0 ? null : r.sunMin / 60} color={colorsV2.sun} gap={r.sunMin === null} />,
              <span key="e" />,
            ]
    }
  }

  const dayName = chips.find((c) => c.local_date === selectedDate)?.label ?? null

  return (
    <div>
      <div
        style={{
          position: 'sticky',
          top: 'var(--slim-header-h, 0px)',
          zIndex: 4,
          background: colorsV2.bg,
          margin: `0 -${spacing.sectionGap}px`,
          padding: `${spacing.tight}px ${spacing.sectionGap}px 0`,
          borderBottom: `1px solid ${colorsV2.line}`,
        }}
      >
        <DayStrip series={series} selectedDate={selectedDate} onSelectDate={onSelectDate} />
        <div role="group" aria-label="Show" style={{ display: 'grid', gridTemplateColumns: `repeat(${HOURLY_VIEWS.length}, minmax(0,1fr))`, gap: 4, padding: '8px 0' }}>
          {HOURLY_VIEWS.map((o) => {
            const on = o.key === view
            return (
              <button
                key={o.key}
                type="button"
                aria-pressed={on}
                onClick={() => pick(o.key)}
                style={{
                  ...bareButton,
                  ...typeV2.hourPick,
                  minHeight: 40,
                  borderRadius: radius.full,
                  border: `1px solid ${on ? colorsV2.brand : colorsV2.line}`,
                  background: on ? selection.fill : colorsV2.surface,
                  color: on ? colorsV2.brandInk : colorsV2.txt2,
                  textAlign: 'center',
                }}
              >
                {o.label}
              </button>
            )
          })}
        </div>
        <div aria-hidden="true" style={{ ...grid, ...typeV2.daySmall, alignItems: 'end', padding: '2px 0 6px', lineHeight: 1.2 }}>
          <span>Hour</span>
          <span />
          {scored ? head('Score') : null}
          {heads[view].map((n, i) => <Fragment key={i}>{n}</Fragment>)}
        </div>
      </div>

      {good !== null || noGood ? (
        <p style={{ ...typeV2.daySub, margin: 0, padding: '12px 0 6px', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          {good === null ? (
            <span>No good hours {isToday ? 'today' : dayName === null ? '' : `on ${dayName}`}</span>
          ) : (
            <span>
              Good hours <b style={{ ...typeV2.hourFigure, fontWeight: 700, color: colorsV2.txt1 }}>{good.label}</b>
            </span>
          )}
          {good === null ? null : <span style={typeV2.daySmall}>shaded below</span>}
        </p>
      ) : null}
      {/* Every view, so switching views never moves the rows (owner, 2026-11-24). */}
      {dry ? (
        <p style={{ ...typeV2.daySub, margin: 0, padding: '8px 0 4px' }}>Dry all day: no ensemble member has measurable rain in any hour.</p>
      ) : null}

      {isToday && ahead > 0 && !showEarlier ? (
        <button
          type="button"
          onClick={() => setEarlier(selectedDate)}
          style={{ ...bareButton, ...typeV2.daySub, width: '100%', minHeight: 44, textAlign: 'left', color: colorsV2.brandInk, borderBottom: `1px solid ${colorsV2.line}` }}
        >
          Show earlier hours, {hourLabel(rows[0]!.ms)} – {hourLabel(rows[ahead - 1]!.ms)}
        </button>
      ) : null}

      {shown.length === 0 ? (
        <p style={{ ...typeV2.daySub, margin: '12px 0' }}>No hour-by-hour forecast for this day.</p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((r) => {
            const open = r.ms === openMs
            const inGood = good !== null && r.ms >= good.from && r.ms <= good.to
            const isNow = r.ms === nowMs
            return (
              <li key={r.ms} style={{ borderBottom: `1px solid ${colorsV2.line}` }}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={`${hourLabel(r.ms)}${isNow ? ', now' : ''}`}
                  onClick={() => tap(r.ms)}
                  style={{ ...bareButton, ...grid, width: '100%', minHeight: 46, textAlign: 'left', background: inGood ? chartColorsV2.goodHours : undefined }}
                >
                  <span style={{ ...typeV2.hourPick, whiteSpace: 'nowrap', paddingLeft: 2, color: open || isNow ? colorsV2.txt1 : colorsV2.txt2 }}>
                    {hourLabel(r.ms)}
                    {isNow ? <small style={{ ...typeV2.daySmall, display: 'block', marginTop: 2, color: colorsV2.brandInk, fontWeight: 600 }}>Now</small> : null}
                  </span>
                  <span style={{ display: 'grid', placeItems: 'center' }}><Sky row={r} /></span>
                  {scored ? (
                    <span style={{ ...typeV2.weekScore, lineHeight: 1, textAlign: 'right', color: r.score === null ? colorsV2.txtMuted : scoreColor(r.score) }}>
                      {r.score ?? EM_DASH}
                    </span>
                  ) : null}
                  {cells(r)}
                </button>
                {open ? <Detail row={r} scored={scored} hourLabel={hourLabel} /> : null}
              </li>
            )
          })}
        </ol>
      )}

      <p style={{ ...typeV2.note, margin: '14px 0 0' }}>
        A row is the hour that starts at its time. Temperature, rain and wind are the ensemble: the middle of its members,
        the likely range in an opened hour, rain as their mean. Chance of rain is the share of members wet in the hour.
        {model === null ? '' : ` Humidity, dew point, gusts and wind direction are ${model}’s.`}
        {sunModel === null ? '' : ` Sun is ${sunModel}’s minutes of bright sun, on flat ground.`}
      </p>
    </div>
  )
}

/**
 * Wind's note: where it comes from, and on a crag the gusts too, since Score
 * takes Gusts' tile there. `gust` undefined means gusts have their own tile;
 * null is an unanswered gust and prints a dash, never nothing.
 */
export function windNote(dir: string | null, gust: number | null | undefined): string | null {
  const from = dir === null ? null : `from ${dir}`
  if (gust === undefined) return from
  const gusts = `gusts\u00a0${gust ?? EM_DASH}`
  return from === null ? gusts : `${from}, ${gusts}`
}

function Detail({ row: r, scored, hourLabel }: { row: HourRow; scored: boolean; hourLabel: (ms: number) => string }) {
  const or = (v: number | string | null, unit = '') => (v === null ? EM_DASH : `${v}${unit}`)
  const dir = compass(r.windFromDeg)
  /**
   * One figure as a tile, four across the full row in two rows (owner,
   * 2026-11-24, variant A of `hour-detail-rows.html`): the label over the
   * figure over its note, centred. Words wrap rather than clip (owner: "make
   * sure words aren't cut off").
   */
  const tile = (label: string, value: ReactNode, opts: { dot?: string; note?: string | null; valueColor?: string } = {}) => (
    <div
      key={label}
      style={{ background: colorsV2.raised, borderRadius: radius.rowV2, padding: '6px 4px 7px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 0, minWidth: 0 }}
    >
      <dt style={{ ...typeV2.daySmall, color: colorsV2.txtTab, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', columnGap: 4 }}>
        {opts.dot === undefined ? null : <i aria-hidden="true" style={{ width: 6, height: 6, borderRadius: radius.full, background: opts.dot, flex: 'none' }} />}
        {label}
      </dt>
      <dd style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ ...typeV2.weekScore, lineHeight: 1.05, color: opts.valueColor ?? colorsV2.txt1 }}>{value}</span>
        {opts.note == null ? null : <small style={{ ...typeV2.daySmall, lineHeight: 1.2, color: colorsV2.txtTab }}>{opts.note}</small>}
      </dd>
    </div>
  )
  return (
    <dl
      className="wt6-header-swap"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4, margin: 0, padding: '2px 0 10px' }}
    >
      {/* Eight tiles fill two rows. On a crag Score takes the fourth slot and gusts move into Wind's note; elsewhere Gusts keeps its tile. */}
      {tile('Temperature', or(r.tempF, '°'), { dot: chartColorsV2.air, note: r.lowF === null || r.highF === null ? null : `likely ${r.lowF}\u2060–\u2060${r.highF}°` })}
      {tile('Humidity', or(r.humidityPct, '%'), { dot: chartColorsV2.humidity })}
      {tile('Dew point', or(r.dewF, '°'))}
      {scored
        ? tile('Score', or(r.score), { valueColor: r.score === null ? colorsV2.txtMuted : scoreColor(r.score) })
        : tile('Gusts', or(r.gustMph, ' mph'), { dot: colorsV2.gust })}
      {tile('Chance of rain', or(r.chancePct, '%'), { dot: colorsV2.rain })}
      {tile('Rain', r.rainIn === null ? EM_DASH : `${rowInches(r.rainIn)} in`, { dot: colorsV2.rainAmount })}
      {tile('Sun', r.daylight === false ? 'dark' : or(r.sunMin, ' min'), { dot: colorsV2.sun, note: `${hourLabel(r.ms).replace(' ', '\u00a0')}–${hourLabel(r.ms + HOUR_MS).replace(' ', '\u00a0')}` })}
      {tile('Wind', or(r.windMph, ' mph'), { dot: colorsV2.wind, note: windNote(r.windMph === null ? null : dir, scored ? r.gustMph : undefined) })}
    </dl>
  )
}

/**
 * The days as words over their dates, an underline sliding to the open one
 * (mockup's day strip). **Pressed buttons, not a second tablist**: the dock's
 * tabs are the screen's tablist, and this picks which day that tab shows. A
 * day the ensemble never reached keeps its place, disabled, so counting from
 * Today lands on the right one.
 */
function DayStrip({ series, selectedDate, onSelectDate }: { series: HourlySeries; selectedDate: string; onSelectDate: (d: string) => void }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const rect = useSelectedRect(rowRef, '[aria-pressed="true"]', selectedDate)
  const chips = dayChips(series.days)
  if (chips.length === 0) return null
  const underline = { height: 2, borderRadius: 1, background: colorsV2.brand }
  return (
    <div
      ref={rowRef}
      role="group"
      aria-label="Day"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${chips.length}, minmax(0,1fr))`, position: 'relative' }}
    >
      <SelectionIndicator rect={rect} style={{ bottom: 2, height: 2, background: `linear-gradient(${colorsV2.brand}, ${colorsV2.brand}) center / 56% 100% no-repeat` }} />
      {chips.map((c) => {
        const on = c.local_date === selectedDate
        return (
          <button
            key={c.local_date}
            type="button"
            aria-pressed={on}
            aria-label={`${c.name}, ${c.date}`}
            disabled={!c.drawable}
            onClick={() => onSelectDate(c.local_date)}
            style={{
              ...bareButton,
              position: 'relative',
              minWidth: 0,
              minHeight: 48,
              padding: '6px 0 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              ...(c.drawable ? {} : { opacity: 0.35, cursor: 'default' }),
            }}
          >
            <span style={{ ...typeV2.hourPick, color: on ? colorsV2.txt1 : colorsV2.txtTab }}>{c.label}</span>
            <span style={{ ...typeV2.daySmall, fontWeight: 600 }}>{c.date.replace(/^(\w{3})\w*/, '$1')}</span>
            {on && rect === null ? <span style={{ position: 'absolute', left: '22%', right: '22%', bottom: 2, ...underline }} /> : null}
          </button>
        )
      })}
    </div>
  )
}
