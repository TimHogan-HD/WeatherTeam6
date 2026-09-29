import { colorsV2, gradeBoulder, gradeScale, radius, spacing } from '@weatherteam6/design/tokens'
import {
  GRADE_BANDS,
  GRADE_BAND_LONG,
  GRADE_BAND_SHORT,
  bandCounts,
  gradeBand,
  gradeLabel,
  type GradeBand,
  type GuidebookRoute,
} from '@weatherteam6/types'
import { typeV2, withOpacity } from '../../theme/tokens.css.js'
import { row, stack } from '../../theme/styles.js'

/**
 * Route difficulty, drawn, in the Figma's grade colours (`gradeScale`, owner
 * decision 2026-09-29) with boulders off the ramp in violet — a V grade is not
 * a sixth step on the YDS scale. **Every mark has its count or its grade
 * printed as text beside it**, which is the condition on which the grade marks
 * may share the conditions ladder's lime, amber and red: colour never carries
 * the reading alone.
 */

export function gradeColor(band: GradeBand): string {
  const i = GRADE_BANDS.indexOf(band)
  return band === 'boulder' ? gradeBoulder : (gradeScale[i] ?? gradeBoulder)
}

/** The bands a set of routes actually uses — a crag with no boulders draws no boulder column. */
function usedBands(counts: Record<GradeBand, number>): GradeBand[] {
  return GRADE_BANDS.filter((b) => b !== 'boulder' || counts[b] > 0)
}

const HIST_H = 80
/** Every non-empty band gets a visible bar, so a 1 is not mistaken for a 0. */
const BAR_MIN_H = 3

/** The crag's routes per band, as columns with the count over each. */
export function GradeHistogram({ routes }: { routes: readonly GuidebookRoute[] }) {
  const counts = bandCounts(routes)
  const bands = usedBands(counts)
  const max = Math.max(1, ...bands.map((b) => counts[b]))
  const summary = bands.map((b) => `${GRADE_BAND_LONG[b]}: ${counts[b]}`).join(', ')
  return (
    <div role="img" aria-label={`Routes by grade. ${summary}.`} style={{ ...row(spacing.listGapSm), alignItems: 'flex-end' }}>
      {bands.map((band) => {
        const n = counts[band]
        const h = n === 0 ? 0 : Math.max(BAR_MIN_H, Math.round((n / max) * HIST_H))
        return (
          <div key={band} aria-hidden style={{ ...stack(spacing.tight), flex: '1 1 0', minWidth: 0, alignItems: 'center' }}>
            <span style={{ ...typeV2.cellFigure, color: colorsV2.txt1 }}>{n}</span>
            <div style={{ height: `${HIST_H}px`, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
              <div
                style={{
                  width: '100%',
                  height: `${h}px`,
                  backgroundColor: gradeColor(band),
                  borderRadius: `${radius.chip}px ${radius.chip}px 0 0`,
                }}
              />
            </div>
            <span style={{ ...typeV2.axisTick, color: colorsV2.txtMuted, whiteSpace: 'nowrap' }}>
              {GRADE_BAND_SHORT[band]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * A wall's routes as one bar split by band, proportional to count. **Only
 * graded routes are in it**: an ungradeable route has no band to be drawn in,
 * and stretching the others to cover it would misstate every share.
 */
export function GradeBar({ routes, height = 6 }: { routes: readonly GuidebookRoute[]; height?: number }) {
  const counts = bandCounts(routes)
  const bands = GRADE_BANDS.filter((b) => counts[b] > 0)
  if (bands.length === 0) return null
  return (
    <div aria-hidden style={{ display: 'flex', gap: `${spacing.micro}px`, height: `${height}px`, width: '100%' }}>
      {bands.map((band) => (
        <div
          key={band}
          style={{
            flex: `${counts[band]} 1 0`,
            minWidth: `${spacing.micro}px`,
            backgroundColor: gradeColor(band),
            borderRadius: `${radius.full}px`,
          }}
        />
      ))}
    </div>
  )
}

/** The key under a bar. With `counts`, each entry carries its number, which is how a wall's bar is read. */
export function GradeLegend({ routes, withCounts }: { routes: readonly GuidebookRoute[]; withCounts: boolean }) {
  const counts = bandCounts(routes)
  const bands = withCounts ? GRADE_BANDS.filter((b) => counts[b] > 0) : usedBands(counts)
  return (
    <div style={{ ...row(spacing.listGapLg), flexWrap: 'wrap', rowGap: `${spacing.tight}px` }}>
      {bands.map((band) => (
        <span key={band} style={row(spacing.tight)}>
          <span
            aria-hidden
            style={{ width: '8px', height: '8px', borderRadius: `${radius.full}px`, backgroundColor: gradeColor(band) }}
          />
          <span style={{ ...typeV2.chip, color: colorsV2.legend }}>
            {withCounts ? `${GRADE_BAND_SHORT[band]} ${counts[band]}` : GRADE_BAND_LONG[band]}
          </span>
        </span>
      ))}
    </div>
  )
}

/**
 * A route's grade in a tinted chip. The tint is its band; the grade itself is
 * text ink, so it reads the same whatever the tint. An ungradeable route is a
 * dash in a neutral well — the gap is stated, not dressed as a grade.
 */
export function GradeChip({ route, minWidth = 56 }: { route: GuidebookRoute; minWidth?: number }) {
  const band = gradeBand(route)
  const label = gradeLabel(route)
  return (
    <span
      style={{
        ...typeV2.rowPill,
        color: colorsV2.txt1,
        backgroundColor: band === null ? colorsV2.raised : withOpacity(gradeColor(band), 0.22),
        borderRadius: `${radius.chipMd}px`,
        padding: `${spacing.tight}px ${spacing.listGap}px`,
        minWidth: `${minWidth}px`,
        textAlign: 'center',
        flex: '0 0 auto',
      }}
    >
      {label ?? '—'}
    </span>
  )
}
