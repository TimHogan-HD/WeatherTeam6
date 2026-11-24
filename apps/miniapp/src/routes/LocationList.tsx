import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '../hooks/useNavigate.js'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import type { Conditions, Location } from '@weatherteam6/types'
import {
  rememberCards,
  rememberedCards,
  seedFreshCards,
  snapshotCards,
  type RememberedCards,
} from '../lib/rememberedCards.js'
import { typeV2 } from '../theme/tokens.css.js'
import { TEXT_EDGE, bareButton, brandButton, sectionV2, navClearance, row, stack, wellV2 } from '../theme/styles.js'
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
import { scoresFreshness } from '../lib/pullToRefresh.js'
import { PullToRefresh } from '../components/PullToRefresh.js'
import { alertsQuery, conditionsQuery, coveredByList, forecastQuery, held, useListSettled } from '../hooks/useWeather.js'
import { LocationCard } from '../components/LocationCard.js'
import { Splash, useOpeningSplash } from '../components/Splash.js'
import { EmptyState, InlineError, SkeletonCards } from '../components/States.js'
import { ChevronDownIcon, PlusIcon } from '../components/Icons.js'

/**
 * `/` — the Conditions section, in the v2 layout: a header band carrying the
 * title, the count and freshness, the Add button and the sort control; then the
 * cards, each figure labelled on the card itself. Feedback and Sign out live on
 * Profile since the bottom bar arrived.
 *
 * No back affordance: there is nothing above this screen, and a control that
 * navigates to the screen already showing is the second-back-affordance bug §2
 * describes with the destination wrong instead of the count.
 *
 * The Add button is load-bearing, not decoration: it is the only way a user who
 * already has locations can reach `/add`. Without it the add flow is reachable
 * only from the empty state, which they will never see again after saving
 * their first location.
 *
 * **Pulling the list down refreshes it** (owner, 2026-10-01) and, before it
 * does, says how fresh the scores are and which model they came from. Every
 * query on screen refetches; the cards keep their last answer if one fails.
 */
export function LocationList() {
  const navigate = useNavigate()
  const now = useNow()

  const locations = useLocations()
  const openLocation = useCallback((id: string) => void navigate(`/location/${id}`), [navigate])
  const openAdd = useCallback(() => void navigate('/add'), [navigate])

  const [sort, setSort] = useSortPreference()
  const queryClient = useQueryClient()
  // Read once per page load: after that the query cache holds the live copies.
  // A snapshot still fresh by the query client's rule goes into the cache as
  // the live answer, before any card asks, so the reopen sends no weather
  // requests (#598); an older one stays a placeholder.
  const [remembered] = useState(() => {
    const now = Date.now()
    const snapshot = rememberedCards(now)
    if (snapshot !== undefined) seedFreshCards(queryClient, snapshot, now)
    return snapshot
  })
  const list = locations.data ?? []

  // Every card's weather in one request (#606), which fills the cache entries
  // below. After the snapshot above, so a fresh one stands in for it. Until it
  // settles no per-place query is sent; after, only a part it did not bring.
  const listSettled = useListSettled()
  const skipOnRefresh = useCallback((key: readonly unknown[]) => coveredByList(queryClient, key), [queryClient])

  // The same cache entries the cards fill, so these add no request.
  const forecasts = useQueries({ queries: list.map((l) => held(forecastQuery(l.id), listSettled)) })
  const conditions = useQueries({
    queries: list.map((l) => held(conditionsQuery(l.id, l.is_climbing_location), listSettled)),
  })
  const alerts = useQueries({ queries: list.map((l) => held(alertsQuery(l.id), listSettled)) })

  const settledScores = settledScoresOf(list, conditions)
  const scores = settledScores ?? rememberedScoresOf(list, remembered)
  const ordered = sortLocations(list, sort, scores)

  // Settled on the real list, not the one remembered on this device: a
  // remembered list from before a crag was added elsewhere is ready while the
  // real one still has a card with no weather.
  const cardsReady =
    !locations.isPending &&
    !locations.isPlaceholderData &&
    (locations.isError || (settledScores !== null && forecasts.every((f) => !f.isPending)))
  // Every card can draw from what this device remembers, so there is nothing
  // for the splash to hide.
  const drawnFromMemory =
    remembered !== undefined && list.length > 0 && list.every((l) => remembered.cards[l.id] !== undefined)
  const splash = useOpeningSplash(cardsReady || drawnFromMemory)

  useRememberCards(
    cardsReady && !locations.isError
      ? snapshotCards(
          list.map((l, i) => ({
            id: l.id,
            isClimbingLocation: l.is_climbing_location,
            forecast: answerOf(forecasts[i]),
            conditions: answerOf(conditions[i]),
            alerts: answerOf(alerts[i]),
          })),
        )
      : null,
    [...forecasts, ...conditions, ...alerts].map((q) => q.dataUpdatedAt),
  )

  // While any card is drawn from memory, the header says how old it is — by
  // the same rule the card uses to choose, so a new crag loading beside live
  // cards does not print an age nothing on screen has.
  const fromMemory =
    remembered !== undefined &&
    list.some(
      (l, i) =>
        remembered.cards[l.id] !== undefined &&
        (forecasts[i]?.isPending !== false ||
          alerts[i]?.isPending !== false ||
          (l.is_climbing_location && conditions[i]?.isPending !== false)),
    )
  const updated =
    fromMemory
      ? [formatUpdatedAt(remembered.savedAt, now), 'refreshing'].filter((p) => p !== null).join(' · ')
      : // The oldest answer on screen, so a card seeded from this device's memory
        // is never dated by the list's own newer fetch.
        formatUpdatedAt(oldestFetch([locations, ...forecasts, ...conditions, ...alerts]), now)
  const meta =
    locations.data === undefined
      ? null
      : [`${locations.data.length} saved`, updated === null ? null : lowerFirst(updated)]
          .filter((part) => part !== null)
          .join(' · ')

  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative' }}>
      {splash ? <Splash /> : null}
      <PullToRefresh freshness={scoresFreshness(conditions.map((c) => c.data?.readings), now)} skip={skipOnRefresh}>
      <header style={{ padding: `${spacing.sectionGap}px ${TEXT_EDGE}px 0` }}>
        <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={stack(spacing.tight)}>
            <h1 style={{ ...typeV2.listTitle, margin: 0 }}>Conditions</h1>
            {meta === null ? null : <p style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted, margin: 0 }}>{meta}</p>}
          </div>
          <button
            type="button"
            onClick={openAdd}
            style={{
              ...bareButton,
              ...row(spacing.tight),
              width: 'auto',
              // Off lime: lime is for scores only (owner, 2026-11-23, #644).
              backgroundColor: colorsV2.raised,
              borderRadius: `${radius.full}px`,
              minHeight: '44px',
              padding: `${spacing.tight}px ${spacing.cellPad}px`,
            }}
          >
            <PlusIcon color={colorsV2.txt1} />
            <span style={{ ...typeV2.button, color: colorsV2.txt1 }}>Add</span>
          </button>
        </div>
        {locations.data !== undefined && locations.data.length > 1 ? (
          <div style={{ ...row(spacing.cellPad), justifyContent: 'flex-end', marginTop: `${spacing.listGap}px` }}>
            <SortControl value={sort} onChange={setSort} />
          </div>
        ) : null}
      </header>

      <div style={{ ...stack(spacing.listGapLg), padding: `${spacing.sectionGap}px`, paddingBottom: navClearance }}>
        {locations.isPending ? (
          <SkeletonCards count={3} height={140} />
        ) : locations.isError ? (
          <InlineError message="Couldn't load your locations." onRetry={() => void locations.refetch()} />
        ) : locations.data.length === 0 ? (
          <EmptyState
            title="No locations yet."
            action={
              <button type="button" style={{ ...brandButton, width: '100%' }} onClick={openAdd}>
                Add a location
              </button>
            }
          />
        ) : (
          <section style={{ ...sectionV2, padding: '0 2px' }}>
            {ordered.map((location, i) => (
              <LocationCard
                key={location.id}
                location={location}
                remembered={remembered?.cards[location.id]}
                listSettled={listSettled}
                onOpen={openLocation}
                index={i}
              />
            ))}
          </section>
        )}
      </div>
      </PullToRefresh>
    </main>
  )
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

