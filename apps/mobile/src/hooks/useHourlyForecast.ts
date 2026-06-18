import type { HourlySlot } from '../types/weather'

const MOCK_HOURLY: HourlySlot[] = [
  { time: 'Now', tempF: 68, windDir: 'NW', windSpeedMph: 14, precipPct: 5 },
  { time: '3 PM', tempF: 70, windDir: 'NW', windSpeedMph: 16, precipPct: 5 },
  { time: '6 PM', tempF: 65, windDir: 'W', windSpeedMph: 12, precipPct: 10 },
  { time: '9 PM', tempF: 60, windDir: 'W', windSpeedMph: 10, precipPct: 15 },
  { time: '12 AM', tempF: 57, windDir: 'SW', windSpeedMph: 8, precipPct: 20 },
  { time: '3 AM', tempF: 55, windDir: 'SW', windSpeedMph: 7, precipPct: 25 },
  { time: '6 AM', tempF: 54, windDir: 'S', windSpeedMph: 6, precipPct: 30 },
  { time: '9 AM', tempF: 58, windDir: 'SE', windSpeedMph: 8, precipPct: 20 },
]

export function useHourlyForecast(_locationId: string | undefined): {
  data: HourlySlot[]
  isLoading: false
  isError: false
} {
  return { data: MOCK_HOURLY, isLoading: false, isError: false }
}
