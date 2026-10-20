import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import {
  gradeRange,
  kindCounts,
  type Conditions,
  type Guidebook,
  type GuidebookWall,
  type WeatherAlert,
} from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { bareButton, row, stack } from '../../theme/styles.js'
import { cragTabPath, climbPath, wallPath } from '../../lib/backTarget.js'
import { findWall } from '../../lib/guidebookView.js'
import { useNavigate } from '../../hooks/useNavigate.js'
import { ChevronRightIcon } from '../Icons.js'
import { InlineError, Skeleton } from '../States.js'
import { GradeBar, GradeHistogram, GradeLegend } from './GradeCharts.js'
import { Crumb, GuideCard, NowLine, type WeekInput } from './parts.js'
import { WallPane } from './WallPane.js'
import { RoutePane } from './RoutePane.js'

/**
 * The Crag tab, drawn to the hybrid mockup (Phase 4a): the OpenBeta area and
 * its counts, the crag's reading now, its routes by grade, and its walls A–Z.
 * **A wall and a route open inside this tab** (`/location/:id/wall/:wallId`,
 * `…/route/:routeId`), under the crag's switcher and above its dock, as the
 * mockup draws them; a crumb steps back up one level. No wall is placed on a
 * map: OpenBeta's wall coordinates are wrong on the ground.
 *
 * **The conditions are the crag's, and the tab says so.** Crag A reads every
 * direction and no wall has a recorded aspect, so a wall cannot honestly be
 * given a reading of its own.
 */

export type CragTabProps = {
  locationId: string
  guidebook: {
    data: Guidebook | null | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
  }
  /** The wall and route the URL names, or null on the guidebook itself. */
  at: { wallId: string | null; routeId: string | null }
  conditions: Conditions | null | undefined
  alerts: readonly WeatherAlert[] | undefined
  alertsPending: boolean
  week: WeekInput
  onOpenOverview: () => void
}

