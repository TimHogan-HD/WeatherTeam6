import { colors, radius, spacing } from '@weatherteam6/design/tokens'
import { ROCK_TYPE_GROUPS, isRockType, rockTypeLabel, type KnownCrag, type RockType } from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, chip, chipActive, inputBox, stack } from '../theme/styles.js'

/**
 * The add flow's save bar, pinned to the bottom of the preview (§12.1 step 3).
 *
 * **Rock type is captured here or never.** It is the single largest lever on
 * the score — `dryingModel`'s ceiling runs from 4 h for slate to 120 h for soft
 * sandstone — and left unset it resolves to `unknown`, the slowest row in the
 * table. There is no edit screen yet (§12.4), so save is the only chance.
 *
 * **Except on a known crag, where it is not a choice at all** (owner decision
 * 2026-09-23). The research's rock type is shown and the picker is not: the
 * API would overrule anything picked, and a control whose answer is ignored is
 * worse than no control.
 *
 * Climbing is a property of a saved location, not a precondition for saving
 * one, so the toggle defaults **off** and the picker only appears behind it.
 */

export type SaveDraft = {
  name: string
  isClimbing: boolean
  rockType: RockType
}

export function SaveBar({
  draft,
  knownCrag,
  onChange,
  onSave,
  saving,
  error,
}: {
  draft: SaveDraft
  /** The known crag under the candidate, from `matchKnownCrag`, or null. */
  knownCrag: KnownCrag | null
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

      {draft.isClimbing && knownCrag !== null ? (
        <div style={stack(spacing.micro)}>
          <span style={type.label}>Rock type</span>
          <span style={type.calDay}>{rockTypeLabel(knownCrag.rock_type)}</span>
          <span style={{ ...type.bodySm, color: colors.txt3 }}>
            Set from our research on {knownCrag.name}.
          </span>
        </div>
      ) : draft.isClimbing ? (
        <label style={stack(spacing.micro)}>
          <span style={type.label}>Rock type</span>
          {/*
           * A native `<select>`, not chips: twenty-seven values in six families
           * would fill the screen above a sticky bar. `<optgroup>` carries the
           * families, and the phone's own picker does the rest.
           */}
          <select
            value={draft.rockType}
            onChange={(e) => {
              const value = e.target.value
              if (isRockType(value)) onChange({ ...draft, rockType: value })
            }}
            style={{ ...inputBox, ...type.calDay, width: '100%' }}
            aria-label="Rock type"
          >
            {ROCK_TYPE_GROUPS.map((group) => (
              <optgroup key={group.family} label={group.family}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
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
