import { describe, expect, it } from 'vitest'
import { parseGoveeDevices, parseGoveeState } from './govee.js'
import { toSensorRow } from '../sensors/sensorRow.js'

// Shapes as Govee answered for the owner's H5171 on 2026-11-25.
const DEVICES = {
  code: 200,
  message: 'success',
  data: [
    {
      sku: 'H5171',
      device: 'A6:95:F2:3A:42:C6:69:54',
      deviceName: 'WT6 THERMOMETER',
      type: 'devices.types.thermometer',
      capabilities: [],
    },
    { sku: 'H6008', device: 'AA:BB', deviceName: 'Lamp', type: 'devices.types.light', capabilities: [] },
  ],
}

function state(online: unknown, temp: unknown, humidity: unknown) {
  return {
    code: 200,
    payload: {
      sku: 'H5171',
      device: 'A6:95:F2:3A:42:C6:69:54',
      capabilities: [
        { type: 'devices.capabilities.online', instance: 'online', state: { value: online } },
        { type: 'devices.capabilities.property', instance: 'sensorTemperature', state: { value: temp } },
        { type: 'devices.capabilities.property', instance: 'sensorHumidity', state: { value: humidity } },
      ],
    },
  }
}

const DEVICE = { sku: 'H5171', device: 'A6:95:F2:3A:42:C6:69:54', name: 'WT6 THERMOMETER' }

describe('parseGoveeDevices', () => {
  it('keeps thermometers and drops other device types', () => {
    expect(parseGoveeDevices(DEVICES)).toEqual([DEVICE])
  })

  it('throws on a body with no data array, so a failure never reads as no devices', () => {
    expect(() => parseGoveeDevices({ code: 200 })).toThrow()
    expect(() => parseGoveeDevices(null)).toThrow()
  })
})

describe('parseGoveeState', () => {
  it('converts °F to °C and keeps humidity', () => {
    const s = parseGoveeState(state(true, 72.14, 36.9))
    expect(s.online).toBe(true)
    expect(s.temp_c).toBeCloseTo(22.3, 1)
    expect(s.humidity_pct).toBe(36.9)
  })

  it('reads 32 °F as 0 °C, a real value, not a gap', () => {
    expect(parseGoveeState(state(true, 32, 50)).temp_c).toBe(0)
  })

  it('reads a missing or non-numeric figure as null, never 0', () => {
    const s = parseGoveeState(state(true, '', null))
    expect(s.temp_c).toBeNull()
    expect(s.humidity_pct).toBeNull()
  })

  it('reads humidity outside 0–100 as null', () => {
    expect(parseGoveeState(state(true, 70, 140)).humidity_pct).toBeNull()
  })

  it('leaves online unknown when Govee does not say', () => {
    const body = state(true, 70, 40)
    body.payload.capabilities.shift()
    expect(parseGoveeState(body).online).toBeNull()
  })

  it('throws on a body with no capabilities', () => {
    expect(() => parseGoveeState({ code: 200, payload: {} })).toThrow()
  })
})

describe('toSensorRow', () => {
  const at = new Date('2026-11-25T18:07:42.512Z')

  it('stores an online reading at the minute asked', () => {
    const row = toSensorRow(DEVICE, { online: true, temp_c: 22.3, humidity_pct: 36.9 }, at)
    expect(row?.recorded_at.toISOString()).toBe('2026-11-25T18:07:00.000Z')
    expect(row?.temp_c).toBe(22.3)
  })

  it('stores nothing for an offline device, whose figures are its last value', () => {
    expect(toSensorRow(DEVICE, { online: false, temp_c: 22.3, humidity_pct: 36.9 }, at)).toBeNull()
  })

  it('stores nothing when online is unknown', () => {
    expect(toSensorRow(DEVICE, { online: null, temp_c: 22.3, humidity_pct: 36.9 }, at)).toBeNull()
  })

  it('stores nothing when both figures are missing', () => {
    expect(toSensorRow(DEVICE, { online: true, temp_c: null, humidity_pct: null }, at)).toBeNull()
  })

  it('keeps a 0 °C reading', () => {
    expect(toSensorRow(DEVICE, { online: true, temp_c: 0, humidity_pct: null }, at)?.temp_c).toBe(0)
  })
})
