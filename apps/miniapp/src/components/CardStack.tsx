import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, brandButton, cardV2, quietButton, row, stack } from '../theme/styles.js'
import { arrange, moveCard, saveOrder, savedOrder, type CardMove, type CardTab } from '../lib/cardOrder.js'
import { ArrowDownIcon, ArrowUpIcon } from './Icons.js'
import { Sect } from './charts/liquid.js'

/** A card a tab offers for rearranging. `title` names it in the list; `node` is the card. */
export type StackCard = { id: string; title: string; node: ReactNode }

/**
 * A tab's cards in the order the reader chose, with the control that changes it
 * (owner, 2026-11-03: an edit mode with arrows, saved on this device).
 *
 * **A mode, because a drag on a chart already reads an hour.** While it is open
 * the charts give way to a short list of their names, so a tall card never
 * jumps out of view when it moves and no arrow sits on a surface that scrubs.
 *
 * A card that decides for itself to draw nothing (`CondensationCard` with no
 * hours) is still listed: its place is kept for when it has something to say.
 * The caller leaves out a card this screen can never draw, with `null`.
 */
export function CardStack({ tab, cards }: { tab: CardTab; cards: readonly (StackCard | null)[] }) {
  const [saved, setSaved] = useState(() => savedOrder(tab))
  const [editing, setEditing] = useState(false)
  const shown = cards.filter((c): c is StackCard => c !== null)
  const ids = shown.map((c) => c.id)
  const order = arrange(saved, ids)
  const byId = new Map(shown.map((c) => [c.id, c]))

  const openButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  useEffect(() => {
    if (editing || !returnFocus.current) return
    returnFocus.current = false
    // Not scrolled to: the button is under every card, and the reader wants to see the top one.
    openButton.current?.focus({ preventScroll: true })
  }, [editing])

  if (shown.length < 2) return <>{shown.map((c) => <Fragment key={c.id}>{c.node}</Fragment>)}</>

  if (editing) {
    return (
      <RearrangePanel
        rows={order.map((id) => ({ id, title: byId.get(id)?.title ?? id }))}
        isDefault={order.every((id, i) => id === ids[i])}
        onMove={(id, by) => {
          const next = moveCard(saved, ids, id, by)
          if (next === null) return false
          saveOrder(tab, next)
          setSaved(next)
          return true
        }}
        onReset={() => {
          saveOrder(tab, [])
          setSaved([])
        }}
        onDone={() => {
          returnFocus.current = true
          setEditing(false)
        }}
      />
    )
  }

  return (
    <>
      {order.map((id) => (
        <Fragment key={id}>{byId.get(id)?.node}</Fragment>
      ))}
      <button ref={openButton} type="button" onClick={() => setEditing(true)} style={openStyle}>
        Rearrange cards
      </button>
    </>
  )
}

function RearrangePanel({
  rows,
  isDefault,
  onMove,
  onReset,
  onDone,
}: {
  rows: readonly { id: string; title: string }[]
  isDefault: boolean
  onMove: (id: string, by: CardMove) => boolean
  onReset: () => void
  onDone: () => void
}) {
  const panel = useRef<HTMLElement>(null)
  const done = useRef<HTMLButtonElement>(null)
  const [announced, setAnnounced] = useState('')
  // The list replaces whatever the reader was scrolled to, which may be far below it.
  useEffect(() => {
    panel.current?.scrollIntoView({ block: 'center' })
    panel.current?.focus({ preventScroll: true })
  }, [])

  // A moved row's DOM node can lose focus as it moves, which would throw a keyboard reader back to the page's top.
  const refocus = useRef<string | null>(null)
  useEffect(() => {
    if (refocus.current === null) return
    panel.current?.querySelector<HTMLElement>(`[data-move="${refocus.current}"]`)?.focus({ preventScroll: true })
    refocus.current = null
  })

  const press = (id: string, title: string, by: CardMove) => {
    if (!onMove(id, by)) return
    refocus.current = `${id}:${by}`
    const position = rows.findIndex((r) => r.id === id) + by + 1
    setAnnounced(`${title} moved to position ${position} of ${rows.length}`)
  }

  return (
    <section ref={panel} tabIndex={-1} style={{ ...cardV2, outline: 'none', ...stack(spacing.listGap) }}>
      <Sect title="Rearrange cards" aside="saved on this device" />
      <ol style={{ ...stack(0), listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((r, i) => (
          <li
            key={r.id}
            data-card-row={r.id}
            style={{
              ...row(spacing.listGapSm),
              padding: `${spacing.tight}px 0`,
              borderTop: i === 0 ? 'none' : `1px solid ${colorsV2.line}`,
            }}
          >
            <span style={{ ...typeV2.body, color: colorsV2.txt1, flex: 1, minWidth: 0 }}>{r.title}</span>
            <MoveButton id={r.id} label={`Move ${r.title} up`} by={-1} atEnd={i === 0} onPress={() => press(r.id, r.title, -1)} />
            <MoveButton
              id={r.id}
              label={`Move ${r.title} down`}
              by={1}
              atEnd={i === rows.length - 1}
              onPress={() => press(r.id, r.title, 1)}
            />
          </li>
        ))}
      </ol>
      <p aria-live="polite" style={screenReaderOnly}>
        {announced}
      </p>
      <div style={{ ...row(spacing.listGapSm), justifyContent: 'flex-end' }}>
        {isDefault ? null : (
          <button
            type="button"
            onClick={() => {
              // This button goes with the reset, and focus would fall to the top of the page with it.
              done.current?.focus({ preventScroll: true })
              onReset()
              setAnnounced('Cards back in their original order')
            }}
            style={{ ...quietButton, width: 'auto', minHeight: '44px' }}
          >
            Reset order
          </button>
        )}
        <button ref={done} type="button" onClick={onDone} style={{ ...brandButton, width: 'auto', minHeight: '44px' }}>
          Done
        </button>
      </div>
    </section>
  )
}

/**
 * **`aria-disabled`, never `disabled`, at the end of the list.** A row reaching
 * the top on its own Up arrow would otherwise lose focus with the arrow still
 * under the keyboard reader's hand.
 */
function MoveButton({
  id,
  label,
  by,
  atEnd,
  onPress,
}: {
  id: string
  label: string
  by: CardMove
  atEnd: boolean
  onPress: () => void
}) {
  const color = colorsV2.txt1
  return (
    <button
      type="button"
      data-move={`${id}:${by}`}
      aria-label={label}
      aria-disabled={atEnd}
      onClick={atEnd ? undefined : onPress}
      style={{
        ...bareButton,
        width: '44px',
        height: '44px',
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...(atEnd ? { opacity: 0.35, cursor: 'default' } : {}),
      }}
    >
      {by === -1 ? <ArrowUpIcon color={color} /> : <ArrowDownIcon color={color} />}
    </button>
  )
}

const openStyle: CSSProperties = {
  ...bareButton,
  ...typeV2.disclosure,
  color: colorsV2.brandInk,
  textAlign: 'center',
  minHeight: '44px',
}

const screenReaderOnly: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
}
