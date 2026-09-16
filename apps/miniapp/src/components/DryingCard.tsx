import { colors, spacing } from '@weatherteam6/design/tokens'
import {
  formatLastRain,
  rockTypeLabelInline,
  formatPrecipIn,
  type ConditionsScore,
  type RecentPrecip,
} from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { card, row, stack } from '../theme/styles.js'

/**
 * Precipitation and drying: when it last rained, how much fell, and when the
 * rock is climbable.
 *
 * **The rain history is figures, not a chart, and that is a correction.** It was
 * 120 hourly bars scaled to the window's own wettest hour, which on a normal
 * week is one visible mark and 119 blank slots — a chart whose entire content
 * is "it rained once, then". The question a climber is asking is *when* and
 * *how much*, and both are one short sentence. A sparkline earns its place when
 * the shape matters; here the shape is almost always a single spike.
 *
 * **Every figure comes from something that measured it.** The mockup's card also
 * carries a `SURFACE: Dry` line, and this one does not: nothing in the repo
 * computes a surface-moisture state distinct from the core. The drying model
 * produces hours-since-rain, hours-remaining and a rock type, which is the
 * *climbable* half; inventing the surface half from the same numbers would be
 * two readings where there is one. Rock temperature and sun/shade are absent
 * from the whole app for the same reason.
 */

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
 * How far back the window actually reaches, in whole days.
 *
 * **Measured, not assumed.** The route asks Open-Meteo for five days; what
 * comes back is however many hours it had, trimmed to the ones that have
 * happened. "In the past 5 days" over four days of data is a claim the figures
 * cannot support.
 */
export function windowDays(hours: RecentPrecip['hours']): number | null {
  const first = hours[0]
  const last = hours[hours.length - 1]
  if (first === undefined || last === undefined) return null
  const a = Date.parse(`${first.valid_at_local}Z`)
  const b = Date.parse(`${last.valid_at_local}Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const days = Math.floor((b - a) / DAY_MS)
  return days < 1 ? null : days
}

/** "Past 5 days", or "This window" when the span cannot be measured. */
function windowLabel(hours: RecentPrecip['hours']): string {
  const days = windowDays(hours)
  return days === null ? 'This window' : `Past ${days} days`
}

/**
 * What fell, in one phrase: how much, and over how many hours of it.
 *
 * **The wet-hour count is the part the chart was really for.** "1.12 in" alone
 * cannot tell an afternoon thunderstorm from three days of drizzle, and those
 * dry at completely different rates. `0` hours is not reachable here — the
 * caller only calls this when something fell.
 */
function rainPhrase(hours: RecentPrecip['hours']): string {
  const total = hours.reduce((sum, h) => sum + h.precip_mm, 0)
  const wet = hours.filter((h) => h.precip_mm > 0).length
  return `${formatPrecipIn(total)} over ${wet} ${wet === 1 ? 'hour' : 'hours'}`
}

/** One labelled figure. The label is always present; the value is never a dash. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...row(spacing.chipGapMd), justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <span style={{ ...type.labelSm, color: colors.txt5 }}>{label}</span>
      <span style={{ ...type.calDay, color: colors.txt1 }}>{value}</span>
    </div>
  )
}

export function DryingCard({ score, recent }: DryingCardProps) {
  const drying = score?.score_breakdown?.drying ?? null

  // The shared formatter caps this at "over 30 days ago", so a swallowed
  // rainfall fetch cannot render as a date somebody could plan against.
  const lastRain = drying === null ? null : formatLastRain(drying.hours_since_rain)

  const hours = recent.data?.hours ?? []
  const hasRain = hours.some((h) => h.precip_mm > 0)

  return (
    <section style={{ ...card, ...stack(spacing.cellPad) }}>
      <span style={type.label}>Precipitation &amp; drying</span>

      {/*
        **The verdict leads the card.** It used to be the last line, under the
        chart, at label size — the one sentence a climber opens this app to
        read, set smaller than the axis beneath it.
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

                **`unknown` is the column's default and means nobody entered a
                rock type** — an absent value wearing a word. Production renders
                it, and "unknown still drying" reads as a broken sentence about
                a real rock. The same omission rule the identity block applies.
              */}
              {drying.rock_type === 'unknown' ? (
                <span style={type.bodySm}>still drying</span>
              ) : (
                <span style={type.bodySm}>{rockTypeLabelInline(drying.rock_type)} still drying</span>
              )}
            </>
          )}
        </div>
      )}

      <div style={stack(spacing.listGapSm)}>
        {lastRain === null ? null : <Fact label="Last rain" value={lastRain} />}

        {/*
          The window. Three states, and they are different answers: still
          loading, could not be fetched, and fetched with nothing in it. The
          last one is the only one that may say "no rain".
        */}
        {recent.isPending ? null : recent.isError ? (
          <span style={type.bodySm}>Couldn&rsquo;t load the rain history.</span>
        ) : recent.data === undefined ? null : hasRain ? (
          <Fact label={windowLabel(hours)} value={rainPhrase(hours)} />
        ) : (
          // **"None in this window", not "it has not rained".** The window has
          // an edge, and rain before it is real rain these figures cannot see —
          // which is exactly why `Last rain` above can still name a time.
          <Fact label={windowLabel(hours)} value="No rain" />
        )}
      </div>
    </section>
  )
}
