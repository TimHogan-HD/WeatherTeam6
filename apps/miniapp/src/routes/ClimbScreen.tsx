import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { colors, colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import {
  GUIDEBOOK_SOURCE_LABEL,
  ROUTE_KIND_LABELS,
  gradeLabel,
  kindsLine,
  leftToRight,
  modelSourceLabel,
  routeNeighbours,
  type GuidebookRoute,
  type GuidebookWall,
  type RockLevel,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, cardV2, row, stack, toneColors, wellV2, type ToneName } from '../theme/styles.js'
import { backTarget, climbPath, detailTabPath } from '../lib/backTarget.js'
import { findWall, mountainProjectHref, mountainProjectUrl, openBetaClimbUrl, weekRows } from '../lib/guidebookView.js'
import { findToday } from '../lib/forecast.js'
import { useGuidebook } from '../hooks/useGuidebook.js'
import { useHourly } from '../hooks/useHourly.js'
import { useLocation } from '../hooks/useLocations.js'
import { useForecast } from '../hooks/useWeather.js'
import { DetailHeader } from '../components/DetailHeader.js'
import { SourcesFooter } from '../components/SourcesFooter.js'
import { InlineError, Skeleton } from '../components/States.js'
import { GradeChip } from '../components/guidebook/GradeCharts.js'

/**
 * `/location/:id/wall/:wallId/route/:routeId` — one route, from the WT6 Figma
 * "v2 Dark — Route" frame: its grade, when to climb it this week, what
 * OpenBeta records about it, and its neighbours on the wall.
 *
 * **"Climb it this week" is the crag's reading, and says so.** No wall has a
 * recorded aspect, so a route cannot be given hours of its own; it borrows the
 * Daily tab's windows and dryness word, from the same response.
 */

const ROCK_TONE: Record<RockLevel, ToneName> = { dry: 'good', drying: 'fair', wet: 'poor' }

function Card({ title, link, note, children }: { title: string; link?: ReactNode; note?: string; children: ReactNode }) {
  return (
    <section style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
      <div style={stack(spacing.tight)}>
        <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
          <h2 style={typeV2.cardTitle}>{title}</h2>
          {link}
        </div>
        {note === undefined ? null : <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>{note}</span>}
      </div>
      {children}
    </section>
  )
}

function Fact({ label, value, recorded }: { label: string; value: string; recorded: boolean }) {
  return (
    <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ ...typeV2.factLabel, color: colorsV2.txtMuted, flex: '0 0 auto' }}>{label}</span>
      <span style={{ ...typeV2.factValue, color: recorded ? colorsV2.txt1 : colorsV2.txtMuted, textAlign: 'right' }}>
        {value}
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
        ...wellV2,
        ...typeV2.controlValue,
        color: colorsV2.txt1,
        borderRadius: `${radius.rowV2}px`,
        flex: '1 1 0',
        textAlign: 'center',
        textDecoration: 'none',
        padding: `${spacing.cellPad}px ${spacing.listGap}px`,
      }}
    >
      {children} ›
    </a>
  )
}

const SAFETY_WORDS = { PG: 'PG', R: 'R — runout', X: 'X — a fall may be fatal' } as const

function Hero({ route }: { route: GuidebookRoute }) {
  const grade = gradeLabel(route)
  return (
    <section style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ ...typeV2.heroTemp, color: grade === null ? colorsV2.txtMuted : colorsV2.txt1 }}>
          {grade ?? 'Ungraded'}
        </span>
        {route.french === null || route.vscale !== null ? null : (
          <span style={{ ...stack(spacing.micro), alignItems: 'flex-end' }}>
            <span style={{ ...typeV2.factLabel, color: colorsV2.txtMuted }}>French</span>
            <span style={{ ...typeV2.factValue, color: colorsV2.txt1 }}>{route.french}</span>
          </span>
        )}
      </div>
      {route.kinds.length === 0 ? null : (
        <div style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
          {route.kinds.map((k) => (
            <span
              key={k}
              style={{ ...wellV2, ...typeV2.pillValue, color: colorsV2.txt1, padding: `${spacing.tight}px ${spacing.listGap}px` }}
            >
              {ROUTE_KIND_LABELS[k]}
            </span>
          ))}
        </div>
      )}
      <div style={{ borderTop: `1px solid ${colorsV2.line}`, paddingTop: `${spacing.cellPad}px` }}>
        <Fact label="First ascent" value={route.first_ascent ?? 'Not recorded'} recorded={route.first_ascent !== null} />
      </div>
    </section>
  )
}

