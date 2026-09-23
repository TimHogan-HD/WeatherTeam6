import { colors, radius, spacing } from '@weatherteam6/design/tokens'
import { ROCK_TYPES, rockTypeLabel, type RockType } from '@weatherteam6/types'
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

/**
 * The picker, built from the shared list so it cannot offer a type the API
 * rejects or omit one it accepts.
 *
 * **Three basalt chips, and the plain one is not a middle option.** "Basalt"
 * means the kind was not recorded and takes the slower window; the other two are
 * what a climber can see from the ground — columns, or a bubbly flow top. Someone
 * who does not know picks "Basalt" and is treated cautiously, which is the point.
 *
 * `unknown` is relabelled "Not sure" here and nowhere else: it is the API's real
 * value, and "Unknown" beside a list of rock names reads like a failed lookup
 * rather than an answer the user is allowed to give.
 */
const ROCK_TYPE_OPTIONS: { value: RockType; label: string }[] = ROCK_TYPES.map((value) => ({
  value,
  label: value === 'unknown' ? 'Not sure' : rockTypeLabel(value),
}))

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
        // The `0px` fallback stays: a browser without this inset resolves the
        // function to nothing, and CSS then drops the whole declaration rather
        // than just the one value — taking `bottomInset` with it.
        paddingBottom: `calc(${spacing.bottomInset}px + env(safe-area-inset-bottom, 0px))`,
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
            {ROCK_TYPE_OPTIONS.map(({ value, label }) => (
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
