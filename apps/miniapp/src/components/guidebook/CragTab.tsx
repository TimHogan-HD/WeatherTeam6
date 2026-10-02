import type { ReactNode } from 'react'
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
import { bareButton, cardV2, row, stack } from '../../theme/styles.js'
import { ChevronRightIcon } from '../Icons.js'
import { NowStrip } from '../ReadingPills.js'
import { InlineError, Skeleton } from '../States.js'
import { GradeBar, GradeHistogram, GradeLegend } from './GradeCharts.js'

/**
 * The Crag tab, from the WT6 Figma "03 · Guidebook Flow" frame: the OpenBeta
 * area and its counts, the crag's readings now, its routes by grade, and its
 * walls A–Z, each opening its own screen. The frame's position strip is not
 * drawn: OpenBeta's wall coordinates are wrong on the ground.
 *
 * **The conditions are the crag's, and the tab says so.** Crag A reads every
 * direction and no wall has a recorded aspect, so a wall cannot honestly be
 * given a reading of its own.
 */

export type CragTabProps = {
  guidebook: {
    data: Guidebook | null | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
  }
  conditions: Conditions | null | undefined
  alerts: readonly WeatherAlert[] | undefined
  alertsPending: boolean
  onOpenOverview: () => void
  onOpenWall: (wallId: string) => void
}

function Card({ title, aside, children }: { title: string; aside: string | null; children: ReactNode }) {
  return (
    <section style={{ ...cardV2, ...stack(spacing.sectionGap) }}>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
        <h2 style={typeV2.cardTitle}>{title}</h2>
        {aside === null ? null : <span style={{ ...typeV2.aside, color: colorsV2.txtMuted }}>{aside}</span>}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ ...stack(spacing.micro), minWidth: 0 }}>
      <span style={{ ...typeV2.factLabel, color: colorsV2.txtMuted }}>{label}</span>
      <span style={{ ...typeV2.cellFigure, color: colorsV2.txt1 }}>{value}</span>
    </div>
  )
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
    <section style={{ ...cardV2, ...stack(spacing.listGap) }}>
      <span style={{ ...typeV2.kicker, color: colorsV2.txtMuted }}>OpenBeta area</span>
      <h2 style={typeV2.cardName}>{guide.crag.name}</h2>
      {guide.crag.path.length === 0 ? null : (
        <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>{guide.crag.path.join(' › ')}</span>
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
          <Stat key={s.label} label={s.label} value={s.value} />
        ))}
      </div>
      {/* Only when it is true: a crag of pure sport routes adds up exactly. */}
      {kindTotal <= guide.crag.route_count ? null : (
        <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>
          Some routes have more than one type.
        </span>
      )}
    </section>
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
        paddingBlock: `${spacing.cellPad}px`,
        borderTop: `1px solid ${colorsV2.line}`,
      }}
    >
      <span style={{ ...stack(spacing.tight), flex: '1 1 auto', minWidth: 0 }}>
        <span style={typeV2.rowTitle}>{wall.name}</span>
        <span style={{ ...typeV2.meta, color: colorsV2.txtMuted }}>
          {range === null ? count : `${count} · ${range}`}
        </span>
        <GradeBar routes={wall.routes} />
      </span>
      <ChevronRightIcon color={colorsV2.txtMuted} />
    </button>
  )
}

export function CragTab(props: CragTabProps) {
  const { guidebook } = props
  if (guidebook.isPending) return <Skeleton height={240} />
  if (guidebook.isError) {
    return <InlineError message="Couldn't load the guidebook." onRetry={guidebook.refetch} />
  }
  const guide = guidebook.data
  if (guide === undefined) return null
  if (guide === null) {
    // An answer, not a failure: say what was looked for and where it looks.
    return (
      <section style={{ ...cardV2, ...stack(spacing.listGap) }}>
        <h2 style={typeV2.cardTitle}>No guidebook for this spot</h2>
        <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>
          No guidebook crag within 1.2 miles. Minnesota only for now.
        </p>
      </section>
    )
  }

  const routes = guide.walls.flatMap((w) => w.routes)
  const many = guide.walls.length > 1

  return (
    <>
      <AreaCard guide={guide} />

      <NowStrip
        label="Now"
        conditions={props.conditions}
        alerts={props.alerts}
        alertsPending={props.alertsPending}
        trailing={
          <button
            type="button"
            onClick={props.onOpenOverview}
            style={{ ...bareButton, width: 'auto', ...typeV2.cardLink }}
          >
            Overview ›
          </button>
        }
      />

      <Card title="Grades" aside={`${routes.length} ${routes.length === 1 ? 'route' : 'routes'}`}>
        <GradeHistogram routes={routes} />
      </Card>

      {/*
        No map and no direction. OpenBeta's wall coordinates put Barn Bluff's
        walls where they are not (owner, 2026-09-29), and a west-to-east order
        read off the same points would be the same error as a list. A–Z claims
        nothing about the ground.
      */}
      <Card title={many ? 'Walls' : 'Wall'} aside={many ? 'A–Z' : null}>
        <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>
          Conditions are for the whole crag, not each wall.
        </p>
        <div style={stack(0)}>
          {guide.walls.map((wall) => (
            <WallRow key={wall.id} wall={wall} onOpen={() => props.onOpenWall(wall.id)} />
          ))}
        </div>
        <GradeLegend routes={routes} withCounts={false} />
      </Card>
    </>
  )
}
