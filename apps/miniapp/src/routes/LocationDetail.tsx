import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { colors, spacing } from '@weatherteam6/design/tokens'
import { type } from '../theme/tokens.css.js'
import { bareButton, chip, stack } from '../theme/styles.js'
import { backTarget } from '../lib/backTarget.js'
import { useDeleteLocation, useLocation } from '../hooks/useLocations.js'
import { useAlerts, useConditions, useForecast } from '../hooks/useWeather.js'
import { useHourly } from '../hooks/useHourly.js'
import { useRecentPrecip } from '../hooks/useRecentPrecip.js'
import { useWalls } from '../hooks/useWalls.js'
import { Screen } from '../components/Screen.js'
import { DetailView, type DetailTab } from '../components/DetailView.js'
import { dayIsDrawable, firstDrawableDay } from '../components/charts/hourlySeries.js'
import { InlineError, Skeleton } from '../components/States.js'

/**
 * `/location/:id` — a saved location. Back goes to the list (§2), or to the
 * Daily tab when Hourly is open — resolved by `backTarget`, not decided here.
 */
export function LocationDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const location = useLocation(id)
  const forecast = useForecast(id)
  const alerts = useAlerts(id)
  const conditions = useConditions(id, location.data?.is_climbing_location)
  const hourly = useHourly(id)
  const recentPrecip = useRecentPrecip(id, location.data?.is_climbing_location)
  const walls = useWalls(id, location.data?.is_climbing_location)

  // The tabs live here rather than inside `DetailView` because back is
  // registered per route (§2) and has to be able to pop the tab. Holding them
  // in the component below would leave back with no way to reach them, and
  // pressing it on the Hourly tab would leave the location entirely — the thing
  // this phase's acceptance criterion forbids.
  const [tab, setTab] = useState<DetailTab>('daily')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // The day Hourly opens on.
  //
  // **`firstDrawableDay`, not `days[0]`**: the window's first local day is
  // routinely the tail of a run that has already passed, and opening on it
  // would show two empty charts for a location whose forecast is fine. Stays
  // `null` when no day is drawable, which `DetailView` renders as its own state.
  //
  // **A picked day is only kept while the window still covers it.** The window
  // rolls forward as runs are collected, so a date picked before midnight — or
  // before a refetch — can drop out of `days[]` entirely. Holding it anyway
  // leaves the day picker with nothing selected and both charts saying "no
  // hourly forecast for this day", which reads as a broken location rather than
  // as a day that has simply passed.
  const days = hourly.data?.days ?? []
  const stillDrawable =
    selectedDate !== null && days.some((d) => d.local_date === selectedDate && dayIsDrawable(d))
  const openDate = stillDrawable ? selectedDate : firstDrawableDay(days)

  const onBack = useCallback(() => {
    const action = backTarget({ route: 'detail', tab })
    switch (action.kind) {
      case 'showDailyTab':
        setTab('daily')
        return
      case 'navigate':
        void navigate(action.to)
        return
    }
  }, [tab, navigate])

  const remove = useDeleteLocation()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const onDelete = useCallback(() => {
    if (id === undefined) return
    remove.mutate(id, { onSuccess: () => void navigate('/', { replace: true }) })
  }, [id, remove, navigate])

  if (location.isPending) {
    return (
      <Screen title="Location" onBack={onBack}>
        <div style={{ marginTop: `${spacing.sectionTop}px` }}>
          <Skeleton height={200} />
        </div>
      </Screen>
    )
  }

  if (location.isError) {
    return (
      <Screen title="Location" onBack={onBack}>
        <div style={{ marginTop: `${spacing.sectionTop}px` }}>
          <InlineError message="Couldn't load this location." onRetry={() => void location.refetch()} />
        </div>
      </Screen>
    )
  }

  return (
    <Screen title={location.data.name} onBack={onBack}>
      <DetailView
        isClimbingLocation={location.data.is_climbing_location}
        asosStation={location.data.asos_station}
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
        }}
        hourly={{
          data: hourly.data,
          isPending: hourly.isPending,
          isError: hourly.isError,
          refetch: () => void hourly.refetch(),
          tabs: {
            active: tab,
            onTabChange: setTab,
            selectedDate: openDate,
            onSelectDate: setSelectedDate,
          },
        }}
        recentPrecip={{
          data: recentPrecip.data,
          isPending: recentPrecip.isPending,
          isError: recentPrecip.isError,
        }}
        walls={walls.data}
        location={location.data}
      />

      {/*
        Unsave. A save flow without one is a trap — a mistyped search result
        would be permanent, and there is no edit screen either (§12.4).

        Two taps rather than a `window.confirm`: a native dialog is a separate
        surface the app cannot style, and on iOS an installed PWA renders it
        over the whole screen for a one-word decision.
      */}
      <div style={{ ...stack(spacing.listGapSm), marginTop: `${spacing.sectionGap}px` }}>
        {remove.isError ? <InlineError message="Couldn't remove this location." /> : null}
        <button
          type="button"
          style={{ ...bareButton, ...chip, ...type.labelSm, color: colors.poor, textAlign: 'center' }}
          onClick={confirmingDelete ? onDelete : () => setConfirmingDelete(true)}
          disabled={remove.isPending}
        >
          {remove.isPending ? 'Removing…' : confirmingDelete ? 'Tap again to remove' : 'Remove location'}
        </button>
      </div>
    </Screen>
  )
}
