import { useQuery } from '@tanstack/react-query'
import type { ForecastSnapshot } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

/**
 * The forecast-snapshot job atomically purges and replaces all rows with
 * forecast_date >= today each run, so GET /forecast/:id returns at most one
 * row per date. This collapse is purely defensive (e.g. a job version that
 * stops purging); it also guarantees ascending date order for rendering.
 */
function latestPerDate(rows: ForecastSnapshot[]): ForecastSnapshot[] {
  const byDate = new Map<string, ForecastSnapshot>()
  for (const row of rows) {
    const existing = byDate.get(row.forecast_date)
    if (!existing || row.captured_at > existing.captured_at) {
      byDate.set(row.forecast_date, row)
    }
  }
  return Array.from(byDate.values()).sort((a, b) =>
    a.forecast_date.localeCompare(b.forecast_date),
  )
}

export function useForecast(locationId: string | undefined) {
  return useQuery({
    queryKey: ['forecast', locationId],
    queryFn: async () =>
      (await apiFetch<ForecastSnapshot[]>(`/forecast/${locationId}`)) ?? [],
    enabled: !!locationId,
    select: latestPerDate,
  })
}
