import { useCallback, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { colors, colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import type { Location } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, row, stack, wellV2 } from '../theme/styles.js'
import { clearToken } from '../lib/authToken.js'
import { formatUpdatedAt } from '../lib/format.js'
import {
  SORT_OPTIONS,
  cardSummary,
  isSortMode,
  sortLocations,
  type SortMode,
} from '../lib/locationList.js'
import { useLocations } from '../hooks/useLocations.js'
import { useNow } from '../hooks/useNow.js'
import { alertsQuery, conditionsQuery } from '../hooks/useWeather.js'
import { LocationCard } from '../components/LocationCard.js'
import { EmptyState, InlineError, SkeletonCards } from '../components/States.js'
import {
  ChevronDownIcon,
  DropletIcon,
  HumidityIcon,
  PlusIcon,
  TemperatureIcon,
  WindIcon,
} from '../components/Icons.js'

/**
 * `/` — the root, in the v2 layout: a header band carrying the title, the count
 * and freshness, the Report button in its corner, the Add button and the sort
 * control; a legend keying the chips; then the cards.
 *
 * No back affordance: there is nothing above this screen, and a control that
 * navigates to the screen already showing is the second-back-affordance bug §2
 * describes with the destination wrong instead of the count.
 *
 * The Add button is load-bearing, not decoration: it is the only way a user who
 * already has locations can reach `/add`. Without it the add flow is reachable
 * only from the empty state, which they will never see again after saving
 * their first location.
 */
export function LocationList() {
  const navigate = useNavigate()
  const now = useNow()

  const locations = useLocations()
  const openLocation = useCallback((id: string) => void navigate(`/location/${id}`), [navigate])
  const openAdd = useCallback(() => void navigate('/add'), [navigate])
  const openFeedback = useCallback(() => void navigate('/feedback'), [navigate])

  const [sort, setSort] = useSortPreference()
  const scores = useSettledScores(locations.data ?? [])
  const ordered = sortLocations(locations.data ?? [], sort, scores)

  const updated = formatUpdatedAt(locations.dataUpdatedAt, now)
  const meta =
    locations.data === undefined
      ? null
      : [`${locations.data.length} saved`, updated === null ? null : lowerFirst(updated)]
          .filter((part) => part !== null)
          .join(' · ')

  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <header
        style={{
          ...stack(spacing.sectionGap),
          backgroundColor: colorsV2.surface,
          // The band runs up under the status bar: `#root` pads by the safe-area
          // inset, and this takes it back so the colour reaches the top edge
          // while the content still clears the notch.
          marginTop: 'calc(-1 * env(safe-area-inset-top, 0px))',
          paddingTop: `calc(env(safe-area-inset-top, 0px) + ${spacing.topSafe}px)`,
          paddingInline: `${spacing.screenH}px`,
          paddingBottom: `${spacing.sectionGap}px`,
        }}
      >
        <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={stack(spacing.tight)}>
            <p style={typeV2.eyebrow}>WeatherTeam6</p>
            <h1 style={typeV2.screenTitle}>Locations</h1>
            {meta === null ? null : <p style={typeV2.meta}>{meta}</p>}
          </div>
          {/*
            The way in to `/feedback`, in the header's corner so it is found:
            beside the sort control it read as part of the list's own controls
            and was missed. "Report" rather than "Feedback" — short enough for
            the corner, and it covers both halves of the screen, an app problem
            and what the rock was actually like.
          */}
          <button
            type="button"
            onClick={openFeedback}
            style={{
              ...bareButton,
              width: 'auto',
              flexShrink: 0,
              border: `1px solid ${colors.good}`,
              borderRadius: `${radius.full}px`,
              padding: `${spacing.listGap}px ${spacing.cardPadSm}px`,
            }}
          >
            <span style={{ ...typeV2.controlValue, color: colors.good }}>Report</span>
          </button>
        </div>
        <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={openAdd}
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
            <span style={typeV2.button}>Add</span>
          </button>
          {locations.data !== undefined && locations.data.length > 1 ? (
            <SortControl value={sort} onChange={setSort} />
          ) : null}
        </div>
      </header>

      <div style={{ ...stack(spacing.listGapLg), padding: `${spacing.sectionGap}px` }}>
        {locations.isPending ? (
          <SkeletonCards count={3} height={140} />
        ) : locations.isError ? (
          <InlineError message="Couldn't load your locations." onRetry={() => void locations.refetch()} />
        ) : locations.data.length === 0 ? (
          <EmptyState
            title="No locations yet."
            action={
              <button type="button" style={{ ...bareButton, ...btnPrimary, ...btnPrimaryText, textAlign: 'center' }} onClick={openAdd}>
                Add a location
              </button>
            }
          />
        ) : (
          <>
            <Legend />
            {ordered.map((location) => (
              <LocationCard key={location.id} location={location} onOpen={openLocation} />
            ))}
          </>
        )}
      </div>

      {/*
        Sign out. A login with no way out is the same trap as a save flow with
        no delete: the token lives in `localStorage`, so without this a shared
        or borrowed device stays signed in until the token expires, and there is
        no revocation to fall back on.

        It clears the token and nothing else. The redirect to `/login` and the
        cache clear both hang off the token store in `App.tsx`, so signing out
        and being signed out by a 401 take the same path — this button cannot
        drift away from the one the API triggers.
      */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          paddingTop: `${spacing.listGap}px`,
          paddingBottom: `${spacing.bottomInset + spacing.sectionGap}px`,
        }}
      >
        <button
          type="button"
          style={{
            ...bareButton,
            ...typeV2.controlLabel,
            width: 'auto',
            padding: `${spacing.cellPad}px ${spacing.sectionGap}px`,
          }}
          onClick={clearToken}
        >
          Sign out
        </button>
      </div>
    </main>
  )
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/**
 * Every card's **suppressed** score, once all of them have settled; `null`
 * until then, which `sortLocations` reads as "keep the added order".
 *
 * The same query definitions the cards use, so this adds subscribers to the
 * cache entries the cards are already filling — no request is made twice. A
 * non-climbing location's conditions query is disabled and stays pending
 * forever, so it counts as settled on the flag rather than on the query.
 */
