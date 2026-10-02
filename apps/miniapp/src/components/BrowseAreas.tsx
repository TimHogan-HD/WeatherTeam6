import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import type { ClimbingAreaEntry, ClimbingAreaLevel, ClimbingStateSummary } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, row, stack } from '../theme/styles.js'
import { useClimbingAreaLevel, useClimbingStates } from '../hooks/useGeocode.js'
import { ChevronRightIcon } from './Icons.js'
import { InlineError, SkeletonCards } from './States.js'

/** Where browsing has reached: a state's top level when `areaId` is null. */
export type BrowseAt = { state: string; areaId: string | null }

const count = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/**
 * One row: an area to open, or — with nothing inside it — to pick. The two
 * look alike except for the chevron, which only an area that opens carries.
 */
function AreaRow({ title, meta, opens, onPress }: { title: string; meta: string; opens: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        ...bareButton,
        ...row(spacing.listGapLg),
        paddingBlock: `${spacing.cellPad}px`,
        borderTop: `1px solid ${colorsV2.line}`,
      }}
    >
      <span style={{ ...stack(spacing.tight), flex: '1 1 auto', minWidth: 0 }}>
        <span style={typeV2.rowTitle}>{title}</span>
        <span style={{ ...typeV2.meta, color: colorsV2.txtMuted }}>{meta}</span>
      </span>
      {opens ? <ChevronRightIcon color={colorsV2.txtMuted} /> : null}
    </button>
  )
}

const areaMeta = (e: ClimbingAreaEntry): string =>
  [
    count(e.place.climbing_area?.climbs ?? 0, 'climb', 'climbs'),
    e.sub_areas > 0 ? count(e.sub_areas, 'area', 'areas') : null,
  ]
    .filter((v) => v !== null)
    .join(' · ')

/** The states on the search screen, the way into browsing. */
export function BrowseStates({ onOpen }: { onOpen: (at: BrowseAt) => void }) {
  const states = useClimbingStates()
  if (states.isError) {
    return <InlineError message="Couldn't load the climbing areas." onRetry={() => void states.refetch()} />
  }
  if (states.data === undefined) return <SkeletonCards count={2} height={56} />
  return (
    <section style={stack(spacing.listGapSm)} aria-label="Browse climbing areas">
      <h2 style={{ ...typeV2.eyebrow, color: colorsV2.txtMuted, margin: 0 }}>Browse climbing areas</h2>
      <div>
        {states.data.map((s: ClimbingStateSummary) => (
          <AreaRow
            key={s.code}
            title={s.name}
            meta={`${count(s.climbs, 'climb', 'climbs')} · ${count(s.areas, 'area', 'areas')}`}
            opens
            onPress={() => onOpen({ state: s.code, areaId: null })}
          />
        ))}
      </div>
    </section>
  )
}

/**
 * **One level of a state**: where it sits, a button to pick the area itself
 * (none at the state, which is not a place to forecast), and what is inside.
 * Each crumb jumps straight to its level.
 */
export function BrowseLevel({
  at,
  onOpen,
  onJump,
  onPick,
}: {
  at: BrowseAt
  onOpen: (child: ClimbingAreaEntry) => void
  onJump: (trail: BrowseAt[]) => void
  onPick: (entry: ClimbingAreaEntry) => void
}) {
  const level = useClimbingAreaLevel(at.state, at.areaId)
  if (level.isError) return <InlineError message="Couldn't load this area." onRetry={() => void level.refetch()} />
  if (level.data === undefined) return <SkeletonCards count={5} height={56} />
  const data: ClimbingAreaLevel = level.data
  const area = data.area

  // Every crumb rebuilds the trail to its level, so a jump leaves back-steps
  // that match what the crumbs showed. At the state itself there is nothing
  // above it but the search, which is Back.
  const root: BrowseAt = { state: data.state.code, areaId: null }
  const crumbs =
    area === null
      ? []
      : [
          { name: data.state.name, trail: [root] },
          ...data.path.map((p, i) => ({
            name: p.name,
            trail: [root, ...data.path.slice(0, i + 1).map((q) => ({ state: data.state.code, areaId: q.area_id }))],
          })),
        ]

  return (
    <div style={stack(spacing.listGap)}>
      <nav aria-label="Where you are" style={{ ...row(spacing.tight), flexWrap: 'wrap' }}>
        {crumbs.map((c) => (
          // Keyed by the level it jumps to: names can repeat along one path.
          <span key={c.trail.at(-1)?.areaId ?? c.trail.at(-1)?.state} style={row(spacing.tight)}>
            <button
              type="button"
              onClick={() => onJump(c.trail)}
              style={{ ...bareButton, ...typeV2.meta, color: colorsV2.txtMuted, minHeight: 44 }}
            >
              {c.name}
            </button>
            <span aria-hidden="true" style={{ ...typeV2.meta, color: colorsV2.txtMuted }}>
              ›
            </span>
          </span>
        ))}
        <span aria-current="page" style={{ ...typeV2.meta, color: colorsV2.txt1 }}>
          {area?.place.name ?? data.state.name}
        </span>
      </nav>

      {area === null ? null : (
        <button
          type="button"
          onClick={() => onPick(area)}
          style={{ ...bareButton, ...btnPrimary, ...btnPrimaryText, textAlign: 'center' }}
        >
          Add {area.place.name}
        </button>
      )}

      <div>
        {data.children.map((child) => (
          <AreaRow
            key={child.area_id}
            title={child.place.name}
            meta={areaMeta(child)}
            opens={child.sub_areas > 0}
            onPress={() => (child.sub_areas > 0 ? onOpen(child) : onPick(child))}
          />
        ))}
      </div>
    </div>
  )
}
