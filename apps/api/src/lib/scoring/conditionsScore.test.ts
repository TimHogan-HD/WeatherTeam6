import { describe, it, expect } from 'vitest'
import { conditionsScore } from './conditionsScore.js'
import type { ScoreInput } from '@weatherteam6/types'

const base: ScoreInput = {
  rockType: 'granite',
  aspectDegrees: 180,
  cliffAngle: 0,
  hoursSinceRain: 720,
  lastRainMm: 0,
  forecastRain72hMm: 0,
  forecastRain72hP10: 0,
  forecastRain72hP90: 0,
  currentWindKmh: 10,
  maxWindKmh24h: 10,
  currentTempC: 18,
  forecastHighC: 18,
  currentHumidityPct: 45,
  forecastDateDaysOut: 0,
}

describe('conditionsScore — forecast windows', () => {
  it('>14 days returns null score and pre window', () => {
    const result = conditionsScore({ ...base, forecastDateDaysOut: 15 })
    expect(result.score).toBeNull()
    expect(result.window).toBe('pre')
    expect(result.breakdown).toBeNull()
  })

  it('14 days is early window (not pre, which requires > 14)', () => {
    const result = conditionsScore({ ...base, forecastDateDaysOut: 14 })
    expect(result.window).toBe('early')
  })

  it('7-14 days is early window with forced low confidence', () => {
    const result = conditionsScore({
      ...base,
      forecastDateDaysOut: 10,
      forecastRain72hP10: 0,
      forecastRain72hP90: 0, // spread = 0 would normally give 'high'
    })
    expect(result.window).toBe('early')
    expect(result.confidence).toBe('low')
    expect(result.score).not.toBeNull()
  })

  it('exactly 7 days out is early window with forced low confidence', () => {
    // Spec: "7-14 days out" → forced low. Boundary check: >= 7 not > 7.
    const result = conditionsScore({
      ...base,
      forecastDateDaysOut: 7,
      forecastRain72hP10: 0,
      forecastRain72hP90: 0, // tight spread would give 'high' if not forced
    })
    expect(result.window).toBe('early')
    expect(result.confidence).toBe('low')
  })

  it('<7 days is decision window', () => {
    const result = conditionsScore({ ...base, forecastDateDaysOut: 3 })
    expect(result.window).toBe('decision')
  })
})

describe('conditionsScore — confidence from spread', () => {
  it('spread <= 2mm → high confidence', () => {
    const result = conditionsScore({
      ...base,
      forecastDateDaysOut: 3,
      forecastRain72hP10: 0,
      forecastRain72hP90: 1,
    })
    expect(result.confidence).toBe('high')
  })

  it('spread 2-8mm → medium confidence', () => {
    const result = conditionsScore({
      ...base,
      forecastDateDaysOut: 3,
      forecastRain72hP10: 0,
      forecastRain72hP90: 5,
    })
    expect(result.confidence).toBe('medium')
  })

  it('spread > 8mm → low confidence', () => {
    const result = conditionsScore({
      ...base,
      forecastDateDaysOut: 3,
      forecastRain72hP10: 0,
      forecastRain72hP90: 20,
    })
    expect(result.confidence).toBe('low')
  })
})

describe('conditionsScore — drying component', () => {
  it('score is 0 when it just rained', () => {
    const result = conditionsScore({ ...base, hoursSinceRain: 0 })
    expect(result.components.drying_time).toBe(0)
  })

  it('score is 40 when well past maxDry', () => {
    // granite cliffAngle=0: maxDry = 12h * 1.0 * 1.0 * 1.0 = 12h
    const result = conditionsScore({ ...base, hoursSinceRain: 720, cliffAngle: 0 })
    expect(result.components.drying_time).toBe(40)
  })

  it('wind >20 km/h reduces maxDry → higher drying score at same hours', () => {
    const withWind = conditionsScore({
      ...base,
      currentWindKmh: 25,
      hoursSinceRain: 10,
      cliffAngle: 0,
      rockType: 'granite',
    })
    const withoutWind = conditionsScore({
      ...base,
      currentWindKmh: 10,
      hoursSinceRain: 10,
      cliffAngle: 0,
      rockType: 'granite',
    })
    expect(withWind.components.drying_time).toBeGreaterThan(withoutWind.components.drying_time)
  })

  it('humidity >80% increases maxDry → lower drying score at same hours', () => {
    const highHumidity = conditionsScore({
      ...base,
      currentHumidityPct: 85,
      hoursSinceRain: 10,
      cliffAngle: 0,
      rockType: 'granite',
    })
    const normalHumidity = conditionsScore({
      ...base,
      currentHumidityPct: 50,
      hoursSinceRain: 10,
      cliffAngle: 0,
      rockType: 'granite',
    })
    expect(highHumidity.components.drying_time).toBeLessThan(normalHumidity.components.drying_time)
  })

  it('slab (cliffAngle=90) dries slower than vertical wall (cliffAngle=0)', () => {
    const slab = conditionsScore({
      ...base,
      cliffAngle: 90,
      hoursSinceRain: 10,
      rockType: 'granite',
    })
    const vertical = conditionsScore({
      ...base,
      cliffAngle: 0,
      hoursSinceRain: 10,
      rockType: 'granite',
    })
    expect(slab.components.drying_time).toBeLessThan(vertical.components.drying_time)
  })
})

