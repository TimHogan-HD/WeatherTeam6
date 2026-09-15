import { colors, radius, spacing } from '@weatherteam6/design/tokens'
import { compassPoint, formatElevationFt, type Location, type Wall } from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { card, row, stack } from '../theme/styles.js'

/**
 * What this place *is* — rock, aspect, wall angle, elevation, coordinates and
 * the rainfall station. The name itself is the page heading, not part of this.
 *
 * Every field is a column the `locations` table has always carried and no
 * screen has ever shown. Aspect and angle are the two that move the score most
 * — a north-facing wall dries differently from a slab — so they belong where
 * they can be seen rather than buried in a config sheet.
 *
 * **Each fact is labelled.** An earlier build rendered them as bare chips, so
 * `8°` and `3,740 ft` sat side by side with nothing saying which was the wall
 * angle. A value whose key is missing is not a shorter label, it is a guess.
 *
 * **A field with no value is omitted, not dashed.** An em dash is the right
 * answer for a *measurement* that is missing — it says the instrument had
 * nothing. These are properties of a saved row: "no rock type" means nobody
 * entered one, and a column of dashes would read as an app that failed to load.
 *
 * There is deliberately **no edit affordance**. Updating a mis-saved location
 * is remove-then-add (§12.4), the bot's `/help` says the same, and adding one
 * here would be a third flow.
 */

/**
 * `aspect` is stored as free text and reaches us as whatever was entered. A
 * compass point is shown as-is in the grid (where the key already says
 * "Aspect"); anything else is passed through verbatim rather than guessed at.
 */
function aspectValue(aspect: string): string {
  const key = aspect.trim().toUpperCase()
  // Uppercase anything shaped like a compass bearing, not only the eight a
  // lookup table would list — otherwise `NE` and `nne` sit in the same column
  // looking like two different kinds of thing. Anything else is passed through
  // untouched rather than guessed at or dropped.
  return /^[NSEW]{1,3}$/.test(key) ? key : aspect
}

/**
 * 4 decimal places is about 11 m, which is the precision a crag coordinate is
 * worth. More digits assert an accuracy a hand-entered point does not have.
 */
