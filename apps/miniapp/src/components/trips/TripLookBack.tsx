import { colorsV2, spacing, toneSurfacesV2 } from '@weatherteam6/design/tokens'
import {
  DRYNESS_LABEL,
  ROCK_LABELS,
  SCORE_LABEL,
  formatPrecipIn,
  type TripDayLookBack,
  type TripSummary,
  type TripTrendPoint,
} from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { bareButton, cardV2, row, stack } from '../../theme/styles.js'
import { formatTempDeg } from '../../lib/format.js'
import { ROCK_TONE, scoreTone } from '../../lib/locationList.js'
import { dayMonthLabel, forecastWords, leadLabel, shortDayLabel } from '../../lib/trips.js'
import { ReadingPill } from '../ReadingPills.js'
import { InlineError, Skeleton } from '../States.js'
import { CardHead, TrendCard, type QueryState } from './TripCragView.js'

/** Said once under the days: what "turned out" rests on. */
export const LOOK_BACK_SOURCE =
  'How a day turned out is the forecast model’s own look back at it once it was over, not a weather station’s record.'

/**
 * One crag's trip once it is over: each day as it turned out, beside what the
 * forecast said first and last, then how the forecast moved. Everything here
 * was stored while the trip was ahead; nothing is fetched from upstream.
 */
export function TripLookBackView({
  summary,
  trend,
}: {
  summary: QueryState<TripDayLookBack[]>
  trend: QueryState<readonly TripTrendPoint[]>
}) {
  if (summary.isPending) return <Skeleton height={180} />
  if (summary.isError || summary.data === undefined) {
    return (
      <section style={cardV2}>
        <InlineError message="Couldn't load how the trip went." onRetry={summary.refetch} />
      </section>
    )
  }
  return (
    <div style={stack(spacing.listGapLg)}>
      {summary.data.map((day) => (
        <DayLookBack key={day.local_date} day={day} />
      ))}
      {trend.data?.length === 0 ? null : <TrendCard trend={trend} />}
      <p style={typeV2.note}>{LOOK_BACK_SOURCE}</p>
    </div>
  )
}

function DayLookBack({ day }: { day: TripDayLookBack }) {
  const o = day.outcome
  const said = [day.first, day.last]
    .filter((f, i, all) => f !== null && (i === 0 || f.recorded_at !== all[0]?.recorded_at))
    .map((f) => (f === null ? null : { lead: leadLabel(f.lead_days), words: forecastWords(f) }))
    .filter((f): f is { lead: string; words: string } => f !== null && f.words !== null)
  return (
    <section style={{ ...cardV2, ...stack(spacing.cellPad) }} aria-label={dayMonthLabel(day.local_date)}>
      <CardHead title={dayMonthLabel(day.local_date)} aside={<span style={typeV2.aside}>Turned out</span>} />
      {o === null ? (
        <p style={typeV2.note}>No look back was recorded for this day.</p>
      ) : (
        <>
          {o.dryness === null && o.score === null ? (
            <p style={typeV2.note}>The rock could not be read for this day.</p>
          ) : (
            <div style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
              {o.dryness === null ? null : (
                <ReadingPill label={DRYNESS_LABEL} value={ROCK_LABELS[o.dryness]} tone={ROCK_TONE[o.dryness]} />
              )}
              {o.score === null ? null : <ReadingPill label={SCORE_LABEL} value={String(o.score)} tone={scoreTone(o.score)} />}
            </div>
          )}
          <p style={typeV2.body}>
            <span style={{ color: colorsV2.rain }}>Rain {formatPrecipIn(o.rain_mm)}</span> · High {formatTempDeg(o.temp_c_max)} ·
            Low {formatTempDeg(o.temp_c_min)}
          </p>
        </>
      )}
      {said.length === 0 ? null : (
        <div style={stack(spacing.micro)}>
          <h3 style={{ ...typeV2.kicker, color: colorsV2.txtMuted }}>Forecast said</h3>
          {said.map((s) => (
            <p key={s.lead} style={{ ...row(spacing.listGap), justifyContent: 'space-between', ...typeV2.body }}>
              <span style={{ color: colorsV2.txt2 }}>{s.lead}</span>
              <span>{s.words}</span>
            </p>
          ))}
        </div>
      )}
    </section>
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
      <section style={cardV2}>
        <InlineError message="Couldn't load how the trip went." onRetry={summary.refetch} />
      </section>
    )
  }
  return (
    <div style={stack(spacing.listGapLg)}>
      <section style={{ ...cardV2, ...stack(spacing.listGap) }} aria-label="How it turned out">
        <CardHead title="How it turned out" aside={<span style={typeV2.aside}>Tap a crag</span>} />
        {summary.data.map((crag) => (
          <button
            key={crag.locationId}
            type="button"
            onClick={() => onOpenCrag(crag.locationId)}
            style={{ ...bareButton, ...stack(spacing.micro), textAlign: 'left', padding: `${spacing.cellPad}px 0` }}
          >
            <span style={typeV2.rowTitle}>{names.get(crag.locationId) ?? 'Crag'}</span>
            <span style={{ ...row(spacing.listGap), flexWrap: 'wrap' }}>
              {crag.days.map((d) => (
                <OutcomeChip key={d.local_date} day={d} />
              ))}
            </span>
          </button>
        ))}
      </section>
      <p style={typeV2.note}>{LOOK_BACK_SOURCE}</p>
    </div>
  )
}

function OutcomeChip({ day }: { day: TripDayLookBack }) {
  const o = day.outcome
  const tone = o?.score == null ? null : toneSurfacesV2[scoreTone(o.score)]
  const words = o === null ? '—' : [o.dryness === null ? null : ROCK_LABELS[o.dryness], o.score === null ? null : String(o.score)]
    .filter((p): p is string => p !== null)
    .join(' · ') || '—'
  return (
    <span style={{ ...typeV2.note, color: colorsV2.txt2 }}>
      {shortDayLabel(day.local_date)} <span style={{ color: tone?.pillInk ?? colorsV2.txtMuted }}>{words}</span>
    </span>
  )
}
