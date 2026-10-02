import { useId, type ReactNode } from 'react'
import { colors, colorsV2, radius, rockSwatchV2, spacing } from '@weatherteam6/design/tokens'
import {
  DRYING_PACE_LABEL,
  WET_STRENGTH_LABEL,
  rockGuide,
  rockTypeLabel,
  type DryingPace,
  type RockGuide,
  type RockSwatch,
  type RockTexture,
  type WetStrength,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { cardV2, row, stack, wellV2 } from '../theme/styles.js'
import { CheckIcon, CrossIcon, RainIcon, SunIcon } from './Icons.js'

/**
 * The Rock tab's field guide to the crag's rock: a textured header naming it,
 * two gauges (how long rain keeps it off-limits, what water does to its
 * strength), how it formed and made its holds, rain and sun, and how to look
 * after it. The words are `rockGuide` in `packages/types`.
 *
 * **It is about the rock type, not a reading of this crag**, and the last line
 * says so. Nothing here changes with the weather; the live drying reading is
 * the Overview's and the Precip tab's (owner, 2026-09-30, took the drying card
 * off this tab).
 */

// ─────────────────────────────────────────────
// The header art — a stone texture per rock family
// ─────────────────────────────────────────────

const ART_W = 360
const ART_H = 124

/** A small seeded generator, so a rock draws the same texture on every render. */
function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const SEED: Record<RockTexture, number> = {
  crystalline: 11,
  bedded: 23,
  columnar: 37,
  vesicular: 41,
  banded: 53,
  sheeted: 67,
  pocketed: 71,
  clastic: 89,
}

type Swatch = { base: string; grain: string; fleck: string }

/** A wavy line across the art at height `y`. */
function wave(y: number, amp: number, period: number, phase: number): string {
  const pts: string[] = []
  for (let x = -10; x <= ART_W + 10; x += 10) {
    pts.push(`${x},${(y + amp * Math.sin((x / period) * Math.PI * 2 + phase)).toFixed(1)}`)
  }
  return `M${pts.join(' L')}`
}

function texture(kind: RockTexture, c: Swatch): ReactNode[] {
  const rnd = seeded(SEED[kind])
  const out: ReactNode[] = []
  switch (kind) {
    case 'crystalline':
      for (let i = 0; i < 260; i++) {
        const s = 1.5 + rnd() * 4.5
        out.push(
          <rect
            key={i}
            x={rnd() * ART_W}
            y={rnd() * ART_H}
            width={s}
            height={s * (0.6 + rnd() * 0.8)}
            fill={rnd() < 0.55 ? c.grain : c.fleck}
            opacity={0.5 + rnd() * 0.5}
            transform={`rotate(${rnd() * 90})`}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />,
        )
      }
      break
    case 'bedded':
      for (let i = 0; i < 12; i++) {
        out.push(
          <path
            key={i}
            d={wave(i * 10 + rnd() * 4, 2 + rnd() * 3, 180 + rnd() * 120, rnd() * 6)}
            stroke={i % 3 === 0 ? c.fleck : c.grain}
            strokeWidth={1 + rnd() * 2.5}
            fill="none"
            opacity={0.55}
          />,
        )
      }
      // Cross-bedding: a few sweeping lines cutting the beds at an angle.
      for (let i = 0; i < 5; i++) {
        const x = 40 + i * 70 + rnd() * 20
        out.push(
          <path
            key={`x${i}`}
            d={`M${x},${ART_H} Q${x + 30},${ART_H * 0.45} ${x + 90},${ART_H * 0.2}`}
            stroke={c.grain}
            strokeWidth={1}
            fill="none"
            opacity={0.45}
          />,
        )
      }
      break
    case 'columnar': {
      let x = -6
      let i = 0
      while (x < ART_W) {
        const w = 22 + rnd() * 12
        out.push(
          <rect key={`c${i}`} x={x} y={0} width={w - 2} height={ART_H} fill={i % 2 === 0 ? c.grain : c.base} opacity={0.35} />,
          <line key={`l${i}`} x1={x + w - 1} y1={0} x2={x + w - 1} y2={ART_H} stroke={c.fleck} strokeWidth={2} />,
          <line
            key={`j${i}`}
            x1={x}
            x2={x + w - 2}
            y1={(0.2 + rnd() * 0.6) * ART_H}
            y2={(0.2 + rnd() * 0.6) * ART_H}
            stroke={c.fleck}
            strokeWidth={1.2}
          />,
        )
        x += w
        i++
      }
      break
    }
    case 'vesicular':
      for (let i = 0; i < 120; i++) {
        const r = 1.2 + rnd() * rnd() * 6
        const cx = rnd() * ART_W
        const cy = rnd() * ART_H
        out.push(
          <circle key={i} cx={cx} cy={cy} r={r} fill={c.fleck} opacity={0.9} />,
          <circle key={`h${i}`} cx={cx} cy={cy - r * 0.35} r={r} fill="none" stroke={c.grain} strokeWidth={0.8} opacity={0.5} />,
        )
      }
      break
    case 'banded':
      for (let i = 0; i < 16; i++) {
        out.push(
          <path
            key={i}
            d={wave(i * 8 - 10 + rnd() * 4, 5 + rnd() * 4, 120 + rnd() * 60, i * 0.4)}
            stroke={i % 2 === 0 ? c.grain : c.fleck}
            strokeWidth={2 + rnd() * 4}
            fill="none"
            opacity={0.6}
            transform={`rotate(-8 ${ART_W / 2} ${ART_H / 2})`}
          />,
        )
      }
      break
    case 'sheeted':
      for (let i = 0; i < 28; i++) {
        const y = i * 4 + rnd() * 2
        out.push(
          <line
            key={i}
            x1={-10}
            y1={y}
            x2={ART_W + 10}
            y2={y + 14}
            stroke={rnd() < 0.3 ? c.grain : c.fleck}
            strokeWidth={0.6 + rnd() * 1.4}
            opacity={0.7}
          />,
        )
      }
      break
    case 'pocketed':
      // Faint streaks down the face, then the pockets.
      for (let i = 0; i < 14; i++) {
        const x = rnd() * ART_W
        out.push(
          <line key={`s${i}`} x1={x} y1={0} x2={x + rnd() * 6} y2={ART_H} stroke={c.fleck} strokeWidth={2 + rnd() * 5} opacity={0.18} />,
        )
      }
      for (let i = 0; i < 26; i++) {
        const rx = 3 + rnd() * 9
        const cx = rnd() * ART_W
        const cy = rnd() * ART_H
        out.push(
          <ellipse key={`p${i}`} cx={cx} cy={cy} rx={rx} ry={rx * (0.45 + rnd() * 0.4)} fill={c.fleck} opacity={0.9} />,
          <ellipse
            key={`r${i}`}
            cx={cx}
            cy={cy - 1}
            rx={rx + 1}
            ry={rx * 0.6}
            fill="none"
            stroke={c.grain}
            strokeWidth={1}
            opacity={0.55}
          />,
        )
      }
      break
    case 'clastic':
      for (let i = 0; i < 70; i++) {
        const rx = 3 + rnd() * 11
        out.push(
          <ellipse
            key={i}
            cx={rnd() * ART_W}
            cy={rnd() * ART_H}
            rx={rx}
            ry={rx * (0.55 + rnd() * 0.4)}
            fill={rnd() < 0.5 ? c.grain : c.fleck}
            stroke={c.fleck}
            strokeWidth={0.8}
            opacity={0.8}
          />,
        )
      }
      break
  }
  return out
}

function RockArt({ swatch, kind }: { swatch: RockSwatch; kind: RockTexture }) {
  const fadeId = useId()
  const c = rockSwatchV2[swatch]
  return (
    <svg
      viewBox={`0 0 ${ART_W} ${ART_H}`}
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height={ART_H}
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.5" stopColor={colorsV2.card} stopOpacity={0} />
          <stop offset="1" stopColor={colorsV2.card} stopOpacity={1} />
        </linearGradient>
      </defs>
      <rect width={ART_W} height={ART_H} fill={c.base} />
      {texture(kind, c)}
      <rect width={ART_W} height={ART_H} fill={`url(#${fadeId})`} />
    </svg>
  )
}

// ─────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────

/**
 * A three-step gauge: the label, the word, and the steps filled. **More fill is
 * more of what the label names** — longer drying, more strength — so the two
 * read the same way even though one is good full and the other is not.
 */
function Gauge({ label, word, filled }: { label: string; word: string; filled: 1 | 2 | 3 }) {
  return (
    <div style={{ ...stack(spacing.tight), minWidth: 0 }}>
      <span style={{ ...typeV2.gaugeLabel, color: colorsV2.txtMuted }}>{label}</span>
      <span style={{ ...typeV2.bandValue, color: colorsV2.txt1 }}>{word}</span>
      <div style={row(spacing.tight)} aria-hidden="true">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            style={{
              flex: '1 1 0',
              height: `${spacing.listGapSm}px`,
              borderRadius: `${radius.full}px`,
              backgroundColor: step <= filled ? colorsV2.legend : colorsV2.line,
            }}
          />
        ))}
      </div>
    </div>
  )
}

