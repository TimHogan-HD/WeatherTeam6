import { describe, it, expect } from 'vitest'
import {
  parseLocationUpdate,
  planLocationUpdate,
  type UpdatableLocation,
} from './updateLocation.js'

// Barn Bluff, Red Wing — inside the known crag's box.
const RED_WING = { lat: 44.5695, lon: -92.526 }
// Red Rock Canyon NCA — deliberately not a known crag.
const RED_ROCK = { lat: 36.15192, lon: -115.45413 }

const crag = (over: Partial<UpdatableLocation> = {}): UpdatableLocation => ({
  ...RED_ROCK,
  is_climbing_location: true,
  rock_type: 'sandstone',
  known_crag: null,
  ...over,
})

describe('parseLocationUpdate', () => {
  it('refuses a body that is not an object', () => {
    for (const body of [null, 'aspect=N', 7, ['aspect']]) {
      expect(parseLocationUpdate(body)).toHaveProperty('error')
    }
  })

  it('refuses an empty body rather than answering 200 for nothing', () => {
    expect(parseLocationUpdate({})).toEqual({ error: expect.stringContaining('Nothing to update') })
  })

  it('refuses and names an unknown key — cliff_angle above all, which runs the other way', () => {
    const out = parseLocationUpdate({ cliff_angle: 30 })
    expect(out).toEqual({ error: expect.stringContaining('cliff_angle') })
    expect(parseLocationUpdate({ aspect: 'N', name: 'x' })).toEqual({
      error: expect.stringContaining('name'),
    })
  })

  it('normalises a compass point and refuses anything that is not one of the 16', () => {
    expect(parseLocationUpdate({ aspect: ' nne ' })).toEqual({ aspect: 'NNE' })
    for (const aspect of ['north', 'NNNE', 180, '', 'S/SE']) {
      expect(parseLocationUpdate({ aspect })).toHaveProperty('error')
    }
  })

  it('accepts the whole climbers’ range, -90 flat to 90 roof, and nothing past it', () => {
    expect(parseLocationUpdate({ wall_angle_deg: -90 })).toEqual({ wall_angle_deg: -90 })
    expect(parseLocationUpdate({ wall_angle_deg: 0 })).toEqual({ wall_angle_deg: 0 })
    expect(parseLocationUpdate({ wall_angle_deg: 90 })).toEqual({ wall_angle_deg: 90 })
    for (const wall_angle_deg of [-90.1, 90.1, '30', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(parseLocationUpdate({ wall_angle_deg })).toHaveProperty('error')
    }
  })

  it('keeps null (clear it) apart from absent (leave it)', () => {
    const out = parseLocationUpdate({ aspect: null, wall_angle_deg: null, rock_type: null })
    expect(out).toEqual({ aspect: null, wall_angle_deg: null, rock_type: null })
    expect(parseLocationUpdate({ aspect: 'N' })).not.toHaveProperty('wall_angle_deg')
  })

  it('refuses a rock type outside the taxonomy', () => {
    expect(parseLocationUpdate({ rock_type: 'gritstone' })).toHaveProperty('error')
    expect(parseLocationUpdate({ rock_type: 'granite' })).toEqual({ rock_type: 'granite' })
  })
})

describe('planLocationUpdate', () => {
  it('stores the angle in the column’s own convention — the sign flips exactly once', () => {
    // 30° overhanging → cliff_angle −30; a 20° slab → 20; vertical → 0.
    const plan = (wall_angle_deg: number) => planLocationUpdate(crag(), { wall_angle_deg })
    expect(plan(30)).toEqual({ ok: true, columns: { cliff_angle: '-30' } })
    expect(plan(-20)).toEqual({ ok: true, columns: { cliff_angle: '20' } })
    expect(plan(0)).toEqual({ ok: true, columns: { cliff_angle: '0' } })
  })

  it('clears to null, never to a number', () => {
    expect(planLocationUpdate(crag(), { wall_angle_deg: null, aspect: null })).toEqual({
      ok: true,
      columns: { cliff_angle: null, aspect: null },
    })
  })

  it('leaves rock_type and known_crag alone unless rock_type was sent', () => {
    const out = planLocationUpdate(crag(), { aspect: 'SW' })
    expect(out).toEqual({ ok: true, columns: { aspect: 'SW' } })
  })

  it('refuses a rock-type change on a locked known crag, and accepts the locked value back', () => {
    const locked = crag({ ...RED_WING, rock_type: 'carbonate_cherty', known_crag: 'red-wing' })
    expect(planLocationUpdate(locked, { rock_type: 'granite' })).toEqual({
      ok: false,
      status: 409,
      error: expect.stringContaining('red-wing'),
    })
    expect(planLocationUpdate(locked, { rock_type: null })).toMatchObject({ ok: false, status: 409 })
    // An editor that resubmits every field must not fail on the one it did not change.
    expect(planLocationUpdate(locked, { rock_type: 'carbonate_cherty', aspect: 'N' })).toEqual({
      ok: true,
      columns: { aspect: 'N' },
    })
  })

  it('locks a row saved before its crag was known, through resolveRockType', () => {
    // known_crag null, but the coordinates are Barn Bluff: the lock applies here
    // exactly as it would on POST, overriding the requested type.
    const out = planLocationUpdate(crag({ ...RED_WING }), { rock_type: 'granite' })
    expect(out).toEqual({
      ok: true,
      columns: { rock_type: 'carbonate_cherty', known_crag: 'red-wing' },
    })
  })

  it('stores an unlocked rock type as sent', () => {
    expect(planLocationUpdate(crag(), { rock_type: 'sandstone_eolian' })).toEqual({
      ok: true,
      columns: { rock_type: 'sandstone_eolian', known_crag: null },
    })
  })

  it('refuses wall facts on a location that is not a crag, but lets it clear them', () => {
    const town = crag({ is_climbing_location: false, rock_type: null })
    for (const update of [{ aspect: 'N' as const }, { wall_angle_deg: 0 }, { rock_type: 'granite' as const }]) {
      expect(planLocationUpdate(town, update)).toMatchObject({ ok: false, status: 409 })
    }
    expect(planLocationUpdate(town, { aspect: null, wall_angle_deg: null })).toEqual({
      ok: true,
      columns: { aspect: null, cliff_angle: null },
    })
  })
})
