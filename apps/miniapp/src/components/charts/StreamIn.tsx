import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { colorsV2, motion } from '@weatherteam6/design/tokens'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js'
import { LIQUID_PX, LIQUID_W } from './liquid.js'

/**
 * A chart's marks arriving left to right behind a glowing bead (owner,
 * 2026-10-21, the motion mockup's variant C). Wraps what a chart draws: a clip
 * uncovers it as the bead rides the first line (`data-line`, from `Tube`), and
 * each rain column (`data-chance`) springs up from its floor as the bead
 * passes. Plays once, on mount. At rest, and always under reduced motion,
 * the clip covers everything and the bead is hidden, so nothing waits on it.
 *
 * Inside a card that pours in (`DetailView`), it starts a step after its card.
 */
export function StreamIn({ height, children }: { height: number; children: ReactNode }) {
  const clipId = useId()
  const haloId = useId()
  const group = useRef<SVGGElement>(null)
  const clip = useRef<SVGRectElement>(null)
  const bead = useRef<SVGGElement>(null)
  const reduced = usePrefersReducedMotion()

  useLayoutEffect(() => {
    const g = group.current
    const rect = clip.current
    const b = bead.current
    // `animate` is the gate: a browser without Web Animations, and jsdom, draw at rest.
    if (reduced || g === null || rect === null || b === null || typeof g.animate !== 'function') return
    return stream(g, rect, b)
  }, [reduced])

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect ref={clip} x={-REACH} y={-REACH} width={LIQUID_W + 2 * REACH} height={height + 2 * REACH} />
        </clipPath>
        <radialGradient id={haloId}>
          <stop offset="0" stopColor={colorsV2.txt1} />
          <stop offset="0.45" stopColor={colorsV2.txt1} stopOpacity={0.9} />
          <stop offset="1" stopColor={colorsV2.txt1} stopOpacity={0} />
        </radialGradient>
      </defs>
      <g ref={group} clipPath={`url(#${clipId})`} data-stream="">
        {children}
      </g>
      <g ref={bead} opacity={0} pointerEvents="none" aria-hidden="true">
        <g>
          <circle r={11} fill={`url(#${haloId})`} opacity={0.45} />
          <circle r={3.6} fill={colorsV2.txt1} />
        </g>
      </g>
    </>
  )
}

/** How far past the viewBox the clip reaches at rest, for labels and glows drawn outside it. */
const REACH = 400
/** The clip runs this far ahead of the bead, so the bead never sits on a cut edge. */
const LEAD = 6
const SAMPLES = 40

type Run = readonly (readonly [number, number])[]

const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2
/** The time fraction at which `easeInOutSine` reaches `f`. */
const timeAt = (f: number) => Math.acos(1 - 2 * f) / Math.PI
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Where this chart sits in a pouring tab's cards, so it waits for its own card. */
function cardStep(g: Element): number {
  const card = g.closest('.wt6-pour > section')
  if (card === null || card.parentElement === null) return 0
  const cards = [...card.parentElement.children].filter((e) => e.tagName === 'SECTION')
  return Math.min(motion.pourSteps - 1, cards.indexOf(card))
}

/** The lead line and any other run of it (a gap splits a line into runs), as points. */
function leadRuns(g: SVGGElement): Run[] {
  const lines = [...g.querySelectorAll<SVGPathElement>('path[data-line]')]
  const lead = lines[0]
  if (lead === undefined) return []
  return lines
    .filter((l) => l.getAttribute('stroke') === lead.getAttribute('stroke'))
    .map((l) => {
      const length = l.getTotalLength()
      return Array.from({ length: SAMPLES + 1 }, (_, i) => {
        const p = l.getPointAtLength((length * i) / SAMPLES)
        return [p.x, p.y] as const
      })
    })
}

function yOn(runs: readonly Run[], x: number): number | null {
  for (const run of runs) {
    const first = run[0]
    const last = run[run.length - 1]
    if (first === undefined || last === undefined || x < first[0] || x > last[0]) continue
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1]
      const b = run[i]
      if (a === undefined || b === undefined || b[0] < x) continue
      return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1)
    }
  }
  return null
}

function stream(g: SVGGElement, rect: SVGRectElement, bead: SVGGElement): () => void {
  const x0 = LIQUID_PX
  const x1 = LIQUID_W - LIQUID_PX
  const delay = motion.streamDelayMs + cardStep(g) * motion.pourStepMs
  const runs = leadRuns(g)
  const setTip = (x: number) => rect.setAttribute('width', String(x + REACH + LEAD))
  const uncover = () => rect.setAttribute('width', String(LIQUID_W + 2 * REACH))

  const columns = [...g.querySelectorAll<SVGGraphicsElement>('[data-chance]')].map((c) => {
    const box = c.getBBox()
    const f = clamp01((box.x + box.width / 2 - x0) / (x1 - x0))
    return c.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], {
      duration: motion.columnRiseMs,
      delay: delay + timeAt(f) * motion.streamMs,
      easing: motion.spring,
      fill: 'backwards',
    })
  })

  let fade: Animation | null = null
  const start = performance.now() + delay
  setTip(x0 - LEAD)
  let frame = requestAnimationFrame(function tick(now) {
    const t = clamp01((now - start) / motion.streamMs)
    const x = x0 + easeInOutSine(t) * (x1 - x0)
    setTip(x)
    const y = t > 0 ? yOn(runs, x) : null
    bead.setAttribute('opacity', y === null ? '0' : '1')
    if (y !== null) bead.setAttribute('transform', `translate(${x} ${y})`)
    if (t < 1) {
      frame = requestAnimationFrame(tick)
      return
    }
    uncover()
    fade = bead.firstElementChild?.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(2.2)' }], {
      duration: motion.beadFadeMs,
      easing: motion.easeOut,
      fill: 'forwards',
    }) ?? null
    if (fade !== null) fade.onfinish = () => bead.setAttribute('opacity', '0')
  })

  return () => {
    cancelAnimationFrame(frame)
    columns.forEach((a) => a.cancel())
    fade?.cancel()
    uncover()
    bead.setAttribute('opacity', '0')
  }
}
