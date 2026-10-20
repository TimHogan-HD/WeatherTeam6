import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { EM_DASH, ROCK_LABELS, formatPrecipIn, type TripDayLookBack, type TripSummary } from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { bareButton, row, stack, toneColors } from '../../theme/styles.js'
import { formatTempDeg } from '../../lib/format.js'
import { ROCK_TONE } from '../../lib/locationList.js'
import { dayMonthLabel, forecastWords, hasDayTrend, leadLabel, shortDayLabel, type TrendSeries } from '../../lib/trips.js'
import { scoreRampColor } from '../charts/chartStyle.js'
import { GuideCard } from '../guidebook/parts.js'
import { InlineError, Skeleton } from '../States.js'
import { TrendCard, type QueryState } from './TripCragView.js'

/** Said once under the days: what "turned out" rests on. */
export const LOOK_BACK_SOURCE =
  'How a day turned out is the forecast model’s own look back at it once it was over, not a weather station’s record.'

/**
 * One crag's trip once it is over (the mockup's `.lb`): each day as it turned
 * out, beside what the forecast said first and last, then how the forecast
 * moved. Everything here was stored while the trip was ahead; nothing is
 * fetched from upstream.
 */
export function TripLookBackView({
  summary,
  trend,
}: {
  summary: QueryState<TripDayLookBack[]>
  trend: QueryState<TrendSeries>
}) {
  if (summary.isPending) return <Skeleton height={180} />
  if (summary.isError || summary.data === undefined) {
    return (
      <GuideCard title={null}>
        <InlineError message="Couldn't load how the trip went." onRetry={summary.refetch} />
      </GuideCard>
    )
  }
  return (
    <div style={stack(spacing.listGapLg)}>
      <GuideCard title="How it turned out" label="How it turned out">
        {summary.data.map((day, i) => (
          <DayLookBack key={day.local_date} day={day} first={i === 0} />
        ))}
        <p style={typeV2.note}>{LOOK_BACK_SOURCE}</p>
      </GuideCard>
      {trend.data?.points.length === 0 && !hasDayTrend(trend.data.days) ? null : <TrendCard trend={trend} />}
    </div>
  )
}

type Column = { label: string; figure: string; color: string; note: string | null }

function Columns({ items }: { items: readonly Column[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, minmax(0, 1fr))`, gap: `${spacing.listGap}px` }}>
      {items.map((c) => (
        <div key={c.label} style={{ ...stack(2), minWidth: 0 }}>
          <span style={typeV2.statLabel}>{c.label}</span>
          <b style={{ ...typeV2.guideRowGrade, fontSize: '20px', color: c.color, overflowWrap: 'anywhere' }}>{c.figure}</b>
          {c.note === null ? null : <small style={typeV2.rowSmall}>{c.note}</small>}
        </div>
      ))}
    </div>
  )
}

function DayLookBack({ day, first }: { day: TripDayLookBack; first: boolean }) {
  const o = day.outcome
  const turned: Column =
    o === null
      ? { label: 'Turned out', figure: EM_DASH, color: colorsV2.txtMuted, note: 'Not recorded' }
      : {
          label: 'Turned out',
          figure: o.dryness === null ? (o.score === null ? EM_DASH : String(o.score)) : ROCK_LABELS[o.dryness],
          color:
            o.dryness !== null
              ? toneColors(ROCK_TONE[o.dryness], 'pill').value
              : o.score === null
                ? colorsV2.txtMuted
                : scoreRampColor(o.score),
          note: [
            o.dryness !== null && o.score !== null ? `score ${o.score}` : null,
            formatPrecipIn(o.rain_mm),
            `high ${formatTempDeg(o.temp_c_max)}`,
            `low ${formatTempDeg(o.temp_c_min)}`,
          ]
            .filter((p): p is string => p !== null)
            .join(' · '),
        }
  // One recording is one figure: when the first and last are the same, the last column is not drawn.
  const said = [
    { label: 'Said first', f: day.first },
    { label: 'Said last', f: day.last !== null && day.last.recorded_at === day.first?.recorded_at ? null : day.last },
  ]
    .map(({ label, f }): Column | null => {
      const words = f === null ? null : forecastWords(f)
      return f === null || words === null ? null : { label, figure: words, color: colorsV2.txt1, note: leadLabel(f.lead_days) }
    })
    .filter((c): c is Column => c !== null)
  return (
    <div
      role="group"
      aria-label={dayMonthLabel(day.local_date)}
      style={{ ...stack(spacing.tight), padding: `${spacing.listGap}px 0`, borderTop: first ? 'none' : `1px solid ${colorsV2.line}` }}
    >
      <span style={typeV2.statLabel}>{dayMonthLabel(day.local_date)}</span>
      <Columns items={[turned, ...said]} />
      {o !== null && o.dryness === null && o.score === null ? (
        <p style={typeV2.note}>The rock could not be read for this day.</p>
      ) : null}
    </div>
  )
}

/** Several crags once the trip is over: a row per crag, each day's outcome. Tap a crag for its days. */
export function TripLookBackGrid({
  summary,
  names,
  onOpenCrag,
}: {
  summary: QueryState<TripSummary[]>
  names: ReadonlyMap<string, string>
  onOpenCrag: (locationId: string) => void
}) {
  if (summary.isPending) return <Skeleton height={180} />
  if (summary.isError || summary.data === undefined) {
    return (
      <GuideCard title={null}>
        <InlineError message="Couldn't load how the trip went." onRetry={summary.refetch} />
      </GuideCard>
    )
  }
  return (
    <GuideCard title="How it turned out" aside="Tap a crag" label="How it turned out">
      {summary.data.map((crag, i) => (
        <button
          key={crag.locationId}
          type="button"
          onClick={() => onOpenCrag(crag.locationId)}
          style={{
            ...bareButton,
            ...stack(spacing.micro),
            textAlign: 'left',
            padding: `${spacing.listGap}px 0`,
            borderTop: i === 0 ? 'none' : `1px solid ${colorsV2.line}`,
          }}
        >
          <span style={{ ...typeV2.listName, fontSize: '18px' }}>{names.get(crag.locationId) ?? 'Crag'} ›</span>
          <span style={{ ...row(spacing.listGap), flexWrap: 'wrap' }}>
            {crag.days.map((d) => (
              <OutcomeChip key={d.local_date} day={d} />
            ))}
          </span>
        </button>
      ))}
      <p style={typeV2.note}>{LOOK_BACK_SOURCE}</p>
    </GuideCard>
  )
}

function OutcomeChip({ day }: { day: TripDayLookBack }) {
  const o = day.outcome
  // Each word in its own colour, so the row and the day's columns agree.
  const parts = [
    o?.dryness == null ? null : { text: ROCK_LABELS[o.dryness], color: toneColors(ROCK_TONE[o.dryness], 'pill').value },
    o?.score == null ? null : { text: String(o.score), color: scoreRampColor(o.score) },
  ].filter((p): p is { text: string; color: string } => p !== null)
  return (
    <span style={typeV2.lineLabel}>
      {shortDayLabel(day.local_date)}{' '}
      {parts.length === 0 ? (
        <span style={{ color: colorsV2.txtMuted }}>{EM_DASH}</span>
      ) : (
        parts.map((p, i) => (
          <span key={p.text}>
            {i > 0 ? ' · ' : ''}
            <span style={{ color: p.color }}>{p.text}</span>
          </span>
        ))
      )}
    </span>
  )
}
