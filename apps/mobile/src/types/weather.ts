export interface WeatherObservation {
  tempF: number
  feelsLikeF: number
  dewPointF: number
  todayHighF: number
  todayLowF: number
  condition: string
  windSpeedMph: number
  windGustMph: number
  windDirectionDeg: number
  windDirectionLabel: string
  humidityPct: number
  pressureInHg: number
  pressureTrend: 'rising' | 'falling' | 'steady'
  visibilityMiles: number
  uvIndex: number
  cloudCoverPct: number
  precip1hIn: number
  stationId: string
  updatedMinutesAgo: number
}

export interface HourlySlot {
  time: string
  tempF: number
  windDir: string
  windSpeedMph: number
  precipPct: number
}
