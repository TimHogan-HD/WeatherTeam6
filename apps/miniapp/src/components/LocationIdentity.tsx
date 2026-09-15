import { spacing } from '@weatherteam6/design/tokens'
import { formatElevationFt, type Location } from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { card, row, stack } from '../theme/styles.js'

/**
 * What this place *is* — rock, aspect, wall angle, elevation, coordinates and
 * the rainfall station.
 *
 * Every field is a column the `locations` table has always carried and no
 * screen has ever shown. They are the inputs the conditions score is computed
 * from, so a reader who disagrees with a score can see what it was told.
 *
 * **A field with no value is omitted, not dashed.** An em dash is the right
 * answer for a *measurement* that is missing — it says the instrument had
 * nothing. These are properties of a saved row: "no rock type" means nobody
 * entered one, and a column of dashes would read as an app that failed to load
 * rather than as a record that was never filled in.
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
 * compass point becomes words; anything else is passed through verbatim rather
 * than guessed at or dropped.
 */
function aspectLine(aspect: string): string {
  const word = ASPECT_WORDS[aspect.toUpperCase()]
  return word === undefined ? `Faces ${aspect}` : `Faces ${word}`
}

/**
 * 4 decimal places is about 11 m, which is the precision a crag coordinate is
 * worth. More digits assert an accuracy a hand-entered point does not have.
 */
function coordLine(lat: number, lon: number): string {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`
}

function facts(location: Location): string[] {
  const out: string[] = []

  if (location.is_climbing_location) {
    // Rock type drives the drying model's maximum drying hours, so it belongs
    // first for a crag and is meaningless for a city.
    //
    // `'unknown'` is the column's default and means nobody entered one — it is
    // an absent value wearing a word, and the rule above applies to it. Shown,
    // it renders as a bare "Unknown" chip beside the elevation, which reads as
    // a field that failed to load rather than one never filled in. (The drying
    // model still uses it; this is about the chip, not the score.)
    if (location.rock_type !== null && location.rock_type !== 'unknown') {
      out.push(capitalise(location.rock_type))
    }
    if (location.aspect !== null) out.push(aspectLine(location.aspect))
    if (location.cliff_angle !== null) out.push(`${Math.round(location.cliff_angle)}° wall`)
  }

  if (location.elevation_m !== null) out.push(formatElevationFt(location.elevation_m))

  return out
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export type LocationIdentityProps = {
  location: Location
  /**
   * The Hourly tab condenses this to its two essential lines, so the charts do
   * not compete with a block the reader has already read.
   */
  condensed?: boolean
}

export function LocationIdentity({ location, condensed = false }: LocationIdentityProps) {
  const chips = facts(location)
  const coords = coordLine(location.lat, location.lon)

  if (condensed) {
    return (
      <section style={stack(spacing.micro)}>
        <span style={type.bodySm}>{[...chips, coords].join(' · ')}</span>
      </section>
    )
  }

  return (
    <section style={{ ...card, ...stack(spacing.cellPad) }}>
      {chips.length === 0 ? null : (
        <div style={{ ...row(spacing.chipGapMd), flexWrap: 'wrap' }}>
          {chips.map((fact) => (
            <span key={fact} style={type.calDay}>
              {fact}
            </span>
          ))}
        </div>
      )}

      <div style={stack(spacing.micro)}>
        <span style={type.bodySm}>{coords}</span>
        {/*
          Named only when there is one. The station is what `fetchPrecipHistory`
          reads for the drying model; a location without one falls back to the
          gridded archive, and saying "rainfall from —" would claim a station
          that does not exist. The sources footer is the same rule.
        */}
        {location.asos_station === null ? null : (
          <span style={type.bodySm}>Rainfall from {location.asos_station}</span>
        )}
      </div>
    </section>
  )
}
