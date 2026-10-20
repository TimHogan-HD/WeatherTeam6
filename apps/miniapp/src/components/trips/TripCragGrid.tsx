import type { CSSProperties } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { EM_DASH, formatPrecipIn, type TripOutlook } from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { bareButton, stack } from '../../theme/styles.js'
import { glassTile } from '../../theme/glass.js'
import { formatTempDeg } from '../../lib/format.js'
import type { DayReadings } from '../../lib/overview.js'
import { formatShare, outlookState, shortDayLabel, tripDayTiles, type TripDayTile } from '../../lib/trips.js'
import { scoreRampColor } from '../charts/chartStyle.js'
import { GuideCard } from '../guidebook/parts.js'
import { InlineError } from '../States.js'
import { rainTotalParts } from './TripCragView.js'

export type GridCrag = {
  locationId: string
  name: string
  outlook: TripOutlook | undefined
  readings: DayReadings | null
  isCrag: boolean
  /** This crag's `/hourly` failed: its retry. `null` otherwise. */
  scoresFailed: (() => void) | null
}

const CELL_MIN_W = 58
const NAME_COL_W = 96

/**
 * Several crags side by side (the mockup's `.tgrid`): a row per crag, a column
 * per trip day. A scored cell is the score, the Dryness word and the day's
 * rain; an unscored one is dashed, with the high and chance. The same tiles the
 * one-crag view draws (`tripDayTiles`), so a day cannot read differently on the two.
 *
 * The grid scrolls sideways inside its card on a long trip; the page never does.
 */
export function TripCragGrid({
  dates,
  today,
  crags,
  onOpenCrag,
}: {
  dates: readonly string[]
  today: string
  crags: readonly GridCrag[]
  onOpenCrag: (locationId: string) => void
}) {
  const columns = `${NAME_COL_W}px repeat(${dates.length}, minmax(${CELL_MIN_W}px, 1fr))`
  return (
    <>
      <GuideCard title="By day" aside="Tap a crag" label="By day">
        <div style={{ overflowX: 'auto', paddingBottom: `${spacing.micro}px` }}>
          <div style={{ display: 'grid', gridTemplateColumns: columns, gap: `${spacing.listGapSm}px`, alignItems: 'center' }}>
            <span />
            {dates.map((d) => (
              <span key={d} style={{ ...typeV2.dayPick, fontSize: '13px', color: colorsV2.txt2, textAlign: 'center' }}>
                {shortDayLabel(d)}
              </span>
            ))}
            {crags.map((crag) => (
              <CragRow key={crag.locationId} crag={crag} dates={dates} today={today} onOpen={onOpenCrag} />
            ))}
          </div>
        </div>
        <p style={typeV2.note}>Dashed: not scored yet.</p>
        {crags.map((crag) =>
          crag.scoresFailed === null ? null : (
            <InlineError key={crag.locationId} message={`Couldn't load the scores for ${crag.name}.`} onRetry={crag.scoresFailed} />
          ),
        )}
      </GuideCard>
      <GuideCard title="Rain over the trip" aside="likely · range" label="Rain over the trip">
        <div style={stack(0)}>
          {crags.map((crag, i) => {
            const parts = rainTotalParts(crag.outlook)
            return (
              <div
                key={crag.locationId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'baseline',
                  columnGap: `${spacing.listGap}px`,
                  padding: `${spacing.listGap}px 0`,
                  borderTop: i === 0 ? 'none' : `1px solid ${colorsV2.line}`,
                }}
              >
                <span style={{ ...typeV2.lineLabel, overflowWrap: 'anywhere' }}>{crag.name}</span>
                <span style={{ ...typeV2.lineFigure, color: parts === null ? colorsV2.txtMuted : colorsV2.txt1 }}>
                  {parts === null ? rainUnknown(crag.outlook) : parts.likely}
                </span>
                {parts === null ? null : (
                  <span style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted, gridColumn: '1 / 3' }}>
                    {parts.range}
                    {parts.coverage === null ? '' : ` · ${parts.coverage}`}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </GuideCard>
    </>
  )
}

function rainUnknown(outlook: TripOutlook | undefined): string {
  const state = outlookState(outlook)
  if (state.kind === 'unavailable') return 'Couldn’t load'
  if (state.kind === 'notYet') return 'Not in range yet'
  return 'No total yet'
}

function CragRow({
  crag,
  dates,
  today,
  onOpen,
}: {
  crag: GridCrag
  dates: readonly string[]
  today: string
  onOpen: (locationId: string) => void
}) {
  const state = outlookState(crag.outlook)
  const tiles = tripDayTiles({
    dates,
    outlook: state.kind === 'days' ? state.outlook.days : [],
    readings: crag.readings,
    isCrag: crag.isCrag,
    today,
  })
  return (
    <>
      <button
        type="button"
        onClick={() => onOpen(crag.locationId)}
        style={{ ...bareButton, ...typeV2.listName, fontSize: '16px', lineHeight: '20px', minHeight: '44px', textAlign: 'left', overflowWrap: 'anywhere' }}
      >
        {crag.name} ›
      </button>
      {tiles.map((tile) => (
        <Cell key={tile.local_date} tile={tile} unavailable={state.kind === 'unavailable'} />
      ))}
    </>
  )
}

const cellBase: CSSProperties = {
  ...stack(0),
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  minHeight: '62px',
  padding: `${spacing.tight}px ${spacing.micro}px`,
  ...typeV2.rowSmall,
  lineHeight: '15px',
}

function Cell({ tile, unavailable }: { tile: TripDayTile; unavailable: boolean }) {
  const amount = formatPrecipIn(tile.weather?.precipMm ?? null)
  if (tile.kind === 'scored') {
    const score = tile.summary.score
    const dryness = tile.summary.readings[0]?.value ?? null
    return (
      <div style={{ ...cellBase, ...glassTile({ dashed: false, chosen: false }) }}>
        <span style={{ ...typeV2.lineFigure, lineHeight: '24px', color: score === null ? colorsV2.txtMuted : scoreRampColor(score) }}>
          {score ?? EM_DASH}
        </span>
        {dryness === null ? null : <span>{dryness}</span>}
        <span style={{ color: colorsV2.txtMuted }}>{amount}</span>
      </div>
    )
  }
  const chance = formatShare(tile.weather?.chance ?? null)
  return (
    <div style={{ ...cellBase, ...glassTile({ dashed: true, chosen: false }) }}>
      <span style={{ ...typeV2.lineFigure, lineHeight: '24px', color: colorsV2.txtMuted }}>{EM_DASH}</span>
      {unavailable || tile.weather === null ? (
        <span style={{ color: colorsV2.txtMuted }}>{unavailable ? 'Couldn’t load' : 'No forecast'}</span>
      ) : (
        <span style={{ color: colorsV2.txtMuted }}>
          {formatTempDeg(tile.weather.highC)}
          {chance === null ? '' : ` · ${chance}`}
        </span>
      )}
    </div>
  )
}
