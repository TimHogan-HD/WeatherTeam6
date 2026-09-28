import type { ReactNode } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import { EM_DASH, formatPrecipIn, mmToIn, type RecentPrecip } from '@weatherteam6/types'
import { typeV2, withOpacity } from '../theme/tokens.css.js'
import { cardV2, row, stack } from '../theme/styles.js'
import {
  clockOf,
  eventSpan,
  formatSince,
  intensityOf,
  precipDays,
  precipEvents,
  precipSummary,
  weekdayOf,
  type PrecipDay,
  type PrecipEvent,
  type PrecipKind,
} from '../lib/precipHistory.js'
import { useNow } from '../hooks/useNow.js'
import { HelpIcon } from './Icons.js'
import { InlineError, Skeleton } from './States.js'

/**
 * The Precip tab, from the WT6 Figma "Precipitation history" frame: the
 * window's accumulation, its events, a bar per day, and a caveat.
 *
 * **Where it departs from the frame, and why.** The frame's third tile is
 * "Gauge conf. 74% · radar adjusted", its total carries "±0.08 in", and an
 * event reads "Moderate, W→E". Nothing here has a gauge, a radar blend, an
 * uncertainty or a storm track — the figures are Open-Meteo's own estimate of
 * the past hours — so the tile is the wettest hour, the ± is the wet-hour
 * count, and an event says how hard and how long. The frame's "Observed
 * events" is "Past events" for the same reason: nothing observed them.
 *
 * The frame draws a mixed event in `fair` amber and the third tile in `good`
 * lime. Those are the conditions ladder's colours and are not available for
 * data marks, so precipitation kinds take `rain`, `precipMix` and
 * `precipSnow`, and the tiles without a kind are neutral.
 */

export type PrecipTabProps = {
  recent: {
    data: RecentPrecip | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
  }
  /** The caveat names rock only where there is rock. */
  isClimbingLocation: boolean
}

/** The frame's sizes. */
const TILE_H = 91
const WELL_W = 34
const WELL_H = 100
const WELL_PAD = 5
const BAR_W = 24
/** A dry day's stub, so "none fell" and "no data" are different pictures. */
const BAR_MIN_H = 4
const MARKER = 8
const LOADING_H = 480

const KIND_COLOR: Record<PrecipKind, string> = {
  rain: colorsV2.rain,
  mix: colorsV2.precipMix,
  snow: colorsV2.precipSnow,
}

const KIND_PILL: Record<PrecipKind, string> = { rain: 'RAIN', mix: 'MIX', snow: 'SNOW' }
const KIND_LEGEND: Record<PrecipKind, string> = { rain: 'Rain', mix: 'Mixed event', snow: 'Snow' }

/** A kind the response could not name is drawn neutral — never as rain. */
function kindColor(kind: PrecipKind | null): string {
  return kind === null ? colorsV2.legend : KIND_COLOR[kind]
}

/** `0.18`, `0.00`, `trace`, or a dash for a day with no data. The unit is printed under the bar. */
function barFigure(mm: number | null): string {
  if (mm === null) return EM_DASH
  if (mm === 0) return '0.00'
  const inches = mmToIn(mm)
  return inches < 0.01 ? 'trace' : inches.toFixed(2)
}

/** `1.2 in snow`. */
function snowPhrase(cm: number): string {
  const inches = cm / 2.54
  return inches < 0.05 ? 'trace snow' : `${inches.toFixed(1)} in snow`
}

/** `Moderate · 3 h`, `1.2 in snow · 5 h`, `Rain, 0.4 in snow · 2 h`. */
export function eventDescription(event: PrecipEvent): string {
  const hours = `${event.wetHours} h`
  if (event.kind === 'snow' && event.snowCm !== null) return `${snowPhrase(event.snowCm)} · ${hours}`
  if (event.kind === 'mix' && event.snowCm !== null) return `Rain, ${snowPhrase(event.snowCm)} · ${hours}`
  return `${intensityOf(event.peakMmPerHour)} · ${hours}`
}

function Card({ title, aside, gap, children }: { title: string; aside?: string; gap: number; children: ReactNode }) {
  return (
    <section style={{ ...cardV2, ...stack(gap) }}>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
        <h2 style={typeV2.cardTitle}>{title}</h2>
        {aside === undefined ? null : <span style={{ ...typeV2.meta, textTransform: 'uppercase' }}>{aside}</span>}
      </div>
      {children}
    </section>
  )
}

