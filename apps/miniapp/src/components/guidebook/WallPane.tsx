import { useState, type ReactNode } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import {
  ROUTE_KIND_LABELS,
  gradeBand,
  gradeLabel,
  kindCounts,
  kindsLine,
  leftToRight,
  sortByGrade,
  type GuidebookRoute,
  type GuidebookWall,
} from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { bareButton, choicePill, row, stack } from '../../theme/styles.js'
import { FILTER_KINDS, filterByKind, type KindFilter } from '../../lib/guidebookView.js'
import { useLogbook } from '../../hooks/useLogbook.js'
import { ChevronRightIcon } from '../Icons.js'
import { GradeHistogram, gradeColor } from './GradeCharts.js'
import { PositionCard } from './PositionCard.js'
import { Crumb, GuideCard, WeekStrip, type WeekInput } from './parts.js'

/**
 * One wall, inside the Crag tab (the mockup's wall screen): the crag's
 * reading now and its week, the wall's grades, and its routes, filterable by
 * kind and sorted by grade or left to right.
 *
 * **Left to right is offered only where OpenBeta establishes it** — a third of
 * Minnesota's walls have every route at one position or none — and the list
 * opens on it when it is, because that is how a climber walks a wall.
 */

/** How many rows show before "Show all". */
const FIRST_ROWS = 15

type SortMode = 'grade' | 'position'

/** A route's grade in its band's colour, or a muted dash when it has none. */
export function GradeText({ route, style }: { route: GuidebookRoute; style: typeof typeV2.guideRowGrade }) {
  const band = gradeBand(route)
  return <span style={{ ...style, color: band === null ? colorsV2.txtMuted : gradeColor(band) }}>{gradeLabel(route) ?? '—'}</span>
}

function RouteRow({ route, marker, onOpen }: { route: GuidebookRoute; marker: string | null; onOpen: () => void }) {
  const small = [kindsLine(route.kinds), marker].filter((s) => s !== null && s !== '').join(' · ')
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        ...bareButton,
        display: 'grid',
        gridTemplateColumns: '62px minmax(0, 1fr) auto',
        gap: `${spacing.listGap}px`,
        alignItems: 'center',
        minHeight: '52px',
        paddingBlock: `${spacing.listGap}px`,
        borderTop: `1px solid ${colorsV2.line}`,
      }}
    >
      <GradeText route={route} style={typeV2.guideRowGrade} />
      <span style={{ ...stack(spacing.micro), minWidth: 0 }}>
        <span style={{ ...typeV2.guideRowName, overflowWrap: 'anywhere' }}>{route.name}</span>
        {small === '' ? null : <span style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted }}>{small}</span>}
      </span>
      <ChevronRightIcon color={colorsV2.txtMuted} />
    </button>
  )
}

export function WallPane({
  guideName,
  wall,
  week,
  now,
  onUp,
  onOpenRoute,
}: {
  guideName: string
  wall: GuidebookWall
  week: WeekInput
  /** The crag's reading now, drawn under the wall's name. */
  now: ReactNode
  onUp: () => void
  onOpenRoute: (routeId: string) => void
}) {
  const ordered = leftToRight(wall)
  const [sort, setSort] = useState<SortMode>(ordered === null ? 'grade' : 'position')
  const [kind, setKind] = useState<KindFilter>('all')
  const [showAll, setShowAll] = useState(false)

  const counts = kindCounts(wall.routes)
  // A kind every route on the wall shares would filter to the same list as All.
  const kinds = FILTER_KINDS.filter((k) => counts[k] > 0 && counts[k] < wall.routes.length)
  const base = sort === 'position' && ordered !== null ? ordered : sortByGrade(wall.routes)
  const shown = filterByKind(base, kind)
  const visible = showAll ? shown : shown.slice(0, FIRST_ROWS)
  const routeCount = `${wall.routes.length} ${wall.routes.length === 1 ? 'route' : 'routes'}`

  // No marks until the logbook has loaded, rather than every route briefly unticked.
  const logbook = useLogbook()
  // An attempt is logged but not climbed, so it is not "ticked".
  const ticked = new Set(logbook.data?.ticks.filter((t) => t.style !== 'attempt').map((t) => t.route_id) ?? [])
  const todo = new Set(logbook.data?.todos ?? [])
  const markerFor = (id: string): string | null => (ticked.has(id) ? 'ticked' : todo.has(id) ? 'to-do' : null)

  return (
    <>
      <GuideCard title={null}>
        <Crumb label={`${guideName} guidebook`} onClick={onUp} />
        {/* No coordinates: OpenBeta's point for a wall is wrong on the ground (owner, 2026-09-29). */}
        <h2 style={typeV2.guideTitle}>{wall.name}</h2>
        {now}
      </GuideCard>

      <GuideCard title="This week" aside="the crag's reading, not this wall's">
        <WeekStrip week={week} />
      </GuideCard>

      <PositionCard wall={wall} />

      <GuideCard title="Grades" aside={routeCount}>
        <GradeHistogram routes={wall.routes} />
      </GuideCard>

      <GuideCard title="Routes" aside={null}>
        <div style={{ ...row(spacing.tight), flexWrap: 'wrap' }}>
          <button type="button" aria-pressed={kind === 'all'} onClick={() => setKind('all')} style={{ ...choicePill(kind === 'all'), ...typeV2.dayPick }}>
            All
          </button>
          {kinds.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} style={{ ...choicePill(kind === k), ...typeV2.dayPick }}>
              {ROUTE_KIND_LABELS[k]}
            </button>
          ))}
          <span style={{ flex: '1 1 auto' }} />
          {ordered === null ? null : (
            <button
              type="button"
              aria-pressed={sort === 'position'}
              onClick={() => setSort('position')}
              style={{ ...choicePill(sort === 'position'), ...typeV2.dayPick }}
            >
              Left → right
            </button>
          )}
          <button type="button" aria-pressed={sort === 'grade'} onClick={() => setSort('grade')} style={{ ...choicePill(sort === 'grade'), ...typeV2.dayPick }}>
            Grade ↑
          </button>
        </div>
        <div style={stack(0)}>
          {visible.map((route) => (
            <RouteRow key={route.id} route={route} marker={markerFor(route.id)} onOpen={() => onOpenRoute(route.id)} />
          ))}
        </div>
        {visible.length < shown.length ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            style={{ ...bareButton, ...typeV2.dayPick, color: colorsV2.brandInk, textAlign: 'center', padding: `${spacing.cellPad}px 0` }}
          >
            Show all {shown.length} routes
          </button>
        ) : null}
      </GuideCard>
    </>
  )
}
