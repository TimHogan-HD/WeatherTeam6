import { colors, radius, spacing } from '@weatherteam6/design/tokens'
import {
  formatHoursSinceRain,
  formatPrecipIn,
  type ConditionsScore,
  type RecentPrecip,
} from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { card, row, stack } from '../theme/styles.js'
import { chartColors, rainColor } from './charts/chartStyle.js'

/**
 * Precipitation and drying: when it last rained, what fell over the past few
 * days, and when the rock is climbable.
 *
 * **Every figure here comes from something that measured it.** The mockup's
 * card also carries a `SURFACE: Dry` line, and this one does not: nothing in
 * the repo computes a surface-moisture state distinct from the core. The drying
 * model produces hours-since-rain, hours-remaining and a rock type, which is
 * the *climbable* half; inventing the surface half from the same numbers would
 * be two readings where there is one. Rock temperature and sun/shade are absent
 * from the whole app for the same reason.
 */

/**
 * The bar chart is drawn in percentages of its own width, so there is no
 * viewBox.
 *
 * **56px, up from 40.** At 40 a 5-day window put a real afternoon of rain about
 * eight pixels high next to nothing at all, on the card a climber reads first —
 * this is the question "is the rock dry", and it was the quietest thing on the
 * screen.
 */
const SPARK_H = 56
/** Under this the bar is invisible; a measured hour of rain must not vanish. */
const SPARK_MIN_H = 2
/** Room for one line of `type.timeTick` under the bars. */
const AXIS_H = 12
const DAY_MS = 24 * 60 * 60 * 1000

export type DryingCardProps = {
  /**
   * Today's score, for the drying breakdown. `null` or `undefined` while the
   * query is in flight or when there is no row — the card renders what it has.
   */
  score: ConditionsScore | null | undefined
  recent: {
    data: RecentPrecip | undefined
    isPending: boolean
    isError: boolean
  }
}

/**
 * The past few days of rain as bars.
 *
 * **Heights are relative to the window's own wettest hour**, which is the one
 * place in this app that is the right call: there is no forecast scale to
 * compare against and no absolute rate worth encoding — the question is "when
 * did it rain, and how much of the total fell then". The card's heading carries
 * the real figure.
 */
