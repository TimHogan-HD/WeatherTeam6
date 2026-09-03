import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { spacing } from '@weatherteam6/design/tokens'
import { placeSubtitle, type GeocodeResult, type RockType } from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { bareButton, card, chip, inputBox, stack } from '../theme/styles.js'
import { useBackButton } from '../telegram/useBackButton.js'
import { useDebouncedValue, useGeocode } from '../hooks/useGeocode.js'
import { usePreview } from '../hooks/useWeather.js'
import { useCreateLocation } from '../hooks/useLocations.js'
import { Screen } from '../components/Screen.js'
import { DetailView } from '../components/DetailView.js'
import { InlineError, SkeletonCards } from '../components/States.js'
import { SaveBar, type SaveDraft } from '../components/SaveBar.js'

/**
 * `/add` — search a place, preview its weather, then decide whether to keep it
 * (§12.1). This works like saving a location in any ordinary weather app;
 * climbing is a property of a saved location, not a precondition for saving one.
 *
 * **Preview is a step inside this route, not a sibling of it.** It is held in
 * component state rather than a second URL so that backing out of it returns to
 * the search with the query and results intact. Routing to a separate path and
 * navigating back would discard the search the user just ran — the exact
 * mistake §2's per-route back table was written to prevent.
 *
 * The preview reuses the detail screen in unsaved mode, which is why this is
 * the only genuinely new screen in §12.
 */

/** What a preview needs, from either the geocoder or hand-entered coordinates. */
type Candidate = {
  name: string
  lat: number
  lon: number
  /** The geocoder supplies this; the coordinate path cannot, and passes null. */
  elevationM: number | null
  timezone: string | null
}

function fromGeocode(result: GeocodeResult): Candidate {
  return {
    name: result.name,
    lat: result.lat,
    lon: result.lon,
    elevationM: result.elevation_m,
    timezone: result.timezone,
  }
}

export function AddLocation() {
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [coordsMode, setCoordsMode] = useState(false)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [draft, setDraft] = useState<SaveDraft>({ name: '', isClimbing: false, rockType: 'unknown' })

  const debouncedQuery = useDebouncedValue(query)
  const geocode = useGeocode(coordsMode ? '' : debouncedQuery)
  const preview = usePreview(
    candidate === null
      ? null
      : { lat: candidate.lat, lon: candidate.lon, elevationM: candidate.elevationM },
  )
  const create = useCreateLocation()

  const choose = useCallback((next: Candidate) => {
    setCandidate(next)
    setDraft({ name: next.name, isClimbing: false, rockType: 'unknown' })
  }, [])

  // Back from the preview returns here with the search intact; back from the
  // search goes to the list (§2).
  useBackButton(
    useCallback(() => {
      if (candidate !== null) {
        setCandidate(null)
        create.reset()
        return
      }
      void navigate('/')
    }, [candidate, create, navigate]),
  )

  const onSave = useCallback(() => {
    if (candidate === null) return
    const rockType: RockType | null = draft.isClimbing ? draft.rockType : null
    create.mutate(
      {
        name: draft.name.trim(),
        lat: candidate.lat,
        lon: candidate.lon,
        // Persisted so the saved location and this preview agree on temperature:
        // applyLapseRate returns early when it is null, and dropping it shifts
        // every reading by the full lapse-rate correction (§12.3 change 5).
        elevation_m: candidate.elevationM,
        timezone: candidate.timezone,
        is_climbing_location: draft.isClimbing,
        rock_type: rockType,
      },
      {
        // Replace rather than push, so back from the new location lands on the
        // list and not on the preview of a place already saved (§2).
        onSuccess: (created) => void navigate(`/location/${created.id}`, { replace: true }),
      },
    )
  }, [candidate, draft, create, navigate])

  if (candidate !== null) {
    return (
      <Screen title={candidate.name}>
        <p style={type.screenSub}>Not saved yet</p>
        <DetailView
          unsaved
          isClimbingLocation={draft.isClimbing}
          asosStation={null}
          forecast={{
            data: preview.data,
            isPending: preview.isPending,
            isError: preview.isError,
            refetch: () => void preview.refetch(),
          }}
        />
        <SaveBar
          draft={draft}
          onChange={setDraft}
          onSave={onSave}
          saving={create.isPending}
          error={create.isError ? "Couldn't save this location." : null}
        />
      </Screen>
    )
  }

  return (
    <Screen title="Add a location">
      <div style={{ ...stack(spacing.listGap), marginTop: `${spacing.sectionTop}px` }}>
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
 * skipped consistently in both preview and saved detail rather than applied to
 * one of them (§12.3 change 5).
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
          })
        }
      >
        Preview weather
      </button>

      {problem === null ? null : <span style={type.bodySm}>{problem}</span>}
    </div>
  )
}
