import type { ReactNode } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import {
  gradeLabel,
  kindsLine,
  leftToRight,
  routeNeighbours,
  type GuidebookRoute,
  type GuidebookWall,
} from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { bareButton, row, stack } from '../../theme/styles.js'
import { mountainProjectHref, mountainProjectUrl, openBetaClimbUrl } from '../../lib/guidebookView.js'
import { LogbookCard } from './LogbookCard.js'
import { Crumb, GuideCard } from './parts.js'
import { GradeText } from './WallPane.js'

/**
 * One route, inside the Crag tab (the mockup's route screen): its grade, what
 * OpenBeta records about it, the reader's logbook for it, its neighbours on
 * the wall and its beta. The frame's *Climb it this week* is the wall's: it is
 * the crag's reading, not the route's.
 */

const SAFETY_WORDS = { PG: 'PG', R: 'R — runout', X: 'X — a fall may be fatal' } as const

function Fact({ label, value, missing = 'Not recorded' }: { label: string; value: string | null; missing?: string }) {
  return (
    <div style={{ ...stack(spacing.micro), minWidth: 0 }}>
      <span style={typeV2.statLabel}>{label}</span>
      <span style={{ ...typeV2.weekScore, color: value === null ? colorsV2.txtMuted : colorsV2.txt1, overflowWrap: 'anywhere' }}>
        {value ?? missing}
      </span>
    </div>
  )
}

/** An external page, opened beside the app rather than replacing it. */
function OutLink({ href, children }: { href: string; children: ReactNode }) {
  // An `intent:` link hands off to an app; opened in a new tab first, some
  // Android browsers leave that tab blank behind it.
  const inPlace = href.startsWith('intent:')
  return (
    <a
      href={href}
      {...(inPlace ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
      style={{
        ...typeV2.dayPick,
        color: colorsV2.txt1,
        backgroundColor: colorsV2.surface,
        borderRadius: `${radius.full}px`,
        padding: `${spacing.tight}px ${spacing.cellPad}px`,
        textDecoration: 'none',
      }}
    >
      {children} ↗
    </a>
  )
}

function OnTheWall({ wall, route, onOpenRoute }: { wall: GuidebookWall; route: GuidebookRoute; onOpenRoute: (id: string) => void }) {
  const n = routeNeighbours(wall, route.id)
  if (n === null) return null
  const ordered = leftToRight(wall) ?? []
  return (
    <GuideCard title="On the wall" aside="Left → right">
      <div style={stack(0)}>
        {n.routes.map((r) => {
          const here = r.id === route.id
          const position = ordered.findIndex((o) => o.id === r.id) + 1
          const inner = (
            <>
              <span style={{ ...typeV2.lineLabel, flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere', ...(here ? { color: colorsV2.txt1, fontWeight: 600 } : {}) }}>
                {position}. {r.name}
                {here ? <span style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted }}> · this route</span> : null}
              </span>
              <GradeText route={r} style={typeV2.guideRowGrade} />
            </>
          )
          const box = { ...row(spacing.cellPad), minHeight: '44px', borderTop: `1px solid ${colorsV2.line}` }
          return here ? (
            <div key={r.id} aria-current="true" style={box}>
              {inner}
            </div>
          ) : (
            <button key={r.id} type="button" onClick={() => onOpenRoute(r.id)} style={{ ...bareButton, ...box }}>
              {inner}
            </button>
          )
        })}
      </div>
    </GuideCard>
  )
}

export function RoutePane({
  wall,
  routeId,
  onUp,
  onOpenRoute,
}: {
  wall: GuidebookWall
  routeId: string
  onUp: () => void
  onOpenRoute: (routeId: string) => void
}) {
  const route = wall.routes.find((r) => r.id === routeId) ?? null
  if (route === null) {
    return (
      <GuideCard title={null}>
        <Crumb label={wall.name} onClick={onUp} />
        <p style={{ ...typeV2.body, color: colorsV2.txt2 }}>This route isn’t in the guidebook for this location.</p>
      </GuideCard>
    )
  }
  const n = routeNeighbours(wall, route.id)
  const kinds = kindsLine(route.kinds)
  const mp = mountainProjectUrl(route.mp_id, 'route')
  const grade = gradeLabel(route)
  return (
    <>
      <GuideCard title={null}>
        <Crumb label={wall.name} onClick={onUp} />
        {kinds === '' ? null : <span style={typeV2.statLabel}>{kinds}</span>}
        <h2 style={{ ...typeV2.guideTitle, overflowWrap: 'anywhere' }}>{route.name}</h2>
        <div style={{ ...row(spacing.listGapLg), alignItems: 'baseline', flexWrap: 'wrap' }}>
          {grade === null ? (
            <span style={{ ...typeV2.routeGrade, color: colorsV2.txtMuted }}>Ungraded</span>
          ) : (
            <GradeText route={route} style={typeV2.routeGrade} />
          )}
          {route.french === null || route.vscale !== null ? null : (
            <span style={typeV2.lineLabel}>French {route.french}</span>
          )}
        </div>
        {/* Only a position OpenBeta actually establishes. */}
        {n === null ? null : (
          <span style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted }}>
            Route {n.position} of {wall.routes.length}, left to right
          </span>
        )}
      </GuideCard>

      <GuideCard title="Route">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing.cellPad}px ${spacing.sectionGap}px` }}>
          <Fact label="Type" value={kinds === '' ? null : kinds} />
          <Fact label="First ascent" value={route.first_ascent} />
          <Fact label="Protection" value={route.safety === null ? null : SAFETY_WORDS[route.safety]} missing="Not rated" />
        </div>
      </GuideCard>

      <LogbookCard route={route} />

      <OnTheWall wall={wall} route={route} onOpenRoute={onOpenRoute} />

      <GuideCard title="Beta">
        {/* Five Minnesota routes carry a description (2026-10-02). */}
        {route.description === null ? (
          <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>Nothing recorded on OpenBeta yet.</p>
        ) : (
          <p style={{ ...typeV2.body, color: colorsV2.txt1, whiteSpace: 'pre-line' }}>{route.description}</p>
        )}
        <div style={{ ...row(spacing.tight), flexWrap: 'wrap' }}>
          {mp === null ? null : <OutLink href={mountainProjectHref(mp, navigator.userAgent)}>Mountain Project</OutLink>}
          <OutLink href={openBetaClimbUrl(route.id)}>Add beta on OpenBeta</OutLink>
        </div>
      </GuideCard>
    </>
  )
}
