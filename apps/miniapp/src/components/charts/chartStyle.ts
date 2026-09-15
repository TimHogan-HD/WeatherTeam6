import { colors, tempScale } from '@weatherteam6/design/tokens'
import { SCORE_BANDS, TEMP_BAND_C, cToF } from '@weatherteam6/types'
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
  /** The ensemble whisker over a bar. Bright enough to read against any ramp step. */
  whisker: withOpacity(colors.txt1, 0.6),
  /** Wind. A neutral ink, because wind is not a status and has no ramp of its own. */
  wind: colors.txt2,
  /**
   * The p10-p90 ribbons behind the other three series.
   *
   * **One opacity for all four bands, and it is the temperature band's.** The
   * band means the same thing on every chart — where 8 in 10 members land — so
   * a reader who has learnt to read one has learnt to read all of them. A band
   * drawn fainter on rain than on temperature would say the rain forecast was
   * more certain than it is.
   */
  rainBand: withOpacity(colors.rain, 0.18),
  windBand: withOpacity(colors.txt2, 0.18),
  /** The gust line over the sustained one. Dimmer: it is the outer case, not the forecast. */
  gust: withOpacity(colors.txt1, 0.45),
  /** A mark whose value could not be read — a visible absence, not a colour. */
  noData: withOpacity(colors.txt1, 0.18),
  /** The rule marking the hour under the pointer. Brighter than a gridline. */
  crosshair: withOpacity(colors.txt1, 0.45),
} as const

// ─────────────────────────────────────────────
// SINGLE-DAY VIEW
// ─────────────────────────────────────────────

/**
 * How many labelled value gridlines a chart aims for, before the plot's own
 * height cuts it down. Snapped to round numbers by `niceTicks`.
 */
export const VALUE_TICKS = 4

/**
 * The least vertical room between two value gridlines.
 *
 * A label is 10px tall, so ticks closer than this overlap each other — and the
 * short charts are where it bites: four ticks asked for on the 70-unit chance
 * chart came back as six, 8.8 units apart under a 10px label.
 */
export const MIN_TICK_GAP = 24

/** One day's 24 bars get more height than the seven-day strip, which is a shape. */
export const DAY_VIEW_H = 122
/** Chance of rain is a 0-100 scale with no outliers, so it needs less room. */
export const CHANCE_VIEW_H = 70
export const WIND_VIEW_H = 88

/** Corner radius on a bar — the rounded data-end the dataviz guidance asks for. */
export const BAR_RADIUS = 3.5

/**
 * The shortest a bar may be drawn.
 *
 * A zero-height rect paints nothing, so a measured 0% chance of rain would look
 * identical to an hour the models never reached. A stub says "measured, and it
 * is nothing" — a different statement from silence.
 */
export const BAR_MIN_H = 1.5

/** The ensemble whisker over a bar, in CSS pixels like the other strokes. */
export const WHISKER_W = 1.4

/**
 * How much room the temperature floor sits below the coldest p10, in °C.
 *
 * Temperature bars rise from a **labelled non-zero floor**: a temperature has
 * no meaningful zero, so a column measured from 0 °F is twenty near-identical
 * full-height bars. The axis prints the floor and the reader compares tops.
 */
export const TEMP_FLOOR_PAD_C = 0.5

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
 * The conditions ladder's colour for a score.
 *
 * **Driven by `SCORE_BANDS`, the same constant `stateLabel` switches on**, so a
 * chip can never go amber on a day the words call "Mostly dry". Four rungs onto
 * three colours: 'Dry, settled' and 'Mostly dry' share lime, because the
 * palette has three status hues and those two rungs agree about the only thing
 * a colour can say.
 *
 * This is the one place in the chart module that reaches for `good`/`fair`/
 * `poor` — the ladder is what they are *for*, and it is never a data mark.
 */
export function scoreColor(score: number): string {
  if (score >= SCORE_BANDS.mostlyDry) return colors.good
  if (score >= SCORE_BANDS.mixed) return colors.fair
  return colors.poor
}
