import SunCalc from 'suncalc'

export type SunWindow = {
  sunriseT: number    // always 0 (normalized start of day arc)
  sunsetT: number     // always 1 (normalized end of day arc)
  windowStart: number // 0–1: fraction of day when wall first gets direct sun
  windowEnd: number   // 0–1: fraction of day when direct sun leaves wall
  directHours: number // total direct sun hours
  sunT: number        // current sun normalized position 0–1, clamped
  sunriseFmt: string  // e.g. "6:14a"
  sunsetFmt: string   // e.g. "7:48p"
}

function fmtTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h < 12 ? 'a' : 'p'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

// Returns the angular difference between two compass bearings, in range [-180, 180].
function angleDiff(a: number, b: number): number {
  const d = ((a - b + 540) % 360) - 180
  return d
}

export function computeSunWindow(
  lat: number,
  lon: number,
  aspectDeg: number,
  date: Date = new Date(),
): SunWindow {
  const times = SunCalc.getTimes(date, lat, lon)
  const sunrise = times.sunrise
  const sunset = times.sunsetStart

  // Fallback for polar regions or invalid values
  if (!isFinite(sunrise.getTime()) || !isFinite(sunset.getTime())) {
    return {
      sunriseT: 0, sunsetT: 1,
      windowStart: 0, windowEnd: 0,
      directHours: 0, sunT: 0.5,
      sunriseFmt: '—', sunsetFmt: '—',
    }
  }

  const dayMs = sunset.getTime() - sunrise.getTime()
  if (dayMs <= 0) {
    return {
      sunriseT: 0, sunsetT: 1,
      windowStart: 0, windowEnd: 0,
      directHours: 0, sunT: 0.5,
      sunriseFmt: fmtTime(sunrise), sunsetFmt: fmtTime(sunset),
    }
  }

  // Sample sun azimuth every 10 minutes across the daylight window
  const STEP_MS = 10 * 60 * 1000
  const samples: { t: number; onWall: boolean }[] = []

  for (let ms = 0; ms <= dayMs; ms += STEP_MS) {
    const sampleDate = new Date(sunrise.getTime() + ms)
    const pos = SunCalc.getPosition(sampleDate, lat, lon)
    // suncalc azimuth is in radians, south = 0, east = π/2, west = -π/2
    // Convert to compass degrees: N=0, E=90, S=180, W=270
    const azimuth = ((pos.azimuth * 180 / Math.PI) + 180) % 360
    const diff = Math.abs(angleDiff(azimuth, aspectDeg))
    const t = ms / dayMs
    samples.push({ t, onWall: diff <= 90 && pos.altitude > 0 })
  }

  // Find first and last direct-sun sample
  const onSamples = samples.filter(s => s.onWall)
  if (onSamples.length === 0) {
    const nowT = Math.max(0, Math.min(1, (Date.now() - sunrise.getTime()) / dayMs))
    return {
      sunriseT: 0, sunsetT: 1,
      windowStart: 0, windowEnd: 0,
      directHours: 0, sunT: nowT,
      sunriseFmt: fmtTime(sunrise), sunsetFmt: fmtTime(sunset),
    }
  }

  const windowStart = onSamples[0]!.t
  const windowEnd = onSamples[onSamples.length - 1]!.t
  const directHours = Math.round((windowEnd - windowStart) * (dayMs / 3600000) * 10) / 10

  const nowT = Math.max(0, Math.min(1, (Date.now() - sunrise.getTime()) / dayMs))

  return {
    sunriseT: 0,
    sunsetT: 1,
    windowStart,
    windowEnd,
    directHours,
    sunT: nowT,
    sunriseFmt: fmtTime(sunrise),
    sunsetFmt: fmtTime(sunset),
  }
}
