import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { spacing } from '@weatherteam6/design/tokens'
import { matchKnownCrag, placeSubtitle, type GeocodeResult, type RockType } from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { bareButton, card, chip, inputBox, row, stack } from '../theme/styles.js'
import { backTarget } from '../lib/backTarget.js'
import { fromFix, fromGeocode, type Candidate } from '../lib/addCandidate.js'
import { useCurrentPosition, type Fix, type PositionReading } from '../hooks/useCurrentPosition.js'
import { useDebouncedValue, useGeocode, useReverseGeocode } from '../hooks/useGeocode.js'
import { useCreateLocation } from '../hooks/useLocations.js'
import { Screen } from '../components/Screen.js'
import { InlineError, SkeletonCards } from '../components/States.js'
import { SaveBar, type SaveDraft } from '../components/SaveBar.js'

/**
 * `/add` — find a place, then save it (§12.1). This works like saving a location
 * in any ordinary weather app; climbing is a property of a saved location, not a
 * precondition for saving one.
 *
 * **There is no weather preview** (owner decision 2026-09-30): picking a place
 * goes straight to the save form, and Save opens the saved location's own
 * screen. The preview was the detail screen in an unsaved mode that could show
 * no readings, so it read as broken.
 *
 * **The save form is a step inside this route, not a sibling of it.** It is held
 * in component state rather than a second URL so that backing out of it returns
 * to the search with the query and results intact (§2).
 */

export function AddLocation() {
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [coordsMode, setCoordsMode] = useState(false)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [draft, setDraft] = useState<SaveDraft>({ name: '', isClimbing: false, rockType: 'unknown' })

  const debouncedQuery = useDebouncedValue(query)
  const geocode = useGeocode(coordsMode ? '' : debouncedQuery)
  const create = useCreateLocation()
  // Shown before saving so the picker never offers a choice the API overrules:
  // the server runs the same `matchKnownCrag` and trusts only its own answer.
  const knownCrag = useMemo(
    () => (candidate === null ? null : matchKnownCrag(candidate.lat, candidate.lon)),
    [candidate],
  )

  const choose = useCallback((next: Candidate) => {
    setCandidate(next)
    setDraft({ name: next.name, isClimbing: false, rockType: 'unknown' })
  }, [])

  // A fix is named before the form opens. A failed lookup still opens it, with
  // the fallback name and no elevation — the fix itself is good.
  const { reading, locate, cancel: cancelLocating } = useCurrentPosition()
  const reverse = useReverseGeocode()
  const nameFix = useCallback(
    (fix: Fix) =>
      reverse.mutate(fix, {
        onSuccess: (place) => choose(fromFix(fix, place)),
        onError: () => choose(fromFix(fix, null)),
      }),
    [reverse, choose],
  )
  const locateHere = useCallback(() => locate(nameFix), [locate, nameFix])
  const cancelHere = useCallback(() => {
    cancelLocating()
    reverse.reset()
  }, [cancelLocating, reverse])

  // Back from the save form returns here with the search intact; back from the
  // search goes to the list (§2). `backTarget` owns that distinction.
  const onBack = useCallback(() => {
    const action = backTarget({ route: 'add', confirming: candidate !== null })
    switch (action.kind) {
      case 'closeSaveForm':
        setCandidate(null)
        create.reset()
        reverse.reset()
        return
      case 'navigate':
        void navigate(action.to)
        return
    }
  }, [candidate, create, reverse, navigate])

  const onSave = useCallback(() => {
    if (candidate === null) return
    const rockType: RockType | null = draft.isClimbing ? (knownCrag?.rock_type ?? draft.rockType) : null
    create.mutate(
      {
        name: draft.name.trim(),
        lat: candidate.lat,
        lon: candidate.lon,
        // applyLapseRate returns early when this is null, and dropping a known
        // one shifts every reading by the full lapse-rate correction (§12.3).
        elevation_m: candidate.elevationM,
        timezone: candidate.timezone,
        is_climbing_location: draft.isClimbing,
        rock_type: rockType,
      },
      {
        // Replace rather than push, so back from the new location lands on the
        // list and not on the form for a place already saved (§2).
        onSuccess: (created) => void navigate(`/location/${created.id}`, { replace: true }),
      },
    )
  }, [candidate, draft, knownCrag, create, navigate])

  if (candidate !== null) {
    return (
      <Screen title={candidate.name} onBack={onBack} feedback>
        {candidate.detail === null ? null : <p style={type.screenSub}>{candidate.detail}</p>}
        <SaveBar
          draft={draft}
          knownCrag={knownCrag}
          onChange={setDraft}
          onSave={onSave}
          saving={create.isPending}
          error={create.isError ? "Couldn't save this location." : null}
        />
      </Screen>
    )
  }

  return (
    <Screen title="Add a location" onBack={onBack} feedback>
      <div style={{ ...stack(spacing.listGap), marginTop: `${spacing.sectionTop}px` }}>
        <CurrentLocation reading={reading} naming={reverse.isPending} onLocate={locateHere} onCancel={cancelHere} />

        {coordsMode ? (
          <CoordinateEntry onChoose={choose} />
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a place"
              style={{ ...inputBox, ...type.calDay, width: '100%' }}
              aria-label="Search for a place"
            />
            <SearchResults
              pending={geocode.isFetching}
              error={geocode.isError}
              results={geocode.data}
              queried={debouncedQuery.trim() !== ''}
              onRetry={() => void geocode.refetch()}
              onChoose={choose}
            />
          </>
        )}

        <button
          type="button"
          style={{ ...bareButton, ...type.bodyMd }}
          onClick={() => setCoordsMode(!coordsMode)}
        >
          {coordsMode ? 'Search by name instead' : 'Enter coordinates instead'}
        </button>
      </div>
    </Screen>
  )
}

