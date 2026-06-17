import SunCalc from 'suncalc'

export type DaylightInfo = {
  sunrise: Date
  sunset: Date
  daylightHours: number
  daylightRemaining: number
  sunriseLabel: string
  sunsetLabel: string
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function getDaylight(lat: number, lon: number, date: Date): DaylightInfo {
  const times = SunCalc.getTimes(date, lat, lon)
  const sunrise = times.sunrise
  const sunset = times.sunset

  const now = Date.now()
  const totalMs = sunset.getTime() - sunrise.getTime()
  const daylightHours = totalMs > 0 ? totalMs / 3_600_000 : 0
  const remainingMs = Math.max(0, sunset.getTime() - now)
  const daylightRemaining = remainingMs / 3_600_000

  return {
    sunrise,
    sunset,
    daylightHours,
    daylightRemaining,
    sunriseLabel: fmtTime(sunrise),
    sunsetLabel: fmtTime(sunset),
  }
}