type Settling<T> = { data: T | undefined; isPending: boolean; dataUpdatedAt: number }

/**
 * Every card's score, once all of them have settled; `null`
 * until then, which `sortLocations` reads as "keep the added order".
 *
 * A non-climbing location's conditions query is disabled and stays pending
 * forever, so it counts as settled on the flag rather than on the query.
 */
function settledScoresOf(
  locations: readonly Location[],
  conditions: readonly Settling<Conditions | null>[],
): ReadonlyMap<string, number | null> | null {
  const scores = new Map<string, number | null>()
  for (const [i, location] of locations.entries()) {
    const c = conditions[i]
    if (c === undefined) return null
    if (location.is_climbing_location && c.isPending) return null
    scores.set(location.id, cardSummary(c.data)?.score ?? null)
  }
  return scores
}

/**
 * The scores the remembered cards print, so a list drawn from memory is in the
 * order it was left in. `null` unless every card has one to draw.
 */
function rememberedScoresOf(
  locations: readonly Location[],
  remembered: RememberedCards | undefined,
): ReadonlyMap<string, number | null> | null {
  if (remembered === undefined) return null
  const scores = new Map<string, number | null>()
  for (const location of locations) {
    const card = remembered.cards[location.id]
    if (card === undefined) return null
    scores.set(location.id, cardSummary(card.conditions)?.score ?? null)
  }
  return scores
}

/**
 * The earliest fetch among the answers in hand. A query with no answer (0: a
 * non-crag's disabled conditions, one still loading) is skipped; with none at
 * all, 0, which `formatUpdatedAt` prints as nothing.
 */
function oldestFetch(queries: readonly { dataUpdatedAt: number }[]): number {
  const stamps = queries.map((q) => q.dataUpdatedAt).filter((t) => t > 0)
  return stamps.length === 0 ? 0 : Math.min(...stamps)
}

/** A disabled query (a non-crag's conditions) has no fetch time; 0 is its stamp. */
function answerOf<T>(q: Settling<T> | undefined): { data: T | undefined; dataUpdatedAt: number } {
  return { data: q?.data, dataUpdatedAt: q?.dataUpdatedAt ?? 0 }
}

/**
 * Writes the snapshot whenever a newer one exists — the cards refetch on their
 * `staleTime` when the list is revisited — and not on every render, which the
 * minute clock alone would cause.
 */
function useRememberCards(snapshot: RememberedCards | null, fetchedAt: readonly number[]): void {
  const written = useRef<string | null>(null)
  const stamp = fetchedAt.join(',')
  useEffect(() => {
    if (snapshot === null || stamp === written.current) return
    written.current = stamp
    rememberCards(snapshot)
  })
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
