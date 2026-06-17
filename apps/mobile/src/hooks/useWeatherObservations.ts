import type { WeatherObservation } from '../types/weather'

const MOCK_OBS: WeatherObservation = {
  tempF: 68,
  feelsLikeF: 65,
  dewPointF: 48,
  todayHighF: 72,
  todayLowF: 54,
  condition: 'Partly Cloudy',
  windSpeedMph: 14,
  windGustMph: 22,
  windDirectionDeg: 315,
  windDirectionLabel: 'NW',
  humidityPct: 62,
  pressureInHg: 29.92,
  pressureTrend: 'falling',
  visibilityMiles: 10,
  uvIndex: 4,
  cloudCoverPct: 45,
  precip1hIn: 0,
  stationId: 'KPSP',
  updatedMinutesAgo: 8,
}

export function useWeatherObservations(_locationId: string | undefined): {
  data: WeatherObservation | undefined
  isPending: boolean
  isError: boolean
} {
  return { data: MOCK_OBS, isPending: false, isError: false }
}
