import type { ReactNode } from 'react'
import { spacing } from '@weatherteam6/design/tokens'
import { layout, type } from '../theme/tokens.css.js'

type ScreenScaffoldProps = {
  title: string
  subtitle: string
  children?: ReactNode
}

/**
 * Placeholder frame for the shell. Task 6 replaces the bodies of the three
 * routes with the real screens; this exists so the scaffold renders the token
 * adapter, the gradient and the layout constants on a real device before any
 * screen work starts.
 */
export function ScreenScaffold({ title, subtitle, children }: ScreenScaffoldProps) {
  return (
    <main
      style={{
        ...layout.body,
        paddingTop: `${spacing.topSafe}px`,
        paddingBottom: `${spacing.bottomInset}px`,
      }}
    >
      <h1 style={type.screenTitle}>{title}</h1>
      <p style={type.screenSub}>{subtitle}</p>
      {children}
    </main>
  )
}
