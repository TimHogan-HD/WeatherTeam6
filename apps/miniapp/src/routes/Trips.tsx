import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { colors, colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import type { Trip } from '@weatherteam6/types'
import { type, typeV2 } from '../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, cardV2, inputBox, row, stack } from '../theme/styles.js'
import { PlusIcon } from '../components/Icons.js'
import { Screen } from '../components/Screen.js'
import { EmptyState, InlineError, SkeletonCards } from '../components/States.js'
import { useCreateTrip, useTrips } from '../hooks/useTrips.js'
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

/** `/trips/new`: a name, the dates and one or more saved crags. */
export function TripCreate() {
  const navigate = useNavigate()
  const locations = useLocations()
  const create = useCreateTrip()
  const today = deviceToday()
  const [draft, setDraft] = useState<Draft>({ name: '', start: today, end: today, locationIds: [] })
  const [tried, setTried] = useState(false)
  const crags = (locations.data ?? []).filter((l) => l.is_climbing_location)
  const problem = draftProblem(draft)
  const back = backTarget({ route: 'tripNew' })

  const submit = () => {
    setTried(true)
    if (problem !== null || create.isPending) return
    create.mutate(
      { name: draft.name.trim(), startDate: draft.start, endDate: draft.end, cragIds: draft.locationIds },
      { onSuccess: (trip) => void navigate(tripPath(trip.id), { replace: true }) },
    )
  }

  const toggle = (id: string) =>
    setDraft((d) => ({
      ...d,
      locationIds: d.locationIds.includes(id) ? d.locationIds.filter((x) => x !== id) : [...d.locationIds, id],
    }))

  const field = { ...inputBox, ...type.calDay, width: '100%' }
  return (
    <Screen title="New trip" onBack={() => void navigate(back.to)}>
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
        {create.isError ? <p style={{ ...type.bodySm, color: colors.poor }}>Couldn’t create the trip.</p> : null}
        <button
          type="submit"
          disabled={create.isPending}
          style={{ ...bareButton, ...btnPrimary, ...btnPrimaryText, textAlign: 'center' }}
        >
          {create.isPending ? 'Creating…' : 'Create trip'}
        </button>
      </form>
    </Screen>
  )
}
