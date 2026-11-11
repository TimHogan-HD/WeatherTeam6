import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FRICTION_MECHANISM, type HourlyReading, type HourlyReadings, type HourlySample } from '@weatherteam6/types'
import { renderInRouter } from '../test/renderInRouter.js'
import { CondensationCard, condensationNote } from './RockReadings.js'

const NOW = Date.parse('2026-10-29T18:10:00.000Z')
const HOUR = 3_600_000
const at = (i: number) => new Date(Date.parse('2026-10-29T18:00:00.000Z') + i * HOUR).toISOString()

function hour(i: number, friction: HourlyReading['friction'], marginC: number | null = 4): HourlyReading {
  return {
    valid_at: at(i),
    rock: { level: 'dry', qualified: true },
    friction,
    score: 80,
    t_surface_c: 12,
    condensation_margin_c: marginC,
  }
}

const readings = (friction: HourlyReading['friction'], margins: (number | null)[] = [4, 4, 4, 4, 4, 4]): HourlyReadings => ({
  model: 'gfs_seamless',
  unavailable_reason: null,
  hours: margins.map((m, i) => hour(i, friction, m)),
  days: [],
})

const sample = (i: number, temp_c: number | null, dewpoint_c: number | null) =>
  ({ valid_at: at(i), local_date: '2026-10-29', temp_c, dewpoint_c }) as HourlySample

/** Air 10 °C over a 5 °C dew point: 9°F apart, every hour. */
const HOURS = Array.from({ length: 6 }, (_, i) => sample(i, 10, 5))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('CondensationCard — the friction note (moved from the Overview, owner 2026-10-29)', () => {
  it('says friction is an estimate, once', () => {
    const html = renderInRouter(
      <CondensationCard
        readings={readings({ level: 'good', condensing: false, qualified: true })}
        hours={HOURS}
        model="gfs_seamless"
        hrrrThrough={null}
        utcOffsetSeconds={0}
      />,
    )
    expect(html.split(FRICTION_MECHANISM).length - 1).toBe(1)
  })

  it('says nothing about friction when no hour carries a friction reading', () => {
    expect(
      renderInRouter(<CondensationCard readings={readings(null)} hours={HOURS} model="gfs_seamless" hrrrThrough={null} utcOffsetSeconds={0} />),
    ).not.toContain(FRICTION_MECHANISM)
  })
})

describe('CondensationCard — air minus dew point, the rock in words only (#436)', () => {
  it('reads the air’s spread for the hour, and the rock as a word, never as a °F figure', () => {
    // Rock margin 4 °C is 7°F and must not print; 1 °C (near the edge) shades the hour and names it.
    const html = renderInRouter(
      <CondensationCard readings={readings(null, [1, 1, 4, 4, 4, 4])} hours={HOURS} model="gfs_seamless" hrrrThrough={null} utcOffsetSeconds={0} />,
    )
    expect(html).toContain('air above dew')
    expect(html).toContain('9°F')
    expect(html).toContain('near dew')
    expect(html).not.toContain('7°F')
    expect(html).not.toContain('rock vs dew')
    expect(html).toContain('data-damp="near"')
  })

  it('reads the rock as a dash, never “clear”, at an hour the readings left unread', () => {
    const html = renderInRouter(
      <CondensationCard readings={readings(null, [null, 4, 4, 4, 4, 4])} hours={HOURS} model="gfs_seamless" hrrrThrough={null} utcOffsetSeconds={0} />,
    )
    expect(html).toContain('—')
    expect(html).not.toContain('>clear<')
    expect(html).not.toContain('data-damp')
  })

  it('reads the air as a dash, never 0°F, when the hour lacks its dew point', () => {
    const gappy = [sample(0, 10, null), ...HOURS.slice(1)]
    const html = renderInRouter(
      <CondensationCard readings={readings(null)} hours={gappy} model="gfs_seamless" hrrrThrough={null} utcOffsetSeconds={0} />,
    )
    expect(html).not.toContain('0°F')
    expect(html).toContain('—')
  })

  it('draws nothing when no hour has both air and dew point', () => {
    const empty = HOURS.map((h) => ({ ...h, dewpoint_c: null }))
    expect(
      renderInRouter(<CondensationCard readings={readings(null)} hours={empty} model="gfs_seamless" hrrrThrough={null} utcOffsetSeconds={0} />),
    ).toBe('')
  })

  it('still draws the air with no readings at all, and says the rock was not read', () => {
    const html = renderInRouter(<CondensationCard readings={undefined} hours={HOURS} model={null} hrrrThrough={null} utcOffsetSeconds={0} />)
    expect(html).toContain('No rock readings for the hours ahead.')
    expect(html).toContain('9°F')
  })
})

describe('condensationNote', () => {
  it('names the forecast only when the response names it', () => {
    expect(condensationNote('GFS')).toMatch(/^Air temperature minus dew point, from the GFS forecast\./)
    expect(condensationNote(null)).toMatch(/^Air temperature minus dew point, from the forecast\./)
  })

  it('on the card, names HRRR over the hours gfs_seamless carries it (#473), and no model when none was named', () => {
    const card = (model: string | null, hrrrThrough: string | null) =>
      renderInRouter(<CondensationCard readings={undefined} hours={HOURS} model={model} hrrrThrough={hrrrThrough} utcOffsetSeconds={0} />)
    expect(card('gfs_seamless', null)).toContain('from the GFS forecast')
    expect(card('gfs_seamless', '2026-10-30T00:00:00.000Z')).toContain('from the HRRR forecast')
    expect(card('gfs_seamless', '2026-10-29T20:00:00.000Z')).toContain('from the HRRR, then GFS forecast')
    expect(card(null, null)).toContain('from the forecast')
  })

  it('says the shaded hours are an estimate on a modelled rock temperature', () => {
    expect(condensationNote(null)).toContain('modelled, not measured')
  })
})