function WeekCard({ locationId }: { locationId: string }) {
  const navigate = useNavigate()
  const hourly = useHourly(locationId)
  const forecast = useForecast(locationId)
  const todayDate = findToday(forecast.data)?.forecast_date ?? null
  const link = (
    <button
      type="button"
      onClick={() => void navigate(detailTabPath(locationId, 'hourly'))}
      style={{ ...bareButton, width: 'auto', ...typeV2.cardLink }}
    >
      Hourly ›
    </button>
  )
  const note = 'Good hours at the crag. Wall aspects aren’t recorded, so every route shares the crag’s reading.'

  let body: ReactNode
  if (hourly.isPending || forecast.isPending) body = <Skeleton height={200} />
  else if (hourly.isError) body = <InlineError message="Couldn't load the hour-by-hour forecast." onRetry={() => void hourly.refetch()} />
  else if (todayDate === null) body = <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>No forecast for today yet.</p>
  else {
    const rows = weekRows(hourly.data, todayDate)
    body =
      rows.length === 0 ? (
        <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>No readings for this week yet.</p>
      ) : (
        <div style={stack(0)}>
          {rows.map((r) => {
            const tone = r.rock === null ? null : toneColors(ROCK_TONE[r.rock], 'pill')
            return (
              <div
                key={r.local_date}
                style={{ ...row(spacing.listGapLg), paddingBlock: `${spacing.cellPad}px`, borderTop: `1px solid ${colorsV2.line}` }}
              >
                <span style={{ ...typeV2.rowTitle, width: '52px', flex: '0 0 auto' }}>{r.title}</span>
                <span style={{ ...typeV2.factValue, flex: '1 1 auto', color: r.hours === 'None' ? colorsV2.txtMuted : colorsV2.txt1 }}>
                  {r.hours}
                </span>
                {tone === null || r.rockLabel === null ? null : (
                  <span
                    style={{
                      ...typeV2.pillValue,
                      color: tone.value,
                      backgroundColor: tone.background,
                      borderRadius: `${radius.full}px`,
                      padding: `${spacing.micro}px ${spacing.listGap}px`,
                    }}
                  >
                    {r.rockLabel}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )
  }

  return (
    <Card title="Climb it this week" link={link} note={note}>
      {body}
    </Card>
  )
}

function OnTheWall({ locationId, wall, route }: { locationId: string; wall: GuidebookWall; route: GuidebookRoute }) {
  const navigate = useNavigate()
  const n = routeNeighbours(wall, route.id)
  if (n === null) return null
  const ordered = leftToRight(wall) ?? []
  return (
    <Card title="On the wall" link={<span style={{ ...typeV2.aside, color: colorsV2.txtMuted }}>Left → right</span>}>
      <div style={stack(spacing.tight)}>
        {n.routes.map((r) => {
          const here = r.id === route.id
          const position = ordered.findIndex((o) => o.id === r.id) + 1
          const inner = (
            <>
              <span style={{ ...typeV2.cellHour, color: colorsV2.txtMuted, width: '24px', flex: '0 0 auto' }}>{position}</span>
              <span style={{ ...typeV2.rowTitle, flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere' }}>
                {r.name}
                {here ? <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}> · this route</span> : null}
              </span>
              <GradeChip route={r} minWidth={52} />
            </>
          )
          const box = { ...row(spacing.cellPad), padding: `${spacing.listGap}px ${spacing.cellPad}px`, borderRadius: `${radius.rowV2}px` }
          return here ? (
            <div key={r.id} aria-current="true" style={{ ...box, backgroundColor: colorsV2.raised }}>
              {inner}
            </div>
          ) : (
            <button
              key={r.id}
              type="button"
              onClick={() => void navigate(climbPath(locationId, wall.id, r.id), { replace: true })}
              style={{ ...bareButton, ...box }}
            >
              {inner}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

export function ClimbScreen() {
  const navigate = useNavigate()
  const { id = '', wallId = '', routeId = '' } = useParams<{ id: string; wallId: string; routeId: string }>()
  const location = useLocation(id)
  const guidebook = useGuidebook(id, location.data?.is_climbing_location)
  const hourly = useHourly(id)
  const found = guidebook.data == null ? null : findWall(guidebook.data, wallId)
  const wall = found?.wall ?? null
  const route = wall?.routes.find((r) => r.id === routeId) ?? null
  const position = wall === null || route === null ? null : routeNeighbours(wall, route.id)?.position ?? null

  const back = backTarget({ route: 'climb', locationId: id, wallId })
  const heading =
    wall === null || route === null || guidebook.data == null
      ? { eyebrow: null, title: null, meta: null }
      : {
          eyebrow: `${wall.name} · ${guidebook.data.crag.name}`,
          title: route.name,
          // Only a position OpenBeta actually establishes.
          meta: position === null ? kindsLine(route.kinds) || null : `Route ${position} of ${wall.routes.length}, left to right`,
        }

  const mp = route === null ? null : mountainProjectUrl(route.mp_id, 'route')
  const goodHoursSource = modelSourceLabel(hourly.data?.readings?.model ?? null)

  const content =
    location.isPending || guidebook.isPending ? (
      <Skeleton height={240} />
    ) : location.isError ? (
      <InlineError message="Couldn't load this location." onRetry={() => void location.refetch()} />
    ) : guidebook.isError ? (
      <InlineError message="Couldn't load the guidebook." onRetry={() => void guidebook.refetch()} />
    ) : wall === null || route === null ? (
      <p style={{ ...typeV2.body, color: colors.txt2 }}>This route isn’t in the guidebook for this location.</p>
    ) : (
      <>
        <Hero route={route} />
        <div style={row(spacing.listGap)}>
          {mp === null ? null : <OutLink href={mountainProjectHref(mp, navigator.userAgent)}>Mountain Project</OutLink>}
          <OutLink href={openBetaClimbUrl(route.id)}>Add beta on OpenBeta</OutLink>
        </div>
        <WeekCard locationId={id} />
        <Card title="Route">
          <div style={stack(spacing.listGap)}>
            <Fact
              label="Grade"
              value={[gradeLabel(route), route.vscale === null ? route.french : null].filter((g) => g !== null).join(' · ') || 'Not recorded'}
              recorded={gradeLabel(route) !== null}
            />
            <Fact label="Type" value={kindsLine(route.kinds) || 'Not recorded'} recorded={route.kinds.length > 0} />
            <Fact label="First ascent" value={route.first_ascent ?? 'Not recorded'} recorded={route.first_ascent !== null} />
            {/* OpenBeta carries neither for any Minnesota route (2026-09-28). */}
            <Fact label="Length" value="Not recorded" recorded={false} />
            <Fact label="Bolts" value="Not recorded" recorded={false} />
            <Fact
              label="Protection rating"
              value={route.safety === null ? 'Not rated' : SAFETY_WORDS[route.safety]}
              recorded={route.safety !== null}
            />
          </div>
        </Card>
        <Card title="Beta">
          {route.description === null ? (
            <div style={{ ...stack(spacing.tight), backgroundColor: colorsV2.surface, borderRadius: `${radius.rowV2}px`, padding: `${spacing.cardPad}px`, textAlign: 'center' }}>
              <span style={{ ...typeV2.rowTitle }}>No write-up yet</span>
              <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>
                OpenBeta has no description for this route. It’s an open guidebook anyone can edit — beta added
                there reaches this app at its next guidebook refresh.
              </span>
            </div>
          ) : (
            <p style={{ ...typeV2.body, color: colorsV2.txt1, whiteSpace: 'pre-line' }}>{route.description}</p>
          )}
        </Card>
        <OnTheWall locationId={id} wall={wall} route={route} />
        <SourcesFooter
          sources={[
            `Route: ${GUIDEBOOK_SOURCE_LABEL}, as of ${guidebook.data?.snapshot_date ?? ''}`,
            goodHoursSource === null ? '' : `Good hours: ${goodHoursSource}, read for the whole crag`,
          ]}
        />
      </>
    )

  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <DetailHeader heading={heading} backLabel={wall?.name ?? 'Wall'} onBack={() => void navigate(back.to)} tabs={null} />
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
