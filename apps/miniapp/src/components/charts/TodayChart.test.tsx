import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readingNow } from '@weatherteam6/types'
import type { ChartHour, ChartWindow } from '../../lib/overview.js'
import { TodayChart } from './TodayChart.js'

// Saint Paul in September: UTC-5. 21:00 local is 02:00Z the next UTC day.
const H = 3_600_000

const hour = (h: number, valid_at: string, tempC: number, local_date = '2026-09-30'): ChartHour => ({
  valid_at,
  ms: Date.parse(valid_at),
  hour: h,
  local_date,
  tempC,
  dewC: null,
  chancePct: null,
  windKmh: null,
  score: null,
})

const hours = [hour(21, '2026-10-01T02:00:00Z', 18.5), hour(22, '2026-10-01T03:00:00Z', 17.2)]
const win = (hs: ChartHour[], fromMs: number): ChartWindow => ({ fromMs, toMs: fromMs + 16 * H, hours: hs })

function render(w: ChartWindow, nowMs: number): string {
  return renderToStaticMarkup(<TodayChart window={w} nowMs={nowMs} todayDate="2026-09-30" fill={false} />)
}

/** The readout's Temp figure, the one the reader takes for "Now". */
function readoutTemp(nowMs: number): string | undefined {
  const html = render(win(hours, Date.parse('2026-09-30T20:00:00Z')), nowMs)
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

describe('TodayChart axis', () => {
  it("labels midnight with the day it starts, not '12a'", () => {
    const late = [
      hour(21, '2026-10-01T02:00:00Z', 15),
      hour(0, '2026-10-01T05:00:00Z', 12, '2026-10-01'),
      hour(3, '2026-10-01T08:00:00Z', 10, '2026-10-01'),
    ]
    const html = render(win(late, Date.parse('2026-09-30T20:00:00Z')), Date.parse('2026-10-01T02:00:00Z'))
    expect(html).toContain('>Thu</text>')
    expect(html).not.toContain('>12a</text>')
    expect(html).toContain('>3a</text>')
  })
})