/** Steps filled on each gauge: longer drying fills more, and so does more strength. */
const DRYING_FILL: Record<DryingPace, 1 | 2 | 3> = { hours: 1, day: 2, days: 3 }
const STRENGTH_FILL: Record<WetStrength, 1 | 2 | 3> = { holds: 3, softens: 2, fragile: 1 }

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
      <h2 style={typeV2.cardTitle}>{title}</h2>
      {children}
    </section>
  )
}

/** A labelled paragraph: a small caps label over one or two lines of copy. */
function Fact({ label, text }: { label: string; text: string }) {
  return (
    <div style={stack(spacing.micro)}>
      <span style={{ ...typeV2.gaugeLabel, color: colorsV2.txtMuted }}>{label}</span>
      <p style={typeV2.body}>{text}</p>
    </div>
  )
}

/** An icon in a small round well, heading one line of copy. */
function IconLine({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div style={{ ...row(spacing.cellPad), alignItems: 'flex-start' }}>
      <span
        style={{
          ...wellV2,
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: `${spacing.sectionGap * 2}px`,
          height: `${spacing.sectionGap * 2}px`,
        }}
      >
        {icon}
      </span>
      <span style={{ ...stack(spacing.micro), minWidth: 0 }}>
        <span style={{ ...typeV2.gaugeLabel, color: colorsV2.txtMuted }}>{title}</span>
        <span style={typeV2.body}>{text}</span>
      </span>
    </div>
  )
}

