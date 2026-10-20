import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { ROCK_TYPE_GROUPS, isRockType, rockTypeLabel, type RockType } from '@weatherteam6/types'
import { Link } from 'react-router-dom'
import { typeV2 } from '../theme/tokens.css.js'
import { brandButton, cardV2, choicePill, fieldV2, stack } from '../theme/styles.js'

/**
 * The add flow's save form (§12.1 step 3).
 *
 * **Rock type is captured here or never.** It is the single largest lever on
 * the score — `dryingModel`'s ceiling runs from 4 h for slate to 120 h for soft
 * sandstone — and left unset it resolves to `unknown`, the slowest row in the
 * table. It can be changed later on the crag's editor, but most never will be.
 *
 * **Except on a known crag, where it is not a choice at all** (owner decision
 * 2026-09-23). The research's rock type is shown and the picker is not: the
 * API would overrule anything picked, and a control whose answer is ignored is
 * worse than no control.
 *
 * Climbing is a property of a saved location, not a precondition for saving
 * one, so the toggle defaults **off** and the picker only appears behind it.
 */

/** A locked rock: a known crag, or an OpenBeta area in `AREA_ROCK`. */
export type RockLock = { readonly name: string; readonly rock_type: RockType }

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
  /** The rock lock under the candidate — a known crag's box or a listed area — or null. */
  knownCrag: RockLock | null
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
        // A glass pane: the scroll passes under it frosted, and turns opaque
        // with reduced transparency like every other pane.
        ...cardV2,
        marginTop: `${spacing.sectionGap}px`,
        // The `0px` fallback stays: a browser without this inset resolves the
        // function to nothing, and CSS then drops the whole declaration rather
        // than just the one value — taking `bottomInset` with it.
        paddingBottom: `calc(${spacing.bottomInset}px + env(safe-area-inset-bottom, 0px))`,
        ...stack(spacing.cellPad),
      }}
    >
      <label style={stack(spacing.tight)}>
        <span style={typeV2.statLabel}>Name</span>
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          style={fieldV2}
          aria-label="Location name"
        />
      </label>

      <button
        type="button"
        style={{ ...choicePill(draft.isClimbing), ...typeV2.dayPick, alignSelf: 'flex-start' }}
        onClick={() => onChange({ ...draft, isClimbing: !draft.isClimbing })}
        aria-pressed={draft.isClimbing}
      >
        {draft.isClimbing ? '✓ Climbing area' : 'Climbing area'}
      </button>

      {draft.isClimbing && knownCrag !== null ? (
        <div style={stack(spacing.tight)}>
          <span style={typeV2.statLabel}>Rock type</span>
          <span style={{ ...typeV2.guideRowName, color: colorsV2.txt1 }}>{rockTypeLabel(knownCrag.rock_type)}</span>
          <span style={typeV2.note}>
            Set for {knownCrag.name}.{' '}
            <Link
              to={`/feedback?message=${encodeURIComponent(`Wrong rock type: ${draft.name.trim() || knownCrag.name} shows ${rockTypeLabel(knownCrag.rock_type)}. It should be: `)}`}
              style={{ color: 'inherit', textDecoration: 'underline' }}
            >
              Wrong rock type?
            </Link>
          </span>
        </div>
      ) : draft.isClimbing ? (
        <label style={stack(spacing.tight)}>
          <span style={typeV2.statLabel}>Rock type</span>
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
            style={fieldV2}
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

      {error === null ? null : <span style={{ ...typeV2.body, color: colorsV2.poorInk }}>{error}</span>}

      <button
        type="button"
        style={{ ...brandButton, width: '100%', opacity: nameIsEmpty || saving ? 0.5 : 1 }}
        onClick={onSave}
        disabled={nameIsEmpty || saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
