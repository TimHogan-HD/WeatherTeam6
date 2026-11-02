import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { colorsV2 } from '@weatherteam6/design/tokens'
import { EM_DASH, formatLocalHour, type SunShadeGroup, type WallReadings } from '@weatherteam6/types'
import { typeV2, withOpacity } from '../theme/tokens.css.js'
import { bareButton } from '../theme/styles.js'
import { pinWall, pinnedWall, sunHoursText, wallLine, wallOptions, type WallOption } from '../lib/wallLine.js'
import { scoreRampColor } from './charts/chartStyle.js'

/**
 * Sun and shade walls under the Overview hero (#445, owner 2026-11-02, idea 4):
 * one tappable line, `☀ Winter Wall 20 · ◐ Large Roof 100 ▾`, for the hour the
 * hero prints. Within ten points it is one quiet line instead (rule 1). Tapping
 * either opens the wall sheet, which pins a wall on this device or returns to
 * Auto. Display only: the hero's score is still Crag A's.
 */

const SUN = '☀'
const SHADE = '◐'

const scoreColor = (score: number | null) => (score === null ? colorsV2.txtMuted : scoreRampColor(score))

function Figure({ score }: { score: number | null }) {
  return (
    <b style={{ ...typeV2.whyFigure, fontSize: '24px', color: scoreColor(score), fontVariantNumeric: 'tabular-nums' }}>
      {score ?? EM_DASH}
    </b>
  )
}

/** One group's half: its best wall and score, or what stands in for them. */
function Half({ icon, color, group, none }: { icon: string; color: string; group: SunShadeGroup; none: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
      <span aria-hidden="true" style={{ color }}>
        {icon}
      </span>
      {group.walls === 0 ? (
        <span style={{ color: colorsV2.txtMuted }}>{none}</span>
      ) : (
        <>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.best?.name ?? 'Not scored'}</span>
          <Figure score={group.best?.score ?? null} />
        </>
      )}
    </span>
  )
}

const groupText = (word: string, g: SunShadeGroup) =>
  g.walls === 0 ? `no wall in ${word}` : g.best === null ? `best in ${word} not scored` : `best in ${word} ${g.best.name} ${g.best.score}`

