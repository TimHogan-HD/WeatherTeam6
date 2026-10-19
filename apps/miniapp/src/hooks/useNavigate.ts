import { useCallback } from 'react'
import { useLocation, useNavigate as useRouterNavigate, type NavigateOptions, type To } from 'react-router-dom'
import { pageMotion } from '../lib/pageMotion.js'
import { usePrefersReducedMotion } from './usePrefersReducedMotion.js'

export type AppNavigate = (to: To | number, options?: NavigateOptions) => void

/** Resolves the transition waiting on the next screen; set while one is pending. */
let committed: (() => void) | null = null

/**
 * The signed-in shell calls this once a navigation's screen is in the DOM. The
 * router applies a navigation inside a React transition, so the screen is not
 * there when `navigate` returns; the view transition's new snapshot waits for
 * this instead. A screen still loading its code (the map) keeps the old one up
 * meanwhile, as it does without motion.
 */
export function pageCommitted(): void {
  committed?.()
  committed = null
}

/** The longest a transition holds the old screen waiting for the new one. */
const COMMIT_WAIT_MS = 1_500

/**
 * React Router's `useNavigate`, with the screen change moving as `pageMotion`
 * says (owner, 2026-10-19) through the browser's view transitions; the moves
 * themselves are keyframes on `html[data-page]` in `globals.css`. A replace (a
 * save landing on its result, the crag switcher), a history step, reduced
 * motion and a browser without view transitions all change screen at once.
 * The phone's own back is the browser's, and does not move either.
 */
export function useNavigate(): AppNavigate {
  const navigate = useRouterNavigate()
  const { pathname } = useLocation()
  const reduced = usePrefersReducedMotion()
  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === 'number') {
        void navigate(to)
        return
      }
      const target = typeof to === 'string' ? new URL(to, window.location.href).pathname : (to.pathname ?? pathname)
      const motion = reduced || options?.replace === true ? null : pageMotion(pathname, target)
      if (motion === null || typeof document.startViewTransition !== 'function') {
        void navigate(to, options)
        return
      }
      const root = document.documentElement
      root.dataset.page = motion
      const transition = document.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            committed = resolve
            window.setTimeout(resolve, COMMIT_WAIT_MS)
            void navigate(to, options)
          }),
      )
      void transition.finished.finally(() => {
        if (root.dataset.page === motion) delete root.dataset.page
      })
    },
    [navigate, pathname, reduced],
  )
}
