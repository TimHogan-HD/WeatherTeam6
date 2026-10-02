import { useEffect, useRef, type ReactNode } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { HELD_BACK_LABEL, REWETTING_PRECIP_MM, SCORE_MODEL_FACTS, cToFDelta, mmToIn, type RangeF } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { cardV2, stack } from '../theme/styles.js'

/** Where the measurements panel's "How the score works" link lands. */
export const SCORE_EXPLAINER_ID = 'score'
export const SCORE_EXPLAINER_PATH = `/profile#${SCORE_EXPLAINER_ID}`

const clock = (h: number): string => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`

/**
 * **How the score works, in full** — the explanation the measurements panel
 * keeps to one line each (owner, 2026-10-01). Every number it quotes comes from
 * `SCORE_MODEL_FACTS`, which `cragModel.test.ts` pins to the model, or from the
 * reader's own range. Rules only: no reading's factor is printed here either.
 */
export function ScoreExplainer({ rangeF }: { rangeF: RangeF }) {
  const ref = useRef<HTMLElement>(null)
  // A hash link does not scroll a client-side route on its own.
  useEffect(() => {
    if (window.location.hash === `#${SCORE_EXPLAINER_ID}`) ref.current?.scrollIntoView()
  }, [])

  const f = SCORE_MODEL_FACTS
  const high = rangeF === null ? 'the high end of your range' : `your high, ${rangeF.high}°F`
  const low = rangeF === null ? 'the low end of your range' : `your low, ${rangeF.low}°F`
  const condensationF = Math.round(cToFDelta(f.condensationClearMarginC))
  const rewetIn = mmToIn(REWETTING_PRECIP_MM).toFixed(2)

  return (
    <section id={SCORE_EXPLAINER_ID} ref={ref} style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
      <h2 style={typeV2.cardTitle}>How the score works</h2>
      <P>
        The score runs from 0 to 100 for one hour at the crag. It multiplies two things: how dry the rock
        is and how good the friction is. If either one is zero, so is the score.
      </P>

      <Part title="Dryness">
        <P>
          Rain restarts a drying clock. How long the rock takes depends on its type, from a few hours for
          granite to two days for some sandstone. Sun-warmed rock, dry air and wind speed it up, and
          lying snow holds it back.
        </P>
        <P>
          The clock runs on eight walls, one facing each compass direction, and the crag takes the middle
          one, so a single sunny face can’t make the whole crag read dry.
        </P>
        <P>
          The rain is the median of four global forecast models (the middle value each hour), not a
          rain gauge, so a local shower can be missed. Anything under{' '}
          {rewetIn} in an hour doesn’t reset the clock.
        </P>
      </Part>

      <Part title="Friction">
        <P>Friction is an estimate; nothing measures grip. Four things lower it, each gradually:</P>
        <Rule name="Condensation">
          When the rock is within about {condensationF}°F of its dew point, moisture starts to settle on
          it. At the dew point, friction is zero.
        </Rule>
        <Rule name="Heat">Above {high}, friction falls as the air warms.</Rule>
        <Rule name="Cold">Below {low}, it falls as the air cools.</Rule>
        <Rule name="Humidity">Above a dew point of {f.dewStartF}°F, sticky air takes it down.</Rule>
        <P>
          The rock’s temperature is modelled from the forecast’s sun, air and wind for open, flat ground,
          and runs about two hours behind the sun. It’s calculated, not measured.
        </P>
      </Part>

      <Part title={HELD_BACK_LABEL}>
        <P>
          Under Measurements on a crag’s Overview: what’s lowering the score, biggest first.
        </P>
      </Part>

      <Part title="A day’s score and Good hours">
        <P>
          A day’s score is the worst hour of its best {f.dayRunHours}-hour stretch between{' '}
          {clock(f.dayFirstHour)} and {clock(f.dayLastHour)}. Today counts only the hours not yet over, so
          after {clock(f.dayLastHour)} today has no score. Good hours are the day’s longest run of hours
          scoring {f.goodHoursMinScore} or more.
        </P>
      </Part>

      <Part title="When there is no score">
        <P>
          A Severe or Extreme weather warning hides the score and keeps the readings. A forecast hour that
          is missing shows as a gap, never a guess.
        </P>
      </Part>

      <Part title="What it can’t see">
        <P>
          Shade from the terrain, seepage, wind on one wall, and your skin and rubber. These rules are
          estimates and haven’t been tested against real days yet. Use Check this forecast on a crag to
          report a miss.
        </P>
      </Part>
    </section>
  )
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={stack(spacing.listGapSm)}>
      <h3 style={{ ...typeV2.kicker, color: colorsV2.txtMuted }}>{title}</h3>
      {children}
    </div>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p style={typeV2.body}>{children}</p>
}

function Rule({ name, children }: { name: string; children: ReactNode }) {
  return (
    <p style={typeV2.body}>
      <span style={{ color: colorsV2.txt1 }}>{name}.</span> {children}
    </p>
  )
}
