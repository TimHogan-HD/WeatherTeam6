import type { ReactNode } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, headerBand, navClearance, row, stack } from '../theme/styles.js'
import { clearToken } from '../lib/authToken.js'
import { FeedbackButton } from '../components/FeedbackButton.js'

/**
 * A bottom-bar section's first screen, in the Conditions list's header band so
 * the five sections read as one app.
 */
function SectionScreen({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <header style={{ ...headerBand, ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={stack(spacing.tight)}>
          <p style={typeV2.eyebrow}>WeatherTeam6</p>
          <h1 style={typeV2.screenTitle}>{title}</h1>
        </div>
        {action}
      </header>
      <div style={{ ...stack(spacing.listGapLg), padding: `${spacing.sectionGap}px`, paddingBottom: navClearance }}>
        {children}
      </div>
    </main>
  )
}

/**
 * `/crags`, `/map` and `/trips` — sections the bottom bar names before they
 * have screens. The owner is the only reader and asked for the tabs anyway
 * (2026-09-30), so each says plainly that it is not built rather than
 * borrowing another screen's content.
 */
export function UnbuiltSection({ title }: { title: string }) {
  return (
    <SectionScreen title={title}>
      <p style={typeV2.meta}>Not built yet.</p>
    </SectionScreen>
  )
}

/**
 * `/profile` — the account's things: Feedback in the corner, as on every
 * signed-in screen, and Sign out.
 *
 * A login with no way out is the same trap as a save flow with no delete: the
 * token lives in `localStorage`, so without this a shared or borrowed device
 * stays signed in until the token expires, and there is no revocation to fall
 * back on. It clears the token and nothing else — the redirect to `/login` and
 * the cache clear both hang off the token store in `App.tsx`, so signing out
 * and being signed out by a 401 take the same path.
 */
export function Profile() {
  return (
    <SectionScreen title="Profile" action={<FeedbackButton />}>
      <button
        type="button"
        style={{
          ...bareButton,
          width: 'auto',
          alignSelf: 'flex-start',
          border: `1px solid ${colorsV2.line}`,
          borderRadius: `${radius.full}px`,
          padding: `${spacing.listGap}px ${spacing.cardPad}px`,
        }}
        onClick={clearToken}
      >
        <span style={typeV2.controlValue}>Sign out</span>
      </button>
    </SectionScreen>
  )
}