/** A tinted surface over the well colour, as the frame layers its fills. */
function tinted(accent: string, fill: number, line: number) {
  return {
    backgroundImage: `linear-gradient(${withOpacity(accent, fill)}, ${withOpacity(accent, fill)})`,
    backgroundColor: colorsV2.surface,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: withOpacity(accent, line),
  } as const
}

function Tile({ label, value, note, accent }: { label: string; value: string; note: string; accent: string | null }) {
  const surface =
    accent === null
      ? { backgroundColor: colorsV2.surface, borderStyle: 'solid', borderWidth: '1px', borderColor: colorsV2.line }
      : tinted(accent, 0.12, 0.55)
  return (
    <div
      style={{
        ...surface,
        ...stack(spacing.micro),
        flex: '1 1 0',
        minWidth: 0,
        height: `${TILE_H}px`,
        padding: `${spacing.cellPad}px`,
        borderRadius: `${radius.rowV2}px`,
      }}
    >
      <span style={{ ...typeV2.gaugeLabel, color: accent === null ? colorsV2.txtMuted : withOpacity(accent, 0.9) }}>
        {label}
      </span>
      <span style={{ ...typeV2.cellFigure, color: accent ?? colorsV2.txt1 }}>{value}</span>
      <span style={{ ...typeV2.tileNote, color: accent === null ? colorsV2.txtMuted : withOpacity(accent, 0.72) }}>
        {note}
      </span>
    </div>
  )
}

function EventRow({ event }: { event: PrecipEvent }) {
  const accent = kindColor(event.kind)
  return (
    <li
      style={{
        ...tinted(accent, 0.07, 0.34),
        ...row(spacing.listGapLg),
        padding: `${spacing.listGapLg}px`,
        borderRadius: `${radius.rowV2}px`,
      }}
    >
      <div style={{ ...stack(spacing.tight), flex: '1 1 0', minWidth: 0 }}>
        <span style={{ ...typeV2.rowPill, color: colorsV2.txt1 }}>{eventSpan(event)}</span>
        <span style={typeV2.aside}>{eventDescription(event)}</span>
      </div>
      <div style={{ ...stack(spacing.tight), alignItems: 'flex-end' }}>
        <span style={{ ...typeV2.factValue, color: accent }}>{formatPrecipIn(event.totalMm)}</span>
        {event.kind === null ? null : (
          <span
            style={{
              ...typeV2.chip,
              color: accent,
              backgroundColor: withOpacity(accent, 0.16),
              borderRadius: `${radius.full}px`,
              padding: `${WELL_PAD}px ${spacing.listGap}px`,
            }}
          >
            {KIND_PILL[event.kind]}
          </span>
        )}
      </div>
    </li>
  )
}

function DayBar({ day, max, label }: { day: PrecipDay; max: number; label: string }) {
  const wet = day.totalMm !== null && day.totalMm > 0
  const inner = WELL_H - 2 * WELL_PAD
  const height = wet && max > 0 ? Math.max(BAR_MIN_H, Math.round(((day.totalMm ?? 0) / max) * inner)) : BAR_MIN_H
  const color = wet ? kindColor(day.kind) : colorsV2.grid
  return (
    <div style={{ ...stack(spacing.chipGapMd), flex: '1 1 0', minWidth: 0, alignItems: 'center' }}>
      <span style={{ ...typeV2.barFigure, color: wet ? color : colorsV2.txtMuted }}>{barFigure(day.totalMm)}</span>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: 'center',
          width: `${WELL_W}px`,
          height: `${WELL_H}px`,
          padding: `0 ${WELL_PAD}px ${WELL_PAD}px`,
          backgroundColor: colorsV2.surface,
          borderRadius: `${radius.card}px`,
        }}
      >
        {/* No bar at all over a day the response skipped: a stub would say "none fell". */}
        {day.totalMm === null ? null : (
          <div
            style={{
              width: `${BAR_W}px`,
              height: `${height}px`,
              backgroundColor: color,
              borderRadius: `${radius.segItem}px ${radius.segItem}px ${radius.tag}px ${radius.tag}px`,
            }}
          />
        )}
      </div>
      <span style={{ ...typeV2.dayTab, color: colorsV2.legend }}>{label}</span>
      <span style={typeV2.barUnit}>in</span>
    </div>
  )
}