function Sparkline({ hours }: { hours: RecentPrecip['hours'] }) {
  const peak = hours.reduce((max, h) => Math.max(max, h.precip_mm), 0)
  const ticks = dayTicks(hours)

  return (
    <div style={stack(spacing.micro)}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '1px',
          height: `${SPARK_H}px`,
          borderBottomStyle: 'solid',
          borderBottomWidth: '1px',
          borderBottomColor: chartColors.grid,
        }}
      >
        {hours.map((hour) => {
          // A dry hour draws nothing at all. **Unlike the forecast charts, that
          // is right here**: this is a measured record with no gaps in it, so an
          // absent bar means no rain rather than no reading, and 120 stubs would
          // be a solid grey band hiding the two hours that matter.
          const height = hour.precip_mm <= 0 ? 0 : Math.max(SPARK_MIN_H, (hour.precip_mm / peak) * SPARK_H)
          return (
            <div
              key={hour.valid_at_local}
              style={{
                flex: 1,
                minWidth: 0,
                height: `${height}px`,
                borderRadius: `${radius.stepBar}px`,
                backgroundColor: height === 0 ? 'transparent' : rainColor(hour.precip_mm),
              }}
            />
          )
        })}
      </div>

      {/*
        The time axis. Without it a shower on Tuesday and one three hours ago
        are the same picture — the reader's whole question here is *when*, and
        it is the same gap the hourly charts had before they were labelled.
      */}
      <div style={{ position: 'relative', height: `${AXIS_H}px` }}>
        {ticks.map((tick) => (
          <span
            key={tick.label}
            style={{
              // `timeTick` carries its own colour; the axis is not a second
              // opinion about how loud a tick mark should be.
              ...type.timeTick,
              position: 'absolute',
              left: `${tick.pct}%`,
              // The end labels are pulled inside the plot rather than centred,
              // which would hang half of "now" off the card.
              transform:
                tick.pct >= 100 ? 'translateX(-100%)' : tick.pct <= 0 ? 'none' : 'translateX(-50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Where the day boundaries fall across the window, as percentages of its width.
 *
 * **Derived from the timestamps, never from the requested window length.** The
 * route asks for five days; what comes back is however many hours Open-Meteo
 * had, trimmed to the ones that have happened. Labelling the left edge "5d"
 * because five was requested is defect class 3 — a claim the data does not
 * make — and it would be wrong by a day every time the upstream series was
 * short.
 *
 * "now" is the right edge, which is the most recent *measured* hour rather than
 * the reader's clock. The two are within an hour of each other and the label is
 * not a precise claim, but the bar under it is.
 */
export function dayTicks(
  hours: RecentPrecip['hours'],
): readonly { label: string; pct: number }[] {
  const last = hours[hours.length - 1]
  if (last === undefined || hours.length < 2) return []

  const end = Date.parse(`${last.valid_at_local}Z`)
  if (!Number.isFinite(end)) return []

  const out: { label: string; pct: number }[] = []
  for (let i = 0; i < hours.length; i++) {
    const at = hours[i]
    if (at === undefined) continue
    const t = Date.parse(`${at.valid_at_local}Z`)
    if (!Number.isFinite(t)) continue
    const daysAgo = (end - t) / DAY_MS
    // Within half an hour of a whole day back. The series is hourly, so at most
    // one sample can satisfy this per boundary.
    if (Math.abs(daysAgo - Math.round(daysAgo)) > 0.5 / 24) continue
    const whole = Math.round(daysAgo)
    if (whole === 0) continue
    // Centre of the bar, matching how the bars themselves are laid out.
    out.push({ label: `${whole}d`, pct: ((i + 0.5) / hours.length) * 100 })
  }
  // Already oldest-first: the loop walks the series in order.
  out.push({ label: 'now', pct: 100 })
  return out
}

/**
 * How far back the window actually reaches, in whole days.
 *
 * **Measured, not assumed.** The route asks Open-Meteo for five days; what
 * comes back is however many hours it had, trimmed to the ones that have
 * happened. A heading that says "past 5 days" over four days of data is a claim
 * the chart cannot support, and "no rain in the past 5 days" is the same claim
 * about a measurement — the sentence this card exists to make honestly.
 */
function windowDays(hours: RecentPrecip['hours']): number | null {
  const first = hours[0]
  const last = hours[hours.length - 1]
  if (first === undefined || last === undefined) return null
  const a = Date.parse(`${first.valid_at_local}Z`)
  const b = Date.parse(`${last.valid_at_local}Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const days = Math.floor((b - a) / DAY_MS)
  return days < 1 ? null : days
}

/** "the past 5 days", or "this window" when the span cannot be measured. */
function spanWords(hours: RecentPrecip['hours']): string {
  const days = windowDays(hours)
  return days === null ? 'this window' : `the past ${days} day${days === 1 ? '' : 's'}`
}

function windowLabel(hours: RecentPrecip['hours']): string {
  const days = windowDays(hours)
  return days === null ? 'Recent rain' : `Recent rain · past ${days} day${days === 1 ? '' : 's'}`
}

export function DryingCard({ score, recent }: DryingCardProps) {
  const drying = score?.score_breakdown?.drying ?? null

  // The shared formatter caps this at "30+ days", so a swallowed rainfall fetch
  // cannot render as a precise measurement.
  const sinceRain = drying === null ? null : formatHoursSinceRain(drying.hours_since_rain)

  const hours = recent.data?.hours ?? []
  const total = hours.reduce((sum, h) => sum + h.precip_mm, 0)
  const hasRain = hours.some((h) => h.precip_mm > 0)

  return (
    <section style={{ ...card, ...stack(spacing.cellPad) }}>
      <div style={{ ...row(spacing.chipGapMd), justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={type.label}>Precipitation &amp; drying</span>
        {sinceRain === null ? null : <span style={type.bodySm}>{sinceRain}</span>}
      </div>

      {/*
        **The verdict leads the card.** It used to be the last line, under the
        chart, at label size — the one sentence a climber opens this app to
        read, set smaller than the axis beneath it. The chart is the evidence
        for it and now sits below it, where evidence goes.
      */}
      {drying === null ? null : (
        <div style={{ ...row(spacing.chipGapMd), flexWrap: 'wrap', alignItems: 'baseline' }}>
          {drying.hours_remaining <= 0 ? (
            <span style={{ ...type.cardTitleLg, color: colors.good }}>Climbable now</span>
          ) : (
            <>
              <span style={{ ...type.cardTitleLg, color: colors.fair }}>
                Climbable in ~{Math.round(drying.hours_remaining)}h
              </span>
              {/*
                Why it is still drying, in the model's own terms. `rock_type` is
                what sets the maximum drying hours, so naming it explains the
                number rather than decorating it.
              */}
              <span style={type.bodySm}>{drying.rock_type} still drying</span>
            </>
          )}
        </div>
      )}

      {/*
        The history. Three states, and they are different answers: still
        loading, could not be fetched, and fetched with nothing in it. The last
        one is the only one that may say "no rain".
      */}
      {recent.isPending ? (
        // The whole block's height, bars and axis, so the card does not grow
        // under the reader's thumb the moment the fetch lands.
        <div style={{ height: `${SPARK_H + AXIS_H + spacing.micro}px` }} />
      ) : recent.isError ? (
        <span style={type.bodySm}>Couldn&rsquo;t load the rain history.</span>
      ) : recent.data === undefined ? null : (
        <div style={stack(spacing.micro)}>
          <div style={{ ...row(spacing.chipGap), justifyContent: 'space-between' }}>
            <span style={{ ...type.labelSm, color: colors.txt5 }}>{windowLabel(hours)}</span>
            {hasRain ? (
              // The window's total, at reading size rather than as a caption:
              // how much fell is half of what "is it dry" depends on.
              <span style={{ ...type.calDay, color: colors.txt1 }}>{formatPrecipIn(total)}</span>
            ) : null}
          </div>
          {hasRain ? (
            <Sparkline hours={hours} />
          ) : (
            // **"None in this window", not "it has not rained".** `from_date` is
            // why the distinction is available at all: the window has an edge,
            // and rain before it is real rain this chart cannot see.
            <span style={type.bodySm}>No rain in {spanWords(hours)}.</span>
          )}
        </div>
      )}
    </section>
  )
}
