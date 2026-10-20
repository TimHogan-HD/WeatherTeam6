import { useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation as useRouterLocation, useParams } from 'react-router-dom'
import { useNavigate } from '../hooks/useNavigate.js'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import type { Trip, UpdateTripInput } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, bottomClearance, brandButton, cardV2, headerBand, inputBox, navClearance, row, stack } from '../theme/styles.js'
import { FeedbackButton } from '../components/FeedbackButton.js'
import { Crumb } from '../components/guidebook/parts.js'
import { EmptyState, InlineError, SkeletonCards } from '../components/States.js'
import { useCreateTrip, useTrip, useTrips, useUpdateTrip } from '../hooks/useTrips.js'
import { useLocations } from '../hooks/useLocations.js'
import { NEW_TRIP_PATH, backTarget, editTripPath, tripPath } from '../lib/backTarget.js'
import { tripDraftFromState, type ForTrip, type TripDraft } from '../lib/tripDraft.js'
import { cragCount, dateLabel, deviceToday, forecastOpens, formatTripDates, tripTiming } from '../lib/trips.js'

/**
 * `/trips`: every trip, soonest first, as the API orders them — the hybrid
 * mockup's title and a glass card per trip (Phase 4b).
 */
export function TripList() {
  const navigate = useNavigate()
  const trips = useTrips()
  const today = deviceToday()
  const openNew = () => void navigate(NEW_TRIP_PATH)
  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <header style={{ ...headerBand, ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={stack(spacing.tight)}>
          <h1 style={typeV2.listTitle}>Trips</h1>
          <p style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted }}>Soonest first</p>
        </div>
        <button type="button" onClick={openNew} style={brandButton}>
          + New trip
        </button>
      </header>
      <div style={{ ...stack(spacing.listGapLg), padding: `0 ${spacing.sectionGap}px`, paddingBottom: navClearance }}>
        {trips.isPending ? (
          <SkeletonCards count={2} height={80} />
        ) : trips.isError ? (
          <InlineError message="Couldn't load your trips." onRetry={() => void trips.refetch()} />
        ) : trips.data.length === 0 ? (
          <EmptyState
            title="No trips yet."
            action={
              <button type="button" style={{ ...brandButton, width: '100%' }} onClick={openNew}>
                Plan a trip
              </button>
            }
          />
        ) : (
          trips.data.map((trip) => (
            <TripCard key={trip.id} trip={trip} today={today} onOpen={() => void navigate(tripPath(trip.id))} />
          ))
        )}
      </div>
    </main>
  )
}

function TripCard({ trip, today, onOpen }: { trip: Trip; today: string; onOpen: () => void }) {
  const opens = forecastOpens(trip.startDate, today)
  const timing = tripTiming(trip, today)
  const meta = [formatTripDates(trip.startDate, trip.endDate), timing, cragCount(trip.locations?.length ?? 0)]
    .filter((p): p is string => p !== null)
    .join(' · ')
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ ...bareButton, ...cardV2, ...stack(spacing.micro), padding: `${spacing.sectionGap}px 18px` }}
    >
      <span style={typeV2.listName}>{trip.name}</span>
      <span style={{ ...typeV2.rowSmall, fontSize: '13px' }}>{meta}</span>
      {opens === null ? null : (
        <span style={{ ...typeV2.rowSmall, fontSize: '13px', color: colorsV2.fairInk }}>Forecast opens {dateLabel(opens)}</span>
      )}
    </button>
  )
}

/**
 * The top of a trip's screens and its form: a crumb up a level and Feedback,
 * then the name large with its dates under it (the mockup's `.toprow` and
 * `.lhead`).
 */
export function TripHead({
  back,
  title,
  meta,
  feedbackLocationId = null,
  feedback = true,
}: {
  back: { label: string; onBack: () => void }
  title: string | null
  meta: string | null
  feedbackLocationId?: string | null
  feedback?: boolean
}) {
  return (
    <header style={{ ...headerBand, gap: `${spacing.listGap}px` }}>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', minHeight: '40px' }}>
        <Crumb label={back.label} onClick={back.onBack} />
        {feedback ? <FeedbackButton locationId={feedbackLocationId} /> : null}
      </div>
      <div style={stack(spacing.tight)}>
        {title === null ? null : <h1 style={{ ...typeV2.listTitle, overflowWrap: 'anywhere' }}>{title}</h1>}
        {meta === null || meta === '' ? null : <p style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted }}>{meta}</p>}
      </div>
    </header>
  )
}

type Draft = TripDraft

/** Why the draft cannot be sent yet, or `null` when it can. */
export function draftProblem(draft: Draft): string | null {
  if (draft.name.trim() === '') return 'Name the trip.'
  if (draft.start === '' || draft.end === '') return 'Pick the dates.'
  if (draft.end < draft.start) return 'The trip ends before it starts.'
  if (draft.locationIds.length === 0) return 'Pick at least one crag.'
  return null
}

