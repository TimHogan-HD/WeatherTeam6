import { colors, radius, spacing } from '@weatherteam6/design/tokens'
import type { RockType } from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, chip, chipActive, inputBox, row, stack } from '../theme/styles.js'

/**
 * The add flow's save bar, pinned to the bottom of the preview (§12.1 step 3).
 *
 * **Rock type is captured here or never.** It is the single largest lever on
 * the score — `dryingModel`'s ceiling runs 72 h for sandstone against 12 h for
 * granite, against a component worth 40 of 100 points — and left unset it
 * resolves to `unknown` (48 h), which will be wrong by a wide margin for most
 * real crags. There is no edit screen (§12.4), so save is the only chance.
 *
 * Climbing is a property of a saved location, not a precondition for saving
 * one, so the toggle defaults **off** and the picker only appears behind it.
 */

/** `unknown` is the API's "not sure" — it is a real rock type, not a missing value. */
const ROCK_TYPES: { value: RockType; label: string }[] = [
  { value: 'sandstone', label: 'Sandstone' },
  { value: 'limestone', label: 'Limestone' },
  { value: 'granite', label: 'Granite' },
  { value: 'basalt', label: 'Basalt' },
  { value: 'unknown', label: 'Not sure' },
]

export type SaveDraft = {
  name: string
  isClimbing: boolean
  rockType: RockType
}

export function SaveBar({
  draft,
  onChange,
  onSave,
  saving,
  error,
}: {
  draft: SaveDraft
  onChange: (draft: SaveDraft) => void
  onSave: () => void
  saving: boolean
  error: string | null
}) {
  const nameIsEmpty = draft.name.trim() === ''

  return (
    <div
      style={{
        // Sticky rather than fixed: it occupies layout space, so the end of the
        // scroll cannot hide underneath it. A fixed bar would need the screen to
        // reserve a guessed number of pixels for it, and that guess is wrong as
        // soon as the climbing toggle opens the rock-type row.
        position: 'sticky',
        bottom: 0,
        // Opaque, or the scroll shows through. `bgGradientBottom` is the colour
        // the page already ends on, so the bar reads as part of the surface.
        backgroundColor: colors.bgGradientBottom,
        borderStyle: 'solid',
        borderWidth: '1px',
        borderColor: colors.line,
        borderRadius: `${radius.card}px`,
        marginTop: `${spacing.sectionGap}px`,
        paddingLeft: `${spacing.cardPad}px`,
        paddingRight: `${spacing.cardPad}px`,
        paddingTop: `${spacing.cardPad}px`,
        // Every --tg-* reference carries a fallback: CSS drops the whole
        // declaration when a var() resolves to nothing, and not every Telegram
        // client injects these.
        paddingBottom: `calc(${spacing.bottomInset}px + var(--tg-safe-area-inset-bottom, 0px))`,
        ...stack(spacing.cellPad),
      }}
    >
      <label style={stack(spacing.micro)}>
        <span style={type.label}>Name</span>
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          style={{ ...inputBox, ...type.calDay, width: '100%' }}
          aria-label="Location name"
        />
      </label>

      <button
        type="button"
        style={{ ...bareButton, ...(draft.isClimbing ? chipActive : chip), ...type.labelSm, width: 'auto' }}
        onClick={() => onChange({ ...draft, isClimbing: !draft.isClimbing })}
        aria-pressed={draft.isClimbing}
      >
        {draft.isClimbing ? '✓ Climbing area' : 'Climbing area'}
      </button>

      {draft.isClimbing ? (
        <div style={stack(spacing.micro)}>
          <span style={type.label}>Rock type</span>
          <div style={{ ...row(spacing.chipGap), flexWrap: 'wrap' }}>
            {ROCK_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                style={{
                  ...bareButton,
                  ...(draft.rockType === value ? chipActive : chip),
                  ...type.labelSm,
                  width: 'auto',
                }}
                onClick={() => onChange({ ...draft, rockType: value })}
                aria-pressed={draft.rockType === value}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error === null ? null : <span style={{ ...type.bodySm, color: colors.poor }}>{error}</span>}

      <button
        type="button"
        style={{
          ...bareButton,
          ...btnPrimary,
          ...btnPrimaryText,
          textAlign: 'center',
          opacity: nameIsEmpty || saving ? 0.5 : 1,
        }}
        onClick={onSave}
        disabled={nameIsEmpty || saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
