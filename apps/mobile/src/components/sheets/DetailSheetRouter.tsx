import React, { useEffect, useReducer, useRef } from 'react'
import { WindSheet } from './WindSheet'
import { HumiditySheet } from './HumiditySheet'
import { PrecipitationSheet } from './PrecipitationSheet'
import { PressureSheet } from './PressureSheet'
import { VisibilitySheet } from './VisibilitySheet'
import { UVIndexSheet } from './UVIndexSheet'
import { CloudCoverSheet } from './CloudCoverSheet'

type SheetProps = { visible: boolean; locationId: string; onDismiss: () => void }

const SHEET_MAP: Record<string, React.ComponentType<SheetProps>> = {
  wind: WindSheet,
  humidity: HumiditySheet,
  precip: PrecipitationSheet,
  pressure: PressureSheet,
  visibility: VisibilitySheet,
  uv: UVIndexSheet,
  cloud: CloudCoverSheet,
}

type State = {
  /** The stat to render — retained through the close animation window */
  activeStat: string | null
}

type Action = { type: 'open'; stat: string } | { type: 'unmount' }

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case 'open':
      return { activeStat: action.stat }
    case 'unmount':
      return { activeStat: null }
  }
}

type Props = { stat: string | null; locationId: string; onDismiss: () => void }

export function DetailSheetRouter({ stat, locationId, onDismiss }: Props) {
  const [state, dispatch] = useReducer(reducer, { activeStat: stat })
  const unmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // When stat becomes non-null: open immediately by dispatching from the timer
  // callback (setTimeout 0 is a microtask boundary — not "synchronous in effect").
  // When stat becomes null: start the 300ms close-animation window, then unmount.
  useEffect(() => {
    if (stat !== null) {
      // Cancel any in-progress unmount timer
      if (unmountTimer.current !== null) {
        clearTimeout(unmountTimer.current)
        unmountTimer.current = null
      }
      // Dispatch from callback context (not synchronously in the effect body)
      unmountTimer.current = setTimeout(() => {
        dispatch({ type: 'open', stat })
        unmountTimer.current = null
      }, 0)
    } else {
      // Allow 300ms for the sheet's slide-out animation before unmounting
      unmountTimer.current = setTimeout(() => {
        dispatch({ type: 'unmount' })
        unmountTimer.current = null
      }, 300)
    }
    return () => {
      if (unmountTimer.current !== null) {
        clearTimeout(unmountTimer.current)
        unmountTimer.current = null
      }
    }
  }, [stat])

  if (!state.activeStat) return null
  const Sheet = SHEET_MAP[state.activeStat]
  if (!Sheet) return null
  // `visible` is derived from the prop: true while stat is set, false when closing
  return <Sheet visible={stat !== null} locationId={locationId} onDismiss={onDismiss} />
}