/**
 * What an edit sends: only the fields that differ from the saved trip, so a
 * rename never touches the dates (and so never restarts the trend). An empty
 * object means nothing changed.
 */
export function tripChanges(trip: Trip, draft: Draft): UpdateTripInput {
  const changes: UpdateTripInput = {}
  if (draft.name.trim() !== trip.name) changes.name = draft.name.trim()
  if (draft.start !== trip.startDate) changes.startDate = draft.start
  if (draft.end !== trip.endDate) changes.endDate = draft.end
  const saved = (trip.locations ?? []).map((l) => l.locationId)
  const sameCrags =
    saved.length === draft.locationIds.length && draft.locationIds.every((id) => saved.includes(id))
  if (!sameCrags) changes.cragIds = draft.locationIds
  return changes
}

/** `/trips/new`: a name, the dates and one or more saved crags. */
export function TripCreate() {
  const navigate = useNavigate()
  const create = useCreateTrip()
  const today = deviceToday()
  const back = backTarget({ route: 'tripNew' })
  // Back from "Add a crag" brings the draft home; a fresh open brings none.
  const routerState: unknown = useRouterLocation().state
  const [returned] = useState(() => tripDraftFromState(routerState))
  return (
    <TripForm
      title="New trip"
      backLabel="Trips"
      path={NEW_TRIP_PATH}
      initial={returned ?? { name: '', start: today, end: today, locationIds: [] }}
      onBack={() => void navigate(back.to)}
      pending={create.isPending}
      failed={create.isError ? 'Couldn’t create the trip.' : null}
      submitLabel={create.isPending ? 'Creating…' : 'Create trip'}
      datesNote={null}
      onSubmit={(draft) =>
        create.mutate(
          { name: draft.name.trim(), startDate: draft.start, endDate: draft.end, cragIds: draft.locationIds },
          { onSuccess: (trip) => void navigate(tripPath(trip.id), { replace: true }) },
        )
      }
    />
  )
}

/** `/trips/:tripId/edit`: the same form, filled in from the saved trip. */
export function TripEdit() {
  const navigate = useNavigate()
  const { tripId } = useParams()
  const trip = useTrip(tripId)
  const update = useUpdateTrip(tripId ?? '')
  const back = backTarget({ route: 'tripEdit', tripId: tripId ?? '' })
  const onBack = () => void navigate(back.to)
  const routerState: unknown = useRouterLocation().state
  const [returned] = useState(() => tripDraftFromState(routerState))

  if (trip.isPending) {
    return (
      <FormScreen title="Edit trip" backLabel="Trip" onBack={onBack}>
        <SkeletonCards count={3} height={56} />
      </FormScreen>
    )
  }
  if (trip.isError) {
    return (
      <FormScreen title="Edit trip" backLabel="Trip" onBack={onBack}>
        <InlineError message="Couldn't load the trip." onRetry={() => void trip.refetch()} />
      </FormScreen>
    )
  }
  const saved = trip.data
  return (
    <TripForm
      title="Edit trip"
      backLabel={saved.name}
      path={editTripPath(saved.id)}
      // The returned draft is diffed against the saved trip like any other edit.
      initial={
        returned ?? {
          name: saved.name,
          start: saved.startDate,
          end: saved.endDate,
          locationIds: (saved.locations ?? []).map((l) => l.locationId),
        }
      }
      onBack={onBack}
      pending={update.isPending}
      failed={update.isError ? 'Couldn’t save the trip.' : null}
      submitLabel={update.isPending ? 'Saving…' : 'Save'}
      datesNote={(draft) =>
        draft.start !== saved.startDate || draft.end !== saved.endDate
          ? 'Changing the dates restarts the whole-trip trend.'
          : null
      }
      onSubmit={(draft) => {
        const changes = tripChanges(saved, draft)
        if (Object.keys(changes).length === 0) {
          onBack()
          return
        }
        update.mutate(changes, { onSuccess: () => void navigate(tripPath(saved.id), { replace: true }) })
      }}
    />
  )
}

type TripFormProps = {
  title: string
  /** Where the crumb goes, in words: `Trips`, or the trip being edited. */
  backLabel: string
  /** This form's own path, which "Add a crag" returns to. */
  path: string
  initial: Draft
  onBack: () => void
  pending: boolean
  failed: string | null
  submitLabel: string
  /** A note under the dates, shown while it returns one. */
  datesNote: ((draft: Draft) => string | null) | null
  onSubmit: (draft: Draft) => void
}