/**
 * Where the phone is, with no typing. The permission prompt follows the tap,
 * never the screen opening; once there is a fix, `naming` covers the lookup of
 * what the place is called.
 */
function CurrentLocation({
  reading,
  naming,
  onLocate,
  onCancel,
}: {
  reading: PositionReading
  naming: boolean
  onLocate: () => void
  onCancel: () => void
}) {
  if (naming) return <Working line="Finding the place…" onCancel={onCancel} />
  switch (reading.kind) {
    case 'idle':
    case 'fix':
      return (
        <button type="button" style={{ ...bareButton, ...card, ...type.cardTitle, textAlign: 'left' }} onClick={onLocate}>
          Use my current location
        </button>
      )
    case 'locating':
      return <Working line="Reading location…" onCancel={onCancel} />
    case 'failed':
      return (
        <div style={{ ...card, ...stack(spacing.listGapSm) }}>
          <span role="status" style={type.bodyMd}>
            {reading.message}
          </span>
          <div style={row(spacing.listGap)}>
            <button type="button" style={{ ...bareButton, ...chip, ...type.labelSm }} onClick={onLocate}>
              Try again
            </button>
            <button type="button" style={{ ...bareButton, ...chip, ...type.labelSm }} onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      )
  }
}

function Working({ line, onCancel }: { line: string; onCancel: () => void }) {
  return (
    <div style={{ ...card, ...row(spacing.listGap), justifyContent: 'space-between' }}>
      <span role="status" style={type.bodyMd}>
        {line}
      </span>
      <button type="button" style={{ ...bareButton, ...chip, ...type.labelSm }} onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

function SearchResults({
  pending,
  error,
  results,
  queried,
  onRetry,
  onChoose,
}: {
  pending: boolean
  error: boolean
  results: GeocodeResult[] | undefined
  queried: boolean
  onRetry: () => void
  onChoose: (candidate: Candidate) => void
}) {
  if (!queried) return null
  if (error) return <InlineError message="Couldn't search right now." onRetry={onRetry} />
  if (pending) return <SkeletonCards count={3} height={56} />
  if (results === undefined) return null
  if (results.length === 0) return <p style={type.bodyMd}>No places match that name.</p>

  return (
    <div style={stack(spacing.listGapSm)}>
      {results.map((result) => (
        <button
          key={result.id}
          type="button"
          style={{ ...bareButton, ...card, ...stack(spacing.micro) }}
          onClick={() => onChoose(fromGeocode(result))}
        >
          <span style={type.cardTitle}>{result.name}</span>
          {/* Not decoration: `Red Rock Canyon` returns three near-identically
              named parks in three states, and picking the wrong one silently
              gives a real forecast for the wrong place (§12.2). */}
          <span style={type.bodySm}>{placeSubtitle(result)}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * The hand-entered path. It exists because a crag frequently has no searchable
 * place name. There is no elevation here, so the lapse-rate correction is
 * skipped (§12.3 change 5).
 */
function CoordinateEntry({ onChoose }: { onChoose: (candidate: Candidate) => void }) {
  const [name, setName] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')

  const problem = useMemo(() => {
    if (name.trim() === '') return 'Give the place a name.'
    const latN = Number(lat)
    const lonN = Number(lon)
    if (lat.trim() === '' || !Number.isFinite(latN) || latN < -90 || latN > 90) {
      return 'Latitude must be between -90 and 90.'
    }
    if (lon.trim() === '' || !Number.isFinite(lonN) || lonN < -180 || lonN > 180) {
      return 'Longitude must be between -180 and 180.'
    }
    return null
  }, [name, lat, lon])

  return (
    <div style={stack(spacing.listGapSm)}>
      {[
        { label: 'Name', value: name, set: setName, mode: 'text' as const },
        { label: 'Latitude', value: lat, set: setLat, mode: 'decimal' as const },
        { label: 'Longitude', value: lon, set: setLon, mode: 'decimal' as const },
      ].map((field) => (
        <label key={field.label} style={stack(spacing.micro)}>
          <span style={type.label}>{field.label}</span>
          <input
            value={field.value}
            inputMode={field.mode === 'decimal' ? 'decimal' : 'text'}
            onChange={(e) => field.set(e.target.value)}
            style={{ ...inputBox, ...type.calDay, width: '100%' }}
            aria-label={field.label}
          />
        </label>
      ))}

      <button
        type="button"
        style={{ ...bareButton, ...chip, ...type.labelSm, opacity: problem === null ? 1 : 0.5 }}
        disabled={problem !== null}
        onClick={() =>
          onChoose({
            name: name.trim(),
            lat: Number(lat),
            lon: Number(lon),
            elevationM: null,
            timezone: null,
            detail: null,
          })
        }
      >
        Next
      </button>

      {problem === null ? null : <span style={type.bodySm}>{problem}</span>}
    </div>
  )
}