function Hero({ name, guide }: { name: string; guide: RockGuide | null }) {
  return (
    <section style={{ ...cardV2, padding: 0, overflow: 'hidden' }}>
      <RockArt swatch={guide?.swatch ?? 'pale'} kind={guide?.texture ?? 'crystalline'} />
      <div style={{ ...stack(spacing.listGap), padding: `0 ${spacing.sectionGap}px ${spacing.sectionGap}px` }}>
        <h2 style={typeV2.screenTitle}>{name}</h2>
        <p style={typeV2.body}>
          {guide?.tagline ?? 'Nobody has recorded the rock here yet, so there’s no guide for it.'}
        </p>
        {guide === null ? null : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: `${spacing.sectionGap}px`,
              paddingTop: `${spacing.listGap}px`,
            }}
          >
            <Gauge
              label="Drying after rain"
              word={DRYING_PACE_LABEL[guide.dries]}
              filled={DRYING_FILL[guide.dries]}
            />
            <Gauge
              label="Strength when wet"
              word={WET_STRENGTH_LABEL[guide.whenWet]}
              filled={STRENGTH_FILL[guide.whenWet]}
            />
          </div>
        )}
      </div>
    </section>
  )
}

function CareList({ items, kind }: { items: readonly string[]; kind: 'do' | 'dont' }) {
  return (
    <ul style={{ ...stack(spacing.listGap), listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item) => (
        <li key={item} style={{ ...row(spacing.listGap), alignItems: 'flex-start' }}>
          <span style={{ flex: '0 0 auto', paddingTop: `${spacing.micro}px` }}>
            {kind === 'do' ? <CheckIcon color={colorsV2.goodInk} /> : <CrossIcon color={colorsV2.poorInk} />}
          </span>
          <span style={typeV2.body}>{item}</span>
        </li>
      ))}
    </ul>
  )
}

// ─────────────────────────────────────────────
// The tab
// ─────────────────────────────────────────────

export type RockTabProps = {
  /** The saved row's rock type; `null` when nothing was recorded. */
  rockType: Parameters<typeof rockGuide>[0] | null
  /** The location's facts — aspect, angle, coordinates — placed last. */
  identity: ReactNode
}

export function RockTab({ rockType, identity }: RockTabProps) {
  const guide = rockType === null ? null : rockGuide(rockType)
  const name = guide === null || rockType === null ? 'Rock type not recorded' : rockTypeLabel(rockType)

  return (
    <>
      <Hero name={name} guide={guide} />

      {guide === null ? null : (
        <>
          <Card title="How it formed and climbs">
            <Fact label="How it formed" text={guide.formed} />
            <Fact label="Where the holds come from" text={guide.holds} />
            <div style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
              {guide.styles.map((style) => (
                <span
                  key={style}
                  style={{
                    ...wellV2,
                    ...typeV2.controlValue,
                    color: colorsV2.txt1,
                    padding: `${spacing.listGapSm}px ${spacing.listGapLg}px`,
                  }}
                >
                  {style}
                </span>
              ))}
            </div>
          </Card>

          <Card title="Rain and sun">
            <IconLine icon={<RainIcon color={colorsV2.rain} />} title="Rain" text={guide.rain} />
            <IconLine icon={<SunIcon color={colors.sun} />} title="Sun" text={guide.sun} />
          </Card>

          <Card title="Rock care">
            <CareList items={guide.care} kind="do" />
            <CareList items={guide.avoid} kind="dont" />
            <p style={typeV2.note}>
              A general guide to this rock type. Walls vary — check the rock before you climb.
            </p>
          </Card>
        </>
      )}

      {identity}
    </>
  )
}
