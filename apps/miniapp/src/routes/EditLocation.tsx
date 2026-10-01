import { useCallback, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { colors, colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import {
  COMPASS_POINTS,
  ROCK_TYPE_GROUPS,
  WALL_ANGLE_MAX_DEG,
  WALL_ANGLE_MIN_DEG,
  isRockType,
  rockTypeLabel,
  wallAngleLabel,
  type CompassPoint,
  type Location,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, cardV2, chip, chipActive, inputBox, row, stack } from '../theme/styles.js'
import { backTarget, detailTabPath } from '../lib/backTarget.js'
import { ApiError } from '../lib/api.js'
import {
  WALL_ANGLE_PRESETS,
  WALL_ANGLE_STEP,
  draftFrom,
  rockLocked,
  updateFor,
  type EditDraft,
} from '../lib/editLocation.js'
import { useLocation, useUpdateLocation } from '../hooks/useLocations.js'
import { Screen } from '../components/Screen.js'
import { InlineError, Skeleton } from '../components/States.js'

/**
 * `/location/:id/edit` — a crag's rock type, the way its wall faces, and how
 * steep it is (scoring Phase 4b, the client half of `PATCH /locations/:id`).
 *
 * **Only the rock type moves the score today**, and the screen says so beside
 * the two that do not. Crag A reads every crag from all eight sides
 * (`cragModel.ts`); a recorded aspect and angle are kept for the per-wall
 * scoring that is not wired yet (owner decision 2026-10-01: build all three
 * now). A field that changes nothing must not look like it changed the number.
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
          <Skeleton height={spacing.sectionGap * 20} />
        ) : location.isError || location.data === undefined ? (
          <InlineError message="Couldn't load this location." onRetry={() => void location.refetch()} />
        ) : !location.data.is_climbing_location ? (
          // The API refuses wall facts here (409); say why rather than offer a form.
          <p style={typeV2.body}>Only a climbing area has rock and a wall to describe.</p>
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
              if (isRockType(value)) setDraft({ ...draft, rockType: value })
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

      <Section title="Which way the wall faces" note={NOT_SCORED_NOTE}>
        <CompassRose value={draft.aspect} onChange={(aspect) => setDraft({ ...draft, aspect })} />
      </Section>

      <Section title="Wall angle" note={NOT_SCORED_NOTE}>
        <WallAngleControl value={draft.wallAngle} onChange={(wallAngle) => setDraft({ ...draft, wallAngle })} />
      </Section>

      {update.isError ? <InlineError message={saveErrorLine(update.error)} /> : null}

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
    </>
  )
}

const NOT_SCORED_NOTE =
  'Saved for this crag. The score doesn’t use it yet — it reads the crag from every side.'

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

function Choice({
  active,
  onClick,
  label,
  children,
  style,
}: {
  active: boolean
  onClick: () => void
  label?: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      {...(label === undefined ? {} : { 'aria-label': label })}
      style={{
        ...bareButton,
        ...(active ? chipActive : chip),
        ...typeV2.chip,
        color: active ? colors.good : colorsV2.txt1,
        width: 'auto',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

/**
 * The 16 points on a circle, north at the top, so a climber picks the
 * direction by where it is rather than by spelling it. Positions are
 * percentages of the rose, so it scales with the card; the centre names the
 * pick and clears it.
 */
function CompassRose({ value, onChange }: { value: CompassPoint | null; onChange: (v: CompassPoint | null) => void }) {
  const size = spacing.sectionGap * 2.75
  return (
    <div
      role="group"
      aria-label="Which way the wall faces"
      style={{ position: 'relative', width: '86%', aspectRatio: '1', margin: '0 auto' }}
    >
      {COMPASS_POINTS.map((point, i) => {
        const angle = (i * 22.5 * Math.PI) / 180
        // One ring: at the owner's 480 px width the 16 targets sit about 60 px
        // apart, centre to centre, so each keeps a thumb's width.
        const r = 42
        return (
          <Choice
            key={point}
            active={value === point}
            onClick={() => onChange(value === point ? null : point)}
            label={`Faces ${point}`}
            style={{
              position: 'absolute',
              left: `${50 + r * Math.sin(angle)}%`,
              top: `${50 - r * Math.cos(angle)}%`,
              transform: 'translate(-50%, -50%)',
              width: `${size}px`,
              height: `${size}px`,
              padding: 0,
              borderRadius: `${radius.full}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {point}
          </Choice>
        )
      })}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          ...stack(spacing.micro),
          alignItems: 'center',
        }}
      >
        <span style={{ ...typeV2.bandValue, color: colorsV2.txt1 }}>{value ?? 'Not recorded'}</span>
        {value === null ? null : (
          <button
            type="button"
            onClick={() => onChange(null)}
            style={{ ...bareButton, ...typeV2.cardLink, width: 'auto', padding: `${spacing.tight}px` }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Presets for the names climbers use, then a slider in climbers' degrees —
 * negative slab, 0 vertical, positive overhang (`wallAngle.ts`). The slider
 * appears only once an angle is set: one resting at 0 would read as a recorded
 * vertical wall.
 */
function WallAngleControl({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div style={stack(spacing.listGapLg)}>
      <div style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
        {WALL_ANGLE_PRESETS.map((preset) => (
          <Choice key={preset.label} active={value === preset.deg} onClick={() => onChange(preset.deg)}>
            {preset.label}
          </Choice>
        ))}
      </div>
      {value === null ? (
        <span style={{ ...typeV2.bandValue, color: colorsV2.txtMuted }}>Not recorded</span>
      ) : (
        <div style={stack(spacing.listGapSm)}>
          <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
            <span style={{ ...typeV2.bandValue, color: colorsV2.txt1 }}>{wallAngleLabel(value)}</span>
            <button
              type="button"
              onClick={() => onChange(null)}
              style={{ ...bareButton, ...typeV2.cardLink, width: 'auto', padding: `${spacing.tight}px` }}
            >
              Clear
            </button>
          </div>
          <input
            type="range"
            min={WALL_ANGLE_MIN_DEG}
            max={WALL_ANGLE_MAX_DEG}
            step={WALL_ANGLE_STEP}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label="Wall angle"
            aria-valuetext={wallAngleLabel(value) ?? undefined}
            style={{ width: '100%', accentColor: colors.good }}
          />
          <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
            <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>Slab</span>
            <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>Vertical</span>
            <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>Roof</span>
          </div>
        </div>
      )}
    </div>
  )
}
