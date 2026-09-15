import { spacing } from '@weatherteam6/design/tokens'
import { type } from '../theme/tokens.css.js'
import { bareButton, chip, chipActive, row } from '../theme/styles.js'

/**
 * A row of mutually exclusive choices — the detail screen's Daily/Hourly tabs
 * and the daily list's metric toggle.
 *
 * One component for both because they are the same control, but **not one set
 * of ARIA roles**: a tab switches which region of the page is shown, a radio
 * group picks a value within a region that is already there. Screen readers
 * announce them differently and a tab that does not control a panel is a lie
 * about the page structure, so the caller says which it is.
 *
 * Visually it is the layer-chip token pair (`chip` / `chipActive`), which is
 * what this palette already uses for an inactive/active pair. No new tokens:
 * inline styles cannot express a transition anyway, so the whole affordance is
 * the fill and the border.
 */

export type SegmentedOption<T extends string> = {
  value: T
  label: string
  /**
   * A disabled option is still **shown**, never dropped. A day with no
   * forecast is a fact about the forecast; removing its chip would renumber
   * the row and leave the reader thinking the window is shorter than it is.
   */
  disabled?: boolean
}

export type SegmentedProps<T extends string> = {
  /** Announced as the group's name. Not rendered — the options speak for themselves. */
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** `tabs` controls a panel elsewhere on the screen; `radio` picks a value in place. */
  as: 'tabs' | 'radio'
  /** `tabs` only: the `id` of the panel each tab controls. */
  panelId?: string
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  as,
  panelId,
}: SegmentedProps<T>) {
  const tabs = as === 'tabs'
  return (
    <div
      role={tabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
      style={{ ...row(spacing.chipGap), flexWrap: 'wrap' }}
    >
      {options.map((option) => {
        const selected = option.value === value
        const disabled = option.disabled === true
        return (
          <button
            key={option.value}
            type="button"
            role={tabs ? 'tab' : 'radio'}
            aria-selected={tabs ? selected : undefined}
            aria-checked={tabs ? undefined : selected}
            {...(tabs && panelId !== undefined && selected ? { 'aria-controls': panelId } : {})}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            style={{
              ...bareButton,
              ...(selected ? chipActive : chip),
              ...type.navLabel,
              width: 'auto',
              textAlign: 'center',
              // The only way an inline style can say "not available". Kept
              // legible rather than invisible, for the reason on
              // `SegmentedOption.disabled`.
              ...(disabled ? { opacity: 0.4, cursor: 'default' } : {}),
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
