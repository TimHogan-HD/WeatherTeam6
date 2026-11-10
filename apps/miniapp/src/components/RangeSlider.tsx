import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { row } from '../theme/styles.js'

/** The thumb's width, px: `--wt6-slider-thumb` in `globals.css`, from the same two tokens. */
const THUMB = spacing.sectionGap + spacing.cellPad
const TRACK_H = spacing.chipGapMd

/**
 * Where a value sits along the track, as a CSS length. A range input's thumb
 * stays inside the track, so its centre runs from half a thumb in to half a
 * thumb short of the end; the fill follows that, not the raw fraction.
 */
function at(value: number, min: number, max: number): string {
  const p = max === min ? 0 : (value - min) / (max - min)
  return `calc(${p * 100}% + ${THUMB / 2 - THUMB * p}px)`
}

/**
 * **One bar, a start handle and an end handle** (#543's mockup). Two native
 * range inputs share the track (`.wt6-dual`), so each end keeps the keyboard,
 * screen-reader and touch behaviour a range input has. The caller clamps: it
 * is handed the value a drag asks for and returns the draft it allows, so the
 * handles can never cross or close the gap.
 */
export function RangeSlider({
  label,
  valueText,
  min,
  max,
  low,
  high,
  onLow,
  onHigh,
  lowName,
  highName,
  format,
  ends,
}: {
  label: string
  /** The whole setting, as a reader says it: `8 am to 6 pm`. */
  valueText: string
  min: number
  max: number
  low: number
  high: number
  onLow: (v: number) => void
  onHigh: (v: number) => void
  lowName: string
  highName: string
  /** One end's value as words, for a screen reader. */
  format: (v: number) => string
  /** The track's two end labels. */
  ends: readonly [string, string]
}) {
  const input = (value: number, name: string, onChange: (v: number) => void) => (
    <input
      type="range"
      min={min}
      max={max}
      step={1}
      value={value}
      aria-label={name}
      aria-valuetext={format(value)}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
    />
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.micro}px` }}>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ ...typeV2.body, color: colorsV2.txt2 }}>{label}</span>
        <b aria-live="polite" style={{ ...typeV2.whyTitle, color: colorsV2.txt1 }}>
          {valueText}
        </b>
      </div>
      <div className="wt6-dual">
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: `${TRACK_H}px`,
            marginTop: `${-TRACK_H / 2}px`,
            borderRadius: `${radius.full}px`,
            background: colorsV2.line,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: at(low, min, max),
            width: `calc(${at(high, min, max)} - ${at(low, min, max)})`,
            top: '50%',
            height: `${TRACK_H}px`,
            marginTop: `${-TRACK_H / 2}px`,
            borderRadius: `${radius.full}px`,
            background: colorsV2.brand,
          }}
        />
        {input(low, lowName, onLow)}
        {input(high, highName, onHigh)}
      </div>
      <div
        aria-hidden="true"
        style={{ ...row(spacing.cellPad), justifyContent: 'space-between', ...typeV2.note, color: colorsV2.txtMuted }}
      >
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  )
}
