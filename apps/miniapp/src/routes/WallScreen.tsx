import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { colors, colorsV2, spacing } from '@weatherteam6/design/tokens'
import {
  GUIDEBOOK_SOURCE_LABEL,
  ROUTE_KIND_LABELS,
  modelSourceLabel,
  gradeRange,
  kindCounts,
  kindsLine,
  leftToRight,
  sortByGrade,
  type GuidebookRoute,
  type GuidebookWall,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, cardV2, row, stack, wellV2 } from '../theme/styles.js'
import { backTarget, climbPath } from '../lib/backTarget.js'
import { FILTER_KINDS, filterByKind, findWall, type KindFilter } from '../lib/guidebookView.js'
import { cardSummary } from '../lib/locationList.js'
import { useGuidebook } from '../hooks/useGuidebook.js'
import { useLocation } from '../hooks/useLocations.js'
import { useAlerts, useConditions } from '../hooks/useWeather.js'
import { useHourly } from '../hooks/useHourly.js'
import { DetailHeader, coordText } from '../components/DetailHeader.js'
import { ChevronRightIcon } from '../components/Icons.js'
import { NowStrip } from '../components/ReadingPills.js'
import { SourcesFooter } from '../components/SourcesFooter.js'
import { WeekCard } from '../components/guidebook/WeekCard.js'
import { InlineError, Skeleton } from '../components/States.js'
import { GradeBar, GradeChip, GradeLegend } from '../components/guidebook/GradeCharts.js'

/**
 * `/location/:id/wall/:wallId` — one wall of the crag, from the WT6 Figma
 * "v2 Dark — Wall" frame: the crag's readings now, the wall's grades, and its
 * routes, filterable by kind and sorted by grade or left to right.
 *
 * **Left to right is offered only where OpenBeta establishes it** — a third of
 * Minnesota's walls have every route at one position or none — and the list
 * opens on it when it is, because that is how a climber walks a wall.
 */

/** How many rows show before "Show all". */
const FIRST_ROWS = 15

type SortMode = 'grade' | 'position'

function Chip({ label, count, selected, onSelect }: { label: string; count: number | null; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        ...bareButton,
        ...wellV2,
        ...row(spacing.tight),
        width: 'auto',
        flex: '0 0 auto',
        padding: `${spacing.listGapSm}px ${spacing.cellPad}px`,
        ...(selected ? { backgroundColor: colorsV2.raised, borderColor: colorsV2.txtMuted } : {}),
      }}
    >
      <span style={{ ...typeV2.controlValue, color: selected ? colorsV2.txt1 : colorsV2.txtMuted }}>{label}</span>
      {count === null ? null : <span style={{ ...typeV2.chip, color: colorsV2.txtMuted }}>{count}</span>}
    </button>
  )
}

function RouteRow({ route, onOpen }: { route: GuidebookRoute; onOpen: () => void }) {
  const kinds = kindsLine(route.kinds)
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        ...bareButton,
        ...row(spacing.listGapLg),
        paddingBlock: `${spacing.cellPad}px`,
        borderBottom: `1px solid ${colorsV2.line}`,
      }}
    >
      <GradeChip route={route} />
      <span style={{ ...stack(spacing.micro), flex: '1 1 auto', minWidth: 0 }}>
        <span style={{ ...typeV2.rowTitle, overflowWrap: 'anywhere' }}>{route.name}</span>
        {kinds === '' ? null : <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>{kinds}</span>}
      </span>
      <ChevronRightIcon color={colorsV2.txtMuted} />
    </button>
  )
}

/** What OpenBeta lacks for every route on this wall — said once, in the footer, not as a blank per row. */
function missingNote(wall: GuidebookWall): string {
  const noDescription = wall.routes.every((r) => r.description === null)
  // Lengths and bolt counts are absent across every Minnesota route (measured
  // 2026-09-28), so the snapshot does not carry them at all.
  return `Lengths, bolt counts${noDescription ? ' and descriptions' : ''} are not recorded in OpenBeta for this wall.`
}

