import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readingNow } from '@weatherteam6/types'
import type { ChartHour } from '../../lib/overview.js'
import { TodayChart } from './TodayChart.js'

// Saint Paul in September: UTC-5. 21:00 local is 02:00Z the next UTC day.
const OFFSET = -5 * 3600

const hour = (h: number, valid_at: string, tempC: number): ChartHour => ({
  valid_at,
  hour: h,
  tempC,
  dewC: null,
  chancePct: null,
  windKmh: null,
  score: null,
})

const hours = [hour(21, '2026-10-01T02:00:00Z', 18.5), hour(22, '2026-10-01T03:00:00Z', 17.2)]

/** The readout's Temp figure, the one the reader takes for "Now". */
function readoutTemp(nowMs: number): string | undefined {
  const html = renderToStaticMarkup(<TodayChart hours={hours} nowMs={nowMs} utcOffsetSeconds={OFFSET} fill={false} />)
  return /Now<\/span>.*?Temp<\/span><span[^>]*>([^<]+)</.exec(html)?.[1]
}

describe('TodayChart readout', () => {
  // 21:39 local. The hero showed the 22:00 hour (63°F) while this readout,
  // rounding down, showed 21:00 (65°F) — two "now" temperatures on one screen.
  const lateInTheHour = Date.parse('2026-10-01T02:39:00Z')

  it("reads the same hour for Now as the hero's `readingNow`", () => {
    expect(readingNow(hours, lateInTheHour)?.hour).toBe(22)
    expect(readoutTemp(lateInTheHour)).toBe('63°')
  })

  it('reads the hour already begun early in the hour', () => {
    expect(readoutTemp(Date.parse('2026-10-01T02:10:00Z'))).toBe('65°')
  })
})