function TripForm({ title, backLabel, path, initial, onBack, pending, failed, submitLabel, datesNote, onSubmit }: TripFormProps) {
  const navigate = useNavigate()
  const locations = useLocations()
  const [draft, setDraft] = useState<Draft>(initial)
  const [tried, setTried] = useState(false)
  // A ticked place stays listed even if it was saved as not a crag, so nothing
  // the trip will send is hidden from the form sending it.
  const crags = (locations.data ?? []).filter((l) => l.is_climbing_location || draft.locationIds.includes(l.id))
  // The draft is written into this form's own history entry before /add is
  // pushed, so the phone's back from the search lands on the form as it was.
  const addCrag = () => {
    const forTrip: ForTrip = { returnTo: path, draft }
    void navigate(path, { replace: true, state: { tripDraft: draft } })
    void navigate('/add', { state: { forTrip } })
  }
  const problem = draftProblem(draft)
  const note = datesNote === null ? null : datesNote(draft)

  const submit = () => {
    setTried(true)
    if (problem !== null || pending) return
    onSubmit(draft)
  }

  const toggle = (id: string) =>
    setDraft((d) => ({
      ...d,
      locationIds: d.locationIds.includes(id) ? d.locationIds.filter((x) => x !== id) : [...d.locationIds, id],
    }))

  return (
    <FormScreen title={title} backLabel={backLabel} onBack={onBack}>
      <form
        style={{ ...cardV2, ...stack(spacing.cellPad), padding: `${spacing.sectionGap}px ${spacing.sectionGap}px 18px` }}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label style={stack(spacing.tight)}>
          <span style={typeV2.statLabel}>Name</span>
          <input
            type="text"
            value={draft.name}
            maxLength={100}
            placeholder="Red Wing weekend"
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            style={field}
          />
        </label>
        <div style={{ ...row(spacing.listGap), alignItems: 'flex-start' }}>
          <label style={{ ...stack(spacing.tight), flex: 1, minWidth: 0 }}>
            <span style={typeV2.statLabel}>First day</span>
            <input
              type="date"
              value={draft.start}
              onChange={(e) => {
                const start = e.target.value
                setDraft((d) => ({ ...d, start, end: d.end < start ? start : d.end }))
              }}
              style={field}
            />
          </label>
          <label style={{ ...stack(spacing.tight), flex: 1, minWidth: 0 }}>
            <span style={typeV2.statLabel}>Last day</span>
            <input
              type="date"
              value={draft.end}
              min={draft.start}
              onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
              style={field}
            />
          </label>
        </div>
        {note === null ? null : <p style={typeV2.note}>{note}</p>}
        <fieldset style={{ ...stack(spacing.micro), border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
          <legend style={{ ...typeV2.statLabel, padding: 0, marginBottom: `${spacing.tight}px` }}>Crags</legend>
          {locations.isPending ? (
            <SkeletonCards count={2} height={44} />
          ) : locations.isError ? (
            <InlineError message="Couldn't load your crags." onRetry={() => void locations.refetch()} />
          ) : (
            crags.map((crag) => (
              <label key={crag.id} style={{ ...row(spacing.listGap), minHeight: '44px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={draft.locationIds.includes(crag.id)}
                  onChange={() => toggle(crag.id)}
                  style={{ accentColor: colorsV2.brand, width: '20px', height: '20px', margin: 0, flexShrink: 0 }}
                />
                <span style={{ ...typeV2.body, fontSize: '15px', color: colorsV2.txt1 }}>{crag.name}</span>
              </label>
            ))
          )}
          {locations.isPending ? null : (
            <button
              type="button"
              onClick={addCrag}
              style={{
                ...bareButton,
                ...typeV2.dayPick,
                color: colorsV2.brandInk,
                minHeight: '44px',
                marginTop: `${spacing.tight}px`,
                padding: `0 ${spacing.cellPad}px`,
                border: `1px dashed ${colorsV2.line}`,
                borderRadius: `${radius.chipMd}px`,
              }}
            >
              + Add a crag
            </button>
          )}
        </fieldset>
        {tried && problem !== null ? <p style={{ ...typeV2.body, color: colorsV2.poorInk }}>{problem}</p> : null}
        {failed === null ? null : <p style={{ ...typeV2.body, color: colorsV2.poorInk }}>{failed}</p>}
        <button type="submit" disabled={pending} style={{ ...brandButton, width: '100%', marginTop: `${spacing.listGap}px` }}>
          {submitLabel}
        </button>
      </form>
    </FormScreen>
  )
}

/** The form's frame: the crumb back to where it came from, the title, then the card. No bottom bar sits under it. */
function FormScreen({ title, backLabel, onBack, children }: { title: string; backLabel: string; onBack: () => void; children: ReactNode }) {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <TripHead back={{ label: backLabel, onBack }} title={title} meta={null} feedback={false} />
      <div style={{ ...stack(spacing.listGapLg), padding: `0 ${spacing.sectionGap}px`, paddingBottom: bottomClearance }}>
        {children}
      </div>
    </main>
  )
}

const field: CSSProperties = {
  ...inputBox,
  ...typeV2.body,
  fontSize: '16px',
  color: colorsV2.txt1,
  width: '100%',
  minHeight: '44px',
  backgroundColor: colorsV2.surface,
  borderColor: colorsV2.line,
  borderRadius: `${radius.chipMd}px`,
  colorScheme: 'dark',
}
