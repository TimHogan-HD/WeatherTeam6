import { useState, type CSSProperties, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { colors, colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import {
  SCORE_LABEL,
  formatHumidity,
  formatPrecipIn,
  formatWindMph,
  type ForecastSnapshot,
  type Location,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { cardV2, row, stack, toneColors } from '../theme/styles.js'
import { useAlerts, useConditions, useForecast } from '../hooks/useWeather.js'
import { findToday } from '../lib/forecast.js'
import { prefetchDetail } from '../lib/prefetchDetail.js'
import { formatTempRangeF } from '../lib/format.js'
import { cardSummary, readingTone, scoreTone } from '../lib/locationList.js'
import { tempColor } from './charts/chartStyle.js'
import { AlertPill } from './Alerts.js'
import { ReadingPill } from './ReadingPills.js'
import { ChevronRightIcon, DropletIcon, HumidityIcon, TemperatureIcon, WindIcon } from './Icons.js'
import { InlineError, Skeleton } from './States.js'
import { LabelledFigure } from './LabelledFigure.js'
import { FadeIn } from './FadeIn.js'
import type { RememberedCard } from '../lib/rememberedCards.js'

/**
 * One card per saved location — the v2 layout: name and score on the first
 * row, today's weather as four figure chips, then the two readings as tinted
 * pills.
 *
 * **The conditions call is skipped entirely for a non-climbing location.** A
 * saved location may be a city, and `computeLiveForecast` does not branch on
 * `is_climbing_location` — it would return a rock-drying score for Chicago if
 * asked, so the client does not ask. That also drops two of the three upstream
 * fetches, so general locations load noticeably faster (§3).
 */

/**
 * Wraps a control that lives inside the card's own tap target, so activating it
 * does not also open the location. Click only — the card's key handler already
 * ignores events that did not originate on the card itself.
 */
function CardControl({ children }: { children: ReactNode }) {
  return <span onClick={(e) => e.stopPropagation()}>{children}</span>
}

export function LocationCard({
  location,
  remembered,
  onOpen,
}: {
  location: Location
  /** What this card showed last time on this device, drawn until all three live answers are in. */
  remembered: RememberedCard | undefined
  onOpen: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const forecast = useForecast(location.id)
  const alerts = useAlerts(location.id)
  const conditions = useConditions(location.id, location.is_climbing_location)

  // A non-crag's conditions query is disabled and stays pending forever.
  const settled =
    !forecast.isPending && !alerts.isPending && !(location.is_climbing_location && conditions.isPending)
  // Whole or not at all — see `RememberedCard`.
  const shown = remembered !== undefined && !settled ? remembered : null
  const forecastData = shown === null ? forecast.data : shown.forecast
  const alertsData = shown === null ? alerts.data : shown.alerts
  const conditionsData = shown === null ? conditions.data : shown.conditions

  // Weather that arrives after the card is drawn fades in; weather already in
  // hand when it mounts — a remembered card, or coming back to the list — does
  // not. The live copy replacing a remembered one mounts a fresh `FadeIn`, so
  // it fades in as well.
  const [settledAtMount] = useState(settled)
  const appear = (node: ReactNode, style?: CSSProperties) =>
    settledAtMount || shown !== null ? node : <FadeIn style={style}>{node}</FadeIn>

  const today = findToday(forecastData)

  /**
   * From **the same endpoint the detail screen reads**, through the same
   * summary the list sorts by — so a crag cannot show one number here, another
   * on its own screen, and rank by a third.
   */
  const summary = cardSummary(conditionsData, alertsData, shown === null && alerts.isPending)
  const reading = conditionsData?.readings?.now ?? null

  return (
    // A div, not a button. The card is the tap target (§3: tapping the card,
    // not the pill, opens detail) but it also contains a retry button when a
    // section fails, and a <button> inside a <button> is invalid markup that
    // browsers reparse — the inner control ends up outside the card.
    <div
      role="button"
      tabIndex={0}
      style={{ ...cardV2, ...stack(spacing.cardPad), cursor: 'pointer' }}
      // Opens at once. Waiting for the crag's hourly series first was tried
      // and felt laggy (owner, 2026-10-01); its fetch starts on touch-down.
      onPointerDown={() => prefetchDetail(queryClient, location)}
      onClick={() => onOpen(location.id)}
      onKeyDown={(e) => {
        // Only when the card itself has focus. Without this check, Enter or
        // Space on the retry button inside would open the location instead of
        // retrying — the keydown bubbles, and preventDefault here would cancel
        // the inner button's own activation.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(location.id)
        }
      }}
    >
      {/* Alerts outrank everything and sit above the score (§7 rule 5), which
          in v2 is on the title row — so the pill leads the card. An alert that
          failed to load must not read as "no alerts": its absence is stated. */}
      {shown === null && alerts.isError ? (
        <span style={{ ...typeV2.chip, color: colorsV2.txtMuted }}>Alerts unavailable</span>
      ) : alertsData === undefined || alertsData.length === 0 ? null : (
        appear(
          <div>
            <AlertPill alerts={alertsData} />
          </div>,
        )
      )}

      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
        <div style={{ ...row(spacing.cellPad), minWidth: 0 }}>
          {/* Wraps rather than truncating: the tail is often the part that
              tells two places apart — "Barn Bluff (Red Wing)". */}
          <span style={{ ...typeV2.cardName, minWidth: 0, overflowWrap: 'anywhere' }}>
            {location.name}
          </span>
          {summary?.score == null
            ? null
            : appear(<ScoreBadge score={summary.score} />, { flex: '0 0 auto' })}
        </div>
        <ChevronRightIcon color={colorsV2.txtMuted} />
      </div>

      {shown === null && forecast.isPending ? (
        <Skeleton height={26} />
      ) : shown === null && forecast.isError ? (
        <CardControl>
          <InlineError message="Couldn't load weather." onRetry={() => void forecast.refetch()} />
        </CardControl>
      ) : today === null ? (
        <span style={{ ...typeV2.chip, color: colorsV2.txtMuted }}>No reading for today yet.</span>
      ) : (
        appear(<TodayChips day={today} />)
      )}

      {/* The readings as label-and-value pills — never colour alone. The Figma
          draws "Dryness" and "Friction" as bare tinted words, which leaves the
          reading itself to the tint; the owner's rule is that a reading is a
          label and a value (`Dryness: Dry`), and a colour cannot be read aloud.

          Nothing at all when there are no readings, rather than an empty row.
          A named unavailable reason is a sentence about *us*, and the detail
          screen this card opens has room for it. */}
      {summary === null || summary.readings.length === 0 ? null : (
        appear(
          <div style={{ ...row(spacing.chipGapMd), flexWrap: 'wrap' }}>
            {summary.readings.map((field) => (
              <ReadingPill
                key={field.label}
                label={field.label}
                value={field.value}
                tone={readingTone(field, reading)}
              />
            ))}
          </div>,
        )
      )}
    </div>
  )
}

/**
 * The score, beside the name. `summary.score` is already `null` under a
 * Severe+ alert and while alerts are loading, so there is no raw number here to
 * reach past.
 */
function ScoreBadge({ score }: { score: number }) {
  const tone = toneColors(scoreTone(score), 'badge')
  return (
    <span
      style={{
        ...row(spacing.chipGapMd),
        flex: '0 0 auto',
        backgroundColor: tone.background,
        borderRadius: `${radius.chipMd}px`,
        padding: `${spacing.chipGap}px ${spacing.cellPad}px`,
      }}
    >
      <span style={{ ...typeV2.badgeLabel, color: tone.label }}>{SCORE_LABEL}</span>
      <span style={{ ...typeV2.badgeValue, color: tone.value }}>{score}</span>
    </span>
  )
}

/**
 * Today's four figures. **Every one is a daily figure, not a present reading**
 * — the low-to-high range, the median rain total, the day's humidity and its
 * strongest wind — so each label says which daily figure it is: "Low–high",
 * not "Temperature", and "Peak wind", not "Wind" (§3). Each chip also carries
 * a spoken label that says it in full.
 *
 * **The Figma's rain chip reads "0% · 0.0 in", and the percentage is dropped.**
 * The daily row carries no chance of rain — that exists only per hour, as
 * `members_wet / member_count` — and there is no honest way to make one day's
 * figure out of 24 hours' worth. The amount is `precip_mm_p50`, the median of
 * the members' own daily totals, which is a daily figure and not a sum.
 *
 * Colour follows the data ramps, never the status ladder: temperature by the
 * continuous ramp at the day's high, rain in the rain accent once any is
 * forecast.
 */
function TodayChips({ day }: { day: ForecastSnapshot }) {
  const rainy = day.precip_mm_p50 !== null && day.precip_mm_p50 > 0
  return (
    <div style={{ ...row(spacing.chipGapMd), alignItems: 'stretch' }}>
      <LabelledFigure
        icon={<TemperatureIcon color={colorsV2.txtMuted} />}
        value={formatTempRangeF(day.temp_c_min, day.temp_c_max)}
        label="Low–high"
        color={day.temp_c_max === null ? colorsV2.txt1 : tempColor(day.temp_c_max)}
        spoken={`Low to high today: ${formatTempRangeF(day.temp_c_min, day.temp_c_max)}`}
      />
      <LabelledFigure
        icon={<DropletIcon color={colorsV2.txtMuted} />}
        value={formatPrecipIn(day.precip_mm_p50)}
        label="Rain"
        color={rainy ? colors.rain : colorsV2.txt1}
        spoken={`Rain today: ${formatPrecipIn(day.precip_mm_p50)}`}
      />
      <LabelledFigure
        icon={<HumidityIcon color={colorsV2.txtMuted} />}
        value={formatHumidity(day.humidity_pct)}
        label="Humidity"
        color={colorsV2.txt1}
        spoken={`Humidity today: ${formatHumidity(day.humidity_pct)}`}
      />
      <LabelledFigure
        icon={<WindIcon color={colorsV2.txtMuted} />}
        value={formatWindMph(day.wind_kmh_max)}
        label="Peak wind"
        color={colorsV2.txt1}
        spoken={`Wind today up to ${formatWindMph(day.wind_kmh_max)}`}
      />
    </div>
  )
}