function useSettledScores(locations: readonly Location[]): ReadonlyMap<string, number | null> | null {
  const conditions = useQueries({
    queries: locations.map((l) => conditionsQuery(l.id, l.is_climbing_location)),
  })
  const alerts = useQueries({ queries: locations.map((l) => alertsQuery(l.id)) })

  const scores = new Map<string, number | null>()
  for (const [i, location] of locations.entries()) {
    const c = conditions[i]
    const a = alerts[i]
    if (c === undefined || a === undefined) return null
    if (a.isPending) return null
    if (location.is_climbing_location && c.isPending) return null
    scores.set(location.id, cardSummary(c.data, a.data, false)?.score ?? null)
  }
  return scores
}

const SORT_KEY = 'wt6.list-sort'

/**
 * The chosen order, remembered on this device. Storage can throw — a private
 * window, blocked site data — and the list must still sort, so every access is
 * guarded and a failure falls back to sorting by score for this visit only.
 */
function useSortPreference(): [SortMode, (mode: SortMode) => void] {
  const [mode, setMode] = useState<SortMode>(() => {
    try {
      const stored = localStorage.getItem(SORT_KEY)
      return isSortMode(stored) ? stored : 'score'
    } catch {
      return 'score'
    }
  })
  const update = useCallback((next: SortMode) => {
    setMode(next)
    try {
      localStorage.setItem(SORT_KEY, next)
    } catch {
      // Remembered for this visit only.
    }
  }, [])
  return [mode, update]
}

/**
 * A native `<select>` laid transparently over the pill. The pill is what the
 * design draws; the select is what makes it work — the platform's own picker on
 * a phone, the keyboard and a screen reader included, with none of it rebuilt.
 */
function SortControl({ value, onChange }: { value: SortMode; onChange: (mode: SortMode) => void }) {
  const label = SORT_OPTIONS.find((o) => o.value === value)?.label ?? ''
  return (
    <label
      style={{
        ...wellV2,
        ...row(spacing.listGap),
        position: 'relative',
        padding: `${spacing.listGap}px ${spacing.cardPadSm}px`,
        cursor: 'pointer',
      }}
    >
      <span style={typeV2.controlLabel}>Sort by</span>
      <span style={typeV2.controlValue}>{label}</span>
      <ChevronDownIcon color={colorsV2.txtMuted} open={false} />
      <select
        value={value}
        aria-label="Sort locations by"
        onChange={(e) => {
          if (isSortMode(e.target.value)) onChange(e.target.value)
        }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          // iOS zooms the page into any focused control under 16px.
          fontSize: '16px',
        }}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * The key to every card's chips, said once instead of on each card.
 *
 * **Each label says which daily figure it is.** Every chip is a figure for the
 * whole day, and unlabelled a range reads as the headline and a wind speed as
 * the wind right now (§3) — so it is "Low–high", not "Temperature", and "Peak
 * wind", not "Wind".
 */
function Legend() {
  return (
    <div
      style={{
        ...wellV2,
        ...row(spacing.cellPad),
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        padding: `${spacing.chipGapMd}px ${spacing.cellPad}px`,
      }}
    >
      <LegendItem icon={<TemperatureIcon color={colorsV2.txtMuted} />} label="Low–high" />
      <LegendItem icon={<DropletIcon color={colorsV2.txtMuted} />} label="Rain" />
      <LegendItem icon={<HumidityIcon color={colorsV2.txtMuted} />} label="Humidity" />
      <LegendItem icon={<WindIcon color={colorsV2.txtMuted} />} label="Peak wind" />
    </div>
  )
}

function LegendItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span style={row(spacing.chipGapMd)}>
      {icon}
      <span style={{ ...typeV2.chip, color: colorsV2.txtMuted }}>{label}</span>
    </span>
  )
}