export function WallLineRow({
  walls,
  locationId,
  validAt,
  utcOffsetSeconds,
  todayDate,
}: {
  walls: readonly WallReadings[]
  locationId: string
  /** The hour the hero prints. */
  validAt: string
  utcOffsetSeconds: number
  todayDate: string | null
}) {
  const [pinned, setPinned] = useState<string | null>(() => pinnedWall(locationId))
  const [open, setOpen] = useState(false)
  const line = wallLine(walls, validAt, pinned)
  if (line === null) return null

  const pick = (name: string | null) => {
    pinWall(locationId, name)
    setPinned(name)
    setOpen(false)
  }

  let body: ReactNode
  let label: string
  const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }
  if (line.kind === 'alike') {
    body = (
      <span style={{ ...row, ...typeV2.keyRow, color: colorsV2.txtMuted }}>
        <span aria-hidden="true">
          {SHADE}
          {SUN}
        </span>
        <span style={{ color: colorsV2.txt2 }}>Sun and shade walls alike</span>
      </span>
    )
    label = 'Sun and shade walls alike. Pick a wall'
  } else if (line.kind === 'pinned') {
    const state = line.inSun === null ? null : line.inSun ? 'in sun' : 'in shade'
    body = (
      <span style={{ ...row, ...typeV2.whyFigure }}>
        <span aria-hidden="true" style={{ color: line.inSun === true ? colorsV2.sun : colorsV2.txtMuted }}>
          {line.inSun === true ? SUN : SHADE}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.name}</span>
        <Figure score={line.score} />
        {state === null ? null : <span style={{ ...typeV2.keyRow, color: colorsV2.txtMuted }}>{state}</span>}
        <Pin />
      </span>
    )
    label = `Pinned wall ${line.name}: ${line.score === null ? 'not scored' : `score ${line.score}`}${state === null ? '' : `, ${state}`}. Change wall`
  } else {
    body = (
      <span style={{ display: 'flex', alignItems: 'center', columnGap: '10px', rowGap: '2px', minWidth: 0, ...typeV2.whyFigure, flexWrap: 'wrap' }}>
        <Half icon={SUN} color={colorsV2.sun} group={line.sun} none="No wall in sun" />
        <span aria-hidden="true" style={{ color: colorsV2.txtMuted, fontWeight: 400 }}>
          ·
        </span>
        <Half icon={SHADE} color={colorsV2.txtMuted} group={line.shade} none="No wall in shade" />
      </span>
    )
    label = `Walls: ${groupText('sun', line.sun)}, ${groupText('shade', line.shade)}. Pick a wall`
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-haspopup="dialog"
        style={{
          ...bareButton,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          width: '100%',
          minHeight: '44px',
          marginTop: '12px',
          padding: line.kind === 'alike' ? '4px 2px' : '8px 12px',
          borderRadius: '14px',
          background: line.kind === 'alike' ? 'transparent' : colorsV2.raised,
        }}
      >
        <span style={{ flex: '1 1 auto', minWidth: 0 }}>{body}</span>
        <span aria-hidden="true" style={{ ...typeV2.keyRow, fontSize: '16px', color: colorsV2.brandInk, flex: 'none' }}>
          ▾
        </span>
      </button>
      {open ? (
        <WallSheet
          options={wallOptions(walls, validAt, todayDate)}
          pinned={line.kind === 'pinned' ? line.name : null}
          at={formatLocalHour(validAt, utcOffsetSeconds)}
          onPick={pick}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

function Pin() {
  return (
    <span
      style={{
        ...typeV2.keyRow,
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: colorsV2.surface,
        background: colorsV2.brandInk,
        borderRadius: '999px',
        padding: '1px 7px',
      }}
    >
      Pinned
    </span>
  )
}

/**
 * Every wall, with its score at the hero's hour and today's sun hours; "Auto:
 * best walls" at the top, the way back. Walls carry no area yet (#293), so they
 * are grouped by sun and shade at that hour.
 */
function WallSheet({
  options,
  pinned,
  at,
  onPick,
  onClose,
}: {
  options: WallOption[]
  pinned: string | null
  at: string | null
  onPick: (name: string | null) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el !== null && !el.open) el.showModal()
  }, [])

  const groups: { title: string; rows: WallOption[] }[] = [
    { title: 'In sun now', rows: options.filter((o) => o.inSun === true) },
    { title: 'In shade now', rows: options.filter((o) => o.inSun === false) },
    { title: 'No reading', rows: options.filter((o) => o.inSun === null) },
  ].filter((g) => g.rows.length > 0)

  return (
    <dialog
      ref={ref}
      className="wt6-sheet"
      aria-labelledby="wt6-wall-sheet-title"
      onClose={onClose}
      // A tap on the backdrop lands on the dialog itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close()
      }}
      style={{
        margin: 'auto auto 0',
        width: '100%',
        maxWidth: '480px',
        maxHeight: '85vh',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: '10px 16px calc(18px + env(safe-area-inset-bottom))',
        border: 'none',
        borderTop: `1px solid ${colorsV2.line}`,
        borderRadius: '22px 22px 0 0',
        background: colorsV2.surface,
        color: colorsV2.txt1,
      }}
    >
      <div aria-hidden="true" style={{ width: '40px', height: '4px', borderRadius: '2px', background: colorsV2.line, margin: '0 auto 10px' }} />
      <h2 id="wt6-wall-sheet-title" style={{ ...typeV2.whyFigure, fontSize: '22px', margin: 0 }}>
        Pick a wall
      </h2>
      <p style={{ ...typeV2.keyRow, color: colorsV2.txtMuted, margin: '2px 0 10px' }}>
        {at === null ? 'Wall scores' : `Scores at ${at}`}. {SUN} in sun, {SHADE} in shade. Sun hours are the rest of today’s climbing hours.
      </p>
      <Option on={pinned === null} onClick={() => onPick(null)} icon={null} name="Auto: best walls" note="sun and shade" />
      {groups.map((g) => (
        <div key={g.title}>
          <p style={{ ...typeV2.statLabel, margin: '10px 0 2px 6px' }}>{g.title}</p>
          {g.rows.map((o) => (
            <Option
              key={o.name}
              on={pinned === o.name}
              onClick={() => onPick(o.name)}
              score={o.score}
              icon={o.inSun === true ? 'sun' : o.inSun === false ? 'shade' : null}
              name={o.name}
              note={sunHoursText(o)}
            />
          ))}
        </div>
      ))}
    </dialog>
  )
}

function Option({
  on,
  onClick,
  score,
  icon,
  name,
  note,
}: {
  on: boolean
  onClick: () => void
  /** Undefined prints no figure (Auto); null is an unscored wall's dash. */
  score?: number | null
  icon: 'sun' | 'shade' | null
  name: string
  note: string | null
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{
        ...bareButton,
        display: 'grid',
        gridTemplateColumns: '18px 34px minmax(0, 1fr) auto',
        gap: '8px',
        alignItems: 'center',
        width: '100%',
        minHeight: '44px',
        padding: '8px 6px',
        borderTop: `1px solid ${colorsV2.line}`,
        borderRadius: on ? '10px' : 0,
        background: on ? withOpacity(colorsV2.brand, 0.1) : 'transparent',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          boxSizing: 'border-box',
          border: `2px solid ${on ? colorsV2.brand : colorsV2.txtMuted}`,
          background: on ? colorsV2.brand : 'transparent',
          boxShadow: on ? `inset 0 0 0 3px ${colorsV2.surface}` : 'none',
        }}
      />
      <b style={{ ...typeV2.whyFigure, fontSize: '22px', textAlign: 'right', color: scoreColor(score ?? null), fontVariantNumeric: 'tabular-nums' }}>
        {score === undefined ? null : (score ?? EM_DASH)}
      </b>
      <span style={{ ...typeV2.whyFigure, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {icon === null ? null : (
          <span aria-hidden="true" style={{ color: icon === 'sun' ? colorsV2.sun : colorsV2.txtMuted, marginRight: '6px' }}>
            {icon === 'sun' ? SUN : SHADE}
          </span>
        )}
        {name}
      </span>
      <span style={{ ...typeV2.keyRow, color: colorsV2.txtMuted }}>{note}</span>
    </button>
  )
}
