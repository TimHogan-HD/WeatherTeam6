import { colorsV2 } from '@weatherteam6/design/tokens'
import { EM_DASH } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'

export type Stat = { label: string; value: string; unit?: string | null; color?: string; note?: string | null }

/**
 * Figures as tiles side by side, each with its label above it and its note
 * under it (owner, 2026-10-20: a label at one end of a card and its figure at
 * the other were hard to read together). Equal columns, a hairline between.
 * `stacked` puts them one above another, for a column beside a drying clock.
 */
export function Stats({ items, stacked = false }: { items: readonly Stat[]; stacked?: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: stacked ? 'minmax(0, 1fr)' : `repeat(${items.length}, minmax(0, 1fr))`,
        rowGap: stacked ? '10px' : 0,
        marginTop: '4px',
      }}
    >
      {items.map((s, i) => (
        <div
          key={s.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            minWidth: 0,
            padding: stacked ? 0 : i === 0 ? '2px 12px 2px 0' : '2px 12px',
            borderLeft: stacked || i === 0 ? 'none' : `1px solid ${colorsV2.line}`,
          }}
        >
          <span style={typeV2.statLabel}>{s.label}</span>
          <b style={{ ...typeV2.statFigure, overflowWrap: 'anywhere', ...(s.color === undefined ? {} : { color: s.color }) }}>
            {s.value}
            {s.unit == null || s.value === EM_DASH ? null : (
              <small style={{ fontSize: '15px', fontWeight: 600, color: colorsV2.txt2, marginLeft: '3px' }}>{s.unit}</small>
            )}
          </b>
          {s.note == null ? null : <small style={typeV2.rowSmall}>{s.note}</small>}
        </div>
      ))}
    </div>
  )
}
