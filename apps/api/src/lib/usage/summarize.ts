/**
 * The usage log's report (`npm run usage`, `docs/usage-log.md`): how often
 * each screen and tab was opened across everyone, and a rough time on each.
 * No account is stored, so there is no per-person view.
 */

/** A gap longer than this is someone who left the app, not someone reading. */
export const MAX_GAP_MS = 5 * 60_000

export type UsageRow = {
  visit_id: string
  screen: string
  tab: string | null
  at: Date
}

export type ScreenUsage = {
  /** `/location/:id · precip`, or the screen alone off the crag screen. */
  label: string
  count: number
  /** Median of the gaps under `MAX_GAP_MS`; null when no gap qualified. */
  medianSeconds: number | null
}

export type UsageSummary = {
  events: number
  visits: number
  /** Most opened first. */
  screens: ScreenUsage[]
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Rows in any order. Each visit's are sorted by time here, and an event's
 * time is the gap to the same visit's next event, never another visit's.
 */
export function summarizeUsage(rows: readonly UsageRow[]): UsageSummary {
  const byVisit = new Map<string, UsageRow[]>()
  for (const row of rows) {
    const list = byVisit.get(row.visit_id)
    if (list === undefined) byVisit.set(row.visit_id, [row])
    else list.push(row)
  }

  const screens = new Map<string, { count: number; gaps: number[] }>()
  for (const list of byVisit.values()) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime())
    list.forEach((row, i) => {
      const label = row.tab === null ? row.screen : `${row.screen} · ${row.tab}`
      const entry = screens.get(label) ?? { count: 0, gaps: [] }
      entry.count += 1
      const next = list[i + 1]
      if (next !== undefined) {
        const gap = next.at.getTime() - row.at.getTime()
        if (gap < MAX_GAP_MS) entry.gaps.push(gap)
      }
      screens.set(label, entry)
    })
  }

  return {
    events: rows.length,
    visits: byVisit.size,
    screens: [...screens.entries()]
      .map(([label, { count, gaps }]) => {
        const m = median(gaps)
        return { label, count, medianSeconds: m === null ? null : Math.round(m / 1000) }
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  }
}
