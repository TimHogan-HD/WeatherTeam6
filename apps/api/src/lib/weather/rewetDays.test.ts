import { describe, it, expect } from 'vitest'
import { parseRewetDays } from './openMeteo.js'

const DAY = '2026-10-24'
const TIMES = Array.from({ length: 24 }, (_, h) => `${DAY}T${String(h).padStart(2, '0')}:00`)

/** A member's day: dry, except `mm` in the hour stamped `stamp`. */
function rainAt(stamp: number, mm: number): number[] {
  return TIMES.map((_, h) => (h === stamp ? mm : 0))
}

describe('parseRewetDays', () => {
  it('counts rain from the hour after midnight through the 18:00 stamp, at 0.5 mm', () => {
    const [day] = parseRewetDays({
      time: TIMES,
      // Each member is wet in exactly one hour; only the ones inside the window,
      // at the threshold, re-wet the rock.
      precipitation_ncep_gefs_seamless: rainAt(0, 5), // the evening before's last hour
      precipitation_member01_ncep_gefs_seamless: rainAt(1, 0.5),
      precipitation_member02_ncep_gefs_seamless: rainAt(18, 0.5),
      precipitation_member03_ncep_gefs_seamless: rainAt(19, 5), // after the climbing day
      precipitation_ecmwf_ifs025_ensemble: rainAt(12, 0.49), // wet by the screen's chance, not here
      precipitation_member01_ecmwf_ifs025_ensemble: rainAt(12, 3),
    })
    expect(day).toEqual({ local_date: DAY, members_rewet: 3, member_count: 6 })
  })

  it('reads the ensemble run’s other variables as nothing', () => {
    const [day] = parseRewetDays({
      time: TIMES,
      precipitation_gem_global_ensemble: rainAt(12, 0),
      temperature_2m_gem_global_ensemble: rainAt(12, 30),
      relativehumidity_2m_gem_global_ensemble: TIMES.map(() => 99),
    })
    expect(day).toEqual({ local_date: DAY, members_rewet: 0, member_count: 1 })
  })

  it('leaves out a member that did not report every hour of the window', () => {
    const gone: (number | null)[] = rainAt(12, 3)
    gone[17] = null
    const [day] = parseRewetDays({
      time: TIMES,
      precipitation_icon_seamless_eps: gone,
      precipitation_member01_icon_seamless_eps: rainAt(12, 0),
    })
    expect(day).toEqual({ local_date: DAY, members_rewet: 0, member_count: 1 })
  })

  it('leaves out a day no member covered, rather than 0 of 0', () => {
    expect(parseRewetDays({ time: TIMES, precipitation_gem_global_ensemble: TIMES.map(() => null) })).toEqual([])
  })

  it('leaves out a day the response cut short', () => {
    const half = TIMES.slice(0, 12)
    expect(parseRewetDays({ time: half, precipitation_gem_global_ensemble: half.map(() => 9) })).toEqual([])
  })

  it('ignores a model the ensemble does not pool', () => {
    expect(parseRewetDays({ time: TIMES, precipitation_ukmo_global_ensemble: rainAt(12, 9) })).toEqual([])
  })
})
