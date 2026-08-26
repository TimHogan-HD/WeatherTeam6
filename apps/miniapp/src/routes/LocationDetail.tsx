import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { colors, spacing } from '@weatherteam6/design/tokens'
import { type } from '../theme/tokens.css.js'
import { bareButton, chip, stack } from '../theme/styles.js'
import { useBackButton } from '../telegram/useBackButton.js'
import { useDeleteLocation, useLocation } from '../hooks/useLocations.js'
import { useAlerts, useConditions, useForecast } from '../hooks/useWeather.js'
import { Screen } from '../components/Screen.js'
import { DetailView } from '../components/DetailView.js'
import { InlineError, Skeleton } from '../components/States.js'

/**
 * `/location/:id` — a saved location. `BackButton` goes to the list (§2).
 */
export function LocationDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  useBackButton(useCallback(() => void navigate('/'), [navigate]))

  const location = useLocation(id)
  const forecast = useForecast(id)
  const alerts = useAlerts(id)
  const conditions = useConditions(id, location.data?.is_climbing_location)

  const remove = useDeleteLocation()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const onDelete = useCallback(() => {
    if (id === undefined) return
    remove.mutate(id, { onSuccess: () => void navigate('/', { replace: true }) })
  }, [id, remove, navigate])

  if (location.isPending) {
    return (
      <Screen title="Location">
        <div style={{ marginTop: `${spacing.sectionTop}px` }}>
          <Skeleton height={200} />
        </div>
      </Screen>
    )
  }

  if (location.isError) {
    return (
      <Screen title="Location">
        <div style={{ marginTop: `${spacing.sectionTop}px` }}>
          <InlineError message="Couldn't load this location." onRetry={() => void location.refetch()} />
        </div>
      </Screen>
    )
  }

  return (
    <Screen title={location.data.name}>
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
      />

      {/*
        Unsave. A save flow without one is a trap — a mistyped search result
        would be permanent, and there is no edit screen either (§12.4).

        Two taps rather than a native dialog: `showConfirm` is version-gated and
        absent outside Telegram, and this app has to stay usable in a plain
        browser (§ the getWebApp()-returns-null rule).
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
