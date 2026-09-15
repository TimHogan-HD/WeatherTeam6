import { colors, tempScale } from '@weatherteam6/design/tokens'
import { TEMP_BAND_C, cToF } from '@weatherteam6/types'
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
  /** Wind. A neutral ink, because wind is not a status and has no ramp of its own. */
  wind: colors.txt2,
  /** The upper edge of a range mark — the spread, drawn lighter than the value. */
  rangeEdge: withOpacity(colors.txt1, 0.55),
  /** A mark whose value could not be read — a visible absence, not a colour. */
  noData: withOpacity(colors.txt1, 0.18),
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
export const DAY_VIEW_H = 122
/** Chance of rain is a 0-100 scale with no outliers, so it needs less room. */
export const CHANCE_VIEW_H = 70
export const WIND_VIEW_H = 88

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
 * The ideal climbing temperature, in °C, that the ramp diverges around.
 *
 * **The mockup calls this "a real config field, 50°F by default" — and no such
 * column exists.** `locations` has no ideal-temperature field, and adding one is
 * a migration plus a product decision about who sets it. Until then this is the
 * midpoint of the conditions score's own full-marks plateau (`TEMP_BAND_C`,
 * 10-22 °C), which is 16 °C / 61 °F.
 *
 * That is deliberately **not** the mockup's 50 °F. 50 °F is 10 °C, the *bottom*
 * of the plateau, so a ramp centred there would paint the whole of the range
 * the scorer likes best as "warm". Centring on the middle of the band is the
 * closest honest reading of "ideal" from data that exists. When the config
 * field lands, this constant is the one place it replaces.
 */
export const IDEAL_TEMP_C = (TEMP_BAND_C.idealMin + TEMP_BAND_C.idealMax) / 2

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** `#rrggbb` to its three channels. The scale is authored as hex, like `uvScale`. */
function channels(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16)
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = channels(a)
  const [r2, g2, b2] = channels(b)
  return `rgb(${Math.round(lerp(r1, r2, t))},${Math.round(lerp(g1, g2, t))},${Math.round(lerp(b1, b2, t))})`
}

/**
 * Air temperature on the **continuous** diverging ramp in
 * `packages/design`'s `tempScale`: neutral at ideal, cool below, warm then hot
 * above. One fixed scale, so the same temperature is the same colour on every
 * chart, every row and every location.
 *
 * **Continuous, not stepped, and that is the whole point.** The first build of
 * this used four discrete steps, which put `fair` and `poor` adjacent as
 * separate categories — ΔE 13.0 apart to normal vision, below the floor for
 * telling two hues apart, measured with the `dataviz` validator. In a
 * continuous ramp neighbouring values are *meant* to be similar; what has to be
 * distinguishable is the ends, and blue to red is not a close call. The stepped
 * version also gave the cold side one band where the warm side had two, so
 * -15 °C and +5 °C came out identical. Neither problem survives interpolation.
 *
 * Takes °C and converts internally, because the scale's stops are offsets in °F
 * — the unit the reader sees, and the unit the mockup specified them in.
 */
export function tempColor(c: number): string {
  if (!Number.isFinite(c)) return chartColors.noData
  const offsetF = cToF(c) - cToF(IDEAL_TEMP_C)

  const first = tempScale[0]
  const last = tempScale[tempScale.length - 1]
  if (first === undefined || last === undefined) return chartColors.noData
  if (offsetF <= first.offsetF) return mix(first.color, first.color, 0)
  if (offsetF >= last.offsetF) return mix(last.color, last.color, 0)

  for (let i = 0; i < tempScale.length - 1; i += 1) {
    const a = tempScale[i]
    const b = tempScale[i + 1]
    if (a === undefined || b === undefined) continue
    if (offsetF <= b.offsetF) {
      return mix(a.color, b.color, (offsetF - a.offsetF) / (b.offsetF - a.offsetF))
    }
  }
  return mix(last.color, last.color, 0)
}

/**
 * Wind, as a single-hue ramp from calm to strong.
 *
 * **Not a diverging ramp and not the status colours.** There is no "ideal" wind
 * to diverge around — wind helps a crag dry and hurts once it is strong enough
 * to be unpleasant, and the scorer's own curve is monotonic (full marks at or
 * below 15 km/h, zero at or above 50). A single hue getting lighter is the
 * honest encoding of a magnitude.
 *
 * Takes km/h, the unit the API returns, and reads against the scorer's own
 * endpoints so the colour and the wind component agree.
 */
export function windColor(kmh: number): string {
  const t = Math.max(0, Math.min(1, (kmh - WIND_CALM_KMH) / (WIND_STRONG_KMH - WIND_CALM_KMH)))
  return mix(WIND_RAMP_FROM, WIND_RAMP_TO, t)
}

/** The wind component scores full marks at or below this, and zero at or above the next. */
const WIND_CALM_KMH = 15
const WIND_STRONG_KMH = 50
/** `txt4` to `txt1` as hex — the ink scale, which is what a non-status magnitude wears. */
const WIND_RAMP_FROM = '#a0aec0'
const WIND_RAMP_TO = '#f0f4f8'
