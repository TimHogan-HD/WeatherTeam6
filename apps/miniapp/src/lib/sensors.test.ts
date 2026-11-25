import { describe, expect, it } from 'vitest'
import type { SensorReading } from '@weatherteam6/types'
import { readingAge, readingFigures } from './sensors.js'

const NOW = Date.parse('2026-11-25T18:30:00Z')

describe('readingAge', () => {
  it('counts minutes, hours and days', () => {
    expect(readingAge('2026-11-25T18:29:40Z', NOW)).toBe('Read just now')
    expect(readingAge('2026-11-25T18:22:00Z', NOW)).toBe('Read 8 min ago')
    expect(readingAge('2026-11-25T15:10:00Z', NOW)).toBe('Read 3 h ago')
    expect(readingAge('2026-11-22T18:30:00Z', NOW)).toBe('Read 3 d ago')
  })

  it('says nothing for a time it cannot measure', () => {
    expect(readingAge('not a time', NOW)).toBeNull()
    expect(readingAge('2026-11-25T18:40:00Z', NOW)).toBeNull()
  })
})

describe('readingFigures', () => {
  const base: SensorReading = { device: 'd', device_name: null, recorded_at: '2026-11-25T18:00:00Z', temp_c: 0, humidity_pct: 0 }

  it('prints 0 °C as 32°F and 0% as a reading', () => {
    expect(readingFigures(base)).toBe('32°F · 0%')
  })

  it('prints a missing figure as a gap, never 32°F or 0%', () => {
    expect(readingFigures({ ...base, temp_c: null, humidity_pct: null })).toBe('— · —')
  })
})
