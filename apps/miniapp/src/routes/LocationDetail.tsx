import { useCallback, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { colors, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, navClearance, row, stack } from '../theme/styles.js'
import { editPath, wallPath } from '../lib/backTarget.js'
import { formatRunAge } from '../lib/format.js'
import { useDeleteLocation, useLocation } from '../hooks/useLocations.js'
import { usePreferences } from '../hooks/usePreferences.js'
import { useAlerts, useConditions, useForecast } from '../hooks/useWeather.js'
import { useHourly } from '../hooks/useHourly.js'
import { useNow } from '../hooks/useNow.js'
import { useRecentPrecip } from '../hooks/useRecentPrecip.js'
import { useWalls } from '../hooks/useWalls.js'
import { useGuidebook } from '../hooks/useGuidebook.js'
import { DetailHeader, locationHeading } from '../components/DetailHeader.js'
import { DetailView, detailTabs, type DetailTab } from '../components/DetailView.js'
import { dayIsDrawable, firstDrawableDay } from '../components/charts/hourlySeries.js'
import { InlineError, Skeleton } from '../components/States.js'

const TAB_PANEL_ID = 'detail-tab-panel'

/**
 * `/location/:id` — a saved location, in the v2 layout: a header band with the
 * tabs, then the open tab. No back link (owner, 2026-09-30): the bottom bar's
 * Conditions tab returns to the list, and the browser's back retraces history.
 */
export function LocationDetail() {
  const navigate = useNavigate()
  const now = useNow()
  const { id } = useParams<{ id: string }>()

  const location = useLocation(id)
  const forecast = useForecast(id)
  const alerts = useAlerts(id)
  const conditions = useConditions(id, location.data?.is_climbing_location)
  const hourly = useHourly(id)
  const recentPrecip = useRecentPrecip(id)
  const walls = useWalls(id, location.data?.is_climbing_location)
  const guidebook = useGuidebook(id, location.data?.is_climbing_location)
  const [searchParams] = useSearchParams()

  // The tabs live here rather than inside `DetailView` because the header band
  // draws them and the panel shows them. `?tab=` is how the guidebook screens
  // link back in — a wall's back to Crag (`cragTabPath`), a route's "Hourly ›"
  // to Hourly. Without one it is the reader's saved tab (`usePreferences`,
  // loaded by the signed-in shell), else Overview. Only the opening tab:
  // after that the route holds it, as before. A city asking for Crag falls
  // back to Overview below, like any tab it does not offer.
  const preferred = usePreferences().data?.default_tab ?? null
  const [tab, setTab] = useState<DetailTab>(() => {
    const asked = searchParams.get('tab') ?? preferred
    return detailTabs(true).find((o) => o.value === asked)?.value ?? 'overview'
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

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

  // A city offers no Rock or Crag tab; a tab held from before the location
  // loaded must not point at one.
  const options = location.data === undefined ? null : detailTabs(location.data.is_climbing_location)
  const activeTab = options === null || options.some((o) => o.value === tab) ? tab : 'overview'

  const remove = useDeleteLocation()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const onDelete = useCallback(() => {
    if (id === undefined) return
    remove.mutate(id, { onSuccess: () => void navigate('/', { replace: true }) })
  }, [id, remove, navigate])

  // When the runs behind the readings and charts were last confirmed current —
  // the stalest of them, never this client's own fetch time.
  const age = hourly.data === undefined ? null : formatRunAge(hourly.data, now)
  const freshness = age === null ? null : age.charAt(0).toLowerCase() + age.slice(1)

  const content = location.isPending ? (
    <Skeleton height={200} />
  ) : location.isError ? (
    <InlineError message="Couldn't load this location." onRetry={() => void location.refetch()} />
  ) : (
    <>
      <DetailView
        isClimbingLocation={location.data.is_climbing_location}
        forecast={{
          data: forecast.data,
          isPending: forecast.isPending,
          isError: forecast.isError,
          refetch: () => void forecast.refetch(),
        }}
        alerts={{ data: alerts.data, isPending: alerts.isPending, isError: alerts.isError }}
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
            onTabChange: setTab,
            selectedDate: openDate,
            onSelectDate: setSelectedDate,
            panelId: TAB_PANEL_ID,
          },
        }}
        recentPrecip={{
          data: recentPrecip.data,
          isPending: recentPrecip.isPending,
          isError: recentPrecip.isError,
          refetch: () => void recentPrecip.refetch(),
        }}
        walls={walls.data}
        location={location.data}
        guidebook={{
          data: guidebook.data,
          isPending: guidebook.isPending,
          isError: guidebook.isError,
          refetch: () => void guidebook.refetch(),
          onOpenWall: (wallId: string) => {
            if (id !== undefined) void navigate(wallPath(id, wallId))
          },
        }}
      />

      {/*
        Unsave. A save flow without one is a trap — a mistyped search result
        would be permanent. "Edit crag" changes the rock and wall, not the place.

        Two taps rather than a `window.confirm`: a native dialog is a separate
        surface the app cannot style, and on iOS an installed PWA renders it
        over the whole screen for a one-word decision.
      */}
      {remove.isError ? <InlineError message="Couldn't remove this location." /> : null}
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
        {location.data.is_climbing_location && id !== undefined ? (
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
          onClick={confirmingDelete ? onDelete : () => setConfirmingDelete(true)}
          disabled={remove.isPending}
        >
          {remove.isPending ? 'Removing…' : confirmingDelete ? 'Tap again to remove' : 'Remove location'}
        </button>
      </div>
    </>
  )

  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <DetailHeader
        heading={locationHeading(location.data ?? null, freshness)}
        back={null}
        feedbackLocationId={id ?? null}
        tabs={
          options === null
            ? null
            : { options, active: activeTab, onChange: setTab, panelId: TAB_PANEL_ID }
        }
      />
      <div
        style={{
          ...stack(spacing.listGapLg),
          padding: `${spacing.sectionGap}px`,
          paddingBottom: navClearance,
        }}
      >
        {content}
      </div>
    </main>
  )
}
