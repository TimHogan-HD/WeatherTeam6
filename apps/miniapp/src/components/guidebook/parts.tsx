import type { ReactNode } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import type { Conditions, ForecastSnapshot } from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { bareButton, row, stack } from '../../theme/styles.js'
import { cardSummary } from '../../lib/locationList.js'
import { shortDay, type DayReadings } from '../../lib/overview.js'
import { wallWeek } from '../../lib/guidebookView.js'
import { scoreRampColor } from '../charts/chartStyle.js'
import { sectCard } from '../charts/DayCharts.js'
import { Sect } from '../charts/liquid.js'
import { InlineError, Skeleton } from '../States.js'

/**
 * Pieces the Crag tab's three levels share — the guidebook, a wall, a route —
 * drawn to the hybrid mockup's Crag screens (Phase 4a).
 */

/** A glass card with the mockup's aqua section title. `label` names it as a region. */
export function GuideCard({
  title,
  aside,
  label,
  children,
}: {
  title: string | null
  aside?: string | null
  label?: string
  children: ReactNode
}) {
  return (
    <section style={{ ...sectCard, ...stack(spacing.listGap) }} aria-label={label}>
      {title === null ? null : <Sect title={title} aside={aside ?? null} />}
      {children}
    </section>
  )
}

/** One level up, inside the Crag tab: `‹ Red Wing guidebook`, `‹ Lower Tier`. */
export function Crumb({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...bareButton, ...typeV2.dayPick, width: 'auto', alignSelf: 'flex-start', color: colorsV2.brandInk, minHeight: '32px' }}
    >
      ‹ {label}
    </button>
  )
}

/**
 * The crag's reading now — `Now 100 Dryness: Dry` — through `cardSummary`,
 * as the list's is. **It is the crag's**, on a wall and a route too: no wall
 * has a reading of its own.
 */
export function NowLine({
  conditions,
  trailing,
  labelled = true,
}: {
  conditions: Conditions | null | undefined
  trailing: ReactNode
  /** False inside a card already titled Now. */
  labelled?: boolean
}) {
  const summary = cardSummary(conditions)
  if (summary === null || summary.readings.length === 0) return null
  return (
    <div style={{ ...row(spacing.listGap), flexWrap: 'wrap', alignItems: 'baseline' }}>
      {labelled ? <span style={typeV2.statLabel}>Now</span> : null}
      {summary.score === null ? null : (
        <span style={{ ...typeV2.dailyScore, color: scoreRampColor(summary.score) }}>{summary.score}</span>
      )}
      <span style={typeV2.lineLabel}>{summary.readings.map((f) => `${f.label}: ${f.value}`).join(' · ')}</span>
      <span style={{ marginLeft: 'auto' }}>{trailing}</span>
    </div>
  )
}

export type WeekInput = {
  forecast: readonly ForecastSnapshot[] | undefined
  todayDate: string | null
  /** Null until `/hourly` has answered. */
  readings: DayReadings | null
  pending: boolean
  /** `/forecast` or `/hourly` failed: the days are missing, not absent, and the card says so. */
  failed: boolean
  retry: () => void
}

/**
 * A wall's week (the mockup's `.week`): each day's score, good hours and
 * Dryness, from `wallWeek`. The crag's reading, and the card says so.
 */
export function WeekStrip({ week }: { week: WeekInput }) {
  if (week.pending) return <Skeleton height={96} />
  if (week.failed) return <InlineError message="Couldn't load this week's forecast." onRetry={week.retry} />
  const { todayDate } = week
  if (week.forecast === undefined || todayDate === null) {
    return <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>No forecast for today yet.</p>
  }
  const days = wallWeek(week.forecast, todayDate, week.readings)
  if (days.length === 0) return <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>No readings for this week yet.</p>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gap: `${spacing.tight}px`, textAlign: 'center' }}>
      {days.map((d) => (
        <div key={d.local_date} style={{ ...stack(spacing.micro), alignItems: 'center', minWidth: 0 }}>
          <span style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted }}>{shortDay(d.local_date, todayDate)}</span>
          <span style={{ ...typeV2.weekScore, color: d.score === null ? colorsV2.txtMuted : scoreRampColor(d.score) }}>
            {d.score ?? '—'}
          </span>
          <span style={typeV2.rowSmall}>{d.span === null ? '—' : d.span === 'None' ? 'no good hours' : d.span}</span>
          {d.dryness === null ? null : <span style={typeV2.rowSmall}>{d.dryness}</span>}
        </div>
      ))}
    </div>
  )
}
