import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { colors, spacing } from '@weatherteam6/design/tokens'
import {
  rockTypeLabel,
  type HourlySeries,
  type Location,
  type TripOutlook,
  type TripTrendPoint,
  type WeatherAlert,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, cardV2, navClearance, stack } from '../theme/styles.js'
import { DetailHeader } from '../components/DetailHeader.js'
import { InlineError, Skeleton } from '../components/States.js'
import { TripCragView, type QueryState } from '../components/trips/TripCragView.js'
import { TripCragGrid } from '../components/trips/TripCragGrid.js'
import { TripLookBackGrid, TripLookBackView } from '../components/trips/TripLookBack.js'
import { hourlyQuery } from '../hooks/useHourly.js'
import { alertsQuery } from '../hooks/useWeather.js'
import { useLocations } from '../hooks/useLocations.js'
import { forgetTrip, useDeleteTrip, useTrip, useTripForecast, useTripSummary, useTripTrend } from '../hooks/useTrips.js'
import { backTarget, editTripPath, tripCragPath } from '../lib/backTarget.js'
import { severeAlertEvent } from '../lib/forecast.js'
import type { DayReadings } from '../lib/overview.js'
import { cragCount, deviceToday, formatTripDates, tripDates, tripIsOver, tripTiming } from '../lib/trips.js'

/**
 * What a day's score is read from at one crag, or `null` when there is nothing
 * to score with: `/hourly` in flight or failed, an API older than `readings`,
 * a location that is not a crag. The number also waits for the alerts query,
 * inside `summarizeReadings` (`alertsPending`).
 */
export function dayReadingsFor(
  hourly: { data: HourlySeries | undefined },
  alerts: { data: readonly WeatherAlert[] | undefined; isPending: boolean },
): DayReadings | null {
  const readings = hourly.data?.readings
  if (hourly.data === undefined || readings === undefined || readings.unavailable_reason !== null) return null
  return {
    days: readings.days,
    utcOffsetSeconds: hourly.data.utc_offset_seconds,
    severeAlertEvent: severeAlertEvent(alerts.data),
    alertsPending: alerts.isPending,
  }
}

/**
 * `/trips/:tripId`, and `/trips/:tripId/crag/:locationId` for one crag of a
 * several-crag trip. A one-crag trip opens straight on its crag's view.
 */
