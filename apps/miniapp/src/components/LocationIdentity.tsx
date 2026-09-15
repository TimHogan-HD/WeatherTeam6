import { colors, spacing } from '@weatherteam6/design/tokens'
import { formatElevationFt, type Location } from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { card, stack } from '../theme/styles.js'

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

const ASPECT_WORDS: Readonly<Record<string, string>> = {
  N: 'north',
  NE: 'north-east',
  E: 'east',
  SE: 'south-east',
  S: 'south',
  SW: 'south-west',
  W: 'west',
  NW: 'north-west',
}

/**
 * `aspect` is stored as free text and reaches us as whatever was entered. A
 * compass point is shown as-is in the grid (where the key already says
 * "Aspect"); anything else is passed through verbatim rather than guessed at.
 */
function aspectValue(aspect: string): string {
  const key = aspect.toUpperCase()
  return ASPECT_WORDS[key] === undefined ? aspect : key
}

/**
 * 4 decimal places is about 11 m, which is the precision a crag coordinate is
 * worth. More digits assert an accuracy a hand-entered point does not have.
 */
function coordValue(lat: number, lon: number): string {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`
}

type Fact = { key: string; value: string; mono?: boolean }

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

  out.push({ key: 'Coordinates', value: coordValue(location.lat, location.lon), mono: true })

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

export type LocationIdentityProps = {
  location: Location
  /**
   * The Hourly tab condenses this to a single line, so the charts get the
   * screen. Nothing is hidden behind a tap — it just stops competing.
   */
  condensed?: boolean
}

export function LocationIdentity({ location, condensed = false }: LocationIdentityProps) {
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

  if (rows.length === 0) return null

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
          <div key={fact.key} style={{ ...stack(0), minWidth: 0 }}>
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
    </section>
  )
}
