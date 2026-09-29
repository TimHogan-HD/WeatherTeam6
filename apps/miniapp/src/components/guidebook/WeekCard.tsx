import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import type { RockLevel } from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { bareButton, cardV2, row, stack, toneColors, type ToneName } from '../../theme/styles.js'
import { detailTabPath } from '../../lib/backTarget.js'
import { findToday } from '../../lib/forecast.js'
import { weekRows } from '../../lib/guidebookView.js'
import { useHourly } from '../../hooks/useHourly.js'
import { useForecast } from '../../hooks/useWeather.js'
import { InlineError, Skeleton } from '../States.js'

const ROCK_TONE: Record<RockLevel, ToneName> = { dry: 'good', drying: 'fair', wet: 'poor' }

/**
 * *Climb it this week*, on the wall screen (owner, 2026-09-29 — the Figma
 * drew it on the route): each day's good hours and how dry the rock reads.
 *
 * **The crag's reading, and the card says so.** No wall has a recorded
 * aspect, so the hours are the Daily tab's windows from the same `/hourly`
 * response, never a wall's own.
 */
export function WeekCard({ locationId }: { locationId: string }) {
  const navigate = useNavigate()
  const hourly = useHourly(locationId)
  const forecast = useForecast(locationId)
  const todayDate = findToday(forecast.data)?.forecast_date ?? null

  let body: ReactNode
  if (hourly.isPending || forecast.isPending) body = <Skeleton height={200} />
  else if (hourly.isError) {
    body = <InlineError message="Couldn't load the hour-by-hour forecast." onRetry={() => void hourly.refetch()} />
  } else if (todayDate === null) {
    body = <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>No forecast for today yet.</p>
  } else {
    const rows = weekRows(hourly.data, todayDate)
    body =
      rows.length === 0 ? (
        <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>No readings for this week yet.</p>
      ) : (
        <div style={stack(0)}>
          {rows.map((r) => {
            const tone = r.rock === null ? null : toneColors(ROCK_TONE[r.rock], 'pill')
            return (
              <div
                key={r.local_date}
                style={{ ...row(spacing.listGapLg), paddingBlock: `${spacing.cellPad}px`, borderTop: `1px solid ${colorsV2.line}` }}
              >
                <span style={{ ...typeV2.rowTitle, width: '52px', flex: '0 0 auto' }}>{r.title}</span>
                <span
                  style={{ ...typeV2.factValue, flex: '1 1 auto', color: r.hours === 'None' ? colorsV2.txtMuted : colorsV2.txt1 }}
                >
                  {r.hours}
                </span>
                {tone === null || r.rockLabel === null ? null : (
                  <span
                    style={{
                      ...typeV2.pillValue,
                      color: tone.value,
                      backgroundColor: tone.background,
                      borderRadius: `${radius.full}px`,
                      padding: `${spacing.micro}px ${spacing.listGap}px`,
                    }}
                  >
                    {r.rockLabel}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )
  }

  return (
    <section style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
      <div style={stack(spacing.tight)}>
        <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
          <h2 style={typeV2.cardTitle}>Climb it this week</h2>
          <button
            type="button"
            onClick={() => void navigate(detailTabPath(locationId, 'hourly'))}
            style={{ ...bareButton, width: 'auto', ...typeV2.cardLink }}
          >
            Hourly ›
          </button>
        </div>
        <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>
          Good hours at the crag. Wall aspects aren’t recorded, so this wall shares the crag’s reading.
        </span>
      </div>
      {body}
    </section>
  )
}
