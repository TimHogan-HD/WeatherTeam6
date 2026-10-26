import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { hourLabel, type ClimbHours } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { quietButton, row } from '../theme/styles.js'
import { stepHours } from '../lib/preferencesForm.js'

/** − value + for one end of a setting. `down`/`up` are the value a tap makes, null when it would move nothing. */
export function Stepper<V>({
  label,
  value,
  down,
  up,
  downName,
  upName,
  onChange,
}: {
  label: string
  value: string
  down: V | null
  up: V | null
  downName: string
  upName: string
  onChange: (v: V) => void
}) {
  const button = (next: V | null, glyph: string, name: string) => {
    const enabled = next !== null
    return (
      <button
        type="button"
        aria-label={name}
        disabled={!enabled}
        onClick={() => {
          if (next !== null) onChange(next)
        }}
        style={{
          ...quietButton,
          ...typeV2.guideRowName,
          width: `${spacing.sectionGap * 2.75}px`,
          height: `${spacing.sectionGap * 2.75}px`,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: enabled ? 1 : 0.4,
        }}
      >
        {glyph}
      </button>
    )
  }
  return (
    <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={typeV2.statLabel}>{label}</span>
      <div style={{ ...row(spacing.listGapLg), alignItems: 'center' }}>
        {button(down, '−', downName)}
        <span aria-live="polite" style={{ ...typeV2.lineFigure, color: colorsV2.txt1, minWidth: `${spacing.sectionGap * 4}px`, textAlign: 'center' }}>
          {value}
        </span>
        {button(up, '+', upName)}
      </div>
    </div>
  )
}

/** From and Until steppers for climbing hours, on Profile and on a trip, held to `stepHours`' rules. */
export function ClimbHoursSteppers({ hours, onChange }: { hours: ClimbHours; onChange: (h: ClimbHours) => void }) {
  return (
    <>
      {(['first', 'last'] as const).map((end) => {
        const label = end === 'first' ? 'From' : 'Until'
        const step = (delta: number) => {
          const next = stepHours(hours, end, delta)
          return next[end] === hours[end] ? null : next
        }
        return (
          <Stepper
            key={end}
            label={label}
            value={hourLabel(hours[end])}
            down={step(-1)}
            up={step(1)}
            downName={`${label} an hour earlier`}
            upName={`${label} an hour later`}
            onChange={onChange}
          />
        )
      })}
    </>
  )
}
