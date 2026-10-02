import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { colors, colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import type { Trip, UpdateTripInput } from '@weatherteam6/types'
import { type, typeV2 } from '../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, cardV2, inputBox, row, stack } from '../theme/styles.js'
import { PlusIcon } from '../components/Icons.js'
import { Screen } from '../components/Screen.js'
import { EmptyState, InlineError, SkeletonCards } from '../components/States.js'
import { useCreateTrip, useTrip, useTrips, useUpdateTrip } from '../hooks/useTrips.js'
import { useLocations } from '../hooks/useLocations.js'
import { NEW_TRIP_PATH, backTarget, tripPath } from '../lib/backTarget.js'
import { cragCount, dateLabel, deviceToday, forecastOpens, formatTripDates, tripTiming } from '../lib/trips.js'
import { SectionScreen } from './Sections.js'

/** `/trips`: every trip, soonest first, as the API orders them. */
export function TripList() {
  const navigate = useNavigate()
  const trips = useTrips()
  const today = deviceToday()
  const openNew = () => void navigate(NEW_TRIP_PATH)
  return (
    <SectionScreen
      title="Trips"
      action={
        <button
          type="button"
          onClick={openNew}
          style={{
            ...bareButton,
            ...row(spacing.tight),
            width: 'auto',
            backgroundColor: colors.good,
            borderRadius: `${radius.full}px`,
            padding: `${spacing.listGap}px ${spacing.cardPad}px`,
          }}
        >
          <PlusIcon color={colors.onGood} />
          <span style={typeV2.button}>New trip</span>
        </button>
      }
    >
      {trips.isPending ? (
        <SkeletonCards count={2} height={80} />
      ) : trips.isError ? (
        <InlineError message="Couldn't load your trips." onRetry={() => void trips.refetch()} />
      ) : trips.data.length === 0 ? (
        <EmptyState
          title="No trips yet."
          action={
            <button
              type="button"
              style={{ ...bareButton, ...btnPrimary, ...btnPrimaryText, textAlign: 'center' }}
              onClick={openNew}
            >
              Plan a trip
            </button>
          }
        />
      ) : (
        trips.data.map((trip) => (
          <TripCard key={trip.id} trip={trip} today={today} onOpen={() => void navigate(tripPath(trip.id))} />
        ))
      )}
    </SectionScreen>
  )
}

function TripCard({ trip, today, onOpen }: { trip: Trip; today: string; onOpen: () => void }) {
  const opens = forecastOpens(trip.startDate, today)
  const timing = tripTiming(trip, today)
  const meta = [formatTripDates(trip.startDate, trip.endDate), timing, cragCount(trip.locations?.length ?? 0)]
    .filter((p): p is string => p !== null)
    .join(' · ')
  return (
    <button type="button" onClick={onOpen} style={{ ...bareButton, ...cardV2, ...stack(spacing.tight) }}>
      <span style={typeV2.cardName}>{trip.name}</span>
      <span style={typeV2.meta}>{meta}</span>
      {opens === null ? null : <span style={typeV2.note}>Forecast opens {dateLabel(opens)}</span>}
    </button>
  )
}

type Draft = { name: string; start: string; end: string; locationIds: string[] }

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
  return (
    <TripForm
      title="New trip"
      initial={{ name: '', start: today, end: today, locationIds: [] }}
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

  if (trip.isPending) {
    return (
      <Screen title="Edit trip" onBack={onBack}>
        <SkeletonCards count={3} height={56} />
      </Screen>
    )
  }
  if (trip.isError) {
    return (
      <Screen title="Edit trip" onBack={onBack}>
        <InlineError message="Couldn't load the trip." onRetry={() => void trip.refetch()} />
      </Screen>
    )
  }
  const saved = trip.data
  return (
    <TripForm
      title="Edit trip"
      initial={{
        name: saved.name,
        start: saved.startDate,
        end: saved.endDate,
        locationIds: (saved.locations ?? []).map((l) => l.locationId),
      }}
      onBack={onBack}
      pending={update.isPending}
      failed={update.isError ? 'Couldn’t save the trip.' : null}
      submitLabel={update.isPending ? 'Saving…' : 'Save'}
      datesNote={(draft) =>
        draft.start !== saved.startDate || draft.end !== saved.endDate
          ? 'Changing the dates restarts the forecast trend.'
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
  initial: Draft
  onBack: () => void
  pending: boolean
  failed: string | null
  submitLabel: string
  /** A note under the dates, shown while it returns one. */
  datesNote: ((draft: Draft) => string | null) | null
  onSubmit: (draft: Draft) => void
}

function TripForm({ title, initial, onBack, pending, failed, submitLabel, datesNote, onSubmit }: TripFormProps) {
  const locations = useLocations()
  const [draft, setDraft] = useState<Draft>(initial)
  const [tried, setTried] = useState(false)
  const crags = (locations.data ?? []).filter((l) => l.is_climbing_location)
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

  const field = { ...inputBox, ...type.calDay, width: '100%' }
  return (
    <Screen title={title} onBack={onBack}>
      <form
        style={{ ...stack(spacing.sectionGap), marginTop: `${spacing.sectionTop}px` }}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label style={stack(spacing.micro)}>
          <span style={type.label}>Name</span>
          <input
            type="text"
            value={draft.name}
            maxLength={100}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            style={field}
          />
        </label>
        <div style={{ ...row(spacing.listGap), alignItems: 'flex-start' }}>
          <label style={{ ...stack(spacing.micro), flex: 1, minWidth: 0 }}>
            <span style={type.label}>First day</span>
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
          <label style={{ ...stack(spacing.micro), flex: 1, minWidth: 0 }}>
            <span style={type.label}>Last day</span>
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
        <fieldset style={{ ...stack(spacing.listGapSm), border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ ...type.label, marginBottom: `${spacing.listGapSm}px` }}>Crags</legend>
          {locations.isPending ? (
            <SkeletonCards count={2} height={44} />
          ) : locations.isError ? (
            <InlineError message="Couldn't load your crags." onRetry={() => void locations.refetch()} />
          ) : crags.length === 0 ? (
            <p style={typeV2.body}>Save a crag first, then plan a trip to it.</p>
          ) : (
            crags.map((crag) => {
              const on = draft.locationIds.includes(crag.id)
              return (
                <label
                  key={crag.id}
                  style={{
                    ...row(spacing.listGap),
                    ...cardV2,
                    padding: `${spacing.cellPad}px ${spacing.cardPad}px`,
                    borderColor: on ? colors.good : colorsV2.line,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(crag.id)}
                    style={{ accentColor: colors.good, width: '18px', height: '18px' }}
                  />
                  <span style={typeV2.rowTitle}>{crag.name}</span>
                </label>
              )
            })
          )}
        </fieldset>
        {tried && problem !== null ? <p style={{ ...type.bodySm, color: colors.poor }}>{problem}</p> : null}
        {failed === null ? null : <p style={{ ...type.bodySm, color: colors.poor }}>{failed}</p>}
        <button
          type="submit"
          disabled={pending}
          style={{ ...bareButton, ...btnPrimary, ...btnPrimaryText, textAlign: 'center' }}
        >
          {submitLabel}
        </button>
      </form>
    </Screen>
  )
}
