import { useState, type CSSProperties, type ReactNode } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import {
  TICK_NOTE_MAX,
  TICK_STYLES,
  TICK_STYLE_LABEL,
  type GuidebookRoute,
  type Logbook,
  type RouteTick,
  type TickStyle,
} from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, cardV2, row, stack, wellV2 } from '../../theme/styles.js'
import { formatTickDate, localDateString } from '../../lib/logbook.js'
import { useCreateTick, useDeleteTick, useLogbook, useSetTodo } from '../../hooks/useLogbook.js'
import { useNow } from '../../hooks/useNow.js'
import { InlineError, Skeleton } from '../States.js'

/**
 * The route screen's logbook: whether the route is on the reader's to-do list,
 * a form to tick it, and the reader's own ticks of it. Nobody else's ticks
 * reach this screen.
 */

export const pillButton: CSSProperties = {
  ...bareButton,
  ...wellV2,
  ...typeV2.controlValue,
  color: colorsV2.txt1,
  width: 'auto',
  textAlign: 'center',
  padding: `${spacing.listGapSm}px ${spacing.cellPad}px`,
}

export function PrimaryButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ ...bareButton, ...btnPrimary, ...btnPrimaryText, width: 'auto', textAlign: 'center', opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </button>
  )
}

function StyleChip({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        ...pillButton,
        color: selected ? colorsV2.txt1 : colorsV2.txtMuted,
        ...(selected ? { backgroundColor: colorsV2.raised, borderColor: colorsV2.txtMuted } : {}),
      }}
    >
      {label}
    </button>
  )
}

function TickForm({ route, onDone }: { route: GuidebookRoute; onDone: () => void }) {
  const today = localDateString(useNow())
  const [day, setDay] = useState(today)
  const [style, setStyle] = useState<TickStyle | null>(null)
  const [note, setNote] = useState('')
  const create = useCreateTick()
  const ready = style !== null && /^\d{4}-\d{2}-\d{2}$/.test(day) && !create.isPending

  const save = () => {
    if (style === null || !ready) return
    create.mutate(
      { route_id: route.id, ticked_on: day, style, note: note.trim() === '' ? null : note },
      { onSuccess: onDone },
    )
  }

  // iOS zooms the page into any focused control under 16px.
  const field: CSSProperties = { ...wellV2, ...typeV2.controlValue, color: colorsV2.txt1, fontSize: '16px', borderRadius: `${radius.rowV2}px`, padding: `${spacing.listGapSm}px ${spacing.cellPad}px`, width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ ...stack(spacing.listGap), borderTop: `1px solid ${colorsV2.line}`, paddingTop: `${spacing.cellPad}px` }}>
      <label style={stack(spacing.micro)}>
        <span style={{ ...typeV2.factLabel, color: colorsV2.txtMuted }}>Date</span>
        <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} style={field} />
      </label>
      <div style={stack(spacing.micro)}>
        <span style={{ ...typeV2.factLabel, color: colorsV2.txtMuted }}>Style</span>
        <div role="group" aria-label="Style" style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
          {TICK_STYLES.map((s) => (
            <StyleChip key={s} label={TICK_STYLE_LABEL[s]} selected={style === s} onSelect={() => setStyle(s)} />
          ))}
        </div>
      </div>
      <label style={stack(spacing.micro)}>
        <span style={{ ...typeV2.factLabel, color: colorsV2.txtMuted }}>Note (optional)</span>
        <textarea value={note} maxLength={TICK_NOTE_MAX} rows={2} onChange={(e) => setNote(e.target.value)} style={{ ...field, resize: 'vertical' }} />
      </label>
      {create.isError ? <InlineError message="Couldn't save this tick." /> : null}
      <div style={row(spacing.listGap)}>
        <PrimaryButton disabled={!ready} onClick={save}>
          {create.isPending ? 'Saving…' : 'Save'}
        </PrimaryButton>
        <button type="button" onClick={onDone} style={pillButton}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function TickRow({ tick }: { tick: RouteTick }) {
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteTick()
  const line = [
    formatTickDate(tick.ticked_on),
    TICK_STYLE_LABEL[tick.style],
    tick.laps === null ? null : `${tick.laps} ${tick.laps === 1 ? 'lap' : 'laps'}`,
  ]
    .filter((p) => p !== null)
    .join(' · ')

  return (
    <li style={{ ...stack(spacing.tight), paddingBlock: `${spacing.listGap}px`, borderBottom: `1px solid ${colorsV2.line}` }}>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
        <span style={{ ...typeV2.rowTitle, flex: '1 1 auto', minWidth: 0 }}>{line}</span>
        {confirming ? null : (
          <button type="button" onClick={() => setConfirming(true)} style={pillButton}>
            Delete
          </button>
        )}
      </div>
      {tick.note === null ? null : (
        <span style={{ ...typeV2.note, color: colorsV2.txtMuted, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{tick.note}</span>
      )}
      {confirming ? (
        <div style={{ ...row(spacing.listGap), flexWrap: 'wrap' }}>
          <span style={{ ...typeV2.note, color: colorsV2.txt1 }}>Delete this tick?</span>
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate(tick.id)}
            style={{ ...pillButton, color: colorsV2.poorInk }}
          >
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </button>
          <button type="button" onClick={() => setConfirming(false)} style={pillButton}>
            Keep
          </button>
        </div>
      ) : null}
      {remove.isError ? <InlineError message="Couldn't delete this tick." /> : null}
    </li>
  )
}

function LogbookBody({ route, logbook }: { route: GuidebookRoute; logbook: Logbook }) {
  const setTodo = useSetTodo(route.id)
  const [ticking, setTicking] = useState(false)
  const onTodo = logbook.todos.includes(route.id)
  const ticks = logbook.ticks.filter((t) => t.route_id === route.id)

  return (
    <>
      <div style={row(spacing.listGap)}>
        <button
          type="button"
          aria-pressed={onTodo}
          onClick={() => setTodo.mutate(!onTodo)}
          style={{ ...pillButton, ...(onTodo ? { backgroundColor: colorsV2.raised, borderColor: colorsV2.txtMuted } : {}) }}
        >
          {onTodo ? 'On to-do list' : 'To-do'}
        </button>
        {ticking ? null : (
          <button type="button" onClick={() => setTicking(true)} style={pillButton}>
            Tick
          </button>
        )}
      </div>
      {setTodo.isError ? <InlineError message="Couldn't update your to-do list." /> : null}
      {ticking ? <TickForm route={route} onDone={() => setTicking(false)} /> : null}
      {ticks.length === 0 ? null : (
        <div style={stack(spacing.tight)}>
          <span style={{ ...typeV2.factLabel, color: colorsV2.txtMuted }}>Your ticks</span>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {ticks.map((t) => (
              <TickRow key={t.id} tick={t} />
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

export function LogbookCard({ route }: { route: GuidebookRoute }) {
  const logbook = useLogbook()
  return (
    <section style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
      <h2 style={typeV2.cardTitle}>Logbook</h2>
      {/* Nothing that reads as an answer until the logbook has loaded: no "To-do" off, no empty tick list. */}
      {logbook.isPending ? (
        <Skeleton height={44} />
      ) : logbook.isError ? (
        <InlineError message="Couldn't load your logbook." onRetry={() => void logbook.refetch()} />
      ) : (
        <LogbookBody route={route} logbook={logbook.data} />
      )}
    </section>
  )
}
