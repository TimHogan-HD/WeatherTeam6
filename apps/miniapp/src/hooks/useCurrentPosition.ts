import { useCallback, useRef, useState } from 'react'
import { geolocationErrorLine } from '../lib/logbook.js'

/** One reading from the phone's location service. `accuracy_m` is its own 68% radius. */
export type Fix = { lat: number; lon: number; accuracy_m: number }

export type PositionReading =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'fix'; fix: Fix }
  | { kind: 'failed'; message: string }

/**
 * The browser's Geolocation API as a small state machine: ask, wait, and either
 * a fix or a line saying why not. Nothing is asked until `locate` is called, so
 * the permission prompt only ever follows a tap.
 *
 * Given `onFix`, `locate` hands the fix over and returns to idle rather than
 * holding it — for a caller that acts on a fix at once instead of showing it.
 */
export function useCurrentPosition() {
  const [reading, setReading] = useState<PositionReading>({ kind: 'idle' })
  // A cancelled request can still answer later; only the latest attempt may land.
  const attempt = useRef(0)

  const locate = useCallback((onFix?: (fix: Fix) => void) => {
    if (!('geolocation' in navigator)) {
      setReading({ kind: 'failed', message: 'This browser can’t read a location.' })
      return
    }
    const id = ++attempt.current
    setReading({ kind: 'locating' })
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (id !== attempt.current) return
        const fix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy_m: p.coords.accuracy }
        if (onFix === undefined) {
          setReading({ kind: 'fix', fix })
        } else {
          setReading({ kind: 'idle' })
          onFix(fix)
        }
      },
      (err) => {
        if (id !== attempt.current) return
        setReading({ kind: 'failed', message: geolocationErrorLine(err.code) })
      },
      // `timeout` does not start until permission is granted, so a prompt left
      // open waits indefinitely — hence Cancel while locating.
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  }, [])

  const cancel = useCallback(() => {
    attempt.current++
    setReading({ kind: 'idle' })
  }, [])

  return { reading, locate, cancel }
}