function WallBody({ locationId, wall }: { locationId: string; wall: GuidebookWall }) {
  const navigate = useNavigate()
  const ordered = leftToRight(wall)
  const [sort, setSort] = useState<SortMode>(ordered === null ? 'grade' : 'position')
  const [kind, setKind] = useState<KindFilter>('all')
  const [showAll, setShowAll] = useState(false)

  const location = useLocation(locationId)
  const conditions = useConditions(locationId, location.data?.is_climbing_location)
  const alerts = useAlerts(locationId)
  const summary = cardSummary(conditions.data, alerts.data, alerts.isPending)
  const hourly = useHourly(locationId)
  const goodHoursSource = modelSourceLabel(hourly.data?.readings?.model ?? null)

  const counts = kindCounts(wall.routes)
  // A kind every route on the wall shares would filter to the same list as All.
  const kinds = FILTER_KINDS.filter((k) => counts[k] > 0 && counts[k] < wall.routes.length)
  const base = sort === 'position' && ordered !== null ? ordered : sortByGrade(wall.routes)
  const shown = filterByKind(base, kind)
  const visible = showAll ? shown : shown.slice(0, FIRST_ROWS)
  const range = gradeRange(wall.routes)

  return (
    <>
      <NowStrip
        label="Crag now"
        conditions={conditions.data}
        alerts={alerts.data}
        alertsPending={alerts.isPending}
        trailing={
          summary?.window === null || summary?.window === undefined ? null : (
            <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>
              {summary.window.label} · {summary.window.value.toLowerCase()}
            </span>
          )
        }
      />

      <WeekCard locationId={locationId} />

      <section style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
        <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
          <h2 style={typeV2.cardTitle}>Grades</h2>
          {range === null ? null : <span style={{ ...typeV2.chartValue, color: colorsV2.txtMuted }}>{range}</span>}
        </div>
        <GradeBar routes={wall.routes} height={10} />
        <GradeLegend routes={wall.routes} withCounts />
      </section>

      <div style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
        <Chip label="All" count={wall.routes.length} selected={kind === 'all'} onSelect={() => setKind('all')} />
        {kinds.map((k) => (
          <Chip key={k} label={ROUTE_KIND_LABELS[k]} count={counts[k]} selected={kind === k} onSelect={() => setKind(k)} />
        ))}
        {ordered === null ? null : (
          <button
            type="button"
            onClick={() => setSort(sort === 'grade' ? 'position' : 'grade')}
            style={{ ...bareButton, width: 'auto', marginLeft: 'auto', ...typeV2.cardLink }}
          >
            {sort === 'grade' ? 'Grade ↑' : 'Left → right'}
          </button>
        )}
      </div>

      <section style={{ ...cardV2, ...stack(0), paddingBlock: `${spacing.tight}px` }}>
        {visible.map((route) => (
          <RouteRow key={route.id} route={route} onOpen={() => void navigate(climbPath(locationId, wall.id, route.id))} />
        ))}
        {visible.length < shown.length ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            style={{ ...bareButton, ...typeV2.cardLink, textAlign: 'center', padding: `${spacing.cardPad}px 0` }}
          >
            Show all {shown.length} routes
          </button>
        ) : null}
      </section>

      <SourcesFooter
        sources={[
          `Routes and grades: ${GUIDEBOOK_SOURCE_LABEL}. ${missingNote(wall)}`,
          // Named from the response the week card drew, and only once it did.
          goodHoursSource === null ? '' : `Good hours: ${goodHoursSource}, read for the whole crag`,
        ]}
      />
    </>
  )
}

export function WallScreen() {
  const navigate = useNavigate()
  const { id = '', wallId = '' } = useParams<{ id: string; wallId: string }>()
  const location = useLocation(id)
  const guidebook = useGuidebook(id, location.data?.is_climbing_location)
  const found = guidebook.data == null ? null : findWall(guidebook.data, wallId)

  const back = backTarget({ route: 'wall', locationId: id })
  const backLabel = location.data === undefined ? 'Crag' : `${location.data.name} · Crag`

  const heading =
    found === null || guidebook.data == null
      ? { eyebrow: null, title: null, meta: null }
      : {
          // No "Wall n of m": the walls are listed A–Z, so a count along them
          // would read as a position on the crag.
          eyebrow: guidebook.data.crag.name,
          title: found.wall.name,
          meta: [
            found.wall.lat === null || found.wall.lon === null ? null : coordText(found.wall.lat, found.wall.lon),
            `${found.wall.routes.length} ${found.wall.routes.length === 1 ? 'route' : 'routes'}`,
          ]
            .filter((p) => p !== null)
            .join(' · '),
        }

  const content =
    location.isPending || guidebook.isPending ? (
      <Skeleton height={240} />
    ) : location.isError ? (
      <InlineError message="Couldn't load this location." onRetry={() => void location.refetch()} />
    ) : guidebook.isError ? (
      <InlineError message="Couldn't load the guidebook." onRetry={() => void guidebook.refetch()} />
    ) : found === null ? (
      // A stale link — the snapshot was re-pulled without this wall, or the
      // location moved. Say so and point back rather than rendering nothing.
      <p style={{ ...typeV2.body, color: colors.txt2 }}>This wall isn’t in the guidebook for this location.</p>
    ) : (
      <WallBody locationId={id} wall={found.wall} />
    )

  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <DetailHeader heading={heading} backLabel={backLabel} onBack={() => void navigate(back.to)} tabs={null} />
      <div
        style={{
          ...stack(spacing.listGapLg),
          padding: `${spacing.sectionGap}px`,
          paddingBottom: `${spacing.bottomInset + spacing.sectionGap}px`,
        }}
      >
        {content}
      </div>
    </main>
  )
}
