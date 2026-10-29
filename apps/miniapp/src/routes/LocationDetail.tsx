import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useLocation as useRouterLocation, useParams, useSearchParams } from 'react-router-dom'
import { useNavigate } from '../hooks/useNavigate.js'
import { colors, motion, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, dockClearance, row, stack } from '../theme/styles.js'
import { backTarget, detailTabPath, editPath, openedFromMap } from '../lib/backTarget.js'
import { rockLocked } from '../lib/editLocation.js'
import { formatRunAge } from '../lib/format.js'
import { useDeleteLocation, useLocation, useLocations } from '../hooks/useLocations.js'
import { recentOf, swipeDirection, swipeOf, switcherOptions, switchState } from '../lib/cragSwitch.js'
import type { CragChoice } from '../components/CragBar.js'
import { usePreferences } from '../hooks/usePreferences.js'
import { draftFromPreferences } from '../lib/preferencesForm.js'
import { useAlerts, useConditions, useForecast, useRainNow } from '../hooks/useWeather.js'
import { useHourly } from '../hooks/useHourly.js'
import { useNow } from '../hooks/useNow.js'
import { useRecentPrecip } from '../hooks/useRecentPrecip.js'
import { useWalls } from '../hooks/useWalls.js'
import { useGuidebook } from '../hooks/useGuidebook.js'
import { DetailHeader } from '../components/DetailHeader.js'
import { DetailView, detailTabs, type DetailTab } from '../components/DetailView.js'
import { dayIsDrawable, firstDrawableDay } from '../components/charts/hourlySeries.js'
import { defaultReadHour } from '../lib/hourlyDay.js'
import { InlineError, Skeleton } from '../components/States.js'
import { PullToRefresh } from '../components/PullToRefresh.js'
import { Dock } from '../components/Dock.js'
import { SlimHeader } from '../components/SlimHeader.js'
import { findToday } from '../lib/forecast.js'
import { flipSource, flyFrom, type FlipRect } from '../lib/flip.js'
import { slimFigure } from '../lib/slimHeader.js'
import { useEdgeSwipeBack } from '../hooks/useEdgeSwipeBack.js'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'

const TAB_PANEL_ID = 'detail-tab-panel'
const FORECAST_TABS: ReadonlySet<DetailTab> = new Set(['overview', 'daily', 'hourly', 'precip'])

/**
 * `/location/:id` — a saved location, a screen you drill into from the list
 * (hybrid look, owner 2026-10-19). The app bar slides away as it opens
 * (`barGivesWay`) and the crag's tabs rise in a dock; back, or a swipe in from
 * the left edge in the installed app, returns to the list and the bar. The
 * Overview is headed by the full header; every other tab by the slim one,
 * which carries that tab's key figure.
 */

