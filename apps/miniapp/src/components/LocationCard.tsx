import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import { prefetchDetail, readyToOpen } from '../lib/prefetchDetail.js'
import { formatTempRangeF } from '../lib/format.js'
import { cardSummary, readingTone, scoreTone } from '../lib/locationList.js'
import { tempColor } from './charts/chartStyle.js'
import { AlertPill } from './Alerts.js'
import { ReadingPill } from './ReadingPills.js'
import { ChevronRightIcon, DropletIcon, HumidityIcon, TemperatureIcon, WindIcon } from './Icons.js'
import { InlineError, Skeleton } from './States.js'
import { LabelledFigure } from './LabelledFigure.js'

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
  onOpen,
}: {
  location: Location
  onOpen: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const forecast = useForecast(location.id)
  const alerts = useAlerts(location.id)
  const conditions = useConditions(location.id, location.is_climbing_location)

  const today = findToday(forecast.data)

  /**
   * **Opens once the screen can draw whole**, or after `OPEN_WAIT_MS`
   * (`readyToOpen`). The card stays dimmed meanwhile (`aria-busy`, styled in
   * `globals.css`), so the tap reads as registered. A second tap while waiting
   * does nothing, and a card that has gone — another tab tapped in the wait —
   * does not navigate. Keyboard opening takes the same path.
   */
  const [opening, setOpening] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const open = () => {
    if (opening) return
    setOpening(true)
    prefetchDetail(queryClient, location)
    void readyToOpen(queryClient, location).then(() => {
      if (mounted.current) onOpen(location.id)
    })
  }

  /**
   * From **the same endpoint the detail screen reads**, through the same
   * summary the list sorts by — so a crag cannot show one number here, another
   * on its own screen, and rank by a third.
   */
  const summary = cardSummary(conditions.data, alerts.data, alerts.isPending)
  const reading = conditions.data?.readings?.now ?? null

  return (
    // A div, not a button. The card is the tap target (§3: tapping the card,
    // not the pill, opens detail) but it also contains a retry button when a
    // section fails, and a <button> inside a <button> is invalid markup that
    // browsers reparse — the inner control ends up outside the card.
    <div
      role="button"
      tabIndex={0}
      aria-busy={opening || undefined}
      style={{ ...cardV2, ...stack(spacing.cardPad), cursor: 'pointer' }}
      onPointerDown={() => prefetchDetail(queryClient, location)}
      onClick={open}
      onKeyDown={(e) => {
        // Only when the card itself has focus. Without this check, Enter or
        // Space on the retry button inside would open the location instead of
        // retrying — the keydown bubbles, and preventDefault here would cancel
        // the inner button's own activation.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
    >
      {/* Alerts outrank everything and sit above the score (§7 rule 5), which
          in v2 is on the title row — so the pill leads the card. An alert that
          failed to load must not read as "no alerts": its absence is stated. */}
      {alerts.isError ? (
        <span style={{ ...typeV2.chip, color: colorsV2.txtMuted }}>Alerts unavailable</span>
      ) : alerts.data === undefined || alerts.data.length === 0 ? null : (
        <div>
          <AlertPill alerts={alerts.data} />
        </div>
      )}

      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
        <div style={{ ...row(spacing.cellPad), minWidth: 0 }}>
          {/* Wraps rather than truncating: the tail is often the part that
              tells two places apart — "Barn Bluff (Red Wing)". */}
          <span style={{ ...typeV2.cardName, minWidth: 0, overflowWrap: 'anywhere' }}>
            {location.name}
          </span>
          {summary?.score == null ? null : <ScoreBadge score={summary.score} />}
        </div>
        <ChevronRightIcon color={colorsV2.txtMuted} />
      </div>

      {forecast.isPending ? (
        <Skeleton height={26} />
      ) : forecast.isError ? (
        <CardControl>
          <InlineError message="Couldn't load weather." onRetry={() => void forecast.refetch()} />
        </CardControl>
      ) : today === null ? (
        <span style={{ ...typeV2.chip, color: colorsV2.txtMuted }}>No reading for today yet.</span>
      ) : (
        <TodayChips day={today} />
      )}

      {/* The readings as label-and-value pills — never colour alone. The Figma
          draws "Dryness" and "Friction" as bare tinted words, which leaves the
          reading itself to the tint; the owner's rule is that a reading is a
          label and a value (`Dryness: Dry`), and a colour cannot be read aloud.

          Nothing at all when there are no readings, rather than an empty row.
          A named unavailable reason is a sentence about *us*, and the detail
          screen this card opens has room for it. */}
      {summary === null || summary.readings.length === 0 ? null : (
        <div style={{ ...row(spacing.chipGapMd), flexWrap: 'wrap' }}>
          {summary.readings.map((field) => (
            <ReadingPill
              key={field.label}
              label={field.label}
              value={field.value}
              tone={readingTone(field, reading)}
            />
          ))}
        </div>
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
