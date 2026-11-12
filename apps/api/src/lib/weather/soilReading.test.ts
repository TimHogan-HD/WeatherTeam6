import { describe, expect, it, vi } from 'vitest'
import { SOIL_STATIONS } from '@weatherteam6/types'
import { soilReading } from './soilReading.js'

const STATION = SOIL_STATIONS['robinson-park']
const NOW = Date.UTC(2026, 10, 12, 19)

describe('soilReading', () => {
  it('says a failed soil read rather than returning dry ground, and keeps the rain it did get', async () => {
    if (STATION === undefined) throw new Error('no station')
    const out = await soilReading(STATION, NOW, {
      soil: vi.fn(async () => {
        throw new Error('HTTP 503')
      }),
      rain: vi.fn(async () => [{ endMs: NOW, mm: 0 }]),
    })
    expect(out.answered).toBe(false)
    expect(out.points).toEqual([])
    expect(out.rain_days.length).toBeGreaterThanOrEqual(15)
    expect(out.station).toEqual({ wban: '54932', name: 'Sandstone 6 W', distance_km: 10.4, direction: 'west', setting: 'in an open field' })
  })

  it('leaves the rain bars empty when the rain read fails', async () => {
    if (STATION === undefined) throw new Error('no station')
    const out = await soilReading(STATION, NOW, {
      soil: vi.fn(async () => []),
      rain: vi.fn(async () => {
        throw new Error('HTTP 503')
      }),
    })
    expect(out.answered).toBe(true)
    expect(out.rain_days).toEqual([])
  })
})