export function LocationDetail() {
  const navigate = useNavigate()
  const now = useNow()
  // A wall and a route open inside the Crag tab (`/location/:id/wall/:wallId`, `…/route/:routeId`).
  const { id, wallId, routeId } = useParams<{ id: string; wallId?: string; routeId?: string }>()
  const inGuide = wallId !== undefined

  const location = useLocation(id)
  const forecast = useForecast(id)
  const alerts = useAlerts(id)
  const conditions = useConditions(id, location.data?.is_climbing_location)
  const hourly = useHourly(id)
  const recentPrecip = useRecentPrecip(id)
  const rainNow = useRainNow()
  const walls = useWalls(id, location.data?.is_climbing_location)
  const guidebook = useGuidebook(id, location.data?.is_climbing_location)
  const [searchParams] = useSearchParams()

  // The tabs live here rather than inside `DetailView` because the header band
  // draws them and the panel shows them. `?tab=` is how the guidebook screens
  // link back in — a wall's back to Crag (`cragTabPath`), a route's "Hourly ›"
  // to Hourly. Without one it is the reader's saved tab (`usePreferences`,
  // loaded by the signed-in shell), else Overview. Only the opening tab:
  // once the reader picks one, `picked` holds it. **The opening tab is worked
  // out on every render, not once at mount**: on a reload or a deep link the
  // preferences are still loading when this mounts, and reading them once
  // would open Overview whatever was saved. A city asking for Crag falls back
  // to Overview below, like any tab it does not offer.
  const prefs = usePreferences().data
  const preferred = prefs?.default_tab ?? null
  // Quoted in the score's reasons. Unknown while loading, and then unquoted
  // rather than the default range presented as the reader's.
  const range = prefs === undefined ? null : draftFromPreferences(prefs)
  const [picked, setTab] = useState<DetailTab | null>(null)
  const asked = searchParams.get('tab') ?? preferred
  const tab = inGuide ? 'crag' : picked ?? detailTabs(true).find((o) => o.value === asked)?.value ?? 'overview'
  // `?date=` is a trip day's "Hourly ›" (`hourlyDayPath`); held only while drawable, as any pick is.
  const [selectedDate, setSelectedDate] = useState<string | null>(() => searchParams.get('date'))

  // The day Hourly opens on.
  //
  // **`firstDrawableDay`, not `days[0]`**: the window's first local day is
  // routinely the tail of a run that has already passed. **A picked day is
  // only kept while the window still covers it** — the window rolls forward as
  // runs are collected, and holding a day that dropped out leaves both charts
  // saying "no hourly forecast for this day".
  const days = hourly.data?.days ?? []
  const stillDrawable =
    selectedDate !== null && days.some((d) => d.local_date === selectedDate && dayIsDrawable(d))
  const openDate = stillDrawable ? selectedDate : firstDrawableDay(days)

  // The hour Hourly's charts and header read. A scrub is held with its day, so
  // picking another day falls back to that day's default rather than to an
  // hour the new day does not have.
  const [scrub, setScrub] = useState<{ date: string; ms: number } | null>(null)
  const readMs =
    hourly.data === undefined || openDate === null
      ? null
      : scrub !== null && scrub.date === openDate
        ? scrub.ms
        : defaultReadHour(hourly.data.hours, openDate, hourly.data.utc_offset_seconds, now)
  const onRead = useCallback(
    (ms: number) => {
      if (openDate !== null) setScrub({ date: openDate, ms })
    },
    [openDate],
  )

  // A city offers no Rock or Crag tab; a tab held from before the location
  // loaded must not point at one.
  const options = location.data === undefined ? null : detailTabs(location.data.is_climbing_location)
  const activeTab = options === null || options.some((o) => o.value === tab) ? tab : 'overview'

  // Back names the section it returns to (`backTarget`); the phone's own back
  // still retraces history.
  const { state: routerState } = useRouterLocation()
  const backTo = backTarget({ route: 'location', fromMap: openedFromMap(routerState) }).to
  const backLabel = backTo === '/map' ? 'Map' : 'Conditions'
  const goBack = useCallback(() => void navigate(backTo), [navigate, backTo])
  useEdgeSwipeBack(goBack)

  // The switcher across the top swaps one saved place for the next in place:
  // a replace, so back still leaves for where the first was opened from, and
  // the open tab rides in the URL, whether it came from one or was picked. The content swipes in from the side
  // moved toward.
  const saved = useLocations().data
  const places =
    saved === undefined || location.data === undefined
      ? null
      : switcherOptions(saved, location.data, recentOf(routerState))
  const crags: CragChoice | null =
    places === null || id === undefined
      ? null
      : {
          options: places,
          active: id,
          onChange: (next) => {
            const order = places.map((o) => o.id)
            const direction = swipeDirection(order, id, next)
            void navigate(detailTabPath(next, activeTab), {
              replace: true,
              state: switchState(routerState, direction, order),
            })
          },
        }
  const swipe = swipeOf(routerState)

  // The day score flies between the Overview's hero and the slim header: where
  // it stood is read before the tab changes, and played from after it has.
  const reduced = usePrefersReducedMotion()
  const flight = useRef<FlipRect | null>(null)
  const changeTab = useCallback(
    (next: DetailTab) => {
      flight.current = flipSource('score')
      setTab(next)
      // Off a wall or a route, another tab is the crag's own screen again.
      if (inGuide && id !== undefined) void navigate(detailTabPath(id, next))
    },
    [inGuide, id, navigate],
  )
  useLayoutEffect(() => {
    flyFrom('score', flight.current, reduced)
    flight.current = null
  }, [activeTab, reduced])

  const remove = useDeleteLocation()
  // Armed for one crag: the switcher keeps this screen mounted, and a remove armed on one
  // place must not carry to the next, where a single tap would delete it.
  const [armedFor, setArmedFor] = useState<string | null>(null)
  const confirmingDelete = armedFor !== null && armedFor === id
  const removingHere = remove.variables === id

  const onDelete = useCallback(() => {
    if (id === undefined) return
    remove.mutate(id, { onSuccess: () => void navigate('/', { replace: true }) })
  }, [id, remove, navigate])

  // When the runs behind the readings and charts were last confirmed current —
  // the stalest of them, never this client's own fetch time.
  const age = hourly.data === undefined ? null : formatRunAge(hourly.data, now)

  const content = location.isPending ? (
    <Skeleton height={200} />
  ) : location.isError ? (
    <InlineError message="Couldn't load this location." onRetry={() => void location.refetch()} />
  ) : (
    <>
      <DetailView
        isClimbingLocation={location.data.is_climbing_location}
        rangeF={range === null ? null : { low: range.lowF, high: range.highF }}
        forecast={{
          data: forecast.data,
          isPending: forecast.isPending,
          isError: forecast.isError,
          refetch: () => void forecast.refetch(),
        }}
        alerts={{ data: alerts.data, isError: alerts.isError }}
        conditions={{
          data: conditions.data,
          isPending: conditions.isPending,
          isError: conditions.isError,
          refetch: () => void conditions.refetch(),
          failureCount: conditions.failureCount,
        }}
        hourly={{
          data: hourly.data,
          isPending: hourly.isPending,
          isError: hourly.isError,
          refetch: () => void hourly.refetch(),
          tabs: {
            active: activeTab,
            onTabChange: changeTab,
            selectedDate: openDate,
            onSelectDate: setSelectedDate,
            readMs,
            onRead,
            panelId: TAB_PANEL_ID,
          },
        }}
        recentPrecip={{
          data: recentPrecip.data,
          isPending: recentPrecip.isPending,
          isError: recentPrecip.isError,
          refetch: () => void recentPrecip.refetch(),
        }}
        rainNow={rainNow.data}
        walls={walls.data}
        location={location.data}
        guidebook={{
          data: guidebook.data,
          isPending: guidebook.isPending,
          isError: guidebook.isError,
          refetch: () => void guidebook.refetch(),
          locationId: id ?? '',
          at: { wallId: wallId ?? null, routeId: routeId ?? null },
        }}
      />

      {/*
        Unsave. A save flow without one is a trap — a mistyped search result
        would be permanent. "Edit crag" changes the rock type, not the place.

        Two taps rather than a `window.confirm`: a native dialog is a separate
        surface the app cannot style, and on iOS an installed PWA renders it
        over the whole screen for a one-word decision.
      */}
      {/* The crag's own actions belong to the crag, not to one of its walls or routes. */}
      {inGuide ? null : (
        <>
          {remove.isError && removingHere ? <InlineError message="Couldn't remove this location." /> : null}
          {/* One row: stacked, the two text buttons and their tap padding were a band of empty space. */}
          <div style={{ ...row(spacing.cellPad), justifyContent: 'center', flexWrap: 'wrap' }}>
            {location.data.is_climbing_location && id !== undefined ? (
              <button
                type="button"
                style={{
                  ...bareButton,
                  ...typeV2.factLabel,
                  width: 'auto',
                  padding: `${spacing.cellPad}px ${spacing.sectionGap}px`,
                }}
                onClick={() => void navigate(`/feedback?location=${encodeURIComponent(id)}`)}
              >
                Check this forecast
              </button>
            ) : null}
            {/* A known crag's rock type is locked, so its editor would have nothing to change. */}
            {location.data.is_climbing_location && !rockLocked(location.data) && id !== undefined ? (
              <button
                type="button"
                style={{
                  ...bareButton,
                  ...typeV2.factLabel,
                  width: 'auto',
                  padding: `${spacing.cellPad}px ${spacing.sectionGap}px`,
                }}
                onClick={() => void navigate(editPath(id))}
              >
                Edit crag
              </button>
            ) : null}
            <button
              type="button"
              style={{
                ...bareButton,
                ...typeV2.factLabel,
                color: colors.poor,
                width: 'auto',
                padding: `${spacing.cellPad}px ${spacing.sectionGap}px`,
              }}
              onClick={confirmingDelete ? onDelete : () => setArmedFor(id ?? null)}
              disabled={remove.isPending}
            >
              {remove.isPending && removingHere ? 'Removing…' : confirmingDelete ? 'Tap again to remove' : 'Remove location'}
            </button>
          </div>
        </>
      )}
    </>
  )

  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative' }}>
      {/* The forecast tabs pull to refresh (owner, 2026-10-01); Rock and Crag
          are reference, with nothing a refetch would change. */}
      <PullToRefresh enabled={FORECAST_TABS.has(activeTab)} freshness={age}>
      {activeTab === 'overview' || location.data === undefined ? (
        <DetailHeader
          heading={{ eyebrow: null, title: null, meta: null }}
          back={{ label: backLabel, onBack: goBack }}
          crags={crags}
          feedbackLocationId={id ?? null}
          tabs={null}
        />
      ) : (
        <SlimHeader
          name={location.data.name}
          tab={activeTab}
          figure={slimFigure(activeTab, {
            isClimbingLocation: location.data.is_climbing_location,
            forecast: forecast.data,
            todayDate: findToday(forecast.data)?.forecast_date ?? null,
            // The same day readings the Daily rows score from.
            readings:
              location.data.is_climbing_location && hourly.data !== undefined
                ? {
                    days: hourly.data.readings?.days ?? [],
                    utcOffsetSeconds: hourly.data.utc_offset_seconds,
                  }
                : null,
            hours: hourly.data?.hours ?? [],
            selectedDate: openDate,
            readMs,
            hourReadings: location.data.is_climbing_location ? (hourly.data?.readings?.hours ?? []) : [],
            utcOffsetSeconds: hourly.data?.utc_offset_seconds ?? null,
            nowMs: now,
          })}
          back={{ label: backLabel, onBack: goBack }}
          crags={crags}
          feedbackLocationId={id ?? null}
        />
      )}
      <div
        key={id}
        className={swipe === null ? undefined : 'wt6-swipe'}
        style={
          {
            ...stack(spacing.listGapLg),
            padding: `${spacing.sectionGap}px`,
            paddingBottom: dockClearance,
            ...(swipe === null ? {} : { '--swipe-dx': `${swipe * motion.swipePx}px` }),
          } as CSSProperties
        }
      >
        {content}
      </div>
      </PullToRefresh>
      {/* Outside the pull: a fixed element inside a transformed one is fixed to it, not to the screen. */}
      {options === null ? null : (
        <Dock tabs={{ options, active: activeTab, onChange: changeTab, panelId: TAB_PANEL_ID }} />
      )}
    </main>
  )
}
