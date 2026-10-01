import { useCallback, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { ROCK_TYPE_GROUPS, isRockType, rockTypeLabel, type Location } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, cardV2, inputBox, stack } from '../theme/styles.js'
import { backTarget, detailTabPath } from '../lib/backTarget.js'
import { ApiError } from '../lib/api.js'
import { draftFrom, rockLocked, updateFor, type EditDraft } from '../lib/editLocation.js'
import { useLocation, useUpdateLocation } from '../hooks/useLocations.js'
import { Screen } from '../components/Screen.js'
import { InlineError, Skeleton } from '../components/States.js'

/**
 * `/location/:id/edit` — a crag's rock type (scoring Phase 4b, the client half
 * of `PATCH /locations/:id`).
 *
 * **No aspect or angle.** One direction and one angle for a whole crag describe
 * none of its walls, so they wait for the guidebook's walls (`editLocation.ts`).
 * "Edit crag" is offered only where the rock type is the reader's to change;
 * a known crag's screen still opens here by URL and shows the locked type.
 */
export function EditLocation() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation(id)

  const onBack = useCallback(() => {
    if (id !== undefined) void navigate(backTarget({ route: 'edit', locationId: id }).to)
  }, [navigate, id])

  return (
    <Screen title="Edit crag" onBack={onBack}>
      <div style={{ ...stack(spacing.listGapLg), paddingTop: `${spacing.sectionTop}px` }}>
        {location.isPending ? (
          <Skeleton height={spacing.sectionGap * 8} />
        ) : location.isError || location.data === undefined ? (
          <InlineError message="Couldn't load this location." onRetry={() => void location.refetch()} />
        ) : !location.data.is_climbing_location ? (
          // The API refuses rock facts here (409); say why rather than offer a form.
          <p style={typeV2.body}>Only a climbing area has rock to describe.</p>
        ) : (
          <EditForm
            key={location.data.id}
            location={location.data}
            onSaved={() => void navigate(detailTabPath(location.data.id, 'rock'))}
          />
        )}
      </div>
    </Screen>
  )
}

function EditForm({ location, onSaved }: { location: Location; onSaved: () => void }) {
  const [draft, setDraft] = useState<EditDraft>(() => draftFrom(location))
  const update = useUpdateLocation(location.id)
  const changes = updateFor(location, draft)

  const onSave = () => {
    if (changes === null) return
    update.mutate(changes, { onSuccess: onSaved })
  }

  return (
    <>
      <Section title="Rock type" note="Sets how long the rock takes to dry after rain, so it changes the score.">
        {rockLocked(location) ? (
          <div style={stack(spacing.micro)}>
            <span style={{ ...typeV2.bandValue, color: colorsV2.txt1 }}>
              {location.rock_type === null ? 'Not recorded' : rockTypeLabel(location.rock_type)}
            </span>
            <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>
              Set from our research on this crag, so it can’t be changed here.
            </span>
          </div>
        ) : (
          <select
            value={draft.rockType}
            onChange={(e) => {
              const value = e.target.value
              if (isRockType(value)) setDraft({ rockType: value })
            }}
            style={{ ...inputBox, ...typeV2.controlValue, color: colorsV2.txt1, width: '100%' }}
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
        )}
      </Section>

      {update.isError ? <InlineError message={saveErrorLine(update.error)} /> : null}

      {rockLocked(location) ? null : (
        <button
          type="button"
          style={{
            ...bareButton,
            ...btnPrimary,
            ...btnPrimaryText,
            textAlign: 'center',
            opacity: changes === null || update.isPending ? 0.5 : 1,
          }}
          onClick={onSave}
          disabled={changes === null || update.isPending}
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      )}
    </>
  )
}

/**
 * Never the server's own message (`ApiError` says why). A 409 here is the
 * rock-type lock, reached only if the crag was locked after this screen opened.
 */
function saveErrorLine(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'The rock type here is now set from our research. Reopen this screen to see it.'
  }
  return 'Couldn’t save. Check your connection and try again.'
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
      <div style={stack(spacing.micro)}>
        <h2 style={typeV2.cardTitle}>{title}</h2>
        <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>{note}</p>
      </div>
      {children}
    </section>
  )
}
