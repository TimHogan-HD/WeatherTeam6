import { useQuery } from '@tanstack/react-query'
import type { ForecastSnapshot } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

/**
 * GET /forecast/:id returns every snapshot with forecast_date >= today with
 * no latest-per-date dedup, so the every-6h snapshot job accumulates multiple
 * rows per date. Collapse to the latest captured_at per forecast_date and
 * sort ascending by date.
 * (Backend dedup is out of Phase 7 scope — tracked for a later phase.)
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
    queryFn: async () => (await apiFetch<ForecastSnapshot[]>(`/forecast/${locationId}`)) ?? [],
    enabled: !!locationId,
    select: latestPerDate,
  })
}