describe('conditionsScore — rain component', () => {
  it('0mm forecast → rain score = 25', () => {
    const result = conditionsScore({ ...base, forecastRain72hMm: 0 })
    expect(result.components.upcoming_rain).toBe(25)
  })

  it('>=10mm forecast → rain score = 0', () => {
    const result = conditionsScore({ ...base, forecastRain72hMm: 10 })
    expect(result.components.upcoming_rain).toBe(0)
  })

  it('rain score decreases monotonically with more rain', () => {
    const r0 = conditionsScore({ ...base, forecastRain72hMm: 0 }).components.upcoming_rain
    const r5 = conditionsScore({ ...base, forecastRain72hMm: 5 }).components.upcoming_rain
    const r10 = conditionsScore({ ...base, forecastRain72hMm: 10 }).components.upcoming_rain
    expect(r0).toBeGreaterThan(r5)
    expect(r5).toBeGreaterThan(r10)
  })
})

describe('conditionsScore — wind component', () => {
  it('<=15 km/h → wind score = 15', () => {
    const result = conditionsScore({ ...base, maxWindKmh24h: 10 })
    expect(result.components.wind).toBe(15)
  })

  it('>=50 km/h → wind score = 0', () => {
    const result = conditionsScore({ ...base, maxWindKmh24h: 55 })
    expect(result.components.wind).toBe(0)
  })

  it('scales between 15 and 50 km/h instead of stepping straight to zero', () => {
    // Only the two ends were pinned, so the whole interpolation was unasserted:
    // replacing the `>= 50` test with `true` collapses every breezy day to a
    // zero wind component and nothing failed. Found by mutation testing.
    expect(conditionsScore({ ...base, maxWindKmh24h: 25 }).components.wind).toBe(11)
    expect(conditionsScore({ ...base, maxWindKmh24h: 40 }).components.wind).toBe(4)
  })

  it('pins both boundaries exactly, not just values either side of them', () => {
    expect(conditionsScore({ ...base, maxWindKmh24h: 15 }).components.wind).toBe(15)
    expect(conditionsScore({ ...base, maxWindKmh24h: 50 }).components.wind).toBe(0)
  })
})

describe('conditionsScore — temperature component', () => {
  it('optimal range 10-22°C → temp score = 12', () => {
    expect(conditionsScore({ ...base, forecastHighC: 15 }).components.temp).toBe(12)
    expect(conditionsScore({ ...base, forecastHighC: 10 }).components.temp).toBe(12)
    expect(conditionsScore({ ...base, forecastHighC: 22 }).components.temp).toBe(12)
  })

  it('<0°C or >35°C → temp score = 0', () => {
    expect(conditionsScore({ ...base, forecastHighC: -1 }).components.temp).toBe(0)
    expect(conditionsScore({ ...base, forecastHighC: 36 }).components.temp).toBe(0)
  })

  it('0°C scores 0, 5°C scores mid-range', () => {
    expect(conditionsScore({ ...base, forecastHighC: 0 }).components.temp).toBe(0)
    const mid = conditionsScore({ ...base, forecastHighC: 5 }).components.temp
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(12)
  })

  it('35°C scores ~6', () => {
    const result = conditionsScore({ ...base, forecastHighC: 35 })
    expect(result.components.temp).toBe(6)
  })
})

describe('conditionsScore — humidity component', () => {
  it('<=50% → humidity score = 8', () => {
    expect(conditionsScore({ ...base, currentHumidityPct: 40 }).components.humidity).toBe(8)
  })

  it('>=90% → humidity score = 0', () => {
    expect(conditionsScore({ ...base, currentHumidityPct: 95 }).components.humidity).toBe(0)
  })

  it('scales between 50% and 90% instead of stepping straight to zero', () => {
    expect(conditionsScore({ ...base, currentHumidityPct: 70 }).components.humidity).toBe(4)
    expect(conditionsScore({ ...base, currentHumidityPct: 60 }).components.humidity).toBe(6)
  })

  it('pins both boundaries exactly, not just values either side of them', () => {
    expect(conditionsScore({ ...base, currentHumidityPct: 50 }).components.humidity).toBe(8)
    expect(conditionsScore({ ...base, currentHumidityPct: 90 }).components.humidity).toBe(0)
  })
})

describe('conditionsScore — totals', () => {
  it('perfect conditions → score = 100', () => {
    // granite cliffAngle=0, 720h since rain, no forecast rain, light wind, ideal temp, low humidity
    const result = conditionsScore({
      ...base,
      rockType: 'granite',
      cliffAngle: 0,
      hoursSinceRain: 720,
      forecastRain72hMm: 0,
      maxWindKmh24h: 10,
      forecastHighC: 18,
      currentHumidityPct: 30,
      currentWindKmh: 10,
    })
    expect(result.score).toBe(100)
  })

  it('score is clamped 0-100', () => {
    const result = conditionsScore(base)
    expect(result.score).not.toBeNull()
    expect(result.score!).toBeGreaterThanOrEqual(0)
    expect(result.score!).toBeLessThanOrEqual(100)
  })

  it('breakdown.total matches score', () => {
    const result = conditionsScore(base)
    expect(result.breakdown?.total).toBe(result.score)
  })

  it('breakdown component scores sum to total', () => {
    const result = conditionsScore(base)
    const bd = result.breakdown!
    const componentSum =
      bd.drying.score + bd.rain.score + bd.wind.score + bd.temp.score + bd.humidity.score
    expect(componentSum).toBe(bd.total)
  })

  it('all rock types produce valid scores', () => {
    const types: ScoreInput['rockType'][] = ['sandstone', 'limestone', 'granite', 'basalt', 'unknown']
    for (const rockType of types) {
      const result = conditionsScore({ ...base, rockType })
      expect(result.score).not.toBeNull()
      expect(result.score!).toBeGreaterThanOrEqual(0)
      expect(result.score!).toBeLessThanOrEqual(100)
    }
  })
})