export function PrecipTab({ recent, isClimbingLocation }: PrecipTabProps) {
  const now = useNow()

  if (recent.isPending) return <Skeleton height={LOADING_H} />
  if (recent.isError) {
    return <InlineError message="Couldn't load the precipitation history." onRetry={recent.refetch} />
  }
  if (recent.data === undefined) return null

  const data = recent.data
  const days = precipDays(data.hours)
  if (days.length === 0) {
    // The call answered with no hours — a gap in the record, not a dry week.
    return <p style={typeV2.body}>No precipitation history for this location yet.</p>
  }

  const summary = precipSummary(data, now)
  const events = precipEvents(data.hours)
  const offset = Number.isFinite(data.utc_offset_seconds) ? data.utc_offset_seconds : 0
  const today = new Date(now + offset * 1000).toISOString().slice(0, 10)
  const dayLabel = (date: string) => (date === today ? 'Today' : weekdayOf(date))
  const ending = summary.endingLocal === null ? undefined : `Ending ${clockOf(summary.endingLocal)}`
  const max = Math.max(0, ...days.map((d) => d.totalMm ?? 0))
  const kinds = (['rain', 'mix', 'snow'] as const).filter((k) =>
    days.some((d) => d.kind === k && (d.totalMm ?? 0) > 0),
  )

  const last = summary.lastWet
  const lastNote =
    last === null
      ? `in ${days.length} days`
      : `ended by ${last.valid_at_local.slice(0, 10) === today ? '' : `${weekdayOf(last.valid_at_local)} `}${clockOf(last.valid_at_local)}`

  return (
    <>
      <Card title={`${days.length}-day accumulation`} {...(ending === undefined ? {} : { aside: ending })} gap={spacing.listGapLg}>
        <div style={{ ...row(spacing.listGap), alignItems: 'flex-start' }}>
          <Tile
            label="Liquid est."
            value={formatPrecipIn(summary.totalMm)}
            note={
              summary.wetHours === 0
                ? 'none fell'
                : `over ${summary.wetHours} wet ${summary.wetHours === 1 ? 'hour' : 'hours'}`
            }
            accent={colorsV2.rain}
          />
          <Tile
            label="Last precip"
            value={summary.hoursSinceLast === null ? 'None' : formatSince(summary.hoursSinceLast)}
            note={lastNote}
            accent={null}
          />
          <Tile
            label="Wettest hour"
            value={summary.wettest === null ? EM_DASH : formatPrecipIn(summary.wettest.precip_mm)}
            note={
              summary.wettest === null
                ? 'none fell'
                : `${weekdayOf(summary.wettest.valid_at_local)} ${clockOf(summary.wettest.valid_at_local)}`
            }
            accent={summary.wettest === null ? null : colorsV2.rain}
          />
        </div>
      </Card>

      <Card title="Past events" gap={spacing.listGap}>
        {events.length === 0 ? (
          // "In this window", never "it has not rained": the window has an edge.
          <p style={typeV2.aside}>None in the past {days.length} days.</p>
        ) : (
          <ul style={{ ...stack(spacing.listGap), listStyle: 'none', margin: 0, padding: 0 }}>
            {events.map((e) => (
              <EventRow key={e.endLocal} event={e} />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Daily accumulation" gap={spacing.sectionGap}>
        <div
          role="img"
          aria-label={days
            .map((d) => `${dayLabel(d.localDate)} ${d.totalMm === null ? 'no data' : formatPrecipIn(d.totalMm)}`)
            .join(', ')}
          style={{ ...row(spacing.chipGapMd), alignItems: 'flex-end' }}
        >
          {days.map((d) => (
            <DayBar key={d.localDate} day={d} max={max} label={dayLabel(d.localDate)} />
          ))}
        </div>
        {kinds.length === 0 ? null : (
          <div style={row(spacing.cardPad)}>
            {kinds.map((k) => (
              <span key={k} style={row(spacing.chipGapMd)}>
                <span
                  aria-hidden
                  style={{
                    width: `${MARKER}px`,
                    height: `${MARKER}px`,
                    borderRadius: `${radius.tag}px`,
                    backgroundColor: KIND_COLOR[k],
                  }}
                />
                <span style={typeV2.legendSm}>{KIND_LEGEND[k]}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      <div
        style={{
          ...row(spacing.listGap),
          alignItems: 'flex-start',
          backgroundColor: colorsV2.surface,
          borderStyle: 'solid',
          borderWidth: '1px',
          borderColor: colorsV2.line,
          borderRadius: `${radius.rowV2}px`,
          padding: `${spacing.listGapLg}px`,
        }}
      >
        <HelpIcon color={colorsV2.txtMuted} />
        <p style={{ ...typeV2.note, flex: '1 1 0', minWidth: 0 }}>
          Model estimates, not gauge readings.
          {isClimbingLocation
            ? ' Shade, seepage, wind channeling and elevation can change conditions route-by-route. Inspect rock before climbing.'
            : null}
        </p>
      </div>
    </>
  )
}