function AreaCard({ guide }: { guide: Guidebook }) {
  const routes = guide.walls.flatMap((w) => w.routes)
  const kinds = kindCounts(routes)
  const stats = [
    { label: 'Routes', value: guide.crag.route_count },
    { label: 'Walls', value: guide.walls.length },
    { label: 'Sport', value: kinds.sport },
    { label: 'Trad', value: kinds.trad },
    { label: 'Top rope', value: kinds.tr },
    { label: 'Boulder', value: kinds.boulder },
  ].filter((s, i) => i < 2 || s.value > 0)
  const kindTotal = kinds.sport + kinds.trad + kinds.tr + kinds.boulder + kinds.aid + kinds.ice + kinds.mixed
  return (
    <GuideCard title={null}>
      <span style={typeV2.statLabel}>OpenBeta area</span>
      <h2 style={typeV2.guideTitle}>{guide.crag.name}</h2>
      {guide.crag.path.length === 0 ? null : (
        <span style={typeV2.rowSmall}>{guide.crag.path.join(' › ')}</span>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(stats.length, 5)}, 1fr)`,
          gap: `${spacing.listGap}px`,
          paddingTop: `${spacing.tight}px`,
        }}
      >
        {stats.map((s) => (
          <div key={s.label} style={{ ...stack(spacing.micro), minWidth: 0 }}>
            <span style={typeV2.statLabel}>{s.label}</span>
            <span style={typeV2.statFigure}>{s.value}</span>
          </div>
        ))}
      </div>
      {/* Only when it is true: a crag of pure sport routes adds up exactly. */}
      {kindTotal <= guide.crag.route_count ? null : (
        <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>Some routes have more than one type.</span>
      )}
    </GuideCard>
  )
}

function WallRow({ wall, onOpen }: { wall: GuidebookWall; onOpen: () => void }) {
  const range = gradeRange(wall.routes)
  const count = `${wall.routes.length} ${wall.routes.length === 1 ? 'route' : 'routes'}`
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        ...bareButton,
        ...row(spacing.listGapLg),
        minHeight: '52px',
        paddingBlock: `${spacing.cellPad}px`,
        borderTop: `1px solid ${colorsV2.line}`,
      }}
    >
      <span style={{ ...stack(spacing.tight), flex: '1 1 auto', minWidth: 0 }}>
        <span style={typeV2.guideRowName}>{wall.name}</span>
        <span style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted }}>{range === null ? count : `${count} · ${range}`}</span>
        <GradeBar routes={wall.routes} />
      </span>
      <ChevronRightIcon color={colorsV2.txtMuted} />
    </button>
  )
}

function GuideRoot(props: CragTabProps & { guide: Guidebook }) {
  const navigate = useNavigate()
  const { guide } = props
  const routes = guide.walls.flatMap((w) => w.routes)
  const many = guide.walls.length > 1
  const now = (
    <NowLine
      conditions={props.conditions}
      alerts={props.alerts}
      alertsPending={props.alertsPending}
      trailing={<OverviewLink onClick={props.onOpenOverview} />}
      labelled={false}
    />
  )
  return (
    <>
      <AreaCard guide={guide} />

      <GuideCard title="Now" aside="the crag's reading">
        {now}
      </GuideCard>

      <GuideCard title="Grades" aside={`${routes.length} ${routes.length === 1 ? 'route' : 'routes'}`}>
        <GradeHistogram routes={routes} />
      </GuideCard>

      {/*
        No map and no direction. OpenBeta's wall coordinates put Barn Bluff's
        walls where they are not (owner, 2026-09-29), and a west-to-east order
        read off the same points would be the same error as a list. A–Z claims
        nothing about the ground.
      */}
      <GuideCard title={many ? 'Walls' : 'Wall'} aside={many ? 'A–Z' : null}>
        <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>Conditions are for the whole crag, not each wall.</p>
        <div style={stack(0)}>
          {guide.walls.map((wall) => (
            <WallRow key={wall.id} wall={wall} onOpen={() => void navigate(wallPath(props.locationId, wall.id))} />
          ))}
        </div>
        <GradeLegend routes={routes} withCounts={false} />
      </GuideCard>
    </>
  )
}

export function OverviewLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ ...bareButton, ...typeV2.dayPick, width: 'auto', color: colorsV2.brandInk }}>
      Overview ›
    </button>
  )
}

export function CragTab(props: CragTabProps) {
  const navigate = useNavigate()
  const { guidebook, at, locationId } = props
  if (guidebook.isPending) return <Skeleton height={240} />
  if (guidebook.isError) {
    return <InlineError message="Couldn't load the guidebook." onRetry={guidebook.refetch} />
  }
  const guide = guidebook.data
  if (guide === undefined) return null
  if (guide === null) {
    // An answer, not a failure: say what was looked for and where it looks.
    return (
      <GuideCard title="No guidebook for this spot">
        <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>No guidebook crag within 1.2 miles. Minnesota only for now.</p>
      </GuideCard>
    )
  }
  if (at.wallId === null) return <GuideRoot {...props} guide={guide} />

  const toGuide = () => void navigate(cragTabPath(locationId))
  const found = findWall(guide, at.wallId)
  if (found === null) {
    // A stale link: the snapshot was re-pulled without this wall. Say so and point back.
    return (
      <GuideCard title={null}>
        <p style={{ ...typeV2.body, color: colorsV2.txt2 }}>This wall isn’t in the guidebook for this location.</p>
        <Crumb label={`${guide.crag.name} guidebook`} onClick={toGuide} />
      </GuideCard>
    )
  }
  if (at.routeId === null) {
    return (
      <WallPane
        key={found.wall.id}
        guideName={guide.crag.name}
        wall={found.wall}
        week={props.week}
        now={<NowLine conditions={props.conditions} alerts={props.alerts} alertsPending={props.alertsPending} trailing={<OverviewLink onClick={props.onOpenOverview} />} />}
        onUp={toGuide}
        onOpenRoute={(routeId) => void navigate(climbPath(locationId, found.wall.id, routeId))}
      />
    )
  }
  return (
    <RoutePane
      wall={found.wall}
      routeId={at.routeId}
      onUp={() => void navigate(wallPath(locationId, found.wall.id))}
      onOpenRoute={(routeId) => void navigate(climbPath(locationId, found.wall.id, routeId), { replace: true })}
    />
  )
}
