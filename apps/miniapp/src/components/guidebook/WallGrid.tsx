import { useState } from 'react'
import { colorsV2 } from '@weatherteam6/design/tokens'
import { EM_DASH, type ClimbHours, type WallReadings } from '@weatherteam6/types'
import { typeV2, withOpacity } from '../../theme/tokens.css.js'
import { bareButton } from '../../theme/styles.js'
import { gridTitle, nowColumn, wallGrid, type GridCell } from '../../lib/wallGrid.js'
import { pinWall, pinnedWall } from '../../lib/wallLine.js'
import { useNow } from '../../hooks/useNow.js'
import { scoreRampColor } from '../charts/chartStyle.js'
import { GuideCard } from './parts.js'

/**
 * Every lidar wall, every climbing hour (#445, Phase 3, `ideas.html` idea 1):
 * each cell is Wall A's score, coloured on the score ramp, outlined while the
 * sun is on the wall. Today's hours, or tomorrow's once today's are over; the
 * hour now is lit in the header. Tapping a row pins that wall on the Overview
 * (the same pin as the Overview's wall sheet); tapping the pinned row returns
 * to Auto. Display only: the crag's score stays Crag A's.
 */

/** The wall names' column. Wide enough for Red Wing's longest, `Perfect Crimb`, at this size. */
const NAME_COL = 92

/** Room for a sun ring outside each cell: 1px offset plus 2px ring, either side. */
const CELL_GAP = 6

/** The narrowest cell that holds `100`. Past it, the grid scrolls sideways inside the card rather than overlap figures. */
const CELL_MIN = 24

export function WallGridCard({
  walls,
  locationId,
  todayDate,
  climbHours,
  utcOffsetSeconds,
}: {
  walls: readonly WallReadings[]
  locationId: string
  todayDate: string | null
  climbHours: ClimbHours
  utcOffsetSeconds: number
}) {
  const now = useNow()
  const [pinned, setPinned] = useState<string | null>(() => pinnedWall(locationId))
  const grid = wallGrid(walls, todayDate, climbHours, utcOffsetSeconds, now)
  if (grid === null) return null

  const toggle = (name: string) => {
    const next = pinned === name ? null : name
    pinWall(locationId, next)
    setPinned(next)
  }
  const n = grid.columns.length
  const cols = `${NAME_COL}px repeat(${n}, minmax(${CELL_MIN}px, 1fr))`
  const nowAt = nowColumn(grid, now)

  return (
    <GuideCard title={gridTitle(grid.localDate, todayDate)} aside="score by hour">
      {/* Padded so the sun rings and the pinned outline are not clipped by the scroller. */}
      <div style={{ overflowX: 'auto', margin: '-4px', padding: '4px' }}>
      <div style={{ display: 'grid', gap: '4px', minWidth: `${NAME_COL + n * (CELL_MIN + CELL_GAP)}px` }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: `${CELL_GAP}px`, alignItems: 'end' }} aria-hidden="true">
        <span />
        {grid.columns.map((c, i) => (
          <span
            key={c.validAt}
            style={{
              ...typeV2.keyRow,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              color: i === nowAt ? colorsV2.brandInk : colorsV2.txtMuted,
              fontWeight: i === nowAt ? 600 : undefined,
            }}
          >
            {/* Every other hour, as the mockup ticks them, and always the hour now. */}
            {i % 2 === 0 || i === nowAt ? c.label : null}
          </span>
        ))}
      </div>
        {grid.rows.map((r) => {
          const on = pinned === r.name
          return (
            <button
              key={r.name}
              type="button"
              aria-pressed={on}
              aria-label={`${r.name}${r.treeShaded ? ', under trees' : ''}: ${rowSummary(r.cells, grid.columns)}. ${on ? 'Pinned on the Overview; tap for Auto' : 'Pin on the Overview'}`}
              onClick={() => toggle(r.name)}
              style={{
                ...bareButton,
                display: 'grid',
                gridTemplateColumns: cols,
                columnGap: `${CELL_GAP}px`,
                alignItems: 'center',
                width: '100%',
                minHeight: '44px',
                padding: '0',
                borderRadius: '8px',
                background: on ? withOpacity(colorsV2.brand, 0.1) : 'transparent',
                outline: on ? `1px solid ${colorsV2.brand}` : 'none',
                outlineOffset: '1px',
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, paddingLeft: '4px', textAlign: 'left' }}>
                <span style={{ ...typeV2.whyFigure, color: colorsV2.txt1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}
                </span>
                {on || r.treeShaded ? (
                  <span style={{ ...typeV2.keyRow, color: on ? colorsV2.brandInk : colorsV2.txtMuted, whiteSpace: 'nowrap' }}>
                    {on ? 'Pinned' : 'Under trees'}
                  </span>
                ) : null}
              </span>
              {r.cells.map((cell, i) => (
                <Cell key={grid.columns[i]!.validAt} cell={cell} />
              ))}
            </button>
          )
        })}
      </div>
      </div>
      <p style={{ ...typeV2.keyRow, color: colorsV2.txtMuted, margin: 0 }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: '12px',
            height: '10px',
            borderRadius: '3px',
            background: colorsV2.raised,
            outline: `2px solid ${colorsV2.sun}`,
            outlineOffset: '1px',
            marginLeft: '3px',
            marginRight: '9px',
            verticalAlign: '-1px',
          }}
        />
        Sun on the wall. Tap a wall to pin it on the Overview.
      </p>
    </GuideCard>
  )
}

function Cell({ cell }: { cell: GridCell }) {
  // A wall without this hour: a gap, never a neighbour's figure.
  if (cell === null) return <span />
  const scored = cell.score !== null
  return (
    <span
      style={{
        ...typeV2.whyFigure,
        height: '30px',
        borderRadius: '5px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontVariantNumeric: 'tabular-nums',
        background: scored ? scoreRampColor(cell.score!) : colorsV2.raised,
        color: scored ? colorsV2.bg : colorsV2.txtMuted,
        // Outside the cell, in the gap against the card: inside it, the pale ring vanished on the ramp's lime.
        outline: cell.inSun ? `2px solid ${colorsV2.sun}` : 'none',
        outlineOffset: '1px',
      }}
    >
      {cell.score ?? EM_DASH}
    </span>
  )
}

/** The row read aloud: `1p 20 in sun, 2p 24 in sun, …`. */
function rowSummary(cells: readonly GridCell[], columns: readonly { label: string }[]): string {
  return cells
    .map((c, i) => {
      const at = columns[i]!.label
      if (c === null) return `${at} no reading`
      return `${at} ${c.score ?? 'not scored'}${c.inSun ? ' in sun' : ''}`
    })
    .join(', ')
}
