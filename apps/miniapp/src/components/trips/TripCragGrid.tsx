import type { CSSProperties } from 'react'
import { colorsV2, radius, spacing, toneSurfacesV2 } from '@weatherteam6/design/tokens'
import { formatPrecipIn, type TripOutlook } from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { bareButton, cardV2, row, stack } from '../../theme/styles.js'
import { formatTempDeg } from '../../lib/format.js'
import { scoreTone } from '../../lib/locationList.js'
import type { DayReadings } from '../../lib/overview.js'
import { dateLabel, dateParts, formatShare, outlookState, tripDayTiles, type TripDayTile } from '../../lib/trips.js'
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

const CELL_MIN_W = 64
const NAME_COL_W = 96

/**
 * Several crags side by side: a row per crag, a column per trip day. A scored
 * cell is the score, the dryness word and the day's rain; an unscored one is
 * dashed, with the high, chance and amount. The same tiles the one-crag view
 * draws (`tripDayTiles`), so a day cannot read differently on the two.
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
      <section style={{ ...cardV2, ...stack(spacing.listGap) }} aria-label="By day">
        <div style={{ ...row(spacing.listGap), justifyContent: 'space-between' }}>
          <h2 style={{ ...typeV2.kicker, color: colorsV2.txtMuted }}>By day</h2>
          <span style={typeV2.aside}>Tap a crag</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: columns, gap: `${spacing.listGapSm}px` }}>
            <span />
            {dates.map((d) => (
              <span key={d} style={{ ...stack(0), alignItems: 'center', ...typeV2.cellHour }}>
                <span style={{ ...typeV2.rowTitle, fontSize: typeV2.cellHour.fontSize }}>{dateParts(d)?.weekday ?? ""}</span>
                {dateLabel(d)}
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
      </section>
      <section style={{ ...cardV2, ...stack(spacing.listGap) }} aria-label="Rain over the trip">
        <div style={{ ...row(spacing.listGap), justifyContent: 'space-between' }}>
          <h2 style={{ ...typeV2.kicker, color: colorsV2.txtMuted }}>Rain over the trip</h2>
          <span style={typeV2.aside}>likely · range</span>
        </div>
        {crags.map((crag) => {
          const parts = rainTotalParts(crag.outlook)
          return (
            <div
              key={crag.locationId}
              style={{ ...row(spacing.listGap), justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <span style={typeV2.rowTitle}>{crag.name}</span>
              {parts === null ? (
                <span style={typeV2.note}>{rainUnknown(crag.outlook)}</span>
              ) : (
                <span style={{ ...row(spacing.listGapSm), alignItems: 'baseline' }}>
                  <span style={{ ...typeV2.factValue, color: colorsV2.rain }}>{parts.likely}</span>
                  <span style={typeV2.note}>
                    {parts.range}
                    {parts.coverage === null ? '' : ` · ${parts.coverage}`}
                  </span>
                </span>
              )}
            </div>
          )
        })}
      </section>
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
        style={{ ...bareButton, ...typeV2.rowTitle, alignSelf: 'center', overflowWrap: 'anywhere' }}
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
  borderRadius: `${radius.chipMd}px`,
  borderWidth: '1px',
  ...typeV2.note,
  lineHeight: '16px',
}

function Cell({ tile, unavailable }: { tile: TripDayTile; unavailable: boolean }) {
  const amount = formatPrecipIn(tile.weather?.precipMm ?? null)
  if (tile.kind === 'scored') {
    const score = tile.summary.score
    const tone = score === null ? null : toneSurfacesV2[scoreTone(score)]
    const dryness = tile.summary.readings[0]?.value ?? null
    return (
      <div
        style={{
          ...cellBase,
          borderStyle: 'solid',
          borderColor: tone?.pillLine ?? colorsV2.line,
          backgroundColor: tone?.row ?? colorsV2.raised,
        }}
      >
        <span style={{ ...typeV2.cellFigure, color: tone?.pillInk ?? colorsV2.txtMuted }}>{score ?? '—'}</span>
        {dryness === null ? null : <span style={{ color: tone?.pillInk ?? colorsV2.txt2 }}>{dryness}</span>}
        <span style={{ color: colorsV2.rain }}>{amount}</span>
      </div>
    )
  }
  const chance = formatShare(tile.weather?.chance ?? null)
  return (
    <div style={{ ...cellBase, borderStyle: 'dashed', borderColor: colorsV2.line, color: colorsV2.txt2 }}>
      {unavailable || tile.weather === null ? (
        <span style={{ color: colorsV2.txtMuted }}>—</span>
      ) : (
        <>
          <span>{formatTempDeg(tile.weather.highC)}</span>
          {chance === null ? null : <span style={{ color: colorsV2.rain }}>{chance}</span>}
          <span style={{ color: colorsV2.rain }}>{amount}</span>
        </>
      )}
    </div>
  )
}