export function TripScreen() {
  const { tripId, locationId: cragParam } = useParams<{ tripId: string; locationId?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const today = deviceToday()
  const trip = useTrip(tripId)
  // Once the trip is over nothing is forecast for it: the screen reads what was stored.
  const over = trip.data !== undefined && tripIsOver(trip.data, today)
  const forecast = useTripForecast(tripId, trip.data !== undefined && !over)
  const summary = useTripSummary(tripId, over)
  const trend = useTripTrend(tripId)
  const locations = useLocations()
  const remove = useDeleteTrip()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const ids = (trip.data?.locations ?? []).map((l) => l.locationId)
  const byId = new Map<string, Location>((locations.data ?? []).map((l) => [l.id, l]))
  // Scores only for a crag: a city's hourly readings are a sentinel, never asked for.
  const scoredIds = ids.filter((id) => byId.get(id)?.is_climbing_location === true)
  const hourly = useQueries({
    queries: ids.map((id) => ({ ...hourlyQuery(id), enabled: !over && scoredIds.includes(id) })),
  })
  const alerts = useQueries({ queries: ids.map((id) => ({ ...alertsQuery(id), enabled: !over })) })
  const readingsFor = (id: string): DayReadings | null => {
    const i = ids.indexOf(id)
    const h = hourly[i]
    const a = alerts[i]
    return h === undefined || a === undefined || !scoredIds.includes(id) ? null : dayReadingsFor(h, a)
  }

  // The trip form offers only crags; until the list loads, a location is taken to be one.
  const isCrag = (id: string): boolean => byId.get(id)?.is_climbing_location !== false
  const scoresFailed = (id: string): (() => void) | null => {
    const h = hourly[ids.indexOf(id)]
    return h?.isError === true ? () => void h.refetch() : null
  }

  const single = ids.length === 1 ? ids[0] : undefined
  const focus = cragParam ?? single ?? null
  const back =
    cragParam === undefined
      ? { label: 'Trips', to: backTarget({ route: 'trip' }).to }
      : { label: trip.data?.name ?? 'Trip', to: backTarget({ route: 'tripCrag', tripId: tripId ?? '' }).to }

  const t = trip.data
  const focusLocation = focus === null ? undefined : byId.get(focus)
  const rock =
    focusLocation?.rock_type == null || focusLocation.rock_type === 'unknown' ? null : rockTypeLabel(focusLocation.rock_type)
  const meta =
    t === undefined
      ? null
      : [formatTripDates(t.startDate, t.endDate), tripTiming(t, today), focus === null ? cragCount(ids.length) : rock]
          .filter((p): p is string => p !== null)
          .join(' · ')
  const title = cragParam === undefined ? (t?.name ?? null) : (focusLocation?.name ?? null)
  const eyebrow = cragParam === undefined ? (single === undefined ? null : (byId.get(single)?.name ?? null)) : (t?.name ?? null)

  const findOutlook = (id: string): TripOutlook | undefined => forecast.data?.find((o) => o.locationId === id)
  const outlookQuery = (id: string): QueryState<TripOutlook | undefined> => ({
    data: findOutlook(id),
    isPending: forecast.isPending,
    isError: forecast.isError,
    refetch: () => void forecast.refetch(),
  })

  const trendFor = (id: string): QueryState<readonly TripTrendPoint[]> => ({
    data: trend.data?.find((s) => s.locationId === id)?.points ?? (trend.data === undefined ? undefined : []),
    isPending: trend.isPending,
    isError: trend.isError,
    refetch: () => void trend.refetch(),
  })

  const body =
    trip.isPending ? (
      <Skeleton height={200} />
    ) : trip.isError ? (
      <InlineError message="Couldn't load this trip." onRetry={() => void trip.refetch()} />
    ) : over && focus !== null ? (
      <TripLookBackView
        summary={{
          data: summary.data === undefined ? undefined : (summary.data.find((s) => s.locationId === focus)?.days ?? []),
          isPending: summary.isPending,
          isError: summary.isError,
          refetch: () => void summary.refetch(),
        }}
        trend={trendFor(focus)}
      />
    ) : over ? (
      <TripLookBackGrid
        summary={{
          data: summary.data,
          isPending: summary.isPending,
          isError: summary.isError,
          refetch: () => void summary.refetch(),
        }}
        names={new Map(ids.map((id) => [id, byId.get(id)?.name ?? 'Crag']))}
        onOpenCrag={(id) => void navigate(tripCragPath(trip.data.id, id))}
      />
    ) : focus !== null ? (
      <TripCragView
        locationId={focus}
        startDate={trip.data.startDate}
        dates={tripDates(trip.data.startDate, trip.data.endDate)}
        today={today}
        outlook={outlookQuery(focus)}
        readings={readingsFor(focus)}
        isCrag={isCrag(focus)}
        scoresFailed={scoresFailed(focus)}
        trend={trendFor(focus)}
      />
    ) : forecast.isPending ? (
      <Skeleton height={220} />
    ) : forecast.isError ? (
      <section style={cardV2}>
        <InlineError message="Couldn't load the trip forecast." onRetry={() => void forecast.refetch()} />
      </section>
    ) : (
      <TripCragGrid
        dates={tripDates(trip.data.startDate, trip.data.endDate)}
        today={today}
        crags={ids.map((id) => ({
          locationId: id,
          name: byId.get(id)?.name ?? 'Crag',
          outlook: findOutlook(id),
          readings: readingsFor(id),
          isCrag: isCrag(id),
          scoresFailed: scoresFailed(id),
        }))}
        onOpenCrag={(id) => void navigate(tripCragPath(trip.data.id, id))}
      />
    )

  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <DetailHeader
        heading={{ eyebrow, title, meta }}
        back={{ label: back.label, onBack: () => void navigate(back.to) }}
        feedbackLocationId={focus}
        tabs={null}
      />
      <div style={{ ...stack(spacing.listGapLg), padding: `${spacing.sectionGap}px`, paddingBottom: navClearance }}>
        {body}
        {cragParam === undefined && t !== undefined ? (
          <div style={{ display: 'flex', gap: `${spacing.sectionGap}px` }}>
          <button
            type="button"
            style={{
              ...bareButton,
              ...typeV2.factLabel,
              width: 'auto',
              padding: `${spacing.cellPad}px 0`,
            }}
            onClick={() => void navigate(editTripPath(t.id))}
          >
            Edit trip
          </button>
          <button
            type="button"
            style={{
              ...bareButton,
              ...typeV2.factLabel,
              color: colors.poor,
              width: 'auto',
              padding: `${spacing.cellPad}px 0`,
            }}
            onClick={
              confirmingDelete
                ? () =>
                    remove.mutate(t.id, {
                      onSuccess: () => {
                        void navigate('/trips', { replace: true })
                        setTimeout(() => forgetTrip(queryClient, t.id), 0)
                      },
                    })
                : () => setConfirmingDelete(true)
            }
            disabled={remove.isPending}
          >
            {remove.isPending ? 'Deleting…' : confirmingDelete ? 'Tap again to delete' : 'Delete trip'}
          </button>
          </div>
        ) : null}
        {remove.isError ? <p style={{ ...typeV2.note, color: colors.poor }}>Couldn’t delete the trip.</p> : null}
      </div>
    </main>
  )
}