function coordValue(lat: number, lon: number): string {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`
}

type Fact = { key: string; value: string; mono?: boolean; wide?: boolean }

function facts(location: Location): Fact[] {
  const out: Fact[] = []

  if (location.is_climbing_location) {
    // `'unknown'` is the column's default and means nobody entered one — an
    // absent value wearing a word, so the omission rule above applies to it.
    if (location.rock_type !== null && location.rock_type !== 'unknown') {
      out.push({ key: 'Rock', value: capitalise(location.rock_type) })
    }
    if (location.aspect !== null) {
      out.push({ key: 'Aspect', value: aspectValue(location.aspect) })
    }
    if (location.cliff_angle !== null) {
      // **"off vert", and the wording is load-bearing.** `conditionsScore.ts`
      // measures `cliff_angle` from vertical — 0 is a vertical wall, 90 a slab,
      // per its own comment that a slab dries 30% slower. Climbers mean the
      // opposite, where 90 is vertical. A bare "8°" would be read backwards by
      // every climber who saw it.
      out.push({ key: 'Angle', value: `${Math.round(location.cliff_angle)}° off vert` })
    }
  }

  if (location.elevation_m !== null) {
    out.push({ key: 'Elevation', value: formatElevationFt(location.elevation_m) })
  }

  out.push({
    key: 'Coordinates',
    value: coordValue(location.lat, location.lon),
    mono: true,
    wide: true,
  })

  // Named only when there is one. The station is what `fetchPrecipHistory`
  // reads for the drying model; a location without one falls back to the
  // gridded archive, and "rainfall from —" would claim a station that does not
  // exist. The sources footer follows the same rule.
  if (location.asos_station !== null) {
    out.push({ key: 'Rain station', value: location.asos_station })
  }

  return out
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * One wall, as a line of the facts the table actually stores.
 *
 * **The angle is named by its band, not by its degrees, and that is a safety
 * decision.** `walls.angle_deg` has no writer anywhere in the repo — no seed,
 * no importer, no UI — so nothing establishes whether it is measured from
 * vertical (the convention `conditionsScore.ts` uses, where 0 is a vertical
 * wall) or from horizontal (what a climber means by "vertical is 90"). Printing
 * "14° off vert" would pick one of those on no evidence, and it is the reading
 * the heaviest component of the score depends on. `angle_band` is a four-value
 * enum the schema defines outright, so it cannot be read backwards.
 */
function wallSummary(wall: Wall): string {
  const parts = [compassPoint(wall.aspectDeg), wall.angleBand]
  if (wall.routeCount !== null && wall.routeCount > 0) {
    parts.push(`${wall.routeCount} route${wall.routeCount === 1 ? '' : 's'}`)
  }
  return parts.filter((p): p is string => p !== null).join(' · ')
}

/**
 * The walls of this crag, as a scrolling strip.
 *
 * **Read-only, and the note says why.** The mockup draws this as a picker whose
 * chips re-score the forecast against the selected wall's own aspect and angle;
 * that is a decided feature and it is not built. A chip that highlights on tap
 * and changes no number would look exactly like the built version — the reader
 * would come away believing the score in front of them was for the wall they
 * picked. Showing the same facts without the affordance says the true thing.
 */
function WallStrip({ walls }: { walls: readonly Wall[] }) {
  return (
    <div
      style={{
        ...stack(spacing.chipGap),
        borderTopStyle: 'solid',
        borderTopWidth: '1px',
        borderTopColor: colors.line,
        paddingTop: `${spacing.listGap}px`,
      }}
    >
      <div style={{ ...row(spacing.chipGapMd), justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={{ ...type.labelSm, color: colors.txt5 }}>Walls</span>
        <span style={{ ...type.labelSm, color: colors.txt5 }}>Score is crag-wide</span>
      </div>
      <div style={{ ...row(spacing.chipGap), overflowX: 'auto' }}>
        {walls.map((wall) => (
          <div
            key={wall.id}
            style={{
              ...stack(0),
              flex: '0 0 auto',
              borderStyle: 'solid',
              borderWidth: '1px',
              borderColor: colors.line,
              borderRadius: `${radius.chip}px`,
              padding: `${spacing.chipGap}px ${spacing.chipGapMd}px`,
            }}
          >
            <span style={{ ...type.calDay, whiteSpace: 'nowrap' }}>{wall.name}</span>
            <span style={{ ...type.labelSm, color: colors.txt5, whiteSpace: 'nowrap' }}>
              {wallSummary(wall)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export type LocationIdentityProps = {
  location: Location
  /**
   * The crag's named walls. Empty for every location today — the table has no
   * writer — and an empty list draws nothing rather than an empty heading.
   */
  walls?: readonly Wall[]
  /**
   * The Hourly tab condenses this to a single line, so the charts get the
   * screen. Nothing is hidden behind a tap — it just stops competing.
   */
  condensed?: boolean
}

export function LocationIdentity({ location, walls = [], condensed = false }: LocationIdentityProps) {
  const rows = facts(location)

  // **The name is not repeated here.** `Screen` already renders it as the page
  // `<h1>` at `type.screenTitle`, directly above this block — the mockup shows
  // it in the card because its device frame only has Telegram's small title
  // bar. Printing it twice, once at 30px and once at 12px, reads as a bug.
  if (condensed) {
    // The three facts that change the score, and nothing else. Coordinates and
    // the station are a tab away rather than gone.
    const summary = rows
      .filter((f) => f.key === 'Rock' || f.key === 'Aspect' || f.key === 'Angle')
      .map((f) => f.value)
    if (summary.length === 0) return null
    return <span style={type.labelSm}>{summary.join(' · ')}</span>
  }

  if (rows.length === 0 && walls.length === 0) return null

  return (
    <section style={{ ...card, ...stack(spacing.cellPad) }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: `${spacing.listGap}px ${spacing.cellPad}px`,
        }}
      >
        {rows.map((fact) => (
          <div
            key={fact.key}
            style={{
              ...stack(0),
              minWidth: 0,
              // **Coordinates get two columns.** One third of a 375px row is
              // about 98px, and `36.1215, -115.4567` at this size needs ~105 —
              // so with `nowrap` and an ellipsis it silently lost digits, which
              // is worse than wrapping and much worse than not showing it.
              ...(fact.wide === true ? { gridColumn: 'span 2' } : {}),
            }}
          >
            <span style={{ ...type.labelSm, color: colors.txt5 }}>{fact.key}</span>
            <span
              style={{
                ...(fact.mono === true
                  ? { ...type.bodySm, color: colors.txt2 }
                  : { ...type.calDay }),
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {fact.value}
            </span>
          </div>
        ))}
      </div>

      {walls.length === 0 ? null : <WallStrip walls={walls} />}
    </section>
  )
}
