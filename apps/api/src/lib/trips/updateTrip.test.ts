import { describe, expect, it, vi } from 'vitest'

vi.mock('../../db/index.js', () => ({ db: {} }))

const { parseTripPatch } = await import('./updateTrip.js')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('parseTripPatch', () => {
  it('takes any one field alone', () => {
    expect(parseTripPatch({ name: '  Red Wing  ' })).toEqual({ name: 'Red Wing' })
    expect(parseTripPatch({ startDate: '2026-10-08' })).toEqual({ startDate: '2026-10-08' })
    expect(parseTripPatch({ cragIds: [A, B, A] })).toEqual({ cragIds: [A, B] })
  })

  it('refuses an empty body, an unknown key and a non-object', () => {
    expect(parseTripPatch({})).toBeNull()
    expect(parseTripPatch({ name: 'x', start: '2026-10-08' })).toBeNull()
    expect(parseTripPatch(null)).toBeNull()
    expect(parseTripPatch([{ name: 'x' }])).toBeNull()
  })

  it('refuses a blank name, a malformed date and an empty or foreign-shaped crag list', () => {
    expect(parseTripPatch({ name: '   ' })).toBeNull()
    expect(parseTripPatch({ endDate: '10/08/2026' })).toBeNull()
    expect(parseTripPatch({ cragIds: [] })).toBeNull()
    expect(parseTripPatch({ cragIds: ['not-a-uuid'] })).toBeNull()
  })
})
