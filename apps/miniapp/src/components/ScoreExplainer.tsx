import { useEffect, useRef, type ReactNode } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import {
  HELD_BACK_LABEL,
  SCORE_MODEL_FACTS,
  cToFDelta,
  type RangeF,
  type RockType,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { cardV2, stack } from '../theme/styles.js'
import { Sect } from './charts/liquid.js'
import { DayScoreExample, DryingChart, GripBand, ScoreEquation } from './ScoreExplainerCharts.js'

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

  return (
    <section id={SCORE_EXPLAINER_ID} ref={ref} style={{ ...cardV2, ...stack(spacing.listGap) }}>
      <Sect title="How the score works" />
      <ScoreExplainerParts rangeF={rangeF} />
    </section>
  )
}

/**
 * The explanation's parts, for Profile's card and the Overview's fold-out.
 * `rockType` picks the crag's own rock out in the drying chart; Profile has none.
 */
export function ScoreExplainerParts({ rangeF, rockType = null }: { rangeF: RangeF; rockType?: RockType | null }) {
  const f = SCORE_MODEL_FACTS
  const condensationF = Math.round(cToFDelta(f.condensationClearMarginC))

  return (
    <>
      <P>
        The score rates one hour at the crag from 0 to 100. It multiplies two things, so if either one is zero, so
        is the score.
      </P>
      <ScoreEquation />

      <Part title="Dry rock">
        <P>
          Rain starts a drying clock. A light shower needs a short wait; {f.fullSoakIn}&quot; or more needs the
          rock’s full drying time below. Sun, dry air and wind speed it up, but rock that is weak when wet never
          dries faster than the clock on the wall.
        </P>
        <DryingChart rockType={rockType} />
        <Note>Hours after a soaking, from climbers’ rules of thumb. Nobody has measured them.</Note>
      </Part>

      <Part title="Good grip">
        <P>
          Grip is an estimate. It’s full inside your temperature range and fades the further outside it the air
          gets. Muggy air (a dew point over {f.dewStartF}°F) lowers it, and
          so does rock within about {condensationF}°F of its dew point, where moisture settles on it.
        </P>
        {rangeF === null ? null : <GripBand rangeF={rangeF} />}
      </Part>

      <Part title="A day’s score">
        <P>
          It’s the lowest hour of the day’s best {f.dayRunHours} hours in a row between {clock(f.dayFirstHour)} and{' '}
          {clock(f.dayLastHour)}. Good hours are the longest run scoring {f.goodHoursMinScore} or more. After{' '}
          {clock(f.dayLastHour)}, today has no score.
        </P>
        <DayScoreExample />
        <Note>An example day, not a forecast.</Note>
      </Part>

      <Part title="When it’s missing or wrong">
        <P>
          A Severe or Extreme warning hides the score but keeps the readings, and a missing forecast hour is a gap,
          never a guess. {HELD_BACK_LABEL} on a crag lists what’s lowering its score.
        </P>
        <P>
          The rain is from forecast models, not a gauge, so a local shower can be missed. The score can’t see
          terrain shade, seepage, wind on one wall, or your skin and rubber, and it hasn’t been checked against real
          days yet. Use Check this forecast on a crag to report a miss.
        </P>
      </Part>
    </>
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

function Note({ children }: { children: ReactNode }) {
  return <p style={{ ...typeV2.body, fontSize: '13px', color: colorsV2.txtMuted }}>{children}</p>
}
