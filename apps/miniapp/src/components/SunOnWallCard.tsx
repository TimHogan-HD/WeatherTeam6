import { useState } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import type { SunWalls } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { fieldV2, stack } from '../theme/styles.js'
import { useNow } from '../hooks/useNow.js'
import { formatTickDate } from '../lib/logbook.js'
import { formatSunMinutes, localYmd, sunWallRows, type DayBand } from '../lib/sunOnWall.js'
import { sectCard } from './charts/DayCharts.js'
import { Sect } from './charts/liquid.js'

/**
 * When the sun is on each wall, for a chosen day (#415): the Rock tab of a crag
 * the owner has confirmed sun and shade at (`sunWallsFor`). Display only —
 * nothing here reaches the score.
 *
 * Terrain only: the skylines are hills and ridges from lidar. Trees and
 * overhangs are not in them, and the card says so.
 */

/** The strip runs 4 AM to 10 PM local — every daylight hour at Minnesota's latitude, in June too. */
const STRIP_FROM_MIN = 4 * 60
const STRIP_TO_MIN = 22 * 60
const STRIP_SPAN = STRIP_TO_MIN - STRIP_FROM_MIN
const STRIP_H = 12
const TICKS: readonly { min: number; label: string }[] = [
  { min: 6 * 60, label: '6 AM' },
  { min: 12 * 60, label: 'Noon' },
  { min: 18 * 60, label: '6 PM' },
]

const pct = (min: number) => `${(((Math.min(Math.max(min, STRIP_FROM_MIN), STRIP_TO_MIN) - STRIP_FROM_MIN) / STRIP_SPAN) * 100).toFixed(2)}%`
const widthPct = (b: DayBand) =>
  `${(((Math.min(b.to, STRIP_TO_MIN) - Math.max(b.from, STRIP_FROM_MIN)) / STRIP_SPAN) * 100).toFixed(2)}%`

function Strip({ sun, daylight }: { sun: DayBand[]; daylight: DayBand[] }) {
  return (
    <svg width="100%" height={STRIP_H} aria-hidden="true" style={{ display: 'block', borderRadius: `${radius.full}px` }}>
      <rect width="100%" height={STRIP_H} fill={colorsV2.line} opacity={0.5} />
      {daylight.map((b) => (
        <rect key={`d${b.from}`} x={pct(b.from)} width={widthPct(b)} height={STRIP_H} fill={colorsV2.line} />
      ))}
      {sun.map((b) => (
        <rect key={`s${b.from}`} x={pct(b.from)} width={widthPct(b)} height={STRIP_H} fill={colorsV2.sun} />
      ))}
      {TICKS.map((t) => (
        <line key={t.min} x1={pct(t.min)} x2={pct(t.min)} y1={0} y2={STRIP_H} stroke={colorsV2.card} strokeWidth={1} opacity={0.6} />
      ))}
    </svg>
  )
}

export function SunOnWallCard({ data }: { data: SunWalls }) {
  const now = useNow()
  const today = localYmd(now, data.time_zone)
  const [picked, setPicked] = useState<string | null>(null)
  const day = picked !== null && picked !== '' ? picked : today
  const rows = sunWallRows(data, day)

  return (
    <section style={sectCard}>
      <Sect title="Sun on the wall" aside={day === today ? 'Today' : null} />
      <div style={stack(spacing.listGapLg)}>
        <label style={stack(spacing.tight)}>
          <span style={typeV2.statLabel}>Day</span>
          <input type="date" value={day} onChange={(e) => setPicked(e.target.value)} style={fieldV2} />
        </label>

        {rows.map((r) => (
          <div key={r.name} style={stack(spacing.tight)} data-sun-wall="">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: `${spacing.listGap}px` }}>
              <span style={{ ...typeV2.body, color: colorsV2.txt1, minWidth: 0 }}>{r.name}</span>
              <span style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted, flex: '0 0 auto' }}>{r.faces}</span>
            </div>
            <Strip sun={r.sun} daylight={r.daylight} />
            <span style={{ ...typeV2.rowSmall, color: colorsV2.txt1 }}>
              {r.sunText === null ? 'Sun: none' : `Sun: ${r.sunText} · ${formatSunMinutes(r.sunMinutes)}`}
            </span>
          </div>
        ))}

        <div style={{ position: 'relative', height: '1.2em' }} aria-hidden="true">
          {TICKS.map((t) => (
            <span
              key={t.min}
              style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted, position: 'absolute', left: pct(t.min), transform: 'translateX(-50%)' }}
            >
              {t.label}
            </span>
          ))}
        </div>

        <p style={typeV2.note}>
          Hills and ridges only: USGS lidar near the wall, AWS Terrarium terrain beyond, read {formatTickDate(data.computed)}. Trees and overhangs are not modelled. Each face
          carries the nearest OpenBeta wall’s name, which can be off. Times to the nearest 5 minutes.
        </p>
      </div>
    </section>
  )
}
