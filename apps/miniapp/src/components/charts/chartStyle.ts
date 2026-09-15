import { colors } from '@weatherteam6/design/tokens'
import { TEMP_BAND_C } from '@weatherteam6/types'
import { withOpacity } from '../../theme/tokens.css.js'

/**
 * The chart module's colours and geometry, in one place.
 *
 * **Every colour derives from a token** — the same rule the rest of the app
 * follows, applied to marks. Two of the palette's groups are used for what they
 * were defined for: `radar*` is the precipitation intensity ramp, and `sun` is
 * the warm non-status hue.
 *
 * **`good`, `fair` and `poor` are deliberately not used for a data mark.** They
 * are the conditions ladder's status colours and they appear beside a score
 * with a word attached; painting a temperature line amber would say "fair
 * conditions" to anyone who has read the rest of the app.
 *
 * The geometry below is **not** design tokens and is not pretending to be. A
 * viewBox size, a stroke width and a bar gap describe marks, not layout, and
 * `packages/design` defines none of them. They live here so there is still
 * exactly one place to change them.
 */

// ─────────────────────────────────────────────
// GEOMETRY
// ─────────────────────────────────────────────

/**
 * User units across. 375 (the design width) minus the 20px gutter on each side,
 * so one user unit is one CSS pixel on the reference device and the marks scale
 * uniformly on anything else.
 */
export const VIEW_W = 335

export const TEMP_VIEW_H = 132
export const RAIN_VIEW_H = 76

/** Left gutter for the value labels, which are HTML and sit over the SVG. */
export const PAD_LEFT = 30
export const PAD_RIGHT = 4
export const PAD_TOP = 10
/** Bottom gutter for the day labels, same arrangement as `PAD_LEFT`. */
export const PAD_BOTTOM = 16

/**
 * Stroke widths are in **CSS pixels, not user units** — every stroked element
 * carries `vectorEffect: non-scaling-stroke`, so a 2px line stays 2px on a wide
 * phone instead of growing with the viewBox.
 */
export const LINE_W = 2
export const GRID_W = 1

/** A run of one hour draws no path at all, so it is drawn as a dot — 8px across. */
export const DOT_R = 4

/** Below this width a bar has no room for a gap beside it, so it does not get one. */
export const BAR_GAP_MIN_W = 4
export const BAR_GAP = 2
export const BAR_MIN_W = 1

// ─────────────────────────────────────────────
// COLOURS
// ─────────────────────────────────────────────

export const chartColors = {
  /** The temperature line. Warm, and not a status colour. */
  temperature: colors.sun,
  /** The p10-p90 ribbon behind it. */
  temperatureBand: withOpacity(colors.sun, 0.18),
  /** Rainfall bars, before the intensity ramp colours each one. */
  rain: colors.rain,
  /** Day boundaries and the bar baseline. */
  grid: colors.line,
  /** Value labels — the palette's label step. */
  valueLabel: colors.txt4,
  /** Time-axis ticks, which `colors.txt5` is reserved for and nothing else uses. */
  timeLabel: colors.txt5,
  /**
   * The diverging temperature ramp's midpoint — an ink neutral, as a diverging
   * scale's middle must be. `txt2` rather than a dimmer step because this one is
   * a **mark**, read at bar size against the card, not a caption.
   */
  neutralMark: colors.txt2,
} as const

/**
 * Rainfall intensity, in mm in the hour, on the palette's radar ramp — the one
 * group of tokens defined for precipitation echoes.
 *
 * The thresholds are the conventional rain-rate bands (light below 2.5 mm/h,
 * heavy above 7.6). They describe how a bar is *coloured* and nothing else: no
 * threshold here decides whether an hour counts as wet, which is
 * `members_wet / member_count` on the server and is not re-derived in a client.
 */
export function rainColor(mm: number): string {
  if (mm < 0.5) return colors.radarLight
  if (mm < 2.5) return colors.radarModerate
  if (mm < 7.6) return colors.radarHeavy
  return colors.radarSevere
}

// ─────────────────────────────────────────────
// SINGLE-DAY VIEW
// ─────────────────────────────────────────────

/** One day's 24 bars get more height than the seven-day strip, which is a shape. */
export const DAY_VIEW_H = 148

/**
 * The floating range mark's fill opacity. The mark is a **spread**, not a
 * measurement, so it sits back; the median rule across it is drawn at full
 * strength in the same hue and is what the eye reads as the value.
 */
export const RANGE_FILL_OPACITY = 0.35

/**
 * The shortest a range mark may be drawn.
 *
 * An ensemble whose members agree exactly gives p10 === p90, and a zero-height
 * rect paints nothing at any fill — the same disappearing-mark failure as a
 * one-point path. Perfect agreement is the most confident forecast there is and
 * must not be the one hour that vanishes.
 */
export const RANGE_MIN_H = 1

// ─────────────────────────────────────────────
// TEMPERATURE RAMP
// ─────────────────────────────────────────────

/**
 * The reference band behind the temperature bars: the range the conditions
 * score gives full marks for.
 *
 * `goodTint` is a **surface** token ("active lime tint background"), not a data
 * mark, so this does not breach the rule above — the band is an annotation that
 * says "this range is good", which is exactly what the lime tint means
 * everywhere else in the app. The bars themselves are still never painted
 * `good`, `fair` or `poor` as an identity.
 *
 * It is also what stops the ramp's hot end being colour-alone. `fair` and
 * `poor` are only ΔE 13.0 apart to normal vision (measured with the `dataviz`
 * validator against the card ground, below the 15 floor for telling two hues
 * apart), so a bar's *position* relative to this band has to carry "too warm",
 * not its hue on its own.
 */
export const tempIdealBandFill = colors.goodTint

/**
 * Air temperature on a diverging ramp centred on the conditions score's own
 * ideal band (`TEMP_BAND_C` in `packages/types`) — cool below, neutral inside,
 * warm then hot above. One fixed scale, so the same temperature is the same
 * colour on every chart and on every location.
 *
 * **The stops are the scorer's plateaus, not decoration.** Inside the band the
 * temperature component scores full marks; above `idealMax` it degrades; above
 * `max` (and below `min`) it is zero. A reader comparing a bar's colour with
 * the day's score is comparing two views of the same rule.
 *
 * **Known asymmetry, deliberate:** the cold side has one step where the warm
 * side has two, so -15 °C and +5 °C are the same blue even though the scorer
 * gives them 0 and 6. The design direction names exactly four token hues and
 * the palette's only colder blue is `radarModerate`, which is the rain-intensity
 * ramp's own step — borrowing it would read as rain in a weather app. Worth
 * revisiting on a device if sub-zero hours turn out to matter.
 */
export function tempColor(c: number): string {
  if (c < TEMP_BAND_C.idealMin) return colors.radarLight
  if (c <= TEMP_BAND_C.idealMax) return chartColors.neutralMark
  if (c <= TEMP_BAND_C.max) return colors.fair
  return colors.poor
}
