import { useRef, type CSSProperties } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, row, stack } from '../theme/styles.js'
import { ChevronLeftIcon } from './Icons.js'
import { FeedbackButton } from './FeedbackButton.js'
import { SelectionIndicator, useSelectedRect } from './SelectionIndicator.js'
import { CragBar, type CragChoice } from './CragBar.js'

/**
 * The detail screen's header band, from the WT6 Figma "V2" page's Overview
 * frame: back (on the guidebook screens only), the rock and elevation, the
 * name, the coordinates and how old the forecast is, then the tabs. Without
 * back, the rock and name take its place beside the Feedback button.
 *
 * It replaces `Screen`'s title row on this route only. Since the hybrid look
 * it has no fill: it sits on the still ground, as the list's header does. On a
 * saved location it heads the Overview alone; every other tab has the
 * `SlimHeader`, and the tabs themselves are the `Dock`.
 */

export type HeaderTab<T extends string> = { value: T; label: string }

/** The band's three lines, each omitted when null — while loading the band renders its controls alone. */
export type HeaderHeading = { eyebrow: string | null; title: string | null; meta: string | null }

export type DetailHeaderProps<T extends string> = {
  heading: HeaderHeading
  /**
   * Where back goes, as words — the wall or crag it returns to, or the list from
   * a saved location, whose app bar has slid away (hybrid look, owner
   * 2026-10-19) — and how. `null` hides the control.
   */
  back: { label: string; onBack: () => void } | null
  /** The crag the Feedback button opens a forecast check for. */
  feedbackLocationId: string | null
  /** A saved location's switcher (`CragBar`), which then heads the band in place of back alone. */
  crags?: CragChoice | null
  tabs: {
    options: readonly HeaderTab<T>[]
    active: T
    onChange: (tab: T) => void
    panelId: string
  } | null
}

/**
 * `44.5625, −92.5338`. Four places is about 11 m, the precision a crag
 * coordinate is worth; the minus is the typographic one the Figma draws.
 */
export function coordText(lat: number, lon: number): string {
  const f = (n: number) => n.toFixed(4).replace('-', '−')
  return `${f(lat)}, ${f(lon)}`
}

/**
 * The band. The Overview passes an empty heading, because its hero names the
 * crag; the guidebook's wall and route screens pass theirs.
 */
export function DetailHeader<T extends string>({
  heading,
  back,
  feedbackLocationId,
  crags = null,
  tabs,
}: DetailHeaderProps<T>) {
  const { eyebrow, title, meta } = heading

  return (
    <header
      style={{
        ...stack(spacing.tight),
        marginTop: 'calc(-1 * env(safe-area-inset-top, 0px))',
        paddingTop: `calc(env(safe-area-inset-top, 0px) + ${spacing.topWeb}px)`,
        paddingInline: `${spacing.screenH}px`,
        ...(tabs === null ? { paddingBottom: `${spacing.sectionGap}px` } : {}),
      }}
    >
      {back !== null && crags !== null ? (
        <CragBar back={back} crags={crags} feedbackLocationId={feedbackLocationId} />
      ) : (
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {back === null ? (
          <div style={stack(spacing.tight)}>
            {eyebrow === null ? null : <p style={typeV2.eyebrow}>{eyebrow}</p>}
            {title === null ? null : <h1 style={typeV2.screenTitle}>{title}</h1>}
          </div>
        ) : (
          <BackLink onBack={back.onBack} label={back.label} />
        )}
        <FeedbackButton locationId={feedbackLocationId} />
      </div>
      )}

      {back === null ? null : (
        <>
          {eyebrow === null ? null : <p style={{ ...typeV2.eyebrow, marginTop: `${spacing.listGap}px` }}>{eyebrow}</p>}
          {title === null ? null : <h1 style={typeV2.screenTitle}>{title}</h1>}
        </>
      )}
      {meta === null || meta === '' ? null : <p style={typeV2.meta}>{meta}</p>}

      {tabs === null ? null : <TabRow tabs={tabs} />}
    </header>
  )
}

/**
 * Back, as words saying where it goes. The tap target reaches past the glyph
 * with padding and pulls back with a negative margin, so the chevron sits on
 * the gutter while the target clears 44px.
 */
export function BackLink({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        ...bareButton,
        ...row(spacing.tight),
        width: 'auto',
        margin: `-${spacing.cellPad}px 0 -${spacing.cellPad}px -${spacing.cellPad}px`,
        padding: `${spacing.cellPad}px`,
      }}
    >
      <ChevronLeftIcon color={colorsV2.txtMuted} />
      <span style={typeV2.backLink}>{label}</span>
    </button>
  )
}

/**
 * The location's tabs. **One underline slides to the chosen tab** rather than
 * each tab painting its own (`SelectionIndicator`); in static markup, before
 * it is measured, the chosen tab paints its own bar. Each tab's tap target
 * reaches `cellPad` above its label, out of the row's own top padding, so the
 * row sits where it did and the target clears about 41px at the screen's least
 * accurate edge (`ui-craft.md` §1).
 */
function TabRow<T extends string>({ tabs }: { tabs: NonNullable<DetailHeaderProps<T>['tabs']> }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const rect = useSelectedRect(rowRef, '[aria-selected="true"]', tabs.active)
  return (
    <div
      ref={rowRef}
      role="tablist"
      aria-label="Location detail"
      style={{
        ...row(spacing.tabGap),
        position: 'relative',
        paddingTop: `${spacing.cardPad - spacing.cellPad}px`,
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {tabs.options.map((option) => {
        const selected = option.value === tabs.active
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            {...(selected ? { 'aria-controls': tabs.panelId } : {})}
            onClick={() => tabs.onChange(option.value)}
            style={{
              ...bareButton,
              ...stack(spacing.cellPad),
              width: 'auto',
              flexShrink: 0,
              alignItems: 'center',
              paddingTop: `${spacing.cellPad}px`,
            }}
          >
            <span style={{ ...typeV2.tab, color: selected ? colorsV2.txt1 : colorsV2.txtTab }}>{option.label}</span>
            <span
              aria-hidden
              style={{ ...underline, backgroundColor: selected && rect === null ? colorsV2.brand : 'transparent' }}
            />
          </button>
        )
      })}
      <SelectionIndicator rect={rect} style={{ ...underline, bottom: 0, backgroundColor: colorsV2.brand }} />
    </div>
  )
}

const underline: CSSProperties = { alignSelf: 'stretch', height: '3px', borderRadius: `${radius.stepBar}px` }
